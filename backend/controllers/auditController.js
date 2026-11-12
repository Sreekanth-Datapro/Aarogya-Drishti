const pool = require("../db");
const { districtAuditCondition } = require("../services/districtService");

const FORBIDDEN_METADATA = /pass|password|token|secret|otp|hash|api[_-]?key|authorization|cookie/i;

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_METADATA.test(key) || item == null) continue;
    if (typeof item === "object") {
      const nested = safeMetadata(item);
      if (Object.keys(nested).length) clean[key] = nested;
    } else {
      clean[key] = String(item).slice(0, 500);
    }
  }
  return clean;
}

// districtId: set only for District Admins (from their user record)
function buildWhere(query, districtId = null) {
  const params = [];
  const where = ["1=1"];

  if (districtId) {
    params.push(districtId);
    where.push(districtAuditCondition(`$${params.length}`));
  }

  if (query.date_from && /^\d{4}-\d{2}-\d{2}$/.test(query.date_from)) {
    params.push(query.date_from);
    where.push(`a.occurred_at >= $${params.length}::date`);
  }
  if (query.date_to && /^\d{4}-\d{2}-\d{2}$/.test(query.date_to)) {
    params.push(query.date_to);
    where.push(`a.occurred_at < ($${params.length}::date + interval '1 day')`);
  }
  if (query.user) {
    params.push(String(query.user).slice(0, 100));
    where.push(`(u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
    params[params.length - 1] = `%${params[params.length - 1]}%`;
  }
  if (query.role) {
    params.push(String(query.role).slice(0, 100));
    where.push(`a.actor_role = $${params.length}`);
  }
  if (query.action) {
    params.push(String(query.action).slice(0, 150));
    where.push(`a.event ILIKE $${params.length}`);
    params[params.length - 1] = `%${params[params.length - 1]}%`;
  }
  if (query.module) {
    params.push(String(query.module).slice(0, 100));
    where.push(`a.resource_type = $${params.length}`);
  }
  if (query.status) {
    params.push(String(query.status).toUpperCase().slice(0, 20));
    where.push(`a.outcome = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${String(query.search).slice(0, 150)}%`);
    const position = params.length;
    where.push(`(
      a.event ILIKE $${position}
      OR a.resource_type ILIKE $${position}
      OR a.resource_id ILIKE $${position}
      OR COALESCE(u.full_name, '') ILIKE $${position}
      OR COALESCE(u.username, '') ILIKE $${position}
    )`);
  }

  return { params, where };
}

function serialize(row) {
  return {
    id: Number(row.id),
    occurred_at: row.occurred_at ? row.occurred_at.toISOString() : null,
    actor_id: row.actor_id,
    actor_name: row.actor_name || null,
    actor_username: row.actor_username || null,
    actor_role: row.actor_role || null,
    event: row.event,
    outcome: row.outcome,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    ip_address: row.ip_address || null,
    request_id: row.request_id || null,
    metadata: safeMetadata(row.metadata),
  };
}

async function listEvents(req, res, next, districtId) {
  try {
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 100000);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 25, 1), 100);
    const { params, where } = buildWhere(req.query, districtId);

    const [countResult, summaryResult] = await Promise.all([
      pool.query(
      `SELECT COUNT(*) AS total
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE ${where.join(" AND ")}`,
      params
      ),
      pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE a.event = 'LOGIN_SUCCESS') AS login_success,
         COUNT(*) FILTER (WHERE a.event = 'LOGIN_FAILED') AS login_failed,
         COUNT(*) FILTER (WHERE a.event LIKE '%USER_CREATED%' OR a.event LIKE '%ACCOUNT%') AS user_changes,
         COUNT(*) FILTER (WHERE a.event LIKE '%ROLE%' OR a.event LIKE '%PERMISSION%') AS role_permission_changes,
         COUNT(*) FILTER (WHERE a.event LIKE 'DISTRICT_ADMIN_%') AS district_admin_activity,
         COUNT(*) FILTER (WHERE a.event LIKE '%EMAIL%' OR a.resource_type LIKE '%email%') AS email_events,
         COUNT(*) FILTER (WHERE a.event LIKE '%SMS%' OR a.resource_type LIKE '%sms%') AS sms_events,
         COUNT(*) FILTER (WHERE a.event LIKE '%PASSWORD%' OR a.event LIKE '%MFA%') AS password_mfa_events
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE ${where.join(" AND ")}`,
      params
      ),
    ]);

    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const listResult = await pool.query(
      `SELECT a.*, u.full_name AS actor_name, u.username AS actor_username
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE ${where.join(" AND ")}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    const total = Number(countResult.rows[0].total);
    res.json({
      success: true,
      events: listResult.rows.map(serialize),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
      summary: {
        total,
        login_success: Number(summaryResult.rows[0].login_success),
        login_failed: Number(summaryResult.rows[0].login_failed),
        user_changes: Number(summaryResult.rows[0].user_changes),
        role_permission_changes: Number(summaryResult.rows[0].role_permission_changes),
        district_admin_activity: Number(summaryResult.rows[0].district_admin_activity),
        email_events: Number(summaryResult.rows[0].email_events),
        sms_events: Number(summaryResult.rows[0].sms_events),
        password_mfa_events: Number(summaryResult.rows[0].password_mfa_events),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function eventDetail(req, res, next, districtId) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: "Invalid audit event id" });
    }
    const params = [id];
    let districtWhere = "";
    if (districtId) {
      params.push(districtId);
      districtWhere = `AND ${districtAuditCondition("$2")}`;
    }
    const result = await pool.query(
      `SELECT a.*, u.full_name AS actor_name, u.username AS actor_username
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE a.id = $1 ${districtWhere}`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Audit event not found" });
    }
    res.json({ success: true, event: serialize(result.rows[0]) });
  } catch (error) {
    next(error);
  }
}

exports.list = (req, res, next) => listEvents(req, res, next, null);
exports.detail = (req, res, next) => eventDetail(req, res, next, null);

// District Admin: same data, limited to the district loaded by requireDistrictAdminScope
function requireDistrict(handler) {
  return (req, res, next) => {
    if (!req.districtId) {
      return res.status(403).json({ success: false, message: "You are not authorized to access this resource", code: "FORBIDDEN" });
    }
    return handler(req, res, next, req.districtId);
  };
}

exports.listDistrict = requireDistrict(listEvents);
exports.detailDistrict = requireDistrict(eventDetail);
