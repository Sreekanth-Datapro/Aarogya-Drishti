import { synthesizeSpeechAudio } from "./azureSpeechClient";
import { normalizeSpeechLocale } from "./azureSpeechConfig";

let activeAudio = null;
let activeUrl = null;
let activeSource = null;
let activeGain = null;
let playGeneration = 0;
let audioUnlocked = false;
let sharedAudioContext = null;
/** Dedicated HTMLAudioElement kept alive across unlock + TTS (gesture continuity). */
let unlockAudioEl = null;

function debugTts(event, details = {}) {
  if (typeof window === "undefined") return;
  const safe = {
    event,
    ...details,
    at: Date.now(),
  };
  // Temporary safe diagnostics — never includes API keys or utterance text.
  const prev = window.__aarogyaTtsQa || {};
  const history = Array.isArray(prev.history) ? prev.history.slice(-39) : [];
  history.push({ event, ...details, at: safe.at });
  window.__aarogyaTtsQa = { ...prev, ...safe, history, lastEvent: event };
  try {
    // eslint-disable-next-line no-console
    console.info("[aarogya-tts]", event, details);
  } catch {
    /* ignore */
  }
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function isAzureTtsSupported() {
  return typeof window !== "undefined"
    && typeof window.Audio !== "undefined"
    && typeof window.Blob !== "undefined";
}

export function isAudioUnlocked() {
  return audioUnlocked;
}

async function ensureAudioContextRunning() {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new Ctor();
  }
  if (sharedAudioContext.state === "suspended") {
    await sharedAudioContext.resume();
  }
  debugTts("audioContext.state", { state: sharedAudioContext.state });
  return sharedAudioContext;
}

function getUnlockAudioElement() {
  if (typeof window === "undefined") return null;
  if (!unlockAudioEl) {
    unlockAudioEl = new Audio();
    unlockAudioEl.preload = "auto";
    unlockAudioEl.playsInline = true;
    unlockAudioEl.setAttribute("playsinline", "true");
    unlockAudioEl.muted = false;
    unlockAudioEl.volume = 1;
  }
  return unlockAudioEl;
}

/**
 * Call from the Voice ON click so later Sarvam TTS play() is allowed.
 * Must stay tied to that user gesture (no extra button).
 * Starts AudioContext.resume + silent HTML play synchronously in the click stack.
 */
export async function unlockAzureAudio() {
  if (!isAzureTtsSupported()) {
    audioUnlocked = false;
    debugTts("unlock.failed", { reason: "TTS_UNSUPPORTED" });
    return false;
  }
  try {
    // Sync portion of the user gesture — create/resume context before any await.
    const Ctor = getAudioContextConstructor();
    let ctx = null;
    let resumePromise = Promise.resolve();
    if (Ctor) {
      if (!sharedAudioContext || sharedAudioContext.state === "closed") {
        sharedAudioContext = new Ctor();
      }
      ctx = sharedAudioContext;
      if (ctx.state === "suspended") {
        resumePromise = ctx.resume();
      }
    }

    const el = getUnlockAudioElement();
    // Tiny valid WAV silence — marks HTML media as gesture-unlocked.
    el.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    el.muted = false;
    el.volume = 0.01;
    let htmlUnlocked = false;
    try {
      await el.play();
      htmlUnlocked = true;
    } catch {
      htmlUnlocked = false;
    }

    await resumePromise.catch(() => {});

    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
    el.muted = false;
    el.volume = 1;

    if (ctx && ctx.state === "running") {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    }

    const ctxRunning = Boolean(ctx && ctx.state === "running");
    const unlocked = ctxRunning || htmlUnlocked;
    audioUnlocked = unlocked;
    debugTts(unlocked ? "unlock.ok" : "unlock.failed", {
      audioContextState: ctx?.state || null,
      htmlUnlocked,
      reason: unlocked ? undefined : "UNLOCK_BLOCKED",
    });
    return unlocked;
  } catch (error) {
    audioUnlocked = false;
    debugTts("unlock.failed", {
      reason: error?.name || error?.message || "UNLOCK_FAILED",
    });
    return false;
  }
}

