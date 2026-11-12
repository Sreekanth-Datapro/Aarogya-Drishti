// Protected APIs (e.g. the dashboard) need an ACTIVE account, a finished password
// change and, for MFA roles, an MFA-verified session.

let mockSessionRow;

jest.mock("../../db", () => ({
  query: jest.fn(async () => ({ rows: mockSessionRow ? [mockSessionRow] : [] })),
}));
jest.mock("../../utils/jwt", () => ({
  verifyAccessToken: jest.fn(() => ({ sub: "district-admin-1", sid: "session-1" })),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => ["dashboard.view_aggregate"]),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));

const express = require("express");
const request = require("supertest");
const { authenticate } = require("../../middleware/authMiddleware");

const app = express();
app.get("/api/dashboard/summary", authenticate, (_req, res) => res.json({ success: true }));

const callDashboard = () => request(app).get("/api/dashboard/summary").set("Authorization", "Bearer access-token");

function districtAdminSession(changes) {
  return {
    id: "district-admin-1",
    username: "da.ravi.4821",
    full_name: "Ravi",
    role_id: 6,
    role_name: "DISTRICT_ADMIN",
    role_display_name: "District administrator",
    status: "ACTIVE",
    must_change_password: false,
    mfa_enabled: true,
    mfa_required: true,
    session_id: "session-1",
    mfa_verified: true,
    ...changes,
  };
}

test("an account that is still PENDING_SETUP cannot open the dashboard", async () => {
  mockSessionRow = districtAdminSession({ status: "PENDING_SETUP", mfa_enabled: false, mfa_verified: false });
  const response = await callDashboard();
  expect(response.status).toBe(401);
  expect(response.body.code).toBe("ACCOUNT_UNAVAILABLE");
});

test("a pending password change blocks the dashboard", async () => {
  mockSessionRow = districtAdminSession({ must_change_password: true });
  const response = await callDashboard();
  expect(response.status).toBe(403);
  expect(response.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
});

test("a session without MFA verification cannot open the dashboard", async () => {
  mockSessionRow = districtAdminSession({ mfa_verified: false });
  const response = await callDashboard();
  expect(response.status).toBe(401);
  expect(response.body.code).toBe("MFA_REQUIRED");
});

test("an activated, MFA-verified District Admin can open the dashboard", async () => {
  mockSessionRow = districtAdminSession({});
  const response = await callDashboard();
  expect(response.status).toBe(200);
});
