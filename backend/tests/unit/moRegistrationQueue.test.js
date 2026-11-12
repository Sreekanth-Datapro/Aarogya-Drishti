// Medical Officer registration queue: compatible with the schema before and after
// migration 015, Mandal-scoped, and never a final decision.

let mockTwoStage = false;
let mockRows = [];
const mockQueries = [];

jest.mock("../../db", () => {
  const client = {
    query: jest.fn(async (sql, params) => {
      mockQueries.push({ sql, params });
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return {
    query: jest.fn(async (sql, params) => {
      mockQueries.push({ sql, params });
      if (sql.includes("information_schema.columns")) return { rows: [{ column_count: mockTwoStage ? 7 : 1 }] };
      if (sql.includes("FROM tbl_audit_logs")) return { rows: [] };
      return { rows: mockRows };
    }),
    connect: jest.fn(async () => client),
  };
});
jest.mock("../../utils/audit", () => ({ audit: jest.fn() }));

const controller = require("../../controllers/registrationController");

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function mo(permissions = ["registration.verify"]) {
  return { id: "mo-1", role_name: "MEDICAL_OFFICER", role: "MEDICAL_OFFICER", permissions };
}

async function run(handler, { user = mo(), query = {}, params = {}, body = {} } = {}) {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  let error = null;
  await handler({ user, query, params, body }, res, (err) => { error = err; });
  return { res, error };
}

const queueQuery = () => mockQueries.find((query) => query.sql.includes("FROM tbl_user_registration_requests r"));

beforeEach(() => {
  mockQueries.length = 0;
  mockRows = [];
  mockTwoStage = false;
});

describe("before migration 015 (compatibility schema)", () => {
  test("pending compatibility requests (workflow_version NULL) are listed, scoped to the MO's Mandals", async () => {
    mockRows = [{ id: "r-1", workflow_version: null, status: "PENDING" }];
    const { res, error } = await run(controller.listForMedicalOfficer);

    expect(error).toBeNull();
    expect(res.body.registrations).toHaveLength(1);
    expect(res.body.workflow).toEqual({ two_stage: false, can_recommend: false });
    const sql = queueQuery().sql;
    expect(sql).toContain("r.workflow_version IS NULL OR r.workflow_version = 1");
    expect(sql).toContain("r.status = 'PENDING'");
    expect(sql).toContain("tbl_medical_officer_mandal_assignments");
    expect(sql).not.toMatch(/r\.mo_recommend/);
    expect(queueQuery().params).toEqual(["mo-1"]);
  });

  test("a recommendation is refused clearly and nothing is written", async () => {
    const { error } = await run(controller.recommend, {
      params: { id: REQUEST_ID },
      body: { action: "RECOMMENDED", remarks: "Documents verified" },
    });
    expect(error).toMatchObject({ status: 409, code: "TWO_STAGE_WORKFLOW_UNAVAILABLE" });
    expect(mockQueries.some((query) => query.sql.includes("UPDATE tbl_user_registration_requests"))).toBe(false);
  });

  test("recommendation history is empty because no recommendation columns exist yet", async () => {
    const { res } = await run(controller.listMedicalOfficerHistory);
    expect(res.body.registrations).toEqual([]);
    expect(queueQuery()).toBeUndefined();
  });
});

describe("after migration 015 (two-stage schema)", () => {
  beforeEach(() => {
    mockTwoStage = true;
  });

  test("the default view hides requests that already have a recommendation", async () => {
    await run(controller.listForMedicalOfficer);
    expect(queueQuery().sql).toContain("AND r.mo_recommended_by IS NULL");
    expect(queueQuery().sql).toContain("r.mo_recommendation");
  });

  test("view=all also shows recommended requests", async () => {
    await run(controller.listForMedicalOfficer, { query: { view: "all" } });
    expect(queueQuery().sql).not.toContain("AND r.mo_recommended_by IS NULL");
  });
});

describe("access rules", () => {
  test("registration.recommend or registration.verify is accepted; other roles are refused", async () => {
    expect((await run(controller.listForMedicalOfficer, { user: mo(["registration.recommend"]) })).error).toBeNull();
    expect((await run(controller.listForMedicalOfficer, { user: mo(["registration.verify"]) })).error).toBeNull();
    expect((await run(controller.listForMedicalOfficer, { user: mo([]) })).error).toMatchObject({ status: 403 });
    const da = { id: "da-1", role_name: "DISTRICT_ADMIN", permissions: ["registration.verify", "registration.recommend"] };
    expect((await run(controller.listForMedicalOfficer, { user: da })).error).toMatchObject({ status: 403 });
  });

  test("recommendation values are limited and remarks are required", async () => {
    expect((await run(controller.recommend, { params: { id: REQUEST_ID }, body: { action: "APPROVED", remarks: "x" } })).error)
      .toMatchObject({ status: 400, code: "INVALID_RECOMMENDATION" });
    expect((await run(controller.recommend, { params: { id: REQUEST_ID }, body: { action: "RECOMMENDED", remarks: "  " } })).error)
      .toMatchObject({ status: 400, code: "INVALID_RECOMMENDATION" });
    expect((await run(controller.recommend, { params: { id: "r-1" }, body: { action: "RECOMMENDED", remarks: "ok" } })).error)
      .toMatchObject({ status: 400, code: "INVALID_REGISTRATION" });
  });

  test("details are only returned inside the MO's Mandal scope", async () => {
    mockRows = [];
    const id = "11111111-1111-4111-8111-111111111111";
    const { error } = await run(controller.getForMedicalOfficer, { params: { id } });
    expect(error).toMatchObject({ status: 404 });
    const detailQuery = mockQueries.find((query) => query.sql.includes("WHERE r.id = $2"));
    expect(detailQuery.sql).toContain("tbl_medical_officer_mandal_assignments");
    expect(detailQuery.params).toEqual(["mo-1", id]);
  });

  test("an invalid request id is rejected before any query", async () => {
    const { error } = await run(controller.getForMedicalOfficer, { params: { id: "1 OR 1=1" } });
    expect(error).toMatchObject({ status: 400 });
  });
});
