const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const HttpError = require("../utils/httpError");
const { checkPassword } = require("../utils/passwordPolicy");
const { invalidateRolePermissionCache } = require("../utils/permissions");
const { assertSystemAdmin, assertSuperAdmin } = require("../utils/authorizationPolicy");
const config = require("../config/config");
const emailTransport = require("./emailTransport");
const { resolveAuthorizedDistrict } = require("../utils/districtAuthorization");
const sessions = require("./sessionService");

const CUSTOM_ROLE_PERMISSION_CODES = new Set(["master.view"]);
const STAFF_ACCOUNT_ROLES = ["MEDICAL_OFFICER", "SPECIALIST", "NAVIGATOR", "HOSPITAL_STAFF"];
const PROTECTED_ROLE_CODES = new Set([
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "DISTRICT_ADMIN",
  "MEDICAL_OFFICER",
  "SPECIALIST",
  "NAVIGATOR",
  "HOSPITAL_STAFF",
  "HEALTH_WORKER",
  "MIGRATION",
]);
// Page permissions custom roles may not receive (privilege escalation / admin surfaces).
const PROTECTED_PAGE_PERMISSION_CODES = new Set([
  "page.roleManagement",
  "page.districtAdmins",
  "page.locationImport",
  "page.auditLogs",
  "page.registrationMonitoring",
]);

function isAssignablePermission(permission) {
  if (!permission || typeof permission !== "object") return false;
  if (
    CUSTOM_ROLE_PERMISSION_CODES.has(permission.code)
    && permission.resource === "master"
    && permission.action === "read"
  ) {
    return true;
  }
  // Custom roles may receive page.* access codes, except protected admin pages.
  // Clinical / administrative action permissions stay locked.
  return permission.resource === "page"
    && permission.action === "access"
    && String(permission.code || "").startsWith("page.")
    && !PROTECTED_PAGE_PERMISSION_CODES.has(permission.code);
}

function normalizeRoleCode(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "Role code is required", "INVALID_ROLE");
  }
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) {
    throw new HttpError(400, "Role code must use 2-40 letters, numbers or underscores", "INVALID_ROLE");
  }
  return code;
}

function validateRoleDetails({ name, name_te: nameTe, code, description }) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (nameTe !== undefined && nameTe !== null && typeof nameTe !== "string") {
    throw new HttpError(400, "Telugu role name must be text", "INVALID_ROLE");
  }
  const normalizedNameTe = typeof nameTe === "string" ? nameTe.trim() : "";
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  if (!normalizedName || normalizedName.length > 100) {
    throw new HttpError(400, "Role name is required and must be at most 100 characters", "INVALID_ROLE");
  }
  if (normalizedDescription.length > 500) {
    throw new HttpError(400, "Role description must be at most 500 characters", "INVALID_ROLE");
  }
  if (normalizedNameTe.length > 100) {
    throw new HttpError(400, "Telugu role name must be at most 100 characters", "INVALID_ROLE");
  }
  const normalizedCode = normalizeRoleCode(code);
  if (PROTECTED_ROLE_CODES.has(normalizedCode)) {
    throw new HttpError(400, "Default role codes are reserved", "RESERVED_ROLE_CODE");
  }
  return {
    name: normalizedName,
    nameTe: normalizedNameTe || null,
    code: normalizedCode,
    description: normalizedDescription || null,
  };
}

function validateRoleId(value) {
  const roleId = Number(value);
  if (!Number.isSafeInteger(roleId) || roleId < 1) {
    throw new HttpError(400, "Invalid role ID", "INVALID_ROLE");
  }
  return roleId;
}

function validateUserId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, "Invalid user ID", "INVALID_USER");
  }
  return value;
}

function normalizePermissionIds(ids) {
  if (!Array.isArray(ids)) {
    throw new HttpError(400, "permission_ids must be an array", "INVALID_PERMISSIONS");
  }
  if (ids.some((id) => typeof id !== "number" && (typeof id !== "string" || !/^\d+$/.test(id)))) {
    throw new HttpError(400, "Permission IDs must be positive integers", "INVALID_PERMISSIONS");
  }
  const normalized = [...new Set(ids.map(Number))];
  if (normalized.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new HttpError(400, "Permission IDs must be positive integers", "INVALID_PERMISSIONS");
  }
  return normalized;
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function writeAudit(client, req, event, resourceType, resourceId, metadata) {
  await client.query(
    `INSERT INTO tbl_audit_logs
       (actor_id, actor_role, event, outcome, resource_type, resource_id, ip_address, request_id, metadata)
     VALUES ($1, $2, $3, 'SUCCESS', $4, $5, $6, $7, $8::jsonb)`,
    [
      req.user.id,
      req.user.role_name,
      event,
      resourceType,
      String(resourceId),
      req.ip || null,
      req.requestId || null,
      JSON.stringify(metadata || {}),
    ]
  );
}

async function getRole(client, roleId, lock = false) {
  const result = await client.query(
    `SELECT id, code, name_en, name_te, description, is_active, is_system_role
       FROM mst_roles WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [roleId]
  );
  if (!result.rows.length) throw new HttpError(404, "Role not found", "ROLE_NOT_FOUND");
  if (result.rows[0].is_system_role !== false || PROTECTED_ROLE_CODES.has(result.rows[0].code)) {
    throw new HttpError(403, "Default system roles cannot be changed here", "SYSTEM_ROLE_PROTECTED");
  }
  return result.rows[0];
}

async function validatePermissions(client, permissionIds) {
  const ids = normalizePermissionIds(permissionIds);
  if (!ids.length) return ids;

  const result = await client.query(
    "SELECT id, code, resource, action FROM mst_permissions WHERE id = ANY($1::bigint[])",
    [ids]
  );
  if (result.rows.length !== ids.length) {
    throw new HttpError(400, "One or more permissions do not exist", "INVALID_PERMISSIONS");
  }
  if (result.rows.some((permission) => !isAssignablePermission(permission))) {
    throw new HttpError(
      403,
      "Custom roles cannot receive protected administrative or registration permissions",
      "PROTECTED_PERMISSION"
    );
  }
  return ids;
}

async function listRoles(actor) {
  assertSuperAdmin(actor);
  const { rows } = await pool.query(
    `SELECT r.id, r.code, r.name_en AS name, r.name_te, r.description, r.is_active,
            r.is_system_role,
            (r.is_system_role IS DISTINCT FROM FALSE OR r.code = ANY($1::text[])) AS is_protected,
            COUNT(DISTINCT u.id)::int AS assigned_users,
            COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.id IS NOT NULL), '{}') AS permissions,
            COALESCE(array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL), '{}') AS permission_ids
       FROM mst_roles r
       LEFT JOIN tbl_users u ON u.role_id = r.id AND u.deleted_at IS NULL
       LEFT JOIN tbl_role_permissions rp ON rp.role_id = r.id
       LEFT JOIN mst_permissions p ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.is_system_role DESC NULLS FIRST, lower(r.name_en), r.id`,
    [[...PROTECTED_ROLE_CODES]]
  );
  return rows;
}

async function listAssignablePermissions(actor) {
  assertSuperAdmin(actor);
  const { rows } = await pool.query(
    `SELECT id, code, resource, action, description,
            (
              (code = ANY($1::text[]) AND resource = 'master' AND action = 'read')
              OR (
                resource = 'page'
                AND action = 'access'
                AND code LIKE 'page.%'
                AND NOT (code = ANY($2::text[]))
              )
            ) AS assignable
       FROM mst_permissions
      ORDER BY CASE WHEN resource = 'page' THEN 0 ELSE 1 END, resource, action, code`,
    [[...CUSTOM_ROLE_PERMISSION_CODES], [...PROTECTED_PAGE_PERMISSION_CODES]]
  );
  return rows;
}

async function createRole(actor, req, input) {
  assertSuperAdmin(actor);
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "Role details are required", "INVALID_ROLE");
  }
  const role = validateRoleDetails(input);
  try {
    return await withTransaction(async (client) => {
      const permissionIds = await validatePermissions(client, input.permission_ids);
      const permissions = await client.query(
        "SELECT code FROM mst_permissions WHERE id = ANY($1::bigint[]) ORDER BY code",
        [permissionIds]
      );
      const result = await client.query(
        `INSERT INTO mst_roles (code, name_en, name_te, description, is_active, is_system_role)
         VALUES ($1, $2, $3, $4, TRUE, FALSE)
         RETURNING id, code, name_en AS name, name_te, description, is_active`,
        [role.code, role.name, role.nameTe, role.description]
      );
      const created = result.rows[0];
      for (const permissionId of permissionIds) {
        await client.query(
          "INSERT INTO tbl_role_permissions (role_id, permission_id) VALUES ($1, $2)",
          [created.id, permissionId]
        );
      }
      await writeAudit(client, req, "CUSTOM_ROLE_CREATED", "role", created.id, {
        code: created.code,
        name: created.name,
        name_te: created.name_te,
        permissions: permissions.rows.map((permission) => permission.code),
      });
      return { ...created, permission_ids: permissionIds };
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Role code already exists", "ROLE_CODE_EXISTS");
    }
    throw error;
  }
}

async function updateRole(actor, req, roleId, input) {
  assertSuperAdmin(actor);
  roleId = validateRoleId(roleId);
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "Role details are required", "INVALID_ROLE");
  }
  const role = validateRoleDetails(input);
  try {
    return await withTransaction(async (client) => {
      const current = await getRole(client, roleId, true);
      const result = await client.query(
        `UPDATE mst_roles SET code = $1, name_en = $2, name_te = $3, description = $4
          WHERE id = $5
          RETURNING id, code, name_en AS name, name_te, description, is_active`,
        [role.code, role.name, role.nameTe, role.description, roleId]
      );
      await writeAudit(client, req, "CUSTOM_ROLE_UPDATED", "role", roleId, {
        old_code: current.code,
        code: role.code,
        old_name: current.name_en,
        name: role.name,
        old_name_te: current.name_te,
        name_te: role.nameTe,
        old_description: current.description,
        description: role.description,
      });
      return result.rows[0];
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Role code already exists", "ROLE_CODE_EXISTS");
    }
    throw error;
  }
}

async function updateRolePermissions(actor, req, roleId, permissionIds) {
  assertSuperAdmin(actor);
  roleId = validateRoleId(roleId);
  const result = await withTransaction(async (client) => {
    const role = await getRole(client, roleId, true);
    const ids = await validatePermissions(client, permissionIds);
    const previous = await client.query(
      `SELECT p.code FROM tbl_role_permissions rp
         JOIN mst_permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 ORDER BY p.code`,
      [roleId]
    );
    const nextPermissions = await client.query(
      "SELECT code FROM mst_permissions WHERE id = ANY($1::bigint[]) ORDER BY code",
      [ids]
    );
    await client.query("DELETE FROM tbl_role_permissions WHERE role_id = $1", [roleId]);
    for (const permissionId of ids) {
      await client.query(
        "INSERT INTO tbl_role_permissions (role_id, permission_id) VALUES ($1, $2)",
        [roleId, permissionId]
      );
    }
    await writeAudit(client, req, "CUSTOM_ROLE_PERMISSIONS_CHANGED", "role", roleId, {
      code: role.code,
      previous_permissions: previous.rows.map((permission) => permission.code),
      new_permissions: nextPermissions.rows.map((permission) => permission.code),
      permission_count: ids.length,
    });
    return ids;
  });
  invalidateRolePermissionCache(roleId);
  return result;
}

async function updateRoleStatus(actor, req, roleId, isActive) {
  assertSuperAdmin(actor);
  roleId = validateRoleId(roleId);
  if (typeof isActive !== "boolean") {
    throw new HttpError(400, "is_active must be a boolean", "INVALID_ROLE_STATUS");
  }
  const result = await withTransaction(async (client) => {
    const role = await getRole(client, roleId, true);
    if (!isActive) {
      const users = await client.query(
        `SELECT 1 FROM tbl_users
          WHERE role_id = $1 AND deleted_at IS NULL
          LIMIT 1`,
        [roleId]
      );
      if (users.rows.length) {
        throw new HttpError(409, "A role assigned to existing accounts cannot be deactivated", "ROLE_IN_USE");
      }
    }
    await client.query("UPDATE mst_roles SET is_active = $1 WHERE id = $2", [isActive, roleId]);
    await writeAudit(
      client,
      req,
      isActive ? "CUSTOM_ROLE_ACTIVATED" : "CUSTOM_ROLE_DEACTIVATED",
      "role",
      roleId,
      { code: role.code, old_is_active: role.is_active, is_active: isActive }
    );
    return { id: roleId, is_active: isActive };
  });
  invalidateRolePermissionCache(roleId);
  return result;
}

async function listRoleUsers(actor, roleId) {
  assertSuperAdmin(actor);
  roleId = validateRoleId(roleId);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.status, u.created_at
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
      WHERE r.id = $1 AND u.deleted_at IS NULL
      ORDER BY lower(u.full_name), u.id`,
    [roleId]
  );
  return rows;
}

