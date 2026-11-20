const crypto = require("crypto");
const pool = require("../../db");
const HttpError = require("../../utils/httpError");
const { audit } = require("../../utils/audit");
const { stripScoreFields } = require("../../utils/screeningAiPresentation");
const { activeScreeningOrder } = require("../../utils/screeningSelection");
const {
  hasConsent,
  mandalScope,
  pageOptions,
  pagination,
  requireActiveClaim,
  requireConsent,
  requireUuid,
  setActor,
  withTransaction,
} = require("./scope");

// ==========================================
// CLINICAL REVIEW (tbl_clinical_reviews)
// Database rules that protect signed records (already in the schema):
//  - fn_review_guard: every update must raise version by exactly 1, a signed
//    review keeps its doctor, and amending a signed review needs a new reason
//  - fn_review_snapshot: every version is copied to tbl_clinical_review_versions
//  - fn_check_case_transition: a case becomes REVIEWED only with a signed review
// AI output is shown separately and is never written as the clinical finding.
// ==========================================

const DECISIONS = [
  "NO_ACTION",
  "ROUTINE_FOLLOW_UP",
  "RESCREEN",
  "REQUEST_RECAPTURE",
  "REQUEST_MORE_INFO",
  "SPECIALIST_REVIEW",
  "URGENT_REFERRAL",
];
const AI_AGREEMENTS = ["NOT_AVAILABLE", "AGREE", "DISAGREE", "DEFER"];
// These decisions send the case back to the Health Worker (AWAITING_CLINICIAN -> SCREENED)
const RETURN_TO_HEALTH_WORKER = ["RESCREEN", "REQUEST_RECAPTURE", "REQUEST_MORE_INFO"];
const REFERRAL_DECISIONS = ["SPECIALIST_REVIEW", "URGENT_REFERRAL"];

function optionalText(value, max, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text`, "INVALID_REVIEW");
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${label} is too long`, "INVALID_REVIEW");
  return text || null;
}

function normalizeReview(input = {}) {
  const finding = optionalText(input.finding, 4000, "Clinical finding");
  if (!finding) throw new HttpError(400, "Clinical finding is required", "INVALID_REVIEW");
  const aiAgreement = input.ai_agreement || "NOT_AVAILABLE";
  if (!AI_AGREEMENTS.includes(aiAgreement)) throw new HttpError(400, "Invalid AI agreement", "INVALID_REVIEW");
  const decision = input.decision || null;
  if (decision && !DECISIONS.includes(decision)) throw new HttpError(400, "Invalid clinical decision", "INVALID_REVIEW");
  const aiAssessmentId = input.ai_assessment_id ? requireUuid(input.ai_assessment_id, "Invalid AI assessment") : null;
  if (aiAgreement !== "NOT_AVAILABLE" && !aiAssessmentId) {
    throw new HttpError(400, "Select the AI result you compared with", "INVALID_REVIEW");
  }
  return {
    finding,
    impression: optionalText(input.impression, 4000, "Impression"),
    aiAssessmentId,
    aiAgreement,
    aiDiscrepancyNote: optionalText(input.ai_discrepancy_note, 2000, "AI discrepancy note"),
    decision,
    followupInstructions: optionalText(input.followup_instructions, 2000, "Follow-up instructions"),
    referralReason: optionalText(input.referral_reason, 2000, "Referral reason"),
    requestNote: optionalText(input.request_note, 2000, "Request note"),
  };
}

