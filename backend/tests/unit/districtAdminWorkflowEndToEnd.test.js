// End-to-end check of the District Admin workflow through the real Express routes,
// middleware, controllers and services, with real bcrypt, JWT, AES secret storage
// and TOTP codes. Only PostgreSQL (an in-memory copy of the rows involved) and the
// outgoing email are replaced. Unknown SQL fails the test, so nothing is skipped silently.
const crypto = require("crypto");

let mockDb;
const mockSentEmails = [];
let mockEmailStatus = "SENT";

const SUPER_ROLE = 1;
const DA_ROLE = 6;
const HOUR = 60 * 60 * 1000;

function mockNow() {
  return Date.now() + mockDb.clockOffset;
}

function mockUserRow(user) {
  const role = mockDb.roles[user.role_id];
  return {
    id: user.id,
    username: user.username,
    password_hash: user.password_hash,
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    designation: null,
    role_id: user.role_id,
    status: user.status,
    failed_login_count: user.failed_login_count,
    locked_until: user.locked_until,
    must_change_password: user.must_change_password,
    mfa_enabled: user.mfa_enabled,
    mfa_secret_encrypted: user.mfa_secret_encrypted,
    mfa_last_used_step: user.mfa_last_used_step,
    role_name: role.code,
    role_display_name: role.code,
    mfa_required: role.mfa_required,
  };
}

const mockOpenTokens = (userId) =>
  mockDb.tokens.filter((token) => token.user_id === userId && !token.used_at && !token.revoked_at);