async function getRbacDashboard(actor) {
  assertSuperAdmin(actor);
  const [counts, activities] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tbl_users WHERE deleted_at IS NULL) AS total_users,
         (SELECT COUNT(*)::int FROM tbl_users WHERE deleted_at IS NULL AND status = 'ACTIVE') AS active_users,
         (SELECT COUNT(*)::int FROM tbl_users WHERE deleted_at IS NULL AND status <> 'ACTIVE') AS inactive_users,
         (SELECT COUNT(*)::int FROM mst_roles) AS total_roles,
         (SELECT COUNT(*)::int FROM mst_permissions) AS total_permissions,
         (SELECT COUNT(*)::int FROM mst_roles
           WHERE is_system_role IS FALSE AND NOT (code = ANY($1::text[]))) AS custom_roles`,
      [[...PROTECTED_ROLE_CODES]]
    ),
    pool.query(
      `SELECT a.id, a.event, a.resource_type, a.resource_id, a.occurred_at, a.metadata,
              u.full_name AS actor_name, a.actor_role
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE a.event = ANY($1::text[]) AND a.outcome = 'SUCCESS'
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT 8`,
      [[
        "CUSTOM_ROLE_CREATED",
        "CUSTOM_ROLE_UPDATED",
        "CUSTOM_ROLE_PERMISSIONS_CHANGED",
        "CUSTOM_ROLE_ACTIVATED",
        "CUSTOM_ROLE_DEACTIVATED",
        "ROLE_CHANGED",
      ]]
    ),
  ]);
  const row = counts.rows[0];
  return {
    metrics: Object.fromEntries(
      ["total_users", "active_users", "inactive_users", "total_roles", "total_permissions", "custom_roles"]
        .map((key) => [key, Number(row[key])])
    ),
    activities: activities.rows,
  };
}

function normalizeUserSearch(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new HttpError(400, "Page must be between 1 and 10000", "INVALID_PAGE");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, "Page size must be between 1 and 100", "INVALID_LIMIT");
  }
  if (search.length > 100) throw new HttpError(400, "Search is too long", "INVALID_SEARCH");
  return { page, limit, offset: (page - 1) * limit, search };
}

async function listRbacUsers(actor, query = {}) {
  assertSuperAdmin(actor);
  const { page, limit, offset, search } = normalizeUserSearch(query);
  const searchValue = search ? `%${search.toLowerCase()}%` : null;
  const where = `u.deleted_at IS NULL
    AND ($1::text IS NULL OR lower(u.full_name) LIKE $1 OR lower(u.username) LIKE $1)`;
  const [count, users] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM tbl_users u WHERE ${where}`, [searchValue]),
    pool.query(
      `SELECT u.id, u.username, u.full_name, u.status::text AS status, u.role_id,
              r.code AS role_code, r.name_en AS role_name, u.district_id,
              d.name_en AS district_name, d.name_te AS district_name_te,
              ufa.facility_id, f.name_en AS facility_name, f.name_te AS facility_name_te
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
         LEFT JOIN mst_districts d ON d.id = u.district_id
         LEFT JOIN LATERAL (
           SELECT assignments.facility_id
             FROM (
               SELECT a.facility_id, a.valid_from, a.is_primary, 0 AS assignment_type
                 FROM tbl_user_facility_assignments a
                WHERE a.user_id = u.id AND a.valid_from <= CURRENT_DATE
                  AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
               UNION ALL
               SELECT h.facility_id, h.valid_from, FALSE AS is_primary, 1 AS assignment_type
                 FROM tbl_health_worker_location_assignments h
                WHERE h.user_id = u.id AND h.valid_from <= CURRENT_DATE
                  AND (h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE)
             ) assignments
            ORDER BY CASE WHEN r.code = 'HEALTH_WORKER' THEN assignments.assignment_type END DESC NULLS LAST,
                     assignments.is_primary DESC, assignments.assignment_type DESC,
                     assignments.valid_from DESC
            LIMIT 1
         ) ufa ON TRUE
         LEFT JOIN mst_facilities f ON f.id = ufa.facility_id
        WHERE ${where}
        ORDER BY lower(u.full_name), u.id LIMIT $2 OFFSET $3`,
      [searchValue, limit, offset]
    ),
  ]);
  const total = Number(count.rows[0].total);
  return {
    users: users.rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

async function updateUserRole(actor, req, userId, roleId) {
  assertSuperAdmin(actor);
  userId = validateUserId(userId);
  roleId = validateRoleId(roleId);

  const result = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('super_admin_role_assignment'))");
    const target = await client.query(
      `SELECT u.id, u.role_id, u.status::text AS status, u.district_id, u.mfa_enabled,
              current_role.code AS role_code, current_role.name_en AS role_name,
              ufa.facility_id, f.district_id AS facility_district_id,
              f.facility_type::text AS facility_type, f.is_active AS facility_is_active
         FROM tbl_users u
         JOIN mst_roles current_role ON current_role.id = u.role_id
         LEFT JOIN LATERAL (
           SELECT assignments.facility_id
             FROM (
               SELECT a.facility_id, a.valid_from, a.is_primary, 0 AS assignment_type
                 FROM tbl_user_facility_assignments a
                WHERE a.user_id = u.id AND a.valid_from <= CURRENT_DATE
                  AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
               UNION ALL
               SELECT h.facility_id, h.valid_from, FALSE AS is_primary, 1 AS assignment_type
                 FROM tbl_health_worker_location_assignments h
                WHERE h.user_id = u.id AND h.valid_from <= CURRENT_DATE
                  AND (h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE)
             ) assignments
            ORDER BY CASE WHEN current_role.code = 'HEALTH_WORKER' THEN assignments.assignment_type END DESC NULLS LAST,
                     assignments.is_primary DESC, assignments.assignment_type DESC,
                     assignments.valid_from DESC
            LIMIT 1
         ) ufa ON TRUE
         LEFT JOIN mst_facilities f ON f.id = ufa.facility_id
        WHERE u.id = $1 AND u.deleted_at IS NULL
        FOR UPDATE OF u`,
      [userId]
    );
    if (!target.rows.length) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    const current = target.rows[0];
    if (userId === actor.id && Number(current.role_id) !== roleId) {
      throw new HttpError(409, "You cannot change your own role", "SELF_ROLE_CHANGE");
    }

    const nextRoleResult = await client.query(
      `SELECT id, code, name_en, is_active, mfa_required
         FROM mst_roles WHERE id = $1 FOR SHARE`,
      [roleId]
    );
    const nextRole = nextRoleResult.rows[0];
    if (!nextRole || !nextRole.is_active) {
      throw new HttpError(400, "Select an active role", "INVALID_ROLE");
    }
    if (Number(current.role_id) === roleId) {
      return {
        id: userId,
        role_id: roleId,
        role_code: nextRole.code,
        role_name: nextRole.name_en,
        unchanged: true,
      };
    }
    if (nextRole.mfa_required && !current.mfa_enabled) {
      throw new HttpError(409, "This role requires an already enabled MFA account", "ROLE_MFA_REQUIRED");
    }

    if (nextRole.code === "DISTRICT_ADMIN") {
      const district = await client.query(
        "SELECT id FROM mst_districts WHERE id = $1 AND is_active IS TRUE FOR SHARE",
        [current.district_id]
      );
      if (!current.district_id || !district.rows.length) {
        throw new HttpError(409, "A District Admin requires an active district assignment", "ROLE_SCOPE_REQUIRED");
      }
    }

    const facilityScopedRoles = new Set([
      "MEDICAL_OFFICER",
      "SPECIALIST",
      "NAVIGATOR",
      "HOSPITAL_STAFF",
    ]);
    if (facilityScopedRoles.has(nextRole.code)
      && (!current.district_id || !current.facility_id
        || current.facility_is_active !== true
        || Number(current.facility_district_id) !== Number(current.district_id))) {
      throw new HttpError(409, "This role requires an active facility in the user's district", "ROLE_SCOPE_REQUIRED");
    }
    if (nextRole.code === "HEALTH_WORKER") {
      const locationAssignment = await client.query(
        `SELECT 1
           FROM tbl_health_worker_location_assignments h
           JOIN mst_facilities f ON f.id = h.facility_id
          WHERE h.user_id = $1 AND h.district_id = $2
            AND h.valid_from <= CURRENT_DATE
            AND (h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE)
            AND f.district_id = h.district_id AND f.is_active IS TRUE
          LIMIT 1`,
        [userId, current.district_id]
      );
      if (!current.district_id || !locationAssignment.rows.length) {
        throw new HttpError(409, "A Health Worker requires an active village and facility assignment", "ROLE_SCOPE_REQUIRED");
      }
    }
    if (nextRole.code === "SPECIALIST" && current.facility_type !== "HOSPITAL") {
      throw new HttpError(409, "A Specialist must be assigned to a hospital", "ROLE_SCOPE_REQUIRED");
    }
    if (nextRole.code === "HOSPITAL_STAFF" && current.facility_type !== "HOSPITAL") {
      throw new HttpError(409, "Hospital staff must be assigned to a hospital", "ROLE_SCOPE_REQUIRED");
    }
    if (nextRole.code === "MEDICAL_OFFICER") {
      const mandalAssignment = await client.query(
        `SELECT 1
           FROM tbl_medical_officer_mandal_assignments ma
           JOIN mst_mandals m ON m.id = ma.mandal_id
          WHERE ma.user_id = $1 AND m.district_id = $2 AND m.is_active IS TRUE
            AND ma.valid_from <= CURRENT_DATE
            AND (ma.valid_to IS NULL OR ma.valid_to >= CURRENT_DATE)
          LIMIT 1`,
        [userId, current.district_id]
      );
      if (!mandalAssignment.rows.length) {
        throw new HttpError(409, "A Medical Officer requires an active Mandal assignment in the user's district", "ROLE_SCOPE_REQUIRED");
      }
    }

    if (current.role_code === "SUPER_ADMIN" && current.status === "ACTIVE"
      && nextRole.code !== "SUPER_ADMIN") {
      const activeAdmins = await client.query(
        `SELECT COUNT(*)::int AS total
           FROM tbl_users u
           JOIN mst_roles r ON r.id = u.role_id AND r.code = 'SUPER_ADMIN' AND r.is_active IS TRUE
          WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL`
      );
      if (Number(activeAdmins.rows[0].total) <= 1) {
        throw new HttpError(409, "The last active Super Admin cannot be removed", "LAST_SUPER_ADMIN");
      }
    }

    await client.query("UPDATE tbl_users SET role_id = $1 WHERE id = $2", [roleId, userId]);
    await writeAudit(client, req, "ROLE_CHANGED", "user", userId, {
      previous_role_id: current.role_id,
      previous_role_code: current.role_code,
      new_role_id: roleId,
      new_role_code: nextRole.code,
      district_id: current.district_id,
      facility_id: current.facility_id,
    });
    invalidateRolePermissionCache(current.role_id);
    invalidateRolePermissionCache(roleId);
    return {
      id: userId,
      role_id: roleId,
      role_code: nextRole.code,
      role_name: nextRole.name_en,
      district_id: current.district_id,
      facility_id: current.facility_id,
    };
  });
  return result;
}