// Checks needed before a review can be signed
function assertSignable(review) {
  if (!review.decision) throw new HttpError(400, "Choose a clinical decision before signing", "DECISION_REQUIRED");
  if (review.ai_agreement === "DISAGREE" && !review.ai_discrepancy_note) {
    throw new HttpError(400, "Explain why you disagree with the AI result", "INVALID_REVIEW");
  }
  if (["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(review.decision) && !review.request_note) {
    throw new HttpError(400, "Describe what the Health Worker must provide", "INVALID_REVIEW");
  }
  if (REFERRAL_DECISIONS.includes(review.decision) && !review.referral_reason) {
    throw new HttpError(400, "A referral reason is required for this decision", "INVALID_REVIEW");
  }
  if (review.decision === "ROUTINE_FOLLOW_UP" && !review.followup_instructions) {
    throw new HttpError(400, "Follow-up instructions are required for this decision", "INVALID_REVIEW");
  }
}

function signatureHash(review, userId, signedAt) {
  const content = JSON.stringify({
    review_id: review.id,
    version: review.version,
    doctor_id: userId,
    finding: review.finding,
    impression: review.impression,
    decision: review.decision,
    signed_at: signedAt,
  });
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function latestScreening(db, patientId, lock = false) {
  const { rows } = await db.query(
    `SELECT screening.id, screening.screening_date, screening.case_state::text AS case_state,
            screening.chief_complaint, screening.tobacco_current,
            screening.clinical_exam_done, screening.notes, screening.submitted_at, screening.facility_id
       FROM tbl_screenings screening
      WHERE screening.patient_id = $1
      ORDER BY ${activeScreeningOrder("screening")}
      LIMIT 1
      ${lock ? "FOR UPDATE" : ""}`,
    [patientId]
  );
  return rows[0] || null;
}

async function reviewForScreening(db, screeningId, lock = false) {
  const { rows } = await db.query(
    `SELECT id, screening_id, patient_id, doctor_id, finding, impression, ai_assessment_id,
            ai_agreement::text AS ai_agreement, ai_discrepancy_note, decision::text AS decision,
            followup_instructions, referral_reason, request_note, version, amendment_reason,
            signed_at, created_at, updated_at
       FROM tbl_clinical_reviews
      WHERE screening_id = $1
      ${lock ? "FOR UPDATE" : ""}`,
    [screeningId]
  );
  return rows[0] || null;
}

// Everything the MO may see for a claimed patient
async function getCaseContext(userId, req, patientId) {
  const claim = await requireActiveClaim(pool, userId, patientId);
  const screeningConsent = await hasConsent(pool, patientId, "SCREENING");
  const imageConsent = await hasConsent(pool, patientId, "IMAGE_CAPTURE");

  const [patient, consents, screening] = await Promise.all([
    pool.query(
      `SELECT p.id, p.patient_code,
              CASE WHEN $2 IS TRUE THEN p.full_name END AS full_name,
              CASE WHEN $2 IS TRUE THEN p.sex::text END AS sex,
              CASE WHEN $2 IS TRUE
                   THEN COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int)
              END AS age_years,
              CASE WHEN $2 IS TRUE THEN p.created_at END AS registered_at,
              CASE WHEN $2 IS TRUE THEN pv.name_en END AS village_name,
              CASE WHEN $2 IS TRUE THEN pv.name_te END AS village_name_te,
              CASE WHEN $2 IS TRUE THEN pm.name_en END AS mandal_name,
              CASE WHEN $2 IS TRUE THEN pm.name_te END AS mandal_name_te,
              CASE WHEN $2 IS TRUE THEN pf.name_en END AS facility_name,
              CASE WHEN $2 IS TRUE THEN pf.name_te END AS facility_name_te
         FROM tbl_patients p
         JOIN mst_villages pv ON pv.id = p.village_id
         JOIN mst_mandals pm ON pm.id = pv.mandal_id
         JOIN mst_facilities pf ON pf.id = p.registered_facility_id
        WHERE p.id = $1`,
      [patientId, screeningConsent]
    ),
    pool.query(
      `SELECT cp.code AS purpose, cp.name_en AS purpose_name, cp.name_te AS purpose_name_te,
              pc.granted, pc.consent_version, pc.method::text AS method, pc.captured_at
         FROM tbl_patient_consents pc
         JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
        WHERE pc.patient_id = $1
        ORDER BY pc.consent_seq DESC`,
      [patientId]
    ),
    latestScreening(pool, patientId),
  ]);

  let findings = [];
  let histories = [];
  let aiResults = [];
  let screeningPhotos = [];
  let review = null;
  let screeningDetails = null;

  if (screening && screeningConsent) {
    screeningDetails = screening;
    const [findingRows, historyRows, aiRows, photoRows, reviewRow] = await Promise.all([
      pool.query(
        `SELECT f.id, f.finding_kind::text AS finding_kind, f.oral_site::text AS oral_site,
                f.description, f.duration_days, f.recorded_at,
                sym.name_en AS symptom_name, sym.name_te AS symptom_name_te
           FROM tbl_screening_findings f
           LEFT JOIN mst_symptoms sym ON sym.id = f.symptom_id
          WHERE f.screening_id = $1
          ORDER BY f.recorded_at`,
        [screening.id]
      ),
      pool.query(
        `SELECT h.history_kind::text AS history_kind, h.condition_text, h.duration_years,
                h.frequency_per_day, h.is_current, h.event_date,
                e.name_en AS exposure_name, e.name_te AS exposure_name_te
           FROM tbl_patient_medical_histories h
           LEFT JOIN mst_exposure_types e ON e.id = h.exposure_type_id
          WHERE h.patient_id = $1
          ORDER BY h.recorded_at DESC`,
        [patientId]
      ),
      imageConsent ? pool.query(
        `SELECT id, photo_id, status, result_label, image_quality_status,
                warning, model_provider, model_version, analysis_details, completed_at
           FROM (
             SELECT DISTINCT ON (photo_id)
                    id, photo_id, status::text AS status,
                    result_label::text AS result_label,
                    image_quality_status::text AS image_quality_status,
                    warning, model_provider, model_version,
                    analysis_details, completed_at, requested_at, attempt_no
               FROM tbl_ai_assessments
              WHERE screening_id = $1
              ORDER BY photo_id, requested_at DESC, attempt_no DESC, id DESC
           ) latest
          ORDER BY requested_at DESC, attempt_no DESC, id DESC`,
        [screening.id]
      ) : Promise.resolve({ rows: [] }),
      imageConsent ? pool.query(
        `SELECT ph.id, ph.annotation_site::text AS view, ph.captured_at,
                quality.status::text AS image_quality_status
           FROM tbl_screening_photos ph
           LEFT JOIN LATERAL (
             SELECT q.status
               FROM tbl_image_quality_results q
              WHERE q.photo_id = ph.id
              ORDER BY q.checked_at DESC
              LIMIT 1
           ) quality ON TRUE
          WHERE ph.screening_id = $1 AND ph.status <> 'SUPERSEDED'
          ORDER BY ph.captured_at, ph.id`,
        [screening.id]
      ) : Promise.resolve({ rows: [] }),
      reviewForScreening(pool, screening.id),
    ]);
    findings = findingRows.rows;
    histories = historyRows.rows;
    aiResults = aiRows.rows.map((row) => ({
      ...row,
      analysis_details: stripScoreFields(row.analysis_details),
    }));
    screeningPhotos = photoRows.rows;
    review = reviewRow;
  }

  const timeline = screeningConsent
    ? await pool.query(
      `SELECT event_time, event_type, resource_type, detail_code
         FROM vw_patient_timeline
        WHERE patient_id = $1
        ORDER BY event_time DESC
        LIMIT 50`,
      [patientId]
    )
    : { rows: [] };

  const patientDetails = patient.rows[0] || null;
  if (patientDetails && !screeningConsent) {
    Object.assign(patientDetails, {
      full_name: null,
      sex: null,
      age_years: null,
      registered_at: null,
      village_name: null,
      village_name_te: null,
      mandal_name: null,
      mandal_name_te: null,
      facility_name: null,
      facility_name_te: null,
    });
  }

  await audit(req, {
    event: "CLINICAL_PROFILE_VIEWED",
    resourceType: "patient",
    resourceId: patientId,
    patientId,
    required: true,
  });

  return {
    claim: { claimed_at: claim.claimed_at },
    patient: patientDetails,
    consent: { screening: screeningConsent, image_capture: imageConsent, history: consents.rows },
    screening: screeningDetails,
    screening_hidden: Boolean(screening) && !screeningConsent,
    findings,
    histories,
    ai_results: aiResults,
    photos: screeningPhotos,
    review,
    timeline: timeline.rows,
  };
}

// Save (create or update) the unsigned draft for the claimed patient's latest screening
async function saveDraft(userId, req, patientId, input) {
  const data = normalizeReview(input);
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await requireActiveClaim(client, userId, patientId, { lock: true });
    await requireConsent(client, patientId, "SCREENING");
    const screening = await latestScreening(client, patientId, true);
    if (!screening || screening.case_state !== "AWAITING_CLINICIAN") {
      throw new HttpError(409, "This screening is not waiting for clinical review", "NOT_AWAITING_REVIEW");
    }
    if (data.aiAssessmentId) {
      const ai = await client.query(
        "SELECT 1 FROM tbl_ai_assessments WHERE id = $1 AND screening_id = $2",
        [data.aiAssessmentId, screening.id]
      );
      if (!ai.rows.length) throw new HttpError(400, "The AI result does not belong to this screening", "INVALID_REVIEW");
    }

    const existing = await reviewForScreening(client, screening.id, true);
    let saved;
    if (!existing) {
      const inserted = await client.query(
        `INSERT INTO tbl_clinical_reviews
           (screening_id, patient_id, doctor_id, finding, impression, ai_assessment_id, ai_agreement,
            ai_discrepancy_note, decision, followup_instructions, referral_reason, request_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, version`,
        [screening.id, patientId, userId, data.finding, data.impression, data.aiAssessmentId, data.aiAgreement,
          data.aiDiscrepancyNote, data.decision, data.followupInstructions, data.referralReason, data.requestNote]
      );
      saved = inserted.rows[0];
    } else {
      if (existing.signed_at) {
        throw new HttpError(409, "This review is signed. Use an amendment to change it.", "REVIEW_SIGNED");
      }
      if (existing.doctor_id !== userId) {
        throw new HttpError(403, "This draft belongs to another Medical Officer", "REVIEW_NOT_OWNED");
      }
      if (Number(input.version) !== Number(existing.version)) {
        throw new HttpError(409, "The review was changed elsewhere. Reload and try again.", "VERSION_CONFLICT");
      }
      const updated = await client.query(
        `UPDATE tbl_clinical_reviews
            SET finding=$1, impression=$2, ai_assessment_id=$3, ai_agreement=$4, ai_discrepancy_note=$5,
                decision=$6, followup_instructions=$7, referral_reason=$8, request_note=$9,
                version = version + 1
          WHERE id = $10
          RETURNING id, version`,
        [data.finding, data.impression, data.aiAssessmentId, data.aiAgreement, data.aiDiscrepancyNote,
          data.decision, data.followupInstructions, data.referralReason, data.requestNote, existing.id]
      );
      saved = updated.rows[0];
    }

    await audit(req, {
      client,
      required: true,
      event: existing ? "CLINICAL_REVIEW_DRAFT_UPDATED" : "CLINICAL_REVIEW_DRAFT_CREATED",
      resourceType: "clinical_review",
      resourceId: saved.id,
      patientId,
      metadata: { version: saved.version },
    });
    return { id: saved.id, version: Number(saved.version) };
  });
}

