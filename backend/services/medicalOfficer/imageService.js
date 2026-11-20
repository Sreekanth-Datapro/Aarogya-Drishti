const pool = require("../../db");
const HttpError = require("../../utils/httpError");
const { audit } = require("../../utils/audit");
const { requireActiveClaim, requireConsent, requireUuid } = require("./scope");
const privateImageStorage = require("../privateImageStorage");
const { stripScoreFields } = require("../../utils/screeningAiPresentation");

// ==========================================
// ORAL IMAGE REVIEW
// The browser never receives tbl_screening_photos.private_key or a public URL.
// Every image is retrieved after checking the claim and IMAGE_CAPTURE consent.
// ==========================================

async function listImages(userId, req, patientId) {
  await requireActiveClaim(pool, userId, patientId);
  await requireConsent(pool, patientId, "IMAGE_CAPTURE");

  const { rows } = await pool.query(
    `SELECT ph.id, ph.screening_id, s.screening_date, ph.view_type::text AS view_type,
            ph.annotation_site, ph.mime_type, ph.size_bytes, ph.width_px, ph.height_px,
            ph.metadata_stripped, ph.status::text AS status, ph.captured_at,
            ph.supersedes_photo_id,
            quality.status::text AS quality_status, quality.reason AS quality_reason,
            ai.result_label::text AS ai_result_label, ai.status::text AS ai_status, ai.warning AS ai_warning,
            ai.model_provider AS ai_model_provider,
            ai.model_version AS ai_model_version, ai.analysis_details AS ai_analysis_details,
            EXISTS (
              SELECT 1 FROM tbl_audit_logs enhanced
               WHERE enhanced.resource_type = 'photo'
                 AND enhanced.resource_id = ph.id::text
                 AND enhanced.event = 'PHOTO_AI_ENHANCED'
                 AND enhanced.outcome = 'SUCCESS'
            ) AS enhancement_recorded
       FROM tbl_screening_photos ph
       JOIN tbl_screenings s ON s.id = ph.screening_id
       LEFT JOIN LATERAL (
         SELECT q.status, q.reason FROM tbl_image_quality_results q
          WHERE q.photo_id = ph.id ORDER BY q.checked_at DESC LIMIT 1
       ) quality ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.result_label, a.status, a.warning, a.model_provider,
                a.model_version, a.analysis_details
           FROM tbl_ai_assessments a
          WHERE a.photo_id = ph.id
          ORDER BY a.requested_at DESC, a.attempt_no DESC, a.id DESC
          LIMIT 1
       ) ai ON TRUE
      WHERE ph.patient_id = $1
      ORDER BY s.screening_date DESC, ph.captured_at DESC`,
    [patientId]
  );

  await audit(req, {
    event: "IMAGE_LIST_VIEWED",
    resourceType: "patient",
    resourceId: patientId,
    patientId,
    required: true,
    metadata: { photos: rows.length },
  });
  return Promise.all(rows.map(async (row) => {
    const enhancedAvailable = await privateImageStorage.objectExists(enhancedFilePath(row.screening_id, row.id));
    return {
      ...row,
      ai_analysis_details: stripScoreFields(row.ai_analysis_details),
      size_bytes: Number(row.size_bytes),
      enhancement_status: enhancedAvailable
        ? "AVAILABLE"
        : row.enhancement_recorded ? "UNAVAILABLE" : "NOT_PERFORMED",
    };
  }));
}

// The resolved file must stay inside the private photo folder (no "../" tricks)
function resolvePrivateFile(privateKey) {
  return privateImageStorage.localFilePath(privateKey);
}

function enhancedFilePath(screeningId, photoId) {
  return `enhanced/${screeningId}/${photoId}.jpg`;
}

// Returns { filePath, mimeType } for the controller to stream
async function getImageFile(userId, req, patientId, photoId) {
  requireUuid(photoId, "Invalid image ID");
  await requireActiveClaim(pool, userId, patientId);
  await requireConsent(pool, patientId, "IMAGE_CAPTURE");

  const { rows } = await pool.query(
    "SELECT id, private_key, mime_type FROM tbl_screening_photos WHERE id = $1 AND patient_id = $2",
    [photoId, patientId]
  );
  if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");

  const image = await privateImageStorage.getFile(rows[0].private_key);

  await audit(req, {
    event: "IMAGE_VIEWED",
    resourceType: "photo",
    resourceId: photoId,
    patientId,
    required: true,
  });
  return { ...image, mimeType: rows[0].mime_type };
}

async function getEnhancedImageFile(userId, req, patientId, photoId) {
  requireUuid(photoId, "Invalid image ID");
  await requireActiveClaim(pool, userId, patientId);
  await requireConsent(pool, patientId, "IMAGE_CAPTURE");

  const { rows } = await pool.query(
    `SELECT ph.id, ph.screening_id
       FROM tbl_screening_photos ph
       JOIN tbl_screenings s ON s.id = ph.screening_id
      WHERE ph.id = $1 AND ph.patient_id = $2`,
    [photoId, patientId]
  );
  if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");

  let image;
  try {
    image = await privateImageStorage.getFile(enhancedFilePath(rows[0].screening_id, rows[0].id));
  } catch (error) {
    if (error.code === "IMAGE_FILE_MISSING") {
      throw new HttpError(404, "AI-enhanced image is not available", "IMAGE_FILE_MISSING");
    }
    throw error;
  }

  await audit(req, {
    event: "IMAGE_VIEWED",
    resourceType: "photo",
    resourceId: photoId,
    patientId,
    required: true,
    metadata: { image_version: "AI_ENHANCED" },
  });
  return { ...image, mimeType: "image/jpeg" };
}

module.exports = { listImages, getImageFile, getEnhancedImageFile, resolvePrivateFile };