function normalizeDistrictAdminInput(input) {
  input = input && typeof input === "object" ? input : {};
  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : null;
  const phone = typeof input.phone === "string" ? input.phone.trim() : null;
  const districtId = Number(input.district_id);
  if (!fullName || fullName.length > 150) {
    throw new HttpError(400, "Full name is required", "INVALID_DISTRICT_ADMIN");
  }
  // The username is normally generated by the system; a given one is still checked
  if (username && !/^[a-z0-9_.-]{3,40}$/.test(username)) {
    throw new HttpError(400, "Username must be 3-40 letters, numbers, dot, dash or underscore", "INVALID_DISTRICT_ADMIN");
  }
  // The login details are sent by email, so an email address is required
  if (!email) {
    throw new HttpError(400, "An email address is required to send the login details", "EMAIL_REQUIRED");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address", "INVALID_DISTRICT_ADMIN");
  }
  if (phone && !/^\d{10,11}$/.test(phone)) {
    throw new HttpError(400, "Enter a valid phone number", "INVALID_DISTRICT_ADMIN");
  }
  if (!Number.isSafeInteger(districtId) || districtId < 1) {
    throw new HttpError(400, "An explicit district is required", "DISTRICT_REQUIRED");
  }
  return { fullName, username, email, phone: phone || null, districtId };
}

function normalizeStaffInput(input, roleCode) {
  input = input && typeof input === "object" ? input : {};
  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : null;
  const phone = typeof input.phone === "string" ? input.phone.trim() : null;
  const facilityId = Number(input.facility_id);
  const districtId = input.district_id == null || input.district_id === ""
    ? null
    : Number(input.district_id);
  const specialtyIds = Array.isArray(input.specialty_ids)
    ? [...new Set(input.specialty_ids.map(Number))]
    : [];
  const mandalIds = Array.isArray(input.mandal_ids)
    ? [...new Set(input.mandal_ids.map(Number))]
    : [];

  if (!fullName || fullName.length > 150) {
    throw new HttpError(400, "Full name is required", "INVALID_STAFF");
  }
  if (username && !/^[a-z0-9_.-]{3,40}$/.test(username)) {
    throw new HttpError(400, "Username is invalid", "INVALID_STAFF");
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid email address is required", "EMAIL_REQUIRED");
  }
  if (phone && !/^\d{10,11}$/.test(phone)) {
    throw new HttpError(400, "Enter a valid phone number", "INVALID_STAFF");
  }
  if (!Number.isSafeInteger(facilityId) || facilityId < 1) {
    throw new HttpError(400, "An active facility is required", "FACILITY_REQUIRED");
  }
  if (districtId != null && (!Number.isSafeInteger(districtId) || districtId < 1)) {
    throw new HttpError(400, "A district is required", "DISTRICT_REQUIRED");
  }
  if (roleCode === "SPECIALIST" && specialtyIds.length === 0) {
    throw new HttpError(400, "At least one specialty is required", "SPECIALTY_REQUIRED");
  }
  if (roleCode === "MEDICAL_OFFICER" && mandalIds.length === 0) {
    throw new HttpError(400, "Assign the Medical Officer to at least one Mandal", "MANDAL_REQUIRED");
  }
  if (specialtyIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new HttpError(400, "Invalid specialty selection", "INVALID_SPECIALTY");
  }
  if (mandalIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new HttpError(400, "Invalid Mandal selection", "INVALID_MANDAL");
  }
  return { fullName, username, email, phone: phone || null, facilityId, districtId, specialtyIds, mandalIds };
}