// Sign the draft. Signed reviews are never edited directly afterwards.
async function signReview(userId, req, patientId, input = {}) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await requireActiveClaim(client, userId, patientId, { lock: true });
    await requireConsent(client, patientId, "SCREENING");
    const screening = await latestScreening(client, patientId, true);
    if (!screening || screening.case_state !== "AWAITING_CLINICIAN") {
      throw new HttpError(409, "This screening is not waiting for clinical review", "NOT_AWAITING_REVIEW");
    }
    const review = await reviewForScreening(client, screening.id, true);
    if (!review) throw new HttpError(404, "Save a draft review before signing", "REVIEW_NOT_FOUND");
    if (review.signed_at) throw new HttpError(409, "This review is already signed", "REVIEW_SIGNED");
    if (review.doctor_id !== userId) throw new HttpError(403, "This draft belongs to another Medical Officer", "REVIEW_NOT_OWNED");
    if (Number(input.version) !== Number(review.version)) {
      throw new HttpError(409, "The review was changed elsewhere. Reload and try again.", "VERSION_CONFLICT");
    }
    assertSignable(review);

    const signedAt = new Date().toISOString();
    const hash = signatureHash({ ...review, version: review.version + 1 }, userId, signedAt);
    const signed = await client.query(
      `UPDATE tbl_clinical_reviews
          SET signed_at = $1, signature_hash = $2, version = version + 1
        WHERE id = $3
        RETURNING id, version, signed_at`,
      [signedAt, hash, review.id]
    );

    const nextState = RETURN_TO_HEALTH_WORKER.includes(review.decision) ? "SCREENED" : "REVIEWED";
    await client.query("UPDATE tbl_screenings SET case_state = $1 WHERE id = $2", [nextState, screening.id]);

    await audit(req, {
      client,
      required: true,
      event: "CLINICAL_REVIEW_SIGNED",
      resourceType: "clinical_review",
      resourceId: review.id,
      patientId,
      metadata: { decision: review.decision, version: signed.rows[0].version, case_state: nextState },
    });
    return { ...signed.rows[0], version: Number(signed.rows[0].version), case_state: nextState };
  });
}

