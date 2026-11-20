/**
 * Speech locale ↔ Sarvam Bulbul v3 speaker map (must match backend).
 * Locales are locked — Telugu never remaps to English.
 */

export const SPEECH_VOICES = Object.freeze({
  "en-IN": "ishita",
  "te-IN": "neha",
  "hi-IN": "priya",
});

/** @deprecated use SPEECH_VOICES */
export const AZURE_SPEECH_VOICES = SPEECH_VOICES;

export const SPEECH_LOCALES = Object.freeze(Object.keys(SPEECH_VOICES));
export const AZURE_SPEECH_LOCALES = SPEECH_LOCALES;

export function normalizeSpeechLocale(locale) {
  const raw = String(locale || "").trim();
  if (SPEECH_VOICES[raw]) return raw;
  const lower = raw.toLowerCase();
  if (lower === "te" || lower === "te-in") return "te-IN";
  if (lower === "hi" || lower === "hi-in") return "hi-IN";
  if (lower === "en" || lower === "en-in") return "en-IN";
  return null;
}

/** @deprecated use normalizeSpeechLocale */
export const normalizeAzureSpeechLocale = normalizeSpeechLocale;

export function speechVoiceForLocale(locale) {
  const normalized = normalizeSpeechLocale(locale);
  return normalized ? SPEECH_VOICES[normalized] : null;
}

/** @deprecated use speechVoiceForLocale */
export const azureVoiceForLocale = speechVoiceForLocale;