function mockQuery(sql, params = []) {
  const s = sql.replace(/\s+/g, " ").trim();
  const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });
  const users = Object.values(mockDb.users);

  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return result();

  // ---- sessions and authentication ----
  if (s.includes("JOIN tbl_user_sessions s ON s.user_id = u.id")) {
    const user = mockDb.users[params[0]];
    const session = mockDb.sessions.find((item) => item.id === params[1]);
    if (!user || !session || session.user_id !== user.id || session.revoked_at || session.expires_at <= mockNow()) return result();
    const row = mockUserRow(user);
    return result([{ ...row, session_id: session.id, mfa_verified: session.mfa_verified }]);
  }
  if (s.includes("FROM tbl_role_permissions rp")) {
    return result((mockDb.permissions[params[0]] || []).map((code) => ({ code })));
  }
  if (s.includes("u.mfa_secret_encrypted") && s.includes("lower(u.username) = lower($1)")) {
    const user = users.find((item) => item.username === String(params[0]).toLowerCase() && !item.deleted_at);
    return result(user ? [mockUserRow(user)] : []);
  }
  if (s.includes("u.mfa_secret_encrypted") && s.includes("WHERE u.id = $1 AND u.deleted_at IS NULL")) {
    const user = mockDb.users[params[0]];
    return result(user ? [mockUserRow(user)] : []);
  }
  if (s.startsWith("INSERT INTO tbl_user_sessions")) {
    // Expiry on the same (possibly moved) clock as the rest of the fake database
    const session = { id: crypto.randomUUID(), user_id: params[0], mfa_verified: params[4], expires_at: params[5].getTime() + mockDb.clockOffset, revoked_at: null };
    mockDb.sessions.push(session);
    return result([{ id: session.id }]);
  }
  if (s.startsWith("UPDATE tbl_user_sessions SET revoked_at = now(), revoke_reason = $2 WHERE user_id = $1")) {
    const open = mockDb.sessions.filter((item) => item.user_id === params[0] && !item.revoked_at && item.id !== params[2]);
    open.forEach((item) => { item.revoked_at = mockNow(); });
    return result([], open.length);
  }
  if (s.startsWith("UPDATE tbl_user_sessions SET revoked_at = now(), revoke_reason = $2 WHERE id = $1")) {
    mockDb.sessions.filter((item) => item.id === params[0]).forEach((item) => { item.revoked_at = mockNow(); });
    return result();
  }
  if (s.startsWith("INSERT INTO tbl_audit_logs")) {
    mockDb.audit.push({ event: params[2], params: JSON.stringify(params) });
    return result();
  }

  // ---- tbl_users updates made by the auth controller ----
  if (s.startsWith("UPDATE tbl_users SET failed_login_count = $1, locked_until = $2 WHERE id = $3")) {
    Object.assign(mockDb.users[params[2]], { failed_login_count: params[0], locked_until: params[1] });
    return result();
  }
  if (s.includes("SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()")) {
    Object.assign(mockDb.users[params[0]], { failed_login_count: 0, locked_until: null });
    return result();
  }
  if (s.includes("SET mfa_secret_encrypted = $1, mfa_last_used_step = NULL")) {
    Object.assign(mockDb.users[params[1]], { mfa_secret_encrypted: params[0], mfa_last_used_step: null });
    return result();
  }
  if (s.startsWith("UPDATE tbl_users SET mfa_last_used_step = $1 WHERE id = $2")) {
    mockDb.users[params[1]].mfa_last_used_step = params[0];
    return result();
  }
  if (s.includes("SET mfa_enabled = TRUE")) {
    const user = mockDb.users[params[1]];
    const role = mockDb.roles[user.role_id];
    const allowed = !user.mfa_enabled && (user.status === "ACTIVE"
      || (user.status === "PENDING_SETUP" && !user.must_change_password && role.code === "DISTRICT_ADMIN" && role.mfa_required));
    if (!allowed) return result();
    Object.assign(user, { mfa_enabled: true, mfa_last_used_step: params[0], status: "ACTIVE" });
    return result([{ status: user.status }]);
  }
  if (s.includes("must_change_password = FALSE") && s.includes("status = 'PENDING_SETUP' AND must_change_password = TRUE")) {
    const user = mockDb.users[params[1]];
    if (user.status !== "PENDING_SETUP" || !user.must_change_password) return result();
    Object.assign(user, { password_hash: params[0], must_change_password: false, failed_login_count: 0, locked_until: null });
    return result([{ id: user.id }]);
  }
  if (s.startsWith("UPDATE tbl_users SET password_hash = $1, password_changed_at = now(), must_change_password = FALSE WHERE id = $2")) {
    Object.assign(mockDb.users[params[1]], { password_hash: params[0], must_change_password: false });
    return result();
  }
  if (s.startsWith("SELECT password_hash FROM tbl_users WHERE id = $1")) {
    return result([{ password_hash: mockDb.users[params[0]].password_hash }]);
  }

  // ---- District Admin service ----
  if (s.startsWith("SELECT id FROM mst_districts WHERE id = $1 AND is_active = TRUE")) {
    return result(Number(params[0]) === 1 ? [{ id: 1 }] : []);
  }
  if (s.includes("FROM mst_roles WHERE code = 'DISTRICT_ADMIN' AND is_active = TRUE")) {
    return result([{ id: DA_ROLE, mfa_required: true }]);
  }
  if (s.startsWith("SELECT 1 FROM tbl_users WHERE lower(username) = $1")) {
    return result(users.some((item) => item.username === params[0]) ? [{ one: 1 }] : []);
  }
  if (s.startsWith("INSERT INTO tbl_users")) {
    if (users.some((item) => item.username === String(params[0]).toLowerCase())) {
      throw Object.assign(new Error("duplicate key value"), { code: "23505" });
    }
    const user = {
      id: crypto.randomUUID(), username: params[0], password_hash: params[1], full_name: params[2], phone: params[3],
      email: params[4], role_id: params[5], status: "PENDING_SETUP", district_id: params[6], must_change_password: true,
      mfa_enabled: false, mfa_secret_encrypted: null, mfa_last_used_step: null, failed_login_count: 0, locked_until: null,
    };
    mockDb.users[user.id] = user;
    const { id, username, full_name: fullName, email, phone, status, district_id: districtId } = user;
    return result([{ id, username, full_name: fullName, email, phone, status, district_id: districtId }]);
  }
  if (s.includes("SET password_hash = $1, must_change_password = TRUE, failed_login_count = 0, locked_until = NULL WHERE id = $2")) {
    Object.assign(mockDb.users[params[1]], { password_hash: params[0], must_change_password: true, failed_login_count: 0, locked_until: null });
    return result();
  }
  if (s.startsWith("SELECT id, status FROM tbl_users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE")) {
    const user = mockDb.users[params[0]];
    return result(user ? [{ id: user.id, status: user.status }] : []);
  }
  if (s.startsWith("SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status") && s.includes("r.code = 'DISTRICT_ADMIN'")) {
    const user = mockDb.users[params[0]];
    if (!user || user.role_id !== DA_ROLE) return result();
    return result([{ id: user.id, username: user.username, full_name: user.full_name, email: user.email, phone: user.phone, status: user.status, district_id: user.district_id }]);
  }

  // ---- tbl_district_admin_setup_tokens ----
  if (s.startsWith("UPDATE tbl_district_admin_setup_tokens SET revoked_at = now(), encrypted_token = NULL WHERE user_id = $1")) {
    mockOpenTokens(params[0]).forEach((token) => { token.revoked_at = mockNow(); });
    return result();
  }
  if (s.startsWith("INSERT INTO tbl_district_admin_setup_tokens")) {
    // the real table allows only one open row per user (uq_district_admin_setup_one_open_token)
    if (mockOpenTokens(params[0]).length) throw Object.assign(new Error("duplicate open token"), { code: "23505" });
    if (!s.includes("NULL, $3")) throw new Error("temporary-password rows must not store an encrypted secret");
    const token = { id: crypto.randomUUID(), user_id: params[0], token_hash: params[1], created_at: mockNow(), expires_at: mockNow() + 24 * HOUR, used_at: null, revoked_at: null, email_delivery_status: "NOT_CONFIGURED" };
    mockDb.tokens.push(token);
    return result([{ id: token.id, expires_at: new Date(token.expires_at) }]);
  }
  if (s.includes("FROM tbl_district_admin_setup_tokens WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()")) {
    const token = mockOpenTokens(params[0]).find((item) => item.expires_at > mockNow());
    return result(token ? [{ id: token.id }] : []);
  }
  if (s.startsWith("SELECT id, expires_at FROM tbl_district_admin_setup_tokens WHERE id = $1 AND user_id = $2")) {
    const token = mockOpenTokens(params[1]).find((item) => item.id === params[0]);
    return result(token ? [{ id: token.id, expires_at: new Date(token.expires_at) }] : []);
  }
  if (s.startsWith("SELECT id AS token_id")) {
    const token = mockOpenTokens(params[0]).sort((a, b) => b.created_at - a.created_at)[0];
    return result(token ? [{ token_id: token.id, expires_at: new Date(token.expires_at), email_delivery_status: token.email_delivery_status, sms_delivery_status: "NOT_CONFIGURED" }] : []);
  }
  if (s.startsWith("UPDATE tbl_district_admin_setup_tokens SET email_delivery_status = $1")) {
    const token = mockDb.tokens.find((item) => item.id === params[1] && !item.used_at && !item.revoked_at);
    if (token) token.email_delivery_status = params[0];
    return result(token ? [{ id: token.id }] : []);
  }
  if (s.startsWith("UPDATE tbl_district_admin_setup_tokens SET used_at = now(), encrypted_token = NULL WHERE id = $1")) {
    mockDb.tokens.find((item) => item.id === params[0]).used_at = mockNow();
    return result();
  }

  throw new Error(`Unexpected SQL in end-to-end test: ${s}`);
}

