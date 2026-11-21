const mockPool = { query: jest.fn() };

jest.mock("../../db", () => mockPool);
jest.mock("bcryptjs", () => ({ compare: jest.fn() }));
jest.mock("../../utils/jwt", () => ({
  generateAccessToken: jest.fn((user, sessionId) => `access-${user.role_name}-${sessionId}`),
  generateMfaToken: jest.fn((userId, stage) => `mfa-${userId}-${stage}`),
  verifyAccessToken: jest.fn(),
  verifyMfaToken: jest.fn(),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../services/sessionService", () => ({
  createSession: jest.fn(),
  rotateSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/secretBox", () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(() => "test-secret"),
}));
jest.mock("../../utils/totp", () => ({
  verifyCode: jest.fn(() => 12345),
}));
jest.mock("../helpers/unitConfig", () => ({
  getMfaEncryptionKey: jest.fn(() => Buffer.alloc(32, 1)),
  isProduction: false,
  jwtSecret: "test-secret",
  jwtExpiresIn: "15m",
  mfaTokenTtl: "5m",
  refreshTokenTtlHours: 12,
}));

const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const authController = require("../../controllers/authController");
const {
  authenticate,
  authenticateAllowPasswordChange,
  allowRoles,
  requirePermission,
} = require("../../middleware/authMiddleware");
const { SYSTEM_ADMIN_ROLES } = require("../../utils/authorizationPolicy");
const { getRolePermissions } = require("../../utils/permissions");
const sessions = require("../../services/sessionService");
const jwt = require("../../utils/jwt");

const ROLE_IDS = {
  HEALTH_WORKER: "1",
  SYSTEM_ADMIN: "7",
  SUPER_ADMIN: "8",
  DISTRICT_ADMIN: "6",
  MEDICAL_OFFICER: "4",
};

const ROLE_PERMISSIONS = {
  HEALTH_WORKER: ["patient.register"],
  SYSTEM_ADMIN: ["role.manage", "district_admin.manage", "master.manage"],
  // Simulate an incomplete persisted RBAC mapping; SUPER_ADMIN's immutable
  // platform capability is supplied by the effective-permission policy.
  SUPER_ADMIN: ["master.view", "master.manage", "registration.monitor"],
  DISTRICT_ADMIN: ["master.view", "registration.monitor", "registration.finalize"],
  MEDICAL_OFFICER: ["registration.monitor", "registration.recommend", "patient.register", "review.sign"],
};

function userFor(role) {
  return {
    id: `user-${role}`,
    username: role.toLowerCase(),
    password_hash: "password-hash",
    full_name: role,
    phone: null,
    email: null,
    designation: null,
    role_id: ROLE_IDS[role],
    role_name: role,
    role_display_name: role,
    status: "ACTIVE",
    failed_login_count: 0,
    locked_until: null,
    must_change_password: false,
    mfa_enabled: role === "SUPER_ADMIN" || role === "SYSTEM_ADMIN",
    mfa_secret_encrypted: "encrypted-secret",
    mfa_last_used_step: null,
    mfa_required: role === "SUPER_ADMIN" || role === "SYSTEM_ADMIN",
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.post("/auth/login", authController.login);
  app.post("/auth/mfa/verify", authController.mfaVerify);
  app.post("/auth/refresh", authController.refresh);
  app.get("/auth/me", authenticateAllowPasswordChange, authController.me);
  app.get(
    "/admin/roles",
    authenticate,
    allowRoles(...SYSTEM_ADMIN_ROLES),
    requirePermission("role.manage"),
    (_req, res) => res.json({ success: true })
  );
  app.get(
    "/locations",
    authenticate,
    requirePermission("master.import"),
    (_req, res) => res.json({ success: true })
  );
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ message: error.message, code: error.code });
  });
  return app;
}

const app = createApp();

function accessTokenFor(role) {
  return `access-${role}-session-${role}`;
}

