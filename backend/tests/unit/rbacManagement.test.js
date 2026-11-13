let mockPoolQuery;
let mockClientQuery;
let mockConnect;
let mockTarget;
let mockNextRole;
let mockActiveAdmins;
let mockFacilityDistrict;
let mockMandalAssignment;
let mockHealthWorkerAssignment;
const mockCalls = [];

jest.mock("../../db", () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: (...args) => mockConnect(...args),
}));

const mockInvalidateRolePermissionCache = jest.fn();
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => []),
  clearPermissionCache: jest.fn(),
  invalidateRolePermissionCache: (...args) => mockInvalidateRolePermissionCache(...args),
}));

const rbac = require("../../services/systemAdminService");

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const request = {
  user: { id: ACTOR_ID, role_name: "SUPER_ADMIN" },
  ip: "127.0.0.1",
  requestId: "rbac-test",
};
const superAdmin = request.user;

function baseUser(overrides = {}) {
  return {
    id: USER_ID,
    role_id: 4,
    role_code: "HEALTH_WORKER",
    role_name: "Health worker",
    status: "ACTIVE",
    district_id: 1,
    facility_id: 10,
    facility_district_id: 1,
    facility_type: "PHC",
    facility_is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockTarget = baseUser();
  mockNextRole = { id: 20, code: "CUSTOM_AUDITOR", name_en: "Custom auditor", is_active: true };
  mockActiveAdmins = 2;
  mockFacilityDistrict = 1;
  mockMandalAssignment = true;
  mockHealthWorkerAssignment = true;

  mockPoolQuery = jest.fn(async (sql) => {
    mockCalls.push({ sql, client: false });
    if (sql.includes("COUNT(*)::int AS total FROM tbl_users")) return { rows: [{ total: 1 }] };
    if (sql.includes("LEFT JOIN LATERAL") && sql.includes("FROM tbl_users u")) return { rows: [baseUser()] };
    if (sql.includes("SELECT id, code, name_en") && sql.includes("FROM mst_roles WHERE id")) return { rows: [mockNextRole] };
    if (sql.includes("FROM mst_roles r") && sql.includes("array_agg")) {
      return { rows: [{ id: 2, code: "CUSTOM_AUDITOR", name: "Custom auditor", permissions: [], permission_ids: [], is_protected: false }] };
    }
    if (sql.includes("AS assignable") && sql.includes("FROM mst_permissions")) {
      return { rows: [
        { id: 1, code: "master.view", resource: "master", action: "read", description: "View masters", assignable: true },
        { id: 3, code: "page.reports", resource: "page", action: "access", description: "Open reports", assignable: true },
        { id: 4, code: "page.roleManagement", resource: "page", action: "access", description: "Open roles", assignable: false },
        { id: 2, code: "review.sign", resource: "review", action: "sign", description: "Sign reviews", assignable: false },
      ] };
    }
    if (sql.includes("AS custom_roles")) {
      return { rows: [{ total_users: 5, active_users: 3, inactive_users: 2, total_roles: 8, total_permissions: 28, custom_roles: 1 }] };
    }
    if (sql.includes("FROM tbl_audit_logs a")) return { rows: [{ id: 1, event: "ROLE_CHANGED", resource_type: "user", resource_id: USER_ID }] };
    return { rows: [] };
  });

  mockClientQuery = jest.fn(async (sql, params = []) => {
    mockCalls.push({ sql, params, client: true });
    const statement = sql.trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) return { rows: [] };
    if (statement.includes("FOR UPDATE OF u")) return { rows: mockTarget ? [mockTarget] : [] };
    if (statement.includes("FROM mst_roles WHERE id = $1 FOR UPDATE")) {
      return { rows: [{ id: 2, code: "CUSTOM_AUDITOR", name_en: "Custom auditor", is_active: true, is_system_role: false }] };
    }
    if (statement.includes("FROM mst_roles WHERE id = $1 FOR SHARE")) {
      return { rows: [mockNextRole] };
    }
    if (statement.includes("COUNT(*)::int AS total") && statement.includes("SUPER_ADMIN")) {
      return { rows: [{ total: mockActiveAdmins }] };
    }
    if (statement.includes("FROM tbl_medical_officer_mandal_assignments")) {
      return { rows: mockMandalAssignment ? [{ "?column?": 1 }] : [] };
    }
    if (statement.includes("FROM tbl_health_worker_location_assignments h")) {
      return { rows: mockHealthWorkerAssignment ? [{ "?column?": 1 }] : [] };
    }
    if (statement.includes("FROM mst_districts")) return { rows: [{ id: 1 }] };
    if (statement.includes("INSERT INTO tbl_audit_logs")) return { rows: [] };
    if (statement.includes("SELECT id, code, resource, action FROM mst_permissions")) {
      const catalog = {
        1: { id: 1, code: "master.view", resource: "master", action: "read" },
        2: { id: 2, code: "review.sign", resource: "review", action: "sign" },
        3: { id: 3, code: "page.reports", resource: "page", action: "access" },
        4: { id: 4, code: "page.roleManagement", resource: "page", action: "access" },
      };
      return { rows: params[0].map((id) => catalog[Number(id)]).filter(Boolean) };
    }
    if (statement.includes("SELECT p.code FROM tbl_role_permissions")) return { rows: [{ code: "master.view" }] };
    if (statement.includes("SELECT code FROM mst_permissions WHERE id")) return { rows: [{ code: "master.view" }] };
    if (statement.includes("INSERT INTO mst_roles")) return { rows: [{ id: 30, code: "CUSTOM_AUDITOR", name: "Custom auditor" }] };
    return { rows: [] };
  });

  mockConnect = jest.fn(async () => ({
    query: (...args) => mockClientQuery(...args),
    release: jest.fn(),
  }));
});

