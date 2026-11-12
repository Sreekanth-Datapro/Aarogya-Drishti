const mockPoolQuery = jest.fn();
const mockCreateSession = jest.fn();
let mockDistrictAdmin = {};

jest.mock("../../db", () => ({ query: (...args) => mockPoolQuery(...args) }));
jest.mock("bcryptjs", () => ({ compare: jest.fn(async () => true) }));
jest.mock("qrcode", () => ({ toDataURL: jest.fn(async () => "data:image/png;base64,test") }));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/passwordPolicy", () => ({ checkPassword: jest.fn(() => null) }));
jest.mock("../../utils/secretBox", () => ({
  encrypt: jest.fn(() => "encrypted-mfa-secret"),
  decrypt: jest.fn(() => "district-admin-mfa-secret"),
}));
jest.mock("../../utils/totp", () => ({
  generateSecret: jest.fn(() => "district-admin-mfa-secret"),
  otpauthUrl: jest.fn(() => "otpauth://test"),
  verifyCode: jest.fn(() => 12345),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => ["district_admin.manage"]),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/cookies", () => ({
  readRefreshCookie: jest.fn(),
  setRefreshCookie: jest.fn(),
  clearRefreshCookie: jest.fn(),
}));
jest.mock("../../utils/jwt", () => ({
  generateAccessToken: jest.fn(() => "district-admin-access-token"),
  generateMfaToken: jest.fn((_id, stage) => `district-admin-${stage}-token`),
  verifyAccessToken: jest.fn(),
  verifyMfaToken: jest.fn((token) => ({
    sub: "district-admin-1",
    stage: token === "district-admin-enroll-token" ? "enroll" : "verify",
  })),
}));
jest.mock("../../services/sessionService", () => ({
  createSession: (...args) => mockCreateSession(...args),
  rotateSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
}));
jest.mock("../helpers/unitConfig", () => ({
  getMfaEncryptionKey: () => Buffer.alloc(32, 1),
  getSetupTokenEncryptionKey: () => Buffer.alloc(32, 2),
  isProduction: false,
  jwtSecret: "test-secret",
  jwtExpiresIn: "15m",
  mfaTokenTtl: "5m",
  refreshTokenTtlHours: 12,
}));

const express = require("express");
const request = require("supertest");
const authController = require("../../controllers/authController");

function districtAdmin() {
  return {
    id: "district-admin-1",
    username: "district.admin",
    password_hash: "password-hash",
    full_name: "District Admin",
    phone: null,
    email: null,
    designation: null,
    role_id: 6,
    role_name: "DISTRICT_ADMIN",
    role_display_name: "District Admin",
    status: mockDistrictAdmin.status,
    failed_login_count: 0,
    locked_until: null,
    must_change_password: mockDistrictAdmin.mustChangePassword,
    mfa_enabled: mockDistrictAdmin.mfaEnabled,
    mfa_secret_encrypted: "encrypted-mfa-secret",
    mfa_last_used_step: null,
    mfa_required: true,
  };
}

const app = express();
app.use(express.json());
app.post("/auth/login", authController.login);
app.post("/auth/mfa/setup", authController.mfaSetup);
app.post("/auth/mfa/enable", authController.mfaEnable);
app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ message: error.message, code: error.code });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDistrictAdmin = {
    status: "PENDING_SETUP",
    mustChangePassword: true,
    mfaEnabled: false,
  };
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("lower(u.username) = lower($1)")) {
      return { rows: [districtAdmin()] };
    }
    if (sql.includes("u.id = $1 AND u.deleted_at IS NULL")) {
      return { rows: [districtAdmin()] };
    }
    if (sql.includes("SET mfa_enabled = TRUE")) {
      if (mockDistrictAdmin.status !== "PENDING_SETUP" || mockDistrictAdmin.mustChangePassword) {
        return { rows: [] };
      }
      mockDistrictAdmin.status = "ACTIVE";
      mockDistrictAdmin.mfaEnabled = true;
      return { rows: [{ status: "ACTIVE" }] };
    }
    return { rows: [] };
  });
  mockCreateSession.mockResolvedValue({
    sessionId: "district-admin-session",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() + 60_000),
  });
});

test("keeps a District Admin pending after password set until successful MFA enrollment", async () => {
  // Before the password is changed only a valid temporary password is accepted;
  // this account has no open temporary-password row, so it counts as expired.
  const beforePasswordSetup = await request(app)
    .post("/auth/login")
    .send({ username: "district.admin", password: "password" });
  expect(beforePasswordSetup.status).toBe(401);
  expect(beforePasswordSetup.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  expect(mockCreateSession).not.toHaveBeenCalled();

  mockDistrictAdmin.mustChangePassword = false;
  const login = await request(app)
    .post("/auth/login")
    .send({ username: "district.admin", password: "password" });
  expect(login.status).toBe(200);
  expect(login.body.mfa_setup_required).toBe(true);
  expect(mockDistrictAdmin.status).toBe("PENDING_SETUP");

  const setup = await request(app)
    .post("/auth/mfa/setup")
    .set("Authorization", "Bearer district-admin-enroll-token");
  expect(setup.status).toBe(200);
  expect(mockDistrictAdmin.status).toBe("PENDING_SETUP");

  const activation = await request(app)
    .post("/auth/mfa/enable")
    .set("Authorization", "Bearer district-admin-enroll-token")
    .send({ code: "123456" });
  expect(activation.status).toBe(200);
  expect(activation.body.user.mfa_enabled).toBe(true);
  expect(mockDistrictAdmin.status).toBe("ACTIVE");
  expect(mockDistrictAdmin.mfaEnabled).toBe(true);
  expect(mockPoolQuery.mock.calls.some(([sql]) =>
    sql.includes("status = CASE WHEN status = 'PENDING_SETUP' THEN 'ACTIVE' ELSE status END")
  )).toBe(true);
});