export function cancelAzureSpeech() {
  playGeneration += 1;
  debugTts("playback.cancel", { generation: playGeneration });
  if (activeSource) {
    try {
      activeSource.onended = null;
      activeSource.stop(0);
      activeSource.disconnect();
    } catch {
      /* ignore */
    }
    activeSource = null;
  }
  if (activeGain) {
    try {
      activeGain.disconnect();
    } catch {
      /* ignore */
    }
    activeGain = null;
  }
  if (activeAudio) {
    try {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      // Keep element; only clear src after pause (do not revoke mid-play).
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (activeUrl) {
    try {
      URL.revokeObjectURL(activeUrl);
    } catch {
      /* ignore */
    }
    activeUrl = null;
  }
}

function isAutoplayBlocked(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();
  return name === "NotAllowedError"
    || name === "AbortError"
    || message.includes("user didn't interact")
    || message.includes("play() failed")
    || message.includes("not allowed")
    || message.includes("the request is not allowed");
}

async function toMpegBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw Object.assign(new Error("TTS_EMPTY_AUDIO"), { code: "TTS_EMPTY_AUDIO" });
  }
  if (blob.size < 64) {
    throw Object.assign(new Error("TTS_EMPTY_AUDIO"), { code: "TTS_EMPTY_AUDIO" });
  }
  if ((blob.type || "").includes("json")) {
    throw Object.assign(new Error("SARVAM_TTS_FAILED"), { code: "SARVAM_TTS_FAILED" });
  }
  if (blob.type === "audio/mpeg" || blob.type === "audio/mp3") return blob;
  const buffer = await blob.arrayBuffer();
  return new Blob([buffer], { type: "audio/mpeg" });
}

function playViaHtmlAudio(mpegBlob, generation, meta) {
  return new Promise(async (resolve, reject) => {
    const url = URL.createObjectURL(mpegBlob);
    activeUrl = url;
    // Prefer the unlock element when available so gesture unlock carries over.
    const audio = getUnlockAudioElement() || new Audio();
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = false;
    audio.volume = 1;
    audio.src = url;
    activeAudio = audio;

    const cleanup = ({ revoke = true } = {}) => {
      if (activeAudio === audio) activeAudio = null;
      if (revoke && activeUrl === url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
        activeUrl = null;
      }
    };

    audio.onended = () => {
      debugTts("html.ended", { bytes: mpegBlob.size, mimeType: mpegBlob.type });
      cleanup({ revoke: true });
      resolve({ ok: true, ...meta, bytes: mpegBlob.size, via: "html-audio" });
    };
    audio.onerror = () => {
      debugTts("html.error", { bytes: mpegBlob.size, mimeType: mpegBlob.type });
      cleanup({ revoke: true });
      reject(Object.assign(new Error("TTS_PLAYBACK_ERROR"), { code: "TTS_PLAYBACK_ERROR" }));
    };

    try {
      if (audio.readyState < 2) {
        await new Promise((readyResolve, readyReject) => {
          const onReady = () => {
            audio.removeEventListener("canplaythrough", onReady);
            audio.removeEventListener("canplay", onReady);
            audio.removeEventListener("error", onError);
            readyResolve();
          };
          const onError = () => {
            audio.removeEventListener("canplaythrough", onReady);
            audio.removeEventListener("canplay", onReady);
            audio.removeEventListener("error", onError);
            readyReject(Object.assign(new Error("TTS_PLAYBACK_ERROR"), { code: "TTS_PLAYBACK_ERROR" }));
          };
          audio.addEventListener("canplaythrough", onReady);
          audio.addEventListener("canplay", onReady);
          audio.addEventListener("error", onError);
          audio.load();
        });
      }
      if (generation !== playGeneration) {
        cleanup({ revoke: true });
        resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
        return;
      }
      audio.muted = false;
      audio.volume = 1;
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      debugTts("html.play.ok", {
        bytes: mpegBlob.size,
        mimeType: mpegBlob.type,
        duration: Number.isFinite(audio.duration) ? audio.duration : null,
        muted: audio.muted,
        volume: audio.volume,
      });
    } catch (playError) {
      cleanup({ revoke: true });
      debugTts("html.play.failed", {
        reason: playError?.name || playError?.message || "TTS_PLAY_FAILED",
        bytes: mpegBlob.size,
        mimeType: mpegBlob.type,
      });
      if (isAutoplayBlocked(playError)) {
        reject(Object.assign(new Error("TTS_AUTOPLAY_BLOCKED"), {
          code: "TTS_AUTOPLAY_BLOCKED",
          cause: playError,
        }));
        return;
      }
      reject(Object.assign(new Error("TTS_PLAY_FAILED"), {
        code: "TTS_PLAY_FAILED",
        cause: playError,
      }));
    }
  });
}

