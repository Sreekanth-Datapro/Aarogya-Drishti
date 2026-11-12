// First sign-in of a District Admin created by a Super Admin:
// temporary password -> forced password change -> MFA enrollment -> ACTIVE.
// The database is replaced by a small in-memory copy of the rows involved.

let mockState;

function mockFindUser(predicate) {
  return Object.values(mockState.users).find(predicate);
}

function mockUserRow(user) {
  return {
    id: user.id,
    username: user.username,
    password_hash: user.password_hash,
    full_name: user.full_name,
    phone: null,
    email: null,
    designation: null,
    role_id: user.role_id,
    role_name: user.role_name,
    role_display_name: user.role_name,
    status: user.status,
    failed_login_count: user.failed_login_count,
    locked_until: null,
    must_change_password: user.must_change_password,
    mfa_enabled: user.mfa_enabled,
    mfa_secret_encrypted: user.mfa_secret_encrypted,
    mfa_last_used_step: null,
    mfa_required: user.role_name !== "HOSPITAL_STAFF",
  };
}

function mockOpenToken(userId) {
  return mockState.tokens.find((token) =>
    token.user_id === userId && !token.used_at && !token.revoked_at && token.expires_at > Date.now()
  );
}

async function mockQuery(sql, params = []) {
  const statement = sql.trim();
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) return { rows: [] };

  if (statement.includes("lower(u.username) = lower($1)")) {
    const user = mockFindUser((item) => item.username === String(params[0]).toLowerCase());
    return { rows: user ? [mockUserRow(user)] : [] };
  }
  if (statement.includes("WHERE u.id = $1 AND u.deleted_at IS NULL")) {
    const user = mockState.users[params[0]];
    return { rows: user ? [mockUserRow(user)] : [] };
  }
  if (statement.includes("FROM tbl_district_admin_setup_tokens") && statement.includes("expires_at > now()")) {
    const token = mockOpenToken(params[0]);
    return { rows: token ? [{ id: token.id }] : [] };
  }
  if (statement.startsWith("UPDATE tbl_district_admin_setup_tokens SET used_at")) {
    mockState.tokens.find((token) => token.id === params[0]).used_at = Date.now();
    return { rows: [] };
  }
  if (statement.includes("SET failed_login_count = $1")) {
    mockState.users[params[2]].failed_login_count = params[0];
    return { rows: [] };
  }
  if (statement.includes("SET password_hash = $1") && statement.includes("RETURNING id")) {
    const user = mockState.users[params[1]];
    if (user.status !== "PENDING_SETUP" || !user.must_change_password) return { rows: [] };
    user.password_hash = params[0];
    user.must_change_password = false;
    return { rows: [{ id: user.id }] };
  }
  if (statement.includes("SET status = 'ACTIVE'") && statement.includes("RETURNING status")) {
    const user = mockState.users[params[0]];
    if (user.status !== "PENDING_SETUP") return { rows: [] };
    user.status = "ACTIVE";
    return { rows: [{ status: "ACTIVE" }] };
  }
  if (statement.includes("SET mfa_secret_encrypted")) {
    mockState.users[params[1]].mfa_secret_encrypted = params[0];
    return { rows: [] };
  }
  if (statement.includes("SET mfa_enabled = TRUE")) {
    const user = mockState.users[params[1]];
    if (user.mfa_enabled || user.must_change_password || !["ACTIVE", "PENDING_SETUP"].includes(user.status)) {
      return { rows: [] };
    }
    user.mfa_enabled = true;
    user.status = "ACTIVE";
    return { rows: [{ status: "ACTIVE" }] };
  }
  if (statement.startsWith("UPDATE tbl_users")) return { rows: [] };
  throw new Error(`Unexpected mocked SQL: ${statement}`);
}

const mockCreateSession = jest.fn();
const mockRevokeAllSessions = jest.fn();

