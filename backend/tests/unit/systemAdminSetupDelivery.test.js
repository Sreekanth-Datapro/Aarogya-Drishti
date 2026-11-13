const mockClientQuery = jest.fn();
const mockConnect = jest.fn();
const mockSendCredentials = jest.fn();
const mockHashes = new Map();
let mockTarget;
let mockRetryRow;
let mockDuplicateUser;
let mockSetupTokenAvailable;
let mockTakenUsernames;

jest.mock("../../db", () => ({
  connect: (...args) => mockConnect(...args),
  query: jest.fn(),
}));
// Each hash is a fresh label; the test keeps label -> password to check what was hashed
jest.mock("bcryptjs", () => ({
  hash: jest.fn(async (password) => {
    const label = `bcrypt-hash-${mockHashes.size + 1}`;
    mockHashes.set(label, password);
    return label;
  }),
}));
// jest.config.js maps config/config → unitConfig; mock that module for a stable login URL.
jest.mock("../helpers/unitConfig", () => ({
  frontendUrl: "https://frontend.example.test",
  getSetupTokenEncryptionKey: () => Buffer.alloc(32, 1),
  getMfaEncryptionKey: () => Buffer.alloc(32, 7),
}));
jest.mock("../../services/emailTransport", () => ({
  sendSetupEmail: jest.fn(),
  sendTemporaryCredentialsEmail: (...args) => mockSendCredentials(...args),
}));

const systemAdmin = require("../../services/systemAdminService");

const actor = { id: "11111111-1111-4111-8111-111111111111", role_name: "SUPER_ADMIN" };
const request = { user: actor, ip: "127.0.0.1", requestId: "request-1" };
const USER_ID = "22222222-2222-4222-8222-222222222222";
const input = {
  full_name: "District Admin",
  email: "district@example.test",
  phone: "9876543210",
  district_id: 1,
};

const sqlCalls = (text) => mockClientQuery.mock.calls.filter(([sql]) => sql.includes(text));
const passwordsSent = () => mockSendCredentials.mock.calls.map(([args]) => args.temporaryPassword);

beforeEach(() => {
  jest.clearAllMocks();
  mockHashes.clear();
  mockTarget = { id: USER_ID, username: "da.district.1234", full_name: "District Admin", email: input.email, phone: input.phone, status: "PENDING_SETUP", district_id: 1 };
  mockRetryRow = null;
  mockDuplicateUser = false;
  mockSetupTokenAvailable = true;
  mockTakenUsernames = new Set();
  mockSendCredentials.mockResolvedValue({ success: true, status: "SENT", message: "Email sent." });
  mockClientQuery.mockImplementation(async (sql, params = []) => {
    const statement = sql.trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) return { rows: [] };
    if (statement.includes("FROM mst_districts")) return { rows: [{ id: 1 }] };
    if (statement.includes("FROM mst_roles WHERE code = 'DISTRICT_ADMIN'")) return { rows: [{ id: 3, mfa_required: true }] };
    if (statement.startsWith("SELECT 1 FROM tbl_users WHERE lower(username)")) {
      return { rows: mockTakenUsernames.has(params[0]) ? [{ "?column?": 1 }] : [] };
    }
    if (statement.includes("INSERT INTO tbl_users")) {
      if (mockDuplicateUser) {
        const error = new Error("duplicate");
        error.code = "23505";
        throw error;
      }
      return { rows: [{ id: USER_ID, username: params[0], full_name: params[2], email: params[4], phone: params[3], status: "PENDING_SETUP", district_id: params[6] }] };
    }
    if (statement.includes("INSERT INTO tbl_district_admin_setup_tokens")) {
      return { rows: [{ id: "token-row-new", expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }] };
    }
    if (statement.includes("SELECT id, status") && statement.includes("FROM tbl_users")) {
      return { rows: [{ id: USER_ID, status: "PENDING_SETUP" }] };
    }
    if (statement.includes("SELECT id, expires_at")) {
      return { rows: [{ id: "token-row-new", expires_at: new Date(Date.now() + 3600 * 1000).toISOString() }] };
    }
    if (statement.includes("SELECT u.id, u.username, u.full_name") && statement.includes("u.district_id")) {
      return { rows: mockTarget ? [mockTarget] : [] };
    }
    if (statement.includes("SELECT u.id, u.username, u.full_name") && statement.includes("FOR UPDATE OF u")) {
      return { rows: mockRetryRow ? [{ ...mockTarget, status: mockRetryRow.status || "PENDING_SETUP" }] : [] };
    }
    if (statement.includes("SELECT id AS token_id")) {
      return { rows: mockRetryRow ? [mockRetryRow] : [] };
    }
    if (statement.includes("SELECT u.id, u.username, u.status")) {
      return { rows: [{ id: USER_ID, username: "da.district.1234", status: "PENDING_SETUP" }] };
    }
    if (statement.includes("SELECT id, user_id FROM tbl_district_admin_setup_tokens")) {
      return { rows: mockSetupTokenAvailable ? [{ id: "token-row-1", user_id: USER_ID }] : [] };
    }
    if (statement.startsWith("SELECT id FROM tbl_district_admin_setup_tokens")) {
      return { rows: [{ id: "token-row-1" }] };
    }
    if (statement.startsWith("UPDATE tbl_users")) return { rows: [] };
    if (statement.startsWith("UPDATE tbl_district_admin_setup_tokens")) {
      if (statement.includes("SET used_at")) mockSetupTokenAvailable = false;
      return { rows: [{ id: "token-row-new" }] };
    }
    if (statement.includes("INSERT INTO tbl_audit_logs")) return { rows: [] };
    throw new Error(`Unexpected mocked SQL: ${statement}`);
  });
  mockConnect.mockResolvedValue({
    query: (...args) => mockClientQuery(...args),
    release: jest.fn(),
  });
});

