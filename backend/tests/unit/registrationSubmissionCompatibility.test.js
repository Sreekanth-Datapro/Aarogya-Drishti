const mockClient = { query: jest.fn(), release: jest.fn() };
const mockPool = {
  connect: jest.fn(() => mockClient),
  query: jest.fn(),
};

jest.mock("../../db", () => mockPool);
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));
jest.mock("../../utils/audit", () => ({ audit: jest.fn() }));

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { audit } = require("../../utils/audit");
const { register } = require("../../controllers/authController");

const request = {
  body: {
    username: "worker_01",
    password: "SecurePass123",
    full_name: "Test Worker",
    phone: "9876543210",
    email: null,
    designation: "ASHA",
    district_id: 5,
    employee_ref: null,
    facility_id: 1,
    mandal_id: 2,
    village_id: 3,
    language_id: 4,
    terms_accepted: true,
  },
};

function responseHarness() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return { res, next: jest.fn() };
}

function allowRegistrationQueries(workflowColumns = 0) {
  mockPool.query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 3 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ column_count: workflowColumns }] });
  mockClient.query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{
        id: "request-1",
        full_name: "Test Worker",
        username: "worker_01",
        designation: "ASHA",
        status: "PENDING",
        created_at: new Date("2026-01-01T00:00:00Z"),
      }],
    })
    .mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  bcrypt.hash.mockResolvedValue("bcrypt-password-hash");
});

test("submission inserts only existing columns and returns a pending request without a token", async () => {
  allowRegistrationQueries();
  audit.mockResolvedValue(undefined);
  const { res, next } = responseHarness();

  await register(request, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(201);
  expect(res.body.registration.status).toBe("PENDING");
  expect(res.body).not.toHaveProperty("status_token");
  expect(res.body.message).toMatch(/pending review/i);
  expect(res.body.message).toMatch(/tracking is temporarily unavailable/i);
  expect(bcrypt.hash).toHaveBeenCalledWith("SecurePass123", 12);

  const insertCall = mockClient.query.mock.calls.find(([sql]) =>
    String(sql).includes("INSERT INTO tbl_user_registration_requests")
  );
  expect(insertCall).toBeDefined();
  const [insertSql, values] = insertCall;
  expect(insertSql).toMatch(/status,\s*workflow_version\s*\)/);
  expect(insertSql).toMatch(/'PENDING', NULL/);
  for (const column of [
    "status_token_hash",
    "status_token_expires_at",
    "mo_recommended_by",
    "mo_recommended_at",
    "mo_recommendation",
    "mo_recommendation_note",
  ]) {
    expect(insertSql).not.toContain(column);
  }
  expect(values).toHaveLength(11);
  expect(values[10]).toBe("bcrypt-password-hash");
  expect(audit).toHaveBeenCalledWith(
    request,
    expect.objectContaining({ client: mockClient, required: true, event: "REGISTRATION_SUBMITTED" })
  );
  expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
    mockClient.query.mock.invocationCallOrder[
      mockClient.query.mock.calls.findIndex(([sql]) => sql === "COMMIT")
    ]
  );
});

test("submission uses workflow version 1 and stores only a hash when the reviewed schema exists", async () => {
  allowRegistrationQueries(7);
  audit.mockResolvedValue(undefined);
  const { res, next } = responseHarness();

  await register(request, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(201);
  expect(res.body.registration.status).toBe("PENDING");
  expect(res.body.status_token).toMatch(/^[a-f0-9]{64}$/);

  const insertCall = mockClient.query.mock.calls.find(([sql]) =>
    String(sql).includes("INSERT INTO tbl_user_registration_requests")
  );
  const [insertSql, values] = insertCall;
  expect(insertSql).toContain("status_token_hash, status_token_expires_at");
  expect(insertSql).toContain("'PENDING', 1, $12, NOW() + INTERVAL '14 days'");
  expect(values[11]).toBe(crypto.createHash("sha256").update(res.body.status_token).digest("hex"));
  expect(values[11]).not.toBe(res.body.status_token);
  expect(audit).toHaveBeenCalledWith(
    request,
    expect.objectContaining({ client: mockClient, required: true, event: "REGISTRATION_SUBMITTED" })
  );
  expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
});

test("terms validation still blocks submission before any database operation", async () => {
  const invalidRequest = { body: { ...request.body, terms_accepted: false } };
  const { res, next } = responseHarness();

  await register(invalidRequest, res, next);

  expect(res.statusCode).toBe(400);
  expect(res.body.message).toBe("Please accept the terms and conditions");
  expect(next).not.toHaveBeenCalled();
  expect(mockPool.query).not.toHaveBeenCalled();
  expect(mockPool.connect).not.toHaveBeenCalled();
});

test("facility and Mandal authorization still blocks an invalid location", async () => {
  mockPool.query.mockResolvedValueOnce({ rows: [] });
  const { res, next } = responseHarness();

  await register(request, res, next);

  expect(res.statusCode).toBe(400);
  expect(res.body.message).toBe("Selected district, facility and mandal must match");
  expect(mockPool.connect).not.toHaveBeenCalled();
  expect(bcrypt.hash).not.toHaveBeenCalled();
});

test("duplicate pending applications are still rejected before insertion", async () => {
  mockPool.query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 3 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: "existing-request" }] });
  const { res, next } = responseHarness();

  await register(request, res, next);

  expect(res.statusCode).toBe(409);
  expect(res.body.message).toBe("Registration request is already pending");
  expect(mockPool.connect).not.toHaveBeenCalled();
  expect(bcrypt.hash).not.toHaveBeenCalled();
});

test("required audit failure rolls back the pending registration", async () => {
  allowRegistrationQueries();
  audit.mockRejectedValue(new Error("audit unavailable"));
  const { res, next } = responseHarness();

  await register(request, res, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "audit unavailable" }));
  expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  expect(mockClient.release).toHaveBeenCalled();
});
