const crypto = require("crypto");
const sharp = require("sharp");
const pool = require("../db");
const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { hasConsent, requireUuid, setActor, withTransaction } = require("./medicalOfficer/scope");
const privateImageStorage = require("./privateImageStorage");
const imageEnhancementService = require("./imageEnhancementService");
const imageCategoryValidationService = require("./imageCategoryValidationService");
const {
  createInAppNotifications,
  listActiveMedicalOfficersForPatient,
} = require("./notificationService");
const { ACTIVE_SCREENING_STATES, activeScreeningOrder } = require("../utils/screeningSelection");

async function notifyMedicalOfficersScreeningAwaitingReview(client, {
  patientId,
  screeningId,
  resubmitted = false,
}) {
  const recipients = await listActiveMedicalOfficersForPatient(client, patientId);
  if (!recipients.length) return 0;
  return createInAppNotifications(client, {
    recipients,
    patientId,
    event: "SCREENING_AWAITING_REVIEW",
    title: resubmitted
      ? "Updated screening awaiting review"
      : "New screening awaiting review",
    message: resubmitted
      ? "A Health Worker resubmitted screening information for Medical Officer review."
      : "A new screening was submitted and is waiting in your assigned Mandal queue.",
    targetPath: "/medical-officer/queue",
    dedupeKey: `SCREENING_AWAITING_REVIEW:${screeningId}`,
    extraPayload: { screening_id: screeningId },
  });
}

// ==========================================
// HEALTH WORKER: CONSENT, ORAL SCREENING AND PHOTOS
// Uses the existing tables and database rules:
//   tbl_patient_consents (append-only; the newest row per purpose counts)
//   tbl_screenings       (case_state DRAFT -> CONSENTED -> SCREENED -> AWAITING_CLINICIAN)
//   tbl_screening_findings, tbl_patient_medical_histories, tbl_screening_photos
// The Health Worker only records observations. There is no diagnosis here:
// the Medical Officer reviews every submitted case.
// ==========================================

const CONSENT_PURPOSES = ["SCREENING", "IMAGE_CAPTURE", "TELECONSULT"];
const CONSENT_METHODS = ["CHECKBOX", "VERBAL_WITNESSED", "SIGNATURE", "THUMBPRINT"];
const WITNESS_METHODS = ["VERBAL_WITNESSED", "THUMBPRINT"];
const ORAL_SITES = ["CHEEK_LINING", "TONGUE", "PALATE", "GUMS", "FLOOR_OF_MOUTH", "OTHER"];
// The database view list (oral_view) has no front/left/right values, so these
// views are stored as view_type 'OTHER' with the view name in annotation_site.
const PHOTO_VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];
const IMAGE_FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const OPEN_STATES = ["CONSENTED", "SCREENED"];

// ---------- small input helpers ----------

function text(value, max, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text`, "INVALID_SCREENING");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`, "INVALID_SCREENING");
  return trimmed || null;
}

function wholeNumber(value, min, max, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`, "INVALID_SCREENING");
  }
  return number;
}

function decimal(value, min, max, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || !Number.isInteger(number * 2)) {
    throw new HttpError(400, `${label} must be from ${min} to ${max} in 0.5-year steps`, "INVALID_SCREENING");
  }
  return number;
}

function list(value, max, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpError(400, `${label} must be a list of at most ${max} items`, "INVALID_SCREENING");
  }
  return value;
}

// ---------- access ----------

// The patient must be one this Health Worker may access (database rule fn_user_has_patient_access)
async function requirePatient(db, userId, patientId, { lock = false } = {}) {
  requireUuid(patientId, "Invalid patient ID");
  const { rows } = await db.query(
    `SELECT p.id, p.patient_code, p.full_name, p.registered_facility_id, p.preferred_language_id
       FROM tbl_patients p
      WHERE p.id = $2 AND p.deleted_at IS NULL AND fn_user_has_patient_access($1, p.id)
      ${lock ? "FOR UPDATE OF p" : ""}`,
    [userId, patientId]
  );
  if (!rows.length) throw new HttpError(404, "Patient not found", "PATIENT_NOT_FOUND");
  return rows[0];
}

// A screening recorded by this Health Worker; `lock` locks the row for the transaction
async function requireOwnScreening(db, userId, screeningId, { lock = false } = {}) {
  requireUuid(screeningId, "Invalid screening ID");
  const { rows } = await db.query(
    `SELECT s.id, s.patient_id, s.case_state::text AS case_state, s.consent_id, s.submitted_at
       FROM tbl_screenings s
      WHERE s.id = $2 AND s.examiner_id = $1
      ${lock ? "FOR UPDATE" : ""}`,
    [userId, screeningId]
  );
  if (!rows.length) throw new HttpError(404, "Screening not found", "SCREENING_NOT_FOUND");
  await requirePatient(db, userId, rows[0].patient_id);
  return rows[0];
}

// Newest consent row per purpose (consents are append-only)
async function currentConsents(db, patientId) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (cp.code)
            cp.code AS purpose, pc.id, pc.granted, pc.method::text AS method,
            pc.consent_version, pc.witness_name, pc.captured_at,
            EXISTS (
              SELECT 1
                FROM tbl_patient_consents previous
               WHERE previous.patient_id = pc.patient_id
                 AND previous.purpose_id = pc.purpose_id
                 AND previous.granted IS TRUE
                 AND previous.consent_seq < pc.consent_seq
            ) AS previously_granted
       FROM tbl_patient_consents pc
       JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
      WHERE pc.patient_id = $1 AND cp.code = ANY($2::text[])
      ORDER BY cp.code, pc.consent_seq DESC`,
    [patientId, CONSENT_PURPOSES]
  );
  const byPurpose = Object.fromEntries(rows.map((row) => [row.purpose, row]));
  return Object.fromEntries(CONSENT_PURPOSES.map((code) => {
    const consent = byPurpose[code] || null;
    if (code !== "TELECONSULT" || !consent) return [code, consent];
    const status = consent.granted
      ? "ACTIVE"
      : consent.previously_granted ? "WITHDRAWN" : "DECLINED";
    return [code, { ...consent, status }];
  }));
}

