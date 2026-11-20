import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { fetchSpeechStatus } from "../azureSpeechClient";
import { cancelAzureSpeech, unlockAzureAudio } from "../azureTtsPlayer";
import { normalizeReceptionistLocale } from "../receptionistLocales";
import { resolveVoiceNavigation } from "./voiceNavigation";
import { isReadPageAgainCommand } from "./voicePageReader";

const STORAGE_ENABLED = "aarogya.voice.enabled";
const STORAGE_LOCALE = "aarogya.voice.locale";

const GlobalVoiceContext = createContext(null);

function readStoredEnabled() {
  try {
    return localStorage.getItem(STORAGE_ENABLED) === "true";
  } catch {
    return false;
  }
}

function readStoredLocale() {
  try {
    return normalizeReceptionistLocale(localStorage.getItem(STORAGE_LOCALE) || "en");
  } catch {
    return "en";
  }
}

export function GlobalVoiceProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [voiceEnabled, setVoiceEnabledState] = useState(readStoredEnabled);
  const [voiceLocale, setVoiceLocaleState] = useState(readStoredLocale);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [navStatus, setNavStatus] = useState("");
  const [navListening, setNavListening] = useState(false);

  const [workflow, setWorkflow] = useState(null); // page-registered receptionist config
  const [speechConfigured, setSpeechConfigured] = useState(null); // null=unknown
  const [playbackPhase, setPlaybackPhase] = useState("idle"); // idle | speaking | listening
  const [ttsHint, setTtsHint] = useState("");
  const [pageRereadNonce, setPageRereadNonce] = useState(0);
  const stopHandlersRef = useRef(new Set());
  const playbackRetryHandlersRef = useRef(new Set());
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchSpeechStatus();
        if (!cancelled) setSpeechConfigured(Boolean(status?.configured));
      } catch {
        if (!cancelled) setSpeechConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setVoiceEnabled = useCallback((next) => {
    const value = Boolean(next);
    setVoiceEnabledState(value);
    try {
      localStorage.setItem(STORAGE_ENABLED, String(value));
    } catch {
      /* ignore */
    }
    if (!value) {
      cancelAzureSpeech();
      setSessionActive(false);
      setNavListening(false);
      setNavStatus("");
      setPlaybackPhase("idle");
      setTtsHint("");
      stopHandlersRef.current.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  const setVoiceLocale = useCallback((code) => {
    const next = normalizeReceptionistLocale(code);
    setVoiceLocaleState(next);
    try {
      localStorage.setItem(STORAGE_LOCALE, next);
    } catch {
      /* ignore */
    }
  }, []);

  const stopEverything = useCallback(() => {
    cancelAzureSpeech();
    setSessionActive(false);
    setNavListening(false);
    setNavStatus("");
    setPlaybackPhase("idle");
    setTtsHint("");
    stopHandlersRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  }, []);

  // Route change: stop page listening / form sessions. Voice ON state is kept.
  // PageAssist will announce the new Health Worker page when appropriate.
  // Do not auto-start registration/screening questions on every page.
  useEffect(() => {
    if (pathnameRef.current === location.pathname) return;
    pathnameRef.current = location.pathname;
    stopEverything();
  }, [location.pathname, stopEverything]);

  const registerWorkflow = useCallback((config) => {
    if (!config?.id) return () => {};
    setWorkflow(config);
    // Cleanup must NOT end an active session when the page only refreshes
    // its config object (form field updates). Only clear registration on leave.
    return () => {
      setWorkflow((current) => (current?.id === config.id ? null : current));
    };
  }, []);

  const registerStopHandler = useCallback((fn) => {
    stopHandlersRef.current.add(fn);
    return () => stopHandlersRef.current.delete(fn);
  }, []);

  const registerPlaybackRetry = useCallback((fn) => {
    playbackRetryHandlersRef.current.add(fn);
    return () => playbackRetryHandlersRef.current.delete(fn);
  }, []);

  const retryPlayback = useCallback(async () => {
    const unlocked = await unlockAzureAudio();
    if (!unlocked) {
      setTtsHint("Click Voice ON again to enable audio playback.");
      return false;
    }
    setTtsHint("");
    playbackRetryHandlersRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    return true;
  }, []);

  const startPageWorkflow = useCallback(async () => {
    if (!voiceEnabled) setVoiceEnabled(true);
    if (!workflow) return false;
    // Unlock audio under the explicit Start / Voice ON click (autoplay policy).
    const unlocked = await unlockAzureAudio();
    if (!unlocked) {
      setTtsHint("Click Voice ON again to enable audio playback.");
    } else {
      setTtsHint("");
    }
    setNavListening(false);
    setNavStatus("");
    setPlaybackPhase("idle");
    // Do not cancelAzureSpeech() here before unlock — unlock needs a play.
    setSessionNonce((n) => n + 1);
    setSessionActive(true);
    return true;
  }, [setVoiceEnabled, voiceEnabled, workflow]);

  const endPageWorkflow = useCallback(() => {
    setSessionActive(false);
    setPlaybackPhase("idle");
  }, []);

  const requestPageReread = useCallback(() => {
    if (!voiceEnabled) setVoiceEnabled(true);
    // Stop current TTS, then bump nonce so PageAssist speaks again.
    cancelAzureSpeech();
    setPlaybackPhase("idle");
    setNavListening(false);
    setNavStatus("reread");
    setPageRereadNonce((n) => n + 1);
    return { ok: true, id: "reread" };
  }, [setVoiceEnabled, voiceEnabled]);

  const handleNavigationTranscript = useCallback((transcript) => {
    if (isReadPageAgainCommand(transcript)) {
      if (sessionActive) {
        setNavStatus("sessionActive");
        return { ok: false, code: "sessionActive" };
      }
      return requestPageReread();
    }
    const result = resolveVoiceNavigation(transcript, { role: user?.role });
    if (!result) {
      setNavStatus("unrecognized");
      return { ok: false, code: "unrecognized" };
    }
    if (result.denied) {
      setNavStatus("denied");
      return { ok: false, code: "denied", id: result.id };
    }
    setNavStatus("navigating");
    stopEverything();
    navigate(result.path);
    return { ok: true, id: result.id, path: result.path };
  }, [navigate, requestPageReread, sessionActive, stopEverything, user?.role]);

  // Same path as header mic after STT — used for automated QA without a second UI control.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__aarogyaVoiceCommand = (transcript) => handleNavigationTranscript(transcript);
    return () => {
      if (window.__aarogyaVoiceCommand) delete window.__aarogyaVoiceCommand;
    };
  }, [handleNavigationTranscript]);

  const value = useMemo(() => ({
    voiceEnabled,
    setVoiceEnabled,
    voiceLocale,
    setVoiceLocale,
    sessionActive,
    sessionNonce,
    workflow,
    workflowMeta: workflow
      ? { id: workflow.id, startLabel: workflow.startLabel || "", mode: workflow.mode || workflow.id }
      : null,
    navStatus,
    setNavStatus,
    navListening,
    setNavListening,
    playbackPhase,
    setPlaybackPhase,
    ttsHint,
    setTtsHint,
    registerWorkflow,
    registerStopHandler,
    registerPlaybackRetry,
    retryPlayback,
    startPageWorkflow,
    endPageWorkflow,
    stopEverything,
    handleNavigationTranscript,
    requestPageReread,
    pageRereadNonce,
    speechConfigured,
    pathname: location.pathname,
  }), [
    voiceEnabled,
    setVoiceEnabled,
    voiceLocale,
    setVoiceLocale,
    sessionActive,
    sessionNonce,
    workflow,
    navStatus,
    navListening,
    playbackPhase,
    ttsHint,
    registerWorkflow,
    registerStopHandler,
    registerPlaybackRetry,
    retryPlayback,
    startPageWorkflow,
    endPageWorkflow,
    stopEverything,
    handleNavigationTranscript,
    requestPageReread,
    pageRereadNonce,
    speechConfigured,
    location.pathname,
  ]);

  return (
    <GlobalVoiceContext.Provider value={value}>
      {children}
    </GlobalVoiceContext.Provider>
  );
}

export function useGlobalVoice() {
  const ctx = useContext(GlobalVoiceContext);
  if (!ctx) {
    throw new Error("useGlobalVoice must be used within GlobalVoiceProvider");
  }
  return ctx;
}

/** Safe hook for optional use outside provider (tests / login). */
export function useGlobalVoiceOptional() {
  return useContext(GlobalVoiceContext);
}
