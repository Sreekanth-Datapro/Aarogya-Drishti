const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { hasConsent, requireUuid, setActor, withTransaction } = require("./medicalOfficer/scope");
const privateImageStorage = require("./privateImageStorage");
const imageEnhancementService = require("./imageEnhancementService");
const { createInAppNotifications } = require("./notificationService");

const PAGE_SIZE_DEFAULT = 10;
const NEXT_ACTIONS = [
  "VIDEO_CONSULTATION",
  "HOSPITAL_VISIT",
  "ADDITIONAL_TESTS",
  "FOLLOW_UP",
  "URGENT_REFERRAL",
];
const CONSULTATION_DECISIONS = [
  "VIDEO_CONSULTATION",
  "DIRECT_HOSPITAL_VISIT",
  "ADDITIONAL_INVESTIGATIONS",
  "CLINICAL_FOLLOW_UP",
  "EMERGENCY_HOSPITAL_REFERRAL",
];
const LEGACY_DECISION_TYPES = {
  HOSPITAL_VISIT: "DIRECT_HOSPITAL_VISIT",
  ADDITIONAL_TESTS: "ADDITIONAL_INVESTIGATIONS",
  FOLLOW_UP: "CLINICAL_FOLLOW_UP",
  URGENT_REFERRAL: "EMERGENCY_HOSPITAL_REFERRAL",
};

const REFERRAL_FROM = `
  FROM tbl_referrals r
  JOIN tbl_patients p ON p.id = r.patient_id
  JOIN mst_hospitals h ON h.id = r.to_hospital_id
  JOIN mst_specialties sp ON sp.id = r.specialty_id
  JOIN mst_referral_priorities pr ON pr.id = r.priority_id
  JOIN tbl_clinical_reviews cr ON cr.id = r.review_id AND cr.patient_id = r.patient_id
  JOIN tbl_screenings s ON s.id = cr.screening_id AND s.patient_id = r.patient_id
  JOIN LATERAL (
    SELECT pc.granted
      FROM tbl_patient_consents pc
      JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
     WHERE pc.patient_id = p.id AND cp.code = 'SCREENING'
     ORDER BY pc.consent_seq DESC
     LIMIT 1
  ) consent ON TRUE
`;

const ASSIGNED_REFERRAL_SCOPE = `
  r.assigned_specialist_id = $1
  AND p.deleted_at IS NULL
  AND fn_user_has_patient_access($1, p.id)
  AND EXISTS (
    SELECT 1
      FROM tbl_case_assignments ca
     WHERE ca.patient_id = p.id
       AND ca.referral_id = r.id
       AND ca.user_id = $1
       AND ca.valid_from <= now()
       AND (ca.valid_to IS NULL OR ca.valid_to > now())
  )
`;

function pageOptions(query = {}) {
  const page = Math.min(Math.max(Number(query.page) || 1, 1), 10000);
  const pageSize = Math.min(Math.max(Number(query.page_size) || PAGE_SIZE_DEFAULT, 1), 100);
  return { page, pageSize };
}

function pagination(page, pageSize, total) {
  return { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) };
}

function normalizeAssessment(input = {}) {
  const assessment = typeof input.assessment === "string" ? input.assessment.trim() : "";
  const clinicalObservations = typeof input.clinical_observations === "string"
    ? input.clinical_observations.trim()
    : "";
  const followUpRecommendation = typeof input.follow_up_recommendation === "string"
    ? input.follow_up_recommendation.trim()
    : typeof input.recommendations === "string" ? input.recommendations.trim() : "";
  const additionalNotes = typeof input.additional_notes === "string"
    ? input.additional_notes.trim()
    : "";
  const nextAction = typeof input.next_action === "string" ? input.next_action : "";

  if (!assessment || assessment.length > 4000) {
    throw new HttpError(400, "A clinical assessment of up to 4000 characters is required", "INVALID_ASSESSMENT");
  }
  if ([clinicalObservations, followUpRecommendation, additionalNotes].some((value) => value.length > 4000)) {
    throw new HttpError(400, "Each assessment field must be 4000 characters or fewer", "INVALID_ASSESSMENT");
  }
  if (!NEXT_ACTIONS.includes(nextAction)) {
    throw new HttpError(400, "Select a valid next action", "INVALID_ASSESSMENT");
  }
  return {
    clinicalObservations,
    assessment,
    followUpRecommendation,
    additionalNotes,
    nextAction,
  };
}