// ---------- options and lists ----------

async function getOptions() {
  const [symptoms, exposures, purposes, languages] = await Promise.all([
    pool.query("SELECT code, name_en, name_te FROM mst_symptoms WHERE is_active IS TRUE ORDER BY id"),
    pool.query("SELECT code, name_en, name_te, category FROM mst_exposure_types WHERE is_active IS TRUE ORDER BY id"),
    pool.query(
      `SELECT code, name_en, name_te, text_en, text_te, version
         FROM mst_consent_purposes WHERE is_active IS TRUE AND code = ANY($1::text[])`,
      [CONSENT_PURPOSES]
    ),
    pool.query("SELECT id, code, name_en, native_name FROM mst_languages WHERE is_active IS TRUE ORDER BY id"),
  ]);
  return {
    symptoms: symptoms.rows,
    exposures: exposures.rows,
    consent_purposes: CONSENT_PURPOSES.map((code) => purposes.rows.find((row) => row.code === code)).filter(Boolean),
    languages: languages.rows,
    oral_sites: ORAL_SITES,
    photo_views: PHOTO_VIEWS,
    image_categories: imageCategoryValidationService.IMAGE_CATEGORIES,
    max_photo_bytes: MAX_PHOTO_BYTES,
  };
}

// The worker's patients with their consent state and latest screening
async function listPatients(userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.patient_code, p.full_name, p.sex::text AS sex, p.age_years, p.preferred_language_id,
            v.name_en AS village_name, v.name_te AS village_name_te,
            screening_consent.granted AS screening_consent, screening_consent.captured_at AS screening_consent_at,
            image_consent.granted AS image_consent, image_consent.captured_at AS image_consent_at,
            latest.id AS screening_id, latest.case_state::text AS case_state, latest.screening_date,
            CASE WHEN screening_consent.granted IS TRUE AND latest.signed_at IS NOT NULL
                       AND latest.medical_officer_decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')
                 THEN latest.medical_officer_request_note END AS medical_officer_request_note,
            CASE WHEN screening_consent.granted IS TRUE AND latest.signed_at IS NOT NULL
                 THEN latest.medical_officer_decision::text END AS medical_officer_decision
       FROM tbl_patients p
       JOIN mst_villages v ON v.id = p.village_id
       LEFT JOIN LATERAL (
         SELECT pc.granted, pc.captured_at FROM tbl_patient_consents pc
           JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id AND cp.code = 'SCREENING'
          WHERE pc.patient_id = p.id ORDER BY pc.consent_seq DESC LIMIT 1
       ) screening_consent ON TRUE
       LEFT JOIN LATERAL (
         SELECT pc.granted, pc.captured_at FROM tbl_patient_consents pc
           JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id AND cp.code = 'IMAGE_CAPTURE'
          WHERE pc.patient_id = p.id ORDER BY pc.consent_seq DESC LIMIT 1
       ) image_consent ON TRUE
       LEFT JOIN LATERAL (
         SELECT s.id, s.case_state, s.screening_date,
                review.decision AS medical_officer_decision,
                review.request_note AS medical_officer_request_note,
                review.signed_at
           FROM tbl_screenings s
           LEFT JOIN tbl_clinical_reviews review ON review.screening_id = s.id
          WHERE s.patient_id = p.id
          ORDER BY ${activeScreeningOrder("s")}
          LIMIT 1
       ) latest ON TRUE
      WHERE p.registered_by = $1
        AND p.deleted_at IS NULL
        AND fn_user_has_patient_access($1, p.id)
      ORDER BY p.created_at DESC
      LIMIT 100`,
    [userId]
  );
  return rows.map((row) => ({
    ...row,
    screening_consent: row.screening_consent === true,
    image_consent: row.image_consent === true,
  }));
}

async function getConsents(userId, patientId) {
  const patient = await requirePatient(pool, userId, patientId);
  return { patient_id: patient.id, preferred_language_id: patient.preferred_language_id, consents: await currentConsents(pool, patient.id) };
}

// ---------- consent ----------

// Records a new consent answer (granting or withdrawing). Older rows are never changed.
async function recordConsent(userId, req, patientId, input = {}) {
  const purpose = typeof input.purpose === "string" ? input.purpose.trim().toUpperCase() : "";
  if (!CONSENT_PURPOSES.includes(purpose)) {
    throw new HttpError(400, "Choose screening, photograph or video consultation consent", "INVALID_CONSENT");
  }
  if (typeof input.granted !== "boolean") throw new HttpError(400, "Record whether the patient agrees", "INVALID_CONSENT");
  const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : "";
  if (!CONSENT_METHODS.includes(method)) throw new HttpError(400, "Select how consent was given", "INVALID_CONSENT");
  const witnessName = text(input.witness_name, 150, "Witness name");
  if (WITNESS_METHODS.includes(method) && !witnessName) {
    throw new HttpError(400, "A witness name is required for verbal or thumbprint consent", "INVALID_CONSENT");
  }
  const languageId = Number(input.language_id);
  if (!Number.isSafeInteger(languageId) || languageId < 1) {
    throw new HttpError(400, "Select the language the consent was explained in", "INVALID_CONSENT");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const patient = await requirePatient(client, userId, patientId);
    const purposeRow = await client.query(
      "SELECT id, version FROM mst_consent_purposes WHERE code = $1 AND is_active IS TRUE",
      [purpose]
    );
    if (!purposeRow.rows.length) throw new HttpError(409, "Consent forms are not configured. Contact the administrator.", "CONSENT_NOT_CONFIGURED");
    let teleconsultWasPreviouslyGranted = false;
    if (purpose === "TELECONSULT") {
      const previousGrant = await client.query(
        `SELECT EXISTS (
           SELECT 1
             FROM tbl_patient_consents previous
            WHERE previous.patient_id = $1
              AND previous.purpose_id = $2
              AND previous.granted IS TRUE
         ) AS granted`,
        [patient.id, purposeRow.rows[0].id]
      );
      teleconsultWasPreviouslyGranted = previousGrant.rows[0]?.granted === true;
    }
    const language = await client.query("SELECT id FROM mst_languages WHERE id = $1 AND is_active IS TRUE", [languageId]);
    if (!language.rows.length) throw new HttpError(400, "Select the language the consent was explained in", "INVALID_CONSENT");

    const { rows } = await client.query(
      `INSERT INTO tbl_patient_consents
         (patient_id, purpose_id, language_id, consent_version, method, granted, captured_by, witness_name)
       VALUES ($1, $2, $3, $4, $5::consent_method, $6, $7, $8)
       RETURNING id, granted, method::text AS method, consent_version, witness_name, captured_at`,
      [patient.id, purposeRow.rows[0].id, languageId, purposeRow.rows[0].version, method, input.granted, userId, witnessName]
    );
    await audit(req, {
      client,
      required: true,
      event: input.granted
        ? "CONSENT_GRANTED"
        : purpose === "TELECONSULT" && !teleconsultWasPreviouslyGranted
          ? "CONSENT_DECLINED"
          : "CONSENT_WITHDRAWN",
      resourceType: "consent",
      resourceId: rows[0].id,
      patientId: patient.id,
      metadata: { purpose, method },
    });
    return { purpose, ...rows[0] };
  });
}

// ---------- screening details ----------

function normalizeScreening(input = {}, symptomCodes, exposureCodes) {
  const chiefComplaint = text(input.chief_complaint, 1000, "Chief complaint");
  if (!chiefComplaint) throw new HttpError(400, "Enter the chief complaint", "INVALID_SCREENING");

  const symptomList = list(input.symptoms, 20, "Symptoms");
  const symptoms = symptomList.map((item) => {
    if (!symptomCodes.has(item?.code)) throw new HttpError(400, "Select a valid symptom", "INVALID_SCREENING");
    return { code: item.code, durationDays: wholeNumber(item.duration_days, 0, 3650, "Symptom duration") };
  });
  if (new Set(symptoms.map((item) => item.code)).size !== symptoms.length) {
    throw new HttpError(400, "A symptom can only be recorded once per screening", "INVALID_SCREENING");
  }

  const history = input.medical_history || {};
  const exposures = list(history.exposures, 10, "Habits").map((item) => {
    if (!exposureCodes.has(item?.code)) throw new HttpError(400, "Select a valid habit", "INVALID_SCREENING");
    return {
      code: item.code,
      isCurrent: item.is_current === true,
      durationYears: decimal(item.duration_years, 0, 120, "Years of use"),
      perDay: wholeNumber(item.frequency_per_day, 0, 200, "Times per day"),
    };
  });
  const conditions = text(history.conditions, 1000, "Medical history");

  const observationList = list(input.oral_observations, 12, "Oral observations");
  const observations = observationList.map((item) => {
    if (!ORAL_SITES.includes(item?.site)) throw new HttpError(400, "Select a valid mouth area", "INVALID_SCREENING");
    const description = text(item.description, 500, "Observation");
    if (!description) throw new HttpError(400, "Describe what you saw in each mouth area", "INVALID_SCREENING");
    return { site: item.site, description };
  });
  if (new Set(observations.map((item) => item.site)).size !== observations.length) {
    throw new HttpError(400, "An oral observation site can only be recorded once per screening", "INVALID_SCREENING");
  }

  const pain = input.pain || {};
  const hasPain = pain.has_pain === true;
  const painDetails = hasPain ? {
    severity: wholeNumber(pain.severity, 0, 10, "Pain score"),
    location: text(pain.location, 300, "Pain location"),
    durationDays: wholeNumber(pain.duration_days, 0, 3650, "Pain duration"),
    notes: text(pain.notes, 500, "Pain details"),
  } : null;
  if (hasPain && painDetails.severity == null) throw new HttpError(400, "Enter a pain score from 0 to 10", "INVALID_SCREENING");

  return {
    chiefComplaint,
    symptoms,
    exposures,
    conditions,
    observations,
    painDetails,
    tobaccoCurrent: typeof input.tobacco_current === "boolean" ? input.tobacco_current : null,
    notes: text(input.notes, 2000, "Additional notes"),
  };
}

async function insertScreeningFindings(client, screeningId, userId, screening, symptomIds) {
  for (const symptom of screening.symptoms) {
    await client.query(
      `INSERT INTO tbl_screening_findings (screening_id, finding_kind, symptom_id, duration_days, recorded_by)
       VALUES ($1, 'SYMPTOM', $2, $3, $4)`,
      [screeningId, symptomIds.get(symptom.code), symptom.durationDays, userId]
    );
  }
  if (screening.painDetails) {
    const { severity, location, notes, durationDays } = screening.painDetails;
    const description = [`Pain score ${severity}/10`, location && `Location: ${location}`, notes].filter(Boolean).join(". ");
    await client.query(
      `INSERT INTO tbl_screening_findings (screening_id, finding_kind, symptom_id, description, duration_days, recorded_by)
       VALUES ($1, 'SYMPTOM', $2, $3, $4, $5)`,
      [screeningId, symptomIds.get("PAIN"), description, durationDays, userId]
    );
  }
  for (const observation of screening.observations) {
    await client.query(
      `INSERT INTO tbl_screening_findings (screening_id, finding_kind, oral_site, description, recorded_by)
       VALUES ($1, 'EXAM', $2::oral_view, $3, $4)`,
      [screeningId, observation.site, observation.description, userId]
    );
  }
}

// Creates the screening with its findings. Requires an active SCREENING consent.
async function createScreening(userId, req, input = {}) {
  const patientId = input.patient_id;
  const [symptomRows, exposureRows] = await Promise.all([
    pool.query("SELECT id, code FROM mst_symptoms WHERE is_active IS TRUE"),
    pool.query("SELECT id, code FROM mst_exposure_types WHERE is_active IS TRUE"),
  ]);
  const symptomIds = new Map(symptomRows.rows.map((row) => [row.code, row.id]));
  const exposureIds = new Map(exposureRows.rows.map((row) => [row.code, row.id]));
  const screening = normalizeScreening(input, new Set(symptomIds.keys()), new Set(exposureIds.keys()));
  if (screening.painDetails && !symptomIds.has("PAIN")) {
    throw new HttpError(409, "The pain symptom is not configured. Contact the administrator.", "SYMPTOM_NOT_CONFIGURED");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const patient = await requirePatient(client, userId, patientId, { lock: true });

    const consents = await currentConsents(client, patient.id);
    if (consents.SCREENING?.granted !== true) {
      throw new HttpError(403, "Record the patient's screening consent before screening", "CONSENT_REQUIRED");
    }
    const open = await client.query(
      `SELECT id FROM tbl_screenings
        WHERE patient_id = $1 AND case_state = ANY($2::case_state[]) LIMIT 1`,
      [patient.id, ACTIVE_SCREENING_STATES]
    );
    if (open.rows.length) {
      throw new HttpError(409, "This patient already has an active screening. Finish it before starting another.", "SCREENING_IN_PROGRESS");
    }

    // DRAFT first, then CONSENTED with the consent: the order of the existing state machine
    const created = await client.query(
      `INSERT INTO tbl_screenings
         (patient_id, examiner_id, facility_id, case_state, tobacco_current, chief_complaint,
          clinical_exam_done, notes)
       VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7)
       RETURNING id`,
      [patient.id, userId, patient.registered_facility_id, screening.tobaccoCurrent,
        screening.chiefComplaint, screening.observations.length > 0, screening.notes]
    );
    const screeningId = created.rows[0].id;
    await client.query(
      "UPDATE tbl_screenings SET consent_id = $1, case_state = 'CONSENTED' WHERE id = $2",
      [consents.SCREENING.id, screeningId]
    );

    await insertScreeningFindings(client, screeningId, userId, screening, symptomIds);
    for (const exposure of screening.exposures) {
      await client.query(
        `INSERT INTO tbl_patient_medical_histories
           (patient_id, history_kind, exposure_type_id, is_current, duration_years, frequency_per_day, recorded_by)
         VALUES ($1, 'EXPOSURE', $2, $3, $4, $5, $6)`,
        [patient.id, exposureIds.get(exposure.code), exposure.isCurrent, exposure.durationYears, exposure.perDay, userId]
      );
    }
    if (screening.conditions) {
      await client.query(
        `INSERT INTO tbl_patient_medical_histories (patient_id, history_kind, condition_text, recorded_by)
         VALUES ($1, 'CONDITION', $2, $3)`,
        [patient.id, screening.conditions, userId]
      );
    }

    await audit(req, {
      client,
      required: true,
      event: "SCREENING_CREATED",
      resourceType: "screening",
      resourceId: screeningId,
      patientId: patient.id,
      metadata: { symptoms: screening.symptoms.length, observations: screening.observations.length },
    });
    return { id: screeningId, patient_id: patient.id, case_state: "CONSENTED" };
  });
}

async function getScreening(userId, screeningId) {
  const screening = await requireOwnScreening(pool, userId, screeningId);
  const currentConsent = await currentConsents(pool, screening.patient_id);
  if (currentConsent.SCREENING?.granted !== true) {
    throw new HttpError(403, "The patient's screening consent is no longer active", "CONSENT_REQUIRED");
  }
  const [details, findings, photos] = await Promise.all([
    pool.query(
      `SELECT s.id, s.patient_id, p.patient_code, p.full_name, s.case_state::text AS case_state,
              s.screening_date, s.chief_complaint, s.notes, s.tobacco_current, s.submitted_at,s.version,
              (SELECT cr.decision::text
                 FROM tbl_clinical_reviews cr
                WHERE cr.screening_id = s.id AND cr.signed_at IS NOT NULL
                ORDER BY cr.version DESC
                LIMIT 1) AS medical_officer_decision,
              (SELECT cr.request_note
                 FROM tbl_clinical_reviews cr
                WHERE cr.screening_id = s.id AND cr.signed_at IS NOT NULL
                  AND cr.decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')
                ORDER BY cr.version DESC
                LIMIT 1) AS medical_officer_request_note
         FROM tbl_screenings s JOIN tbl_patients p ON p.id = s.patient_id
        WHERE s.id = $1`,
      [screening.id]
    ),
    pool.query(
      `SELECT f.finding_kind::text AS finding_kind, sy.code AS symptom_code, sy.name_en AS symptom_name,
              sy.name_te AS symptom_name_te, f.oral_site::text AS oral_site, f.description, f.duration_days
         FROM tbl_screening_findings f LEFT JOIN mst_symptoms sy ON sy.id = f.symptom_id
        WHERE f.screening_id = $1 ORDER BY f.recorded_at`,
      [screening.id]
    ),
    // never the private_key: images are only streamed through this API
    currentConsent.IMAGE_CAPTURE?.granted === true ? pool.query(
      `SELECT ph.id, ph.annotation_site AS view, ph.mime_type, ph.size_bytes, ph.width_px, ph.height_px,
              ph.status::text AS status, ph.captured_at,
              EXISTS (
                SELECT 1 FROM tbl_audit_logs a
                 WHERE a.resource_type = 'photo' AND a.resource_id = ph.id::text
                   AND a.event = 'PHOTO_AI_ENHANCED' AND a.outcome = 'SUCCESS'
              ) AS is_enhanced
         FROM tbl_screening_photos ph
        WHERE ph.screening_id = $1 AND ph.status <> 'SUPERSEDED'
        ORDER BY ph.captured_at`,
      [screening.id]
    ) : Promise.resolve({ rows: [] }),
  ]);
  return {
    ...details.rows[0],
    findings: findings.rows,
    photos: await Promise.all(photos.rows.map(async (row) => ({
      ...row,
      size_bytes: Number(row.size_bytes),
      has_ai_enhanced: await privateImageStorage.objectExists(enhancedFilePath(screening.id, row.id)),
    }))),
    consents: currentConsent,
  };
}

async function updateRequestedInformation(userId, req, screeningId, input = {}) {
  requireUuid(screeningId, "Invalid screening ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const screeningRow = await requireOwnScreening(client, userId, screeningId, { lock: true });
    if (screeningRow.case_state !== "SCREENED") {
      throw new HttpError(409, "This screening is not awaiting Health Worker information", "SCREENING_NOT_RETURNED");
    }

    const consents = await currentConsents(client, screeningRow.patient_id);
    if (consents.SCREENING?.granted !== true) {
      throw new HttpError(403, "The patient's screening consent is no longer active", "CONSENT_REQUIRED");
    }

    const { rows: reviews } = await client.query(
      `SELECT decision::text AS decision
         FROM tbl_clinical_reviews
        WHERE screening_id = $1 AND signed_at IS NOT NULL
        ORDER BY version DESC
        LIMIT 1
        FOR SHARE`,
      [screeningId]
    );
    if (reviews[0]?.decision !== "REQUEST_MORE_INFO") {
      throw new HttpError(409, "This screening was not returned for more information", "REQUEST_MORE_INFO_REQUIRED");
    }

    const [symptomRows, exposureRows] = await Promise.all([
      client.query("SELECT id, code FROM mst_symptoms WHERE is_active IS TRUE"),
      client.query("SELECT id, code FROM mst_exposure_types WHERE is_active IS TRUE"),
    ]);
    const symptomIds = new Map(symptomRows.rows.map((row) => [row.code, row.id]));
    const exposureIds = new Map(exposureRows.rows.map((row) => [row.code, row.id]));
    const data = normalizeScreening({
      ...input,
      medical_history: { exposures: [], conditions: null },
    }, new Set(symptomIds.keys()), new Set(exposureIds.keys()));

    if (data.painDetails && !symptomIds.has("PAIN")) {
      throw new HttpError(409, "The pain symptom is not configured. Contact the administrator.", "SYMPTOM_NOT_CONFIGURED");
    }

    const updated = await client.query(
      `UPDATE tbl_screenings
          SET chief_complaint=$1,tobacco_current=$2,clinical_exam_done=$3,notes=$4,version=version+1
        WHERE id=$5 AND case_state='SCREENED'
        RETURNING id,version`,
      [data.chiefComplaint, data.tobaccoCurrent, data.observations.length > 0, data.notes, screeningId]
    );
    if (!updated.rowCount) {
      throw new HttpError(409, "This screening is no longer awaiting Health Worker information", "SCREENING_NOT_RETURNED");
    }

    await client.query("DELETE FROM tbl_screening_findings WHERE screening_id=$1", [screeningId]);
    await insertScreeningFindings(client, screeningId, userId, data, symptomIds);

    const { rows } = await client.query(
      `UPDATE tbl_screenings
          SET case_state='AWAITING_CLINICIAN',submitted_at=now()
        WHERE id=$1 AND case_state='SCREENED'
        RETURNING id,case_state::text AS case_state,submitted_at,version`,
      [screeningId]
    );
    if (!rows.length) {
      throw new HttpError(409, "This screening is no longer awaiting Health Worker information", "SCREENING_NOT_RETURNED");
    }

    await audit(req, {
      client,
      required: true,
      event: "SCREENING_INFORMATION_UPDATED",
      resourceType: "screening",
      resourceId: screeningId,
      patientId: screeningRow.patient_id,
      metadata: { symptoms: data.symptoms.length, observations: data.observations.length },
    });
    await audit(req, {
      client,
      required: true,
      event: "SCREENING_SUBMITTED",
      resourceType: "screening",
      resourceId: screeningId,
      patientId: screeningRow.patient_id,
      metadata: { resubmitted: true, request_decision: "REQUEST_MORE_INFO" },
    });
    await notifyMedicalOfficersScreeningAwaitingReview(client, {
      patientId: screeningRow.patient_id,
      screeningId,
      resubmitted: true,
    });
    return rows[0];
  });
}

async function listMyScreenings(userId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.patient_id, p.patient_code, p.full_name, s.case_state::text AS case_state,
            s.screening_date, s.submitted_at,
            (SELECT COUNT(*) FROM tbl_screening_photos ph
              WHERE ph.screening_id = s.id AND ph.status <> 'SUPERSEDED') AS photo_count
       FROM tbl_screenings s JOIN tbl_patients p ON p.id = s.patient_id
      WHERE s.examiner_id = $1 AND p.deleted_at IS NULL AND fn_user_has_patient_access($1, p.id)
      ORDER BY s.created_at DESC
      LIMIT 50`,
    [userId]
  );
  return rows.map((row) => ({ ...row, photo_count: Number(row.photo_count) }));
}

