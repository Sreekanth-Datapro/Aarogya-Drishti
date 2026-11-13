let mockRole = "SUPER_ADMIN";
let mockVerifyAccessToken;
let mockPoolQuery;

jest.mock("../../db", () => ({
  query: (...args) => mockPoolQuery(...args),
}));
jest.mock("../../utils/jwt", () => ({
  verifyAccessToken: (...args) => mockVerifyAccessToken(...args),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => []),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => {}),
}));
jest.mock("../../services/systemAdminService", () => ({
  getRbacDashboard: jest.fn(async () => ({ metrics: { total_users: 3 }, activities: [] })),
  listRbacUsers: jest.fn(async () => ({ users: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } })),
  updateUserRole: jest.fn(async () => ({ role_code: "CUSTOM_AUDITOR" })),
  listRoles: jest.fn(async () => []),
  listAssignablePermissions: jest.fn(async () => []),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  updateRolePermissions: jest.fn(),
  updateRoleStatus: jest.fn(),
  listRoleUsers: jest.fn(),
  listDistrictAdmins: jest.fn(),
  listDistricts: jest.fn(),
  createDistrictAdmin: jest.fn(),
  mapDistrictAdmin: jest.fn(),
  reissueDistrictAdminSetup: jest.fn(),
  retryDistrictAdminSetupDelivery: jest.fn(),
  listStaff: jest.fn(),
  listStaffOptions: jest.fn(),
  listHealthWorkers: jest.fn(),
  getHealthWorkerAssignments: jest.fn(),
  updateHealthWorkerAssignments: jest.fn(),
  createStaff: jest.fn(),
  getStaff: jest.fn(),
  updateStaff: jest.fn(),
  setStaffStatus: jest.fn(),
  resendStaffCredentials: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const routes = require("../../routes/systemAdmin");
const systemAdmin = require("../../services/systemAdminService");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", routes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ success: false, code: error.code, message: error.message });
  });
  return app;
}

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "SUPER_ADMIN";
  mockVerifyAccessToken = jest.fn(() => ({ sub: "admin-1", sid: "session-1" }));
  mockPoolQuery = jest.fn(async () => ({
    rows: [{
      id: "admin-1",
      username: "admin",
      full_name: "Super Admin",
      role_id: 8,
      district_id: null,
      status: "ACTIVE",
      must_change_password: false,
      mfa_enabled: false,
      role_name: mockRole,
      role_display_name: mockRole,
      mfa_required: false,
      session_id: "session-1",
      mfa_verified: true,
    }],
  }));
});

test("unauthenticated RBAC requests return 401", async () => {
  const response = await request(app).get("/api/admin/rbac/dashboard");
  expect(response.status).toBe(401);
  expect(systemAdmin.getRbacDashboard).not.toHaveBeenCalled();
});

test("SYSTEM_ADMIN can access Role Management RBAC APIs", async () => {
  mockRole = "SYSTEM_ADMIN";
  const response = await request(app)
    .get("/api/admin/rbac/dashboard")
    .set("Authorization", "Bearer valid");
  expect(response.status).toBe(200);
  expect(systemAdmin.getRbacDashboard).toHaveBeenCalledWith(
    expect.objectContaining({ id: "admin-1", role_name: "SYSTEM_ADMIN" })
  );
});

test("SYSTEM_ADMIN can create roles and assign user roles via RBAC routes", async () => {
  mockRole = "SYSTEM_ADMIN";
  systemAdmin.createRole.mockResolvedValue({ id: 40, code: "CUSTOM_VIEWER" });
  systemAdmin.updateUserRole.mockResolvedValue({ role_code: "CUSTOM_VIEWER" });

  const createResponse = await request(app)
    .post("/api/admin/roles")
    .set("Authorization", "Bearer valid")
    .send({ name: "Custom viewer", code: "CUSTOM_VIEWER", permission_ids: [] });
  expect(createResponse.status).toBe(200);
  expect(systemAdmin.createRole).toHaveBeenCalledWith(
    expect.objectContaining({ role_name: "SYSTEM_ADMIN" }),
    expect.any(Object),
    expect.objectContaining({ code: "CUSTOM_VIEWER" })
  );

  const assignResponse = await request(app)
    .patch("/api/admin/users/22222222-2222-4222-8222-222222222222/role")
    .set("Authorization", "Bearer valid")
    .send({ role_id: 40 });
  expect(assignResponse.status).toBe(200);
  expect(systemAdmin.updateUserRole).toHaveBeenCalledWith(
    expect.objectContaining({ role_name: "SYSTEM_ADMIN" }),
    expect.any(Object),
    "22222222-2222-4222-8222-222222222222",
    40
  );
});

test("SYSTEM_ADMIN cannot access Super-Admin-only district admin APIs", async () => {
  mockRole = "SYSTEM_ADMIN";
  const response = await request(app)
    .get("/api/admin/district-admins")
    .set("Authorization", "Bearer valid");
  expect(response.status).toBe(403);
  expect(systemAdmin.listDistrictAdmins).not.toHaveBeenCalled();
});

test("SUPER_ADMIN can read database-backed RBAC dashboard data", async () => {
  const response = await request(app)
    .get("/api/admin/rbac/dashboard")
    .set("Authorization", "Bearer valid");
  expect(response.status).toBe(200);
  expect(response.body.metrics.total_users).toBe(3);
  expect(systemAdmin.getRbacDashboard).toHaveBeenCalledWith(
    expect.objectContaining({ id: "admin-1", role_name: "SUPER_ADMIN" })
  );
});

test("user search query and role assignment payload are validated", async () => {
  const invalidSearch = await request(app)
    .get("/api/admin/users?page=0")
    .set("Authorization", "Bearer valid");
  expect(invalidSearch.status).toBe(400);

  const invalidRole = await request(app)
    .patch("/api/admin/users/22222222-2222-4222-8222-222222222222/role")
    .set("Authorization", "Bearer valid")
    .send({ role_id: -1 });
  expect(invalidRole.status).toBe(400);
  expect(systemAdmin.updateUserRole).not.toHaveBeenCalled();
});

test("valid role-assignment API request delegates through Super Admin authorization", async () => {
  const response = await request(app)
    .patch("/api/admin/users/22222222-2222-4222-8222-222222222222/role")
    .set("Authorization", "Bearer valid")
    .send({ role_id: 12 });
  expect(response.status).toBe(200);
  expect(systemAdmin.updateUserRole).toHaveBeenCalledWith(
    expect.objectContaining({ role_name: "SUPER_ADMIN" }),
    expect.objectContaining({ user: expect.any(Object) }),
    "22222222-2222-4222-8222-222222222222",
    12
  );
});
