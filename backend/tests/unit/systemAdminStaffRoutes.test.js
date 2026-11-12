let mockSessionRow;

jest.mock("../../db", () => ({
  query: jest.fn(async (sql) => (
    sql.includes("JOIN tbl_user_sessions")
      ? { rows: mockSessionRow ? [mockSessionRow] : [] }
      : { rows: [] }
  )),
}));
jest.mock("../../utils/jwt", () => ({
  verifyAccessToken: jest.fn(() => ({ sub: "admin-1", sid: "session-1" })),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => ["user.create_staff"]),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/systemAdminService", () => ({
  createStaff: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const systemAdmin = require("../../services/systemAdminService");
const routes = require("../../routes/systemAdmin");
const errorMiddleware = require("../../middleware/errorMiddleware");

const app = express();
app.use(express.json());
app.use("/api/admin", routes);
app.use(errorMiddleware);

function session(roleName) {
  return {
    id: "admin-1",
    username: "admin.synthetic",
    full_name: "Synthetic Admin",
    role_id: 1,
    role_name: roleName,
    status: "ACTIVE",
    must_change_password: false,
    mfa_enabled: false,
    mfa_required: false,
    session_id: "session-1",
    mfa_verified: true,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionRow = session("SYSTEM_ADMIN");
  systemAdmin.createStaff.mockResolvedValue({
    user: { id: "staff-1", username: "hs.synthetic.1234", status: "PENDING_SETUP" },
    delivery_status: { email: { status: "SENT" } },
  });
});

test("System Admin can create a Hospital Staff account through the authenticated admin API", async () => {
  const response = await request(app)
    .post("/api/admin/staff/HOSPITAL_STAFF")
    .set("Authorization", "Bearer synthetic-token")
    .send({ full_name: "Synthetic Hospital Staff", facility_id: 8, district_id: 101 });

  expect(response.status).toBe(201);
  expect(response.body.staff.username).toBe("hs.synthetic.1234");
  expect(systemAdmin.createStaff).toHaveBeenCalledWith(
    expect.objectContaining({ role_name: "SYSTEM_ADMIN" }),
    expect.anything(),
    "HOSPITAL_STAFF",
    expect.objectContaining({ facility_id: 8 })
  );
});

test("Hospital Staff cannot use the admin account-creation API", async () => {
  mockSessionRow = session("HOSPITAL_STAFF");
  const response = await request(app)
    .post("/api/admin/staff/HOSPITAL_STAFF")
    .set("Authorization", "Bearer synthetic-token")
    .send({ full_name: "Synthetic Hospital Staff", facility_id: 8, district_id: 101 });

  expect(response.status).toBe(403);
  expect(systemAdmin.createStaff).not.toHaveBeenCalled();
});

test("account creation requires authentication", async () => {
  const response = await request(app)
    .post("/api/admin/staff/HOSPITAL_STAFF")
    .send({ full_name: "Synthetic Hospital Staff", facility_id: 8, district_id: 101 });

  expect(response.status).toBe(401);
  expect(systemAdmin.createStaff).not.toHaveBeenCalled();
});
