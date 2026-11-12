const mockClient = { query: jest.fn(), release: jest.fn() };
const mockPool = {
  connect: jest.fn(() => mockClient),
  query: jest.fn(),
};

jest.mock("../../db", () => mockPool);
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/districtAuthorization", () => ({
  resolveAuthorizedDistrict: jest.fn(),
}));
// This suite covers the installed two-stage workflow (migration 015 columns present).
// Compatibility mode before 015 is covered in moRegistrationQueue.test.js.
jest.mock("../../utils/registrationWorkflowSchema", () => ({
  hasTwoStageRegistrationSchema: jest.fn(),
}));

const controller = require("../../controllers/registrationController");
const { audit } = require("../../utils/audit");
const { resolveAuthorizedDistrict } = require("../../utils/districtAuthorization");
const { hasTwoStageRegistrationSchema } = require("../../utils/registrationWorkflowSchema");
const realSchemaCheck = jest.requireActual("../../utils/registrationWorkflowSchema").hasTwoStageRegistrationSchema;

function useRealSchemaCheck() {
  hasTwoStageRegistrationSchema.mockImplementation(realSchemaCheck);
}

const registration = {
  id: "request-1",
  username: "worker_one",
  password_hash: "password-hash",
  full_name: "Health Worker",
  phone: "9999999999",
  email: null,
  designation: "ASHA",
  facility_id: 501,
  mandal_id: 701,
  village_id: 801,
  status: "PENDING",
  workflow_version: 1,
  status_token_hash: "c".repeat(64),
  status_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  mo_recommended_by: null,
  district_id: 101,
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
  const next = jest.fn();
  return { res, next };
}

function user(role, permissions, id = "actor-1") {
  return { id, role_name: role, permissions };
}

function makeRequest(actor, overrides = {}) {
  return {
    user: actor,
    params: { id: "3f2b6c1e-8a4d-4c2b-9e1f-5a6b7c8d9e01" },
    body: { action: "APPROVE", remarks: "Verified details" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  hasTwoStageRegistrationSchema.mockResolvedValue(true);
  resolveAuthorizedDistrict.mockResolvedValue(101);
  mockPool.connect.mockReturnValue(mockClient);
  mockPool.query.mockResolvedValue({ rows: [] });
  mockClient.query.mockImplementation(async (sql) => {
    const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select id, username, mandal_id, status, workflow_version")) {
      return { rows: [{ ...registration }] };
    }
    if (query.includes("from tbl_medical_officer_mandal_assignments")) {
      return { rows: [{ id: "assignment-1" }] };
    }
    if (query.startsWith("select r.*, f.district_id")) {
      return { rows: [{ ...registration }] };
    }
    if (query.startsWith("select id from mst_roles")) return { rows: [{ id: 2 }] };
    if (query.startsWith("select f.district_id")) return { rows: [{ district_id: 101 }] };
    if (query.startsWith("insert into tbl_users")) return { rows: [{ id: "worker-id" }] };
    return { rows: [] };
  });
});

