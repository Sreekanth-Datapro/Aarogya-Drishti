// End-to-end scenarios of the two-stage Health Worker registration workflow:
// Medical Officer recommends (or not), District Admin makes the final decision.
// The database is replaced by a small in-memory model with real transaction
// behaviour: writes are only kept on COMMIT and are thrown away on ROLLBACK.

const REQUEST_ID = "3f2b6c1e-8a4d-4c2b-9e1f-5a6b7c8d9e01";
const OTHER_MANDAL_REQUEST_ID = "3f2b6c1e-8a4d-4c2b-9e1f-5a6b7c8d9e02";

const mockDb = {
  requests: {},
  users: [],
  facilityAssignments: [],
  locationAssignments: [],
  audits: [],
  moMandals: { "mo-1": [701] },
  failLocationInsert: false,
  staged: null,
  statements: [],
};

function mockFindRequest(id) {
  return mockDb.requests[id] ? { ...mockDb.requests[id] } : undefined;
}

const mockClient = {
  release: jest.fn(),
  query: jest.fn(async (sql, params = []) => {
    const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    mockDb.statements.push(query);
    if (query === "begin") {
      mockDb.staged = { request: null, users: [], facility: [], location: [], audits: [] };
      return { rows: [] };
    }
    if (query === "commit") {
      const staged = mockDb.staged;
      if (staged.request) Object.assign(mockDb.requests[staged.request.id], staged.request.changes);
      mockDb.users.push(...staged.users);
      mockDb.facilityAssignments.push(...staged.facility);
      mockDb.locationAssignments.push(...staged.location);
      mockDb.audits.push(...staged.audits);
      mockDb.staged = null;
      return { rows: [] };
    }
    if (query === "rollback") {
      mockDb.staged = null;
      return { rows: [] };
    }
    if (query.startsWith("select set_config")) return { rows: [] };

    // recommend: lock the request row
    if (query.startsWith("select id, username, mandal_id, status, workflow_version")) {
      const row = mockFindRequest(params[0]);
      return { rows: row ? [row] : [] };
    }
    // recommend: is the signed-in MO assigned to the request's Mandal?
    if (query.includes("from tbl_medical_officer_mandal_assignments")) {
      const [userId, mandalId] = params;
      return { rows: (mockDb.moMandals[userId] || []).includes(Number(mandalId)) ? [{ id: "assignment-1" }] : [] };
    }
    // decide: lock the request row with its facility district
    if (query.startsWith("select r.*, f.district_id")) {
      const row = mockFindRequest(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("select id from mst_roles")) return { rows: [{ id: 2 }] };
    if (query.startsWith("select f.district_id")) return { rows: [{ district_id: 101 }] };
    if (query.startsWith("insert into tbl_users")) {
      const user = { id: `user-${mockDb.users.length + 1}`, username: params[0], status: query.includes("'active'") ? "ACTIVE" : "UNKNOWN" };
      mockDb.staged.users.push(user);
      return { rows: [{ id: user.id }] };
    }
    if (query.startsWith("insert into tbl_user_facility_assignments")) {
      mockDb.staged.facility.push({ user_id: params[0], facility_id: params[1] });
      return { rows: [] };
    }
    if (query.startsWith("insert into tbl_health_worker_location_assignments")) {
      if (mockDb.failLocationInsert) throw new Error("location assignment failed");
      mockDb.staged.location.push({ user_id: params[0], mandal_id: params[2] });
      return { rows: [] };
    }
    if (query.startsWith("update tbl_user_registration_requests set mo_recommended_by")) {
      const [moId, recommendation, note, id] = params;
      mockDb.staged.request = {
        id,
        changes: { mo_recommended_by: moId, mo_recommendation: recommendation, mo_recommendation_note: note, mo_recommended_at: "2026-11-07T10:00:00Z" },
      };
      return { rows: [{ mo_recommended_at: "2026-11-07T10:00:00Z" }] };
    }
    if (query.startsWith("update tbl_user_registration_requests set status")) {
      const [status, reviewedBy, rejectionReason, createdUserId, id] = params;
      mockDb.staged.request = {
        id,
        changes: { status, reviewed_by: reviewedBy, rejection_reason: rejectionReason, created_user_id: createdUserId },
      };
      return { rows: [{ reviewed_at: "2026-11-07T12:00:00Z" }] };
    }
    throw new Error(`Unexpected query in test: ${query}`);
  }),
};

const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn(),
};