// ---------- photos ----------

// Checks the real image content (not only the file name), removes metadata
// such as GPS location by re-encoding, and returns the cleaned image.
async function cleanImage(buffer) {
  let info;
  try {
    info = await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, "The file is not a valid JPG, PNG or WEBP image", "INVALID_IMAGE");
  }
  const mimeType = IMAGE_FORMATS[info.format];
  if (!mimeType) throw new HttpError(400, "Only JPG, PNG and WEBP photos can be uploaded", "INVALID_IMAGE");

  const output = await sharp(buffer).rotate().toFormat(info.format).toBuffer({ resolveWithObject: true });
  if (output.data.length > MAX_PHOTO_BYTES) {
    throw new HttpError(400, "Each photo must be at most 10 MB", "IMAGE_TOO_LARGE");
  }
  return {
    data: output.data,
    mimeType,
    extension: info.format === "jpeg" ? "jpg" : info.format,
    width: output.info.width,
    height: output.info.height,
  };
}

async function validatePhoto(userId, screeningId, category, file) {
  if (!file?.buffer?.length) throw new HttpError(400, "Choose a photo to upload", "INVALID_IMAGE");
  const screening = await requireOwnScreening(pool, userId, screeningId);
  if (!OPEN_STATES.includes(screening.case_state)) {
    throw new HttpError(409, "Photos can only be checked before the screening is submitted", "SCREENING_SUBMITTED");
  }
  if (!(await hasConsent(pool, screening.patient_id, "IMAGE_CAPTURE"))) {
    throw new HttpError(403, "Record the patient's photograph consent before taking photos", "CONSENT_REQUIRED");
  }
  const validation = await imageCategoryValidationService.validateScreeningImage(file, category);
  return {
    validation,
    can_upload: imageCategoryValidationService.canUploadValidation(validation),
    disclaimer:
      "Image suitability validation only. Not a diagnosis. The selected category is never changed.",
  };
}

