const {
  getSpeechConfig,
  normalizeLocale,
  voiceForLocale,
  synthesizeSpeech,
  recognizeSpeech,
  SARVAM_SPEAKERS,
  STT_MODEL,
  TTS_MODEL,
} = require("../services/sarvamSpeechService");

function notConfigured(res) {
  return res.status(503).json({
    success: false,
    message: "Sarvam Speech is not configured on the server",
    code: "SPEECH_NOT_CONFIGURED",
  });
}

function mapServiceError(error, res) {
  const code = error?.code || "SPEECH_FAILED";
  if (code === "LOCALE_UNSUPPORTED") {
    return res.status(400).json({
      success: false,
      message: "Unsupported speech locale. Use en-IN, te-IN, or hi-IN.",
      code,
    });
  }
  if (code === "TEXT_REQUIRED" || code === "AUDIO_REQUIRED") {
    return res.status(400).json({ success: false, message: error.message, code });
  }
  if (code === "TEXT_TOO_LONG" || code === "AUDIO_TOO_LARGE") {
    return res.status(413).json({ success: false, message: error.message, code });
  }
  if (code === "SARVAM_TTS_FAILED" || code === "SARVAM_STT_FAILED") {
    return res.status(502).json({
      success: false,
      message: "Speech provider request failed",
      code,
    });
  }
  return res.status(500).json({
    success: false,
    message: "Speech service error",
    code: "SPEECH_FAILED",
  });
}

/**
 * GET /api/speech/status
 * Does not expose the API key.
 */
async function status(req, res) {
  const { configured } = getSpeechConfig();
  return res.json({
    success: true,
    configured,
    provider: "sarvam",
    sttModel: STT_MODEL,
    ttsModel: TTS_MODEL,
    locales: Object.keys(SARVAM_SPEAKERS),
    voices: Object.entries(SARVAM_SPEAKERS).map(([locale, name]) => ({
      locale,
      name,
      available: configured,
    })),
    voicesVerified: configured,
  });
}

/**
 * POST /api/speech/synthesize
 * Body: { text, locale } → audio/mpeg
 */
async function synthesize(req, res) {
  const { key, configured } = getSpeechConfig();
  if (!configured) return notConfigured(res);

  const locale = normalizeLocale(req.body?.locale);
  const text = String(req.body?.text || "");
  if (!locale) {
    return res.status(400).json({
      success: false,
      message: "Unsupported speech locale. Use en-IN, te-IN, or hi-IN.",
      code: "LOCALE_UNSUPPORTED",
    });
  }

  try {
    const result = await synthesizeSpeech({
      text,
      locale,
      key,
    });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Speech-Locale", result.locale);
    res.setHeader("X-Speech-Voice", result.voice);
    res.setHeader("X-Speech-Provider", "sarvam");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(result.audio);
  } catch (error) {
    return mapServiceError(error, res);
  }
}

/**
 * POST /api/speech/recognize
 * multipart: audio + locale → { text, locale }
 */
async function recognize(req, res) {
  const { key, configured } = getSpeechConfig();
  if (!configured) return notConfigured(res);

  const locale = normalizeLocale(req.body?.locale || req.query?.locale);
  if (!locale) {
    return res.status(400).json({
      success: false,
      message: "Unsupported speech locale. Use en-IN, te-IN, or hi-IN.",
      code: "LOCALE_UNSUPPORTED",
    });
  }

  const file = req.file;
  if (!file?.buffer?.length) {
    return res.status(400).json({
      success: false,
      message: "Audio file is required",
      code: "AUDIO_REQUIRED",
    });
  }

  const contentType = file.mimetype && file.mimetype.startsWith("audio/")
    ? file.mimetype
    : "audio/wav";

  try {
    const result = await recognizeSpeech({
      audioBuffer: file.buffer,
      locale,
      contentType,
      filename: file.originalname || "answer.wav",
      key,
    });

    file.buffer = null;

    if (!result.ok) {
      return res.status(422).json({
        success: false,
        message: "No speech recognized",
        code: result.code || "NO_SPEECH",
        locale: result.locale,
        recognitionStatus: result.recognitionStatus,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      locale: result.locale,
      voice: voiceForLocale(result.locale),
      recognitionStatus: result.recognitionStatus,
      provider: "sarvam",
    });
  } catch (error) {
    if (file) file.buffer = null;
    return mapServiceError(error, res);
  }
}

module.exports = {
  status,
  synthesize,
  recognize,
};