function normalizeClinicalDecision(input = {}) {
  const requestedType = typeof input.decision_type === "string"
    ? input.decision_type
    : typeof input.next_action === "string" ? input.next_action : "";
  const decisionType = LEGACY_DECISION_TYPES[requestedType] || requestedType;
  const clinicalReason = typeof input.clinical_reason === "string"
    ? input.clinical_reason.trim()
    : typeof input.assessment === "string" ? input.assessment.trim() : "";
  const clinicalRecommendation = typeof input.clinical_recommendation === "string"
    ? input.clinical_recommendation.trim()
    : typeof input.recommendations === "string" ? input.recommendations.trim() : "";
  const instructions = typeof input.instructions === "string"
    ? input.instructions.trim()
    : typeof input.follow_up_recommendation === "string"
      ? input.follow_up_recommendation.trim()
      : "";
  const additionalNotes = typeof input.additional_notes === "string"
    ? input.additional_notes.trim()
    : "";
  if (!CONSULTATION_DECISIONS.includes(decisionType)) {
    throw new HttpError(400, "Select a valid Specialist consultation decision", "INVALID_DECISION");
  }
  if (!clinicalReason || clinicalReason.length > 4000) {
    throw new HttpError(400, "A clinical reason of up to 4000 characters is required", "INVALID_DECISION");
  }
  if ([clinicalRecommendation, instructions, additionalNotes].some((value) => value.length > 4000)) {
    throw new HttpError(400, "Decision text must be 4000 characters or fewer", "INVALID_DECISION");
  }

  const priorityId = input.priority_id == null || input.priority_id === ""
    ? null
    : Number(input.priority_id);
  const hospitalId = input.hospital_id == null || input.hospital_id === ""
    ? null
    : Number(input.hospital_id);
  const investigationTypeId = input.investigation_type_id == null || input.investigation_type_id === ""
    ? null
    : Number(input.investigation_type_id);
  for (const [value, field] of [
    [priorityId, "priority"],
    [hospitalId, "hospital"],
    [investigationTypeId, "investigation type"],
  ]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
      throw new HttpError(400, `Select a valid ${field}`, "INVALID_DECISION");
    }
  }

  let followUpDate = input.follow_up_date || null;
  if (followUpDate !== null) {
    if (typeof followUpDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
      throw new HttpError(400, "Select a valid follow-up date", "INVALID_DECISION");
    }
    const parsedDate = new Date(`${followUpDate}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== followUpDate) {
      throw new HttpError(400, "Select a valid follow-up date", "INVALID_DECISION");
    }
  }
  if (decisionType === "CLINICAL_FOLLOW_UP" && !followUpDate) {
    throw new HttpError(400, "A follow-up date is required for clinical follow-up", "INVALID_DECISION");
  }
  if (decisionType === "ADDITIONAL_INVESTIGATIONS" && investigationTypeId === null) {
    throw new HttpError(400, "Select an investigation type", "INVALID_DECISION");
  }
  if (decisionType === "DIRECT_HOSPITAL_VISIT" && hospitalId === null) {
    throw new HttpError(400, "Select an assigned hospital", "INVALID_DECISION");
  }

  return {
    decisionType,
    clinicalReason,
    clinicalRecommendation: clinicalRecommendation || null,
    instructions: instructions || null,
    additionalNotes: additionalNotes || null,
    priorityId,
    followUpDate,
    hospitalId,
    investigationTypeId,
  };
}

function parseAssessmentNote(note) {
  if (!note?.assessment) return note;
  try {
    const data = JSON.parse(note.assessment);
    if (data?.format === "SPECIALIST_ASSESSMENT_V1") {
      return {
        ...note,
        clinical_observations: data.clinical_observations || "",
        assessment: data.assessment || "",
        follow_up_recommendation: data.follow_up_recommendation || note.recommendations || "",
        additional_notes: data.additional_notes || "",
      };
    }
  } catch {
    return {
      ...note,
      clinical_observations: "",
      follow_up_recommendation: note.recommendations || "",
      additional_notes: "",
    };
  }
  return note;
}

async function getDashboard(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS assigned,
            COUNT(*) FILTER (
              WHERE r.assessment_completed_at IS NULL
                AND r.status::text NOT IN ('CANCELLED', 'DECLINED')
            )::int AS pending,
            COUNT(*) FILTER (WHERE pr.code = 'URGENT')::int AS urgent,
            COUNT(*) FILTER (WHERE r.assessment_completed_at IS NOT NULL)::int AS completed
       ${REFERRAL_FROM}
      WHERE ${ASSIGNED_REFERRAL_SCOPE}
        AND consent.granted IS TRUE`,
    [userId]
  );
  return rows[0] || { assigned: 0, pending: 0, urgent: 0, completed: 0 };
}

function listFilterSql(filter) {
  if (filter === "pending") {
    return "AND r.assessment_completed_at IS NULL AND r.status::text NOT IN ('CANCELLED', 'DECLINED')";
  }
  if (filter === "urgent") return "AND pr.code = 'URGENT'";
  if (filter === "completed") return "AND r.assessment_completed_at IS NOT NULL";
  return "";
}

async function listReferrals(userId, query = {}) {
  const { page, pageSize } = pageOptions(query);
  const filter = String(query.filter || "all").toLowerCase();
  if (!["all", "pending", "urgent", "completed"].includes(filter)) {
    throw new HttpError(400, "Select a valid referral filter", "INVALID_FILTER");
  }

  const values = [userId];
  let searchSql = "";
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
  if (search) {
    values.push(`%${search}%`);
    const searchParam = `$${values.length}`;
    searchSql = `AND (
      p.patient_code ILIKE ${searchParam}
      OR p.full_name ILIKE ${searchParam}
      OR r.referral_code ILIKE ${searchParam}
      OR sp.name_en ILIKE ${searchParam}
    )`;
  }
  const stateSql = listFilterSql(filter);
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
       ${REFERRAL_FROM}
      WHERE ${ASSIGNED_REFERRAL_SCOPE}
        AND consent.granted IS TRUE ${stateSql} ${searchSql}`,
    values
  );
  const total = Number(count.rows[0]?.total || 0);
  const totalPages = Math.ceil(total / pageSize);
  const currentPage = totalPages ? Math.min(page, totalPages) : 1;
  const listValues = [...values, pageSize, (currentPage - 1) * pageSize];
  const { rows } = await pool.query(
    `SELECT r.id, r.referral_code, r.status::text AS referral_status,
            r.mode::text AS referral_mode, r.reason AS referral_reason, r.created_at,
            r.assessment_completed_at,
            p.patient_code, p.full_name AS patient_name,
            h.name_en AS hospital_name, sp.name_en AS specialty_name,
            pr.name_en AS priority_name, pr.code AS priority_code,
            s.screening_date
       ${REFERRAL_FROM}
      WHERE ${ASSIGNED_REFERRAL_SCOPE}
        AND consent.granted IS TRUE ${stateSql} ${searchSql}
      ORDER BY pr.priority_rank, r.created_at DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );
  return { referrals: rows, pagination: pagination(currentPage, pageSize, total) };
}

