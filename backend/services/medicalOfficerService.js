const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { activeScreeningOrder } = require("../utils/screeningSelection");
const { createInAppNotifications } = require("./notificationService");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CASES_PAGE_SIZE = 20;
const MAX_CASES_PAGE_SIZE = 100;

function validatePatientId(patientId) {
  if (typeof patientId !== "string" || !UUID_PATTERN.test(patientId)) {
    throw new HttpError(400, "Invalid patient ID", "INVALID_PATIENT");
  }
  return patientId;
}

function parsePageNumber(value, fallback, label) {
  if (value === undefined) return fallback;
  if ((typeof value !== "string" && typeof value !== "number")
    || !/^\d+$/.test(String(value))) {
    throw new HttpError(400, `${label} must be a positive integer`, "INVALID_PAGINATION");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(400, `${label} must be a positive integer`, "INVALID_PAGINATION");
  }
  return parsed;
}

async function listCases(userId, view, query = {}) {
  if (!["available", "mine"].includes(view)) {
    throw new HttpError(400, "Queue view must be available or mine", "INVALID_QUEUE_VIEW");
  }
  const requestedPage = parsePageNumber(query.page, 1, "Page");
  const pageSize = parsePageNumber(query.limit, DEFAULT_CASES_PAGE_SIZE, "Limit");
  if (pageSize > MAX_CASES_PAGE_SIZE) {
    throw new HttpError(400, `Limit cannot exceed ${MAX_CASES_PAGE_SIZE}`, "INVALID_PAGINATION");
  }

  const purpose = typeof query.purpose === "string" ? query.purpose : "";
  // New-referral picker: only patients ready for a first/open referral create.
  // Already-referred (PLANNED/SENT/ACCEPTED) patients are excluded — backend enforced.
  const referralPurposeSql = purpose === "referral"
    ? `AND $2 = 'mine'
       AND s.signed_at IS NOT NULL
       AND s.case_state = 'REVIEWED'
       AND s.review_decision IN ('SPECIALIST_REVIEW', 'URGENT_REFERRAL')
       AND NOT EXISTS (
         SELECT 1 FROM tbl_referrals open_ref
          WHERE open_ref.patient_id = p.id
            AND open_ref.status IN ('PLANNED', 'SENT', 'ACCEPTED')
       )`
    : "";

  const fromSql = `
       FROM tbl_patients p
       JOIN mst_villages v ON v.id=p.village_id
       JOIN mst_mandals m ON m.id=COALESCE(p.mandal_id,v.mandal_id)
       JOIN mst_facilities f ON f.id=p.registered_facility_id
       JOIN LATERAL (
         SELECT screening.id,screening.screening_date,screening.case_state,
                screening.chief_complaint,review.signed_at,
                review.decision::text AS review_decision
           FROM tbl_screenings screening
           LEFT JOIN tbl_clinical_reviews review ON review.screening_id=screening.id
          WHERE screening.patient_id=p.id
          ORDER BY ${activeScreeningOrder("screening")}
          LIMIT 1
       ) s ON TRUE
       LEFT JOIN LATERAL (
         SELECT pc.granted
           FROM tbl_patient_consents pc
           JOIN mst_consent_purposes purpose ON purpose.id=pc.purpose_id
          WHERE pc.patient_id=p.id AND purpose.code='SCREENING'
          ORDER BY pc.consent_seq DESC
          LIMIT 1
       ) consent ON TRUE
       LEFT JOIN tbl_medical_officer_case_claims c
         ON c.patient_id=p.id AND c.released_at IS NULL
      WHERE p.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM tbl_medical_officer_mandal_assignments a
          WHERE a.user_id=$1
            AND a.mandal_id=COALESCE(p.mandal_id,v.mandal_id)
            AND a.valid_from <= CURRENT_DATE
            AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        )
        AND (
          ($2='available' AND consent.granted IS TRUE AND c.id IS NULL
            AND s.case_state='AWAITING_CLINICIAN'
            AND (s.signed_at IS NULL OR s.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO')))
          OR ($2='mine' AND c.medical_officer_id=$1)
        )
        ${referralPurposeSql}`;

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, [userId, view]);
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT p.id,p.patient_code,
            CASE WHEN $2='mine' AND consent.granted IS TRUE THEN p.sex END AS sex,
            CASE WHEN $2='mine' AND consent.granted IS TRUE THEN p.age_years END AS age_years,
            COALESCE(p.mandal_id,v.mandal_id) AS mandal_id,
            m.name_en AS mandal_name,m.name_te AS mandal_name_te,
            v.name_en AS village_name,v.name_te AS village_name_te,
            f.name_en AS facility_name,f.name_te AS facility_name_te,
            s.id AS screening_id,
            CASE WHEN consent.granted IS TRUE THEN s.screening_date END AS screening_date,
            CASE WHEN consent.granted IS TRUE THEN s.case_state END AS case_state,
            CASE WHEN $2='mine' AND consent.granted IS TRUE
                 THEN s.chief_complaint ELSE NULL END AS chief_complaint,
            c.id AS claim_id,c.claimed_at
       ${fromSql}
      ORDER BY s.screening_date DESC,s.id
      LIMIT $3 OFFSET $4`,
    [userId, view, pageSize, offset]
  );
  const cases = view === "available"
    ? rows.map(({ sex, age_years, ...caseRow }) => caseRow)
    : rows;
  return {
    cases,
    pagination: { total, page, page_size: pageSize, total_pages: totalPages },
  };
}

async function claimCase(userId, req, patientId) {
  patientId = validatePatientId(patientId);
  const client = await pool.connect();
  let transactionStarted = false;
  let claim;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const eligible = await client.query(
      `SELECT p.id
         FROM tbl_patients p
         JOIN mst_villages v ON v.id=p.village_id
         JOIN LATERAL (
           SELECT screening.case_state,review.signed_at,
                  review.decision::text AS review_decision
             FROM tbl_screenings screening
             LEFT JOIN tbl_clinical_reviews review ON review.screening_id=screening.id
            WHERE screening.patient_id=p.id
            ORDER BY ${activeScreeningOrder("screening")}
            LIMIT 1
         ) latest_screening ON TRUE
        LEFT JOIN LATERAL (
            SELECT pc.granted
              FROM tbl_patient_consents pc
              JOIN mst_consent_purposes purpose ON purpose.id=pc.purpose_id
             WHERE pc.patient_id=p.id AND purpose.code='SCREENING'
             ORDER BY pc.consent_seq DESC
             LIMIT 1
        ) latest_consent ON TRUE
        WHERE p.id=$1 AND p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM tbl_medical_officer_mandal_assignments a
            WHERE a.user_id=$2
              AND a.mandal_id=COALESCE(p.mandal_id,v.mandal_id)
              AND a.valid_from <= CURRENT_DATE
              AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
          )
          AND latest_screening.case_state='AWAITING_CLINICIAN'
          AND (latest_screening.signed_at IS NULL
               OR latest_screening.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO'))
          AND latest_consent.granted IS TRUE
        FOR SHARE OF p`,
      [patientId, userId]
    );
    if (!eligible.rows.length) {
      throw new HttpError(404, "Case is not available in your assigned Mandals", "CASE_NOT_AVAILABLE");
    }

    const inserted = await client.query(
      `INSERT INTO tbl_medical_officer_case_claims (patient_id,medical_officer_id)
       VALUES ($1,$2)
       RETURNING id,patient_id,medical_officer_id,claimed_at`,
      [patientId, userId]
    );
    claim = inserted.rows[0];
    await audit(req, {
      client,
      required: true,
      event: "MEDICAL_OFFICER_CASE_CLAIMED",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
    });
    await createInAppNotifications(client, {
      recipients: [userId],
      patientId,
      event: "CASE_ASSIGNED_TO_MO",
      title: "Patient assigned for clinical review",
      message: "You claimed this patient. Open clinical review to continue.",
      targetPath: `/medical-officer/review?patient=${patientId}`,
      dedupeKey: `CASE_ASSIGNED_TO_MO:${claim.id}`,
    });
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "uq_mo_claim_one_active_per_patient") {
      throw new HttpError(409, "Another Medical Officer has already claimed this patient", "CASE_ALREADY_CLAIMED");
    }
    if (error.code === "P0001" && /not assigned to the patient Mandal/i.test(error.message)) {
      throw new HttpError(403, "You are not assigned to the patient Mandal", "MANDAL_NOT_ASSIGNED");
    }
    throw error;
  } finally {
    client.release();
  }

  return claim;
}

async function releaseCase(userId, req, patientId) {
  patientId = validatePatientId(patientId);
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const { rows } = await client.query(
      `UPDATE tbl_medical_officer_case_claims
          SET released_at=now(),released_by=$1
        WHERE patient_id=$2 AND medical_officer_id=$1 AND released_at IS NULL
        RETURNING id,patient_id,released_at`,
      [userId, patientId]
    );
    if (!rows.length) {
      throw new HttpError(409, "There is no active claim for this patient assigned to you", "CLAIM_NOT_OWNED");
    }

    await audit(req, {
      client,
      required: true,
      event: "MEDICAL_OFFICER_CASE_RELEASED",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
    });
    await client.query("COMMIT");
    transactionStarted = false;
    return rows[0];
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listCases, claimCase, releaseCase };