async function playViaAudioContext(arrayBuffer, generation, meta, mimeType) {
  const ctx = await ensureAudioContextRunning();
  if (!ctx || ctx.state !== "running") {
    debugTts("audiocontext.blocked", { state: ctx?.state || null });
    throw Object.assign(new Error("TTS_AUTOPLAY_BLOCKED"), { code: "TTS_AUTOPLAY_BLOCKED" });
  }
  if (generation !== playGeneration) {
    return { ok: false, cancelled: true, code: "TTS_CANCELLED" };
  }

  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    debugTts("audiocontext.decode.ok", {
      duration: audioBuffer.duration,
      channels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bytes: meta.bytes,
      mimeType,
    });
  } catch (error) {
    debugTts("audiocontext.decode.failed", {
      reason: error?.name || error?.message || "DECODE_FAILED",
    });
    throw Object.assign(new Error("TTS_DECODE_FAILED"), {
      code: "TTS_DECODE_FAILED",
      cause: error,
    });
  }

  if (generation !== playGeneration) {
    return { ok: false, cancelled: true, code: "TTS_CANCELLED" };
  }

  // Reject near-empty buffers (would look like "Speaking" with silence).
  let peak = 0;
  for (let c = 0; c < audioBuffer.numberOfChannels; c += 1) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak < 0.0005 || audioBuffer.duration < 0.05) {
    debugTts("audiocontext.silent_buffer", { peak, duration: audioBuffer.duration });
    throw Object.assign(new Error("TTS_EMPTY_AUDIO"), { code: "TTS_EMPTY_AUDIO" });
  }

  return new Promise((resolve, reject) => {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.buffer = audioBuffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    activeSource = source;
    activeGain = gain;

    source.onended = () => {
      if (activeSource === source) activeSource = null;
      if (activeGain === gain) {
        try {
          gain.disconnect();
        } catch {
          /* ignore */
        }
        activeGain = null;
      }
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      debugTts("audiocontext.ended", {
        bytes: meta.bytes,
        peak,
        duration: audioBuffer.duration,
        state: ctx.state,
      });
      resolve({
        ok: true,
        ...meta,
        via: "audio-context",
        audioContextState: ctx.state,
        mimeType,
        peakAmplitude: peak,
        playResult: "resolved",
      });
    };

    try {
      source.start(0);
      debugTts("audiocontext.play.ok", {
        bytes: meta.bytes,
        peak,
        duration: audioBuffer.duration,
        state: ctx.state,
      });
    } catch (error) {
      if (activeSource === source) activeSource = null;
      if (activeGain === gain) activeGain = null;
      debugTts("audiocontext.play.failed", {
        reason: error?.name || error?.message || "TTS_PLAY_FAILED",
      });
      if (isAutoplayBlocked(error)) {
        reject(Object.assign(new Error("TTS_AUTOPLAY_BLOCKED"), {
          code: "TTS_AUTOPLAY_BLOCKED",
          cause: error,
        }));
        return;
      }
      reject(Object.assign(new Error("TTS_PLAY_FAILED"), {
        code: "TTS_PLAY_FAILED",
        cause: error,
      }));
    }
  });
}