jest.mock("../../db", () => ({
  query: (...args) => mockQuery(...args),
  connect: async () => ({ query: (...args) => mockQuery(...args), release: () => {} }),
}));
jest.mock("bcryptjs", () => ({
  compare: jest.fn(async (password, hash) => hash === `hash:${password}`),
  hash: jest.fn(async (password) => `hash:${password}`),
}));
jest.mock("qrcode", () => ({ toDataURL: jest.fn(async () => "data:image/png;base64,test") }));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/secretBox", () => ({
  encrypt: jest.fn(() => "encrypted-mfa-secret"),
  decrypt: jest.fn(() => "mfa-secret"),
}));
jest.mock("../../utils/totp", () => ({
  generateSecret: jest.fn(() => "mfa-secret"),
  otpauthUrl: jest.fn(() => "otpauth://test"),
  verifyCode: jest.fn((_secret, code) => (code === "123456" ? 777 : null)),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => ["master.view"]),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/cookies", () => ({
  readRefreshCookie: jest.fn(),
  setRefreshCookie: jest.fn(),
  clearRefreshCookie: jest.fn(),
}));
jest.mock("../../utils/jwt", () => ({
  generateAccessToken: jest.fn((user) => `access:${user.id}`),
  generateMfaToken: jest.fn((id, stage) => `${stage}:${id}`),
  verifyAccessToken: jest.fn(),
  verifyMfaToken: jest.fn((token) => {
    const [stage, sub] = token.split(":");
    return { stage, sub };
  }),
}));
jest.mock("../../services/sessionService", () => ({
  createSession: (...args) => mockCreateSession(...args),
  rotateSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: (...args) => mockRevokeAllSessions(...args),
}));
jest.mock("../helpers/unitConfig", () => ({
  getMfaEncryptionKey: () => Buffer.alloc(32, 1),
  isProduction: false,
}));

const express = require("express");
const request = require("supertest");
const authController = require("../../controllers/authController");

const TEMPORARY_PASSWORD = "Tmp#Pass7xQ2kR";
const NEW_PASSWORD = "MyNewPassword2026";
const DA = "district-admin-1";
const SUPER = "super-admin-1";

const app = express();
app.use(express.json());
app.post("/auth/login", authController.login);
app.post("/auth/temporary-password/change", authController.changeTemporaryPassword);
app.post("/auth/mfa/setup", authController.mfaSetup);
app.post("/auth/mfa/enable", authController.mfaEnable);
app.post("/auth/mfa/verify", authController.mfaVerify);
app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ message: error.message, code: error.code });
});

