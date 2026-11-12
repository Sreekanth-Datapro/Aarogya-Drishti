const HttpError = require("../../utils/httpError");

// ==========================================
// Medical Officer access rules shared by every MO service.
// The Mandal of a patient always comes from the patient's village
// (mst_villages.mandal_id). The MO's Mandals come from
// tbl_medical_officer_mandal_assignments. Nothing is taken from the request.
// ==========================================

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, message = "Invalid ID") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, message, "INVALID_ID");
  }
  return value;
}

function requirePositiveId(value, message = "Invalid ID") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, message, "INVALID_ID");
  return id;
}

// SQL condition: village alias `pv` lies in a Mandal currently assigned to the MO in `userParam`
function mandalScope(userParam, villageAlias = "pv") {
  return `EXISTS (
    SELECT 1 FROM tbl_medical_officer_mandal_assignments moa
     WHERE moa.user_id = ${userParam}
       AND moa.mandal_id = ${villageAlias}.mandal_id
       AND moa.valid_from <= CURRENT_DATE
       AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE))`;
}

function pageOptions(query = {}, defaultSize = 20) {
  const page = Math.min(Math.max(Number(query.page) || 1, 1), 10000);
  const pageSize = Math.min(Math.max(Number(query.page_size) || defaultSize, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function pagination(page, pageSize, total) {
  return { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) };
}

// The MO must hold the active claim on the patient AND still be assigned to the
// patient's Mandal. Returns the patient row; `lock` locks the claim row.
async function requireActiveClaim(db, userId, patientId, { lock = false } = {}) {
  requireUuid(patientId, "Invalid patient ID");
  const { rows } = await db.query(
    `SELECT p.id, p.patient_code, p.registered_facility_id, pv.mandal_id,
            pf.district_id, c.id AS claim_id, c.claimed_at
       FROM tbl_medical_officer_case_claims c
       JOIN tbl_patients p ON p.id = c.patient_id AND p.deleted_at IS NULL
       JOIN mst_villages pv ON pv.id = p.village_id
       JOIN mst_facilities pf ON pf.id = p.registered_facility_id
      WHERE c.patient_id = $2
        AND c.medical_officer_id = $1
        AND c.released_at IS NULL
        AND ${mandalScope("$1")}
      ${lock ? "FOR UPDATE OF c" : ""}`,
    [userId, patientId]
  );
  if (!rows.length) {
    throw new HttpError(403, "Claim this patient from the screening queue before opening clinical details", "CLAIM_REQUIRED");
  }
  return rows[0];
}

// Latest consent row for a purpose decides (consents are append-only).
async function hasConsent(db, patientId, purposeCode) {
  const { rows } = await db.query(
    `SELECT pc.granted
       FROM tbl_patient_consents pc
       JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
      WHERE pc.patient_id = $1 AND cp.code = $2
      ORDER BY pc.consent_seq DESC
      LIMIT 1`,
    [patientId, purposeCode]
  );
  return rows[0]?.granted === true;
}

async function requireConsent(db, patientId, purposeCode) {
  if (!(await hasConsent(db, patientId, purposeCode))) {
    throw new HttpError(403, `The patient has no active ${purposeCode} consent`, "CONSENT_REQUIRED");
  }
}

// Used by clinical-review triggers (fn_review_snapshot reads app.user_id)
async function setActor(client, userId) {
  await client.query("SELECT set_config('app.user_id', $1, TRUE), set_config('app.actor_id', $1, TRUE)", [userId]);
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  requireUuid,
  requirePositiveId,
  mandalScope,
  pageOptions,
  pagination,
  requireActiveClaim,
  hasConsent,
  requireConsent,
  setActor,
  withTransaction,
};
