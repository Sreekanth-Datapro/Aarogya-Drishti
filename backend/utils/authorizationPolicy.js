const HttpError = require("./httpError");

const SYSTEM_ADMIN_ROLES = ["SYSTEM_ADMIN", "SUPER_ADMIN"];

function hasRole(user, roles) {
  return Boolean(user && roles.includes(user.role_name));
}

function hasAllPermissions(permissions, codes) {
  const granted = new Set(permissions || []);
  return codes.every((code) => granted.has(code));
}

function hasAnyPermission(permissions, codes) {
  const granted = new Set(permissions || []);
  return codes.some((code) => granted.has(code));
}

function getEffectivePermissions(roleName, permissions) {
  const effective = new Set(permissions || []);

  if (roleName === "SUPER_ADMIN") {
    effective.add("role.manage");
    effective.add("district_admin.manage");
  }
  if (roleName === "SYSTEM_ADMIN") {
    // Role/page RBAC management; district-admin lifecycle stays Super-Admin-only.
    effective.add("role.manage");
  }
  if (roleName === "DISTRICT_ADMIN") {
    effective.add("user.create_staff");
  }

  return [...effective];
}

function assertSystemAdmin(actor) {
  if (!SYSTEM_ADMIN_ROLES.includes(actor?.role_name) || !actor.id) {
    throw new HttpError(403, "Only a system administrator can perform this action", "FORBIDDEN");
  }
}

function assertSuperAdmin(actor) {
  if (actor?.role_name !== "SUPER_ADMIN" || !actor.id) {
    throw new HttpError(403, "Only a Super Admin can perform this action", "FORBIDDEN");
  }
}

module.exports = {
  SYSTEM_ADMIN_ROLES,
  hasRole,
  hasAllPermissions,
  hasAnyPermission,
  getEffectivePermissions,
  assertSystemAdmin,
  assertSuperAdmin,
};