describe("District Admin creation with temporary login details", () => {
  test("rejects District Admin account creation by SYSTEM_ADMIN", async () => {
    await expect(systemAdmin.createDistrictAdmin(
      { id: USER_ID, role_name: "SYSTEM_ADMIN" },
      request,
      input
    )).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test("generates a unique username and a strong temporary password, stores only its hash and emails it", async () => {
    mockTakenUsernames = new Set(); // all candidates free
    const result = await systemAdmin.createDistrictAdmin(actor, request, input);

    expect(result.user.status).toBe("PENDING_SETUP");
    expect(result.user.username).toMatch(/^da\.district\.\d{4}$/);
    expect(result.delivery_status).toMatchObject({ email: { status: "SENT" } });

    const [email] = mockSendCredentials.mock.calls[0];
    expect(email).toMatchObject({
      username: result.user.username,
      loginUrl: "https://frontend.example.test/login",
      user: expect.objectContaining({ email: input.email }),
    });
    const temporaryPassword = email.temporaryPassword;
    expect(temporaryPassword).toHaveLength(14);
    expect(temporaryPassword).toMatch(/[A-Z]/);
    expect(temporaryPassword).toMatch(/[a-z]/);
    expect(temporaryPassword).toMatch(/\d/);
    expect(temporaryPassword).toMatch(/[@#$%&*!?]/);

    // tbl_users gets the bcrypt hash of exactly that password; the password itself is never in SQL
    const passwordUpdate = sqlCalls("SET password_hash = $1, must_change_password = TRUE")[0];
    expect(mockHashes.get(passwordUpdate[1][0])).toBe(temporaryPassword);
    expect(JSON.stringify(mockClientQuery.mock.calls)).not.toContain(temporaryPassword);
    expect(JSON.stringify(result)).not.toContain(temporaryPassword);

    // The 24-hour limit lives in a new setup row; the earlier open rows are revoked first
    const revoke = sqlCalls("SET revoked_at = now()");
    const insert = sqlCalls("INSERT INTO tbl_district_admin_setup_tokens")[0];
    expect(revoke.length).toBe(1);
    expect(insert[0]).toContain("interval '24 hours'");
    expect(insert[0]).toContain("NULL");
    expect(insert[1]).toEqual([USER_ID, expect.stringMatching(/^[a-f0-9]{64}$/), actor.id]);
  });

  test("tries another username when the first one is taken", async () => {
    const randomInt = jest.spyOn(require("crypto"), "randomInt");
    randomInt.mockReturnValueOnce(1111).mockReturnValueOnce(2222);
    mockTakenUsernames = new Set(["da.district.1111"]);
    const result = await systemAdmin.createDistrictAdmin(actor, request, input);
    randomInt.mockRestore();
    expect(result.user.username).toBe("da.district.2222");
  });

  test("still accepts and validates a username given by an older client", async () => {
    const result = await systemAdmin.createDistrictAdmin(actor, request, { ...input, username: "Ravi.DA" });
    expect(result.user.username).toBe("ravi.da");
    await expect(systemAdmin.createDistrictAdmin(actor, request, { ...input, username: "a b" }))
      .rejects.toMatchObject({ status: 400, code: "INVALID_DISTRICT_ADMIN" });
  });

  test("requires an email address, because the login details are emailed", async () => {
    await expect(systemAdmin.createDistrictAdmin(actor, request, { ...input, email: "" }))
      .rejects.toMatchObject({ status: 400, code: "EMAIL_REQUIRED" });
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test.each([
    ["email sent", "SENT"],
    ["email failed", "FAILED"],
  ])("%s is recorded per channel", async (_label, emailStatus) => {
    mockSendCredentials.mockResolvedValue({
      success: emailStatus === "SENT",
      status: emailStatus,
      message: emailStatus === "SENT" ? "Email sent." : "Email delivery failed.",
    });
    const result = await systemAdmin.createDistrictAdmin(actor, request, input);
    expect(result.delivery_status).toMatchObject({ email: { status: emailStatus } });
    const statusUpdate = sqlCalls("SET email_delivery_status = $1")[0];
    expect(statusUpdate[1]).toEqual([emailStatus, "token-row-new"]);
  });

  test("audits creation and delivery without the temporary password", async () => {
    await systemAdmin.createDistrictAdmin(actor, request, input);
    const temporaryPassword = passwordsSent()[0];
    const audits = JSON.stringify(sqlCalls("INSERT INTO tbl_audit_logs"));
    expect(audits).toContain("DISTRICT_ADMIN_CREATED");
    expect(audits).toContain("DISTRICT_ADMIN_SETUP_DELIVERY_ATTEMPTED");
    expect(audits).toContain("SUPER_ADMIN");
    expect(audits).not.toContain(temporaryPassword);
  });

  test("rejects duplicate account creation without attempting delivery", async () => {
    mockDuplicateUser = true;
    await expect(systemAdmin.createDistrictAdmin(actor, request, input))
      .rejects.toMatchObject({ status: 409, code: "USERNAME_EXISTS" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });
});

describe("Resending login details", () => {
  test("a resend replaces the temporary password and revokes the previous one", async () => {
    await systemAdmin.createDistrictAdmin(actor, request, input);
    const firstPassword = passwordsSent()[0];
    mockClientQuery.mockClear();

    const result = await systemAdmin.reissueDistrictAdminSetup(actor, request, USER_ID);
    const secondPassword = passwordsSent()[1];

    expect(result.delivery_status).toMatchObject({ email: { status: "SENT" } });
    expect(secondPassword).not.toBe(firstPassword);
    // revoke old row -> new hash for the new password -> new 24-hour row
    const order = (text) => mockClientQuery.mock.calls.findIndex(([sql]) => sql.includes(text));
    expect(order("SET revoked_at = now()")).toBeGreaterThanOrEqual(0);
    expect(order("SET revoked_at = now()")).toBeLessThan(order("INSERT INTO tbl_district_admin_setup_tokens"));
    const passwordUpdate = sqlCalls("SET password_hash = $1, must_change_password = TRUE")[0];
    expect(mockHashes.get(passwordUpdate[1][0])).toBe(secondPassword);
    expect(JSON.stringify(sqlCalls("INSERT INTO tbl_audit_logs"))).toContain("DISTRICT_ADMIN_CREDENTIALS_REISSUED");
  });

  test("an activated account cannot receive new temporary details", async () => {
    mockTarget.status = "ACTIVE";
    await expect(systemAdmin.reissueDistrictAdminSetup(actor, request, USER_ID))
      .rejects.toMatchObject({ status: 409, code: "SETUP_NOT_AVAILABLE" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test("an email retry also issues fresh details (the old password is never stored)", async () => {
    mockRetryRow = {
      token_id: "token-row-1",
      email_delivery_status: "FAILED",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    const result = await systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "EMAIL");

    expect(result).toMatchObject({ channel: "email", delivery_status: "SENT" });
    expect(mockSendCredentials).toHaveBeenCalledTimes(1);
    expect(sqlCalls("SET revoked_at = now()").length).toBe(1);
    expect(JSON.stringify(result)).not.toContain(passwordsSent()[0]);
  });

  test.each([
    ["missing", undefined],
    ["unknown status", { success: true, status: "ACCEPTED" }],
    ["inconsistent status", { success: false, status: "SENT" }],
  ])("turns a %s provider response into a safe FAILED status", async (_label, response) => {
    mockRetryRow = { token_id: "token-row-1", email_delivery_status: "FAILED", expires_at: new Date(Date.now() + 3600 * 1000).toISOString() };
    mockSendCredentials.mockResolvedValue(response);
    await expect(systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "EMAIL"))
      .resolves.toMatchObject({ channel: "email", delivery_status: "FAILED", message: "Delivery could not be completed." });
  });

  test("does not retry after the temporary password expired", async () => {
    mockRetryRow = { token_id: "token-row-1", email_delivery_status: "FAILED", expires_at: new Date(Date.now() - 1000).toISOString() };
    await expect(systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "EMAIL"))
      .rejects.toMatchObject({ status: 409, code: "SETUP_TOKEN_EXPIRED" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test("does not resend an email that was already sent", async () => {
    mockRetryRow = { token_id: "token-row-1", email_delivery_status: "SENT", expires_at: new Date(Date.now() + 3600 * 1000).toISOString() };
    await expect(systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "EMAIL"))
      .rejects.toMatchObject({ status: 409, code: "DELIVERY_ALREADY_SENT" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test("does not retry for used, revoked, or missing details", async () => {
    await expect(systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "EMAIL"))
      .rejects.toMatchObject({ status: 404, code: "SETUP_NOT_FOUND" });
    expect(mockSendCredentials).not.toHaveBeenCalled();
  });

  test("denies retry to SYSTEM_ADMIN and rejects SMS", async () => {
    await expect(systemAdmin.retryDistrictAdminSetupDelivery({ ...actor, role_name: "SYSTEM_ADMIN" }, request, USER_ID, "EMAIL"))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(systemAdmin.retryDistrictAdminSetupDelivery(actor, request, USER_ID, "SMS"))
      .rejects.toMatchObject({ status: 400, code: "INVALID_DELIVERY_CHANNEL" });
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("Existing setup links", () => {
  test("a setup link issued earlier still sets the password once and keeps the account pending", async () => {
    const token = "a".repeat(64);
    const result = await systemAdmin.completeDistrictAdminSetup(token, "SecurePass1234", request);

    expect(result).toEqual({ user_id: USER_ID, status: "PENDING_SETUP" });
    const userUpdate = mockClientQuery.mock.calls.find(([sql]) => sql.startsWith("UPDATE tbl_users"));
    expect(userUpdate[0]).not.toContain("status = 'ACTIVE'");
    expect(userUpdate[0]).toContain("must_change_password = FALSE");
    expect(sqlCalls("SET used_at = now(), encrypted_token = NULL").length).toBe(1);
    expect(sqlCalls("DISTRICT_ADMIN_SETUP_PASSWORD_SET").length).toBe(1);
    await expect(systemAdmin.completeDistrictAdminSetup(token, "SecurePass1234", request))
      .rejects.toMatchObject({ status: 400, code: "SETUP_TOKEN_INVALID" });
  });
});