async function requireAssignedReferral(db, userId, referralId, { lock = false } = {}) {
  requireUuid(referralId, "Invalid referral ID");
  const { rows } = await db.query(
    `SELECT r.id, r.referral_code, r.patient_id, r.review_id,
            r.status::text AS referral_status, r.mode::text AS referral_mode,
            r.reason AS referral_reason, r.created_at, r.assessment_completed_at,
            r.to_hospital_id, r.specialty_id, r.priority_id,
            p.patient_code, p.full_name AS patient_name, p.sex::text AS patient_sex,
            COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int) AS age_years,
            h.name_en AS hospital_name, sp.name_en AS specialty_name,
            pr.name_en AS priority_name, pr.code AS priority_code,
            source_facility.name_en AS source_facility_name,
            specialist.full_name AS specialist_name,
            cr.doctor_id AS medical_officer_id,
            cr.finding AS medical_officer_finding, cr.impression AS medical_officer_impression,
            cr.referral_reason AS medical_officer_referral_reason,
            cr.followup_instructions AS medical_officer_recommendations,
            cr.decision::text AS medical_officer_decision,
            cr.version AS medical_officer_review_version,
            cr.signed_at AS medical_officer_signed_at,
            mo.full_name AS medical_officer_name,
            s.id AS screening_id, s.case_state::text AS screening_case_state,
            s.screening_date, s.chief_complaint, s.notes AS screening_notes,
            s.tobacco_current, s.clinical_exam_done, s.submitted_at AS screening_submitted_at,
            screening_facility.name_en AS screening_facility_name,
            consent.granted AS screening_consent,
            teleconsult_consent.id AS teleconsult_consent_id,
            CASE
              WHEN teleconsult_consent.id IS NULL THEN 'NOT_GIVEN'
              WHEN teleconsult_consent.granted IS TRUE THEN 'ACTIVE'
              WHEN teleconsult_consent.previously_granted IS TRUE THEN 'WITHDRAWN'
              ELSE 'DECLINED'
            END AS teleconsult_consent_status,
            teleconsult_consent.captured_at AS teleconsult_consent_at
       ${REFERRAL_FROM}
      LEFT JOIN mst_facilities source_facility ON source_facility.id = r.from_facility_id
      LEFT JOIN mst_facilities screening_facility ON screening_facility.id = s.facility_id
      LEFT JOIN tbl_users mo ON mo.id = cr.doctor_id
      LEFT JOIN tbl_users specialist ON specialist.id = r.assigned_specialist_id
      LEFT JOIN LATERAL (
        SELECT pc.id, pc.granted, pc.captured_at,
               EXISTS (
                 SELECT 1
                   FROM tbl_patient_consents previous
                  WHERE previous.patient_id = pc.patient_id
                    AND previous.purpose_id = pc.purpose_id
                    AND previous.granted IS TRUE
                    AND previous.consent_seq < pc.consent_seq
               ) AS previously_granted
          FROM tbl_patient_consents pc
          JOIN mst_consent_purposes purpose ON purpose.id = pc.purpose_id
         WHERE pc.patient_id = p.id AND purpose.code = 'TELECONSULT'
         ORDER BY pc.consent_seq DESC
         LIMIT 1
      ) teleconsult_consent ON TRUE
      WHERE ${ASSIGNED_REFERRAL_SCOPE}
        AND r.id = $2
      ${lock ? "FOR UPDATE OF r" : ""}`,
    [userId, referralId]
  );
  if (!rows.length) throw new HttpError(404, "Referral not found", "REFERRAL_NOT_FOUND");
  if (rows[0].screening_consent !== true) {
    throw new HttpError(403, "The patient has no active SCREENING consent", "CONSENT_REQUIRED");
  }
  return rows[0];
}

function queryReferralSection(section, sql, values, sectionErrors) {
  return pool.query(sql, values).catch((error) => {
    console.error(
      `Specialist referral section query failed (${section}):`,
      error.code || error.name || "QUERY_FAILED"
    );
    sectionErrors[section] = "LOAD_FAILED";
    return { rows: [] };
  });
}

