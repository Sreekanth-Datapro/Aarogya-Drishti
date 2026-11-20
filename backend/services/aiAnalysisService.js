const { Blob } = require("buffer");
const { createHash } = require("crypto");
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
const CATEGORY_FEATURES = {
  MOUTH: [
    "VISIBLE_REDNESS",
    "POSSIBLE_SWELLING",
    "WHITE_OR_RED_PATCHES",
    "VISIBLE_ULCERS",
    "GUM_APPEARANCE_CHANGES",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
  TONGUE: [
    "WHITE_COATING",
    "REDNESS",
    "VISIBLE_SORES",
    "SURFACE_CHANGES",
    "SWELLING",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
  SKIN: [
    "REDNESS",
    "VISIBLE_RASH",
    "PIGMENTATION_CHANGES",
    "SWELLING",
    "DRY_SCALY_APPEARANCE",
    "VISIBLE_SORES",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
};
const SAFE_AI_ERROR_CODES = new Set([
  "QUALITY_GATE_SKIPPED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_REQUEST_FAILED",
  "PROVIDER_HTTP_ERROR",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_RESPONSE_INVALID",
  "PROVIDER_RESPONSE_EMPTY",
  "PROVIDER_TRACE_MISSING",
  "MODEL_OUTPUT_INVALID",
  "MODEL_NOT_ASSESSABLE",
]);
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

function logAiFlow(event, details = {}) {
  if (config.nodeEnv !== "test") {
    console.info(`[oral-screening-ai] ${event}`, details);
  }
}

function screeningLogReference(screeningId) {
  return createHash("sha256").update(screeningId).digest("hex").slice(0, 12);
}

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
  logAiFlow("python_request_sent", { method: options.method || "GET", path: url.pathname });
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logAiFlow("python_request_failed", {
      path: url.pathname,
      error: error.name || "RequestError",
    });
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
    logAiFlow("python_response_parse_failed", { path: url.pathname, status: response.status });
    throw new HttpError(502, "The AI pipeline returned an invalid response.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  logAiFlow("python_response_received", { path: url.pathname, status: response.status });
  if (!response.ok) {
    console.warn("[oral-screening-ai] python_request_non_success", {
      status: response.status,
      errorCode: response.status === 504 ? "AI_PIPELINE_TIMEOUT" : "AI_PIPELINE_FAILED",
    });
    if (response.status === 504) {
      throw new HttpError(504, "AI analysis timed out. The original photos are unchanged.", "AI_PIPELINE_TIMEOUT");
    }
    const status = response.status === 413 ? 400 : response.status >= 500 ? 503 : 422;
    throw new HttpError(status, "The AI pipeline could not analyze these photos.", "AI_PIPELINE_FAILED");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(502, "The AI pipeline returned an invalid response.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  logAiFlow("python_response_json_parsed", { path: url.pathname });
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
      || !information.model_version.trim()
      || typeof information.validation_status !== "string"
      || information.trained_oral_model !== false) {
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
    `SELECT s.id, s.patient_id, s.screening_date, s.case_state::text AS case_state
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
  if (!photoResult.rows.length) {
    throw new HttpError(400, "Save at least one photo before requesting AI analysis.", "PHOTOS_REQUIRED");
  }
  if (photoResult.rows.length > Object.keys(VIEW_FIELDS).length
      || photosByView.size !== photoResult.rows.length
      || photoResult.rows.some((photo) => !Object.hasOwn(VIEW_FIELDS, photo.view))) {
    throw new HttpError(409, "The screening photos do not have unique supported views.", "INVALID_PHOTO_VIEWS");
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
    if (!photo) continue;
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

function validateAnalysis(payload, screeningId, modelInformation, files) {
  const analysis = payload.analysis;
  if (!analysis
      || analysis.screening_reference !== screeningId
      || analysis.review_status !== "PENDING_MEDICAL_OFFICER_REVIEW"
      || analysis.model_information?.provider !== modelInformation.provider
      || analysis.model_information?.model_version !== modelInformation.model_version
      || analysis.model_information?.validation_status !== modelInformation.validation_status
      || !Array.isArray(analysis.views)
      || analysis.views.length !== files.length) {
    throw new HttpError(502, "The AI pipeline returned an invalid screening result.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  const expectedViews = new Set(files.map((photo) => photo.view));
  const screeningRef = screeningLogReference(screeningId);
  const photoByView = new Map(files.map((photo) => [photo.view, photo]));
  const views = new Map();
  for (const result of analysis.views) {
    if (!result || !expectedViews.has(result.view) || views.has(result.view)
        || result.screening_reference !== screeningId
        || !Object.hasOwn(RESULT_LABELS, result.classification)
        || !["COMPLETED", "FAILED"].includes(result.analysis_status)
        || typeof result.analyzed_at !== "string"
        || !Number.isFinite(Date.parse(result.analyzed_at))
        || (result.error_code != null && !SAFE_AI_ERROR_CODES.has(result.error_code))
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
          && !["OK", "NOT_ASSESSABLE", "INVALID_OUTPUT", "ANALYSIS_FAILED"].includes(result.model_status))
        || (result.selected_category != null
          && !["MOUTH", "TONGUE", "SKIN"].includes(result.selected_category))
        || result.selected_category !== photoByView.get(result.view).image_category
        || !result.image_quality
        || !["ACCEPTABLE", "RECAPTURE"].includes(result.image_quality.status)
        || !Array.isArray(result.image_quality.warnings)
        || !result.image_quality.warnings.every((item) => typeof item === "string")
        || !Array.isArray(result.uncertainty_warnings)
        || !result.uncertainty_warnings.every((item) => typeof item === "string")
        || result.review_status !== "PENDING_MEDICAL_OFFICER_REVIEW"
        || typeof result.recommendation !== "string"
        || result.model_information?.provider !== modelInformation.provider
        || result.model_information?.model_version !== modelInformation.model_version
        || result.model_information?.validation_status !== modelInformation.validation_status
        || result.model_information?.trained_oral_model !== false
        || result.model_information?.error_code !== result.error_code
        || !["provider_request_started", "provider_request_success", "provider_response_received",
          "provider_response_validated", "inference_performed", "model_output_usable"]
          .every((field) => typeof result.model_information?.[field] === "boolean")
        || (result.model_information?.inference_duration_ms != null
          && (!Number.isInteger(result.model_information.inference_duration_ms)
            || result.model_information.inference_duration_ms < 0))
        || !(result.model_information?.provider_http_status === null
          || (Number.isInteger(result.model_information?.provider_http_status)
            && result.model_information.provider_http_status >= 100
            && result.model_information.provider_http_status <= 599))) {
      throw new HttpError(502, "The AI pipeline returned an invalid screening result.", "AI_PIPELINE_INVALID_RESPONSE");
    }
    const metadata = result.model_information;
    const inferencePerformed = metadata.provider_request_success && metadata.provider_response_received;
    const outputUsable = metadata.provider_request_started
      && inferencePerformed
      && metadata.provider_response_validated
      && metadata.model_output_usable;
    const expectedFeatures = CATEGORY_FEATURES[result.selected_category];
    const findings = result.possible_visual_findings;
    const uniqueFeatures = new Set(Array.isArray(findings) ? findings.map((item) => item.feature) : []);
    const structuredFindingsValid = Array.isArray(findings)
      && Array.isArray(expectedFeatures)
      && findings.length === expectedFeatures.length
      && uniqueFeatures.size === expectedFeatures.length
      && expectedFeatures.every((feature) => uniqueFeatures.has(feature))
      && findings.every((item) => ["0", "1", "2", "3"].includes(String(item.scale))
        && (item.note == null || typeof item.note === "string"));
    const hasObservedFinding = Array.isArray(findings)
      && findings.some((item) => ["1", "2", "3"].includes(String(item.scale)));
    const successfulResult = result.analysis_status === "COMPLETED";
    if (metadata.inference_performed !== inferencePerformed
        || ((metadata.provider_request_success || metadata.provider_response_received)
          && !metadata.provider_request_started)
        || (metadata.provider_response_validated && !inferencePerformed)
        || (metadata.provider_response_validated
          && !(metadata.provider_http_status >= 200 && metadata.provider_http_status < 300))
        || (metadata.model_output_usable && !metadata.provider_response_validated)
        || (successfulResult && (
          result.model_status !== "OK"
          || !outputUsable
          || !structuredFindingsValid
          || result.image_quality.status !== "ACCEPTABLE"
          || result.image_quality.warnings.length > 0
          || !["NORMAL", "ABNORMAL"].includes(result.classification)
          || result.classification !== (hasObservedFinding ? "ABNORMAL" : "NORMAL")
          || result.error_code != null
        ))
        || (!successfulResult && (
          !["NOT_ASSESSABLE", "INVALID_OUTPUT", "ANALYSIS_FAILED"].includes(result.model_status)
          || metadata.model_output_usable
          || !Array.isArray(findings)
          || findings.length !== 0
          || result.observations.length !== 0
          || result.abnormalities.length !== 0
          || result.classification !== "UNCERTAIN"
          || !SAFE_AI_ERROR_CODES.has(result.error_code)
        ))
        || (result.model_status === "OK" && !successfulResult)
        || (result.model_status === "ANALYSIS_FAILED" && metadata.provider_response_validated)) {
      throw new HttpError(502, "The AI pipeline returned an inconsistent screening status.", "AI_PIPELINE_INVALID_RESPONSE");
    }
    const reportableResult = { ...result };
    for (const field of [
      "confidence",
      "confidence_meaning",
      "criterion_scores",
      "image_quality_score",
      "model_confidence",
      "observation_confidence",
      "overall_clinical_score",
      "overall_clinical_score_message",
      "raw_model_confidence",
      "score",
      "visual_health_assessment_score",
      "visual_health_assessment_score_message",
      "visual_health_assessment_score_reasons",
      "visual_health_assessment_unassessable",
    ]) {
      delete reportableResult[field];
    }
    reportableResult.image_quality = {
      status: result.image_quality.status,
      warnings: result.image_quality.warnings,
      model_assessment: result.image_quality.model_assessment,
    };
    views.set(result.view, {
      ...reportableResult,
      analysis_status: result.analysis_status,
      photo_id: photoByView.get(result.view).id,
      selected_category: photoByView.get(result.view).image_category || result.selected_category || "MOUTH",
    });
  }
  if ([...expectedViews].some((view) => !views.has(view))) {
    throw new HttpError(502, "The AI pipeline returned an incomplete screening result.", "AI_PIPELINE_INVALID_RESPONSE");
  }
  logAiFlow("analysis_response_validated", {
    screeningRef,
    provider: modelInformation.provider,
    model: modelInformation.model_version,
    imageCount: files.length,
    views: [...views.values()].map(({ view, analysis_status, model_status, model_information }) => ({
      view,
      analysisStatus: analysis_status,
      modelStatus: model_status,
      inferencePerformed: model_information.inference_performed,
      modelOutputUsable: model_information.model_output_usable,
      inferenceDurationMs: model_information.inference_duration_ms ?? null,
    })),
  });
  return {
    ...analysis,
    model_information: modelInformation,
    views: files.map((photo) => views.get(photo.view)),
  };
}

async function sendScreeningForAnalysis(baseUrl, screeningId, files) {
  const form = new FormData();
  form.append("screening_reference", screeningId);
  form.append("category", "MOUTH");
  for (const photo of files) {
    const extension = photo.mime_type.split("/")[1].replace("jpeg", "jpg");
    form.append(photo.field, new Blob([photo.data], { type: photo.mime_type }), `${photo.view.toLowerCase()}.${extension}`);
    form.append(`${photo.field}_category`, photo.image_category || "MOUTH");
  }
  logAiFlow("ai_provider_request_starting", {
    screeningRef: screeningLogReference(screeningId),
    target: "python-fastapi",
    endpoint: new URL("api/analyze-screening", baseUrl).pathname,
    method: "POST",
    images: files.map(({ view, data }) => ({ view, bytes: data.length })),
  });
  return requestJson(
    new URL("api/analyze-screening", baseUrl),
    { method: "POST", body: form, headers: { Authorization: `Bearer ${config.aiPipeline.authToken}` } },
    config.aiPipeline.analysisTimeoutMs
  );
}

async function saveAnalysis(userId, req, screening, files, analysis, modelInformation, elapsedMs) {
  const savedViews = await withTransaction(pool, async (client) => {
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
      const failed = result.analysis_status !== "COMPLETED";
      const assessmentStatus = failed ? "FAILED" : "COMPLETED";
      const resultLabel = failed ? null : RESULT_LABELS[result.classification];
      const { rows } = await client.query(
        `INSERT INTO tbl_ai_assessments
           (screening_id, photo_id, ai_model_id, attempt_no, status, result_label,
            image_quality_status, score, analysis_details, error_code, requested_by, completed_at)
         VALUES ($1, $2, $3, $4, $5::ai_status, $6, $7::quality_status, NULL, $8::jsonb, $9, $10, now())
         RETURNING id, photo_id, status::text AS status, result_label::text AS result_label,
                   image_quality_status::text AS image_quality_status, model_provider,
                   model_version, warning, completed_at`,
        [
          screening.id,
          photo.id,
          modelInformation.id,
          (latestAttemptByPhoto.get(photo.id) || 0) + 1,
          assessmentStatus,
          resultLabel,
          result.image_quality.status,
          JSON.stringify(details),
          result.error_code,
          userId,
        ]
      );
      if (!rows.length) throw new Error("AI assessment was not saved.");
      await client.query(
        `INSERT INTO tbl_ai_assessment_logs (assessment_id, event, http_status, latency_ms)
         VALUES ($1, $2, $3, $4)`,
        [
          rows[0].id,
          failed ? "FAILED" : "COMPLETED",
          failed ? 502 : 200,
          Math.max(0, Math.round(elapsedMs)),
        ]
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
      metadata: {
        photo_count: savedViews.length,
        failed_photo_count: analysis.views.filter((view) => view.analysis_status === "FAILED").length,
        model_version: modelInformation.model_version,
      },
    });
    return savedViews;
  });
  logAiFlow("database_save_completed", {
    screeningRef: screeningLogReference(screening.id),
    provider: modelInformation.provider,
    model: modelInformation.model_version,
    imageCount: savedViews.length,
    statuses: savedViews.map(({ status }) => status),
    views: analysis.views.map(({ view, analysis_status, model_status, model_information }) => ({
      view,
      analysisStatus: analysis_status,
      modelStatus: model_status,
      inferencePerformed: model_information.inference_performed,
      modelOutputUsable: model_information.model_output_usable,
      inferenceDurationMs: model_information.inference_duration_ms ?? null,
    })),
  });
  return savedViews;
}

async function analyzeScreening(userId, req, screeningId) {
  logAiFlow("request_received", {
    endpoint: "POST /api/screenings/:id/analyze",
    screeningRef: screeningLogReference(screeningId),
  });
  requireUuid(screeningId, "Invalid screening ID");
  const { screening, files } = await loadScreeningPhotos(userId, screeningId);
  logAiFlow("images_received", {
    screeningRef: screeningLogReference(screeningId),
    imageCount: files.length,
    images: files.map(({ view, data, image_category }) => ({
      view,
      bytes: data.length,
      category: image_category,
    })),
  });
  const baseUrl = pipelineBaseUrl();
  const modelInformation = await getPipelineModel(baseUrl);
  const startedAt = Date.now();
  const payload = await sendScreeningForAnalysis(baseUrl, screeningId, files);
  const analysis = validateAnalysis(payload, screeningId, modelInformation, files);
  logAiFlow("response_parsing_completed", {
    screeningRef: screeningLogReference(screeningId),
    provider: modelInformation.provider,
    model: modelInformation.model_version,
    imageCount: analysis.views.length,
    views: analysis.views.map(({ view, analysis_status, model_status, model_information }) => ({
      view,
      analysisStatus: analysis_status,
      modelStatus: model_status,
      inferencePerformed: model_information.inference_performed,
      modelOutputUsable: model_information.model_output_usable,
      inferenceDurationMs: model_information.inference_duration_ms ?? null,
    })),
  });
  const assessments = await saveAnalysis(
    userId,
    req,
    screening,
    files,
    analysis,
    modelInformation,
    Date.now() - startedAt
  );
  logAiFlow("screening_flow_completed", {
    screeningRef: screeningLogReference(screeningId),
    imageCount: analysis.views.length,
    failedImageCount: analysis.views.filter((view) => view.analysis_status !== "COMPLETED").length,
  });
  return { ...analysis, assessments };
}

module.exports = { analyzeScreening };
