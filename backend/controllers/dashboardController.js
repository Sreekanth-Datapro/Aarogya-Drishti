const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { version: APP_VERSION } = require("../package.json");
const { audit } = require("../utils/audit");
const { resolveAuthorizedDistrict } = require("../utils/districtAuthorization");

// ==========================================
// DASHBOARD CONTROLLER - SYSTEM ADMINISTRATOR
// Fetches real public health indicators, facilities,
// users, registration requests and system monitoring.
// ==========================================

// 1. Master Counts (Districts, Mandals, Villages, Facilities)
async function masterCounts(districtId) {
  let query = `SELECT
       (SELECT COUNT(*) FROM mst_districts WHERE is_active = TRUE) AS districts,
       (SELECT COUNT(*) FROM mst_mandals WHERE is_active = TRUE) AS mandals,
       (SELECT COUNT(*) FROM mst_villages WHERE is_active = TRUE) AS villages,
       (SELECT COUNT(*) FROM mst_facilities WHERE is_active = TRUE) AS facilities`;
  const params = [];
  if (districtId !== null) {
    query = `SELECT
       1 AS districts,
       (SELECT COUNT(*) FROM mst_mandals WHERE is_active = TRUE AND district_id = $1) AS mandals,
       (SELECT COUNT(*) FROM mst_villages v JOIN mst_mandals m ON m.id = v.mandal_id
          WHERE v.is_active = TRUE AND m.district_id = $1) AS villages,
       (SELECT COUNT(*) FROM mst_facilities WHERE is_active = TRUE AND district_id = $1) AS facilities`;
    params.push(districtId);
  }
  const { rows } = await pool.query(query, params);

  const row = rows[0];
  return {
    districts: Number(row.districts),
    mandals: Number(row.mandals),
    villages: Number(row.villages),
    facilities: Number(row.facilities),
  };
}

// 2. Active Accounts by Role
async function usersByRole(districtId) {
  let query = `SELECT r.code AS role, COUNT(u.id) AS total
       FROM mst_roles r
       LEFT JOIN tbl_users u
              ON u.role_id = r.id
             AND u.status = 'ACTIVE'
             AND u.deleted_at IS NULL
      GROUP BY r.id, r.code
      ORDER BY r.id`;
  const params = [];
  if (districtId !== null) {
    params.push(districtId);
    query = `SELECT r.code AS role, COUNT(u.id) AS total
       FROM mst_roles r
       LEFT JOIN tbl_users u
              ON u.role_id = r.id
             AND u.status = 'ACTIVE'
             AND u.deleted_at IS NULL
             AND (u.district_id = $1 OR EXISTS (
               SELECT 1 FROM tbl_user_facility_assignments ufa
               JOIN mst_facilities f ON f.id = ufa.facility_id
               WHERE ufa.user_id = u.id AND f.district_id = $1
             ))
      GROUP BY r.id, r.code
      ORDER BY r.id`;
  }
  const { rows } = await pool.query(query, params);

  return rows.map((row) => ({ role: row.role, total: Number(row.total) }));
}

// 3. Pending Registration Requests Count
async function pendingRegistrations(districtId) {
  let query = `SELECT COUNT(*) AS total FROM tbl_user_registration_requests WHERE status = 'PENDING'`;
  const params = [];
  if (districtId !== null) {
    query = `SELECT COUNT(*) AS total
       FROM tbl_user_registration_requests r
       JOIN mst_facilities f ON f.id = r.facility_id
      WHERE r.status = 'PENDING' AND f.district_id = $1`;
    params.push(districtId);
  }
  const { rows } = await pool.query(query, params);

  return Number(rows[0].total);
}