async function getReferral(userId, req, referralId) {
  const referral = await requireAssignedReferral(pool, userId, referralId);
  const sectionErrors = {};
  const [findings, histories, aiObservations, investigationRows, consultations, imageConsent] = await Promise.all([
    queryReferralSection("screening_findings",
      `SELECT f.id, f.finding_kind::text AS finding_kind, f.oral_site::text AS oral_site,
              f.description, f.duration_days, f.recorded_at,
              sym.name_en AS symptom_name, sym.name_te AS symptom_name_te
         FROM tbl_screening_findings f
         LEFT JOIN mst_symptoms sym ON sym.id = f.symptom_id
        WHERE f.screening_id = $1
        ORDER BY f.recorded_at`,
      [referral.screening_id],
      sectionErrors
    ),
    queryReferralSection("medical_history",
      `SELECT h.history_kind::text AS history_kind, h.condition_text, h.duration_years,
              h.frequency_per_day, h.is_current, h.event_date, h.recorded_at,
              exposure.name_en AS exposure_name, exposure.name_te AS exposure_name_te
         FROM tbl_patient_medical_histories h
         LEFT JOIN mst_exposure_types exposure ON exposure.id = h.exposure_type_id
        WHERE h.patient_id = $1
        ORDER BY h.recorded_at DESC`,
      [referral.patient_id],
      sectionErrors
    ),
    queryReferralSection("ai_analysis",
      `SELECT a.id, a.result_label::text AS result_label, a.status::text AS status,
              a.image_quality_status::text AS image_quality_status,
              a.warning, a.score, a.model_provider, a.model_version,
              model.description AS model_name, model.permitted_use,
              model.is_research_only, model.clinical_use,
              a.analysis_details, a.requested_at, a.completed_at,
              ph.view_type::text AS image_view
         FROM tbl_ai_assessments a
         JOIN mst_ai_models model ON model.id = a.ai_model_id
         JOIN tbl_screening_photos ph ON ph.id = a.photo_id AND ph.screening_id = a.screening_id
        WHERE a.screening_id = $1
        ORDER BY a.requested_at DESC`,
      [referral.screening_id],
      sectionErrors
    ),
    queryReferralSection("investigations",
      `SELECT o.id AS order_id, it.name_en AS investigation_name, it.name_te AS investigation_name_te,
              status.code AS investigation_status_code, status.name_en AS investigation_status,
              status.name_te AS investigation_status_te,
              o.indication, o.ordered_at, o.scheduled_at AS investigation_scheduled_at,
              o.performed_at, o.report_received_at, o.due_date,
              rp.id AS report_id, rp.doc_kind, rp.mime_type AS report_mime_type,
              rp.summary_text, rp.reported_at, rp.created_at AS report_created_at,
              review.diagnosis_text AS clinician_report_review,
              review.diagnosis_category::text AS clinician_report_category,
              review.next_action AS report_next_action, review.signed_at AS report_review_signed_at,
              reviewer.full_name AS report_reviewer_name
         FROM tbl_investigation_orders o
         JOIN mst_investigation_types it ON it.id = o.investigation_type_id
         JOIN mst_investigation_statuses status ON status.id = o.status_id
         LEFT JOIN tbl_pathology_reports rp ON rp.order_id = o.id AND rp.patient_id = o.patient_id
         LEFT JOIN LATERAL (
           SELECT diagnosis_text, diagnosis_category, next_action, signed_at, reviewer_id
             FROM tbl_pathology_reviews
            WHERE report_id = rp.id AND patient_id = rp.patient_id
            ORDER BY created_at DESC LIMIT 1
         ) review ON TRUE
         LEFT JOIN tbl_users reviewer ON reviewer.id = review.reviewer_id
        WHERE o.referral_id = $1 AND o.patient_id = $2
        ORDER BY o.ordered_at DESC, rp.reported_at DESC NULLS LAST`,
      [referral.id, referral.patient_id],
      sectionErrors
    ),
    queryReferralSection("consultations",
      `SELECT vc.id AS consultation_id, status.name_en AS consultation_status,
              vc.attendance::text AS attendance,
              vc.is_active, vc.created_at AS consultation_created_at, cs.mode::text AS consultation_mode,
              cn.id AS note_id, cn.version_no, cn.note_text AS assessment,
              cn.outcome AS recommendations, cn.next_action, cn.signed_at
         FROM tbl_video_consultations vc
         JOIN tbl_consultation_slots cs ON cs.id = vc.slot_id
         JOIN mst_appointment_statuses status ON status.id = vc.status_id
         LEFT JOIN LATERAL (
           SELECT id, version_no, note_text, outcome, next_action, signed_at
             FROM tbl_consultation_notes
            WHERE consultation_id = vc.id AND patient_id = vc.patient_id AND author_id = $2
            ORDER BY version_no DESC LIMIT 1
         ) cn ON TRUE
        WHERE vc.referral_id = $1 AND vc.patient_id = $3 AND vc.specialist_id = $2
          AND vc.is_active IS TRUE
        ORDER BY vc.created_at DESC`,
      [referral.id, userId, referral.patient_id],
      sectionErrors
    ),
    hasConsent(pool, referral.patient_id, "IMAGE_CAPTURE"),
  ]);

  let images = [];
  let imageStorageWarning = null;
  if (imageConsent) {
    const result = await queryReferralSection("images",
      `SELECT ph.id, ph.screening_id, ph.view_type::text AS view_type,
              ph.annotation_site, ph.mime_type, ph.width_px, ph.height_px, ph.captured_at,
              enhancement.event AS enhancement_event,
              enhancement.outcome AS enhancement_outcome,
              enhancement.failure_stage AS enhancement_failure_stage,
              enhancement.error_code AS enhancement_error_code,
              enhancement.occurred_at AS enhancement_occurred_at
         FROM tbl_screening_photos ph
         LEFT JOIN LATERAL (
           SELECT event, outcome, metadata->>'failure_stage' AS failure_stage,
                  metadata->>'error_code' AS error_code, occurred_at
             FROM tbl_audit_logs
            WHERE resource_type = 'photo' AND resource_id = ph.id::text
              AND event IN (
                'PHOTO_AI_ENHANCEMENT_STARTED',
                'PHOTO_AI_ENHANCED',
                'PHOTO_AI_ENHANCEMENT_FAILED'
              )
            ORDER BY occurred_at DESC LIMIT 1
         ) enhancement ON TRUE
        WHERE ph.screening_id = $1 AND ph.patient_id = $2
          AND ph.status <> 'SUPERSEDED'
        ORDER BY ph.captured_at`,
      [referral.screening_id, referral.patient_id],
      sectionErrors
    );
    images = await Promise.all(result.rows.map(async (image) => {
      try {
        const enhancedAvailable = await privateImageStorage.objectExists(
          `enhanced/${image.screening_id}/${image.id}.jpg`
        );
        return {
          ...image,
          enhancement_status: enhancedAvailable
            ? "AVAILABLE"
            : image.enhancement_event === "PHOTO_AI_ENHANCEMENT_FAILED"
              ? "FAILED"
              : image.enhancement_event === "PHOTO_AI_ENHANCEMENT_STARTED"
                && new Date(image.enhancement_occurred_at).getTime() > Date.now() - 10 * 60 * 1000
                ? "PROCESSING"
                : image.enhancement_event === "PHOTO_AI_ENHANCEMENT_STARTED"
                  ? "FAILED"
                : image.enhancement_event === "PHOTO_AI_ENHANCED"
                  ? "UNAVAILABLE"
                  : "NOT_PERFORMED",
          enhancement_failure_stage: image.enhancement_failure_stage || (
            image.enhancement_event === "PHOTO_AI_ENHANCEMENT_STARTED"
              && new Date(image.enhancement_occurred_at).getTime() <= Date.now() - 10 * 60 * 1000
              ? "UNKNOWN"
              : null
          ),
          enhancement_error_code: image.enhancement_error_code,
        };
      } catch (error) {
        imageStorageWarning = "PRIVATE_STORAGE_UNAVAILABLE";
        sectionErrors.image_enhancement_status = "LOAD_FAILED";
        const storageErrorCode = error?.code;
        return {
          ...image,
          enhancement_status: "UNAVAILABLE",
          enhancement_failure_stage: storageErrorCode?.startsWith("IMAGE_STORAGE_")
            ? storageErrorCode === "IMAGE_STORAGE_ACCESS_DENIED"
              ? "STORAGE_ACCESS"
              : "STORAGE_CHECK"
            : "UNKNOWN",
          enhancement_error_code: storageErrorCode || "UNKNOWN_ERROR",
        };
      }
    }));
  }

  const investigationOrders = [...new Map(
    investigationRows.rows.map((row) => [row.order_id, {
      id: row.order_id,
      investigation_name: row.investigation_name,
      investigation_name_te: row.investigation_name_te,
      status: row.investigation_status,
      status_te: row.investigation_status_te,
      indication: row.indication,
      ordered_at: row.ordered_at,
      scheduled_at: row.investigation_scheduled_at,
      performed_at: row.performed_at,
      report_received_at: row.report_received_at,
      due_date: row.due_date,
    }])
  ).values()];
  const reports = investigationRows.rows
    .filter((row) => row.report_id)
    .map((row) => ({
      id: row.report_id,
      order_id: row.order_id,
      investigation_name: row.investigation_name,
      investigation_name_te: row.investigation_name_te,
      doc_kind: row.doc_kind,
      mime_type: row.report_mime_type,
      summary: row.summary_text,
      reported_at: row.reported_at,
      created_at: row.report_created_at,
      clinician_review: row.clinician_report_review,
      clinician_category: row.clinician_report_category,
      next_action: row.report_next_action,
      review_signed_at: row.report_review_signed_at,
      reviewer_name: row.report_reviewer_name,
    }));

  const [decisionRows, hospitalRows, investigationTypeRows, priorityRows] = await Promise.all([
    queryReferralSection("specialist_decision",
      `SELECT d.id, d.decision_type, d.status, d.clinical_reason,
              d.clinical_recommendation, d.instructions, d.additional_notes,
              d.follow_up_date, d.signed_at, d.signed_by,
              d.hospital_id, hospital.name_en AS hospital_name,
              d.investigation_type_id, investigation.name_en AS investigation_name,
              d.priority_id, priority.name_en AS priority_name,
              d.consultation_id, video.slot_id, d.investigation_order_id
         FROM tbl_specialist_consultation_decisions d
         LEFT JOIN mst_hospitals hospital ON hospital.id = d.hospital_id
         LEFT JOIN mst_investigation_types investigation ON investigation.id = d.investigation_type_id
         LEFT JOIN mst_referral_priorities priority ON priority.id = d.priority_id
         LEFT JOIN tbl_video_consultations video ON video.id = d.consultation_id
        WHERE d.referral_id = $1 AND d.patient_id = $2 AND d.specialist_id = $3`,
      [referral.id, referral.patient_id, userId],
      sectionErrors
    ),
    queryReferralSection("decision_hospitals",
      `SELECT DISTINCT hospital.id, hospital.name_en, hospital.name_te
         FROM tbl_user_facility_assignments assignment
         JOIN mst_facilities facility ON facility.id = assignment.facility_id
         JOIN mst_hospitals hospital ON hospital.id = facility.hospital_id
        WHERE assignment.user_id = $1
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
          AND facility.facility_type = 'HOSPITAL'
          AND facility.is_active IS TRUE AND hospital.is_active IS TRUE
        ORDER BY hospital.name_en`,
      [userId],
      sectionErrors
    ),
    queryReferralSection("decision_investigation_types",
      "SELECT id, name_en, name_te FROM mst_investigation_types WHERE is_active IS TRUE ORDER BY name_en",
      [],
      sectionErrors
    ),
    queryReferralSection("decision_priorities",
      "SELECT id, code, name_en, name_te FROM mst_referral_priorities WHERE is_active IS TRUE ORDER BY priority_rank",
      [],
      sectionErrors
    ),
  ]);

  await audit(req, {
    event: "SPECIALIST_REFERRAL_VIEWED",
    resourceType: "referral",
    resourceId: referral.id,
    patientId: referral.patient_id,
    required: true,
    metadata: { referral_code: referral.referral_code },
  });
  return {
    referral,
    findings: findings.rows,
    medical_history: histories.rows,
    ai_observations: aiObservations.rows,
    investigation_orders: investigationOrders,
    reports,
    consultations: consultations.rows.map(parseAssessmentNote),
    specialist_decision: decisionRows.rows[0] || null,
    teleconsult_consent: {
      status: referral.teleconsult_consent_status,
      captured_at: referral.teleconsult_consent_at,
    },
    decision_options: {
      hospitals: hospitalRows.rows,
      investigation_types: investigationTypeRows.rows,
      priorities: priorityRows.rows,
    },
    images,
    image_capture_consent: imageConsent,
    image_storage_warning: imageStorageWarning,
    section_errors: sectionErrors,
  };
}

