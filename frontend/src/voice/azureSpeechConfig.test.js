import {
  SPEECH_VOICES,
  AZURE_SPEECH_VOICES,
  speechVoiceForLocale,
  azureVoiceForLocale,
  normalizeSpeechLocale,
  normalizeAzureSpeechLocale,
} from "./azureSpeechConfig";

describe("speechConfig (Sarvam speakers)", () => {
  test("normalizes te/hi/en without remapping Telugu to English", () => {
    expect(normalizeSpeechLocale("te")).toBe("te-IN");
    expect(normalizeSpeechLocale("hi")).toBe("hi-IN");
    expect(normalizeSpeechLocale("en")).toBe("en-IN");
    expect(normalizeSpeechLocale("te-IN")).toBe("te-IN");
    expect(normalizeAzureSpeechLocale("te-IN")).not.toBe("en-IN");
  });

  test("maps Bulbul v3 speakers", () => {
    expect(speechVoiceForLocale("te-IN")).toBe("neha");
    expect(azureVoiceForLocale("hi-IN")).toBe("priya");
    expect(speechVoiceForLocale("en-IN")).toBe("ishita");
    expect(SPEECH_VOICES["te-IN"]).toBe("neha");
    expect(AZURE_SPEECH_VOICES["hi-IN"]).toBe("priya");
    expect(SPEECH_VOICES["en-IN"]).toBe("ishita");
  });

  test("rejects unsupported locales", () => {
    expect(normalizeSpeechLocale("fr-FR")).toBeNull();
    expect(speechVoiceForLocale("xx")).toBeNull();
  });
});