/**
 * Speak via Sarvam TTS (backend proxy). Resolves when playback ends.
 * Rejects with coded errors so Listening never starts without real audio.
 */
export function speakAzureText(text, { lang = "en-IN" } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!isAzureTtsSupported()) {
      reject(Object.assign(new Error("TTS_UNSUPPORTED"), { code: "TTS_UNSUPPORTED" }));
      return;
    }
    const utteranceText = String(text || "").trim();
    if (!utteranceText) {
      resolve({ ok: true, skipped: true });
      return;
    }

    const locale = normalizeSpeechLocale(lang);
    if (!locale) {
      reject(Object.assign(new Error("LOCALE_UNSUPPORTED"), { code: "LOCALE_UNSUPPORTED" }));
      return;
    }

    cancelAzureSpeech();
    const generation = playGeneration;

    try {
      // Keep context running across the network gap when possible.
      try {
        await ensureAudioContextRunning();
      } catch {
        /* play paths report autoplay block */
      }
      if (!audioUnlocked) {
        await unlockAzureAudio();
      }

      debugTts("tts.request.start", { locale, chars: utteranceText.length });
      const {
        blob,
        voice,
        httpStatus,
        contentType,
      } = await synthesizeSpeechAudio(utteranceText, locale);
      debugTts("tts.response", {
        locale,
        voice: voice || null,
        status: httpStatus || null,
        contentType: contentType || blob?.type || null,
        bytes: blob?.size || 0,
      });

      if (generation !== playGeneration) {
        resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
        return;
      }

      const mpegBlob = await toMpegBlob(blob);
      const meta = { locale, voice, bytes: mpegBlob.size };
      // Independent copies so AudioContext decode and HTML fallback never share a detached buffer.
      const sharedBuffer = await mpegBlob.arrayBuffer();
      const playBlob = new Blob([sharedBuffer.slice(0)], { type: "audio/mpeg" });

      debugTts("tts.blob.ready", {
        mimeType: playBlob.type,
        bytes: playBlob.size,
        audioContextState: sharedAudioContext?.state || null,
      });

      // Primary: AudioContext + AudioBufferSourceNode (real speaker path).
      try {
        const ctxResult = await playViaAudioContext(
          sharedBuffer.slice(0),
          generation,
          meta,
          "audio/mpeg"
        );
        if (ctxResult?.cancelled) {
          resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
          return;
        }
        resolve(ctxResult);
        return;
      } catch (ctxError) {
        if (generation !== playGeneration) {
          resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
          return;
        }
        debugTts("audiocontext.fallback_to_html", {
          reason: ctxError?.code || ctxError?.message || "AUDIOCONTEXT_FAILED",
        });
      }

      // Fallback: HTMLAudioElement if AudioContext decode/play fails.
      const htmlResult = await playViaHtmlAudio(playBlob, generation, meta);
      if (htmlResult?.cancelled) {
        resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
        return;
      }
      resolve(htmlResult);
    } catch (error) {
      if (generation !== playGeneration) {
        resolve({ ok: false, cancelled: true, code: "TTS_CANCELLED" });
        return;
      }
      const code = error?.code || error?.message || "TTS_FAILED";
      debugTts("tts.failed", { code: String(code) });
      if (code === "SPEECH_NOT_CONFIGURED" || code === "TTS_NOT_CONFIGURED") {
        reject(Object.assign(new Error("TTS_NOT_CONFIGURED"), { code: "TTS_NOT_CONFIGURED" }));
        return;
      }
      reject(Object.assign(new Error(String(code)), {
        code: String(code),
        cause: error?.cause || error,
      }));
    }
  });
}