jest.mock("../../db", () => mockPool);
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async (_req, options) => {
    if (!options.client || !mockDb.staged) throw new Error("audit must run inside the transaction");
    mockDb.staged.audits.push(options);
  }),
}));
jest.mock("../../utils/districtAuthorization", () => ({ resolveAuthorizedDistrict: jest.fn() }));
jest.mock("../../utils/registrationWorkflowSchema", () => ({ hasTwoStageRegistrationSchema: jest.fn() }));

const controller = require("../../controllers/registrationController");
const { resolveAuthorizedDistrict } = require("../../utils/districtAuthorization");
const { hasTwoStageRegistrationSchema } = require("../../utils/registrationWorkflowSchema");

const MO = { id: "mo-1", role_name: "MEDICAL_OFFICER", permissions: ["registration.recommend"] };
const OTHER_MO = { id: "mo-2", role_name: "MEDICAL_OFFICER", permissions: ["registration.recommend"] };
const DA = { id: "da-1", role_name: "DISTRICT_ADMIN", permissions: ["registration.monitor", "registration.finalize"] };

function newRequest(id, mandalId, districtId = 101) {
  return {
    id,
    username: `worker_${id.slice(-2)}`,
    password_hash: "secret-password-hash",
    full_name: "Applicant",
    phone: "9999999999",
    email: null,
    designation: "ASHA",
    facility_id: 501,
    mandal_id: mandalId,
    village_id: 801,
    district_id: districtId,
    status: "PENDING",
    workflow_version: 1,
    mo_recommended_by: null,
    mo_recommendation: null,
    reviewed_by: null,
    created_user_id: null,
  };
}

async function call(handler, user, { params = { id: REQUEST_ID }, body = {}, query = {} } = {}) {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  let error = null;
  await handler({ user, params, body, query }, res, (err) => { error = err; });
  return { res, error };
}

const recommend = (outcome, user = MO, id = REQUEST_ID) =>
  call(controller.recommend, user, { params: { id }, body: { action: outcome, remarks: `MO remarks: ${outcome}` } });
const decide = (action, reason) =>
  call(controller.decide, DA, { body: { action, rejection_reason: reason } });

const activeAccounts = () => mockDb.users.filter((user) => user.status === "ACTIVE");

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDb, {
    requests: {
      [REQUEST_ID]: newRequest(REQUEST_ID, 701),
      [OTHER_MANDAL_REQUEST_ID]: newRequest(OTHER_MANDAL_REQUEST_ID, 999),
    },
    users: [],
    facilityAssignments: [],
    locationAssignments: [],
    audits: [],
    failLocationInsert: false,
    staged: null,
    statements: [],
  });
  hasTwoStageRegistrationSchema.mockResolvedValue(true);
  resolveAuthorizedDistrict.mockResolvedValue(101);
});