async function authorizedPhoto(userId, referralId, photoId) {
  const referral = await requireAssignedReferral(pool, userId, referralId);
  const hasImageConsent = await hasConsent(pool, referral.patient_id, "IMAGE_CAPTURE");
  if (!hasImageConsent) {
    throw new HttpError(403, "The patient has no active IMAGE_CAPTURE consent", "CONSENT_REQUIRED");
  }
  requireUuid(photoId, "Invalid image ID");
  const { rows } = await pool.query(
    `SELECT ph.id, ph.screening_id, ph.private_key, ph.mime_type,
            ph.view_type::text AS view, ph.status::text AS photo_status
       FROM tbl_screening_photos ph
      WHERE ph.id = $1 AND ph.patient_id = $2 AND ph.screening_id = $3
        AND ph.status <> 'SUPERSEDED'`,
    [photoId, referral.patient_id, referral.screening_id]
  );
  if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
  return { referral, photo: rows[0] };
}

async function getOriginalImageFile(userId, req, referralId, photoId) {
  const { referral, photo } = await authorizedPhoto(userId, referralId, photoId);
  const image = await privateImageStorage.getFile(photo.private_key);
  await audit(req, {
    event: "IMAGE_VIEWED",
    resourceType: "photo",
    resourceId: photo.id,
    patientId: referral.patient_id,
    required: true,
    metadata: { image_version: "ORIGINAL", referral_code: referral.referral_code },
  });
  return { ...image, mimeType: photo.mime_type };
}

async function getEnhancedImageFile(userId, req, referralId, photoId) {
  const { referral, photo } = await authorizedPhoto(userId, referralId, photoId);
  let image;
  try {
    image = await privateImageStorage.getFile(`enhanced/${photo.screening_id}/${photo.id}.jpg`);
  } catch (error) {
    if (error.code === "IMAGE_FILE_MISSING") {
      throw new HttpError(404, "AI-enhanced image is not available", "IMAGE_FILE_MISSING");
    }
    throw error;
  }
  await audit(req, {
    event: "IMAGE_VIEWED",
    resourceType: "photo",
    resourceId: photo.id,
    patientId: referral.patient_id,
    required: true,
    metadata: { image_version: "AI_ENHANCED", referral_code: referral.referral_code },
  });
  return { ...image, mimeType: "image/jpeg" };
}

async function enhanceAssignedPhoto(userId, req, referralId, photoId) {
  const { referral, photo } = await authorizedPhoto(userId, referralId, photoId);
  return imageEnhancementService.enhancePhoto(req, {
    id: referral.screening_id,
    patient_id: referral.patient_id,
  }, {
    id: photo.id,
    private_key: photo.private_key,
    view: photo.view,
  });
}

async function getInvestigationReportFile(userId, req, referralId, reportId) {
  const referral = await requireAssignedReferral(pool, userId, referralId);
  requireUuid(reportId, "Invalid investigation report ID");
  const { rows } = await pool.query(
    `SELECT rp.report_key, rp.mime_type
       FROM tbl_pathology_reports rp
       JOIN tbl_investigation_orders o ON o.id = rp.order_id AND o.patient_id = rp.patient_id
      WHERE rp.id = $1 AND rp.patient_id = $2 AND o.referral_id = $3`,
    [reportId, referral.patient_id, referral.id]
  );
  if (!rows.length) throw new HttpError(404, "Investigation report not found", "REPORT_NOT_FOUND");
  const file = await privateImageStorage.getFile(rows[0].report_key);
  await audit(req, {
    event: "SPECIALIST_INVESTIGATION_REPORT_VIEWED",
    resourceType: "pathology_report",
    resourceId: reportId,
    patientId: referral.patient_id,
    required: true,
    metadata: { referral_code: referral.referral_code },
  });
  return { ...file, mimeType: rows[0].mime_type };
}

async function getAvailableConsultationSlots(userId, referralId) {
  const referral = await requireAssignedReferral(pool, userId, referralId);
  if (!(await hasConsent(pool, referral.patient_id, "TELECONSULT"))) {
    throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
  }
  const { rows } = await pool.query(
    `SELECT id, slot_start, slot_end, mode::text AS mode
       FROM tbl_consultation_slots
      WHERE specialist_id = $1
        AND is_booked IS FALSE
        AND slot_start > now()
        AND mode = 'VIDEO'
        AND (hospital_id IS NULL OR hospital_id = $2)
      ORDER BY slot_start
      LIMIT 50`,
    [userId, referral.to_hospital_id]
  );
  return rows;
}

