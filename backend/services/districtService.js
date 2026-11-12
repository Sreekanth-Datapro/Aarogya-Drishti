const pool = require("../db");
const HttpError = require("../utils/httpError");

// ==========================================
// DISTRICT ADMIN - read-only district data
// Every query receives the districtId that was loaded from the District
// Admin's own user record (see requireDistrictAdminScope). Patient data is
// only returned as counts, never as names or contact details.
// ==========================================

const STAFF_ROLES = ["HEALTH_WORKER", "MEDICAL_OFFICER", "SPECIALIST", "NAVIGATOR"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Patients belong to the district of their registered facility, or of their village
const DISTRICT_PATIENTS = `
  FROM tbl_patients p
  LEFT JOIN mst_facilities pf ON pf.id = p.registered_facility_id
  LEFT JOIN mst_villages pv ON pv.id = p.village_id
  LEFT JOIN mst_mandals pm ON pm.id = pv.mandal_id
 WHERE p.deleted_at IS NULL
   AND COALESCE(pf.district_id, pm.district_id) = $1`;

// Staff of the district: their user record or a current facility assignment
const DISTRICT_STAFF = `
  FROM tbl_users u
  JOIN mst_roles r ON r.id = u.role_id
 WHERE u.deleted_at IS NULL
   AND r.code = ANY($2::text[])
   AND (u.district_id = $1 OR EXISTS (
         SELECT 1 FROM tbl_user_facility_assignments ufa
           JOIN mst_facilities af ON af.id = ufa.facility_id
          WHERE ufa.user_id = u.id AND af.district_id = $1
            AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)))`;

// Audit events that belong to the district. "$N" is replaced by the
// placeholder that holds the district id.
function districtAuditCondition(placeholder) {
  return `(
    EXISTS (SELECT 1 FROM tbl_users du WHERE du.id = a.actor_id AND du.district_id = ${placeholder})
    OR (a.resource_type = 'user' AND a.resource_id IN (
          SELECT du.id::text FROM tbl_users du WHERE du.district_id = ${placeholder}))
    OR (a.resource_type = 'facility' AND a.resource_id IN (
          SELECT df.id::text FROM mst_facilities df WHERE df.district_id = ${placeholder}))
    OR (a.resource_type ILIKE '%registration%' AND a.resource_id IN (
          SELECT rr.id::text FROM tbl_user_registration_requests rr
            JOIN mst_facilities rf ON rf.id = rr.facility_id
           WHERE rf.district_id = ${placeholder}))
    OR a.metadata->>'district_id' = ${placeholder}::text
  )`;
}

const toNumber = (value) => (value == null ? 0 : Number(value));

function countRows(rows) {
  return rows.map((row) => ({ ...row, count: toNumber(row.count) }));
}

async function getDistrictProfile(districtId) {
  const { rows } = await pool.query(
    `SELECT id, code, name_en, name_te FROM mst_districts WHERE id = $1`,
    [districtId]
  );
  if (!rows.length) throw new HttpError(404, "District not found", "NOT_FOUND");
  return { ...rows[0], id: Number(rows[0].id) };
}

async function getDashboard(districtId, userId) {
  const [
    district,
    patients,
    caseStates,
    monthly,
    byFacility,
    byMandal,
    staff,
    facilities,
    registrations,
    programme,
    recentRegistrations,
    recentActivity,
    notifications,
  ] = await Promise.all([
    getDistrictProfile(districtId),
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE p.created_at >= now() - interval '30 days') AS new_last_30_days
       ${DISTRICT_PATIENTS}`,
      [districtId]
    ),
    // The latest case state of each patient
    pool.query(
      `SELECT latest.case_state::text AS state, COUNT(*) AS count
         FROM (
           SELECT DISTINCT ON (s.patient_id) s.patient_id, s.case_state
             FROM tbl_screenings s
            WHERE s.patient_id IN (SELECT p.id ${DISTRICT_PATIENTS})
            ORDER BY s.patient_id, s.screening_date DESC, s.created_at DESC
         ) latest
        GROUP BY latest.case_state
        ORDER BY count DESC`,
      [districtId]
    ),
    pool.query(
      `SELECT to_char(m.month_start, 'YYYY-MM') AS month,
              (SELECT COUNT(*) ${DISTRICT_PATIENTS}
                  AND p.created_at >= m.month_start
                  AND p.created_at < m.month_start + interval '1 month') AS count
         FROM generate_series(
                date_trunc('month', now()) - interval '5 months',
                date_trunc('month', now()),
                interval '1 month') AS m(month_start)
        ORDER BY m.month_start`,
      [districtId]
    ),
    pool.query(
      `SELECT f.id, f.name_en, f.name_te,
              (SELECT COUNT(*) FROM tbl_patients p
                WHERE p.registered_facility_id = f.id AND p.deleted_at IS NULL) AS count
         FROM mst_facilities f
        WHERE f.district_id = $1 AND f.is_active = TRUE
        ORDER BY count DESC, f.name_en
        LIMIT 10`,
      [districtId]
    ),
    pool.query(
      `SELECT m.id, m.name_en, m.name_te, COUNT(dp.id) AS count
         FROM mst_mandals m
         LEFT JOIN (
           SELECT p.id, COALESCE(pv.mandal_id, pf.mandal_id) AS mandal_id ${DISTRICT_PATIENTS}
         ) dp ON dp.mandal_id = m.id
        WHERE m.district_id = $1 AND m.is_active = TRUE
        GROUP BY m.id, m.name_en, m.name_te
        ORDER BY count DESC, m.name_en
        LIMIT 10`,
      [districtId]
    ),
    pool.query(
      `SELECT r.code AS role, u.status::text AS status, COUNT(*) AS count
       ${DISTRICT_STAFF}
        GROUP BY r.code, u.status`,
      [districtId, STAFF_ROLES]
    ),
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_active) AS active,
              COUNT(*) FILTER (WHERE facility_type::text = 'PHC') AS phcs,
              COUNT(*) FILTER (WHERE facility_type::text = 'HOSPITAL') AS hospitals
         FROM mst_facilities WHERE district_id = $1`,
      [districtId]
    ),
    pool.query(
      `SELECT rr.status::text AS status, COUNT(*) AS count
         FROM tbl_user_registration_requests rr
         LEFT JOIN mst_facilities rf ON rf.id = rr.facility_id
         LEFT JOIN mst_mandals rm ON rm.id = rr.mandal_id
        WHERE COALESCE(rf.district_id, rm.district_id) = $1
        GROUP BY rr.status`,
      [districtId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(screenings_total), 0) AS screenings_total,
              COALESCE(SUM(doctor_reviews), 0) AS doctor_reviews,
              COALESCE(SUM(specialist_referrals), 0) AS specialist_referrals,
              COALESCE(SUM(overdue_cases), 0) AS overdue_cases,
              COALESCE(SUM(treatment_linked), 0) AS treatment_linked,
              COALESCE(SUM(lost_to_followup), 0) AS lost_to_followup
         FROM vw_district_dashboard_summary WHERE district_id = $1`,
      [districtId]
    ),
    pool.query(
      `SELECT rr.id, rr.full_name, rr.designation, rr.requested_role, rr.status::text AS status,
              rr.created_at, rf.name_en AS facility_name, rf.name_te AS facility_name_te
         FROM tbl_user_registration_requests rr
         LEFT JOIN mst_facilities rf ON rf.id = rr.facility_id
         LEFT JOIN mst_mandals rm ON rm.id = rr.mandal_id
        WHERE COALESCE(rf.district_id, rm.district_id) = $1
        ORDER BY rr.created_at DESC
        LIMIT 5`,
      [districtId]
    ),
    pool.query(
      `SELECT a.id, a.occurred_at, a.event, a.outcome, a.actor_role, u.full_name AS actor_name
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE ${districtAuditCondition("$1")}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT 8`,
      [districtId]
    ),
    pool.query(
      `SELECT n.id, n.channel::text AS channel, n.status::text AS status, n.created_at
         FROM tbl_notifications n
        WHERE n.recipient_user_id = $1
        ORDER BY n.created_at DESC
        LIMIT 5`,
      [userId]
    ),
  ]);

  const staffTotals = {};
  for (const role of STAFF_ROLES) staffTotals[role] = 0;
  let activeStaff = 0;
  let suspendedStaff = 0;
  let pendingStaff = 0;
  for (const row of staff.rows) {
    const count = toNumber(row.count);
    staffTotals[row.role] = (staffTotals[row.role] || 0) + count;
    if (row.status === "ACTIVE") activeStaff += count;
    if (row.status === "SUSPENDED") suspendedStaff += count;
    if (row.status === "PENDING_SETUP") pendingStaff += count;
  }

  const registrationTotals = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of registrations.rows) registrationTotals[row.status] = toNumber(row.count);

  const programmeRow = programme.rows[0] || {};
  const programmeTotals = {};
  for (const [key, value] of Object.entries(programmeRow)) programmeTotals[key] = toNumber(value);

  return {
    district,
    patients: {
      total: toNumber(patients.rows[0].total),
      new_last_30_days: toNumber(patients.rows[0].new_last_30_days),
    },
    case_states: countRows(caseStates.rows),
    monthly_registrations: countRows(monthly.rows),
    patients_by_facility: countRows(byFacility.rows).map((row) => ({ ...row, id: Number(row.id) })),
    patients_by_mandal: countRows(byMandal.rows).map((row) => ({ ...row, id: Number(row.id) })),
    staff: {
      by_role: staffTotals,
      active: activeStaff,
      suspended: suspendedStaff,
      pending_setup: pendingStaff,
    },
    facilities: {
      total: toNumber(facilities.rows[0].total),
      active: toNumber(facilities.rows[0].active),
      phcs: toNumber(facilities.rows[0].phcs),
      hospitals: toNumber(facilities.rows[0].hospitals),
    },
    registrations: registrationTotals,
    programme: programmeTotals,
    recent_registrations: recentRegistrations.rows,
    recent_activity: recentActivity.rows.map((row) => ({ ...row, id: Number(row.id) })),
    recent_notifications: notifications.rows,
  };
}

// ---------- programme indicators (vw_district_dashboard_summary) ----------

const PROGRAMME_FIELDS = [
  "screenings_total",
  "doctor_reviews",
  "ai_flagged_for_review",
  "suspicious_findings",
  "specialist_referrals",
  "appointments_completed",
  "specialist_assessments_completed",
  "overdue_cases",
  "biopsies_ordered",
  "pathology_completed",
  "precancers_clinician_confirmed",
  "cancers_pathology_confirmed",
  "treatment_linked",
  "treatment_started",
  "lost_to_followup",
];

const SUM_FIELDS = PROGRAMME_FIELDS.map((field) => `COALESCE(SUM(${field}), 0) AS ${field}`).join(", ");

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function assertMandalInDistrict(districtId, mandalId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM mst_mandals WHERE id = $1 AND district_id = $2",
    [mandalId, districtId]
  );
  if (!rows.length) throw new HttpError(404, "Mandal not found", "NOT_FOUND");
}

async function getProgramme(districtId, query = {}) {
  const params = [districtId];
  const where = ["district_id = $1"];
  const mandalId = Number(query.mandal_id);
  if (Number.isSafeInteger(mandalId) && mandalId > 0) {
    await assertMandalInDistrict(districtId, mandalId);
    params.push(mandalId);
    where.push(`mandal_id = $${params.length}`);
  }
  if (isDate(query.date_from)) {
    params.push(query.date_from);
    where.push(`month_start >= date_trunc('month', $${params.length}::date)`);
  }
  if (isDate(query.date_to)) {
    params.push(query.date_to);
    where.push(`month_start <= $${params.length}::date`);
  }
  const whereSql = where.join(" AND ");

  const [totals, byMandal, byMonth, mandals] = await Promise.all([
    pool.query(
      `SELECT ${SUM_FIELDS},
              ROUND(AVG(avg_hours_to_review), 1) AS avg_hours_to_review,
              ROUND(AVG(avg_hours_to_diagnosis), 1) AS avg_hours_to_diagnosis
         FROM vw_district_dashboard_summary WHERE ${whereSql}`,
      params
    ),
    pool.query(
      `SELECT s.mandal_id AS id, m.name_en, m.name_te,
              COALESCE(SUM(s.screenings_total), 0) AS screenings_total,
              COALESCE(SUM(s.specialist_referrals), 0) AS specialist_referrals,
              COALESCE(SUM(s.treatment_linked), 0) AS treatment_linked
         FROM vw_district_dashboard_summary s
         LEFT JOIN mst_mandals m ON m.id = s.mandal_id
        WHERE ${whereSql.replace(/\b(district_id|mandal_id|month_start)\b/g, "s.$1")}
        GROUP BY s.mandal_id, m.name_en, m.name_te
        ORDER BY screenings_total DESC, m.name_en`,
      params
    ),
    pool.query(
      `SELECT to_char(month_start, 'YYYY-MM') AS month,
              COALESCE(SUM(screenings_total), 0) AS screenings_total,
              COALESCE(SUM(doctor_reviews), 0) AS doctor_reviews,
              COALESCE(SUM(specialist_referrals), 0) AS specialist_referrals
         FROM vw_district_dashboard_summary WHERE ${whereSql}
        GROUP BY month_start
        ORDER BY month_start`,
      params
    ),
    pool.query(
      "SELECT id, name_en, name_te FROM mst_mandals WHERE district_id = $1 AND is_active = TRUE ORDER BY name_en",
      [districtId]
    ),
  ]);

  const totalRow = totals.rows[0] || {};
  const summary = {};
  for (const field of PROGRAMME_FIELDS) summary[field] = toNumber(totalRow[field]);
  summary.avg_hours_to_review = totalRow.avg_hours_to_review == null ? null : Number(totalRow.avg_hours_to_review);
  summary.avg_hours_to_diagnosis = totalRow.avg_hours_to_diagnosis == null ? null : Number(totalRow.avg_hours_to_diagnosis);

  const numberRow = (row) => {
    const clean = { ...row };
    for (const key of Object.keys(clean)) {
      if (!["name_en", "name_te", "month"].includes(key)) clean[key] = clean[key] == null ? null : Number(clean[key]);
    }
    return clean;
  };

  return {
    summary,
    by_mandal: byMandal.rows.map(numberRow),
    by_month: byMonth.rows.map(numberRow),
    mandals: mandals.rows.map((row) => ({ ...row, id: Number(row.id) })),
  };
}

// ---------- de-identified patient list ----------
// Only: patient code, age, sex, village, mandal, facility, registration date and
// workflow stage. Never names, phone numbers, addresses, date of birth or
// clinical notes.

const CASE_STATES = [
  "DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN", "REVIEWED", "REFERRAL_PLANNED",
  "APPOINTED", "ASSESSED", "DIAGNOSTICS_PENDING", "RESULT_REVIEWED", "CARE_LINKED", "CLOSED",
  "RESCHEDULED", "MISSED", "DECLINED", "LOST_CONTACT",
];

// Waiting times for doctor review: alert after 24 hours, escalation after 48 hours
const REVIEW_ALERT_HOURS = 24;
const REVIEW_ESCALATION_HOURS = 48;

async function listPatients(districtId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const params = [districtId];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const search = searchText(query);
  if (search) where.push(`p.patient_code ILIKE ${add(`%${search}%`)}`);

  // Patients registered by one Health Worker (the list itself stays limited to the district)
  if (UUID_PATTERN.test(String(query.health_worker_id || ""))) {
    where.push(`p.registered_by = ${add(query.health_worker_id)}`);
  }

  const mandalId = Number(query.mandal_id);
  if (Number.isSafeInteger(mandalId) && mandalId > 0) {
    where.push(`COALESCE(pv.mandal_id, pf.mandal_id) = ${add(mandalId)}`);
  }
  const facilityId = Number(query.facility_id);
  if (Number.isSafeInteger(facilityId) && facilityId > 0) {
    where.push(`p.registered_facility_id = ${add(facilityId)}`);
  }
  const status = String(query.status || "").toUpperCase();
  if (status === "NOT_SCREENED") where.push("latest.case_state IS NULL");
  else if (CASE_STATES.includes(status)) where.push(`latest.case_state::text = ${add(status)}`);

  if (isDate(query.date_from)) where.push(`p.created_at >= ${add(query.date_from)}::date`);
  if (isDate(query.date_to)) where.push(`p.created_at < (${add(query.date_to)}::date + interval '1 day')`);

  const waitingHours = `CASE WHEN latest.case_state = 'AWAITING_CLINICIAN'
    THEN EXTRACT(EPOCH FROM (now() - latest.waiting_since)) / 3600 END`;
  if (query.review === "alert") where.push(`${waitingHours} >= ${REVIEW_ALERT_HOURS}`);
  if (query.review === "escalation") where.push(`${waitingHours} >= ${REVIEW_ESCALATION_HOURS}`);

  const fromSql = `
    FROM tbl_patients p
    LEFT JOIN mst_facilities pf ON pf.id = p.registered_facility_id
    LEFT JOIN mst_villages pv ON pv.id = p.village_id
    LEFT JOIN mst_mandals pm ON pm.id = COALESCE(pv.mandal_id, pf.mandal_id)
    LEFT JOIN mst_mandals vm ON vm.id = pv.mandal_id
    LEFT JOIN LATERAL (
      SELECT s.case_state, COALESCE(s.submitted_at, s.created_at) AS waiting_since
        FROM tbl_screenings s
       WHERE s.patient_id = p.id
       ORDER BY s.screening_date DESC, s.created_at DESC
       LIMIT 1
    ) latest ON TRUE
   WHERE p.deleted_at IS NULL
     AND COALESCE(pf.district_id, vm.district_id) = $1
     ${where.length ? `AND ${where.join(" AND ")}` : ""}`;

  const filterParams = [...params];
  const limitSql = `LIMIT ${add(pageSize)} OFFSET ${add(offset)}`;

  const [count, rows] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE latest.case_state = 'AWAITING_CLINICIAN') AS awaiting_review,
              COUNT(*) FILTER (WHERE ${waitingHours} >= ${REVIEW_ALERT_HOURS}) AS review_alerts,
              COUNT(*) FILTER (WHERE ${waitingHours} >= ${REVIEW_ESCALATION_HOURS}) AS review_escalations
       ${fromSql}`,
      filterParams
    ),
    pool.query(
      `SELECT p.id, p.patient_code,
              COALESCE(p.age_years, date_part('year', age(p.date_of_birth))::int) AS age_years,
              p.sex::text AS sex,
              pv.name_en AS village_name, pv.name_te AS village_name_te,
              pm.name_en AS mandal_name, pm.name_te AS mandal_name_te,
              pf.name_en AS facility_name, pf.name_te AS facility_name_te,
              p.created_at AS registered_at,
              latest.case_state::text AS case_state,
              ROUND((${waitingHours})::numeric, 1) AS waiting_hours
       ${fromSql}
        ORDER BY p.created_at DESC, p.id
        ${limitSql}`,
      params
    ),
  ]);

  const totals = count.rows[0];
  const total = toNumber(totals.total);
  return {
    patients: rows.rows.map((row) => {
      const hours = row.waiting_hours == null ? null : Number(row.waiting_hours);
      return {
        ...row,
        age_years: row.age_years == null ? null : Number(row.age_years),
        waiting_hours: hours,
        review_alert: hours != null && hours >= REVIEW_ALERT_HOURS,
        review_escalation: hours != null && hours >= REVIEW_ESCALATION_HOURS,
      };
    }),
    summary: {
      total,
      awaiting_review: toNumber(totals.awaiting_review),
      review_alerts: toNumber(totals.review_alerts),
      review_escalations: toNumber(totals.review_escalations),
    },
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

// ---------- Health Workers of the district (view only) ----------

const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "DISABLED", "PENDING_SETUP"];

