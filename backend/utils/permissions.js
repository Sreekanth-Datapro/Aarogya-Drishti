const pool = require("../db");

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

async function getRolePermissions(roleId) {
  const key = String(roleId);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.permissions;

  const { rows } = await pool.query(
    `SELECT p.code
     FROM tbl_role_permissions rp
     JOIN mst_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.code`,
    [roleId]
  );

  const permissions = rows.map((row) => row.code);
  cache.set(key, { permissions, expires: Date.now() + CACHE_TTL_MS });
  return permissions;
}

function clearPermissionCache() {
  cache.clear();
}

function invalidateRolePermissionCache(roleId) {
  if (roleId === undefined || roleId === null) {
    clearPermissionCache();
    return;
  }
  cache.delete(String(roleId));
}

module.exports = { getRolePermissions, clearPermissionCache, invalidateRolePermissionCache };