// Amend a signed review with a mandatory reason and a new signature. Returned
// recapture and more-information requests can be explicitly reviewed again.
async function amendReview(userId, req, reviewId, input = {}) {
  requireUuid(reviewId, "Invalid review ID");
  const reason = optionalText(input.amendment_reason, 1000, "Amendment reason");
  if (!reason) throw new HttpError(400, "An amendment reason is required", "AMENDMENT_REASON_REQUIRED");
  const finding = optionalText(input.finding, 4000, "Clinical finding");
  if (!finding) throw new HttpError(400, "Clinical finding is required", "INVALID_REVIEW");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT cr.*, cr.decision::text AS decision, s.case_state::text AS case_state
         FROM tbl_clinical_reviews cr
         JOIN tbl_screenings s ON s.id = cr.screening_id
         JOIN tbl_patients p ON p.id = cr.patient_id
         JOIN mst_villages pv ON pv.id = p.village_id
        WHERE cr.id = $2 AND cr.doctor_id = $1 AND ${mandalScope("$1")}
        FOR UPDATE OF cr,s`,
      [userId, reviewId]
    );
    const review = rows[0];
    if (!review) throw new HttpError(404, "Signed review not found", "REVIEW_NOT_FOUND");
    if (!review.signed_at) throw new HttpError(409, "Only signed reviews are amended. Edit the draft instead.", "REVIEW_NOT_SIGNED");
    if (Number(input.version) !== Number(review.version)) {
      throw new HttpError(409, "The review was changed elsewhere. Reload and try again.", "VERSION_CONFLICT");
    }
    if (reason === review.amendment_reason) {
      throw new HttpError(400, "Write a new amendment reason", "AMENDMENT_REASON_REQUIRED");
    }

    const isReturnedRereview = ["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(review.decision)
      && review.case_state === "AWAITING_CLINICIAN";
    let rereviewData = null;
    if (isReturnedRereview) {
      await requireActiveClaim(client, userId, review.patient_id, { lock: true });
      await requireConsent(client, review.patient_id, "SCREENING");
      const screening = await latestScreening(client, review.patient_id, true);
      if (!screening || screening.id !== review.screening_id || screening.case_state !== "AWAITING_CLINICIAN") {
        throw new HttpError(409, "This screening is no longer waiting for clinical review", "NOT_AWAITING_REVIEW");
      }
      rereviewData = normalizeReview({ ...review, ...input });
      if (!rereviewData.decision) {
        throw new HttpError(400, "Choose a clinical decision before signing", "DECISION_REQUIRED");
      }
      if (rereviewData.aiAssessmentId) {
        const ai = await client.query(
          "SELECT 1 FROM tbl_ai_assessments WHERE id = $1 AND screening_id = $2",
          [rereviewData.aiAssessmentId, review.screening_id]
        );
        if (!ai.rows.length) throw new HttpError(400, "The AI result does not belong to this screening", "INVALID_REVIEW");
      }
    } else if (input.decision && input.decision !== review.decision) {
      throw new HttpError(400, "A signed review decision can only change when reviewing a returned case", "INVALID_REVIEW");
    }

    const next = {
      ...review,
      finding: rereviewData?.finding || finding,
      impression: rereviewData ? rereviewData.impression : optionalText(input.impression, 4000, "Impression"),
      decision: rereviewData ? rereviewData.decision : review.decision,
      followup_instructions: rereviewData
        ? rereviewData.followupInstructions
        : optionalText(input.followup_instructions, 2000, "Follow-up instructions"),
      referral_reason: rereviewData
        ? rereviewData.referralReason
        : optionalText(input.referral_reason, 2000, "Referral reason"),
      request_note: rereviewData ? rereviewData.requestNote : optionalText(input.request_note, 2000, "Request note"),
      ai_assessment_id: rereviewData ? rereviewData.aiAssessmentId : review.ai_assessment_id,
      ai_agreement: rereviewData ? rereviewData.aiAgreement : review.ai_agreement,
      ai_discrepancy_note: rereviewData
        ? rereviewData.aiDiscrepancyNote
        : optionalText(input.ai_discrepancy_note, 2000, "AI discrepancy note") ?? review.ai_discrepancy_note,
      version: review.version + 1,
    };
    assertSignable(next);
    const signedAt = new Date().toISOString();

    const updated = await client.query(
      `UPDATE tbl_clinical_reviews
          SET finding=$1, impression=$2, decision=$3, followup_instructions=$4, referral_reason=$5, request_note=$6,
              ai_discrepancy_note=$7, amendment_reason=$8, signed_at=$9, signature_hash=$10,
              ai_assessment_id=$11, ai_agreement=$12,
              version = version + 1
        WHERE id = $13
        RETURNING id, version, signed_at`,
      [next.finding, next.impression, next.decision, next.followup_instructions, next.referral_reason, next.request_note,
        next.ai_discrepancy_note, reason, signedAt, signatureHash(next, userId, signedAt),
        next.ai_assessment_id, next.ai_agreement, review.id]
    );

    let nextState;
    if (isReturnedRereview) {
      nextState = RETURN_TO_HEALTH_WORKER.includes(next.decision) ? "SCREENED" : "REVIEWED";
      const screeningUpdate = await client.query(
        "UPDATE tbl_screenings SET case_state = $1 WHERE id = $2 AND case_state = 'AWAITING_CLINICIAN'",
        [nextState, review.screening_id]
      );
      if (!screeningUpdate.rowCount) {
        throw new HttpError(409, "This screening is no longer waiting for clinical review", "NOT_AWAITING_REVIEW");
      }
    }

    await audit(req, {
      client,
      required: true,
      event: "CLINICAL_REVIEW_AMENDED",
      resourceType: "clinical_review",
      resourceId: review.id,
      patientId: review.patient_id,
      metadata: {
        version: updated.rows[0].version,
        ...(isReturnedRereview ? { returned_case_rereview: review.decision } : {}),
      },
    });
    return { ...updated.rows[0], version: Number(updated.rows[0].version), ...(nextState ? { case_state: nextState } : {}) };
  });
}

// My reviews (drafts and signed) in my current Mandals
async function listMyReviews(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const params = [userId];
  let statusSql = "";
  if (query.status === "draft") statusSql = "AND cr.signed_at IS NULL";
  if (query.status === "signed") statusSql = "AND cr.signed_at IS NOT NULL";
  const fromSql = `
    FROM tbl_clinical_reviews cr
    JOIN tbl_patients p ON p.id = cr.patient_id
    JOIN mst_villages pv ON pv.id = p.village_id
    JOIN tbl_screenings s ON s.id = cr.screening_id
   WHERE cr.doctor_id = $1 AND ${mandalScope("$1")} ${statusSql}`;

  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params),
    pool.query(
      `SELECT cr.id, cr.patient_id, p.patient_code, cr.finding, cr.impression,
              cr.decision::text AS decision, cr.ai_agreement::text AS ai_agreement, cr.ai_discrepancy_note,
              cr.followup_instructions, cr.referral_reason, cr.request_note,
              cr.version, cr.amendment_reason, cr.signed_at, cr.updated_at,
              s.screening_date, s.case_state::text AS case_state
       ${fromSql}
        ORDER BY cr.updated_at DESC
        LIMIT $2 OFFSET $3`,
      [...params, pageSize, offset]
    ),
  ]);
  return {
    reviews: rows.rows.map((row) => ({ ...row, version: Number(row.version) })),
    pagination: pagination(page, pageSize, Number(count.rows[0].total)),
  };
}

async function listReviewVersions(userId, reviewId) {
  requireUuid(reviewId, "Invalid review ID");
  const owner = await pool.query(
    `SELECT cr.id FROM tbl_clinical_reviews cr
       JOIN tbl_patients p ON p.id = cr.patient_id
       JOIN mst_villages pv ON pv.id = p.village_id
      WHERE cr.id = $2 AND cr.doctor_id = $1 AND ${mandalScope("$1")}`,
    [userId, reviewId]
  );
  if (!owner.rows.length) throw new HttpError(404, "Review not found", "REVIEW_NOT_FOUND");
  const { rows } = await pool.query(
    `SELECT version_no, edited_at,
            snapshot->>'decision' AS decision,
            snapshot->>'signed_at' AS signed_at,
            snapshot->>'amendment_reason' AS amendment_reason
       FROM tbl_clinical_review_versions
      WHERE review_id = $1
      ORDER BY version_no DESC`,
    [reviewId]
  );
  return rows.map((row) => ({ ...row, version_no: Number(row.version_no) }));
}

module.exports = {
  DECISIONS,
  AI_AGREEMENTS,
  normalizeReview,
  assertSignable,
  getCaseContext,
  saveDraft,
  signReview,
  amendReview,
  listMyReviews,
  listReviewVersions,
};