async function createConsultationForReferral(client, userId, req, referral, slotId) {
  if (!(await hasConsent(client, referral.patient_id, "TELECONSULT"))) {
    throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
  }

  const existing = await client.query(
    `SELECT vc.id AS consultation_id, vc.slot_id, vc.created_at AS consultation_created_at,
            vc.attendance::text AS attendance, status.name_en AS consultation_status,
            cs.slot_start, cs.slot_end, cs.mode::text AS mode
       FROM tbl_video_consultations vc
       JOIN tbl_consultation_slots cs ON cs.id = vc.slot_id
       JOIN mst_appointment_statuses status ON status.id = vc.status_id
      WHERE vc.referral_id = $1 AND vc.patient_id = $2
        AND vc.specialist_id = $3 AND vc.is_active IS TRUE
      ORDER BY vc.created_at DESC
      LIMIT 1
      FOR UPDATE OF vc`,
    [referral.id, referral.patient_id, userId]
  );
  if (existing.rows.length) {
    if (existing.rows[0].slot_id !== slotId) {
      throw new HttpError(409, "An active video consultation already exists for this referral", "CONSULTATION_ALREADY_EXISTS");
    }
    return { ...existing.rows[0], already_exists: true };
  }

  const slot = await client.query(
    `SELECT id, slot_start, slot_end, mode::text AS mode
       FROM tbl_consultation_slots
      WHERE id = $1 AND specialist_id = $2 AND is_booked IS FALSE
        AND slot_start > now() AND mode = 'VIDEO'
        AND (hospital_id IS NULL OR hospital_id = $3)
      FOR UPDATE`,
    [slotId, userId, referral.to_hospital_id]
  );
  if (!slot.rows.length) {
    throw new HttpError(409, "The selected video consultation slot is no longer available", "CONSULTATION_SLOT_UNAVAILABLE");
  }

  const requested = await client.query(
    "SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'"
  );
  if (!requested.rows.length) {
    throw new HttpError(500, "Consultation statuses are not configured", "CONFIGURATION_ERROR");
  }

  await setActor(client, userId);
  const inserted = await client.query(
    `INSERT INTO tbl_video_consultations
       (referral_id, patient_id, slot_id, specialist_id, requested_by, status_id)
     VALUES ($1, $2, $3, $4, $4, $5)
     RETURNING id AS consultation_id, created_at AS consultation_created_at,
               attendance::text AS attendance`,
    [referral.id, referral.patient_id, slotId, userId, requested.rows[0].id]
  );
  const consultation = {
    ...inserted.rows[0],
    consultation_status: "Requested",
    slot_start: slot.rows[0].slot_start,
    slot_end: slot.rows[0].slot_end,
    mode: slot.rows[0].mode,
    already_exists: false,
  };
  await audit(req, {
    client,
    required: true,
    event: "SPECIALIST_CONSULTATION_CREATED",
    resourceType: "video_consultation",
    resourceId: consultation.consultation_id,
    patientId: referral.patient_id,
    metadata: {
      referral_code: referral.referral_code,
      slot_start: consultation.slot_start,
      mode: consultation.mode,
    },
  });
  return consultation;
}

async function createConsultation(userId, req, referralId, input = {}) {
  const slotId = requireUuid(input.slot_id, "Invalid consultation slot ID");
  return withTransaction(pool, async (client) => {
    const referral = await requireAssignedReferral(client, userId, referralId, { lock: true });
    if (referral.assessment_completed_at || ["COMPLETED", "CANCELLED", "DECLINED"].includes(referral.referral_status)) {
      throw new HttpError(409, "This referral is no longer available for consultation", "REFERRAL_NOT_ASSESSABLE");
    }
    return createConsultationForReferral(client, userId, req, referral, slotId);
  });
}

