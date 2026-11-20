/**
 * Browser Web Speech API helpers.
 *
 * Privacy: recognition may be processed by the browser vendor (e.g. Google on
 * Chrome). See ./PRIVACY.md. This module never posts audio to Aarogya APIs.
 */

export const VOICE_LOCALES = [
  { code: "en-IN", labelKey: "voice.localeEnIn" },
  { code: "te-IN", labelKey: "voice.localeTeIn" },
  { code: "hi-IN", labelKey: "voice.localeHiIn" },
];

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

/** Map app UI language to a preferred speech locale. */
export function preferredVoiceLocale(uiLanguage) {
  if (uiLanguage === "te") return "te-IN";
  if (uiLanguage === "hi") return "hi-IN";
  return "en-IN";
}

export function normalizeVoiceLocale(code) {
  const raw = String(code || "").trim();
  const match = VOICE_LOCALES.find((item) => item.code === raw);
  return match ? match.code : "en-IN";
}

/**
 * Create a configured SpeechRecognition instance.
 * Callers own start/stop lifecycle.
 */
export function createSpeechRecognition({
  lang = "en-IN",
  continuous = true,
  interimResults = true,
} = {}) {
  const Recognition = getSpeechRecognitionConstructor();
  if (!Recognition) {
    throw new Error("SPEECH_UNSUPPORTED");
  }
  const recognition = new Recognition();
  recognition.lang = normalizeVoiceLocale(lang);
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;
  recognition.maxAlternatives = 1;
  return recognition;
}

/** Map SpeechRecognition error codes to translation keys. */
export function speechErrorToMessageKey(errorCode) {
  switch (String(errorCode || "").toLowerCase()) {
    case "not-allowed":
    case "service-not-allowed":
      return "voice.micDenied";
    case "no-speech":
      return "voice.noSpeech";
    case "audio-capture":
      return "voice.micUnavailable";
    case "network":
      return "voice.networkError";
    case "aborted":
      return "voice.aborted";
    case "language-not-supported":
      return "voice.localeUnsupported";
    default:
      return "voice.recognitionFailed";
  }
}