async function generateStaffUsername(client, fullName, roleCode) {
  const prefixes = { MEDICAL_OFFICER: "mo", SPECIALIST: "sp", NAVIGATOR: "nav", HOSPITAL_STAFF: "hs" };
  const firstWord = fullName.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, "").trim().split(/\s+/)[0] || "staff";
  const base = firstWord.slice(0, 20);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefixes[roleCode]}.${base}.${crypto.randomInt(1000, 10000)}`;
    const taken = await client.query(
      `SELECT 1 FROM tbl_users WHERE lower(username) = $1
       UNION ALL
       SELECT 1 FROM tbl_user_registration_requests WHERE lower(username) = $1 AND status = 'PENDING'
       LIMIT 1`,
      [candidate]
    );
    if (!taken.rows.length) return candidate;
  }
  throw new HttpError(409, "Username already exists", "USERNAME_EXISTS");
}

function assertStaffAdmin(actor) {
  if (!actor?.id || !["SYSTEM_ADMIN", "SUPER_ADMIN", "DISTRICT_ADMIN"].includes(actor.role_name)) {
    throw new HttpError(403, "Only a system administrator or District Admin can manage staff", "FORBIDDEN");
  }
}

async function resolveStaffDistrict(actor, req, inputDistrictId) {
  if (actor.role_name === "DISTRICT_ADMIN") {
    return resolveAuthorizedDistrict(req);
  }
  if (!Number.isSafeInteger(Number(inputDistrictId)) || Number(inputDistrictId) < 1) {
    throw new HttpError(400, "A district is required", "DISTRICT_REQUIRED");
  }
  return Number(inputDistrictId);
}

async function listStaff(actor, req, filters = {}) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : filters.district_id ? Number(filters.district_id) : null;
  const roleCode = filters.role_code && STAFF_ACCOUNT_ROLES.includes(filters.role_code)
    ? filters.role_code
    : null;
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;
  const search = typeof filters.search === "string" ? filters.search.trim() : "";

  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.full_name,u.email,u.phone,u.status,u.district_id,u.created_at,
            r.code AS role_code,r.name_en AS role_name,r.mfa_required,
            d.name_en AS district_name,d.name_te AS district_name_te,
            ufa.facility_id,f.name_en AS facility_name,f.name_te AS facility_name_te,
            mo_assignments.mandal_ids,mo_assignments.assigned_mandals,
            COALESCE(t.email_delivery_status,'NOT_CONFIGURED') AS email_delivery_status,
            CASE WHEN t.used_at IS NULL AND t.revoked_at IS NULL THEN t.expires_at END AS credentials_expires_at
       FROM tbl_users u
       JOIN mst_roles r ON r.id=u.role_id
       LEFT JOIN mst_districts d ON d.id=u.district_id
       LEFT JOIN LATERAL (
         SELECT facility_id,is_primary,valid_from,valid_to
           FROM tbl_user_facility_assignments
          WHERE user_id=u.id AND valid_to IS NULL
          ORDER BY is_primary DESC,valid_from DESC LIMIT 1
       ) ufa ON TRUE
       LEFT JOIN mst_facilities f ON f.id=ufa.facility_id
       LEFT JOIN LATERAL (
         SELECT array_agg(ma.mandal_id ORDER BY m.name_en) AS mandal_ids,
                string_agg(m.name_en, ', ' ORDER BY m.name_en) AS assigned_mandals
           FROM tbl_medical_officer_mandal_assignments ma
           JOIN mst_mandals m ON m.id=ma.mandal_id
          WHERE ma.user_id=u.id AND ma.valid_to IS NULL
       ) mo_assignments ON r.code='MEDICAL_OFFICER'
       LEFT JOIN LATERAL (
         SELECT email_delivery_status,expires_at,used_at,revoked_at
           FROM tbl_district_admin_setup_tokens WHERE user_id=u.id
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
      WHERE u.deleted_at IS NULL
        AND r.code = ANY($1::text[])
        AND ($2::bigint IS NULL OR u.district_id=$2)
        AND ($3::text IS NULL OR lower(u.full_name) LIKE '%' || lower($3) || '%' OR lower(u.username) LIKE '%' || lower($3) || '%')
        AND ($4::text IS NULL OR r.code=$4)
      ORDER BY lower(u.full_name),u.id LIMIT $5 OFFSET $6`,
    [
      STAFF_ACCOUNT_ROLES,
      districtId,
      search || null,
      roleCode,
      limit,
      offset,
    ]
  );
  return rows;
}

async function listStaffOptions(actor, req) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  // District Admins only get their own district (shown as a read-only field)
  const [districts, facilities, specialties, mandals, villages] = await Promise.all([
    pool.query(
      `SELECT id,name_en,name_te FROM mst_districts
        WHERE is_active=TRUE AND ($1::bigint IS NULL OR id=$1)
        ORDER BY name_en`,
      [districtId]
    ),
    pool.query(
      `SELECT id,district_id,mandal_id,facility_type,name_en,name_te,category,is_active
         FROM mst_facilities
        WHERE is_active=TRUE AND ($1::bigint IS NULL OR district_id=$1)
        ORDER BY name_en`,
      [districtId]
    ),
    pool.query(`SELECT id,code,name_en,name_te FROM mst_specialties WHERE is_active=TRUE ORDER BY name_en`),
    pool.query(
      `SELECT id,district_id,name_en,name_te FROM mst_mandals
        WHERE is_active=TRUE AND ($1::bigint IS NULL OR district_id=$1)
        ORDER BY name_en`,
      [districtId]
    ),
    pool.query(
      `SELECT v.id,v.mandal_id,m.district_id,v.name_en,v.name_te
         FROM mst_villages v
         JOIN mst_mandals m ON m.id=v.mandal_id
        WHERE v.is_active=TRUE AND m.is_active=TRUE
          AND ($1::bigint IS NULL OR m.district_id=$1)
        ORDER BY v.name_en`,
      [districtId]
    ),
  ]);
  return {
    districts: districts.rows,
    facilities: facilities.rows,
    specialties: specialties.rows,
    mandals: mandals.rows,
    villages: villages.rows,
  };
}