async function uploadPhoto(userId, req, screeningId, view, file) {
  if (!PHOTO_VIEWS.includes(view)) throw new HttpError(400, "Choose the front, left or right view", "INVALID_IMAGE");
  if (!file?.buffer?.length) throw new HttpError(400, "Choose a photo to upload", "INVALID_IMAGE");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(400, "Each photo must be at most 10 MB", "IMAGE_TOO_LARGE");
  if (!Object.values(IMAGE_FORMATS).includes(file.mimetype)) {
    throw new HttpError(400, "Only JPG, PNG and WEBP photos can be uploaded", "INVALID_IMAGE");
  }

  const screening = await requireOwnScreening(pool, userId, screeningId);
  if (!OPEN_STATES.includes(screening.case_state)) {
    throw new HttpError(409, "Photos can only be added before the screening is submitted", "SCREENING_SUBMITTED");
  }
  if (!(await hasConsent(pool, screening.patient_id, "IMAGE_CAPTURE"))) {
    throw new HttpError(403, "Record the patient's photograph consent before taking photos", "CONSENT_REQUIRED");
  }

  // Uploaded photos are always originals; AI-enhanced copies are made by the server
  if (req.body?.enhanced !== undefined) {
    throw new HttpError(400, "Upload the original photo. AI-enhanced copies are created by the server.", "INVALID_IMAGE");
  }

  const category = imageCategoryValidationService.normalizeCategory(req.body?.category || "MOUTH");
  const validation = await imageCategoryValidationService.validateScreeningImage(file, category);
  imageCategoryValidationService.assertUploadAllowed(validation);

  const image = await cleanImage(file.buffer);
  const checksum = crypto.createHash("sha256").update(image.data).digest("hex");
  const photoId = crypto.randomUUID();
  const privateKey = `originals/${screening.id}/${photoId}.${image.extension}`;
  await privateImageStorage.uploadBuffer(privateKey, image.data, image.mimeType);

  try {
    return await withTransaction(pool, async (client) => {
      await setActor(client, userId);
      const locked = await requireOwnScreening(client, userId, screening.id, { lock: true });
      if (!OPEN_STATES.includes(locked.case_state)) {
        throw new HttpError(409, "Photos can only be added before the screening is submitted", "SCREENING_SUBMITTED");
      }
      // A new photo of the same view replaces the old one (kept as SUPERSEDED)
      const previous = await client.query(
        `UPDATE tbl_screening_photos SET status = 'SUPERSEDED'
          WHERE screening_id = $1 AND annotation_site = $2 AND status <> 'SUPERSEDED'
          RETURNING id`,
        [screening.id, view]
      );
      const { rows } = await client.query(
        `INSERT INTO tbl_screening_photos
           (id, screening_id, patient_id, view_type, annotation_site, private_key, checksum_sha256,
            mime_type, size_bytes, width_px, height_px, metadata_stripped, status,
            supersedes_photo_id, captured_by)
         VALUES ($1, $2, $3, 'OTHER', $4, $5, $6, $7, $8, $9, $10, TRUE, 'UPLOADED', $11, $12)
         RETURNING id, annotation_site AS view, mime_type, size_bytes, width_px, height_px,
                   status::text AS status, captured_at`,
        [photoId, screening.id, screening.patient_id, view, privateKey, checksum, image.mimeType,
          image.data.length, image.width, image.height, previous.rows[0]?.id || null, userId]
      );

      // Reuse existing quality table only: ACCEPTABLE when suitable; RECAPTURE when review needed.
      const qualityStatus = validation.status === "NEEDS_REVIEW" ? "RECAPTURE" : "ACCEPTABLE";
      const qualityReason = qualityStatus === "RECAPTURE"
        ? (validation.reason || "Authorized human review required for image category suitability.")
        : null;
      await client.query(
        `INSERT INTO tbl_image_quality_results
           (photo_id, checker_version, status, reason, blur_score)
         VALUES ($1, $2, $3::quality_status, $4, $5)`,
        [
          rows[0].id,
          "category-suitability-v1",
          qualityStatus,
          qualityReason,
          validation.image_quality?.metrics?.sharpness_variance ?? null,
        ]
      );

      await audit(req, {
        client,
        required: true,
        event: "PHOTO_UPLOADED",
        resourceType: "photo",
        resourceId: rows[0].id,
        patientId: screening.patient_id,
        metadata: {
          view,
          size_bytes: image.data.length,
          replaced: previous.rows.length > 0,
          image_category: category,
          category_validation: {
            status: validation.status,
            detected_category: validation.detected_category,
            confidence: validation.confidence,
            reason: validation.reason,
          },
        },
      });
      return {
        ...rows[0],
        size_bytes: Number(rows[0].size_bytes),
        is_enhanced: false,
        has_ai_enhanced: false,
        image_category: category,
        validation: {
          status: validation.status,
          detected_category: validation.detected_category,
          confidence: validation.confidence,
          reason: validation.reason,
        },
      };
    });
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "This photo was already uploaded for this screening", "DUPLICATE_PHOTO");
    if (error.code === "23514" && /IMAGE_CAPTURE consent/i.test(error.message)) {
      throw new HttpError(403, "Record the patient's photograph consent before taking photos", "CONSENT_REQUIRED");
    }
    throw error;
  }
}

