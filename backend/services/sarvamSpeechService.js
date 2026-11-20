/**
 * Sarvam AI Speech — server-side only (STT + TTS).
 * Uses SARVAM_API_KEY. Never log the key or raw transcripts/audio.
 */

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

/** Locked locales for the receptionist — Telugu never remaps to English. */
const SARVAM_SPEAKERS = Object.freeze({
  "en-IN": "ishita",
  "te-IN": "neha",
  "hi-IN": "priya",
});

const SUPPORTED_LOCALES = Object.freeze(Object.keys(SARVAM_SPEAKERS));

const STT_MODEL = "saaras:v4";
const TTS_MODEL = "bulbul:v3";

function normalizeLocale(locale) {
  const raw = String(locale || "").trim();
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === "te" || lower === "te-in") return "te-IN";
  if (lower === "hi" || lower === "hi-in") return "hi-IN";
  if (lower === "en" || lower === "en-in") return "en-IN";
  return null;
}

function getSpeechConfig(env = process.env) {
  const key = String(env.SARVAM_API_KEY || "").trim();
  return {
    key,
    configured: Boolean(key),
    provider: "sarvam",
    sttModel: STT_MODEL,
    ttsModel: TTS_MODEL,
  };
}

function voiceForLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return null;
  return SARVAM_SPEAKERS[normalized];
}

function authHeaders(key) {
  return {
    "api-subscription-key": key,
  };
}

async function synthesizeSpeech({
  text,
  locale,
  key,
  fetchImpl = fetch,
} = {}) {
  const utterance = String(text || "").trim();
  if (!utterance) {
    const error = new Error("Text is required");
    error.code = "TEXT_REQUIRED";
    throw error;
  }
  if (utterance.length > 2000) {
    const error = new Error("Text too long");
    error.code = "TEXT_TOO_LONG";
    throw error;
  }

  const lang = normalizeLocale(locale);
  const speaker = voiceForLocale(lang);
  if (!lang || !speaker) {
    const error = new Error("Unsupported speech locale");
    error.code = "LOCALE_UNSUPPORTED";
    throw error;
  }

  const response = await fetchImpl(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: utterance,
      language_code: lang,
      speaker,
      model: TTS_MODEL,
      pace: 0.95,
      speech_sample_rate: 22050,
      output_audio_codec: "mp3",
    }),
  });

  if (!response.ok) {
    const error = new Error("Sarvam speech synthesis failed");
    error.code = "SARVAM_TTS_FAILED";
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const chunks = Array.isArray(payload?.audios) ? payload.audios : [];
  const b64 = chunks.filter(Boolean).join("");
  if (!b64) {
    const error = new Error("Sarvam returned empty audio");
    error.code = "SARVAM_TTS_FAILED";
    throw error;
  }

  return {
    audio: Buffer.from(b64, "base64"),
    contentType: "audio/mpeg",
    locale: lang,
    voice: speaker,
    model: TTS_MODEL,
  };
}

async function recognizeSpeech({
  audioBuffer,
  locale,
  contentType = "audio/wav",
  filename = "answer.wav",
  key,
  fetchImpl = fetch,
} = {}) {
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    const error = new Error("Audio is required");
    error.code = "AUDIO_REQUIRED";
    throw error;
  }
  if (audioBuffer.length > 3 * 1024 * 1024) {
    const error = new Error("Audio too large");
    error.code = "AUDIO_TOO_LARGE";
    throw error;
  }

  const lang = normalizeLocale(locale);
  if (!lang) {
    const error = new Error("Unsupported speech locale");
    error.code = "LOCALE_UNSUPPORTED";
    throw error;
  }

  const form = new FormData();
  const mime = contentType && contentType.startsWith("audio/")
    ? contentType
    : "audio/wav";
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mime });
  form.append("file", blob, filename || "answer.wav");
  form.append("model", STT_MODEL);
  form.append("mode", "transcribe");
  // Locale locked — never send "unknown" when the user selected te/hi/en.
  form.append("language_code", lang);

  const response = await fetchImpl(SARVAM_STT_URL, {
    method: "POST",
    headers: {
      ...authHeaders(key),
    },
    body: form,
  });

  if (!response.ok) {
    const error = new Error("Sarvam speech recognition failed");
    error.code = "SARVAM_STT_FAILED";
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const text = String(payload?.transcript || "").trim();
  const returnedLocale = normalizeLocale(payload?.language_code) || lang;

  // Reject silent English remapping of a Telugu/Hindi session.
  if (returnedLocale && returnedLocale !== lang) {
    // Still return text if present, but keep the requested locale in the contract
    // so the receptionist does not switch languages.
  }

  if (!text) {
    return {
      ok: false,
      text: "",
      locale: lang,
      recognitionStatus: "NoMatch",
      code: "NO_SPEECH",
    };
  }

  return {
    ok: true,
    text,
    locale: lang,
    detectionLocale: returnedLocale,
    recognitionStatus: "Success",
    model: STT_MODEL,
  };
}

module.exports = {
  SARVAM_SPEAKERS,
  SUPPORTED_LOCALES,
  STT_MODEL,
  TTS_MODEL,
  normalizeLocale,
  getSpeechConfig,
  voiceForLocale,
  synthesizeSpeech,
  recognizeSpeech,
};