// 4. Detailed Registration Requests Summary
async function registrationRequestsSummary(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const districtJoin = districtId !== null ? `JOIN mst_facilities f ON f.id = r.facility_id` : "";
  const districtWhere = districtId !== null ? `WHERE f.district_id = $1` : "";
  const [countsResult, recentResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
        COUNT(*) AS total
      FROM tbl_user_registration_requests r
      ${districtJoin}
      ${districtWhere}
    `, params),
    pool.query(`
      SELECT
        r.id,
        r.full_name,
        r.username,
        r.phone,
        r.designation,
        r.status,
        r.created_at,
        f.name_en AS facility_name,
        f.name_te AS facility_name_te,
        m.name_en AS mandal_name,
        m.name_te AS mandal_name_te,
        v.name_en AS village_name,
        v.name_te AS village_name_te
      FROM tbl_user_registration_requests r
      LEFT JOIN mst_facilities f ON f.id = r.facility_id
      LEFT JOIN mst_mandals m ON m.id = r.mandal_id
      LEFT JOIN mst_villages v ON v.id = r.village_id
      ${districtId !== null ? `WHERE f.district_id = $1` : ""}
      ORDER BY r.created_at DESC
      LIMIT 10
    `, params),
  ]);

  const row = countsResult.rows[0];
  return {
    pending: Number(row.pending || 0),
    approved: Number(row.approved || 0),
    rejected: Number(row.rejected || 0),
    total: Number(row.total || 0),
    recent: recentResult.rows.map((r) => ({
      ...r,
      created_at: r.created_at ? r.created_at.toISOString() : null,
    })),
  };
}

// 5. Active Health Workers (ASHA, ANM, CHO)
async function activeHealthWorkersCount(districtId) {
  let query = `SELECT COUNT(*) AS total
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
      WHERE r.code = 'HEALTH_WORKER'
        AND u.status = 'ACTIVE'
        AND u.deleted_at IS NULL`;
  const params = [];
  if (districtId !== null) {
    params.push(districtId);
    query += ` AND (u.district_id = $1 OR EXISTS (
      SELECT 1 FROM tbl_user_facility_assignments ufa
      JOIN mst_facilities f ON f.id = ufa.facility_id
      WHERE ufa.user_id = u.id AND f.district_id = $1
    ))`;
  }
  const { rows } = await pool.query(query, params);

  return Number(rows[0].total);
}

// 6. Total Registered Users
async function totalUsersCount(districtId) {
  let query = `SELECT COUNT(*) AS total
       FROM tbl_users
      WHERE status = 'ACTIVE'
        AND deleted_at IS NULL`;
  const params = [];
  if (districtId !== null) {
    params.push(districtId);
    query = `SELECT COUNT(*) AS total
       FROM tbl_users u
      WHERE u.status = 'ACTIVE'
        AND u.deleted_at IS NULL
        AND (u.district_id = $1 OR EXISTS (
          SELECT 1 FROM tbl_user_facility_assignments ufa
          JOIN mst_facilities f ON f.id = ufa.facility_id
          WHERE ufa.user_id = u.id AND f.district_id = $1
        ))`;
  }
  const { rows } = await pool.query(query, params);

  return Number(rows[0].total);
}

async function pendingSetupAccountsCount(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS total
      FROM tbl_users u
      JOIN mst_roles r ON r.id = u.role_id
     WHERE u.status = 'PENDING_SETUP'
       AND u.deleted_at IS NULL
       AND r.code = 'DISTRICT_ADMIN'
       ${districtId !== null ? "AND u.district_id = $1" : ""}
  `, params);
  return Number(rows[0].total);
}