async function removePhoto(userId, req, screeningId, photoId) {
  requireUuid(photoId, "Invalid image ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const screening = await requireOwnScreening(client, userId, screeningId, { lock: true });
    if (!OPEN_STATES.includes(screening.case_state)) {
      throw new HttpError(409, "Photos can only be removed before the screening is submitted", "SCREENING_SUBMITTED");
    }
    const { rows } = await client.query(
      `UPDATE tbl_screening_photos
          SET status = 'SUPERSEDED'
        WHERE id = $1 AND screening_id = $2 AND status <> 'SUPERSEDED'
        RETURNING id, annotation_site AS view`,
      [photoId, screening.id]
    );
    if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
    await audit(req, {
      client,
      required: true,
      event: "PHOTO_REMOVED",
      resourceType: "photo",
      resourceId: rows[0].id,
      patientId: screening.patient_id,
      metadata: { view: rows[0].view },
    });
    return { removed: true, view: rows[0].view };
  });
}

// Returns { filePath, mimeType } of one of the worker's own screening photos
async function getPhotoFile(userId, screeningId, photoId) {
  requireUuid(photoId, "Invalid image ID");
  const screening = await requireOwnScreening(pool, userId, screeningId);
  if (!(await hasConsent(pool, screening.patient_id, "IMAGE_CAPTURE"))) {
    throw new HttpError(403, "The patient has no active IMAGE_CAPTURE consent", "CONSENT_REQUIRED");
  }
  const { rows } = await pool.query(
    `SELECT private_key, mime_type FROM tbl_screening_photos
      WHERE id = $1 AND screening_id = $2 AND status <> 'SUPERSEDED'`,
    [photoId, screening.id]
  );
  if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
  return {
    ...(await privateImageStorage.getFile(rows[0].private_key)),
    mimeType: rows[0].mime_type,
  };
}