// Every Health Worker whose account or current facility belongs to the district,
// with their current work location and the number of patients they registered.
// No password hashes, MFA secrets or patient details are returned.
async function listHealthWorkers(districtId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const search = searchText(query);
  const mandalId = Number(query.mandal_id);
  const hasMandal = Number.isSafeInteger(mandalId) && mandalId > 0;
  if (hasMandal) await assertMandalInDistrict(districtId, mandalId);
  const status = ACCOUNT_STATUSES.includes(query.status) ? query.status : null;

  const params = [districtId, search ? `%${search}%` : null, hasMandal ? mandalId : null, status];
  const fromSql = `
    FROM tbl_users u
    JOIN mst_roles r ON r.id = u.role_id AND r.code = 'HEALTH_WORKER'
    LEFT JOIN LATERAL (
      SELECT hwa.mandal_id, hwa.village_id, hwa.facility_id
        FROM tbl_health_worker_location_assignments hwa
       WHERE hwa.user_id = u.id AND hwa.valid_to IS NULL
       ORDER BY hwa.valid_from DESC
       LIMIT 1
    ) loc ON TRUE
    LEFT JOIN LATERAL (
      SELECT ufa.facility_id
        FROM tbl_user_facility_assignments ufa
       WHERE ufa.user_id = u.id AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)
       ORDER BY ufa.is_primary DESC
       LIMIT 1
    ) fa ON TRUE
    LEFT JOIN mst_facilities f ON f.id = COALESCE(loc.facility_id, fa.facility_id)
    LEFT JOIN mst_mandals m ON m.id = COALESCE(loc.mandal_id, f.mandal_id)
    LEFT JOIN mst_villages v ON v.id = loc.village_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS patient_count
        FROM tbl_patients p
       WHERE p.registered_by = u.id AND p.deleted_at IS NULL
    ) pc ON TRUE
   WHERE u.deleted_at IS NULL
     AND (u.district_id = $1 OR f.district_id = $1)
     AND ($2::text IS NULL OR u.full_name ILIKE $2 OR u.username ILIKE $2)
     AND ($3::bigint IS NULL OR m.id = $3)
     AND ($4::text IS NULL OR u.status::text = $4)`;

  const [count, rows] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE u.status = 'ACTIVE') AS active,
              COUNT(*) FILTER (WHERE loc.mandal_id IS NULL) AS without_location,
              COALESCE(SUM(pc.patient_count), 0) AS patients
       ${fromSql}`,
      params
    ),
    pool.query(
      `SELECT u.id, u.username, u.full_name, u.phone, u.designation, u.status::text AS status,
              u.last_login_at, u.created_at,
              m.name_en AS mandal_name, m.name_te AS mandal_name_te,
              v.name_en AS village_name, v.name_te AS village_name_te,
              f.name_en AS facility_name, f.name_te AS facility_name_te,
              (loc.mandal_id IS NOT NULL) AS has_location,
              pc.patient_count
       ${fromSql}
        ORDER BY u.full_name, u.id
        LIMIT $5 OFFSET $6`,
      [...params, pageSize, offset]
    ),
  ]);

  const totals = count.rows[0];
  const total = toNumber(totals.total);
  return {
    health_workers: rows.rows.map((row) => ({ ...row, patient_count: toNumber(row.patient_count) })),
    summary: {
      total,
      active: toNumber(totals.active),
      without_location: toNumber(totals.without_location),
      patients: toNumber(totals.patients),
    },
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

// ---------- mandals and villages (view only) ----------

function pageOptions(query) {
  const page = Math.min(Math.max(Number(query.page) || 1, 1), 100000);
  const pageSize = Math.min(Math.max(Number(query.page_size) || 25, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function searchText(query) {
  return typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
}

async function listMandals(districtId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const search = searchText(query);
  const params = [districtId, search ? `%${search}%` : null];
  const where = `m.district_id = $1
    AND ($2::text IS NULL OR m.name_en ILIKE $2 OR m.name_te ILIKE $2 OR m.code ILIKE $2)`;

  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM mst_mandals m WHERE ${where}`, params),
    pool.query(
      `SELECT m.id, m.code, m.name_en, m.name_te, m.lgd_code, m.is_active, m.is_verified, m.data_source,
              (SELECT COUNT(*) FROM mst_villages v WHERE v.mandal_id = m.id) AS village_count,
              (SELECT COUNT(*) FROM mst_facilities f WHERE f.mandal_id = m.id) AS facility_count
         FROM mst_mandals m
        WHERE ${where}
        ORDER BY m.name_en
        LIMIT $3 OFFSET $4`,
      [...params, pageSize, offset]
    ),
  ]);

  const total = toNumber(count.rows[0].total);
  return {
    mandals: rows.rows.map((row) => ({
      ...row,
      id: Number(row.id),
      village_count: toNumber(row.village_count),
      facility_count: toNumber(row.facility_count),
    })),
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

async function listVillages(districtId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const search = searchText(query);
  const mandalId = Number(query.mandal_id);
  const hasMandal = Number.isSafeInteger(mandalId) && mandalId > 0;
  if (hasMandal) await assertMandalInDistrict(districtId, mandalId);

  const params = [districtId, search ? `%${search}%` : null, hasMandal ? mandalId : null];
  const where = `m.district_id = $1
    AND ($2::text IS NULL OR v.name_en ILIKE $2 OR v.name_te ILIKE $2 OR v.code ILIKE $2)
    AND ($3::bigint IS NULL OR v.mandal_id = $3)`;

  const [count, rows] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total FROM mst_villages v JOIN mst_mandals m ON m.id = v.mandal_id WHERE ${where}`,
      params
    ),
    pool.query(
      `SELECT v.id, v.code, v.name_en, v.name_te, v.lgd_code, v.is_active, v.is_verified,
              v.mandal_id, m.name_en AS mandal_name, m.name_te AS mandal_name_te,
              (SELECT COUNT(*) FROM mst_facilities f WHERE f.village_id = v.id) AS facility_count
         FROM mst_villages v
         JOIN mst_mandals m ON m.id = v.mandal_id
        WHERE ${where}
        ORDER BY m.name_en, v.name_en
        LIMIT $4 OFFSET $5`,
      [...params, pageSize, offset]
    ),
  ]);

  const total = toNumber(count.rows[0].total);
  return {
    villages: rows.rows.map((row) => ({
      ...row,
      id: Number(row.id),
      mandal_id: Number(row.mandal_id),
      facility_count: toNumber(row.facility_count),
    })),
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

module.exports = {
  STAFF_ROLES,
  districtAuditCondition,
  getDistrictProfile,
  getDashboard,
  getProgramme,
  listPatients,
  listHealthWorkers,
  listMandals,
  listVillages,
};
