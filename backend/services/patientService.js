const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { activeScreeningOrder } = require("../utils/screeningSelection");

const SEX_VALUES = new Set(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Consents asked at registration (codes of mst_consent_purposes).
// DATA_PROCESSING must be granted: without it the record may not be stored.
const CONSENT_CODES = ["DATA_PROCESSING", "SCREENING", "IMAGE_CAPTURE"];
const CONSENT_METHODS = new Set(["CHECKBOX", "VERBAL_WITNESSED", "SIGNATURE", "THUMBPRINT"]);
const WITNESS_METHODS = new Set(["VERBAL_WITNESSED", "THUMBPRINT"]);

function normalizeConsent(input = {}) {
  const answers = input.consents && typeof input.consents === "object" ? input.consents : {};
  if (answers.DATA_PROCESSING !== true) {
    throw new HttpError(400, "Data processing consent is required to register a patient", "CONSENT_REQUIRED");
  }
  for (const code of ["SCREENING", "IMAGE_CAPTURE"]) {
    if (typeof answers[code] !== "boolean") {
      throw new HttpError(400, "Record the patient's answer for every consent", "INVALID_CONSENT");
    }
  }
  const method = typeof input.consent_method === "string" ? input.consent_method.trim().toUpperCase() : "";
  if (!CONSENT_METHODS.has(method)) {
    throw new HttpError(400, "Select how consent was given", "INVALID_CONSENT");
  }
  const witnessName = typeof input.witness_name === "string" ? input.witness_name.trim() : "";
  if (WITNESS_METHODS.has(method) && !witnessName) {
    throw new HttpError(400, "A witness name is required for verbal or thumbprint consent", "INVALID_CONSENT");
  }
  if (witnessName.length > 150) {
    throw new HttpError(400, "Witness name must be at most 150 characters", "INVALID_CONSENT");
  }
  return {
    answers: Object.fromEntries(CONSENT_CODES.map((code) => [code, answers[code]])),
    method,
    witnessName: witnessName || null,
  };
}

/**
 * Optional offline client timestamps. Validated for shape/range only —
 * never treated as proof that consent was lawfully obtained.
 * Server receipt time remains tbl_patients.created_at (DEFAULT now()).
 */
function normalizeClientTimestamp(value, fieldName) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Invalid ${fieldName}`, "INVALID_CLIENT_TIMESTAMP");
  }
  const now = Date.now();
  // Allow 5 minutes of clock skew; reject far-future or older than 30 days
  if (parsed.getTime() > now + 5 * 60 * 1000) {
    throw new HttpError(400, `${fieldName} cannot be in the future`, "INVALID_CLIENT_TIMESTAMP");
  }
  if (parsed.getTime() < now - 30 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, `${fieldName} is too old`, "INVALID_CLIENT_TIMESTAMP");
  }
  return parsed.toISOString();
}

function normalizePatient(input = {}) {
  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const sex = typeof input.sex === "string" ? input.sex.trim().toUpperCase() : "";
  const ageYears = input.age_years == null || input.age_years === "" ? null : Number(input.age_years);
  const dateOfBirth = input.date_of_birth == null || input.date_of_birth === "" ? null : input.date_of_birth;
  const villageId = Number(input.village_id);
  const facilityId = Number(input.facility_id);
  const habitation = typeof input.habitation === "string" ? input.habitation.trim() : null;
  const addressLine = typeof input.address_line === "string" ? input.address_line.trim() : null;

  if (!fullName || fullName.length > 150) {
    throw new HttpError(400, "Patient name is required and must be at most 150 characters", "INVALID_PATIENT");
  }
  if (!SEX_VALUES.has(sex)) {
    throw new HttpError(400, "Select a valid sex value", "INVALID_PATIENT");
  }
  if (!Number.isSafeInteger(villageId) || villageId < 1
      || !Number.isSafeInteger(facilityId) || facilityId < 1) {
    throw new HttpError(400, "Select an assigned village and facility", "INVALID_LOCATION");
  }
  if (ageYears != null && (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120)) {
    throw new HttpError(400, "Age must be between 0 and 120", "INVALID_PATIENT");
  }
  if (dateOfBirth != null) {
    const parsedDate = typeof dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      ? new Date(`${dateOfBirth}T00:00:00Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth) {
      throw new HttpError(400, "Enter a valid date of birth", "INVALID_PATIENT");
    }
  }
  if (ageYears == null && dateOfBirth == null) {
    throw new HttpError(400, "Enter an age or date of birth", "INVALID_PATIENT");
  }
  if (habitation && habitation.length > 150) {
    throw new HttpError(400, "Habitation must be at most 150 characters", "INVALID_PATIENT");
  }
  if (addressLine && addressLine.length > 500) {
    throw new HttpError(400, "Address must be at most 500 characters", "INVALID_PATIENT");
  }
  const languageId = Number(input.preferred_language_id);
  if (!Number.isSafeInteger(languageId) || languageId < 1) {
    throw new HttpError(400, "Select the patient's preferred language", "INVALID_PATIENT");
  }
  // Optional key sent by the form so a repeated submit does not create a second patient
  const idempotencyKey = UUID_PATTERN.test(String(input.idempotency_key || "")) ? input.idempotency_key : null;
  const clientCreatedAt = normalizeClientTimestamp(input.client_created_at, "client_created_at");
  const consentCapturedAt = normalizeClientTimestamp(input.consent_captured_at, "consent_captured_at");

  return {
    fullName,
    normalizedName: normalizePatientName(fullName),
    sex,
    ageYears,
    dateOfBirth,
    villageId,
    facilityId,
    habitation: habitation || null,
    addressLine: addressLine || null,
    languageId,
    idempotencyKey,
    clientCreatedAt,
    consentCapturedAt,
    consent: normalizeConsent(input),
  };
}