// ---------- AI enhancement (Real-ESRGAN) ----------
// The enhanced copy is a separate private object. The original photo and its
// database row are never changed, and the original remains the clinical source.

function enhancedFilePath(screeningId, photoId) {
  return imageEnhancementService.enhancedFilePath(screeningId, photoId);
}

// The worker's own photo that is still in use, with an active photograph consent
async function requireEnhanceablePhoto(userId, screeningId, photoId) {
  requireUuid(photoId, "Invalid image ID");
  const screening = await requireOwnScreening(pool, userId, screeningId);
  if (!(await hasConsent(pool, screening.patient_id, "IMAGE_CAPTURE"))) {
    throw new HttpError(403, "The patient has no active IMAGE_CAPTURE consent", "CONSENT_REQUIRED");
  }
  const { rows } = await pool.query(
    `SELECT id, private_key, annotation_site AS view FROM tbl_screening_photos
      WHERE id = $1 AND screening_id = $2 AND status <> 'SUPERSEDED'`,
    [photoId, screening.id]
  );
  if (!rows.length) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
  return { screening, photo: rows[0] };
}

async function enhancePhoto(userId, req, screeningId, photoId) {
  const { screening, photo } = await requireEnhanceablePhoto(userId, screeningId, photoId);
  if (!OPEN_STATES.includes(screening.case_state)) {
    throw new HttpError(409, "Photos can only be enhanced before the screening is submitted", "SCREENING_SUBMITTED");
  }
  return imageEnhancementService.enhancePhoto(req, screening, photo);
}