async function listHealthWorkers(actor, req) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.full_name,u.status,u.district_id,
            d.name_en AS district_name,d.name_te AS district_name_te,
            COALESCE(a.assignment_count,0)::int AS assignment_count
       FROM tbl_users u
       JOIN mst_roles r ON r.id=u.role_id
       LEFT JOIN mst_districts d ON d.id=u.district_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS assignment_count
           FROM tbl_health_worker_location_assignments h
          WHERE h.user_id=u.id
            AND h.valid_from <= CURRENT_DATE
            AND (h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE)
       ) a ON TRUE
      WHERE r.code='HEALTH_WORKER'
        AND u.deleted_at IS NULL
        AND ($1::bigint IS NULL OR u.district_id=$1)
      ORDER BY lower(u.full_name),u.id`,
    [districtId]
  );
  return rows;
}

async function getHealthWorkerAssignments(actor, req, userId) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  const id = validateUserId(userId);
  const user = await pool.query(
    `SELECT u.id,u.username,u.full_name,u.status,u.district_id,
            d.name_en AS district_name,d.name_te AS district_name_te
       FROM tbl_users u
       JOIN mst_roles r ON r.id=u.role_id
       LEFT JOIN mst_districts d ON d.id=u.district_id
      WHERE u.id=$1 AND u.deleted_at IS NULL AND r.code='HEALTH_WORKER'
        AND ($2::bigint IS NULL OR u.district_id=$2)
      LIMIT 1`,
    [id, districtId]
  );
  if (!user.rows.length) throw new HttpError(404, "Health Worker not found", "HEALTH_WORKER_NOT_FOUND");

  const assignments = await pool.query(
    `SELECT a.id,a.district_id,a.mandal_id,a.village_id,a.facility_id,
            a.valid_from,a.valid_to,
            m.name_en AS mandal_name,m.name_te AS mandal_name_te,
            v.name_en AS village_name,v.name_te AS village_name_te,
            f.name_en AS facility_name,f.name_te AS facility_name_te
       FROM tbl_health_worker_location_assignments a
       JOIN mst_mandals m ON m.id=a.mandal_id
       JOIN mst_villages v ON v.id=a.village_id
       JOIN mst_facilities f ON f.id=a.facility_id
      WHERE a.user_id=$1
        AND a.valid_from <= CURRENT_DATE
        AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
      ORDER BY m.name_en,v.name_en,f.name_en`,
    [id]
  );
  return { ...user.rows[0], assignments: assignments.rows };
}

async function updateHealthWorkerAssignments(actor, req, userId, input) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  const id = validateUserId(userId);
  if (!Array.isArray(input?.assignments) || input.assignments.length === 0) {
    throw new HttpError(400, "Assign at least one village and facility", "HEALTH_WORKER_ASSIGNMENT_REQUIRED");
  }

  const assignments = input.assignments.map((assignment) => ({
    mandalId: Number(assignment?.mandal_id),
    villageId: Number(assignment?.village_id),
    facilityId: Number(assignment?.facility_id),
  }));
  const validId = (value) => Number.isSafeInteger(value) && value > 0;
  if (assignments.some((assignment) =>
    !validId(assignment.mandalId) || !validId(assignment.villageId) || !validId(assignment.facilityId)
  )) {
    throw new HttpError(400, "Choose an active Mandal, village and facility for every assignment", "INVALID_LOCATION_ASSIGNMENT");
  }

  const keys = assignments.map(({ villageId, facilityId }) => `${villageId}:${facilityId}`);
  if (new Set(keys).size !== keys.length) {
    throw new HttpError(400, "Remove duplicate location assignments", "DUPLICATE_LOCATION_ASSIGNMENT");
  }

  await withTransaction(async (client) => {
    const user = await client.query(
      `SELECT u.id,u.district_id
         FROM tbl_users u
         JOIN mst_roles r ON r.id=u.role_id
        WHERE u.id=$1 AND u.deleted_at IS NULL AND r.code='HEALTH_WORKER'
          AND ($2::bigint IS NULL OR u.district_id=$2)
        FOR UPDATE OF u`,
      [id, districtId]
    );
    if (!user.rows.length) throw new HttpError(404, "Health Worker not found", "HEALTH_WORKER_NOT_FOUND");
    const workerDistrictId = Number(user.rows[0].district_id);
    if (!validId(workerDistrictId)) {
      throw new HttpError(400, "Health Worker must have a district before location assignments", "DISTRICT_REQUIRED");
    }

    for (const assignment of assignments) {
      const location = await client.query(
        `SELECT v.id AS village_id,v.mandal_id,m.district_id,f.id AS facility_id
           FROM mst_villages v
           JOIN mst_mandals m ON m.id=v.mandal_id
           JOIN mst_facilities f
             ON f.district_id=m.district_id AND f.mandal_id=m.id
          WHERE v.id=$1 AND m.id=$2 AND f.id=$3
            AND m.district_id=$4
            AND v.is_active IS TRUE AND m.is_active IS TRUE AND f.is_active IS TRUE
          FOR SHARE OF v,m,f`,
        [assignment.villageId, assignment.mandalId, assignment.facilityId, workerDistrictId]
      );
      if (!location.rows.length) {
        throw new HttpError(400, "Village and facility must belong to the selected active Mandal and district", "INVALID_LOCATION_ASSIGNMENT");
      }
      assignment.districtId = workerDistrictId;
    }

    const current = await client.query(
      `SELECT id,village_id,facility_id
         FROM tbl_health_worker_location_assignments
        WHERE user_id=$1
          AND valid_from <= CURRENT_DATE
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
        FOR UPDATE`,
      [id]
    );
    const currentByKey = new Map(
      current.rows.map((row) => [`${Number(row.village_id)}:${Number(row.facility_id)}`, row])
    );
    const requestedKeys = new Set(keys);
    const removedIds = current.rows
      .filter((row) => !requestedKeys.has(`${Number(row.village_id)}:${Number(row.facility_id)}`))
      .map((row) => row.id);
    if (removedIds.length) {
      await client.query(
        `UPDATE tbl_health_worker_location_assignments
            SET valid_to=GREATEST(valid_from,CURRENT_DATE-1)
          WHERE id=ANY($1::uuid[])`,
        [removedIds]
      );
    }

    for (const assignment of assignments) {
      const key = `${assignment.villageId}:${assignment.facilityId}`;
      if (currentByKey.has(key)) continue;
      await client.query(
        `INSERT INTO tbl_health_worker_location_assignments
           (user_id,district_id,mandal_id,village_id,facility_id,assigned_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id,village_id,facility_id,valid_from)
         DO UPDATE SET district_id=EXCLUDED.district_id,
                       mandal_id=EXCLUDED.mandal_id,
                       valid_to=NULL,
                       assigned_by=EXCLUDED.assigned_by`,
        [id, assignment.districtId, assignment.mandalId, assignment.villageId, assignment.facilityId, actor.id]
      );
    }

    await writeAudit(client, req, "HEALTH_WORKER_LOCATION_ASSIGNMENTS_UPDATED", "user", id, {
      district_id: workerDistrictId,
      assignments: assignments.map(({ mandalId, villageId, facilityId }) => ({
        mandal_id: mandalId,
        village_id: villageId,
        facility_id: facilityId,
      })),
    });
  });
  return getHealthWorkerAssignments(actor, req, id);
}

async function createStaff(actor, req, roleCode, input) {
  assertStaffAdmin(actor);
  if (!STAFF_ACCOUNT_ROLES.includes(roleCode)) {
    throw new HttpError(400, "Invalid staff role", "INVALID_ROLE");
  }
  const normalized = normalizeStaffInput(input, roleCode);
  const districtId = await resolveStaffDistrict(actor, req, normalized.districtId);

  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  let user;
  try {
    user = await withTransaction(async (client) => {
      const district = await client.query(
        `SELECT id FROM mst_districts WHERE id=$1 AND is_active=TRUE FOR SHARE`,
        [districtId]
      );
      if (!district.rows.length) throw new HttpError(400, "Select an active district", "INVALID_DISTRICT");

      const role = await client.query(
        `SELECT id,mfa_required FROM mst_roles WHERE code=$1 AND is_active=TRUE FOR SHARE`,
        [roleCode]
      );
      if (!role.rows.length) throw new HttpError(500, "Staff role is unavailable", "ROLE_CONFIGURATION_ERROR");

      const facility = await client.query(
        `SELECT id,facility_type FROM mst_facilities
          WHERE id=$1 AND district_id=$2 AND is_active=TRUE FOR SHARE`,
        [normalized.facilityId, districtId]
      );
      if (!facility.rows.length) throw new HttpError(400, "Select an active facility in the assigned district", "INVALID_FACILITY");
      if (["SPECIALIST", "HOSPITAL_STAFF"].includes(roleCode)
        && String(facility.rows[0].facility_type) !== "HOSPITAL") {
        throw new HttpError(400, "This account must be assigned to an active hospital", "INVALID_HOSPITAL_FACILITY");
      }

      if (roleCode === "MEDICAL_OFFICER") {
        const mandals = await client.query(
          `SELECT id FROM mst_mandals
            WHERE id=ANY($1::bigint[]) AND district_id=$2 AND is_active IS TRUE`,
          [normalized.mandalIds, districtId]
        );
        if (mandals.rows.length !== normalized.mandalIds.length) {
          throw new HttpError(400, "Select active Mandals from the staff member's district", "INVALID_MANDAL");
        }
      }

      if (normalized.specialtyIds.length) {
        const specialties = await client.query(
          `SELECT id FROM mst_specialties WHERE id=ANY($1::bigint[]) AND is_active=TRUE`,
          [normalized.specialtyIds]
        );
        if (specialties.rows.length !== normalized.specialtyIds.length) {
          throw new HttpError(400, "One or more specialties are invalid", "INVALID_SPECIALTY");
        }
      }

      const inserted = await client.query(
        `INSERT INTO tbl_users
           (username,password_hash,full_name,phone,email,role_id,status,district_id,must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING_SETUP',$7,TRUE)
         RETURNING id,username,full_name,email,phone,status,district_id`,
        [
          normalized.username || await generateStaffUsername(client, normalized.fullName, roleCode),
          passwordHash,
          normalized.fullName,
          normalized.phone,
          normalized.email,
          role.rows[0].id,
          districtId,
        ]
      );
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO tbl_user_facility_assignments
           (user_id,facility_id,is_primary,valid_from,valid_to)
         VALUES ($1,$2,TRUE,CURRENT_DATE,NULL)`,
        [created.id, normalized.facilityId]
      );
      if (roleCode === "MEDICAL_OFFICER") {
        for (const mandalId of normalized.mandalIds) {
          await client.query(
            `INSERT INTO tbl_medical_officer_mandal_assignments
               (user_id,mandal_id,assigned_by)
             VALUES ($1,$2,$3)`,
            [created.id, mandalId, actor.id]
          );
        }
      }
      const credentials = await issueTemporaryCredentials(client, created, actor.id);
      await writeAudit(client, req, `${roleCode}_CREATED`, "user", created.id, {
        district_id: districtId,
        facility_id: normalized.facilityId,
        mandal_ids: roleCode === "MEDICAL_OFFICER" ? normalized.mandalIds : undefined,
        specialty_ids: roleCode === "SPECIALIST" ? normalized.specialtyIds : undefined,
        temporary_password_expires_hours: 24,
      });
      return { created, ...credentials };
    });
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Username already exists", "USERNAME_EXISTS");
    throw error;
  }

  const deliveryStatus = await deliverTemporaryCredentials({
    user: user.created,
    temporaryPassword: user.temporaryPassword,
    tokenId: user.tokenId,
    req,
  });
  return { user: user.created, delivery_status: deliveryStatus };
}

