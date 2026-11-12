const mockClientQuery = jest.fn();

jest.mock("../../db", () => {
  const client = { query: mockClientQuery, release: jest.fn() };
  return {
    connect: jest.fn(async () => client),
    query: jest.fn(),
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
const { createStaff } = require("../../services/systemAdminService");

const actor = { id: "22222222-2222-4222-8222-222222222222", role_name: "DISTRICT_ADMIN" };
const req = { user: actor, ip: "127.0.0.1" };
const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql.includes("SELECT id FROM mst_districts")) return { rows: [{ id: 101 }] };
    if (sql.includes("SELECT id,mfa_required FROM mst_roles")) return { rows: [{ id: 3, mfa_required: false }] };
    if (sql.includes("SELECT id,facility_type FROM mst_facilities")) return { rows: [{ id: 6, facility_type: "PHC" }] };
    if (sql.includes("SELECT id FROM mst_mandals")) return { rows: [{ id: 102 }] };
    if (sql.includes("INSERT INTO tbl_users")) {
      return { rows: [{ id: userId, username: "mo.asha.1234", full_name: "Asha", email: "asha@example.test", phone: "9876543210", status: "PENDING_SETUP" }] };
    }
    if (sql.includes("INSERT INTO tbl_district_admin_setup_tokens")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    if (sql.includes("WHERE id = $1 AND deleted_at IS NULL")) {
      return { rows: [{ id: userId, status: "PENDING_SETUP" }] };
    }
    if (sql.includes("SELECT id, expires_at")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    return { rows: [] };
  });
});

test("District Admin staff creation uses the authenticated district when district_id is omitted", async () => {
  const result = await createStaff(actor, req, "MEDICAL_OFFICER", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    facility_id: 6,
    mandal_ids: [102],
  });

  expect(resolveAuthorizedDistrict).toHaveBeenCalledWith(req);
  const insertCall = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_users"));
  expect(insertCall[1][6]).toBe(101);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_medical_officer_mandal_assignments"),
    [userId, 102, actor.id]
  );
  expect(result.user.id).toBe(userId);
});

test("System Admin can create a Hospital Staff account at an active hospital", async () => {
  const systemAdmin = { id: actor.id, role_name: "SYSTEM_ADMIN" };
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql.includes("SELECT id FROM mst_districts")) return { rows: [{ id: 101 }] };
    if (sql.includes("SELECT id,mfa_required FROM mst_roles")) return { rows: [{ id: 4, mfa_required: false }] };
    if (sql.includes("SELECT id,facility_type FROM mst_facilities")) return { rows: [{ id: 8, facility_type: "HOSPITAL" }] };
    if (sql.includes("INSERT INTO tbl_users")) {
      return { rows: [{
        id: userId, username: "hs.asha.1234", full_name: "Asha", email: "asha@example.test",
        phone: "9876543210", status: "PENDING_SETUP", district_id: 101,
      }] };
    }
    if (sql.includes("INSERT INTO tbl_district_admin_setup_tokens")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    if (sql.includes("WHERE id = $1 AND deleted_at IS NULL")) return { rows: [{ id: userId, status: "PENDING_SETUP" }] };
    if (sql.includes("SELECT id, expires_at")) {
      return { rows: [{ id: "setup-token", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
    }
    return { rows: [] };
  });

  const result = await createStaff(systemAdmin, { user: systemAdmin }, "HOSPITAL_STAFF", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    district_id: 101,
    facility_id: 8,
  });

  expect(result.user).toMatchObject({ id: userId, username: "hs.asha.1234", status: "PENDING_SETUP" });
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_user_facility_assignments"),
    [userId, 8]
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("SELECT id,mfa_required FROM mst_roles"),
    ["HOSPITAL_STAFF"]
  );
});

test("Hospital Staff cannot be created at a non-hospital facility", async () => {
  mockClientQuery.mockClear();
  const systemAdmin = { id: actor.id, role_name: "SYSTEM_ADMIN" };
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql.includes("SELECT id FROM mst_districts")) return { rows: [{ id: 101 }] };
    if (sql.includes("SELECT id,mfa_required FROM mst_roles")) return { rows: [{ id: 4, mfa_required: false }] };
    if (sql.includes("SELECT id,facility_type FROM mst_facilities")) return { rows: [{ id: 6, facility_type: "PHC" }] };
    return { rows: [] };
  });

  await expect(createStaff(systemAdmin, { user: systemAdmin }, "HOSPITAL_STAFF", {
    full_name: "Asha",
    email: "asha@example.test",
    phone: "9876543210",
    district_id: 101,
    facility_id: 6,
  })).rejects.toMatchObject({ status: 400, code: "INVALID_HOSPITAL_FACILITY" });
  expect(mockClientQuery).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO tbl_users"), expect.anything());
});