jest.mock("../../db", () => ({
  query: async (...args) => mockQuery(...args),
  connect: async () => ({ query: async (...args) => mockQuery(...args), release: () => {} }),
}));
// authController requires config/config. Inline factories (jest.mock is hoisted).
jest.mock("../../config/config", () => ({
  jwtSecret: "end-to-end-test-secret-with-more-than-32-bytes",
  jwtExpiresIn: "15m",
  mfaTokenTtl: "5m",
  refreshTokenTtlHours: 12,
  isProduction: false,
  frontendUrl: "https://aarogya.example.test",
  getMfaEncryptionKey: () => Buffer.alloc(32, 7),
}));
jest.mock("../helpers/unitConfig", () => ({
  jwtSecret: "end-to-end-test-secret-with-more-than-32-bytes",
  jwtExpiresIn: "15m",
  mfaTokenTtl: "5m",
  refreshTokenTtlHours: 12,
  isProduction: false,
  frontendUrl: "https://aarogya.example.test",
  getMfaEncryptionKey: () => Buffer.alloc(32, 7),
}));
jest.mock("../../services/emailTransport", () => ({
  sendSetupEmail: jest.fn(),
  sendTemporaryCredentialsEmail: jest.fn(async (message) => {
    mockSentEmails.push(message);
    return mockEmailStatus === "SENT"
      ? { success: true, status: "SENT", message: "Email sent." }
      : { success: false, status: "FAILED", message: "Email delivery failed." };
  }),
}));

