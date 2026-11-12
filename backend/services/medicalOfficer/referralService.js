const pool = require("../../db");
const HttpError = require("../../utils/httpError");
const { audit } = require("../../utils/audit");
const { activeScreeningOrder } = require("../../utils/screeningSelection");
const {
  mandalScope,
  pageOptions,
  pagination,
  requireActiveClaim,
  requireConsent,
  requirePositiveId,
  requireUuid,
  setActor,
  withTransaction,
} = require("./scope");

// ==========================================
// REFERRALS (tbl_referrals)
// Schema rules reused as-is: a referral needs a SIGNED review whose decision is
// SPECIALIST_REVIEW or URGENT_REFERRAL (fn_referral_guard); the case moves
// REVIEWED -> REFERRAL_PLANNED (fn_check_case_transition); statuses come from
// referral_status and every change is stored in tbl_referral_status_history.
// ==========================================

const MODES = ["HOSPITAL_VISIT", "VIDEO_CONSULT", "BOTH"];
const STATUSES = ["PLANNED", "SENT", "ACCEPTED", "COMPLETED", "DECLINED", "CANCELLED"];

// The review and active referral of the patient's latest screening
async function referralReview(db, patientId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT cr.id AS review_id, cr.decision::text AS decision, cr.referral_reason,
            cr.signed_at, s.id AS screening_id, s.case_state::text AS case_state,
            EXISTS (
              SELECT 1 FROM tbl_referrals existing
               WHERE existing.patient_id = s.patient_id
                 AND existing.status IN ('PLANNED', 'SENT', 'ACCEPTED')
            ) AS has_active_referral
       FROM tbl_screenings s
       LEFT JOIN tbl_clinical_reviews cr
         ON cr.screening_id = s.id AND cr.patient_id = s.patient_id
      WHERE s.patient_id = $1
      ORDER BY ${activeScreeningOrder("s")}
      LIMIT 1
      ${lock ? "FOR UPDATE OF s" : ""}`,
    [patientId]
  );
  return rows[0] || null;
}

async function getReferralOptions(userId, patientId) {
  const patient = await requireActiveClaim(pool, userId, patientId);
  await requireConsent(pool, patientId, "SCREENING");
  const review = await referralReview(pool, patientId);
  const eligible = Boolean(review && review.signed_at
    && ["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(review.decision)
    && review.case_state === "REVIEWED"
    && !review.has_active_referral);

  const [hospitals, specialties, priorities, specialists, navigators] = await Promise.all([
    pool.query(
      `SELECT f.id, f.name_en, f.name_te
         FROM mst_facilities f
        WHERE f.district_id = $1 AND f.facility_type = 'HOSPITAL'
          AND f.hospital_id IS NOT NULL AND f.is_active IS TRUE
        ORDER BY f.name_en`,
      [patient.district_id]
    ),
    pool.query("SELECT id, code, name_en, name_te FROM mst_specialties WHERE is_active IS TRUE ORDER BY name_en"),
    pool.query("SELECT id, code, name_en, name_te FROM mst_referral_priorities WHERE is_active IS TRUE ORDER BY priority_rank"),
    pool.query(
      `SELECT DISTINCT u.id, u.full_name, ufa.facility_id
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id AND r.code = 'SPECIALIST'
         JOIN tbl_user_facility_assignments ufa ON ufa.user_id = u.id
         JOIN mst_facilities f ON f.id = ufa.facility_id
        WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND f.district_id = $1 AND f.facility_type = 'HOSPITAL'
          AND ufa.valid_from <= CURRENT_DATE AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)
        ORDER BY u.full_name`,
      [patient.district_id]
    ),
    pool.query(
      `SELECT u.id, u.full_name
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id AND r.code = 'NAVIGATOR'
        WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.district_id = $1
        ORDER BY u.full_name`,
      [patient.district_id]
    ),
  ]);

  return {
    eligible,
    review: review ? { decision: review.decision, referral_reason: review.referral_reason, case_state: review.case_state } : null,
    hospitals: hospitals.rows.map((row) => ({ ...row, id: Number(row.id) })),
    specialties: specialties.rows.map((row) => ({ ...row, id: Number(row.id) })),
    priorities: priorities.rows.map((row) => ({ ...row, id: Number(row.id) })),
    specialists: specialists.rows.map((row) => ({ ...row, facility_id: Number(row.facility_id) })),
    navigators: navigators.rows,
    modes: MODES,
  };
}

function normalizeReferral(input = {}) {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 2000) throw new HttpError(400, "A referral reason is required", "INVALID_REFERRAL");
  const mode = input.mode || "HOSPITAL_VISIT";
  if (!MODES.includes(mode)) throw new HttpError(400, "Invalid referral mode", "INVALID_REFERRAL");
  return {
    hospitalFacilityId: requirePositiveId(input.hospital_facility_id, "Select a hospital"),
    specialtyId: requirePositiveId(input.specialty_id, "Select a specialty"),
    priorityId: requirePositiveId(input.priority_id, "Select a priority"),
    specialistId: input.specialist_id ? requireUuid(input.specialist_id, "Invalid specialist") : null,
    navigatorId: input.navigator_id ? requireUuid(input.navigator_id, "Invalid navigator") : null,
    mode,
    reason,
  };
}

async function createReferral(userId, req, patientId, input) {
  const data = normalizeReferral(input);
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const patient = await requireActiveClaim(client, userId, patientId, { lock: true });
    await requireConsent(client, patientId, "SCREENING");
    const review = await referralReview(client, patientId, { lock: true });
    if (!review || !review.signed_at
      || !["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(review.decision)) {
      throw new HttpError(409, "A signed review with a referral decision is required", "REFERRAL_NOT_ALLOWED");
    }
    if (review.has_active_referral) {
      throw new HttpError(409, "This screening already has an active referral", "REFERRAL_ALREADY_EXISTS");
    }
    if (review.case_state !== "REVIEWED") {
      throw new HttpError(409, "This case is not ready for a new referral", "REFERRAL_NOT_ALLOWED");
    }

    const hospital = await client.query(
      `SELECT hospital_id FROM mst_facilities
        WHERE id = $1 AND district_id = $2 AND facility_type = 'HOSPITAL'
          AND hospital_id IS NOT NULL AND is_active IS TRUE`,
      [data.hospitalFacilityId, patient.district_id]
    );
    if (!hospital.rows.length) throw new HttpError(400, "Select an active hospital in the patient's district", "INVALID_REFERRAL");

    const checks = await client.query(
      `SELECT (SELECT COUNT(*) FROM mst_specialties WHERE id = $1 AND is_active IS TRUE) AS specialty,
              (SELECT COUNT(*) FROM mst_referral_priorities WHERE id = $2 AND is_active IS TRUE) AS priority,
              (SELECT code FROM mst_referral_priorities WHERE id = $2 AND is_active IS TRUE) AS priority_code`,
      [data.specialtyId, data.priorityId]
    );
    if (Number(checks.rows[0].specialty) !== 1) throw new HttpError(400, "Select an active specialty", "INVALID_REFERRAL");
    if (Number(checks.rows[0].priority) !== 1) throw new HttpError(400, "Select a priority", "INVALID_REFERRAL");
    if (review.decision === "URGENT_REFERRAL" && checks.rows[0].priority_code !== "URGENT") {
      throw new HttpError(400, "Emergency referrals must use URGENT priority", "URGENT_PRIORITY_REQUIRED");
    }

    if (data.specialistId) {
      const specialist = await client.query(
        `SELECT 1 FROM tbl_users u
           JOIN mst_roles r ON r.id = u.role_id AND r.code = 'SPECIALIST'
           JOIN tbl_user_facility_assignments ufa ON ufa.user_id = u.id AND ufa.facility_id = $2
          WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            AND ufa.valid_from <= CURRENT_DATE AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)`,
        [data.specialistId, data.hospitalFacilityId]
      );
      if (!specialist.rows.length) throw new HttpError(400, "The specialist is not assigned to this hospital", "INVALID_REFERRAL");
    }
    if (data.navigatorId) {
      const navigator = await client.query(
        `SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id AND r.code = 'NAVIGATOR'
          WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.district_id = $2`,
        [data.navigatorId, patient.district_id]
      );
      if (!navigator.rows.length) throw new HttpError(400, "Select an active navigator of this district", "INVALID_REFERRAL");
    }

    const inserted = await client.query(
      `INSERT INTO tbl_referrals
         (review_id, patient_id, from_facility_id, to_hospital_id, specialty_id, priority_id,
          mode, reason, assigned_specialist_id, assigned_navigator_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, referral_code, status::text AS status, created_at`,
      [review.review_id, patientId, patient.registered_facility_id, hospital.rows[0].hospital_id,
        data.specialtyId, data.priorityId, data.mode, data.reason, data.specialistId, data.navigatorId, userId]
    );
    const referral = inserted.rows[0];

    await client.query(
      `INSERT INTO tbl_referral_status_history (referral_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, $2, $3, 'Referral created')`,
      [referral.id, referral.status, userId]
    );

    // Care relationship so the specialist / navigator can open this patient
    for (const assignee of [data.specialistId, data.navigatorId].filter(Boolean)) {
      await client.query(
        `INSERT INTO tbl_case_assignments (patient_id, referral_id, user_id, assigned_by, reason)
         VALUES ($1, $2, $3, $4, 'Referral')`,
        [patientId, referral.id, assignee, userId]
      );
    }

    await client.query("UPDATE tbl_screenings SET case_state = 'REFERRAL_PLANNED' WHERE id = $1", [review.screening_id]);

    // Remove patient from MO active community treatment workflow while referral is open.
    const careLifecycleService = require("../careLifecycleService");
    await careLifecycleService.parkMoCarePlansForSpecialistReferral(client, {
      patientId,
      userId,
      referralId: referral.id,
      reason: `REFERRAL_CREATED:${referral.referral_code}`,
    });

    await audit(req, {
      client,
      required: true,
      event: "REFERRAL_CREATED",
      resourceType: "referral",
      resourceId: referral.id,
      patientId,
      metadata: { referral_code: referral.referral_code, specialty_id: data.specialtyId, priority_id: data.priorityId },
    });
    return referral;
  });
}

// Referrals of patients in my Mandals
async function listReferrals(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const params = [userId];
  let statusSql = "";
  if (STATUSES.includes(String(query.status || "").toUpperCase())) {
    params.push(String(query.status).toUpperCase());
    statusSql = `AND r.status::text = $${params.length}`;
  }
  const fromSql = `
    FROM tbl_referrals r
    JOIN tbl_patients p ON p.id = r.patient_id
    JOIN mst_villages pv ON pv.id = p.village_id
   WHERE ${mandalScope("$1")} ${statusSql}`;

  const listParams = [...params, pageSize, offset];
  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params),
    pool.query(
      `SELECT r.id, r.referral_code, r.status::text AS status, r.mode::text AS mode, r.reason,
              r.created_at, r.updated_at, r.assessment_completed_at, r.created_by = $1 AS created_by_me,
              p.patient_code,
              h.name_en AS hospital_name, h.name_te AS hospital_name_te,
              sp.name_en AS specialty_name, sp.name_te AS specialty_name_te,
              pr.name_en AS priority_name, pr.name_te AS priority_name_te, pr.code AS priority_code,
              specialist.full_name AS specialist_name, navigator.full_name AS navigator_name
       ${fromSql.replace("WHERE", `
    JOIN mst_hospitals h ON h.id = r.to_hospital_id
    JOIN mst_specialties sp ON sp.id = r.specialty_id
    JOIN mst_referral_priorities pr ON pr.id = r.priority_id
    LEFT JOIN tbl_users specialist ON specialist.id = r.assigned_specialist_id
    LEFT JOIN tbl_users navigator ON navigator.id = r.assigned_navigator_id
   WHERE`)}
        ORDER BY r.created_at DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    ),
  ]);
  return { referrals: rows.rows, pagination: pagination(page, pageSize, Number(count.rows[0].total)) };
}