describe("District Admin final decision is authoritative for both MO outcomes", () => {
  test.each([
    ["RECOMMENDED", "APPROVE", "APPROVED", 1],
    ["RECOMMENDED", "REJECT", "REJECTED", 0],
    ["NOT_RECOMMENDED", "APPROVE", "APPROVED", 1],
    ["NOT_RECOMMENDED", "REJECT", "REJECTED", 0],
  ])("MO %s, DA %s: request becomes %s with %i active account(s)", async (outcome, action, finalStatus, accounts) => {
    const recommendation = await recommend(outcome);
    expect(recommendation.error).toBeNull();
    // The MO recommendation never decides the request and never creates an account
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
    expect(mockDb.requests[REQUEST_ID].mo_recommendation).toBe(outcome);
    expect(mockDb.requests[REQUEST_ID].mo_recommended_by).toBe("mo-1");
    expect(mockDb.users).toHaveLength(0);
    expect(recommendation.res.body.recommendation).toMatchObject({ status: "PENDING", mo_recommendation: outcome });

    const decision = await decide(action, action === "REJECT" ? "Documents could not be verified" : undefined);
    expect(decision.error).toBeNull();

    const request = mockDb.requests[REQUEST_ID];
    expect(request.status).toBe(finalStatus);
    expect(request.reviewed_by).toBe("da-1");
    // The MO recommendation is kept unchanged next to the final decision
    expect(request.mo_recommendation).toBe(outcome);
    expect(activeAccounts()).toHaveLength(accounts);

    if (action === "APPROVE") {
      expect(request.created_user_id).toBe(activeAccounts()[0].id);
      expect(mockDb.facilityAssignments).toHaveLength(1);
      expect(mockDb.locationAssignments).toEqual([{ user_id: request.created_user_id, mandal_id: 701 }]);
      expect(decision.res.body.decision.account).toEqual({ user_id: request.created_user_id, username: request.username, status: "ACTIVE" });
    } else {
      expect(request.created_user_id).toBeNull();
      expect(request.rejection_reason).toBe("Documents could not be verified");
      expect(mockDb.facilityAssignments).toHaveLength(0);
      expect(decision.res.body.decision.account).toBeNull();
    }
    expect(JSON.stringify(decision.res.body)).not.toContain("secret-password-hash");
  });

  test("final rejection requires a reason", async () => {
    await recommend("RECOMMENDED");
    const { error } = await decide("REJECT", "   ");
    expect(error).toMatchObject({ status: 400, code: "INVALID_FINAL_DECISION" });
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
  });
});

describe("role separation", () => {
  test("a Medical Officer cannot approve or reject finally", async () => {
    await recommend("RECOMMENDED");
    for (const action of ["APPROVE", "REJECT"]) {
      const { error } = await call(controller.decide, { ...MO, permissions: ["registration.recommend", "registration.finalize"] }, {
        body: { action, rejection_reason: "x" },
      });
      expect(error).toMatchObject({ status: 403 });
    }
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
    expect(mockDb.users).toHaveLength(0);
  });

  test("a District Admin cannot record a Medical Officer recommendation", async () => {
    const { error } = await recommend("RECOMMENDED", { ...DA, permissions: [...DA.permissions, "registration.recommend"] });
    expect(error).toMatchObject({ status: 403 });
    expect(mockDb.requests[REQUEST_ID].mo_recommended_by).toBeNull();
  });

  test.each([
    ["Health Worker", { id: "hw-1", role_name: "HEALTH_WORKER", permissions: ["registration.recommend", "registration.finalize", "registration.monitor"] }],
    ["Super Admin", { id: "sa-1", role_name: "SUPER_ADMIN", permissions: ["registration.monitor"] }],
    ["Medical Officer without permission", { id: "mo-1", role_name: "MEDICAL_OFFICER", permissions: [] }],
    ["District Admin without permission", { id: "da-1", role_name: "DISTRICT_ADMIN", permissions: [] }],
    ["unauthenticated caller", undefined],
  ])("%s cannot use either workflow", async (_label, user) => {
    const attempts = [
      await call(controller.listForMedicalOfficer, user),
      await call(controller.recommend, user, { body: { action: "RECOMMENDED", remarks: "x" } }),
      await call(controller.listForDistrictAdmin, user),
      await call(controller.decide, user, { body: { action: "APPROVE" } }),
    ];
    attempts.forEach(({ error }) => expect(error).toMatchObject({ status: 403 }));
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  test("a District Admin with only registration.monitor can view but not finalize", async () => {
    const viewer = { ...DA, permissions: ["registration.monitor"] };
    mockPool.query.mockResolvedValue({ rows: [] });
    const list = await call(controller.listForDistrictAdmin, viewer);
    expect(list.error).toBeNull();
    expect(list.res.body.workflow.can_finalize).toBe(false);
    const { error } = await call(controller.decide, viewer, { body: { action: "APPROVE" } });
    expect(error).toMatchObject({ status: 403 });
  });
});

describe("Mandal and district scope", () => {
  test("a Medical Officer cannot recommend an application of another Mandal", async () => {
    const { error } = await recommend("RECOMMENDED", MO, OTHER_MANDAL_REQUEST_ID);
    expect(error).toMatchObject({ status: 403, code: "MANDAL_NOT_ASSIGNED" });
    expect(mockDb.requests[OTHER_MANDAL_REQUEST_ID].mo_recommended_by).toBeNull();
    expect(mockDb.audits).toHaveLength(0);
  });

  test("a Medical Officer assigned elsewhere cannot recommend this Mandal's application", async () => {
    mockDb.moMandals["mo-2"] = [999];
    const { error } = await recommend("RECOMMENDED", OTHER_MO);
    expect(error).toMatchObject({ status: 403 });
  });

  test("the MO queue and details are scoped by the signed-in MO, never by a Mandal sent from the browser", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await call(controller.listForMedicalOfficer, MO, { query: { mandal_id: "999" } });
    const [listSql, listParams] = mockPool.query.mock.calls[0];
    expect(listParams).toEqual(["mo-1"]);
    expect(listSql).toContain("a.user_id = $1");
    expect(listSql).toContain("a.mandal_id = r.mandal_id");

    mockPool.query.mockClear();
    const { error } = await call(controller.getForMedicalOfficer, MO, { params: { id: OTHER_MANDAL_REQUEST_ID }, query: { mandal_id: "999" } });
    expect(error).toMatchObject({ status: 404 });
    expect(mockPool.query.mock.calls[0][1]).toEqual(["mo-1", OTHER_MANDAL_REQUEST_ID]);
  });

  test("a District Admin cannot view another district's applications", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await call(controller.listForDistrictAdmin, DA, { query: { district_id: "202" } });
    await call(controller.listDistrictAdminHistory, DA, { query: { district_id: "202" } });
    const listCalls = mockPool.query.mock.calls.filter(([sql]) => sql.includes("FROM tbl_user_registration_requests r"));
    expect(listCalls.length).toBeGreaterThanOrEqual(3);
    listCalls.forEach(([sql, params]) => {
      expect(sql).toContain("f.district_id = $1");
      expect(params).toEqual([101]);
    });
  });

  test("a District Admin cannot decide an application of another district", async () => {
    mockDb.requests[REQUEST_ID] = { ...newRequest(REQUEST_ID, 701, 202), mo_recommended_by: "mo-9", mo_recommendation: "RECOMMENDED" };
    const { error } = await decide("APPROVE");
    expect(error).toMatchObject({ status: 404 });
    expect(mockDb.users).toHaveLength(0);
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
  });
});

