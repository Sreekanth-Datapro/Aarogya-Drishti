import api from "../services/api";
import { normalizeSpeechLocale } from "./azureSpeechConfig";

/**
 * Client for /api/speech/* — Sarvam keys stay on the backend.
 * Never logs transcript or audio payloads.
 */

export async function fetchSpeechStatus() {
  const response = await api.get("/speech/status", { timeout: 20000 });
  return response.data;
}

export async function synthesizeSpeechAudio(text, locale) {
  const lockedLocale = normalizeSpeechLocale(locale);
  if (!lockedLocale) {
    const error = new Error("LOCALE_UNSUPPORTED");
    error.code = "LOCALE_UNSUPPORTED";
    throw error;
  }

  try {
    const response = await api.post(
      "/speech/synthesize",
      { text: String(text || ""), locale: lockedLocale },
      {
        responseType: "blob",
        timeout: 45000,
        headers: { Accept: "audio/mpeg" },
      }
    );

    const httpStatus = response.status || 0;
    const contentType = response.headers?.["content-type"] || "";
    if (contentType.includes("application/json") && response.data?.text) {
      const textBody = await response.data.text();
      let parsed = null;
      try {
        parsed = JSON.parse(textBody);
      } catch {
        parsed = null;
      }
      const error = new Error(parsed?.code || "SARVAM_TTS_FAILED");
      error.code = parsed?.code || "SARVAM_TTS_FAILED";
      error.httpStatus = httpStatus;
      error.contentType = contentType;
      throw error;
    }

    const blob = response.data;
    if (!(blob instanceof Blob)) {
      const error = new Error("SARVAM_TTS_FAILED");
      error.code = "SARVAM_TTS_FAILED";
      error.httpStatus = httpStatus;
      error.contentType = contentType;
      throw error;
    }
    if ((blob.type || "").includes("json") || blob.size < 64) {
      try {
        const parsed = JSON.parse(await blob.text());
        const error = new Error(parsed?.code || "SARVAM_TTS_FAILED");
        error.code = parsed?.code || "SARVAM_TTS_FAILED";
        error.httpStatus = httpStatus;
        error.contentType = contentType;
        throw error;
      } catch (inner) {
        if (inner?.code) throw inner;
        const error = new Error("SARVAM_TTS_FAILED");
        error.code = "SARVAM_TTS_FAILED";
        error.httpStatus = httpStatus;
        error.contentType = contentType;
        throw error;
      }
    }

    // Normalize MIME — empty/octet-stream blobs break Audio() on some browsers.
    let audioBlob = blob;
    if (!(blob.type || "").includes("audio")) {
      const buffer = await blob.arrayBuffer();
      audioBlob = new Blob([buffer], { type: "audio/mpeg" });
    }

    return {
      blob: audioBlob,
      locale: lockedLocale,
      voice: response.headers?.["x-speech-voice"] || null,
      httpStatus,
      contentType: contentType || audioBlob.type || "audio/mpeg",
    };
  } catch (error) {
    if (error?.code && (
      String(error.code).startsWith("LOCALE")
      || String(error.code).startsWith("TTS_")
      || String(error.code).startsWith("SPEECH_")
      || String(error.code).startsWith("SARVAM_")
      || String(error.code).startsWith("AZURE_")
    )) {
      throw error;
    }
    let code = error?.response?.data?.code || error?.code || "SARVAM_TTS_FAILED";
    const data = error?.response?.data;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text());
        code = parsed?.code || code;
      } catch {
        /* keep code */
      }
    }
    const wrapped = new Error(code);
    wrapped.code = code;
    throw wrapped;
  }
}

export async function recognizeSpeechAudio(audioBlob, locale, mimeType = "audio/wav") {
  const lockedLocale = normalizeSpeechLocale(locale);
  if (!lockedLocale) {
    const error = new Error("LOCALE_UNSUPPORTED");
    error.code = "LOCALE_UNSUPPORTED";
    throw error;
  }

  const form = new FormData();
  form.append("locale", lockedLocale);
  form.append(
    "audio",
    audioBlob,
    mimeType.includes("wav") ? "answer.wav" : "answer.audio"
  );

  try {
    const response = await api.post("/speech/recognize", form, {
      timeout: 60000,
    });
    return {
      ok: true,
      text: String(response.data?.text || "").trim(),
      locale: response.data?.locale || lockedLocale,
    };
  } catch (error) {
    const code = error?.response?.data?.code || error?.code || "SARVAM_STT_FAILED";
    const status = error?.response?.status;
    if (status === 422 || code === "NO_SPEECH") {
      return {
        ok: false,
        text: "",
        locale: lockedLocale,
        code: "NO_SPEECH",
      };
    }
    const wrapped = new Error(code);
    wrapped.code = code;
    wrapped.status = status;
    throw wrapped;
  }
}

export function speechClientErrorToMessageKey(code) {
  switch (String(code || "").toUpperCase()) {
    case "SPEECH_NOT_CONFIGURED":
      return "voice.speechNotConfigured";
    case "LOCALE_UNSUPPORTED":
      return "voice.localeUnsupported";
    case "NO_SPEECH":
      return "voice.noSpeech";
    case "ERR_NETWORK":
    case "ECONNABORTED":
    case "SPEECH_RATE_LIMIT":
      return "voice.networkError";
    case "MIC_DENIED":
    case "NOT_ALLOWED":
      return "voice.micDenied";
    case "MIC_UNAVAILABLE":
      return "voice.micUnavailable";
    default:
      return "voice.recognitionFailed";
  }
}