describe("two-stage registration controller", () => {
  test("Medical Officer queue returns only pending requests in currently assigned Mandals", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "request-1", mandal_id: 701 }] });
    const { res, next } = responseHarness();

    await controller.listForMedicalOfficer(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1")),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.body.registrations).toEqual([{ id: "request-1", mandal_id: 701 }]);
    const [query, parameters] = mockPool.query.mock.calls[0];
    expect(parameters).toEqual(["mo-1"]);
    expect(query).toContain("r.status = 'PENDING'");
    expect(query).toContain("r.workflow_version = 1");
    expect(query).toContain("a.mandal_id = r.mandal_id");
    expect(query).toContain("a.valid_from <= CURRENT_DATE");
    expect(query).toContain("a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE");
    expect(query).toContain("u.status = 'ACTIVE'");
    expect(query).toContain("role.code = 'MEDICAL_OFFICER'");
    expect(query).toContain("mandal.is_active IS TRUE");
  });

  test("Medical Officer recommendation history is limited to the actor's current assigned Mandals", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "request-1", mandal_id: 701 }] });
    const { res, next } = responseHarness();

    await controller.listMedicalOfficerHistory(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1")),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.body.registrations).toHaveLength(1);
    const [query, parameters] = mockPool.query.mock.calls[0];
    expect(parameters).toEqual(["mo-1"]);
    expect(query).toContain("r.mo_recommended_by = $1");
    expect(query).toContain("a.mandal_id = r.mandal_id");
    expect(query).toContain("a.valid_from <= CURRENT_DATE");
    expect(query).toContain("assigned_mandal.is_active IS TRUE");
  });

  test("District Admin decision history is restricted to the assigned district", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: "request-1", status: "APPROVED" }] });
    const { res, next } = responseHarness();

    await controller.listDistrictAdminHistory(
      makeRequest(user("DISTRICT_ADMIN", ["registration.monitor"], "da-1")),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.body.registrations).toHaveLength(1);
    const [query, parameters] = mockPool.query.mock.calls[0];
    expect(parameters).toEqual([101]);
    expect(query).toContain("r.status IN ('APPROVED', 'REJECTED')");
    expect(query).toContain("f.district_id = $1");
  });

  test("non-Medical-Officer cannot query the MO queue", async () => {
    const { res, next } = responseHarness();

    await controller.listForMedicalOfficer(
      makeRequest(user("DISTRICT_ADMIN", ["registration.recommend"], "da-1")),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("Medical Officers cannot make final decisions", async () => {
    const { res, next } = responseHarness();
    await controller.decide(makeRequest(user("MEDICAL_OFFICER", ["registration.finalize"])), res, next);

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  test("Medical Officer recommendation rechecks Mandal assignment inside the transaction", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select id, username, mandal_id, status, workflow_version")) {
        return { rows: [{ ...registration }] };
      }
      if (query.includes("from tbl_medical_officer_mandal_assignments")) return { rows: [] };
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.recommend(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1"), {
        body: { action: "RECOMMENDED", remarks: "Verified details" },
      }),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(403);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE tbl_user_registration_requests"))).toBe(false);
  });

  test.each(["RECOMMENDED", "NOT_RECOMMENDED"])(
    "assigned Medical Officer records %s and audits before commit",
    async (action) => {
    const { res, next } = responseHarness();
    await controller.recommend(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1"), {
        body: { action, remarks: "Verified details" },
      }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.actor_id', $1, TRUE)",
      ["mo-1"]
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("SET mo_recommended_by = $1"),
      ["mo-1", action, "Verified details", "request-1"]
    );
    expect(audit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ client: mockClient, required: true, event: "REGISTRATION_RECOMMENDED" })
    );
    const commitOrder = mockClient.query.mock.invocationCallOrder[
      mockClient.query.mock.calls.findIndex(([sql]) => sql === "COMMIT")
    ];
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(commitOrder);
    }
  );

  test.each(["APPROVE", "REJECT"])(
    "Medical Officer cannot submit the retired %s recommendation action",
    async (action) => {
      const { res, next } = responseHarness();
      await controller.recommend(
        makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1"), {
          body: { action, remarks: "Verified details" },
        }),
        res,
        next
      );

      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockPool.connect).not.toHaveBeenCalled();
    }
  );

  test("a concurrent duplicate recommendation is rejected after the request row is locked", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select id, username, mandal_id, status, workflow_version")) {
        return { rows: [{ ...registration, mo_recommended_by: "first-mo" }] };
      }
      if (query.includes("from tbl_medical_officer_mandal_assignments")) {
        return { rows: [{ id: "assignment-1" }] };
      }
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.recommend(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "second-mo"), {
        body: { action: "RECOMMENDED", remarks: "Verified details" },
      }),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(409);
    expect(mockClient.query.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes("for update")
    )).toBe(true);
    expect(mockClient.query.mock.calls.some(([sql]) =>
      String(sql).includes("SET mo_recommended_by = $1")
    )).toBe(false);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  test("required recommendation audit failure rolls back the recommendation", async () => {
    audit.mockRejectedValueOnce(new Error("audit unavailable"));
    const { res, next } = responseHarness();

    await controller.recommend(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "mo-1"), {
        body: { action: "RECOMMENDED", remarks: "Verified details" },
      }),
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "audit unavailable" }));
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  });

  test("recommendation identity comes from the authenticated actor, not a body-supplied actor ID", async () => {
    const { res, next } = responseHarness();
    await controller.recommend(
      makeRequest(user("MEDICAL_OFFICER", ["registration.recommend"], "authenticated-mo"), {
        body: {
          action: "RECOMMENDED",
          remarks: "Verified details",
          actor_id: "attacker-selected-id",
        },
      }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.actor_id', $1, TRUE)",
      ["authenticated-mo"]
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("SET mo_recommended_by = $1"),
      ["authenticated-mo", "RECOMMENDED", "Verified details", "request-1"]
    );
  });

  test("District Admin cannot decide a request in another district", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select r.*, f.district_id")) {
        return { rows: [{ ...registration, district_id: 202, mo_recommended_by: "mo-1" }] };
      }
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1")),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(404);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO tbl_users"))).toBe(false);
  });

  test("a missing MO recommendation prevents a final decision", async () => {
    const { res, next } = responseHarness();
    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1")),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(409);
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO tbl_users"))).toBe(false);
  });

  test("approval creates the account and assignments before audited commit in one transaction", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select r.*, f.district_id")) {
        return { rows: [{ ...registration, mo_recommended_by: "mo-1" }] };
      }
      if (query.startsWith("select id from mst_roles")) return { rows: [{ id: 2 }] };
      if (query.startsWith("select f.district_id")) return { rows: [{ district_id: 101 }] };
      if (query.startsWith("insert into tbl_users")) return { rows: [{ id: "worker-id" }] };
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1")),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const queries = mockClient.query.mock.calls.map(([sql]) => String(sql));
    const beginAt = queries.indexOf("BEGIN");
    const facilityAssignmentAt = queries.findIndex((sql) => sql.includes("INSERT INTO tbl_user_facility_assignments"));
    const locationAssignmentAt = queries.findIndex((sql) => sql.includes("INSERT INTO tbl_health_worker_location_assignments"));
    expect(beginAt).toBe(0);
    expect(facilityAssignmentAt).toBeGreaterThan(beginAt);
    expect(locationAssignmentAt).toBeGreaterThan(facilityAssignmentAt);
    expect(audit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ client: mockClient, required: true, event: "REGISTRATION_APPROVED" })
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.actor_id', $1, TRUE)",
      ["da-1"]
    );
    expect(queries[queries.length - 1]).toBe("COMMIT");
    const commitOrder = mockClient.query.mock.invocationCallOrder[queries.length - 1];
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(commitOrder);
  });

  test("rejection records a reason without creating an account", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select r.*, f.district_id")) {
        return { rows: [{ ...registration, mo_recommended_by: "mo-1" }] };
      }
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1"), {
        body: { action: "REJECT", rejection_reason: "Incomplete application" },
      }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO tbl_users"))).toBe(false);
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("rejection_reason = $3"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ client: mockClient, required: true, event: "REGISTRATION_REJECTED" })
    );
  });

  test("duplicate final decisions are rejected while the request row is locked", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select r.*, f.district_id")) {
        return { rows: [{ ...registration, status: "APPROVED", mo_recommended_by: "mo-1" }] };
      }
      return { rows: [] };
    });
    const { res, next } = responseHarness();

    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1")),
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(409);
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("for update of r"))).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  test("audit failure rolls back the final decision", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select r.*, f.district_id")) {
        return { rows: [{ ...registration, mo_recommended_by: "mo-1" }] };
      }
      if (query.startsWith("select id from mst_roles")) return { rows: [{ id: 2 }] };
      if (query.startsWith("select f.district_id")) return { rows: [{ district_id: 101 }] };
      if (query.startsWith("insert into tbl_users")) return { rows: [{ id: "worker-id" }] };
      return { rows: [] };
    });
    audit.mockRejectedValueOnce(new Error("audit unavailable"));
    const { res, next } = responseHarness();

    await controller.decide(
      makeRequest(user("DISTRICT_ADMIN", ["registration.finalize"], "da-1")),
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "audit unavailable" }));
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  });

  test("invalid and expired applicant status tokens are rejected", async () => {
    useRealSchemaCheck();
    const invalid = responseHarness();
    await controller.applicantStatus({ body: { status_token: "bad" } }, invalid.res, invalid.next);
    expect(invalid.next.mock.calls[0][0].status).toBe(404);
    expect(mockPool.query).not.toHaveBeenCalled();

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ column_count: 7 }] })
      .mockResolvedValueOnce({ rows: [] });
    const expired = responseHarness();
    await controller.applicantStatus(
      { body: { status_token: "a".repeat(64) } },
      expired.res,
      expired.next
    );
    expect(expired.next.mock.calls[0][0].status).toBe(404);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status_token_expires_at > NOW()"),
      [controller.hashStatusToken("a".repeat(64))]
    );
  });

  test("status lookup does not reference proposed columns until the schema is available", async () => {
    useRealSchemaCheck();
    mockPool.query.mockResolvedValueOnce({ rows: [{ column_count: 1 }] });
    const { res, next } = responseHarness();

    await controller.applicantStatus(
      { body: { status_token: "a".repeat(64) } },
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(404);
    expect(res.body).toBeUndefined();
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0][0]).toContain("information_schema.columns");
    expect(mockPool.query.mock.calls[0][0]).not.toContain("status_token_hash");
  });

  test("valid applicant token returns progress without applicant identity fields", async () => {
    useRealSchemaCheck();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ column_count: 7 }] })
      .mockResolvedValueOnce({
        rows: [{
          status: "PENDING",
          created_at: new Date("2026-01-01T00:00:00Z"),
          mo_recommendation: "NOT_RECOMMENDED",
          mo_recommendation_note: "Documents require correction",
          mo_recommended_at: new Date("2026-01-02T00:00:00Z"),
          reviewed_at: null,
          rejection_reason: null,
        }],
      });
    const { res, next } = responseHarness();

    await controller.applicantStatus(
      { body: { status_token: "a".repeat(64), username: "ignored" } },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.body.status).toBe("PENDING");
    expect(res.body.recommendation).toBe("NOT_RECOMMENDED");
    expect(res.body).not.toHaveProperty("full_name");
    expect(res.body).not.toHaveProperty("username");
  });

  test("legacy pending applicants without a stored token cannot retrieve status through personal data", async () => {
    useRealSchemaCheck();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ column_count: 7 }] })
      .mockResolvedValueOnce({ rows: [] });
    const { res, next } = responseHarness();

    await controller.applicantStatus(
      {
        body: {
          status_token: "a".repeat(64),
          username: "legacy-applicant",
          phone: "9999999999",
        },
      },
      res,
      next
    );

    expect(next.mock.calls[0][0].status).toBe(404);
    expect(res.body).toBeUndefined();
    const [query, parameters] = mockPool.query.mock.calls[1];
    expect(query).toContain("WHERE status_token_hash = $1");
    expect(query).toContain("status_token_expires_at > NOW()");
    expect(query).not.toMatch(/username|phone|full_name/i);
    expect(parameters).toEqual([controller.hashStatusToken("a".repeat(64))]);
  });
});