// 7. Facilities by Category Breakdown
async function facilityCounts(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const { rows } = await pool.query(
    `SELECT COUNT(*)                                     AS total,
            COUNT(*) FILTER (WHERE is_active)            AS active,
            COUNT(*) FILTER (WHERE category = 'PHC')     AS phc,
            COUNT(*) FILTER (WHERE category = 'CHC')     AS chc,
            COUNT(*) FILTER (WHERE category IN ('DISTRICT_HOSPITAL', 'AREA_HOSPITAL', 'MEDICAL_COLLEGE')) AS hospital
       FROM mst_facilities
       ${districtId !== null ? "WHERE district_id = $1" : ""}`,
    params
  );
  const row = rows[0];
  const counts = {
    total: Number(row.total),
    active: Number(row.active),
    phc: Number(row.phc),
    chc: Number(row.chc),
    hospital: Number(row.hospital),
  };
  counts.other = counts.total - counts.phc - counts.chc - counts.hospital;
  return counts;
}

// 8. Registered Patients Total
async function patientCount(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const query = districtId !== null
    ? `SELECT COUNT(*) AS total
         FROM tbl_patients p
         JOIN mst_facilities f ON f.id = p.registered_facility_id
        WHERE f.district_id = $1`
    : "SELECT COUNT(*) AS total FROM tbl_patients";
  const { rows } = await pool.query(query, params);
  return Number(rows[0].total);
}

// 9. Monthly Trends for the Last 6 Months (Dynamic from PostgreSQL)
async function monthlyTrends(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const registrationFilter = districtId !== null ? ` AND EXISTS (SELECT 1 FROM mst_facilities rf WHERE rf.id = r.facility_id AND rf.district_id = $1)` : "";
  const patientFilter = districtId !== null ? ` AND EXISTS (SELECT 1 FROM mst_facilities pf WHERE pf.id = p.registered_facility_id AND pf.district_id = $1)` : "";
  const facilityFilter = districtId !== null ? ` AND f.district_id = $1` : "";
  const appointmentFilter = districtId !== null ? ` AND EXISTS (
      SELECT 1 FROM tbl_patients ap JOIN mst_facilities af ON af.id = ap.registered_facility_id
      WHERE ap.id = a.patient_id AND af.district_id = $1
    )` : "";
  const { rows } = await pool.query(`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', NOW() - INTERVAL '5 months'),
        date_trunc('month', NOW()),
        INTERVAL '1 month'
      )::date AS month_start
    )
    SELECT
      to_char(m.month_start, 'Mon') AS month,
      to_char(m.month_start, 'YYYY-MM') AS month_key,
      (SELECT COUNT(*) FROM tbl_user_registration_requests r WHERE date_trunc('month', r.created_at) = m.month_start${registrationFilter}) AS registrations,
      (SELECT COUNT(*) FROM tbl_patients p WHERE date_trunc('month', p.created_at) = m.month_start${patientFilter}) AS patients,
      (SELECT COUNT(*) FROM mst_facilities f WHERE date_trunc('month', f.created_at) = m.month_start${facilityFilter}) AS facilities,
      (SELECT COUNT(*) FROM tbl_hospital_appointments a WHERE date_trunc('month', a.created_at) = m.month_start${appointmentFilter}) AS appointments
    FROM months m
    ORDER BY m.month_start ASC
  `, params);

  return rows.map((r) => ({
    month: r.month,
    month_key: r.month_key,
    registrations: Number(r.registrations || 0),
    patients: Number(r.patients || 0),
    facilities: Number(r.facilities || 0),
    appointments: Number(r.appointments || 0),
  }));
}

// 10. District Overview (Paderu / Alluri Sitharama Raju District)
async function districtOverview(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const { rows } = await pool.query(`
    SELECT d.id, d.name_en, d.name_te, d.lgd_code,
           (SELECT COUNT(*) FROM mst_mandals m WHERE m.district_id = d.id AND m.is_active = TRUE) AS mandals,
           (SELECT COUNT(*) FROM mst_villages v JOIN mst_mandals m ON m.id = v.mandal_id WHERE m.district_id = d.id AND v.is_active = TRUE) AS villages,
           (SELECT COUNT(*) FROM mst_facilities f WHERE f.district_id = d.id AND f.is_active = TRUE) AS facilities,
           (SELECT COUNT(*) FROM tbl_users u WHERE u.district_id = d.id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) AS active_users
      FROM mst_districts d
     WHERE d.is_active = TRUE
     ${districtId !== null ? "AND d.id = $1" : ""}
     ORDER BY d.name_en
  `, params);
  return rows.map((d) => ({
    id: Number(d.id),
    name_en: d.name_en,
    name_te: d.name_te,
    lgd_code: d.lgd_code,
    mandals: Number(d.mandals || 0),
    villages: Number(d.villages || 0),
    facilities: Number(d.facilities || 0),
    active_users: Number(d.active_users || 0),
  }));
}

