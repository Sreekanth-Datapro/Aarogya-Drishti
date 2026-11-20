const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { assertAiPipelineUrlAllowed } = require("../utils/aiPipelineUrl");
const sharp = require("sharp");

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FORMATS = Object.freeze({
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
});

function parseMessages(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function validateImage(file) {
  if (!file?.buffer?.length) {
    throw new HttpError(400, "The selected image is empty or invalid.", "CHAT_IMAGE_INVALID");
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Images must be 10 MB or smaller.", "CHAT_IMAGE_TOO_LARGE");
  }

  const expectedFormat = IMAGE_FORMATS[file.mimetype];
  if (!expectedFormat) {
    throw new HttpError(400, "Use a JPEG, PNG, or WEBP image.", "CHAT_IMAGE_TYPE_UNSUPPORTED");
  }

  try {
    const image = sharp(file.buffer, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat) {
      throw new HttpError(400, "The image content does not match its file type.", "CHAT_IMAGE_INVALID");
    }
    await image.stats();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The selected image is invalid or corrupted.", "CHAT_IMAGE_INVALID");
  }
}

async function chat(req, res, next) {
  let messages = parseMessages(req.body?.messages);
  const image = req.file;
  if (image
      && Array.isArray(messages)
      && messages.length
      && messages[messages.length - 1]?.role === "user"
      && typeof messages[messages.length - 1]?.content === "string"
      && !messages[messages.length - 1].content.trim()) {
    messages = messages.map((message, index) => (
      index === messages.length - 1
        ? { ...message, content: "Describe this image." }
        : message
    ));
  }
  const locale = req.body?.locale || "auto";
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return next(new HttpError(400, "Send between 1 and 12 recent chat messages.", "CHAT_MESSAGES_INVALID"));
  }
  if (!["auto", "en", "te"].includes(locale)) {
    return next(new HttpError(400, "Choose Telugu, English, or automatic language detection.", "CHAT_LOCALE_INVALID"));
  }
  if (messages.some((message) => (
    !message
    || !["user", "assistant"].includes(message.role)
    || typeof message.content !== "string"
    || !message.content.trim()
    || message.content.length > MAX_MESSAGE_LENGTH
  ))) {
    return next(new HttpError(400, "Each chat message must contain 1 to 2000 characters.", "CHAT_MESSAGES_INVALID"));
  }
  if (!messages.some((message) => message.role === "user")) {
    return next(new HttpError(400, "A user message is required.", "CHAT_MESSAGES_INVALID"));
  }
  if (image) {
    try {
      await validateImage(image);
    } catch (error) {
      return next(error);
    }
  }
  if (typeof config.aiPipeline.authToken !== "string" || config.aiPipeline.authToken.length < 32) {
    return next(new HttpError(503, "The assistant is temporarily unavailable.", "ASSISTANT_UNAVAILABLE"));
  }

  let url;
  try {
    url = assertAiPipelineUrlAllowed(config.aiPipeline.url);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/assistant/chat`;
  } catch (error) {
    return next(new HttpError(503, error.message || "The assistant is temporarily unavailable.", "ASSISTANT_UNAVAILABLE"));
  }

  try {
    const headers = {
      Authorization: `Bearer ${config.aiPipeline.authToken}`,
    };
    let body;
    if (image) {
      const form = new FormData();
      form.append("messages", JSON.stringify(messages));
      form.append("locale", locale);
      form.append(
        "image",
        new Blob([image.buffer], { type: image.mimetype }),
        "assistant-upload"
      );
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ messages, locale });
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(config.aiPipeline.analysisTimeoutMs),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      return next(new HttpError(502, "The assistant returned an invalid response.", "ASSISTANT_RESPONSE_INVALID"));
    }
    if (!response.ok) {
      const timedOut = response.status === 504;
      return next(new HttpError(
        timedOut ? 504 : 502,
        "The assistant could not get a response. Please try again.",
        timedOut ? "ASSISTANT_TIMEOUT" : "ASSISTANT_PROVIDER_FAILED"
      ));
    }
    if (payload?.status !== "success"
        || typeof payload.reply !== "string"
        || !payload.reply.trim()
        || payload.provider_trace?.inference_performed !== true
        || payload.provider_trace?.model_output_usable !== true
        || payload.model_information?.provider !== "cloudflare-workers-ai"
        || typeof payload.model_information?.model_version !== "string") {
      return next(new HttpError(502, "The assistant returned an unusable response.", "ASSISTANT_RESPONSE_INVALID"));
    }
    return res.json({
      success: true,
      reply: payload.reply.trim(),
      model_information: payload.model_information,
    });
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    return next(new HttpError(
      timedOut ? 504 : 503,
      "The assistant could not get a response. Please try again.",
      timedOut ? "ASSISTANT_TIMEOUT" : "ASSISTANT_UNAVAILABLE"
    ));
  }
}

module.exports = { chat };