async function getStaff(actor, req, userId) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.full_name,u.email,u.phone,u.status,u.district_id,u.created_at,u.updated_at,
            r.code AS role_code,r.name_en AS role_name,r.mfa_required,
            d.name_en AS district_name,d.name_te AS district_name_te
       FROM tbl_users u
       JOIN mst_roles r ON r.id=u.role_id
       LEFT JOIN mst_districts d ON d.id=u.district_id
      WHERE u.id=$1 AND u.deleted_at IS NULL
        AND r.code=ANY($2::text[])
        AND ($3::bigint IS NULL OR u.district_id=$3)
      LIMIT 1`,
    [validateUserId(userId), STAFF_ACCOUNT_ROLES, districtId]
  );
  if (!rows.length) throw new HttpError(404, "Staff member not found", "STAFF_NOT_FOUND");

  const assignments = await pool.query(
    `SELECT ufa.id,ufa.facility_id,ufa.is_primary,ufa.valid_from,ufa.valid_to,
            f.name_en AS facility_name,f.name_te AS facility_name_te,f.facility_type
       FROM tbl_user_facility_assignments ufa
       JOIN mst_facilities f ON f.id=ufa.facility_id
      WHERE ufa.user_id=$1 AND (ufa.valid_to IS NULL OR ufa.valid_to>=CURRENT_DATE)
      ORDER BY ufa.is_primary DESC,ufa.valid_from DESC`,
    [rows[0].id]
  );
  const mandalAssignments = rows[0].role_code === "MEDICAL_OFFICER"
    ? await pool.query(
      `SELECT a.id,a.mandal_id,a.valid_from,a.valid_to,
              m.name_en AS mandal_name,m.name_te AS mandal_name_te
         FROM tbl_medical_officer_mandal_assignments a
         JOIN mst_mandals m ON m.id=a.mandal_id
        WHERE a.user_id=$1
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        ORDER BY m.name_en,a.valid_from DESC`,
      [rows[0].id]
    )
    : { rows: [] };
  return { ...rows[0], assignments: assignments.rows, mandal_assignments: mandalAssignments.rows };
}

async function updateStaff(actor, req, userId, input) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN"
    ? await resolveAuthorizedDistrict(req)
    : null;
  const id = validateUserId(userId);
  await withTransaction(async (client) => {
    const current = await client.query(
      `SELECT u.id,u.role_id,u.district_id,r.code AS role_code
         FROM tbl_users u JOIN mst_roles r ON r.id=u.role_id
        WHERE u.id=$1 AND u.deleted_at IS NULL
          AND r.code=ANY($2::text[])
          AND ($3::bigint IS NULL OR u.district_id=$3)
        FOR UPDATE`,
      [id, STAFF_ACCOUNT_ROLES, districtId]
    );
    if (!current.rows.length) throw new HttpError(404, "Staff member not found", "STAFF_NOT_FOUND");

    const fullName = typeof input?.full_name === "string" ? input.full_name.trim() : "";
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : null;
    const phone = typeof input?.phone === "string" ? input.phone.trim() : null;
    const facilityId = Number(input?.facility_id);
    if (!fullName || fullName.length > 150) throw new HttpError(400, "Full name is required", "INVALID_STAFF");
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "A valid email address is required", "EMAIL_REQUIRED");
    }
    if (phone && !/^\d{10,11}$/.test(phone)) throw new HttpError(400, "Enter a valid phone number", "INVALID_STAFF");
    if (!Number.isSafeInteger(facilityId) || facilityId < 1) throw new HttpError(400, "Invalid facility", "INVALID_FACILITY");

    const facility = await client.query(
      `SELECT id,facility_type FROM mst_facilities
        WHERE id=$1 AND district_id=$2 AND is_active=TRUE FOR SHARE`,
      [facilityId, current.rows[0].district_id]
    );
    if (!facility.rows.length) throw new HttpError(400, "Facility must belong to the staff district", "INVALID_FACILITY");
    if (["SPECIALIST", "HOSPITAL_STAFF"].includes(current.rows[0].role_code)
      && String(facility.rows[0].facility_type) !== "HOSPITAL") {
      throw new HttpError(400, "This account must be assigned to a hospital", "INVALID_HOSPITAL_FACILITY");
    }

    const mandalIds = Array.isArray(input?.mandal_ids)
      ? [...new Set(input.mandal_ids.map(Number))]
      : [];
    if (current.rows[0].role_code === "MEDICAL_OFFICER") {
      if (!mandalIds.length || mandalIds.some((mandalId) => !Number.isSafeInteger(mandalId) || mandalId < 1)) {
        throw new HttpError(400, "Assign the Medical Officer to at least one valid Mandal", "MANDAL_REQUIRED");
      }
      const mandals = await client.query(
        `SELECT id FROM mst_mandals
          WHERE id=ANY($1::bigint[]) AND district_id=$2 AND is_active IS TRUE`,
        [mandalIds, current.rows[0].district_id]
      );
      if (mandals.rows.length !== mandalIds.length) {
        throw new HttpError(400, "Select active Mandals from the staff member's district", "INVALID_MANDAL");
      }

      const currentMandals = await client.query(
        `SELECT mandal_id FROM tbl_medical_officer_mandal_assignments
          WHERE user_id=$1 AND valid_to IS NULL
          FOR UPDATE`,
        [id]
      );
      const currentIds = new Set(currentMandals.rows.map((row) => Number(row.mandal_id)));
      if ([...currentIds].some((mandalId) => !mandalIds.includes(mandalId))) {
        await client.query(
          `UPDATE tbl_medical_officer_mandal_assignments
              SET valid_to=GREATEST(valid_from,CURRENT_DATE-1)
            WHERE user_id=$1 AND valid_to IS NULL AND NOT (mandal_id=ANY($2::bigint[]))`,
          [id, mandalIds]
        );
      }
      for (const mandalId of mandalIds) {
        if (currentIds.has(mandalId)) continue;
        await client.query(
          `INSERT INTO tbl_medical_officer_mandal_assignments
             (user_id,mandal_id,assigned_by,valid_from,valid_to)
           VALUES ($1,$2,$3,CURRENT_DATE,NULL)
           ON CONFLICT (user_id,mandal_id,valid_from)
           DO UPDATE SET valid_to=NULL,assigned_by=EXCLUDED.assigned_by`,
          [id, mandalId, actor.id]
        );
      }
    }

    await client.query(
      `UPDATE tbl_users SET full_name=$1,email=$2,phone=$3,updated_at=now()
        WHERE id=$4`,
      [fullName, email, phone, id]
    );
    const currentAssignment = await client.query(
      `SELECT facility_id FROM tbl_user_facility_assignments
        WHERE user_id=$1 AND valid_to IS NULL AND is_primary=TRUE
        ORDER BY valid_from DESC LIMIT 1`,
      [id]
    );
    const facilityChanged = Number(currentAssignment.rows[0]?.facility_id) !== facilityId;
    if (facilityChanged) {
      // valid_to may not be earlier than valid_from (ck_assignment_dates)
      await client.query(
        `UPDATE tbl_user_facility_assignments
            SET valid_to=GREATEST(valid_from, CURRENT_DATE-1)
          WHERE user_id=$1 AND valid_to IS NULL`,
        [id]
      );
      await client.query(
        `INSERT INTO tbl_user_facility_assignments
           (user_id,facility_id,is_primary,valid_from,valid_to)
         VALUES ($1,$2,TRUE,CURRENT_DATE,NULL)
         ON CONFLICT (user_id,facility_id,valid_from) DO UPDATE SET valid_to=NULL,is_primary=TRUE`,
        [id, facilityId]
      );
    }
    await writeAudit(client, req, "STAFF_UPDATED", "user", id, {
      facility_id: facilityId,
      mandal_ids: current.rows[0].role_code === "MEDICAL_OFFICER" ? mandalIds : undefined,
    });
  });
  return getStaff(actor, req, id);
}

async function setStaffStatus(actor, req, userId, status) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN" ? await resolveAuthorizedDistrict(req) : null;
  if (!["ACTIVE", "SUSPENDED"].includes(status)) throw new HttpError(400, "Invalid staff status", "INVALID_STATUS");
  return withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE tbl_users u SET status=$1,updated_at=now()
        WHERE u.id=$2 AND u.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM mst_roles r WHERE r.id=u.role_id AND r.code=ANY($3::text[]))
          AND ($4::bigint IS NULL OR u.district_id=$4)
        RETURNING u.id`,
      [status, validateUserId(userId), STAFF_ACCOUNT_ROLES, districtId]
    );
    if (!updated.rows.length) throw new HttpError(404, "Staff member not found", "STAFF_NOT_FOUND");
    if (status === "SUSPENDED") await sessions.revokeAllSessions(userId, "ACCOUNT_SUSPENDED", {}, client);
    await writeAudit(client, req, status === "SUSPENDED" ? "STAFF_SUSPENDED" : "STAFF_ACTIVATED", "user", userId, {});
    return { id: userId, status };
  });
}