// 11. Last Successful Backup Info (Real disk scan from backups/)
function lastBackupInfo() {
  try {
    const backupDir = path.resolve(__dirname, "../../backups");
    if (!fs.existsSync(backupDir)) return null;

    const files = fs
      .readdirSync(backupDir)
      .filter((name) => name.endsWith(".dump") || name.endsWith(".sql"))
      .map((name) => {
        const stats = fs.statSync(path.join(backupDir, name));
        return { name, time: stats.mtime };
      })
      .sort((a, b) => b.time - a.time);

    if (!files.length) return null;

    const latest = files[0].time;
    return {
      at: latest.toISOString(),
      formatted:
        latest.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        ", " +
        latest.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      filename: files[0].name,
    };
  } catch {
    return null;
  }
}

// 12. Latest Audit Logs for Recent Activity
async function recentActivity(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const { rows } = await pool.query(
    `SELECT id, event, outcome, occurred_at
       FROM tbl_audit_logs
      ${districtId !== null ? `WHERE actor_id IN (
         SELECT u.id FROM tbl_users u WHERE u.district_id = $1
       ) OR (metadata ? 'district_id' AND metadata->>'district_id' = $1::text)` : ""}
      ORDER BY occurred_at DESC, id DESC
      LIMIT 6`
    , params
  );
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

// 13. System Monitoring & Health Information
async function systemInfo() {
  const pingStart = Date.now();
  const [version, lastImport] = await Promise.all([
    pool.query("SHOW server_version"),
    pool.query("SELECT MAX(imported_at) AS at FROM tbl_location_import_batches"),
  ]);
  const latencyMs = Date.now() - pingStart;

  return {
    status: "healthy",
    app_version: APP_VERSION,
    database: `PostgreSQL ${version.rows[0].server_version.split(" ")[0]}`,
    uptime_seconds: Math.round(process.uptime()),
    last_lgd_import_at: lastImport.rows[0].at,
    db_latency_ms: latencyMs,
    last_backup: lastBackupInfo(),
  };
}

// 14. Programme Totals across Districts
async function programmeTotals(districtId) {
  const params = districtId !== null ? [districtId] : [];
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(screenings_total), 0)     AS screenings,
       COALESCE(SUM(doctor_reviews), 0)       AS reviews,
       COALESCE(SUM(specialist_referrals), 0) AS referrals,
       COALESCE(SUM(treatment_linked), 0)     AS treatment_linked
     FROM vw_district_dashboard_summary`
    .replace("FROM vw_district_dashboard_summary", districtId !== null
      ? "FROM vw_district_dashboard_summary WHERE district_id = $1"
      : "FROM vw_district_dashboard_summary")
    ,
    params
  );

  const row = rows[0];
  return {
    screenings: Number(row.screenings),
    reviews: Number(row.reviews),
    referrals: Number(row.referrals),
    treatment_linked: Number(row.treatment_linked),
  };
}

// ==========================================
// GET /api/dashboard/summary
// Main dashboard aggregation endpoint
// ==========================================
exports.summary = async (req, res, next) => {
  try {
    const can = (permission) => req.user.permissions.includes(permission);
    const districtId = await resolveAuthorizedDistrict(req);

    const result = {
      success: true,
      masters: await masterCounts(districtId),
    };

    if (can("master.view")) {
      result.facilities = await facilityCounts(districtId);
      result.district_info = await districtOverview(districtId);
    }

    if (can("user.manage")) {
      result.users_by_role = await usersByRole(districtId);
      result.pending_registrations = await pendingRegistrations(districtId);
      result.registrations_summary = await registrationRequestsSummary(districtId);
      result.active_health_workers = await activeHealthWorkersCount(districtId);
      result.total_users = await totalUsersCount(districtId);
      result.pending_setup_accounts = await pendingSetupAccountsCount(districtId);
    }

    if (can("user.manage") || can("dashboard.view_aggregate")) {
      result.patients_registered = await patientCount(districtId);
    }

    if (can("dashboard.view_aggregate")) {
      result.programme = await programmeTotals(districtId);
    }

    if (can("audit.view") || can("user.manage")) {
      result.trends = await monthlyTrends(districtId);
    }

    if (can("audit.view")) {
      result.recent_activity = await recentActivity(districtId);
      result.system = await systemInfo();
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET /api/dashboard/registrations
// List user registration requests (Review Requests modal)
// ==========================================
exports.listRegistrations = async (req, res, next) => {
  try {
    const roleName = req.user?.role_name || req.user?.role;
    if (!["MEDICAL_OFFICER", "SUPER_ADMIN"].includes(roleName)) {
      return res.status(403).json({ success: false, message: "Registration monitoring is not permitted" });
    }

    const statusFilter = req.validatedQuery?.status || "ALL";

    let query = `
      SELECT
        r.id,
        r.full_name,
        r.username,
        r.phone,
        r.email,
        r.designation,
        r.employee_ref,
        r.status,
        r.created_at,
        r.reviewed_at,
        r.rejection_reason,
        f.name_en AS facility_name,
        f.name_te AS facility_name_te,
        m.name_en AS mandal_name,
        m.name_te AS mandal_name_te,
        v.name_en AS village_name,
        v.name_te AS village_name_te,
        u.full_name AS reviewer_name
      FROM tbl_user_registration_requests r
      LEFT JOIN mst_facilities f ON f.id = r.facility_id
      LEFT JOIN mst_mandals m ON m.id = r.mandal_id
      LEFT JOIN mst_villages v ON v.id = r.village_id
      LEFT JOIN tbl_users u ON u.id = r.reviewed_by
    `;

    const params = [];
    query += ` WHERE r.workflow_version IS NULL`;
    if (roleName === "MEDICAL_OFFICER") {
      params.push(req.user.id);
      query += ` AND EXISTS (
        SELECT 1
        FROM tbl_medical_officer_mandal_assignments ma
        JOIN tbl_users assigned_user ON assigned_user.id = ma.user_id
        JOIN mst_roles assigned_role ON assigned_role.id = assigned_user.role_id
        WHERE ma.user_id = $${params.length}
          AND ma.mandal_id = r.mandal_id
          AND assigned_user.status = 'ACTIVE'
          AND assigned_user.deleted_at IS NULL
          AND assigned_role.code = 'MEDICAL_OFFICER'
          AND assigned_role.is_active IS TRUE
          AND ma.valid_from <= CURRENT_DATE
          AND (ma.valid_to IS NULL OR ma.valid_to >= CURRENT_DATE)
      )`;
    }

    if (statusFilter !== "ALL") {
      params.push(statusFilter);
      query += ` AND r.status = $${params.length}`;
    }

    query += ` ORDER BY r.created_at DESC LIMIT 50`;

    const { rows } = await pool.query(query, params);
    return res.json({ success: true, registrations: rows });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// PATCH /api/dashboard/registrations/:id/review
// Approve or Reject a Health Worker Registration Request
// ==========================================
exports.reviewRegistration = async (req, res, next) => {
  return res.status(410).json({
    success: false,
    message: "This registration decision endpoint has been retired",
  });
};