function normalizePatientName(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeDuplicateInput(input = {}) {
  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const sex = typeof input.sex === "string" ? input.sex.trim().toUpperCase() : "";
  const ageYears = input.age_years == null || input.age_years === "" ? null : Number(input.age_years);
  const dateOfBirth = input.date_of_birth == null || input.date_of_birth === "" ? null : input.date_of_birth;
  const villageId = Number(input.village_id);
  const facilityId = Number(input.facility_id);

  if (!fullName || fullName.length > 150) {
    throw new HttpError(400, "Patient name is required and must be at most 150 characters", "INVALID_PATIENT");
  }
  if (!SEX_VALUES.has(sex)) {
    throw new HttpError(400, "Select a valid sex value", "INVALID_PATIENT");
  }
  if (ageYears != null && (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120)) {
    throw new HttpError(400, "Age must be between 0 and 120", "INVALID_PATIENT");
  }
  if (dateOfBirth != null) {
    const parsedDate = typeof dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      ? new Date(`${dateOfBirth}T00:00:00Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth) {
      throw new HttpError(400, "Enter a valid date of birth", "INVALID_PATIENT");
    }
  }
  if (ageYears == null && dateOfBirth == null) {
    throw new HttpError(400, "Enter an age or date of birth", "INVALID_PATIENT");
  }
  if (!Number.isSafeInteger(villageId) || villageId < 1
      || !Number.isSafeInteger(facilityId) || facilityId < 1) {
    throw new HttpError(400, "Select an assigned village and facility", "INVALID_LOCATION");
  }
  return { fullName, normalizedName: normalizePatientName(fullName), sex, ageYears, dateOfBirth, villageId, facilityId };
}

// Proposed migration 017 lets a Health Worker register patients in every active
// village of an assigned Mandal, at any active facility of that Mandal.
// Until it is applied, only the exact assigned village + facility pairs are allowed.
const MANDAL_WIDE_MIGRATION = "017_health_worker_mandal_registration.sql";

async function isMandalWideRegistration(db = pool) {
  try {
    const { rows } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $1) AS enabled`,
      [MANDAL_WIDE_MIGRATION]
    );
    return rows[0]?.enabled === true;
  } catch {
    return false;
  }
}

async function assertAssignedLocation(db, userId, patient, mandalWide) {
  const assignment = mandalWide
    ? await db.query(
      `SELECT a.mandal_id
         FROM tbl_health_worker_location_assignments a
         JOIN mst_mandals m ON m.id=a.mandal_id AND m.is_active IS TRUE
         JOIN mst_villages v ON v.id=$2 AND v.mandal_id=a.mandal_id AND v.is_active IS TRUE
         JOIN mst_facilities f ON f.id=$3 AND f.mandal_id=a.mandal_id AND f.is_active IS TRUE
        WHERE a.user_id=$1
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        LIMIT 1
        FOR SHARE OF a`,
      [userId, patient.villageId, patient.facilityId]
    )
    : await db.query(
      `SELECT a.mandal_id
         FROM tbl_health_worker_location_assignments a
         JOIN mst_districts d ON d.id=a.district_id AND d.is_active IS TRUE
         JOIN mst_mandals m ON m.id=a.mandal_id AND m.is_active IS TRUE
         JOIN mst_villages v ON v.id=a.village_id AND v.is_active IS TRUE
         JOIN mst_facilities f ON f.id=a.facility_id AND f.is_active IS TRUE
        WHERE a.user_id=$1
          AND a.village_id=$2
          AND a.facility_id=$3
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        FOR SHARE OF a`,
      [userId, patient.villageId, patient.facilityId]
    );
  if (!assignment.rows.length) {
    throw new HttpError(403, "You are not assigned to this village and facility", "LOCATION_NOT_ASSIGNED");
  }
}

async function findPossibleDuplicates(db, userId, patient) {
  const values = [userId, patient.normalizedName, patient.sex];
  let identityMatch;
  let matchType;
  if (patient.dateOfBirth) {
    values.push(patient.dateOfBirth);
    identityMatch = "p.date_of_birth=$4";
    matchType = "NAME_SEX_DATE_OF_BIRTH";
  } else {
    values.push(patient.villageId, patient.ageYears);
    identityMatch = `p.village_id=$4
      AND COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int)=$5`;
    matchType = "NAME_SEX_AGE_VILLAGE";
  }
  const { rows } = await db.query(
    `SELECT p.id,p.patient_code,p.full_name,p.sex::text AS sex,p.age_years,p.date_of_birth,p.created_at,
            v.name_en AS village_name,v.name_te AS village_name_te,
            f.name_en AS facility_name,f.name_te AS facility_name_te
       FROM tbl_patients p
       JOIN mst_villages v ON v.id=p.village_id
       JOIN mst_facilities f ON f.id=p.registered_facility_id
      WHERE p.deleted_at IS NULL
        AND fn_user_has_patient_access($1,p.id)
        AND regexp_replace(lower(btrim(p.full_name)), '[[:space:]]+', ' ', 'g')=$2
        AND p.sex=$3::sex_type
        AND ${identityMatch}
      ORDER BY p.created_at DESC
      LIMIT 10`,
    values
  );
  return rows.map((row) => ({ ...row, match_type: matchType }));
}

async function checkDuplicates(userId, input) {
  const patient = normalizeDuplicateInput(input);
  const mandalWide = await isMandalWideRegistration();
  await assertAssignedLocation(pool, userId, patient, mandalWide);
  return findPossibleDuplicates(pool, userId, patient);
}

async function searchPatients(userId, input = {}) {
  const query = typeof input.q === "string" ? input.q.trim() : "";
  if (query.length < 2 || query.length > 100) {
    throw new HttpError(400, "Enter at least 2 and at most 100 search characters", "INVALID_SEARCH");
  }
  const page = input.page == null ? 1 : Number(input.page);
  const limit = input.limit == null ? 20 : Number(input.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new HttpError(400, "Search page or result limit is invalid", "INVALID_SEARCH");
  }
  const term = `%${escapeLike(query)}%`;
  const offset = (page - 1) * limit;
  const [results, count] = await Promise.all([
    pool.query(
      `SELECT p.id,p.patient_code,p.full_name,p.sex::text AS sex,p.age_years,p.date_of_birth,p.created_at,
              v.name_en AS village_name,v.name_te AS village_name_te,
              f.name_en AS facility_name,f.name_te AS facility_name_te
         FROM tbl_patients p
         JOIN mst_villages v ON v.id=p.village_id
         JOIN mst_facilities f ON f.id=p.registered_facility_id
        WHERE p.deleted_at IS NULL
          AND fn_user_has_patient_access($1,p.id)
          AND (p.full_name ILIKE $2 ESCAPE '\\'
            OR p.patient_code ILIKE $2 ESCAPE '\\'
            OR p.id::text ILIKE $2 ESCAPE '\\')
        ORDER BY p.full_name, p.patient_code
        LIMIT $3 OFFSET $4`,
      [userId, term, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total
         FROM tbl_patients p
        WHERE p.deleted_at IS NULL
          AND fn_user_has_patient_access($1,p.id)
          AND (p.full_name ILIKE $2 ESCAPE '\\'
            OR p.patient_code ILIKE $2 ESCAPE '\\'
            OR p.id::text ILIKE $2 ESCAPE '\\')`,
      [userId, term]
    ),
  ]);
  const total = Number(count.rows[0]?.total || 0);
  return { patients: results.rows, page, limit, total, pages: Math.ceil(total / limit) };
}

const CURRENT_SCREENING_CONSENT = `(
  SELECT pc.granted
    FROM tbl_patient_consents pc
    JOIN mst_consent_purposes cp ON cp.id=pc.purpose_id AND cp.code='SCREENING'
   WHERE pc.patient_id=$1
   ORDER BY pc.consent_seq DESC
   LIMIT 1
) IS TRUE`;

async function getPatientDetails(userId, patientId) {
  if (!UUID_PATTERN.test(String(patientId || ""))) {
    throw new HttpError(404, "Patient not found", "PATIENT_NOT_FOUND");
  }
  const { rows: patientRows } = await pool.query(
    `SELECT p.id,p.patient_code,p.full_name,p.sex::text AS sex,p.age_years,p.date_of_birth,p.created_at,
            registrar.full_name AS registered_by,
            d.name_en AS district_name,d.name_te AS district_name_te,
            m.name_en AS mandal_name,m.name_te AS mandal_name_te,
            v.name_en AS village_name,v.name_te AS village_name_te,
            f.name_en AS facility_name,f.name_te AS facility_name_te
       FROM tbl_patients p
       JOIN tbl_users registrar ON registrar.id=p.registered_by
       JOIN mst_villages v ON v.id=p.village_id
       JOIN mst_mandals m ON m.id=COALESCE(p.mandal_id,v.mandal_id)
       JOIN mst_districts d ON d.id=m.district_id
       JOIN mst_facilities f ON f.id=p.registered_facility_id
      WHERE p.id=$2 AND p.deleted_at IS NULL AND fn_user_has_patient_access($1,p.id)`,
    [userId, patientId]
  );
  if (!patientRows.length) throw new HttpError(404, "Patient not found", "PATIENT_NOT_FOUND");
  const access = "EXISTS (SELECT 1 FROM tbl_patients p WHERE p.id=$1 AND p.deleted_at IS NULL AND fn_user_has_patient_access($2,p.id))";
  const [consents, history, findings, screenings, referrals] = await Promise.all([
    pool.query(
      `SELECT DISTINCT ON (cp.code) cp.code AS purpose,pc.granted,pc.method::text AS method,
              pc.consent_version,pc.captured_at,recorder.full_name AS recorded_by
         FROM tbl_patient_consents pc
         JOIN mst_consent_purposes cp ON cp.id=pc.purpose_id
         JOIN tbl_users recorder ON recorder.id=pc.captured_by
        WHERE pc.patient_id=$1 AND ${access}
        ORDER BY cp.code,pc.consent_seq DESC`,
      [patientId, userId]
    ),
    pool.query(
      `SELECT h.history_kind::text AS history_kind,h.condition_text,h.duration_years,
              h.frequency_per_day,h.is_current,h.event_date,h.recorded_at,
              e.code AS exposure_code,e.name_en AS exposure_name,e.name_te AS exposure_name_te,
              recorder.full_name AS recorded_by
         FROM tbl_patient_medical_histories h
         LEFT JOIN mst_exposure_types e ON e.id=h.exposure_type_id
         JOIN tbl_users recorder ON recorder.id=h.recorded_by
        WHERE h.patient_id=$1 AND ${access}
           AND ${CURRENT_SCREENING_CONSENT}
         ORDER BY h.recorded_at DESC`,
      [patientId, userId]
    ),
    pool.query(
      `SELECT s.id AS screening_id,s.screening_date,
              f.finding_kind::text AS finding_kind,f.oral_site::text AS oral_site,
              f.description,f.duration_days,f.recorded_at,
              symptom.code AS symptom_code,symptom.name_en AS symptom_name,
              symptom.name_te AS symptom_name_te,recorder.full_name AS recorded_by
         FROM tbl_screening_findings f
         JOIN tbl_screenings s ON s.id=f.screening_id
         LEFT JOIN mst_symptoms symptom ON symptom.id=f.symptom_id
         JOIN tbl_users recorder ON recorder.id=f.recorded_by
        WHERE s.patient_id=$1 AND ${access}
          AND ${CURRENT_SCREENING_CONSENT}
        ORDER BY f.recorded_at DESC`,
      [patientId, userId]
    ),
    pool.query(
      `SELECT s.id,s.screening_date,s.case_state::text AS case_state,s.submitted_at,
              ai.ai_status,review.decision::text AS medical_officer_decision,review.signed_at AS reviewed_at,
              CASE WHEN screening_consent.granted IS TRUE AND review.signed_at IS NOT NULL
                         AND review.decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')
                   THEN review.request_note END AS medical_officer_request_note
         FROM tbl_screenings s
         LEFT JOIN LATERAL (
           SELECT CASE
                   WHEN COUNT(*)=0 THEN NULL
                   WHEN COUNT(*) FILTER (WHERE latest.status='COMPLETED')=COUNT(*) THEN 'COMPLETED'
                   WHEN COUNT(*) FILTER (WHERE latest.status='COMPLETED') > 0 THEN 'PARTIAL'
                   WHEN COUNT(*) FILTER (WHERE latest.status IN ('FAILED','UNAVAILABLE'))=COUNT(*) THEN 'UNAVAILABLE'
                   ELSE 'PENDING'
                 END AS ai_status
            FROM (
              SELECT DISTINCT ON (a.photo_id) a.status::text AS status
                FROM tbl_ai_assessments a
               WHERE a.screening_id=s.id
               ORDER BY a.photo_id,a.requested_at DESC,a.attempt_no DESC,a.id DESC
            ) latest
         ) ai ON TRUE
         LEFT JOIN tbl_clinical_reviews review ON review.screening_id=s.id
         LEFT JOIN LATERAL (
           SELECT pc.granted
             FROM tbl_patient_consents pc
             JOIN mst_consent_purposes cp ON cp.id=pc.purpose_id AND cp.code='SCREENING'
            WHERE pc.patient_id=s.patient_id
            ORDER BY pc.consent_seq DESC
            LIMIT 1
         ) screening_consent ON TRUE
        WHERE s.patient_id=$1 AND ${access}
          AND screening_consent.granted IS TRUE
        ORDER BY s.screening_date DESC,s.created_at DESC`,
      [patientId, userId]
    ),
    pool.query(
      `SELECT r.id,r.referral_code,r.status::text AS status,r.created_at,
              h.name_en AS hospital_name,h.name_te AS hospital_name_te,
              sp.name_en AS specialty_name,sp.name_te AS specialty_name_te
         FROM tbl_referrals r
         JOIN mst_hospitals h ON h.id=r.to_hospital_id
         JOIN mst_specialties sp ON sp.id=r.specialty_id
        WHERE r.patient_id=$1 AND ${access}
          AND ${CURRENT_SCREENING_CONSENT}
        ORDER BY r.created_at DESC`,
      [patientId, userId]
    ),
  ]);
  return {
    patient: patientRows[0],
    consents: consents.rows,
    medical_history: history.rows,
    findings: findings.rows,
    screenings: screenings.rows,
    referrals: referrals.rows,
  };
}

// Registration choices grouped by Mandal: district and Mandal are fixed by the
// assignment; the worker picks a village and a facility of that Mandal.
async function getRegistrationChoices(userId, locations) {
  const mandalWide = await isMandalWideRegistration();
  const mandals = new Map();
  for (const location of locations) {
    if (!mandals.has(location.mandal_id)) {
      mandals.set(location.mandal_id, {
        district_id: location.district_id,
        district_name: location.district_name,
        district_name_te: location.district_name_te,
        mandal_id: location.mandal_id,
        mandal_name: location.mandal_name,
        mandal_name_te: location.mandal_name_te,
        villages: new Map(),
        facilities: new Map(),
        pairs: [],
      });
    }
    const mandal = mandals.get(location.mandal_id);
    mandal.villages.set(location.village_id, { id: location.village_id, name_en: location.village_name, name_te: location.village_name_te });
    mandal.facilities.set(location.facility_id, { id: location.facility_id, name_en: location.facility_name, name_te: location.facility_name_te });
    mandal.pairs.push({ village_id: location.village_id, facility_id: location.facility_id });
  }

  if (mandalWide && mandals.size) {
    const mandalIds = [...mandals.keys()];
    const [villages, facilities] = await Promise.all([
      pool.query(
        `SELECT id, mandal_id, name_en, name_te FROM mst_villages
          WHERE mandal_id = ANY($1::bigint[]) AND is_active IS TRUE ORDER BY name_en`,
        [mandalIds]
      ),
      pool.query(
        `SELECT id, mandal_id, name_en, name_te, facility_type::text AS facility_type FROM mst_facilities
          WHERE mandal_id = ANY($1::bigint[]) AND is_active IS TRUE ORDER BY name_en`,
        [mandalIds]
      ),
    ]);
    for (const mandal of mandals.values()) {
      mandal.villages = new Map();
      mandal.facilities = new Map();
    }
    villages.rows.forEach((row) => mandals.get(row.mandal_id)?.villages.set(row.id, row));
    facilities.rows.forEach((row) => mandals.get(row.mandal_id)?.facilities.set(row.id, row));
  }

  return {
    mandal_wide: mandalWide,
    mandals: [...mandals.values()].map((mandal) => ({
      ...mandal,
      villages: [...mandal.villages.values()],
      facilities: [...mandal.facilities.values()],
      // Without the Mandal-wide rule, only these village + facility pairs may be used
      pairs: mandalWide ? [] : mandal.pairs,
    })),
  };
}

async function getRegistrationOptions(userId) {
  const { rows } = await pool.query(
    `SELECT a.id AS assignment_id,a.district_id,d.name_en AS district_name,d.name_te AS district_name_te,
            a.mandal_id,m.name_en AS mandal_name,m.name_te AS mandal_name_te,
            a.village_id,v.name_en AS village_name,v.name_te AS village_name_te,
            a.facility_id,f.name_en AS facility_name,f.name_te AS facility_name_te
       FROM tbl_health_worker_location_assignments a
       JOIN mst_districts d ON d.id=a.district_id AND d.is_active IS TRUE
       JOIN mst_mandals m ON m.id=a.mandal_id AND m.is_active IS TRUE
       JOIN mst_villages v ON v.id=a.village_id AND v.is_active IS TRUE
       JOIN mst_facilities f ON f.id=a.facility_id AND f.is_active IS TRUE
      WHERE a.user_id=$1
        AND a.valid_from <= CURRENT_DATE
        AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
      ORDER BY m.name_en,v.name_en,f.name_en`,
    [userId]
  );
  return rows;
}

// Languages and consent texts shown on the registration form
async function getFormOptions() {
  const [languages, purposes] = await Promise.all([
    pool.query("SELECT id,code,name_en,native_name FROM mst_languages WHERE is_active IS TRUE ORDER BY id"),
    pool.query(
      `SELECT code,name_en,name_te,text_en,text_te,version
         FROM mst_consent_purposes
        WHERE is_active IS TRUE AND code = ANY($1::text[])`,
      [CONSENT_CODES]
    ),
  ]);
  const byCode = Object.fromEntries(purposes.rows.map((row) => [row.code, row]));
  return {
    languages: languages.rows,
    consent_purposes: CONSENT_CODES.filter((code) => byCode[code]).map((code) => byCode[code]),
  };
}

// Latest SCREENING consent of a patient (consents are append-only; the newest row counts)
const SCREENING_CONSENT = `
  LEFT JOIN LATERAL (
    SELECT pc.granted
      FROM tbl_patient_consents pc
      JOIN mst_consent_purposes cp ON cp.id=pc.purpose_id AND cp.code='SCREENING'
     WHERE pc.patient_id=p.id
     ORDER BY pc.consent_seq DESC
     LIMIT 1
  ) screening_consent ON TRUE`;

async function listMine(userId) {
  const { rows } = await pool.query(
    `SELECT p.id,p.patient_code,p.full_name,p.sex,p.age_years,p.date_of_birth,
            p.created_at,v.name_en AS village_name,v.name_te AS village_name_te,
            m.name_en AS mandal_name,m.name_te AS mandal_name_te,
            f.name_en AS facility_name,f.name_te AS facility_name_te,
            screening_consent.granted IS TRUE AS screening_consent,
            CASE WHEN screening_consent.granted IS TRUE THEN latest.case_state::text END AS case_state,
            CASE WHEN screening_consent.granted IS TRUE AND latest.signed_at IS NOT NULL
                 THEN latest.decision::text END AS medical_officer_decision,
            CASE WHEN screening_consent.granted IS TRUE AND latest.signed_at IS NOT NULL
                       AND latest.decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')
                 THEN latest.request_note END AS medical_officer_request_note,
            CASE WHEN screening_consent.granted IS TRUE THEN latest.signed_at END AS reviewed_at
       FROM tbl_patients p
       JOIN mst_villages v ON v.id=p.village_id
       JOIN mst_mandals m ON m.id=COALESCE(p.mandal_id,v.mandal_id)
       JOIN mst_facilities f ON f.id=p.registered_facility_id
       ${SCREENING_CONSENT}
       LEFT JOIN LATERAL (
         SELECT s.case_state,review.decision,review.request_note,review.signed_at
           FROM tbl_screenings s
           LEFT JOIN tbl_clinical_reviews review ON review.screening_id=s.id
          WHERE s.patient_id=p.id
          ORDER BY ${activeScreeningOrder("s")}
          LIMIT 1
       ) latest ON TRUE
       WHERE p.registered_by=$1
        AND p.deleted_at IS NULL
        AND fn_user_has_patient_access($1,p.id)
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [userId]
  );
  return rows;
}

// Numbers for the Health Worker dashboard: only the worker's own registrations
async function getSummary(userId) {
  const ownPatients = `
    FROM tbl_patients p
   WHERE p.registered_by=$1
     AND p.deleted_at IS NULL
     AND fn_user_has_patient_access($1,p.id)`;
  const [totals, days, byVillage, bySex, byAge] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE p.created_at >= date_trunc('month', now())) AS this_month,
              COUNT(*) FILTER (WHERE p.created_at >= date_trunc('day', now())) AS today,
              COUNT(*) FILTER (WHERE screening_consent.granted IS TRUE) AS screening_consented
         FROM tbl_patients p
         ${SCREENING_CONSENT}
        WHERE p.registered_by=$1
          AND p.deleted_at IS NULL
          AND fn_user_has_patient_access($1,p.id)`,
      [userId]
    ),
    pool.query(
      `SELECT day::date AS day, COUNT(p.id) AS count
         FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') AS day
         LEFT JOIN tbl_patients p
           ON p.registered_by=$1
          AND p.deleted_at IS NULL
          AND fn_user_has_patient_access($1,p.id)
          AND p.created_at >= day AND p.created_at < day + interval '1 day'
        GROUP BY day
        ORDER BY day`,
      [userId]
    ),
    pool.query(
      `SELECT v.name_en AS village_name, v.name_te AS village_name_te, COUNT(*) AS count
         FROM tbl_patients p
         JOIN mst_villages v ON v.id=p.village_id
        WHERE p.registered_by=$1
          AND p.deleted_at IS NULL
          AND fn_user_has_patient_access($1,p.id)
        GROUP BY v.id, v.name_en, v.name_te
        ORDER BY count DESC, v.name_en
        LIMIT 8`,
      [userId]
    ),
    pool.query(`SELECT p.sex::text AS sex, COUNT(*) AS count ${ownPatients} GROUP BY p.sex`, [userId]),
    pool.query(
      `SELECT CASE
                WHEN age IS NULL THEN 'UNKNOWN'
                WHEN age < 18 THEN '0_17'
                WHEN age < 40 THEN '18_39'
                WHEN age < 60 THEN '40_59'
                ELSE '60_PLUS'
              END AS age_group,
              COUNT(*) AS count
         FROM (SELECT COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int) AS age ${ownPatients}) ages
        GROUP BY 1`,
      [userId]
    ),
  ]);
  const row = totals.rows[0] || {};
  const number = (value) => Number(value || 0);
  return {
    total: number(row.total),
    this_month: number(row.this_month),
    today: number(row.today),
    screening_consented: number(row.screening_consented),
    last_7_days: days.rows.map((day) => ({ day: day.day, count: number(day.count) })),
    by_village: byVillage.rows.map((item) => ({ ...item, count: number(item.count) })),
    by_sex: bySex.rows.map((item) => ({ sex: item.sex, count: number(item.count) })),
    by_age_group: byAge.rows.map((item) => ({ age_group: item.age_group, count: number(item.count) })),
  };
}

async function registerPatient(userId, req, input) {
  const patient = normalizePatient(input);
  const mandalWide = await isMandalWideRegistration();
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await assertAssignedLocation(client, userId, patient, mandalWide);

    // The same form submitted twice (e.g. a slow network): return the first patient
    if (patient.idempotencyKey) {
      const existing = await client.query(
        `SELECT id,patient_code,full_name,sex,age_years,date_of_birth,village_id,mandal_id,
                registered_facility_id,created_at
           FROM tbl_patients
          WHERE registered_by=$1 AND idempotency_key=$2`,
        [userId, patient.idempotencyKey]
      );
      if (existing.rows.length) {
        await client.query("COMMIT");
        transactionStarted = false;
        return { ...existing.rows[0], already_registered: true };
      }
    }

    const language = await client.query(
      "SELECT id FROM mst_languages WHERE id=$1 AND is_active IS TRUE",
      [patient.languageId]
    );
    if (!language.rows.length) {
      throw new HttpError(400, "Select the patient's preferred language", "INVALID_PATIENT");
    }
    const purposes = await client.query(
      "SELECT id,code,version FROM mst_consent_purposes WHERE is_active IS TRUE AND code = ANY($1::text[])",
      [CONSENT_CODES]
    );
    if (purposes.rows.length !== CONSENT_CODES.length) {
      throw new HttpError(409, "Consent forms are not configured. Contact the administrator.", "CONSENT_NOT_CONFIGURED");
    }

    const possibleDuplicates = await findPossibleDuplicates(client, userId, patient);
    const confirmedDuplicateIds = input.confirm_possible_duplicate === true
      && Array.isArray(input.confirmed_duplicate_ids)
      ? new Set(input.confirmed_duplicate_ids
        .filter((id) => UUID_PATTERN.test(String(id)))
        .slice(0, 10))
      : new Set();
    const unconfirmedDuplicates = possibleDuplicates.filter((match) => !confirmedDuplicateIds.has(match.id));
    if (unconfirmedDuplicates.length) {
      const error = new HttpError(
        409,
        "Possible matching patients were found. Review the matches before continuing.",
        "POSSIBLE_DUPLICATES"
      );
      error.matches = unconfirmedDuplicates;
      throw error;
    }

    const { rows } = await client.query(
      `INSERT INTO tbl_patients
         (full_name,sex,date_of_birth,age_years,village_id,habitation,address_line,
          preferred_language_id,registered_facility_id,registered_by,idempotency_key,
          client_created_at,is_synthetic)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
       RETURNING id,patient_code,full_name,sex,age_years,date_of_birth,village_id,mandal_id,
                 registered_facility_id,created_at,client_created_at`,
      [
        patient.fullName,
        patient.sex,
        patient.dateOfBirth,
        patient.ageYears,
        patient.villageId,
        patient.habitation,
        patient.addressLine,
        patient.languageId,
        patient.facilityId,
        userId,
        patient.idempotencyKey,
        patient.clientCreatedAt,
      ]
    );

    // One consent row per purpose, in the language the consent was explained in.
    // captured_at: client-reported capture time when offline (audit trail only —
    // not proof of consent); otherwise DB default now() = server receipt/sync time.
    // Server created_at on tbl_patients remains authoritative for receipt time.
    for (const purpose of purposes.rows) {
      if (patient.consentCapturedAt) {
        await client.query(
          `INSERT INTO tbl_patient_consents
             (patient_id,purpose_id,language_id,consent_version,method,granted,captured_by,witness_name,captured_at)
           VALUES ($1,$2,$3,$4,$5::consent_method,$6,$7,$8,$9)`,
          [rows[0].id, purpose.id, patient.languageId, purpose.version, patient.consent.method,
            patient.consent.answers[purpose.code], userId, patient.consent.witnessName,
            patient.consentCapturedAt]
        );
      } else {
        await client.query(
          `INSERT INTO tbl_patient_consents
             (patient_id,purpose_id,language_id,consent_version,method,granted,captured_by,witness_name)
           VALUES ($1,$2,$3,$4,$5::consent_method,$6,$7,$8)`,
          [rows[0].id, purpose.id, patient.languageId, purpose.version, patient.consent.method,
            patient.consent.answers[purpose.code], userId, patient.consent.witnessName]
        );
      }
    }

    await audit(req, {
      client,
      required: true,
      event: "PATIENT_REGISTERED",
      resourceType: "patient",
      resourceId: rows[0].id,
      patientId: rows[0].id,
      metadata: {
        consents: patient.consent.answers,
        consent_method: patient.consent.method,
        client_created_at: patient.clientCreatedAt,
        consent_captured_at: patient.consentCapturedAt,
      },
    });
    await client.query("COMMIT");
    transactionStarted = false;
    return {
      ...rows[0],
      consents: patient.consent.answers,
      consent_captured_at: patient.consentCapturedAt,
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    if (error.code === "P0001" && /not assigned to this (village and facility|Mandal)/i.test(error.message)) {
      throw new HttpError(403, "You are not assigned to this village and facility", "LOCATION_NOT_ASSIGNED");
    }
    if (error.code === "23503") {
      throw new HttpError(400, "The selected village or facility is no longer available", "INVALID_LOCATION");
    }
    if (error.code === "23505") {
      throw new HttpError(409, "This patient is already being saved. Refresh the list.", "DUPLICATE_SUBMISSION");
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getRegistrationOptions,
  getRegistrationChoices,
  getFormOptions,
  listMine,
  searchPatients,
  checkDuplicates,
  getPatientDetails,
  getSummary,
  registerPatient,
  isMandalWideRegistration,
};