const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const totp = require("../../utils/totp");
const { encrypt } = require("../../utils/secretBox");
const { generateAccessToken } = require("../../utils/jwt");
const { authenticate } = require("../../middleware/authMiddleware");
const errorHandler = require("../../middleware/errorMiddleware");

const app = express();
app.use(express.json());
app.use("/api/auth", require("../../routes/auth"));
app.use("/api/admin", require("../../routes/systemAdmin"));
// Stand-in for every protected dashboard API: the same authenticate middleware guards it
app.get("/api/dashboard/summary", authenticate, (req, res) => res.json({ success: true, role: req.user.role }));
app.use(errorHandler);

jest.setTimeout(60000);

const MFA_KEY = Buffer.alloc(32, 7);
const SUPER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUPER_PASSWORD = "SuperAdmin#2026";
let superSecret;
let superHash;
let usedSteps;

beforeAll(async () => {
  superHash = await bcrypt.hash(SUPER_PASSWORD, 12);
});

beforeEach(() => {
  mockSentEmails.length = 0;
  mockEmailStatus = "SENT";
  usedSteps = new Map();
  superSecret = totp.generateSecret();
  mockDb = {
    clockOffset: 0,
    roles: {
      [SUPER_ROLE]: { code: "SUPER_ADMIN", mfa_required: true },
      [DA_ROLE]: { code: "DISTRICT_ADMIN", mfa_required: true },
    },
    permissions: { [SUPER_ROLE]: [], [DA_ROLE]: ["dashboard.view_aggregate", "master.view"] },
    users: {
      [SUPER_ID]: {
        id: SUPER_ID, username: "superadmin", password_hash: superHash, full_name: "Super Admin", phone: null, email: null,
        role_id: SUPER_ROLE, status: "ACTIVE", district_id: null, must_change_password: false, mfa_enabled: true,
        mfa_secret_encrypted: encrypt(superSecret, MFA_KEY), mfa_last_used_step: null, failed_login_count: 0, locked_until: null,
      },
    },
    sessions: [],
    tokens: [],
    audit: [],
  };
});

// A valid authenticator code. The server rejects a code whose step was already used,
// so the second code for the same secret uses the next 30-second step (inside the ±1 window).
function nextCode(secret) {
  const offset = usedSteps.get(secret) || 0;
  if (offset > 1) throw new Error("test uses one secret more than twice");
  usedSteps.set(secret, offset + 1);
  return totp.codeForStep(secret, totp.currentStep() + offset);
}