const login = (username, password) => request(app).post("/auth/login").send({ username, password });
const withToken = (path, token) => request(app).post(path).set("Authorization", `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    users: {
      [DA]: {
        id: DA, username: "da.ravi.4821", full_name: "Ravi", role_id: 6, role_name: "DISTRICT_ADMIN",
        status: "PENDING_SETUP", must_change_password: true, mfa_enabled: false,
        mfa_secret_encrypted: null, failed_login_count: 0, password_hash: `hash:${TEMPORARY_PASSWORD}`,
      },
      [SUPER]: {
        id: SUPER, username: "superadmin", full_name: "Super", role_id: 1, role_name: "SUPER_ADMIN",
        status: "ACTIVE", must_change_password: false, mfa_enabled: true,
        mfa_secret_encrypted: "encrypted-mfa-secret", failed_login_count: 0, password_hash: "hash:SuperSecret2026",
      },
      "hospital-staff-1": {
        id: "hospital-staff-1", username: "hs.synthetic.1234", full_name: "Synthetic Staff",
        role_id: 9, role_name: "HOSPITAL_STAFF", status: "PENDING_SETUP",
        must_change_password: true, mfa_enabled: false, mfa_secret_encrypted: null,
        failed_login_count: 0, password_hash: `hash:${TEMPORARY_PASSWORD}`,
      },
    },
    tokens: [
      { id: "credentials-1", user_id: DA, expires_at: Date.now() + 24 * 60 * 60 * 1000, used_at: null, revoked_at: null },
      { id: "credentials-2", user_id: "hospital-staff-1", expires_at: Date.now() + 24 * 60 * 60 * 1000, used_at: null, revoked_at: null },
    ],
  };
  mockCreateSession.mockResolvedValue({
    sessionId: "session-1",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() + 60_000),
  });
});

test("temporary password login only allows a password change (no session, no access token)", async () => {
  const response = await login("da.ravi.4821", TEMPORARY_PASSWORD);

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    password_change_required: true,
    password_change_token: `password:${DA}`,
  });
  expect(response.body.accessToken).toBeUndefined();
  expect(response.body.mfa_token).toBeUndefined();
  expect(mockCreateSession).not.toHaveBeenCalled();
});

test("Hospital Staff temporary credentials lead to password change and activate the account", async () => {
  const loginResponse = await login("hs.synthetic.1234", TEMPORARY_PASSWORD);
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body).toMatchObject({
    password_change_required: true,
    password_change_token: "password:hospital-staff-1",
  });

  const changeResponse = await withToken(
    "/auth/temporary-password/change",
    "password:hospital-staff-1"
  ).send({ new_password: NEW_PASSWORD });

  expect(changeResponse.status).toBe(200);
  expect(changeResponse.body).toMatchObject({
    accessToken: "access:hospital-staff-1",
    user: { role: "HOSPITAL_STAFF", must_change_password: false },
  });
  expect(mockState.users["hospital-staff-1"].status).toBe("ACTIVE");
});

test("an expired temporary password is rejected", async () => {
  mockState.tokens[0].expires_at = Date.now() - 1000;
  const response = await login("da.ravi.4821", TEMPORARY_PASSWORD);

  expect(response.status).toBe(401);
  expect(response.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  expect(mockCreateSession).not.toHaveBeenCalled();
});

test("a wrong password is rejected and counted as a failed attempt", async () => {
  const response = await login("da.ravi.4821", "Wrong-Password-1");

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Invalid username or password");
  expect(mockState.users[DA].failed_login_count).toBe(1);
});

test("MFA enrollment is refused until the temporary password has been changed", async () => {
  const setup = await withToken("/auth/mfa/setup", `enroll:${DA}`);
  expect(setup.status).toBe(403);
  expect(setup.body.code).toBe("ACCOUNT_INACTIVE");

  const enable = await withToken("/auth/mfa/enable", `enroll:${DA}`).send({ code: "123456" });
  expect(enable.status).toBe(403);
  expect(mockState.users[DA].status).toBe("PENDING_SETUP");
});

test("the new password must follow the password policy and differ from the temporary one", async () => {
  const weak = await withToken("/auth/temporary-password/change", `password:${DA}`).send({ new_password: "short" });
  expect(weak.status).toBe(400);
  expect(weak.body.code).toBe("PASSWORD_POLICY");

  const same = await withToken("/auth/temporary-password/change", `password:${DA}`).send({ new_password: TEMPORARY_PASSWORD });
  expect(same.status).toBe(400);
  expect(same.body.code).toBe("PASSWORD_REUSED");
  expect(mockState.users[DA].must_change_password).toBe(true);
});

test("an expired temporary password cannot be changed either", async () => {
  mockState.tokens[0].expires_at = Date.now() - 1000;
  const response = await withToken("/auth/temporary-password/change", `password:${DA}`).send({ new_password: NEW_PASSWORD });

  expect(response.status).toBe(401);
  expect(response.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  expect(mockState.users[DA].password_hash).toBe(`hash:${TEMPORARY_PASSWORD}`);
});

test("full first sign-in: change password, old password stops working, MFA activates the account", async () => {
  // 1. temporary password -> password-change step
  const first = await login("da.ravi.4821", TEMPORARY_PASSWORD);
  const changed = await withToken("/auth/temporary-password/change", first.body.password_change_token)
    .send({ new_password: NEW_PASSWORD });

  expect(changed.status).toBe(200);
  expect(changed.body).toMatchObject({ mfa_setup_required: true, mfa_token: `enroll:${DA}` });
  expect(changed.body.accessToken).toBeUndefined();
  expect(mockState.users[DA]).toMatchObject({ must_change_password: false, status: "PENDING_SETUP" });
  expect(mockState.users[DA].password_hash).toBe(`hash:${NEW_PASSWORD}`);
  expect(mockState.tokens[0].used_at).not.toBeNull();
  expect(mockRevokeAllSessions).toHaveBeenCalledWith(DA, "PASSWORD_CHANGED", {}, expect.anything());

  // 2. the temporary password and the used password-change token no longer work
  const oldPassword = await login("da.ravi.4821", TEMPORARY_PASSWORD);
  expect(oldPassword.status).toBe(401);
  const reusedToken = await withToken("/auth/temporary-password/change", first.body.password_change_token)
    .send({ new_password: "AnotherPassword99" });
  expect(reusedToken.status).toBe(403);

  // 3. the new password leads to MFA enrollment, still without a session
  const second = await login("da.ravi.4821", NEW_PASSWORD);
  expect(second.status).toBe(200);
  expect(second.body).toMatchObject({ mfa_setup_required: true, mfa_token: `enroll:${DA}` });
  expect(second.body.password_change_required).toBeUndefined();
  expect(mockCreateSession).not.toHaveBeenCalled();

  // 4. MFA enrollment: a wrong code keeps the account pending, the right one activates it
  const setup = await withToken("/auth/mfa/setup", second.body.mfa_token);
  expect(setup.status).toBe(200);
  const wrongCode = await withToken("/auth/mfa/enable", second.body.mfa_token).send({ code: "000000" });
  expect(wrongCode.status).toBe(401);
  expect(mockState.users[DA].status).toBe("PENDING_SETUP");

  const enabled = await withToken("/auth/mfa/enable", second.body.mfa_token).send({ code: "123456" });
  expect(enabled.status).toBe(200);
  expect(enabled.body.accessToken).toBe(`access:${DA}`);
  expect(mockState.users[DA]).toMatchObject({ status: "ACTIVE", mfa_enabled: true });
  expect(mockCreateSession).toHaveBeenCalledWith(expect.anything(), { userId: DA, mfaVerified: true });

  // 5. later sign-ins use the normal MFA verification
  const later = await login("da.ravi.4821", NEW_PASSWORD);
  expect(later.body).toMatchObject({ mfa_required: true, mfa_token: `verify:${DA}` });
  const verified = await withToken("/auth/mfa/verify", later.body.mfa_token).send({ code: "123456" });
  expect(verified.status).toBe(200);
  expect(verified.body.user.role).toBe("DISTRICT_ADMIN");
});

test("after new login details are sent, only the newest temporary password works", async () => {
  // Resend: old row revoked, new hash and a new 24-hour row (what issueTemporaryCredentials does)
  mockState.tokens[0].revoked_at = Date.now();
  mockState.tokens.push({ id: "credentials-2", user_id: DA, expires_at: Date.now() + 24 * 60 * 60 * 1000, used_at: null, revoked_at: null });
  mockState.users[DA].password_hash = "hash:Newer#Temp9Pass";

  expect((await login("da.ravi.4821", TEMPORARY_PASSWORD)).status).toBe(401);
  const newest = await login("da.ravi.4821", "Newer#Temp9Pass");
  expect(newest.body.password_change_required).toBe(true);
});

test("an existing Super Admin still signs in with password and MFA as before", async () => {
  const response = await login("superadmin", "SuperSecret2026");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ mfa_required: true, mfa_token: `verify:${SUPER}` });
  expect(response.body.password_change_required).toBeUndefined();

  const verified = await withToken("/auth/mfa/verify", response.body.mfa_token).send({ code: "123456" });
  expect(verified.status).toBe(200);
  expect(verified.body.accessToken).toBe(`access:${SUPER}`);
  expect(verified.body.user.role).toBe("SUPER_ADMIN");
});
