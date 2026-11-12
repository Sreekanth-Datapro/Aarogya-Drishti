const { Blob } = require("buffer");
const pool = require("../db");
const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { assertAiPipelineUrlAllowed } = require("../utils/aiPipelineUrl");
const { requireConsent, requireUuid, setActor, withTransaction } = require("./medicalOfficer/scope");
const privateImageStorage = require("./privateImageStorage");

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const VIEW_FIELDS = {
  FRONT_VIEW: "front",
  LEFT_VIEW: "left",
  RIGHT_VIEW: "right",
};
const RESULT_LABELS = {
  NORMAL: "NO_SUSPICIOUS_FINDING_DEMO",
  ABNORMAL: "SUSPICIOUS_FOR_CLINICAL_REVIEW",
  UNCERTAIN: "IMAGE_INSUFFICIENT",
};
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_STATES = new Set(["CONSENTED", "SCREENED"]);
const ANALYSIS_DISCLAIMER = (
  "Preliminary visual screening support only; not a diagnosis and cannot rule out disease. "
  + "A Medical Officer must review the original images and clinical findings."
);

function pipelineBaseUrl() {
  if (typeof config.aiPipeline.authToken !== "string" || config.aiPipeline.authToken.length < 32) {
    throw new HttpError(
      503,
      "AI_PIPELINE_AUTH_TOKEN must be set to the same value (at least 32 characters) in the backend and Python service.",
      "AI_PIPELINE_UNAVAILABLE"
    );
  }
  try {
    const url = assertAiPipelineUrlAllowed(config.aiPipeline.url);
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

async function requestJson(url, options, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error.name === "AbortError" || error.name === "TimeoutError";
    throw new HttpError(
      timedOut ? 504 : 503,
      timedOut ? "AI analysis timed out. The original photos are unchanged." : "AI analysis is temporarily unavailable.",
      timedOut ? "AI_PIPELINE_TIMEOUT" : "AI_PIPELINE_UNAVAILABLE"
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "The AI pipeline returned an invalid response.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  if (!response.ok) {
    // The pipeline's reason stays in the server log; the browser gets a fixed message
    console.warn(`AI pipeline responded ${response.status}: ${String(payload?.detail ?? "").slice(0, 300)}`);
    if (response.status === 504) {
      throw new HttpError(504, "AI analysis timed out. The original photos are unchanged.", "AI_PIPELINE_TIMEOUT");
    }
    const status = response.status === 413 ? 400 : response.status >= 500 ? 503 : 422;
    throw new HttpError(status, "The AI pipeline could not analyze these photos.", "AI_PIPELINE_FAILED");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(502, "The AI pipeline returned an invalid response.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  return payload;
}

async function getPipelineModel(baseUrl) {
  const health = await requestJson(
    new URL("health", baseUrl),
    { method: "GET", headers: { Authorization: `Bearer ${config.aiPipeline.authToken}` } },
    config.aiPipeline.healthTimeoutMs
  );
  const information = health.model_information;
  const allowedProviders = new Set(["ollama-cloud", "cloudflare-workers-ai"]);
  if (health.status !== "healthy"
      || !information
      || !allowedProviders.has(information.provider)
      || typeof information.model_version !== "string"
      || !information.model_version.trim()) {
    throw new HttpError(503, "The configured AI model is unavailable.", "AI_MODEL_UNAVAILABLE");
  }

  const { rows } = await pool.query(
    `SELECT id, provider, model_version
       FROM mst_ai_models
      WHERE provider = $1 AND model_version = $2
        AND is_active = TRUE AND is_research_only = TRUE AND clinical_use = FALSE`,
    [information.provider, information.model_version]
  );
  if (!rows.length) {
    throw new HttpError(503, "The AI model is not registered for non-clinical screening.", "AI_MODEL_UNAVAILABLE");
  }
  return { ...information, id: rows[0].id };
}

async function loadScreeningPhotos(userId, screeningId) {
  const screeningResult = await pool.query(
    `SELECT s.id, s.patient_id, s.case_state::text AS case_state
       FROM tbl_screenings s
      WHERE s.id = $1 AND s.examiner_id = $2
        AND fn_user_has_patient_access($2, s.patient_id)`,
    [screeningId, userId]
  );
  if (!screeningResult.rows.length) {
    throw new HttpError(404, "Screening not found", "SCREENING_NOT_FOUND");
  }
  const screening = screeningResult.rows[0];
  if (!ALLOWED_STATES.has(screening.case_state)) {
    throw new HttpError(409, "AI analysis is only available before the screening is submitted.", "SCREENING_SUBMITTED");
  }

  await requireConsent(pool, screening.patient_id, "IMAGE_CAPTURE");

  const photoResult = await pool.query(
    `SELECT id, annotation_site AS view, private_key, mime_type, size_bytes
       FROM tbl_screening_photos
      WHERE screening_id = $1 AND status <> 'SUPERSEDED'`,
    [screeningId]
  );
  const photosByView = new Map(photoResult.rows.map((photo) => [photo.view, photo]));
  if (photoResult.rows.length !== 3
      || photosByView.size !== 3
      || Object.keys(VIEW_FIELDS).some((view) => !photosByView.has(view))) {
    throw new HttpError(400, "Save the front, left and right photos before requesting AI analysis.", "PHOTOS_REQUIRED");
  }

  // Category was recorded on upload audit metadata; default MOUTH if absent.
  const categoryResult = await pool.query(
    `SELECT DISTINCT ON (resource_id)
            resource_id AS photo_id,
            COALESCE(metadata->>'image_category', 'MOUTH') AS image_category
       FROM tbl_audit_logs
      WHERE event = 'PHOTO_UPLOADED'
        AND resource_type = 'photo'
        AND resource_id = ANY($1::text[])
      ORDER BY resource_id, occurred_at DESC`,
    [photoResult.rows.map((photo) => photo.id)]
  );
  const categoryByPhoto = new Map(
    categoryResult.rows.map((row) => [row.photo_id, String(row.image_category || "MOUTH").toUpperCase()])
  );

  const files = [];
  for (const [view, field] of Object.entries(VIEW_FIELDS)) {
    const photo = photosByView.get(view);
    if (!ALLOWED_IMAGE_TYPES.has(photo.mime_type)) {
      throw new HttpError(400, "A screening photo has an unsupported image type.", "INVALID_IMAGE");
    }
    if (Number(photo.size_bytes) > MAX_PHOTO_BYTES) {
      throw new HttpError(400, "Each photo must be at most 10 MB.", "IMAGE_TOO_LARGE");
    }
    let data;
    try {
      data = await privateImageStorage.downloadBuffer(photo.private_key);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new HttpError(404, "A private screening photo is unavailable.", "IMAGE_FILE_MISSING");
      }
      throw error;
    }
    if (!data.length || data.length > MAX_PHOTO_BYTES) {
      throw new HttpError(400, "Each photo must be at most 10 MB.", "IMAGE_TOO_LARGE");
    }
    files.push({
      ...photo,
      view,
      field,
      data,
      image_category: categoryByPhoto.get(photo.id) || "MOUTH",
    });
  }
  return { screening, files };
}

function validateAnalysis(payload, screeningId, modelInformation) {
  const analysis = payload.analysis;
  if (!analysis
      || analysis.screening_reference !== screeningId
      || analysis.review_status !== "PENDING_MEDICAL_OFFICER_REVIEW"
      || !Array.isArray(analysis.views)
      || analysis.views.length !== 3) {
    throw new HttpError(502, "The AI pipeline returned an invalid screening result.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  const views = new Map();
  for (const result of analysis.views) {
    if (!result || !Object.hasOwn(VIEW_FIELDS, result.view) || views.has(result.view)
        || result.screening_reference !== screeningId
        || !Object.hasOwn(RESULT_LABELS, result.classification)
        || !(result.model_confidence === null
          || (Number.isInteger(result.model_confidence) && result.model_confidence >= 0 && result.model_confidence <= 100))
        || !Array.isArray(result.observations)
        || !result.observations.every((item) => typeof item === "string")
        || !Array.isArray(result.abnormalities)
        || !result.abnormalities.every((item) => typeof item === "string")
        || (result.possible_visual_findings != null && (
          !Array.isArray(result.possible_visual_findings)
          || !result.possible_visual_findings.every((item) => (
            item
            && typeof item === "object"
            && typeof item.feature === "string"
            && ["0", "1", "2", "3", "N/A"].includes(String(item.scale))
          ))
        ))
        || (result.model_status != null
          && !["OK", "NOT_ASSESSABLE", "INVALID_OUTPUT"].includes(result.model_status))
        || (result.selected_category != null
          && !["MOUTH", "TONGUE", "SKIN"].includes(result.selected_category))
        || !result.image_quality
        || !["ACCEPTABLE", "RECAPTURE"].includes(result.image_quality.status)
        || !Array.isArray(result.image_quality.warnings)
        || !result.image_quality.warnings.every((item) => typeof item === "string")
        || !Array.isArray(result.uncertainty_warnings)
        || !result.uncertainty_warnings.every((item) => typeof item === "string")
        || result.review_status !== "PENDING_MEDICAL_OFFICER_REVIEW"
        || typeof result.recommendation !== "string"
        || result.model_information?.model_version !== modelInformation.model_version) {
      throw new HttpError(502, "The AI pipeline returned an invalid screening result.", "AI_PIPELINE_INVALID_RESPONSE");
    }
    views.set(result.view, result);
  }
  if (Object.keys(VIEW_FIELDS).some((view) => !views.has(view))) {
    throw new HttpError(502, "The AI pipeline returned an incomplete screening result.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  return { ...analysis, model_information: modelInformation, views: [...views.values()] };
}

async function sendScreeningForAnalysis(baseUrl, screeningId, files) {
  const form = new FormData();
  form.append("screening_reference", screeningId);
  const categories = [...new Set(files.map((photo) => photo.image_category || "MOUTH"))];
  form.append("category", categories[0] || "MOUTH");
  for (const photo of files) {
    const extension = photo.mime_type.split("/")[1].replace("jpeg", "jpg");
    form.append(photo.field, new Blob([photo.data], { type: photo.mime_type }), `${photo.view.toLowerCase()}.${extension}`);
  }
  return requestJson(
    new URL("api/analyze-screening", baseUrl),
    { method: "POST", body: form, headers: { Authorization: `Bearer ${config.aiPipeline.authToken}` } },
    config.aiPipeline.analysisTimeoutMs
  );
}

async function saveAnalysis(userId, req, screening, files, analysis, modelInformation, elapsedMs) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const currentScreening = await client.query(
      `SELECT s.id, s.patient_id, s.case_state::text AS case_state
         FROM tbl_screenings s
        WHERE s.id = $1 AND s.examiner_id = $2
          AND fn_user_has_patient_access($2, s.patient_id)
        FOR UPDATE`,
      [screening.id, userId]
    );
    if (!currentScreening.rows.length) {
      throw new HttpError(404, "Screening not found", "SCREENING_NOT_FOUND");
    }
    if (!ALLOWED_STATES.has(currentScreening.rows[0].case_state)) {
      throw new HttpError(409, "AI analysis is only available before the screening is submitted.", "SCREENING_SUBMITTED");
    }
    await requireConsent(client, screening.patient_id, "IMAGE_CAPTURE");
    const currentPhotos = await client.query(
      `SELECT id, annotation_site AS view
         FROM tbl_screening_photos
        WHERE screening_id = $1 AND status <> 'SUPERSEDED'
        FOR UPDATE`,
      [screening.id]
    );
    const currentPhotoIds = new Set(currentPhotos.rows.map((photo) => `${photo.view}:${photo.id}`));
    if (files.some((photo) => !currentPhotoIds.has(`${photo.view}:${photo.id}`))
        || currentPhotoIds.size !== files.length) {
      throw new HttpError(409, "Screening photos changed during analysis. Please try again.", "PHOTOS_CHANGED");
    }

    // The screening row lock serializes analysis persistence for this screening.
    const previousAttempts = await client.query(
      `SELECT photo_id, MAX(attempt_no) AS attempt_no
         FROM tbl_ai_assessments
        WHERE screening_id = $1
        GROUP BY photo_id`,
      [screening.id]
    );
    const latestAttemptByPhoto = new Map(
      previousAttempts.rows.map((row) => [row.photo_id, Number(row.attempt_no)])
    );

    const savedViews = [];
    for (const photo of files) {
      const result = analysis.views.find((view) => view.view === photo.view);
      const details = {
        schema_version: 1,
        ...result,
        disclaimer: analysis.disclaimer || ANALYSIS_DISCLAIMER,
      };
      const score = result.model_confidence === null
        ? null
        : Number((result.model_confidence / 100).toFixed(4));
      const { rows } = await client.query(
        `INSERT INTO tbl_ai_assessments
           (screening_id, photo_id, ai_model_id, attempt_no, status, result_label,
            image_quality_status, score, analysis_details, requested_by, completed_at)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7, $8::jsonb, $9, now())
         RETURNING id, photo_id, status::text AS status, result_label::text AS result_label,
                   image_quality_status::text AS image_quality_status, score, model_provider,
                   model_version, warning, completed_at`,
        [
          screening.id,
          photo.id,
          modelInformation.id,
          (latestAttemptByPhoto.get(photo.id) || 0) + 1,
          RESULT_LABELS[result.classification],
          result.image_quality.status,
          score,
          JSON.stringify(details),
          userId,
        ]
      );
      if (!rows.length) throw new Error("AI assessment was not saved.");
      await client.query(
        `INSERT INTO tbl_ai_assessment_logs (assessment_id, event, http_status, latency_ms)
         VALUES ($1, 'COMPLETED', 200, $2)`,
        [rows[0].id, Math.max(0, Math.round(elapsedMs))]
      );
      savedViews.push(rows[0]);
    }
    await audit(req, {
      client,
      required: true,
      event: "AI_SCREENING_ANALYZED",
      resourceType: "screening",
      resourceId: screening.id,
      patientId: screening.patient_id,
      metadata: { photo_count: savedViews.length, model_version: modelInformation.model_version },
    });
    return savedViews;
  });
}

async function analyzeScreening(userId, req, screeningId) {
  requireUuid(screeningId, "Invalid screening ID");
  const { screening, files } = await loadScreeningPhotos(userId, screeningId);
  const baseUrl = pipelineBaseUrl();
  const modelInformation = await getPipelineModel(baseUrl);
  const startedAt = Date.now();
  const payload = await sendScreeningForAnalysis(baseUrl, screeningId, files);
  const analysis = validateAnalysis(payload, screeningId, modelInformation);
  const assessments = await saveAnalysis(
    userId,
    req,
    screening,
    files,
    analysis,
    modelInformation,
    Date.now() - startedAt
  );
  return { ...analysis, assessments };
}

module.exports = { analyzeScreening };
