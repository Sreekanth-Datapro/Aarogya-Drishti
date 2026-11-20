import {
  isSpeechSynthesisSupported,
  pickVoiceForLocale,
  speakText,
  cancelSpeech,
} from "./speechSynthesis";

describe("speechSynthesis helpers", () => {
  const originalSynthesis = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;

  afterEach(() => {
    window.speechSynthesis = originalSynthesis;
    window.SpeechSynthesisUtterance = originalUtterance;
  });

  test("reports unsupported when speechSynthesis missing", () => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    expect(isSpeechSynthesisSupported()).toBe(false);
  });

  test("picks matching voice by locale", () => {
    const voices = [
      { lang: "en-US", name: "English US" },
      { lang: "te-IN", name: "Telugu" },
      { lang: "hi-IN", name: "Hindi" },
    ];
    expect(pickVoiceForLocale("te-IN", voices).name).toBe("Telugu");
    expect(pickVoiceForLocale("hi-IN", voices).name).toBe("Hindi");
    expect(pickVoiceForLocale("en-IN", voices).lang).toBe("en-US");
  });

  test("speaks and resolves on end", async () => {
    const speak = jest.fn((utterance) => {
      setTimeout(() => utterance.onend?.(), 0);
    });
    const cancel = jest.fn();
    function FakeUtterance(text) {
      this.text = text;
    }
    window.speechSynthesis = {
      speak,
      cancel,
      getVoices: () => [{ lang: "en-IN", name: "EN" }],
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    window.SpeechSynthesisUtterance = FakeUtterance;
    await speakText("Hello", { lang: "en-IN" });
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalled();
    cancelSpeech();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  test("rejects when TTS unsupported", async () => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    await expect(speakText("Hello")).rejects.toThrow("TTS_UNSUPPORTED");
  });
});