function configureMocks() {
  mockPool.query.mockImplementation(async (sql, params = []) => {
    if (sql.includes("s.id = $2")) {
      const role = Object.keys(ROLE_IDS).find((candidate) => `user-${candidate}` === params[0]);
      return {
        rows: role
          ? [{ ...userFor(role), session_id: params[1], mfa_verified: true }]
          : [],
      };
    }

    if (sql.includes("lower(u.username) = lower($1)")) {
      const role = params[0]?.toUpperCase();
      return { rows: ROLE_IDS[role] ? [userFor(role)] : [] };
    }

    if (sql.includes("u.id = $1 AND u.deleted_at IS NULL")) {
      const role = Object.keys(ROLE_IDS).find((candidate) => `user-${candidate}` === params[0]);
      return { rows: role ? [userFor(role)] : [] };
    }

    return { rows: [] };
  });

  bcrypt.compare.mockResolvedValue(true);
  getRolePermissions.mockImplementation(async (roleId) => {
    const role = Object.keys(ROLE_IDS).find((candidate) => ROLE_IDS[candidate] === String(roleId));
    return ROLE_PERMISSIONS[role] || [];
  });
  sessions.createSession.mockImplementation(async (_req, { userId }) => ({
    sessionId: `session-${userId.replace("user-", "")}`,
    refreshToken: `refresh-${userId}`,
    expiresAt: new Date(Date.now() + 60_000),
  }));
  sessions.rotateSession.mockImplementation(async (token) => ({
    userId: token.replace("refresh-user-", "user-"),
    sessionId: token.replace("refresh-user-", "session-"),
    refreshToken: `next-${token}`,
    expiresAt: new Date(Date.now() + 60_000),
  }));
  jwt.verifyAccessToken.mockImplementation((token) => {
    const role = Object.keys(ROLE_IDS).find((candidate) => token.startsWith(`access-${candidate}-`));
    return role ? { sub: `user-${role}`, sid: `session-${role}` } : {};
  });
  jwt.verifyMfaToken.mockImplementation((token) => {
    const match = /^mfa-user-(.+)-verify$/.exec(token);
    return match ? { sub: `user-${match[1]}`, stage: "verify" } : {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  configureMocks();
});

async function loginWithMfa(role) {
  const login = await request(app)
    .post("/auth/login")
    .send({ username: role, password: "correct-password" });
  expect(login.status).toBe(200);
  expect(login.body.mfa_required).toBe(true);

  return request(app)
    .post("/auth/mfa/verify")
    .set("Authorization", `Bearer mfa-user-${role}-verify`)
    .send({ code: "123456" });
}

describe("effective permissions in authentication responses", () => {
  test("Medical Officers and District Admins receive only their two-stage registration permissions", async () => {
    const moLogin = await request(app)
      .post("/auth/login")
      .send({ username: "MEDICAL_OFFICER", password: "correct-password" });
    const districtAdminLogin = await request(app)
      .post("/auth/login")
      .send({ username: "DISTRICT_ADMIN", password: "correct-password" });

    expect(moLogin.status).toBe(200);
    expect(moLogin.body.user.permissions).toEqual(
      expect.arrayContaining(["registration.recommend"])
    );
    expect(moLogin.body.user.permissions).not.toContain("registration.verify");
    expect(districtAdminLogin.status).toBe(200);
    expect(districtAdminLogin.body.user.permissions).toEqual(
      expect.arrayContaining(["registration.monitor", "registration.finalize"])
    );
  });

  test("login, refresh, and /auth/me return identical SUPER_ADMIN permissions", async () => {
    const login = await loginWithMfa("SUPER_ADMIN");
    expect(login.status).toBe(200);

    const loginPermissions = login.body.user.permissions;
    expect(loginPermissions).toEqual(
      expect.arrayContaining(["role.manage", "district_admin.manage", "master.import"])
    );

    const refresh = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "ad_refresh=refresh-user-SUPER_ADMIN");
    expect(refresh.status).toBe(200);

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessTokenFor("SUPER_ADMIN")}`);
    expect(me.status).toBe(200);

    expect(refresh.body.user.permissions).toEqual(loginPermissions);
    expect(me.body.user.permissions).toEqual(loginPermissions);
  });
});

describe("admin access integration", () => {
  test.each(["SUPER_ADMIN", "SYSTEM_ADMIN"])(
    "%s can access protected System Administration routes after MFA",
    async (role) => {
      const login = await loginWithMfa(role);
      expect(login.status).toBe(200);

      const response = await request(app)
        .get("/admin/roles")
        .set("Authorization", `Bearer ${accessTokenFor(role)}`);
      expect(response.status).toBe(200);
    }
  );

  test("a non-admin role cannot access protected System Administration routes", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ username: "HEALTH_WORKER", password: "correct-password" });
    expect(login.status).toBe(200);

    const response = await request(app)
      .get("/admin/roles")
      .set("Authorization", `Bearer ${accessTokenFor("HEALTH_WORKER")}`);
    expect(response.status).toBe(403);
  });

  test("Location Import requires master.import and remains unavailable to SYSTEM_ADMIN", async () => {
    const superLogin = await loginWithMfa("SUPER_ADMIN");
    expect(superLogin.status).toBe(200);
    const allowed = await request(app)
      .get("/locations")
      .set("Authorization", `Bearer ${accessTokenFor("SUPER_ADMIN")}`);
    expect(allowed.status).toBe(200);

    const systemLogin = await loginWithMfa("SYSTEM_ADMIN");
    expect(systemLogin.status).toBe(200);
    const denied = await request(app)
      .get("/locations")
      .set("Authorization", `Bearer ${accessTokenFor("SYSTEM_ADMIN")}`);
    expect(denied.status).toBe(403);
  });

  test("MFA-required roles cannot access protected routes with an unverified session", async () => {
    mockPool.query.mockImplementation(async (sql, params = []) => {
      if (sql.includes("s.id = $2")) {
        return {
          rows: [{
            ...userFor("SUPER_ADMIN"),
            session_id: params[1],
            mfa_verified: false,
          }],
        };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .get("/admin/roles")
      .set("Authorization", `Bearer ${accessTokenFor("SUPER_ADMIN")}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("MFA_REQUIRED");
  });
});