const post = (path, body, token) => {
  const call = request(app).post(path).send(body || {});
  return token ? call.set("Authorization", `Bearer ${token}`) : call;
};
const dashboard = (token) => request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${token}`);

async function signInSuperAdmin() {
  const login = await post("/api/auth/login", { username: "superadmin", password: SUPER_PASSWORD });
  expect(login.body.mfa_required).toBe(true);
  const verified = await post("/api/auth/mfa/verify", { code: nextCode(superSecret) }, login.body.mfa_token);
  expect(verified.status).toBe(200);
  return verified.body.accessToken;
}

async function createDistrictAdmin(superToken) {
  const created = await post("/api/admin/district-admins", {
    full_name: "Ravi Kumar", email: "ravi@example.test", phone: "9876543210", district_id: 1,
  }, superToken);
  expect(created.status).toBe(201);
  const email = mockSentEmails[mockSentEmails.length - 1];
  return { id: created.body.district_admin.id, username: created.body.district_admin.username, password: email.temporaryPassword, response: created.body };
}

// Temporary password -> new password -> MFA enrollment; returns the access token and MFA secret
async function activate(districtAdmin, newPassword = "RaviOwnPassword2026") {
  const first = await post("/api/auth/login", { username: districtAdmin.username, password: districtAdmin.password });
  const changed = await post("/api/auth/temporary-password/change", { new_password: newPassword }, first.body.password_change_token);
  expect(changed.status).toBe(200);
  const setup = await post("/api/auth/mfa/setup", {}, changed.body.mfa_token);
  const enabled = await post("/api/auth/mfa/enable", { code: nextCode(setup.body.secret) }, changed.body.mfa_token);
  expect(enabled.status).toBe(200);
  return { accessToken: enabled.body.accessToken, secret: setup.body.secret, password: newPassword };
}

const resend = (superToken, id) => post(`/api/admin/district-admins/${id}/setup-token`, {}, superToken);

test("complete workflow: create, email, temporary login, forced password change, MFA, activation, dashboard", async () => {
  const superToken = await signInSuperAdmin();
  const da = await createDistrictAdmin(superToken);

  // 1-3. generated username, strong temporary password, emailed with the login URL
  expect(da.username).toMatch(/^da\.ravi\.\d{4}$/);
  expect(mockSentEmails).toHaveLength(1);
  expect(mockSentEmails[0]).toMatchObject({ username: da.username, loginUrl: "https://aarogya.example.test/login" });
  expect(da.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%&*!?]).{14}$/);
  expect(da.response.delivery_status.email.status).toBe("SENT");
  expect(JSON.stringify(da.response)).not.toContain(da.password);

  // Only a real bcrypt hash is stored; the plain password is nowhere in the database or audit log
  const stored = mockDb.users[da.id];
  expect(stored.password_hash).toMatch(/^\$2[aby]\$12\$/);
  expect(await bcrypt.compare(da.password, stored.password_hash)).toBe(true);
  expect(JSON.stringify(mockDb)).not.toContain(da.password);
  expect(stored).toMatchObject({ status: "PENDING_SETUP", must_change_password: true, mfa_enabled: false });
  expect(mockDb.tokens.filter((token) => token.user_id === da.id)).toHaveLength(1);

  // 5-6. temporary login gives only a password-change step, no session
  const sessionsBefore = mockDb.sessions.length;
  const first = await post("/api/auth/login", { username: da.username, password: da.password });
  expect(first.status).toBe(200);
  expect(first.body.password_change_required).toBe(true);
  expect(first.body.accessToken).toBeUndefined();
  expect(mockDb.sessions.length).toBe(sessionsBefore);

  // The password-change token cannot open the dashboard or skip to MFA
  expect((await dashboard(first.body.password_change_token)).status).toBe(401);
  expect((await post("/api/auth/mfa/setup", {}, first.body.password_change_token)).body.code).toBe("MFA_STAGE_MISMATCH");

  const newPassword = "RaviOwnPassword2026";
  const changed = await post("/api/auth/temporary-password/change", { new_password: newPassword }, first.body.password_change_token);
  expect(changed.status).toBe(200);
  expect(changed.body.mfa_setup_required).toBe(true);
  expect(changed.body.accessToken).toBeUndefined();
  expect(mockDb.users[da.id]).toMatchObject({ must_change_password: false, status: "PENDING_SETUP" });

  // Old credentials stop working; the used password-change token is rejected
  expect((await post("/api/auth/login", { username: da.username, password: da.password })).status).toBe(401);
  expect((await post("/api/auth/temporary-password/change", { new_password: "YetAnother2026x" }, first.body.password_change_token)).status).toBe(403);

  // 7. MFA is still required: the new password leads to enrollment, still no session or dashboard
  const second = await post("/api/auth/login", { username: da.username, password: newPassword });
  expect(second.body).toMatchObject({ mfa_setup_required: true });
  expect(second.body.accessToken).toBeUndefined();
  expect((await dashboard(second.body.mfa_token)).status).toBe(401);

  const setup = await post("/api/auth/mfa/setup", {}, second.body.mfa_token);
  expect(setup.status).toBe(200);
  const wrong = await post("/api/auth/mfa/enable", { code: "000000" }, second.body.mfa_token);
  expect(wrong.status).toBe(401);
  expect(mockDb.users[da.id].status).toBe("PENDING_SETUP");

  // 8. a correct authenticator code activates the account and opens the dashboard
  const enabled = await post("/api/auth/mfa/enable", { code: nextCode(setup.body.secret) }, second.body.mfa_token);
  expect(enabled.status).toBe(200);
  expect(mockDb.users[da.id]).toMatchObject({ status: "ACTIVE", mfa_enabled: true });
  const board = await dashboard(enabled.body.accessToken);
  expect(board.status).toBe(200);
  expect(board.body.role).toBe("DISTRICT_ADMIN");

  // Later sign-ins: password + MFA verification
  const later = await post("/api/auth/login", { username: da.username, password: newPassword });
  expect(later.body.mfa_required).toBe(true);
  const verified = await post("/api/auth/mfa/verify", { code: nextCode(setup.body.secret) }, later.body.mfa_token);
  expect((await dashboard(verified.body.accessToken)).status).toBe(200);

  expect(JSON.stringify(mockDb.audit)).not.toContain(da.password);
  expect(JSON.stringify(mockDb.audit)).not.toContain(newPassword);
});

test("temporary password expires after 24 hours, and resending gives a working new one", async () => {
  const superToken = await signInSuperAdmin();
  const da = await createDistrictAdmin(superToken);

  mockDb.clockOffset = 23 * HOUR;
  expect((await post("/api/auth/login", { username: da.username, password: da.password })).body.password_change_required).toBe(true);
  const stepToken = (await post("/api/auth/login", { username: da.username, password: da.password })).body.password_change_token;

  mockDb.clockOffset = 24 * HOUR + 60 * 1000;
  const expired = await post("/api/auth/login", { username: da.username, password: da.password });
  expect(expired.status).toBe(401);
  expect(expired.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  // A password-change token obtained before expiry cannot be used afterwards either
  const lateChange = await post("/api/auth/temporary-password/change", { new_password: "TooLate2026xyz" }, stepToken);
  expect(lateChange.status).toBe(401);
  expect(lateChange.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  expect(mockDb.users[da.id].must_change_password).toBe(true);

  // A day later the Super Admin's earlier session has expired too: sign in again, then resend
  expect((await dashboard(superToken)).status).toBe(401);
  const laterSuperToken = await signInSuperAdmin();
  const resent = await resend(laterSuperToken, da.id);
  expect(resent.status).toBe(200);
  const newest = mockSentEmails[mockSentEmails.length - 1].temporaryPassword;
  expect(newest).not.toBe(da.password);
  expect((await post("/api/auth/login", { username: da.username, password: da.password })).status).toBe(401);
  expect((await post("/api/auth/login", { username: da.username, password: newest })).body.password_change_required).toBe(true);
});

test("each resend invalidates the previous temporary password; old rows are revoked, not deleted", async () => {
  const superToken = await signInSuperAdmin();
  const da = await createDistrictAdmin(superToken);
  await resend(superToken, da.id);
  await resend(superToken, da.id);
  const passwords = mockSentEmails.map((email) => email.temporaryPassword);

  expect(new Set(passwords).size).toBe(3);
  expect((await post("/api/auth/login", { username: da.username, password: passwords[0] })).status).toBe(401);
  expect((await post("/api/auth/login", { username: da.username, password: passwords[1] })).status).toBe(401);
  expect((await post("/api/auth/login", { username: da.username, password: passwords[2] })).body.password_change_required).toBe(true);

  const rows = mockDb.tokens.filter((token) => token.user_id === da.id);
  expect(rows).toHaveLength(3);
  expect(rows.filter((token) => token.revoked_at)).toHaveLength(2);
  expect(mockDb.audit.filter((entry) => entry.event === "DISTRICT_ADMIN_CREDENTIALS_REISSUED")).toHaveLength(2);
});

test("a failed email can be retried; the retry sends new details and the undelivered ones never work", async () => {
  const superToken = await signInSuperAdmin();
  mockEmailStatus = "FAILED";
  const da = await createDistrictAdmin(superToken);
  expect(da.response.delivery_status.email.status).toBe("FAILED");

  mockEmailStatus = "SENT";
  const retry = await post(`/api/admin/district-admins/${da.id}/setup-delivery/email/retry`, {}, superToken);
  expect(retry.status).toBe(200);
  expect(retry.body).toMatchObject({ channel: "email", delivery_status: "SENT" });
  const delivered = mockSentEmails[1].temporaryPassword;

  expect((await post("/api/auth/login", { username: da.username, password: da.password })).status).toBe(401);
  expect((await post("/api/auth/login", { username: da.username, password: delivered })).body.password_change_required).toBe(true);
  // Once delivered, the same email is not sent again by "retry"
  const again = await post(`/api/admin/district-admins/${da.id}/setup-delivery/email/retry`, {}, superToken);
  expect(again.body.code).toBe("DELIVERY_ALREADY_SENT");
});

test("dashboard APIs need an ACTIVE account and an MFA-verified session (defence in depth)", async () => {
  const superToken = await signInSuperAdmin();
  const da = await createDistrictAdmin(superToken);
  const first = await post("/api/auth/login", { username: da.username, password: da.password });
  await post("/api/auth/temporary-password/change", { new_password: "RaviOwnPassword2026" }, first.body.password_change_token);

  // Even a correctly signed access token with a session is refused while the account is pending
  const pendingSession = { id: crypto.randomUUID(), user_id: da.id, mfa_verified: true, expires_at: Date.now() + HOUR, revoked_at: null };
  mockDb.sessions.push(pendingSession);
  const pendingToken = generateAccessToken({ id: da.id, role_id: DA_ROLE, role_name: "DISTRICT_ADMIN" }, pendingSession.id);
  const pending = await dashboard(pendingToken);
  expect(pending.status).toBe(401);
  expect(pending.body.code).toBe("ACCOUNT_UNAVAILABLE");

  // An ACTIVE account whose session skipped MFA is refused too
  mockDb.users[da.id].status = "ACTIVE";
  pendingSession.mfa_verified = false;
  const noMfa = await dashboard(pendingToken);
  expect(noMfa.status).toBe(401);
  expect(noMfa.body.code).toBe("MFA_REQUIRED");
});

test("activated District Admins change their password later through Settings; resend is no longer possible", async () => {
  const superToken = await signInSuperAdmin();
  const da = await createDistrictAdmin(superToken);
  const active = await activate(da);

  const changed = await post("/api/auth/change-password", { current_password: active.password, new_password: "SettingsChange2026" }, active.accessToken);
  expect(changed.status).toBe(200);
  expect((await post("/api/auth/login", { username: da.username, password: active.password })).status).toBe(401);
  expect((await post("/api/auth/login", { username: da.username, password: "SettingsChange2026" })).body.mfa_required).toBe(true);

  expect((await resend(superToken, da.id)).body.code).toBe("SETUP_NOT_AVAILABLE");
  // A District Admin cannot create District Admins
  expect((await post("/api/admin/district-admins", { full_name: "X", email: "x@example.test", district_id: 1 }, active.accessToken)).status).toBe(403);
});

test("existing Super Admin sign-in, MFA and account lock-out still work", async () => {
  const token = await signInSuperAdmin();
  expect((await dashboard(token)).body.role).toBe("SUPER_ADMIN");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await post("/api/auth/login", { username: "superadmin", password: "wrong-password-1" })).status).toBe(401);
  }
  const locked = await post("/api/auth/login", { username: "superadmin", password: SUPER_PASSWORD });
  expect(locked.status).toBe(423);
  expect(locked.body.code).toBe("ACCOUNT_LOCKED");
});