describe("District Admin queue", () => {
  test("shows BOTH recommendation outcomes and does not filter NOT_RECOMMENDED", async () => {
    const rows = [
      { id: "a", mo_recommendation: "RECOMMENDED" },
      { id: "b", mo_recommendation: "NOT_RECOMMENDED" },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] });
    const { res, error } = await call(controller.listForDistrictAdmin, DA);
    expect(error).toBeNull();
    expect(res.body.registrations.map((row) => row.mo_recommendation)).toEqual(["RECOMMENDED", "NOT_RECOMMENDED"]);
    expect(res.body.awaiting_mo_review).toBe(3);
    const [sql] = mockPool.query.mock.calls[0];
    expect(sql).toContain("r.mo_recommended_by IS NOT NULL");
    expect(sql).not.toMatch(/mo_recommendation\s*(=|IN)/i);
    expect(sql).not.toMatch(/password_hash|status_token/);
  });

  test("before migration 015 the queue is empty with a clear flag instead of an error", async () => {
    hasTwoStageRegistrationSchema.mockResolvedValue(false);
    mockPool.query.mockResolvedValueOnce({ rows: [{ count: 2 }] });
    const { res, error } = await call(controller.listForDistrictAdmin, DA);
    expect(error).toBeNull();
    expect(res.body).toMatchObject({ registrations: [], awaiting_mo_review: 2, workflow: { two_stage: false, can_finalize: false } });
    expect(mockPool.query.mock.calls[0][0]).not.toContain("mo_recommend");

    const decision = await decide("APPROVE");
    expect(decision.error).toMatchObject({ status: 409, code: "TWO_STAGE_WORKFLOW_UNAVAILABLE" });
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});