async function getAssignedHospitals(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT hospital.id, hospital.name_en, hospital.name_te
       FROM tbl_user_facility_assignments assignment
       JOIN mst_facilities facility ON facility.id = assignment.facility_id
       JOIN mst_hospitals hospital ON hospital.id = facility.hospital_id
      WHERE assignment.user_id = $1
        AND assignment.valid_from <= CURRENT_DATE
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        AND facility.facility_type = 'HOSPITAL'
        AND facility.is_active IS TRUE
        AND hospital.is_active IS TRUE
      ORDER BY hospital.name_en`,
    [userId]
  );
  return rows;
}

async function listAvailabilitySlots(userId) {
  const { rows } = await pool.query(
    `SELECT slot.id, slot.slot_start, slot.slot_end, slot.mode::text AS mode,
            slot.is_booked,
            CASE WHEN slot.is_booked IS TRUE THEN 'BOOKED' ELSE 'AVAILABLE' END AS booking_status,
            (slot.is_booked IS FALSE
             AND NOT EXISTS (
               SELECT 1 FROM tbl_video_consultations vc WHERE vc.slot_id = slot.id
             )) AS can_cancel,
            hospital.name_en AS hospital_name
       FROM tbl_consultation_slots slot
       LEFT JOIN mst_hospitals hospital ON hospital.id = slot.hospital_id
      WHERE slot.specialist_id = $1
        AND slot.slot_start > now()
      ORDER BY slot.slot_start
      LIMIT 100`,
    [userId]
  );
  return rows;
}

async function createAvailabilitySlot(userId, req, input = {}) {
  const slotStart = new Date(input.slot_start);
  const slotEnd = new Date(input.slot_end);
  if (!Number.isFinite(slotStart.getTime()) || !Number.isFinite(slotEnd.getTime())) {
    throw new HttpError(400, "Provide valid slot start and end times", "INVALID_SLOT_TIME");
  }
  if (slotStart <= new Date()) {
    throw new HttpError(400, "Consultation slots must be in the future", "SLOT_NOT_FUTURE");
  }
  if (slotEnd <= slotStart) {
    throw new HttpError(400, "The end time must be after the start time", "INVALID_SLOT_RANGE");
  }

  const hospitalId = input.hospital_id ?? null;
  if (hospitalId !== null && (!Number.isSafeInteger(Number(hospitalId)) || Number(hospitalId) < 1)) {
    throw new HttpError(400, "Select a valid hospital", "INVALID_HOSPITAL_SCOPE");
  }

  try {
    return await withTransaction(pool, async (client) => {
      if (hospitalId !== null) {
        const assignedHospital = await client.query(
          `SELECT 1
             FROM tbl_user_facility_assignments assignment
             JOIN mst_facilities facility ON facility.id = assignment.facility_id
             JOIN mst_hospitals hospital ON hospital.id = facility.hospital_id
            WHERE assignment.user_id = $1
              AND hospital.id = $2
              AND assignment.valid_from <= CURRENT_DATE
              AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
              AND facility.facility_type = 'HOSPITAL'
              AND facility.is_active IS TRUE
              AND hospital.is_active IS TRUE
            LIMIT 1
            FOR SHARE OF assignment, facility, hospital`,
          [userId, hospitalId]
        );
        if (!assignedHospital.rows.length) {
          throw new HttpError(400, "Select an active hospital assigned to your account", "INVALID_HOSPITAL_SCOPE");
        }
      }

      await setActor(client, userId);
      const { rows } = await client.query(
        `INSERT INTO tbl_consultation_slots
           (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
         SELECT $1, $2, $3, $4, 'VIDEO', $1
          WHERE $3::timestamptz > now()
            AND $4::timestamptz > $3::timestamptz
         RETURNING id, slot_start, slot_end, mode::text AS mode, is_booked`,
        [userId, hospitalId, input.slot_start, input.slot_end]
      );
      if (!rows.length) {
        throw new HttpError(400, "The slot must be in the future and end after it starts", "INVALID_SLOT_TIME");
      }

      await audit(req, {
        client,
        required: true,
        event: "SPECIALIST_CONSULTATION_SLOT_CREATED",
        resourceType: "consultation_slot",
        resourceId: rows[0].id,
        metadata: {
          slot_start: rows[0].slot_start,
          slot_end: rows[0].slot_end,
          mode: rows[0].mode,
          hospital_id: hospitalId,
        },
      });
      return rows[0];
    });
  } catch (error) {
    if (error.code === "23P01") {
      throw new HttpError(409, "This slot overlaps another availability slot", "SLOT_OVERLAP");
    }
    throw error;
  }
}

async function cancelAvailabilitySlot(userId, req, slotId) {
  requireUuid(slotId, "Invalid consultation slot ID");
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT id, slot_start, is_booked
         FROM tbl_consultation_slots
        WHERE id = $1 AND specialist_id = $2
        FOR UPDATE`,
      [slotId, userId]
    );
    if (!rows.length) {
      throw new HttpError(404, "Consultation slot not found", "SLOT_NOT_FOUND");
    }
    if (new Date(rows[0].slot_start) <= new Date()) {
      throw new HttpError(409, "Past consultation slots cannot be cancelled", "SLOT_CANCELLATION_UNAVAILABLE");
    }
    if (rows[0].is_booked) {
      throw new HttpError(409, "A booked consultation slot cannot be cancelled", "SLOT_CANCELLATION_UNAVAILABLE");
    }

    const linkedConsultation = await client.query(
      "SELECT 1 FROM tbl_video_consultations WHERE slot_id = $1 LIMIT 1",
      [slotId]
    );
    if (linkedConsultation.rows.length) {
      throw new HttpError(409, "A slot linked to a consultation cannot be cancelled", "SLOT_CANCELLATION_UNAVAILABLE");
    }

    await client.query("DELETE FROM tbl_consultation_slots WHERE id = $1", [slotId]);
    await audit(req, {
      client,
      required: true,
      event: "SPECIALIST_CONSULTATION_SLOT_CANCELLED",
      resourceType: "consultation_slot",
      resourceId: slotId,
      metadata: { slot_start: rows[0].slot_start },
    });
    return { id: slotId, cancelled: true };
  });
}

