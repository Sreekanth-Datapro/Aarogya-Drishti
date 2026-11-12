const pool = require("../../db");
const { mandalScope, pageOptions, pagination } = require("./scope");
const { activeScreeningOrder } = require("../../utils/screeningSelection");

const CASE_STATES = [
  "DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN", "REVIEWED", "REFERRAL_PLANNED",
  "APPOINTED", "ASSESSED", "DIAGNOSTICS_PENDING", "RESULT_REVIEWED", "CARE_LINKED", "CLOSED",
  "RESCHEDULED", "MISSED", "DECLINED", "LOST_CONTACT",
];

// Patients of my Mandals. The name is shown only for patients I have claimed;
// clinical details are never part of this list.
async function listMandalPatients(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const params = [userId];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const search = typeof query.search === "string" ? query.search.trim().slice(0, 50) : "";
  if (search) where.push(`p.patient_code ILIKE ${add(`%${search}%`)}`);

  const villageId = Number(query.village_id);
  if (Number.isSafeInteger(villageId) && villageId > 0) where.push(`p.village_id = ${add(villageId)}`);

  const status = String(query.status || "").toUpperCase();
  if (status === "NOT_SCREENED") {
    where.push("latest_screening_consent.granted IS TRUE AND latest.case_state IS NULL");
  } else if (CASE_STATES.includes(status)) {
    where.push(`latest_screening_consent.granted IS TRUE AND latest.case_state::text = ${add(status)}`);
  }

  if (query.claim === "mine") where.push("claim.medical_officer_id = $1");
  if (query.claim === "others") where.push("claim.id IS NOT NULL AND claim.medical_officer_id <> $1");
  if (query.claim === "none") where.push("claim.id IS NULL");

  const fromSql = `
    FROM tbl_patients p
    JOIN mst_villages pv ON pv.id = p.village_id
    JOIN mst_mandals pm ON pm.id = pv.mandal_id
    JOIN mst_facilities pf ON pf.id = p.registered_facility_id
    LEFT JOIN LATERAL (
      SELECT s.case_state, s.screening_date
        FROM tbl_screenings s
       WHERE s.patient_id = p.id
       ORDER BY ${activeScreeningOrder("s")}
       LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT pc.granted
        FROM tbl_patient_consents pc
        JOIN mst_consent_purposes purpose ON purpose.id = pc.purpose_id
       WHERE pc.patient_id = p.id
         AND purpose.code = 'SCREENING'
       ORDER BY pc.consent_seq DESC
       LIMIT 1
    ) latest_screening_consent ON TRUE
    LEFT JOIN tbl_medical_officer_case_claims claim
      ON claim.patient_id = p.id AND claim.released_at IS NULL
   WHERE p.deleted_at IS NULL
     AND ${mandalScope("$1")}
     ${where.length ? `AND ${where.join(" AND ")}` : ""}`;

  const filterParams = [...params];
  const limitSql = `LIMIT ${add(pageSize)} OFFSET ${add(offset)}`;

  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total ${fromSql}`, filterParams),
    pool.query(
      `SELECT p.id, p.patient_code,
              latest_screening_consent.granted IS TRUE AS screening_consent_active,
              CASE WHEN latest_screening_consent.granted IS TRUE
                         AND claim.medical_officer_id = $1 THEN p.full_name END AS full_name,
              CASE WHEN latest_screening_consent.granted IS TRUE THEN p.sex::text END AS sex,
              CASE WHEN latest_screening_consent.granted IS TRUE
                   THEN COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int)
              END AS age_years,
              pv.name_en AS village_name, pv.name_te AS village_name_te,
              pm.name_en AS mandal_name, pm.name_te AS mandal_name_te,
              pf.name_en AS facility_name, pf.name_te AS facility_name_te,
              p.created_at AS registered_at,
              CASE WHEN latest_screening_consent.granted IS TRUE
                   THEN latest.case_state::text
              END AS case_state,
              CASE WHEN latest_screening_consent.granted IS TRUE
                   THEN latest.screening_date
              END AS screening_date,
              CASE WHEN claim.id IS NULL THEN 'NONE'
                   WHEN claim.medical_officer_id = $1 THEN 'MINE'
                   ELSE 'OTHER' END AS claim_status,
              CASE WHEN claim.medical_officer_id = $1 THEN claim.claimed_at END AS claimed_at
       ${fromSql}
        ORDER BY p.created_at DESC, p.id
        ${limitSql}`,
      params
    ),
  ]);

  const total = Number(count.rows[0].total);
  return {
    patients: rows.rows.map((row) => ({ ...row, age_years: row.age_years == null ? null : Number(row.age_years) })),
    pagination: pagination(page, pageSize, total),
  };
}

// Villages of my Mandals that have registered patients (for the filter)
async function listPatientVillages(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT pv.id, pv.name_en, pv.name_te, pm.name_en AS mandal_name, pm.name_te AS mandal_name_te
       FROM tbl_patients p
       JOIN mst_villages pv ON pv.id = p.village_id
       JOIN mst_mandals pm ON pm.id = pv.mandal_id
      WHERE p.deleted_at IS NULL AND ${mandalScope("$1")}
      ORDER BY pm.name_en, pv.name_en`,
    [userId]
  );
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

module.exports = { CASE_STATES, listMandalPatients, listPatientVillages };
