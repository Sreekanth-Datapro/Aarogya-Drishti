import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  normalizeVoiceLocale,
  speechErrorToMessageKey,
} from "./speechRecognition";

/**
 * Web Speech recognition hook: start / stop / pause / resume / clear.
 * Pause stops the engine but keeps transcript; resume starts again and appends.
 * Pass continuous:false for one-shot conversational answers (stops after final).
 */
export default function useSpeechRecognition({
  lang = "en-IN",
  continuous = true,
  interimResults = true,
  onFinalResult = null,
} = {}) {
  const [supported] = useState(() => isSpeechRecognitionSupported());
  const [status, setStatus] = useState("idle"); // idle | listening | paused | unsupported
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorKey, setErrorKey] = useState("");

  const recognitionRef = useRef(null);
  const finalRef = useRef("");
  const statusRef = useRef("idle");
  const langRef = useRef(normalizeVoiceLocale(lang));
  const continuousRef = useRef(continuous);
  const interimRef = useRef(interimResults);
  const onFinalRef = useRef(onFinalResult);

  useEffect(() => {
    langRef.current = normalizeVoiceLocale(lang);
  }, [lang]);

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  useEffect(() => {
    interimRef.current = interimResults;
  }, [interimResults]);

  useEffect(() => {
    onFinalRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const attachHandlers = useCallback((recognition) => {
    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript || "";
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        const next = continuousRef.current
          ? `${finalRef.current} ${finalChunk}`.replace(/\s+/g, " ").trim()
          : finalChunk.replace(/\s+/g, " ").trim();
        finalRef.current = next;
        setTranscript(next);
        if (!continuousRef.current && next) {
          setInterimTranscript("");
          setStatus("idle");
          try {
            recognition.stop();
          } catch {
            /* ignore */
          }
          onFinalRef.current?.(next);
        }
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      const code = event?.error;
      if (code === "aborted" && statusRef.current === "paused") {
        return;
      }
      setErrorKey(speechErrorToMessageKey(code));
      if (code === "not-allowed" || code === "service-not-allowed") {
        setStatus("idle");
        teardown();
      }
    };

    recognition.onend = () => {
      setInterimTranscript("");
      if (statusRef.current === "listening") {
        // Browser ended the session; treat as stopped so the user can restart.
        setStatus("idle");
        recognitionRef.current = null;
      }
    };
  }, [teardown]);

  const start = useCallback(() => {
    setErrorKey("");
    if (!supported) {
      setStatus("unsupported");
      setErrorKey("voice.unsupported");
      return;
    }
    teardown();
    try {
      const recognition = createSpeechRecognition({
        lang: langRef.current,
        continuous: continuousRef.current,
        interimResults: interimRef.current,
      });
      recognitionRef.current = recognition;
      attachHandlers(recognition);
      recognition.start();
      setStatus("listening");
    } catch (error) {
      setStatus("idle");
      setErrorKey(
        error?.message === "SPEECH_UNSUPPORTED"
          ? "voice.unsupported"
          : "voice.recognitionFailed",
      );
    }
  }, [supported, teardown, attachHandlers]);

  const stop = useCallback(() => {
    setInterimTranscript("");
    setStatus("idle");
    teardown();
  }, [teardown]);

  const pause = useCallback(() => {
    if (statusRef.current !== "listening") return;
    setStatus("paused");
    setInterimTranscript("");
    teardown();
  }, [teardown]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    start();
  }, [start]);

  const clear = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setErrorKey("");
  }, []);

  const setTranscriptManual = useCallback((value) => {
    const next = String(value || "");
    finalRef.current = next.trim();
    setTranscript(next);
  }, []);

  return {
    supported,
    status,
    transcript,
    interimTranscript,
    errorKey,
    lang: langRef.current,
    start,
    stop,
    pause,
    resume,
    clear,
    setTranscript: setTranscriptManual,
  };
}