describe("duplicate protection", () => {
  test("a second final decision is blocked and creates no second account", async () => {
    await recommend("RECOMMENDED");
    expect((await decide("APPROVE")).error).toBeNull();
    const second = await decide("REJECT", "Changed my mind");
    expect(second.error).toMatchObject({ status: 409, code: "REGISTRATION_FINALIZED" });
    expect(mockDb.requests[REQUEST_ID].status).toBe("APPROVED");
    expect(activeAccounts()).toHaveLength(1);
  });

  test("a second recommendation is blocked and the first one is kept", async () => {
    await recommend("RECOMMENDED");
    const second = await recommend("NOT_RECOMMENDED");
    expect(second.error).toMatchObject({ status: 409, code: "RECOMMENDATION_EXISTS" });
    expect(mockDb.requests[REQUEST_ID].mo_recommendation).toBe("RECOMMENDED");
  });

  test("a final decision needs a Medical Officer recommendation first", async () => {
    const { error } = await decide("APPROVE");
    expect(error).toMatchObject({ status: 409, code: "RECOMMENDATION_REQUIRED" });
    expect(mockDb.users).toHaveLength(0);
  });

  test("invalid request IDs are rejected before any database work", async () => {
    for (const id of ["1 OR 1=1", "request-1", ""]) {
      expect((await call(controller.decide, DA, { params: { id }, body: { action: "APPROVE" } })).error)
        .toMatchObject({ status: 400, code: "INVALID_REGISTRATION" });
      expect((await call(controller.recommend, MO, { params: { id }, body: { action: "RECOMMENDED", remarks: "x" } })).error)
        .toMatchObject({ status: 400, code: "INVALID_REGISTRATION" });
    }
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});

describe("audit and rollback", () => {
  test("recommendation and final decision are both audited inside their transactions", async () => {
    await recommend("NOT_RECOMMENDED");
    await decide("APPROVE");
    expect(mockDb.audits.map((entry) => entry.event)).toEqual(["REGISTRATION_RECOMMENDED", "REGISTRATION_APPROVED"]);
    mockDb.audits.forEach((entry) => {
      expect(entry.required).toBe(true);
      expect(entry.resourceType).toBe("registration_request");
      expect(entry.resourceId).toBe(REQUEST_ID);
      expect(JSON.stringify(entry.metadata)).not.toContain("secret-password-hash");
    });
    expect(mockDb.audits[0].metadata.recommendation).toBe("NOT_RECOMMENDED");
    expect(mockDb.audits[1].metadata.created_user_id).toBe(mockDb.requests[REQUEST_ID].created_user_id);
  });

  test("a final rejection is audited and creates no account", async () => {
    await recommend("RECOMMENDED");
    await decide("REJECT", "Not eligible");
    expect(mockDb.audits.map((entry) => entry.event)).toEqual(["REGISTRATION_RECOMMENDED", "REGISTRATION_REJECTED"]);
    expect(mockDb.audits[1].metadata.created_user_id).toBeNull();
  });

  test("a failed approval rolls back the user, the assignments and the decision", async () => {
    await recommend("RECOMMENDED");
    mockDb.failLocationInsert = true;
    const { error } = await decide("APPROVE");
    expect(error).toEqual(expect.objectContaining({ message: "location assignment failed" }));
    expect(mockDb.statements).toContain("rollback");
    expect(mockDb.users).toHaveLength(0);
    expect(mockDb.facilityAssignments).toHaveLength(0);
    expect(mockDb.locationAssignments).toHaveLength(0);
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
    expect(mockDb.audits.map((entry) => entry.event)).toEqual(["REGISTRATION_RECOMMENDED"]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  test("a failed audit write rolls back the approval", async () => {
    await recommend("RECOMMENDED");
    const { audit } = require("../../utils/audit");
    audit.mockRejectedValueOnce(new Error("audit unavailable"));
    const { error } = await decide("APPROVE");
    expect(error).toEqual(expect.objectContaining({ message: "audit unavailable" }));
    expect(mockDb.users).toHaveLength(0);
    expect(mockDb.requests[REQUEST_ID].status).toBe("PENDING");
  });
});