/**
 * Pre-save enhancement preview: runs the existing Real-ESRGAN path on uploaded
 * bytes and returns the enhanced JPEG without creating a photo row or changing
 * the original. Final persistence still happens after a VALID save + enhancePhoto.
 */
async function enhancePhotoPreview(userId, req, screeningId, file) {
  if (!file?.buffer?.length) throw new HttpError(400, "Choose a photo to enhance", "INVALID_IMAGE");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(400, "Each photo must be at most 10 MB", "IMAGE_TOO_LARGE");
  if (!Object.values(IMAGE_FORMATS).includes(file.mimetype)) {
    throw new HttpError(400, "Only JPG, PNG and WEBP photos can be enhanced", "INVALID_IMAGE");
  }

  const screening = await requireOwnScreening(pool, userId, screeningId);
  if (!OPEN_STATES.includes(screening.case_state)) {
    throw new HttpError(409, "Photos can only be enhanced before the screening is submitted", "SCREENING_SUBMITTED");
  }
  if (!(await hasConsent(pool, screening.patient_id, "IMAGE_CAPTURE"))) {
    throw new HttpError(403, "Record the patient's photograph consent before taking photos", "CONSENT_REQUIRED");
  }

  const image = await cleanImage(file.buffer);
  const enhanced = await imageEnhancementService.enhanceImageBuffer(image.data);

  await audit(req, {
    required: true,
    event: "PHOTO_AI_ENHANCEMENT_PREVIEW",
    resourceType: "screening",
    resourceId: screening.id,
    patientId: screening.patient_id,
    metadata: {
      model: enhanced.model,
      input_size: `${enhanced.input_width}x${enhanced.input_height}`,
      output_size: `${enhanced.width}x${enhanced.height}`,
      duration_ms: enhanced.duration_ms,
      persisted: false,
    },
  });

  return enhanced;
}

