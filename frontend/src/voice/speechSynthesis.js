/**
 * Browser speechSynthesis helpers for the medical receptionist.
 * Never posts audio to Aarogya APIs.
 */

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined"
    && typeof window.speechSynthesis !== "undefined"
    && typeof window.SpeechSynthesisUtterance !== "undefined";
}

export function listSpeechVoices() {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

/**
 * Prefer a voice whose lang matches the BCP-47 locale (exact, then language prefix).
 */
export function pickVoiceForLocale(locale, voices = listSpeechVoices()) {
  const target = String(locale || "en-IN").toLowerCase();
  const prefix = target.split("-")[0];
  const exact = voices.find((voice) => String(voice.lang || "").toLowerCase() === target);
  if (exact) return exact;
  return voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(prefix)) || null;
}

/**
 * Speak text and resolve when utterance ends (or immediately if unsupported/empty).
 * Cancels any previous utterance first.
 */
export function speakText(text, {
  lang = "en-IN",
  rate = 0.95,
  pitch = 1,
  volume = 1,
  voice = null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!isSpeechSynthesisSupported()) {
      reject(new Error("TTS_UNSUPPORTED"));
      return;
    }
    const utteranceText = String(text || "").trim();
    if (!utteranceText) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(utteranceText);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    const chosen = voice || pickVoiceForLocale(lang);
    if (chosen) utterance.voice = chosen;

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      const code = event?.error || "synthesis-failed";
      if (code === "canceled" || code === "interrupted") {
        resolve();
        return;
      }
      reject(new Error(code));
    };

    // Chrome sometimes needs voices loaded asynchronously.
    const voices = listSpeechVoices();
    if (!voices.length) {
      const onVoices = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        const late = pickVoiceForLocale(lang);
        if (late) utterance.voice = late;
        window.speechSynthesis.speak(utterance);
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      // Fallback if voiceschanged never fires
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          reject(error);
        }
      }, 250);
      return;
    }

    window.speechSynthesis.speak(utterance);
  });
}

export function cancelSpeech() {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
