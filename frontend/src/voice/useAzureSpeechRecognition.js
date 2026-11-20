import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  recognizeSpeechAudio,
  speechClientErrorToMessageKey,
} from "./azureSpeechClient";
import { normalizeSpeechLocale } from "./azureSpeechConfig";
import { downsampleBuffer, encodeWav, mergeFloat32 } from "./wavEncoder";

const TARGET_RATE = 16000;
const MAX_MS = 15000;
const SILENCE_MS = 1400;
const SPEECH_RMS = 0.015;
const SILENCE_RMS = 0.008;

function isMicSupported() {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && (window.AudioContext || window.webkitAudioContext);
}

/**
 * One-shot cloud STT via MediaStream → WAV → backend /api/speech/recognize (Sarvam).
 * Locale is locked (te-IN stays te-IN). Compatible surface with useSpeechRecognition.
 */
export default function useAzureSpeechRecognition({
  lang = "en-IN",
  enabled = true,
} = {}) {
  const [supported] = useState(() => isMicSupported());
  const [status, setStatus] = useState("idle"); // idle | listening | unsupported
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorKey, setErrorKey] = useState("");

  const langRef = useRef(normalizeSpeechLocale(lang) || "en-IN");
  const statusRef = useRef("idle");
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const chunksRef = useRef([]);
  const speakingRef = useRef(false);
  const silenceStartedRef = useRef(0);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    const next = normalizeSpeechLocale(lang);
    // Refuse silent remaps: if invalid, keep previous locked locale.
    if (next) langRef.current = next;
  }, [lang]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const hardStopTracks = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    if (contextRef.current) {
      const ctx = contextRef.current;
      contextRef.current = null;
      ctx.close().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    finishingRef.current = false;
    hardStopTracks();
  }, [hardStopTracks]);

  useEffect(() => () => teardown(), [teardown]);

  const finishAndRecognize = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    const chunks = chunksRef.current;
    chunksRef.current = [];
    hardStopTracks();

    if (!enabled) {
      setStatus("idle");
      finishingRef.current = false;
      return;
    }

    if (!chunks.length) {
      setStatus("idle");
      setErrorKey("voice.noSpeech");
      finishingRef.current = false;
      return;
    }

    setInterimTranscript("…");
    try {
      const merged = mergeFloat32(chunks);
      const ctxRate = TARGET_RATE;
      // Chunks were already downsampled to TARGET_RATE while capturing when possible.
      const pcm = merged;
      const wav = encodeWav(pcm, ctxRate);
      const blob = new Blob([wav], { type: "audio/wav" });
      const result = await recognizeSpeechAudio(blob, langRef.current, "audio/wav");

      if (!result.ok || !result.text) {
        setTranscript("");
        setErrorKey("voice.noSpeech");
        setStatus("idle");
        finishingRef.current = false;
        return;
      }

      // Guard: locale returned by server must match what we asked for.
      if (result.locale && result.locale !== langRef.current) {
        setTranscript("");
        setErrorKey("voice.localeUnsupported");
        setStatus("idle");
        finishingRef.current = false;
        return;
      }

      setTranscript(result.text);
      setInterimTranscript("");
      setErrorKey("");
      setStatus("idle");
    } catch (error) {
      const code = error?.code || error?.message;
      if (code === "SPEECH_NOT_CONFIGURED") {
        setErrorKey("voice.speechNotConfigured");
      } else {
        setErrorKey(speechClientErrorToMessageKey(code));
      }
      setTranscript("");
      setStatus("idle");
    } finally {
      finishingRef.current = false;
    }
  }, [enabled, hardStopTracks]);

  const start = useCallback(async () => {
    setErrorKey("");
    setTranscript("");
    setInterimTranscript("");
    if (!supported || !enabled) {
      setStatus("unsupported");
      setErrorKey(enabled ? "voice.unsupported" : "voice.speechNotConfigured");
      return;
    }

    teardown();
    chunksRef.current = [];
    speakingRef.current = false;
    silenceStartedRef.current = 0;
    finishingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const context = new AudioCtx();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      // ScriptProcessor is deprecated but widely supported for PCM capture (incl. Android Chrome).
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      startedAtRef.current = Date.now();

      processor.onaudioprocess = (event) => {
        if (statusRef.current !== "listening" || finishingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);

        const down = downsampleBuffer(
          input,
          context.sampleRate,
          TARGET_RATE
        );
        chunksRef.current.push(new Float32Array(down));

        const now = Date.now();
        if (rms >= SPEECH_RMS) {
          speakingRef.current = true;
          silenceStartedRef.current = 0;
          setInterimTranscript("…");
        } else if (speakingRef.current && rms < SILENCE_RMS) {
          if (!silenceStartedRef.current) silenceStartedRef.current = now;
          else if (now - silenceStartedRef.current >= SILENCE_MS) {
            void finishAndRecognize();
            return;
          }
        }

        if (now - startedAtRef.current >= MAX_MS) {
          void finishAndRecognize();
        }
      };

      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      setStatus("listening");

      stopTimerRef.current = setTimeout(() => {
        if (statusRef.current === "listening") void finishAndRecognize();
      }, MAX_MS + 200);
    } catch (error) {
      teardown();
      setStatus("idle");
      const name = String(error?.name || "");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setErrorKey("voice.micDenied");
      } else if (name === "NotFoundError" || name === "NotReadableError") {
        setErrorKey("voice.micUnavailable");
      } else {
        setErrorKey("voice.recognitionFailed");
      }
    }
  }, [enabled, finishAndRecognize, supported, teardown]);

  const stop = useCallback(() => {
    if (statusRef.current === "listening") {
      void finishAndRecognize();
      return;
    }
    setInterimTranscript("");
    setStatus("idle");
    teardown();
  }, [finishAndRecognize, teardown]);

  const clear = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setErrorKey("");
  }, []);

  const setTranscriptManual = useCallback((value) => {
    setTranscript(String(value || ""));
  }, []);

  // Stable identity — callers must not cancel TTS on every render.
  return useMemo(() => ({
    supported: supported && enabled,
    status,
    transcript,
    interimTranscript,
    errorKey,
    lang: langRef.current,
    start,
    stop,
    pause: stop,
    resume: start,
    clear,
    setTranscript: setTranscriptManual,
    /** Hard abort without uploading (page leave / cancel). */
    abort: teardown,
  }), [
    supported,
    enabled,
    status,
    transcript,
    interimTranscript,
    errorKey,
    start,
    stop,
    clear,
    setTranscriptManual,
    teardown,
  ]);
}
