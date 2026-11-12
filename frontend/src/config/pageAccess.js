// Page access uses existing mst_permissions codes: page.<moduleKey>
// (resource = "page", action = "access"). No separate page tables.

export const PAGE_PERMISSION_PREFIX = "page.";

export function pagePermission(moduleKey) {
  return `${PAGE_PERMISSION_PREFIX}${moduleKey}`;
}

export function moduleKeyFromPagePermission(code) {
  if (typeof code !== "string" || !code.startsWith(PAGE_PERMISSION_PREFIX)) return null;
  return code.slice(PAGE_PERMISSION_PREFIX.length);
}

// Super-admin / privilege pages must not be assignable to custom roles.
export const PROTECTED_PAGE_MODULE_KEYS = Object.freeze([
  "roleManagement",
  "districtAdmins",
  "locationImport",
  "auditLogs",
  "registrationMonitoring",
]);

export function isProtectedPagePermission(code) {
  const key = moduleKeyFromPagePermission(code);
  return Boolean(key && PROTECTED_PAGE_MODULE_KEYS.includes(key));
}

export function hasPagePermission(permissions, moduleKey) {
  const granted = new Set(permissions || []);
  return granted.has(pagePermission(moduleKey));
}

export function hasAnyPermission(permissions, codes) {
  if (!codes?.length) return false;
  const granted = new Set(permissions || []);
  return codes.some((code) => granted.has(code));
}