async function getEnhancedPhotoFile(userId, screeningId, photoId) {
  const { screening, photo } = await requireEnhanceablePhoto(userId, screeningId, photoId);
  let image;
  try {
    image = await privateImageStorage.getFile(enhancedFilePath(screening.id, photo.id));
  } catch (error) {
    if (error.code === "IMAGE_FILE_MISSING") {
      throw new HttpError(404, "This photo has no AI-enhanced copy yet", "IMAGE_FILE_MISSING");
    }
    throw error;
  }
  return { ...image, mimeType: "image/jpeg" };
}

// ---------- submit ----------

// Sends the case to the Medical Officer queue (case_state AWAITING_CLINICIAN)
async function submitScreening(userId, req, screeningId) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const screening = await requireOwnScreening(client, userId, screeningId, { lock: true });
    if (!OPEN_STATES.includes(screening.case_state)) {
      throw new HttpError(409, "This screening has already been submitted", "SCREENING_SUBMITTED");
    }
    const consents = await currentConsents(client, screening.patient_id);
    if (consents.SCREENING?.granted !== true) {
      throw new HttpError(403, "The patient's screening consent is no longer active", "CONSENT_REQUIRED");
    }
    if (screening.case_state === "CONSENTED") {
      await client.query("UPDATE tbl_screenings SET case_state = 'SCREENED' WHERE id = $1", [screening.id]);
    }
    const { rows } = await client.query(
      `UPDATE tbl_screenings SET case_state = 'AWAITING_CLINICIAN', submitted_at = now()
        WHERE id = $1
        RETURNING id, case_state::text AS case_state, submitted_at`,
      [screening.id]
    );
    const resubmitted = screening.case_state === "SCREENED";
    await audit(req, {
      client,
      required: true,
      event: "SCREENING_SUBMITTED",
      resourceType: "screening",
      resourceId: screening.id,
      patientId: screening.patient_id,
      metadata: { resubmitted },
    });
    await notifyMedicalOfficersScreeningAwaitingReview(client, {
      patientId: screening.patient_id,
      screeningId: screening.id,
      resubmitted,
    });
    return rows[0];
  });
}

module.exports = {
  CONSENT_PURPOSES,
  PHOTO_VIEWS,
  MAX_PHOTO_BYTES,
  getOptions,
  listPatients,
  getConsents,
  recordConsent,
  createScreening,
  getScreening,
  updateRequestedInformation,
  listMyScreenings,
  validatePhoto,
  uploadPhoto,
  removePhoto,
  getPhotoFile,
  enhancePhoto,
  enhancePhotoPreview,
  getEnhancedPhotoFile,
  submitScreening,
};