async function getReferralHistory(userId, referralId) {
  requireUuid(referralId, "Invalid referral ID");
  const [history, decision] = await Promise.all([
    pool.query(
      `SELECT h.from_status::text AS from_status, h.to_status::text AS to_status, h.reason, h.changed_at,
              u.full_name AS changed_by_name
         FROM tbl_referral_status_history h
         JOIN tbl_referrals r ON r.id = h.referral_id
         JOIN tbl_patients p ON p.id = r.patient_id
         JOIN mst_villages pv ON pv.id = p.village_id
         LEFT JOIN tbl_users u ON u.id = h.changed_by
        WHERE h.referral_id = $2 AND ${mandalScope("$1")}
        ORDER BY h.changed_at`,
      [userId, referralId]
    ).catch((error) => {
      if (error.code !== "42P01") throw error;
      console.error("Medical Officer Specialist decision query failed: decision migration is not applied");
      return { rows: [], decisionStorageUnavailable: true };
    }),
    pool.query(
      `SELECT d.decision_type, d.clinical_reason, d.clinical_recommendation,
              d.instructions, d.follow_up_date, d.signed_at,
              specialist.full_name AS specialist_name,
              hospital.name_en AS hospital_name,
              investigation.name_en AS investigation_name
         FROM tbl_specialist_consultation_decisions d
         JOIN tbl_referrals r ON r.id = d.referral_id AND r.patient_id = d.patient_id
         JOIN tbl_patients p ON p.id = r.patient_id
         JOIN mst_villages pv ON pv.id = p.village_id
         JOIN tbl_users specialist ON specialist.id = d.specialist_id
         LEFT JOIN mst_hospitals hospital ON hospital.id = d.hospital_id
         LEFT JOIN mst_investigation_types investigation ON investigation.id = d.investigation_type_id
        WHERE d.referral_id = $2 AND d.status = 'SIGNED' AND ${mandalScope("$1")}
        LIMIT 1`,
      [userId, referralId]
    ),
  ]);
  return {
    history: history.rows,
    specialist_decision: decision.rows[0] || null,
    decision_storage_unavailable: decision.decisionStorageUnavailable === true,
  };
}

module.exports = { MODES, STATUSES, getReferralOptions, createReferral, listReferrals, getReferralHistory, normalizeReferral };
