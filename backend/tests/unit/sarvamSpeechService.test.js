/**
 * Unit tests for Sarvam speech service (no live API calls / no real keys).
 */

const {
  normalizeLocale,
  voiceForLocale,
  getSpeechConfig,
  synthesizeSpeech,
  recognizeSpeech,
  SARVAM_SPEAKERS,
  STT_MODEL,
  TTS_MODEL,
} = require("../../services/sarvamSpeechService");

describe("sarvamSpeechService", () => {
  test("locks te/hi/en locales and never remaps Telugu to English", () => {
    expect(normalizeLocale("te")).toBe("te-IN");
    expect(normalizeLocale("hi")).toBe("hi-IN");
    expect(normalizeLocale("en")).toBe("en-IN");
    expect(normalizeLocale("te-IN")).toBe("te-IN");
    expect(normalizeLocale("te-IN")).not.toBe("en-IN");
    expect(normalizeLocale("fr-FR")).toBeNull();
  });

  test("maps speakers for te/hi/en", () => {
    expect(voiceForLocale("te-IN")).toBe("neha");
    expect(voiceForLocale("hi-IN")).toBe("priya");
    expect(voiceForLocale("en-IN")).toBe("ishita");
    expect(SARVAM_SPEAKERS["te-IN"]).toBe("neha");
    expect(SARVAM_SPEAKERS["hi-IN"]).toBe("priya");
    expect(SARVAM_SPEAKERS["en-IN"]).toBe("ishita");
  });

  test("getSpeechConfig reports configured from SARVAM_API_KEY only", () => {
    expect(getSpeechConfig({}).configured).toBe(false);
    expect(getSpeechConfig({ SARVAM_API_KEY: "" }).configured).toBe(false);
    const cfg = getSpeechConfig({ SARVAM_API_KEY: "test-key-not-logged" });
    expect(cfg.configured).toBe(true);
    expect(cfg.provider).toBe("sarvam");
    expect(cfg.sttModel).toBe(STT_MODEL);
    expect(cfg.ttsModel).toBe(TTS_MODEL);
    // Key stays server-side for proxy calls; status endpoint must never echo it.
    expect(cfg.key).toBeTruthy();
  });

  test("synthesizeSpeech posts Bulbul v3 payload and returns mp3 buffer", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          audios: [Buffer.from("fake-mp3").toString("base64")],
        }),
      };
    };

    const result = await synthesizeSpeech({
      text: "Hello",
      locale: "en-IN",
      key: "k",
      fetchImpl: fakeFetch,
    });

    expect(calls[0].url).toBe("https://api.sarvam.ai/text-to-speech");
    const body = JSON.parse(calls[0].options.body);
    expect(body.model).toBe("bulbul:v3");
    expect(body.language_code).toBe("en-IN");
    expect(body.speaker).toBe("ishita");
    expect(calls[0].options.headers["api-subscription-key"]).toBe("k");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.voice).toBe("ishita");
    expect(Buffer.isBuffer(result.audio)).toBe(true);
  });

  test("synthesizeSpeech uses neha for Telugu", async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ audios: [Buffer.from("x").toString("base64")] }),
    });
    const result = await synthesizeSpeech({
      text: "నమస్కారం",
      locale: "te-IN",
      key: "k",
      fetchImpl: fakeFetch,
    });
    expect(result.locale).toBe("te-IN");
    expect(result.voice).toBe("neha");
  });

  test("recognizeSpeech posts saaras:v4 multipart and returns transcript", async () => {
    const fakeFetch = async (url, options) => {
      expect(url).toBe("https://api.sarvam.ai/speech-to-text");
      expect(options.headers["api-subscription-key"]).toBe("k");
      expect(options.body).toBeInstanceOf(FormData);
      return {
        ok: true,
        json: async () => ({
          transcript: "నా పేరు రాము",
          language_code: "te-IN",
        }),
      };
    };

    const result = await recognizeSpeech({
      audioBuffer: Buffer.from([1, 2, 3, 4]),
      locale: "te-IN",
      key: "k",
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("నా పేరు రాము");
    expect(result.locale).toBe("te-IN");
    expect(result.model).toBe("saaras:v4");
  });

  test("recognizeSpeech returns NO_SPEECH when transcript empty", async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ transcript: "  ", language_code: "hi-IN" }),
    });
    const result = await recognizeSpeech({
      audioBuffer: Buffer.from([1, 2, 3]),
      locale: "hi-IN",
      key: "k",
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NO_SPEECH");
    expect(result.locale).toBe("hi-IN");
  });
});