const systemAdmin = { id: ACTOR_ID, role_name: "SYSTEM_ADMIN" };
const systemAdminRequest = { ...request, user: systemAdmin };

describe("Super Admin RBAC service", () => {
  test("allows SYSTEM_ADMIN to list roles for Role Management", async () => {
    const roles = await rbac.listRoles(systemAdmin);
    expect(roles).toHaveLength(1);
    expect(mockPoolQuery).toHaveBeenCalled();
  });

  test("SYSTEM_ADMIN can create a custom role with page permissions and audit", async () => {
    const role = await rbac.createRole(systemAdmin, systemAdminRequest, {
      name: "Reports viewer",
      code: "REPORTS_VIEWER",
      permission_ids: [3],
    });
    expect(role).toMatchObject({ id: 30, permission_ids: [3] });
    expect(mockCalls.some(({ sql }) => sql.includes("INSERT INTO tbl_audit_logs"))).toBe(true);
  });

  test("SYSTEM_ADMIN can update role permissions and invalidates permission cache", async () => {
    mockInvalidateRolePermissionCache.mockClear();
    const ids = await rbac.updateRolePermissions(systemAdmin, systemAdminRequest, 2, [1, 3]);
    expect(ids).toEqual([1, 3]);
    expect(mockInvalidateRolePermissionCache).toHaveBeenCalledWith(2);
    expect(mockCalls.some(({ sql }) => sql.includes("INSERT INTO tbl_audit_logs"))).toBe(true);
  });

  test("SYSTEM_ADMIN can assign an active custom role to a user", async () => {
    const result = await rbac.updateUserRole(systemAdmin, systemAdminRequest, USER_ID, 20);
    expect(result).toMatchObject({ role_code: "CUSTOM_AUDITOR" });
    expect(mockCalls.some(({ sql }) => sql.includes("INSERT INTO tbl_audit_logs"))).toBe(true);
  });

  test("rejects duplicate custom role codes", async () => {
    mockClientQuery.mockImplementation(async (sql, params = []) => {
      const statement = sql.trim();
      if (statement === "BEGIN" || statement === "ROLLBACK") return { rows: [] };
      if (statement.includes("SELECT id, code, resource, action FROM mst_permissions")) {
        return { rows: [{ id: 1, code: "master.view", resource: "master", action: "read" }] };
      }
      if (statement.includes("SELECT code FROM mst_permissions WHERE id")) {
        return { rows: [{ code: "master.view" }] };
      }
      if (statement.includes("INSERT INTO mst_roles")) {
        const error = new Error("duplicate key");
        error.code = "23505";
        throw error;
      }
      return { rows: [] };
    });
    await expect(rbac.createRole(superAdmin, request, {
      name: "Dup",
      code: "CUSTOM_AUDITOR",
      permission_ids: [1],
    })).rejects.toMatchObject({ status: 409, code: "ROLE_CODE_EXISTS" });
  });

  test("lists built-in and custom roles without granting editability to protected roles", async () => {
    const roles = await rbac.listRoles(superAdmin);
    expect(roles).toHaveLength(1);
    const query = mockPoolQuery.mock.calls[0];
    expect(query[0]).not.toContain("WHERE r.is_system_role = FALSE");
    expect(query[0]).toContain("is_protected");
    expect(query[1][0]).toContain("MEDICAL_OFFICER");
  });

  test("returns the complete permission registry and marks only existing policy-approved permissions assignable", async () => {
    const permissions = await rbac.listAssignablePermissions(superAdmin);
    expect(permissions).toHaveLength(4);
    expect(permissions.map(({ code, assignable }) => [code, assignable])).toEqual([
      ["master.view", true],
      ["page.reports", true],
      ["page.roleManagement", false],
      ["review.sign", false],
    ]);
  });

  test("creates custom roles with explicitly selected permissions and a required audit record", async () => {
    const role = await rbac.createRole(superAdmin, request, {
      name: "Custom auditor",
      code: "CUSTOM_AUDITOR",
      description: "Read-only master data",
      permission_ids: [1],
    });
    expect(role).toMatchObject({ id: 30, code: "CUSTOM_AUDITOR", permission_ids: [1] });
    expect(mockClientQuery).toHaveBeenCalledWith(
      "INSERT INTO tbl_role_permissions (role_id, permission_id) VALUES ($1, $2)",
      [30, 1]
    );
    expect(mockCalls.some(({ sql }) => sql.includes("INSERT INTO tbl_audit_logs"))).toBe(true);
  });

  test("normalizes duplicate permission assignments before writing the join table", async () => {
    await rbac.createRole(superAdmin, request, {
      name: "Custom auditor",
      code: "CUSTOM_AUDITOR",
      permission_ids: [1, 1, "1"],
    });
    expect(mockClientQuery.mock.calls.filter(([sql]) => sql.includes("INSERT INTO tbl_role_permissions"))).toHaveLength(1);
  });

  test("rejects protected or clinical permissions for custom roles", async () => {
    await expect(rbac.createRole(superAdmin, request, {
      name: "Unsafe",
      code: "UNSAFE_ROLE",
      permission_ids: [2],
    })).rejects.toMatchObject({ status: 403, code: "PROTECTED_PERMISSION" });
    expect(mockCalls.some(({ sql }) => sql.includes("INSERT INTO mst_roles"))).toBe(false);
  });

  test("rejects protected page permissions for custom roles", async () => {
    await expect(rbac.createRole(superAdmin, request, {
      name: "Unsafe admin pages",
      code: "UNSAFE_PAGES",
      permission_ids: [4],
    })).rejects.toMatchObject({ status: 403, code: "PROTECTED_PERMISSION" });
  });

  test("allows permitted page permissions for custom roles", async () => {
    const role = await rbac.createRole(superAdmin, request, {
      name: "Reports viewer",
      code: "REPORTS_VIEWER",
      permission_ids: [3],
    });
    expect(role.permission_ids).toEqual([3]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      "INSERT INTO tbl_role_permissions (role_id, permission_id) VALUES ($1, $2)",
      [30, 3]
    );
  });

  test("audits previous and new permission values when a custom role matrix changes", async () => {
    const ids = await rbac.updateRolePermissions(superAdmin, request, 2, [1]);
    expect(ids).toEqual([1]);
    const auditCall = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_audit_logs"));
    const metadata = JSON.parse(auditCall[1][7]);
    expect(metadata.previous_permissions).toEqual(["master.view"]);
    expect(metadata.new_permissions).toEqual(["master.view"]);
  });

  test("blocks custom role changes to built-in roles", async () => {
    mockClientQuery.mockImplementation(async (sql, params = []) => {
      if (sql.includes("FROM mst_roles WHERE id = $1 FOR UPDATE")) {
        return { rows: [{ id: 4, code: "MEDICAL_OFFICER", name_en: "Medical Officer", is_active: true, is_system_role: null }] };
      }
      if (["BEGIN", "ROLLBACK"].includes(sql.trim())) return { rows: [] };
      return { rows: [] };
    });
    await expect(rbac.updateRoleStatus(superAdmin, request, 4, false))
      .rejects.toMatchObject({ status: 403, code: "SYSTEM_ROLE_PROTECTED" });
    expect(mockClientQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE mst_roles"))).toBe(false);
  });

  test("dashboard metrics and recent RBAC activities come from database queries", async () => {
    const result = await rbac.getRbacDashboard(superAdmin);
    expect(result.metrics).toEqual({
      total_users: 5,
      active_users: 3,
      inactive_users: 2,
      total_roles: 8,
      total_permissions: 28,
      custom_roles: 1,
    });
    expect(result.activities[0].event).toBe("ROLE_CHANGED");
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test("searches users by name/username with bounded pagination and does not select credentials", async () => {
    const result = await rbac.listRbacUsers(superAdmin, { search: "Ravi", page: 2, limit: 10 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, total_pages: 1 });
    expect(mockPoolQuery.mock.calls[1][0]).toContain("lower(u.full_name) LIKE $1 OR lower(u.username) LIKE $1");
    expect(mockPoolQuery.mock.calls[1][0]).not.toMatch(/password_hash|mfa_secret|email|phone/);
    expect(mockPoolQuery.mock.calls[1][1]).toEqual(["%ravi%", 10, 10]);
  });

  test("prevents self-lockout and removal of the last active Super Admin", async () => {
    await expect(rbac.updateUserRole(superAdmin, request, ACTOR_ID, 20))
      .rejects.toMatchObject({ status: 409, code: "SELF_ROLE_CHANGE" });

    mockTarget = baseUser({ role_id: 8, role_code: "SUPER_ADMIN", status: "ACTIVE" });
    mockActiveAdmins = 1;
    await expect(rbac.updateUserRole(superAdmin, request, USER_ID, 20))
      .rejects.toMatchObject({ status: 409, code: "LAST_SUPER_ADMIN" });
    expect(mockCalls.some(({ sql }) => sql.startsWith("UPDATE tbl_users"))).toBe(false);
  });

  test("requires target district and facility scope to match for scoped role assignment", async () => {
    mockNextRole = { id: 5, code: "MEDICAL_OFFICER", name_en: "Medical Officer", is_active: true };
    mockTarget = baseUser({ role_code: "CUSTOM_AUDITOR", facility_district_id: 2 });
    await expect(rbac.updateUserRole(superAdmin, request, USER_ID, 5))
      .rejects.toMatchObject({ status: 409, code: "ROLE_SCOPE_REQUIRED" });
    expect(mockCalls.some(({ sql }) => sql.startsWith("UPDATE tbl_users"))).toBe(false);
  });

  test("requires an existing active Mandal assignment for Medical Officer role assignment", async () => {
    mockNextRole = { id: 5, code: "MEDICAL_OFFICER", name_en: "Medical Officer", is_active: true };
    mockTarget = baseUser({ role_code: "CUSTOM_AUDITOR" });
    mockMandalAssignment = false;
    await expect(rbac.updateUserRole(superAdmin, request, USER_ID, 5))
      .rejects.toMatchObject({ status: 409, code: "ROLE_SCOPE_REQUIRED" });
  });

  test("requires an existing Health Worker village and facility assignment", async () => {
    mockNextRole = { id: 6, code: "HEALTH_WORKER", name_en: "Health Worker", is_active: true };
    mockTarget = baseUser({ role_code: "CUSTOM_AUDITOR" });
    mockHealthWorkerAssignment = false;
    await expect(rbac.updateUserRole(superAdmin, request, USER_ID, 6))
      .rejects.toMatchObject({ status: 409, code: "ROLE_SCOPE_REQUIRED" });
  });

  test("requires MFA to be enabled before assigning an MFA-protected role", async () => {
    mockNextRole = {
      id: 8,
      code: "SUPER_ADMIN",
      name_en: "Super administrator",
      is_active: true,
      mfa_required: true,
    };
    mockTarget = baseUser({ role_code: "CUSTOM_AUDITOR", mfa_enabled: false });
    await expect(rbac.updateUserRole(superAdmin, request, USER_ID, 8))
      .rejects.toMatchObject({ status: 409, code: "ROLE_MFA_REQUIRED" });
    expect(mockCalls.some(({ sql }) => sql.startsWith("UPDATE tbl_users"))).toBe(false);
  });

  test("serializes concurrent role writes and audits previous/new role and scope", async () => {
    const result = await rbac.updateUserRole(superAdmin, request, USER_ID, 20);
    expect(result).toMatchObject({ role_code: "CUSTOM_AUDITOR", district_id: 1, facility_id: 10 });
    expect(mockCalls.some(({ sql }) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(mockCalls.some(({ sql }) => sql.includes("FOR UPDATE OF u"))).toBe(true);
    const auditCall = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_audit_logs"));
    const metadata = JSON.parse(auditCall[1][7]);
    expect(metadata).toMatchObject({
      previous_role_code: "HEALTH_WORKER",
      new_role_code: "CUSTOM_AUDITOR",
      district_id: 1,
      facility_id: 10,
    });
  });
});