async function saveAssessment(userId, req, referralId, input, sign = false) {
  const data = normalizeClinicalDecision(input);
  return withTransaction(pool, async (client) => {
    const referral = await requireAssignedReferral(client, userId, referralId, { lock: true });
    if (referral.assessment_completed_at || ["COMPLETED", "CANCELLED", "DECLINED"].includes(referral.referral_status)) {
      throw new HttpError(409, "This referral is no longer available for assessment", "REFERRAL_NOT_ASSESSABLE");
    }

    const existing = await client.query(
      `SELECT id, status
         FROM tbl_specialist_consultation_decisions
        WHERE referral_id = $1 AND patient_id = $2 AND specialist_id = $3
        FOR UPDATE`,
      [referral.id, referral.patient_id, userId]
    );
    if (existing.rows[0]?.status === "SIGNED") {
      throw new HttpError(409, "A clinical decision has already been submitted for this referral", "DECISION_ALREADY_SIGNED");
    }

    if (data.followUpDate && data.followUpDate < new Date().toISOString().slice(0, 10)) {
      throw new HttpError(400, "The follow-up date cannot be in the past", "INVALID_DECISION");
    }

    if (data.priorityId !== null) {
      const priority = await client.query(
        "SELECT 1 FROM mst_referral_priorities WHERE id = $1 AND is_active IS TRUE",
        [data.priorityId]
      );
      if (!priority.rows.length) {
        throw new HttpError(400, "Select an active priority", "INVALID_DECISION");
      }
    }

    if (data.hospitalId !== null) {
      const hospital = await client.query(
        `SELECT 1
           FROM tbl_user_facility_assignments assignment
           JOIN mst_facilities facility ON facility.id = assignment.facility_id
           JOIN mst_hospitals hospital ON hospital.id = facility.hospital_id
          WHERE assignment.user_id = $1 AND hospital.id = $2
            AND assignment.valid_from <= CURRENT_DATE
            AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
            AND facility.facility_type = 'HOSPITAL'
            AND facility.is_active IS TRUE AND hospital.is_active IS TRUE
          LIMIT 1
          FOR SHARE OF assignment, facility, hospital`,
        [userId, data.hospitalId]
      );
      if (!hospital.rows.length) {
        throw new HttpError(400, "Select an active hospital assigned to your account", "INVALID_HOSPITAL_SCOPE");
      }
    }

    let consultationId = null;
    let investigationOrderId = null;
    if (sign && data.decisionType === "VIDEO_CONSULTATION") {
      if (!(await hasConsent(client, referral.patient_id, "TELECONSULT"))) {
        throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
      }
    }

    if (sign && data.decisionType === "ADDITIONAL_INVESTIGATIONS") {
      const [type, status] = await Promise.all([
        client.query(
          "SELECT 1 FROM mst_investigation_types WHERE id = $1 AND is_active IS TRUE",
          [data.investigationTypeId]
        ),
        client.query("SELECT id FROM mst_investigation_statuses WHERE code = 'ADVISED'"),
      ]);
      if (!type.rows.length) {
        throw new HttpError(400, "Select an active investigation type", "INVALID_DECISION");
      }
      if (!status.rows.length) {
        throw new HttpError(500, "Investigation statuses are not configured", "CONFIGURATION_ERROR");
      }
      const order = await client.query(
        `INSERT INTO tbl_investigation_orders
           (referral_id, patient_id, investigation_type_id, status_id, hospital_id,
            indication, ordered_by, next_action, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          referral.id, referral.patient_id, data.investigationTypeId, status.rows[0].id,
          data.hospitalId || referral.to_hospital_id, data.clinicalReason, userId,
          data.instructions, data.followUpDate,
        ]
      );
      investigationOrderId = order.rows[0].id;
      await client.query(
        `INSERT INTO tbl_investigation_status_history
           (order_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, NULL, $2, $3, 'Specialist signed an additional investigation decision')`,
        [investigationOrderId, status.rows[0].id, userId]
      );
    }

    if (sign && data.decisionType === "EMERGENCY_HOSPITAL_REFERRAL" && data.hospitalId !== null) {
      const existingAppointment = await client.query(
        `SELECT appointment.id
           FROM tbl_hospital_appointments appointment
           JOIN mst_appointment_statuses status ON status.id = appointment.status_id
          WHERE appointment.referral_id = $1 AND status.is_terminal IS FALSE
          LIMIT 1
          FOR UPDATE OF appointment`,
        [referral.id]
      );
      if (!existingAppointment.rows.length) {
        const status = await client.query(
          "SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'"
        );
        if (!status.rows.length) {
          throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
        }
        await setActor(client, userId);
        const appointment = await client.query(
          `INSERT INTO tbl_hospital_appointments
             (referral_id, patient_id, hospital_id, specialty_id, scheduled_at,
              status_id, assigned_service, location_note, booked_by)
           VALUES ($1, $2, $3, $4, now(), $5, 'Emergency hospital referral',
                   'Immediate hospital coordination required', $6)
           RETURNING id`,
          [referral.id, referral.patient_id, data.hospitalId, referral.specialty_id, status.rows[0].id, userId]
        );
        await client.query(
          `INSERT INTO tbl_appointment_status_history
             (hospital_appointment_id, from_status_id, to_status_id, changed_by, reason)
           VALUES ($1, NULL, $2, $3, 'Specialist emergency referral requires immediate coordination')`,
          [appointment.rows[0].id, status.rows[0].id, userId]
        );
      }
    }

    await setActor(client, userId);
    const signedBy = sign ? userId : null;
    const { rows } = await client.query(
      `INSERT INTO tbl_specialist_consultation_decisions
         (referral_id, patient_id, specialist_id, decision_type, status,
          clinical_reason, clinical_recommendation, instructions, additional_notes,
          priority_id, follow_up_date, hospital_id, investigation_type_id,
          consultation_id, investigation_order_id, signed_by, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, CASE WHEN $5 = 'SIGNED' THEN now() ELSE NULL END)
       ON CONFLICT (referral_id) DO UPDATE
         SET decision_type = EXCLUDED.decision_type,
             clinical_reason = EXCLUDED.clinical_reason,
             clinical_recommendation = EXCLUDED.clinical_recommendation,
             instructions = EXCLUDED.instructions,
             additional_notes = EXCLUDED.additional_notes,
             priority_id = EXCLUDED.priority_id,
             follow_up_date = EXCLUDED.follow_up_date,
             hospital_id = EXCLUDED.hospital_id,
             investigation_type_id = EXCLUDED.investigation_type_id,
             consultation_id = EXCLUDED.consultation_id,
             investigation_order_id = EXCLUDED.investigation_order_id,
             status = EXCLUDED.status,
             signed_by = EXCLUDED.signed_by,
             signed_at = EXCLUDED.signed_at
       WHERE tbl_specialist_consultation_decisions.status = 'DRAFT'
       RETURNING id, referral_id, patient_id, specialist_id, decision_type,
                 status, clinical_reason, clinical_recommendation, instructions,
                 additional_notes, priority_id, follow_up_date, hospital_id,
                 investigation_type_id, consultation_id, investigation_order_id,
                 signed_by, signed_at, created_at, updated_at`,
      [
        referral.id, referral.patient_id, userId, data.decisionType, sign ? "SIGNED" : "DRAFT",
        data.clinicalReason, data.clinicalRecommendation, data.instructions, data.additionalNotes,
        data.priorityId, data.followUpDate, data.hospitalId, data.investigationTypeId,
        consultationId, investigationOrderId, signedBy,
      ]
    );
    if (!rows.length) {
      throw new HttpError(409, "A clinical decision has already been submitted for this referral", "DECISION_ALREADY_SIGNED");
    }

    await audit(req, {
      client,
      required: true,
      event: sign ? "SPECIALIST_CONSULTATION_DECISION_SIGNED" : "SPECIALIST_CONSULTATION_DECISION_DRAFT_SAVED",
      resourceType: "specialist_consultation_decision",
      resourceId: rows[0].id,
      patientId: referral.patient_id,
      metadata: {
        referral_code: referral.referral_code,
        decision_type: data.decisionType,
        status: rows[0].status,
      },
    });

    if (sign && referral.medical_officer_id) {
      const urgent = data.decisionType === "EMERGENCY_HOSPITAL_REFERRAL";
      await createInAppNotifications(client, {
        recipients: [referral.medical_officer_id],
        patientId: referral.patient_id,
        event: urgent ? "SPECIALIST_ESCALATION" : "SPECIALIST_DECISION_FOR_MO",
        title: urgent
          ? "Specialist emergency escalation"
          : "Specialist decision requires Medical Officer attention",
        message: urgent
          ? "A Specialist signed an emergency hospital referral. Review the referral and next clinical actions."
          : "A Specialist signed a consultation decision for a referral you created. Review the outcome.",
        targetPath: `/medical-officer/referrals?patient=${referral.patient_id}`,
        dedupeKey: `${urgent ? "SPECIALIST_ESCALATION" : "SPECIALIST_DECISION_FOR_MO"}:${rows[0].id}`,
        extraPayload: { referral_id: referral.id },
      });
    }
    return rows[0];
  });
}

module.exports = {
  NEXT_ACTIONS,
  getDashboard,
  listReferrals,
  getReferral,
  getOriginalImageFile,
  getEnhancedImageFile,
  enhanceAssignedPhoto,
  getInvestigationReportFile,
  getAvailableConsultationSlots,
  createConsultation,
  getAssignedHospitals,
  listAvailabilitySlots,
  createAvailabilitySlot,
  cancelAvailabilitySlot,
  CONSULTATION_DECISIONS,
  normalizeClinicalDecision,
  saveAssessment,
  normalizeAssessment,
  pageOptions,
  requireAssignedReferral,
};
