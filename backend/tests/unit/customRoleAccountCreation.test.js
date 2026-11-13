const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();

jest.mock("../../db", () => {
  const client = { query: (...args) => mockClientQuery(...args), release: jest.fn() };
  return {
    connect: jest.fn(async () => client),
    query: (...args) => mockPoolQuery(...args),
  };
});
jest.mock("../../utils/districtAuthorization", () => ({
  resolveAuthorizedDistrict: jest.fn(async () => 101),
}));
jest.mock("../../services/emailTransport", () => ({
  sendTemporaryCredentialsEmail: jest.fn(async () => ({
    success: true,
    status: "SENT",
    message: "Email sent",
  })),
}));
jest.mock("../../config/config", () => ({ frontendUrl: "http://localhost:3000" }));

const { resolveAuthorizedDistrict } = require("../../utils/districtAuthorization");
const { createStaff, listStaffOptions } = require("../../services/systemAdminService");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function mockCustomRoleCreate({ roleCode = "CUSTOM_AUDITOR", districtId = 101, facilityType = "PHC" } = {}) {
  mockClientQuery.mockImplementation(async (sql, params = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(String(sql).trim())) return { rows: [] };
    if (sql.includes("FROM mst_roles") && sql.includes("COALESCE(is_system_role, FALSE) = FALSE")) {
      return {
        rows: [{
          id: 40,
          code: roleCode,
          name_en: "Custom auditor",
          name_te: null,
          description: "Read-only reports access",
          mfa_required: false,
          is_system_role: false,
        }],
      };
    }
    if (sql.includes("FROM mst_roles") && sql.includes("is_active IS TRUE") && !sql.includes("is_system_role")) {
      return { rows: [] };
    }
    if (sql.includes("SELECT id FROM mst_districts")) return { rows: [{ id: districtId }] };
    if (sql.includes("SELECT id,facility_type FROM mst_facilities")) {
      return { rows: [{ id: Number(params[0]), facility_type: facilityType }] };
    }
    if (sql.includes("INSERT INTO tbl_users")) {
      return {
        rows: [{
          id: USER_ID,
          username: "customauditor.asha.1234",
          full_name: "Asha",
          email: "asha@example.test",
          phone: "9876543210",
          status: "PENDING_SETUP",
          district_id: districtId,
        }],
      };
    }
    if (sql.includes("INSERT INTO tbl_district_admin_setup_tokens")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    if (sql.includes("WHERE id = $1 AND deleted_at IS NULL")) {
      return { rows: [{ id: USER_ID, status: "PENDING_SETUP" }] };
    }
    if (sql.includes("SELECT id, expires_at")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCustomRoleCreate();
});

test("SYSTEM_ADMIN can create an account for an active custom role with district and facility", async () => {
  const actor = { id: ACTOR_ID, role_name: "SYSTEM_ADMIN" };
  const result = await createStaff(actor, { user: actor, ip: "127.0.0.1" }, "CUSTOM_AUDITOR", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    district_id: 101,
    facility_id: 6,
  });

  expect(result.user).toMatchObject({ id: USER_ID, status: "PENDING_SETUP", district_id: 101 });
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_user_facility_assignments"),
    [USER_ID, 6]
  );
  const auditCall = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_audit_logs"));
  expect(auditCall[1][2]).toBe("CUSTOM_ROLE_ACCOUNT_CREATED");
  expect(JSON.parse(auditCall[1][7])).toMatchObject({
    role_code: "CUSTOM_AUDITOR",
    created_by: ACTOR_ID,
    district_id: 101,
    facility_id: 6,
    is_custom_role: true,
  });
});

test("DISTRICT_ADMIN can create a custom-role account only in their authorized district", async () => {
  const actor = { id: ACTOR_ID, role_name: "DISTRICT_ADMIN" };
  const req = { user: actor, ip: "127.0.0.1" };
  const result = await createStaff(actor, req, "CUSTOM_AUDITOR", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    facility_id: 6,
  });

  expect(resolveAuthorizedDistrict).toHaveBeenCalledWith(req);
  expect(result.user.district_id).toBe(101);
  const insertCall = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_users"));
  expect(insertCall[1][6]).toBe(101);
});

test("DISTRICT_ADMIN cannot create SYSTEM_ADMIN or SUPER_ADMIN accounts", async () => {
  const actor = { id: ACTOR_ID, role_name: "DISTRICT_ADMIN" };
  await expect(createStaff(actor, { user: actor }, "SYSTEM_ADMIN", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    facility_id: 6,
  })).rejects.toMatchObject({ status: 403, code: "ROLE_NOT_ASSIGNABLE" });

  await expect(createStaff(actor, { user: actor }, "SUPER_ADMIN", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    facility_id: 6,
  })).rejects.toMatchObject({ status: 403, code: "ROLE_NOT_ASSIGNABLE" });

  expect(mockClientQuery).not.toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_users"),
    expect.anything()
  );
});

test("staff options expose active custom roles with permission summaries", async () => {
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("FROM mst_districts")) return { rows: [{ id: 101, name_en: "Example", name_te: null }] };
    if (sql.includes("FROM mst_facilities")) return { rows: [] };
    if (sql.includes("FROM mst_specialties")) return { rows: [] };
    if (sql.includes("FROM mst_mandals")) return { rows: [] };
    if (sql.includes("FROM mst_villages")) return { rows: [] };
    if (sql.includes("FROM mst_roles r") && sql.includes("COALESCE(r.is_system_role, FALSE) = FALSE")) {
      return {
        rows: [{
          id: 40,
          code: "CUSTOM_AUDITOR",
          name_en: "Custom auditor",
          name_te: null,
          description: "Read-only reports access",
        }],
      };
    }
    if (sql.includes("FROM tbl_role_permissions rp") && sql.includes("JOIN mst_permissions p")) {
      return {
        rows: [
          { role_id: 40, code: "master.view", resource: "master", action: "read", description: "View masters" },
          { role_id: 40, code: "page.reports", resource: "page", action: "access", description: "Open reports" },
        ],
      };
    }
    return { rows: [] };
  });

  const actor = { id: ACTOR_ID, role_name: "DISTRICT_ADMIN" };
  const options = await listStaffOptions(actor, { user: actor });
  expect(options.clinical_roles).toEqual(["MEDICAL_OFFICER", "SPECIALIST", "NAVIGATOR", "HOSPITAL_STAFF"]);
  expect(options.custom_roles).toHaveLength(1);
  expect(options.custom_roles[0]).toMatchObject({
    code: "CUSTOM_AUDITOR",
    description: "Read-only reports access",
  });
  expect(options.custom_roles[0].permissions).toEqual(["master.view", "page.reports"]);
});