async function resendStaffCredentials(actor, req, userId) {
  assertStaffAdmin(actor);
  const districtId = actor.role_name === "DISTRICT_ADMIN" ? await resolveAuthorizedDistrict(req) : null;
  const id = validateUserId(userId);
  let userResult;
  try {
    userResult = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT u.id,u.username,u.full_name,u.email,u.status
           FROM tbl_users u JOIN mst_roles r ON r.id=u.role_id
          WHERE u.id=$1 AND u.deleted_at IS NULL
            AND r.code=ANY($2::text[])
            AND ($3::bigint IS NULL OR u.district_id=$3)
          FOR UPDATE`,
        [id, STAFF_ACCOUNT_ROLES, districtId]
      );
      if (!found.rows.length) throw new HttpError(404, "Staff member not found", "STAFF_NOT_FOUND");
      if (found.rows[0].status !== "PENDING_SETUP") {
        throw new HttpError(409, "Login details can only be resent while account setup is pending", "SETUP_NOT_AVAILABLE");
      }
      const credentials = await issueTemporaryCredentials(client, found.rows[0], actor.id);
      await writeAudit(client, req, "STAFF_SETUP_RESENT", "user", id, { temporary_password_expires_hours: 24 });
      return { user: found.rows[0], ...credentials };
    });
  } catch (error) {
    throw error;
  }
  const deliveryStatus = await deliverTemporaryCredentials({
    user: userResult.user,
    temporaryPassword: userResult.temporaryPassword,
    tokenId: userResult.tokenId,
    req,
  });
  return { user: { id: userResult.user.id, username: userResult.user.username }, delivery_status: deliveryStatus };
}

// ---------- temporary login details for new District Admins ----------

// Letters and digits that cannot be confused when typed from an email (no 0/O, 1/l/I)
const PASSWORD_SETS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnpqrstuvwxyz",
  "23456789",
  "@#$%&*!?",
];
const TEMPORARY_PASSWORD_LENGTH = 14;

function randomCharacter(characters) {
  return characters[crypto.randomInt(characters.length)];
}

// A strong random password with at least one character from every set
function generateTemporaryPassword(username) {
  for (;;) {
    const all = PASSWORD_SETS.join("");
    const characters = PASSWORD_SETS.map(randomCharacter);
    while (characters.length < TEMPORARY_PASSWORD_LENGTH) characters.push(randomCharacter(all));
    for (let i = characters.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [characters[i], characters[j]] = [characters[j], characters[i]];
    }
    const password = characters.join("");
    if (!checkPassword(password, { username })) return password;
  }
}

// "Ravi Kumar" -> "da.ravi.4821". Usernames are never reused, so deleted
// accounts and pending registration requests are checked too.
async function generateUsername(client, fullName) {
  const firstWord = fullName.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, "").trim().split(/\s+/)[0];
  const base = (firstWord || "admin").slice(0, 20);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `da.${base}.${crypto.randomInt(1000, 10000)}`;
    const taken = await client.query(
      `SELECT 1 FROM tbl_users WHERE lower(username) = $1
       UNION ALL
       SELECT 1 FROM tbl_user_registration_requests WHERE lower(username) = $1 AND status = 'PENDING'
       LIMIT 1`,
      [candidate]
    );
    if (!taken.rows.length) return candidate;
  }
  throw new HttpError(409, "Username already exists", "USERNAME_EXISTS");
}

// Gives the account a new temporary password that works for 24 hours.
// Any earlier temporary password or setup link stops working: the old password
// hash is replaced and the old setup row is revoked (rows are never deleted).
// The 24-hour limit is kept in tbl_district_admin_setup_tokens.expires_at.
async function issueTemporaryCredentials(client, user, createdBy) {
  await client.query(
    `UPDATE tbl_district_admin_setup_tokens
        SET revoked_at = now(), encrypted_token = NULL
      WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [user.id]
  );

  const temporaryPassword = generateTemporaryPassword(user.username);
  await client.query(
    `UPDATE tbl_users
        SET password_hash = $1, must_change_password = TRUE,
            failed_login_count = 0, locked_until = NULL
      WHERE id = $2`,
    [await bcrypt.hash(temporaryPassword, 12), user.id]
  );

  // token_hash is required by the table; this random value is never sent to anyone
  const unusedToken = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
  const inserted = await client.query(
    `INSERT INTO tbl_district_admin_setup_tokens
       (user_id, token_hash, encrypted_token, created_by, expires_at)
     VALUES ($1, $2, NULL, $3, now() + interval '24 hours')
     RETURNING id, expires_at`,
    [user.id, unusedToken, createdBy]
  );
  return {
    temporaryPassword,
    tokenId: inserted.rows[0]?.id,
    expiresAt: inserted.rows[0]?.expires_at,
  };
}

function getLoginUrl() {
  return `${config.frontendUrl.replace(/\/+$/, "")}/login`;
}

function normalizeDeliveryResult(delivery) {
  const statuses = new Set(["NOT_CONFIGURED", "SENT", "FAILED"]);
  if (!delivery || !statuses.has(delivery.status)) {
    return {
      success: false,
      status: "FAILED",
      message: "Delivery could not be completed.",
    };
  }
  if (
    (delivery.status === "SENT" && delivery.success !== true)
    || (delivery.status !== "SENT" && delivery.success !== false)
  ) {
    return {
      success: false,
      status: "FAILED",
      message: "Delivery could not be completed.",
    };
  }
  return {
    success: delivery.status === "SENT",
    status: delivery.status,
    message: delivery.status === "SENT"
      ? "Delivery sent."
      : delivery.status === "NOT_CONFIGURED"
        ? "Delivery is not configured."
        : "Delivery failed. Check the provider configuration and try again.",
  };
}

// Emails the login details. user needs id, username, full_name and email.
async function deliverTemporaryCredentials({ user, temporaryPassword, tokenId, req }) {
  return withTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT id, status
         FROM tbl_users
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [user.id]
    );
    if (!userResult.rows.length || userResult.rows[0].status !== "PENDING_SETUP") {
      throw new HttpError(409, "District Admin setup is no longer available for delivery", "SETUP_NOT_AVAILABLE");
    }

    const tokenResult = await client.query(
      `SELECT id, expires_at
         FROM tbl_district_admin_setup_tokens
        WHERE id = $1 AND user_id = $2 AND used_at IS NULL AND revoked_at IS NULL
        FOR UPDATE`,
      [tokenId, user.id]
    );
    if (!tokenResult.rows.length || new Date(tokenResult.rows[0].expires_at).getTime() <= Date.now()) {
      throw new HttpError(409, "Setup invitation is no longer valid for delivery", "SETUP_NOT_AVAILABLE");
    }

    // Keep setup locked until the email attempt and status update finish.
    // The temporary password is only passed to the email; it is never saved, logged or audited.
    let delivery;
    try {
      delivery = normalizeDeliveryResult(await emailTransport.sendTemporaryCredentialsEmail({
        user,
        username: user.username,
        temporaryPassword,
        loginUrl: getLoginUrl(),
      }));
    } catch {
      delivery = { success: false, status: "FAILED", message: "Delivery could not be completed." };
    }

    const deliveryStatus = {
      email: { status: delivery.status, message: delivery.message },
    };
    await client.query(
      `UPDATE tbl_district_admin_setup_tokens
          SET email_delivery_status = $1,
              email_delivery_attempted_at = now(),
              email_delivery_sent_at = CASE WHEN $1 = 'SENT' THEN now() ELSE NULL END
        WHERE id = $2 AND used_at IS NULL AND revoked_at IS NULL`,
      [delivery.status, tokenId]
    );
    await writeAudit(
      client,
      req,
      "DISTRICT_ADMIN_SETUP_DELIVERY_ATTEMPTED",
      "user",
      user.id,
      { channel: "EMAIL", status: delivery.status }
    );
    return deliveryStatus;
  });
}

