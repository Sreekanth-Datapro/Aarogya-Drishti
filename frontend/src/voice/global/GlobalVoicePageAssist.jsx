import { useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { receptionistBcp47 } from "../receptionistLocales";
import { cancelAzureSpeech, speakAzureText } from "../azureTtsPlayer";
import { useGlobalVoice } from "./GlobalVoiceContext";
import { buildHwPageExplanation } from "./voicePageReader";

/**
 * Reads and explains the current Health Worker page when Voice is ON.
 * Uses Sarvam TTS via speakAzureText — no second voice engine.
 * Skips while a form workflow (registration / screening) owns the mic.
 */
export default function GlobalVoicePageAssist() {
  const { user } = useAuth();
  const {
    voiceEnabled,
    voiceLocale,
    sessionActive,
    navListening,
    pathname,
    pageRereadNonce,
    setPlaybackPhase,
    registerStopHandler,
  } = useGlobalVoice();

  const lastKeyRef = useRef("");
  const announceGenRef = useRef(0);
  const activeGenRef = useRef(0);
  const owningAnnounceRef = useRef(false);

  useEffect(() => registerStopHandler(() => {
    // Only invalidate an announce that already started playing.
    // Route-change stopEverything must not kill the pending post-nav timer.
    if (!owningAnnounceRef.current) return;
    announceGenRef.current += 1;
    activeGenRef.current = 0;
    owningAnnounceRef.current = false;
  }), [registerStopHandler]);

  // Nav mic: stop a page announcement so Listening is not fighting TTS.
  useEffect(() => {
    if (!navListening) return;
    if (!owningAnnounceRef.current) return;
    cancelAzureSpeech();
    owningAnnounceRef.current = false;
    activeGenRef.current = 0;
    setPlaybackPhase("idle");
  }, [navListening, setPlaybackPhase]);

  // New page visit or explicit re-read should announce again.
  useEffect(() => {
    lastKeyRef.current = "";
  }, [pathname, pageRereadNonce]);

  useEffect(() => {
    if (!voiceEnabled) {
      lastKeyRef.current = "";
      return undefined;
    }
    if (user?.role !== "HEALTH_WORKER") return undefined;
    // Form workflows own audio — do not announce over them.
    if (sessionActive) return undefined;
    if (navListening) return undefined;

    const key = `${pathname}|${voiceLocale}|${pageRereadNonce || 0}`;
    if (lastKeyRef.current === key) return undefined;

    const gen = announceGenRef.current + 1;
    announceGenRef.current = gen;
    activeGenRef.current = gen;
    let cancelled = false;

    // Wait so route content (stats / form legends) can paint.
    const timer = window.setTimeout(async () => {
      if (cancelled || activeGenRef.current !== gen) return;

      const explanation = buildHwPageExplanation(pathname, voiceLocale, document);
      if (!explanation?.text) return;

      lastKeyRef.current = key;
      owningAnnounceRef.current = true;
      setPlaybackPhase("speaking");
      try {
        const result = await speakAzureText(explanation.text, {
          lang: receptionistBcp47(voiceLocale),
        });
        if (cancelled || activeGenRef.current !== gen) return;
        if (result?.cancelled || result?.ok === false) {
          lastKeyRef.current = "";
        }
      } catch {
        if (!cancelled && activeGenRef.current === gen) {
          lastKeyRef.current = "";
        }
      } finally {
        if (activeGenRef.current === gen) {
          owningAnnounceRef.current = false;
          activeGenRef.current = 0;
          if (!cancelled) setPlaybackPhase("idle");
        }
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (activeGenRef.current === gen) {
        activeGenRef.current = 0;
      }
    };
  }, [
    voiceEnabled,
    voiceLocale,
    sessionActive,
    navListening,
    pathname,
    pageRereadNonce,
    user?.role,
    setPlaybackPhase,
  ]);

  return null;
}
