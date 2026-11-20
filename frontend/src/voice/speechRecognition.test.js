import {
  VOICE_LOCALES,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  normalizeVoiceLocale,
  preferredVoiceLocale,
  speechErrorToMessageKey,
  createSpeechRecognition,
} from "./speechRecognition";

describe("speechRecognition helpers", () => {
  const originalSpeech = window.SpeechRecognition;
  const originalWebkit = window.webkitSpeechRecognition;

  afterEach(() => {
    window.SpeechRecognition = originalSpeech;
    window.webkitSpeechRecognition = originalWebkit;
  });

  test("lists English, Telugu and Hindi locales", () => {
    expect(VOICE_LOCALES.map((item) => item.code)).toEqual(["en-IN", "te-IN", "hi-IN"]);
  });

  test("detects unsupported browsers", () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    expect(getSpeechRecognitionConstructor()).toBeNull();
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  test("detects webkit SpeechRecognition", () => {
    delete window.SpeechRecognition;
    window.webkitSpeechRecognition = function MockRecognition() {};
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  test("maps UI language to preferred locale", () => {
    expect(preferredVoiceLocale("en")).toBe("en-IN");
    expect(preferredVoiceLocale("te")).toBe("te-IN");
    expect(preferredVoiceLocale("hi")).toBe("hi-IN");
  });

  test("normalizes unknown locales to en-IN", () => {
    expect(normalizeVoiceLocale("te-IN")).toBe("te-IN");
    expect(normalizeVoiceLocale("xx-YY")).toBe("en-IN");
  });

  test("maps permission errors to micDenied", () => {
    expect(speechErrorToMessageKey("not-allowed")).toBe("voice.micDenied");
    expect(speechErrorToMessageKey("no-speech")).toBe("voice.noSpeech");
  });

  test("createSpeechRecognition configures lang and continuous mode", () => {
    function MockRecognition() {
      this.lang = "";
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 0;
    }
    window.SpeechRecognition = MockRecognition;
    const recognition = createSpeechRecognition({ lang: "hi-IN" });
    expect(recognition.lang).toBe("hi-IN");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
  });
});