async function createDistrictAdmin(actor, req, input) {
  assertSuperAdmin(actor);
  const details = normalizeDistrictAdminInput(input);
  // Placeholder hash until issueTemporaryCredentials sets the real temporary password
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  let user;
  try {
    user = await withTransaction(async (client) => {
      const district = await client.query(
        "SELECT id FROM mst_districts WHERE id = $1 AND is_active = TRUE FOR SHARE",
        [details.districtId]
      );
      if (!district.rows.length) {
        throw new HttpError(400, "Select an active district", "INVALID_DISTRICT");
      }
      const role = await client.query(
        "SELECT id, mfa_required FROM mst_roles WHERE code = 'DISTRICT_ADMIN' AND is_active = TRUE FOR SHARE"
      );
      if (!role.rows.length || !role.rows[0].mfa_required) {
        throw new HttpError(500, "District Admin role is unavailable or MFA is not required", "ROLE_CONFIGURATION_ERROR");
      }
      const inserted = await client.query(
        `INSERT INTO tbl_users
           (username, password_hash, full_name, phone, email, role_id, status, district_id, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_SETUP', $7, TRUE)
         RETURNING id, username, full_name, email, phone, status, district_id`,
        [
          details.username || await generateUsername(client, details.fullName),
          passwordHash,
          details.fullName,
          details.phone,
          details.email,
          role.rows[0].id,
          details.districtId,
        ]
      );
      const created = inserted.rows[0];
      const credentials = await issueTemporaryCredentials(client, created, actor.id);
      await writeAudit(client, req, "DISTRICT_ADMIN_CREATED", "user", created.id, {
        district_id: details.districtId,
        temporary_password_expires_hours: 24,
      });
      return { created, ...credentials };
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Username already exists", "USERNAME_EXISTS");
    }
    throw error;
  }
  const deliveryStatus = await deliverTemporaryCredentials({
    user: user.created,
    temporaryPassword: user.temporaryPassword,
    tokenId: user.tokenId,
    req,
  });
  return {
    user: user.created,
    delivery_status: deliveryStatus,
  };
}

async function listDistrictAdmins(actor) {
  assertSuperAdmin(actor);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status,
            u.district_id, d.name_en AS district_name, d.name_te AS district_name_te, u.created_at,
            u.must_change_password AS setup_password_pending,
            COALESCE(t.email_delivery_status, 'NOT_CONFIGURED') AS email_delivery_status,
            COALESCE(t.sms_delivery_status, 'NOT_CONFIGURED') AS sms_delivery_status,
            CASE WHEN t.used_at IS NULL AND t.revoked_at IS NULL THEN t.expires_at END AS credentials_expires_at
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
       LEFT JOIN mst_districts d ON d.id = u.district_id
       LEFT JOIN LATERAL (
         SELECT email_delivery_status, sms_delivery_status, expires_at, used_at, revoked_at
           FROM tbl_district_admin_setup_tokens
          WHERE user_id = u.id
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
      WHERE r.code = 'DISTRICT_ADMIN' AND u.deleted_at IS NULL
      ORDER BY lower(u.full_name), u.id`
  );
  return rows;
}

async function listDistricts(actor) {
  assertSuperAdmin(actor);
  const { rows } = await pool.query(
    "SELECT id, name_en, name_te FROM mst_districts WHERE is_active = TRUE ORDER BY name_en"
  );
  return rows;
}

async function mapDistrictAdmin(actor, req, userId, districtIdValue) {
  assertSuperAdmin(actor);
  userId = validateUserId(userId);
  const districtId = Number(districtIdValue);
  if (!Number.isSafeInteger(districtId) || districtId < 1) {
    throw new HttpError(400, "An explicit district is required", "DISTRICT_REQUIRED");
  }
  return withTransaction(async (client) => {
    const target = await client.query(
      `SELECT u.id, u.district_id
         FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = $1 AND r.code = 'DISTRICT_ADMIN' AND u.deleted_at IS NULL
        FOR UPDATE OF u`,
      [userId]
    );
    if (!target.rows.length) throw new HttpError(404, "District Admin not found", "DISTRICT_ADMIN_NOT_FOUND");
    const district = await client.query(
      "SELECT id FROM mst_districts WHERE id = $1 AND is_active = TRUE",
      [districtId]
    );
    if (!district.rows.length) throw new HttpError(400, "Select an active district", "INVALID_DISTRICT");
    const previousDistrictId = target.rows[0].district_id;
    await client.query("UPDATE tbl_users SET district_id = $1 WHERE id = $2", [districtId, userId]);
    await writeAudit(client, req, "DISTRICT_ADMIN_DISTRICT_MAPPED", "user", userId, {
      previous_district_id: previousDistrictId,
      district_id: districtId,
    });
    return { user_id: userId, previous_district_id: previousDistrictId, district_id: districtId };
  });
}

// "Resend login details": new temporary password and a new 24 hours.
// The previous temporary password (and any old setup link) stops working.
// Also allowed after the password was changed but before MFA was set up,
// e.g. when the District Admin forgot the new password.
async function reissueDistrictAdminSetup(actor, req, userId) {
  assertSuperAdmin(actor);
  userId = validateUserId(userId);
  const setup = await withTransaction(async (client) => {
    const target = await client.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status, u.district_id
         FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = $1 AND r.code = 'DISTRICT_ADMIN' AND u.deleted_at IS NULL
        FOR UPDATE OF u`,
      [userId]
    );
    if (!target.rows.length) throw new HttpError(404, "District Admin not found", "DISTRICT_ADMIN_NOT_FOUND");
    if (target.rows[0].status !== "PENDING_SETUP" || !target.rows[0].district_id) {
      throw new HttpError(409, "Only a mapped District Admin awaiting setup can receive new login details", "SETUP_NOT_AVAILABLE");
    }
    if (!target.rows[0].email) {
      throw new HttpError(400, "An email address is required to send the login details", "EMAIL_REQUIRED");
    }
    const credentials = await issueTemporaryCredentials(client, target.rows[0], actor.id);
    await writeAudit(client, req, "DISTRICT_ADMIN_CREDENTIALS_REISSUED", "user", userId, {
      temporary_password_expires_hours: 24,
    });
    return { user: target.rows[0], ...credentials };
  });
  const deliveryStatus = await deliverTemporaryCredentials({
    user: setup.user,
    temporaryPassword: setup.temporaryPassword,
    tokenId: setup.tokenId,
    req,
  });
  return { delivery_status: deliveryStatus };
}

// Retry after a failed email. The temporary password is never stored, so it cannot
// be sent again: a retry issues new login details, which also cancels the old ones.
async function retryDistrictAdminSetupDelivery(actor, req, userId, channelValue) {
  assertSuperAdmin(actor);
  const channel = typeof channelValue === "string" ? channelValue.trim().toUpperCase() : "";
  if (channel !== "EMAIL") {
    throw new HttpError(400, "Choose EMAIL delivery", "INVALID_DELIVERY_CHANNEL");
  }
  userId = validateUserId(userId);
  const setup = await withTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = $1 AND r.code = 'DISTRICT_ADMIN' AND u.deleted_at IS NULL
        FOR UPDATE OF u`,
      [userId]
    );
    if (!userResult.rows.length) {
      throw new HttpError(404, "District Admin setup invitation was not found", "SETUP_NOT_FOUND");
    }
    const user = userResult.rows[0];
    if (user.status !== "PENDING_SETUP") {
      throw new HttpError(409, "Only an account awaiting setup can receive a retry", "SETUP_NOT_AVAILABLE");
    }
    const tokenResult = await client.query(
      `SELECT id AS token_id, expires_at,
              email_delivery_status, sms_delivery_status
         FROM tbl_district_admin_setup_tokens
        WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [userId]
    );
    if (!tokenResult.rows.length) {
      throw new HttpError(404, "District Admin setup invitation was not found", "SETUP_NOT_FOUND");
    }
    const row = { ...user, ...tokenResult.rows[0] };
    if (row[`${channel.toLowerCase()}_delivery_status`] === "SENT") {
      throw new HttpError(409, "This invitation channel has already been sent", "DELIVERY_ALREADY_SENT");
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new HttpError(409, "The temporary password has expired. Resend the login details instead.", "SETUP_TOKEN_EXPIRED");
    }
    if (!user.email) {
      throw new HttpError(400, "An email address is required to send the login details", "EMAIL_REQUIRED");
    }
    const credentials = await issueTemporaryCredentials(client, user, actor.id);
    await writeAudit(client, req, "DISTRICT_ADMIN_CREDENTIALS_REISSUED", "user", userId, {
      temporary_password_expires_hours: 24,
      reason: "email_retry",
    });
    return { user, ...credentials };
  });
  const deliveryStatus = await deliverTemporaryCredentials({
    user: setup.user,
    temporaryPassword: setup.temporaryPassword,
    tokenId: setup.tokenId,
    req,
  });
  return {
    channel: channel.toLowerCase(),
    delivery_status: deliveryStatus.email.status,
    message: deliveryStatus.email.message,
  };
}

async function completeDistrictAdminSetup(tokenValue, password, req) {
  if (typeof tokenValue !== "string" || !/^[a-f0-9]{64}$/i.test(tokenValue)) {
    throw new HttpError(400, "Setup link is invalid or expired", "SETUP_TOKEN_INVALID");
  }
  const tokenHash = crypto.createHash("sha256").update(tokenValue).digest("hex");
  return withTransaction(async (client) => {
    const tokenCandidate = await client.query(
      `SELECT id, user_id FROM tbl_district_admin_setup_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > now()`,
      [tokenHash]
    );
    if (!tokenCandidate.rows.length) {
      throw new HttpError(400, "Setup link is invalid or expired", "SETUP_TOKEN_INVALID");
    }
    const userResult = await client.query(
      `SELECT u.id, u.username, u.status
         FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = $1 AND r.code = 'DISTRICT_ADMIN' AND u.deleted_at IS NULL
        FOR UPDATE OF u`,
      [tokenCandidate.rows[0].user_id]
    );
    if (!userResult.rows.length || userResult.rows[0].status !== "PENDING_SETUP") {
      throw new HttpError(400, "Setup link is invalid or expired", "SETUP_TOKEN_INVALID");
    }
    const token = await client.query(
      `SELECT id FROM tbl_district_admin_setup_tokens
        WHERE id = $1 AND user_id = $2 AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > now()
        FOR UPDATE`,
      [tokenCandidate.rows[0].id, userResult.rows[0].id]
    );
    if (!token.rows.length) {
      throw new HttpError(400, "Setup link is invalid or expired", "SETUP_TOKEN_INVALID");
    }
    const passwordError = checkPassword(password, { username: userResult.rows[0].username });
    if (passwordError) throw new HttpError(400, passwordError, "INVALID_PASSWORD");
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `UPDATE tbl_users
          SET password_hash = $1, must_change_password = FALSE,
              password_changed_at = now()
        WHERE id = $2`,
      [passwordHash, userResult.rows[0].id]
    );
    await client.query(
      "UPDATE tbl_district_admin_setup_tokens SET used_at = now(), encrypted_token = NULL WHERE id = $1",
      [token.rows[0].id]
    );
    await client.query(
      `INSERT INTO tbl_audit_logs
         (actor_id, actor_role, event, outcome, resource_type, resource_id, ip_address, request_id, metadata)
       VALUES ($1, 'DISTRICT_ADMIN', 'DISTRICT_ADMIN_SETUP_PASSWORD_SET', 'SUCCESS', 'user', $1::text, $2, $3, '{}'::jsonb)`,
      [userResult.rows[0].id, req?.ip || null, req?.requestId || null]
    );
    return { user_id: userResult.rows[0].id, status: "PENDING_SETUP" };
  });
}

module.exports = {
  assertSystemAdmin,
  getRbacDashboard,
  listRoles,
  listAssignablePermissions,
  listRbacUsers,
  updateUserRole,
  createRole,
  updateRole,
  updateRolePermissions,
  updateRoleStatus,
  listRoleUsers,
  listDistrictAdmins,
  listDistricts,
  createDistrictAdmin,
  mapDistrictAdmin,
  reissueDistrictAdminSetup,
  retryDistrictAdminSetupDelivery,
  completeDistrictAdminSetup,
  listStaff,
  listStaffOptions,
  listHealthWorkers,
  getHealthWorkerAssignments,
  updateHealthWorkerAssignments,
  createStaff,
  getStaff,
  updateStaff,
  setStaffStatus,
  resendStaffCredentials,
};
