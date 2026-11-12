const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { assertAiPipelineUrlAllowed } = require("../utils/aiPipelineUrl");

const IMAGE_CATEGORIES = Object.freeze(["MOUTH", "TONGUE", "SKIN"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const BLOCKING_STATUSES = new Set(["INVALID_CATEGORY", "POOR_QUALITY", "CORRUPTED_IMAGE"]);

function normalizeCategory(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (raw === "ORAL" || raw === "ORAL_CAVITY" || raw === "MOUTH_ORAL") return "MOUTH";
  if (IMAGE_CATEGORIES.includes(raw)) return raw;
  throw new HttpError(400, "Choose MOUTH, TONGUE or SKIN as the screening image category", "INVALID_IMAGE_CATEGORY");
}

function pipelineBaseUrl() {
  const pipeline = config.aiPipeline || {};
  if (typeof pipeline.authToken !== "string" || pipeline.authToken.length < 32) {
    throw new HttpError(
      503,
      "AI_PIPELINE_AUTH_TOKEN must be set to the same value (at least 32 characters) in the backend and Python service.",
      "AI_PIPELINE_UNAVAILABLE"
    );
  }
  try {
    const url = assertAiPipelineUrlAllowed(pipeline.url || "http://127.0.0.1:8010");
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
    return url;
  } catch (error) {
    throw new HttpError(
      503,
      error.message || "The AI pipeline URL is not allowed.",
      "AI_PIPELINE_UNAVAILABLE"
    );
  }
}

function localFileGate(file) {
  if (!file?.buffer?.length) {
    return {
      status: "CORRUPTED_IMAGE",
      expected_category: null,
      detected_category: null,
      confidence: null,
      reason: "Choose a photo to upload",
      image_quality: null,
      clinical_note: "Suitability check only. Not a diagnosis.",
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      status: "CORRUPTED_IMAGE",
      expected_category: null,
      detected_category: null,
      confidence: null,
      reason: "Each photo must be at most 10 MB",
      image_quality: null,
      clinical_note: "Suitability check only. Not a diagnosis.",
    };
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return {
      status: "CORRUPTED_IMAGE",
      expected_category: null,
      detected_category: null,
      confidence: null,
      reason: "Only JPG, PNG and WEBP photos can be uploaded",
      image_quality: null,
      clinical_note: "Suitability check only. Not a diagnosis.",
    };
  }
  return null;
}

async function callPipelineValidation(file, category) {
  const baseUrl = pipelineBaseUrl();
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype });
  form.append("file", blob, file.originalname || "screening-photo.jpg");
  form.append("category", category);

  let response;
  try {
    response = await fetch(new URL("api/validate-screening-image", baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.aiPipeline.authToken}` },
      body: form,
      signal: AbortSignal.timeout((config.aiPipeline && config.aiPipeline.analysisTimeoutMs) || 600000),
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const timedOut = error.name === "AbortError" || error.name === "TimeoutError";
    throw new HttpError(
      timedOut ? 504 : 503,
      timedOut
        ? "Image validation timed out. The photo was not saved."
        : "Image validation is temporarily unavailable.",
      timedOut ? "AI_PIPELINE_TIMEOUT" : "AI_PIPELINE_UNAVAILABLE"
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "The AI pipeline returned an invalid validation response.", "AI_PIPELINE_INVALID_RESPONSE");
  }

  if (!response.ok) {
    const detail = String(payload?.detail || "");
    if (response.status === 400) {
      throw new HttpError(400, detail || "Image validation failed", "INVALID_IMAGE");
    }
    throw new HttpError(503, "The AI pipeline could not validate this photo.", "AI_PIPELINE_FAILED");
  }

  const validation = payload?.validation;
  if (!validation || typeof validation !== "object" || !validation.status) {
    throw new HttpError(502, "The AI pipeline returned an invalid validation response.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  return {
    ...validation,
    expected_category: validation.expected_category || category,
    disclaimer: payload.disclaimer || null,
  };
}

/**
 * Validates screening image suitability for MOUTH / TONGUE / SKIN.
 * Blocking statuses must not be saved for screening submission.
 */
async function validateScreeningImage(file, categoryInput) {
  const category = normalizeCategory(categoryInput || "MOUTH");
  const local = localFileGate(file);
  if (local) {
    return { ...local, expected_category: category };
  }

  try {
    return await callPipelineValidation(file, category);
  } catch (error) {
    // Pipeline outage or missing token: do not invent a category match.
    // Allow upload only as NEEDS_REVIEW for authorized human confirmation.
    if (
      error instanceof HttpError
      && ["AI_PIPELINE_UNAVAILABLE", "AI_PIPELINE_TIMEOUT", "AI_PIPELINE_FAILED", "AI_PIPELINE_INVALID_RESPONSE"].includes(error.code)
    ) {
      // Fail closed: without a live category check, unrelated images must not be saved.
      return {
        status: "NEEDS_REVIEW",
        expected_category: category,
        detected_category: "UNCERTAIN",
        confidence: 0,
        reason: "Automated category check is unavailable; the photo was not accepted for screening.",
        image_quality: null,
        clinical_note: "Suitability check only. Not a diagnosis.",
        upload_allowed: false,
      };
    }
    throw error;
  }
}

function canUploadValidation(validation) {
  if (!validation || typeof validation !== "object") return false;
  // Only an explicit VALID category match may be saved for screening.
  if (validation.status !== "VALID") return false;
  if (typeof validation.upload_allowed === "boolean") return validation.upload_allowed;
  return true;
}

function assertUploadAllowed(validation) {
  if (!validation) return;
  if (canUploadValidation(validation)) return;
  if (BLOCKING_STATUSES.has(validation.status)) {
    throw new HttpError(
      422,
      validation.reason || "This photo is not suitable for screening.",
      validation.status
    );
  }
  throw new HttpError(
    422,
    validation.reason || "This photo needs a successful category check before screening use.",
    validation.status || "NEEDS_REVIEW"
  );
}

module.exports = {
  IMAGE_CATEGORIES,
  MAX_PHOTO_BYTES,
  BLOCKING_STATUSES,
  normalizeCategory,
  validateScreeningImage,
  canUploadValidation,
  assertUploadAllowed,
  localFileGate,
};
