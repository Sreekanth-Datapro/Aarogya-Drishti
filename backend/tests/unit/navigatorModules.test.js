let mockHandler;
const mockQueries = [];
let mockPermissions = [];
let mockRole = "NAVIGATOR";

function mockRunQuery(sql, params = []) {
  mockQueries.push({ sql, params });
  return mockHandler(sql, params);
}

jest.mock("../../db", () => {
  const client = {
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
    release: jest.fn(),
  };
  return {
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
    connect: jest.fn(async () => client),
  };
});
jest.mock("../../utils/jwt", () => ({ verifyAccessToken: jest.fn(() => ({ sub: "navigator-1", sid: "session-1" })) }));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => mockPermissions),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));

const express = require("express");
const request = require("supertest");
const routes = require("../../routes/navigator");
const navigatorService = require("../../services/navigatorService");
const audit = require("../../utils/audit").audit;
const errorMiddleware = require("../../middleware/errorMiddleware");

const REFERRAL = "44444444-4444-4444-8444-444444444444";
const PATIENT = "11111111-1111-4111-8111-111111111111";

function sessionRow() {
  return {
    id: "navigator-1", username: "nav.one", full_name: "Navigator One", role_id: 7,
    role_name: mockRole, status: "ACTIVE", must_change_password: false,
    mfa_enabled: false, mfa_required: false, session_id: "session-1", mfa_verified: true,
  };
}

function assignedReferral(overrides = {}) {
  return {
    id: REFERRAL, patient_id: PATIENT, referral_code: "REF-2026-000001",
    referral_status: "SENT", mode: "HOSPITAL_VISIT", created_at: "2026-01-01T00:00:00Z",
    to_hospital_id: 8, specialty_id: 2, patient_code: "AD-2026-000001",
    patient_name: "Synthetic Patient", contact_phone: "0000000000",
    health_worker_name: "Synthetic Health Worker", health_worker_phone: "+1 202 555 0100",
    health_worker_id: "77777777-7777-4777-8777-777777777777",
    hospital_name: "Synthetic Hospital", specialty_name: "Oral Medicine",
    priority_name: "Urgent", priority_code: "URGENT", screening_consent: true,
    ...overrides,
  };
}

function defaultHandler(overrides = {}) {
  return (sql, params) => {
    for (const [pattern, answer] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return typeof answer === "function" ? answer(sql, params) : answer;
    }
    if (sql.includes("JOIN tbl_user_sessions")) return { rows: [sessionRow()] };
    if (sql.includes("FROM tbl_referrals r")) return { rows: [assignedReferral()] };
    if (sql.includes("COUNT(*)::int AS total")) return { rows: [{ total: 0 }] };
    if (sql.includes("FROM tbl_patient_contact_history")) return { rows: [] };
    if (sql.includes("FROM tbl_hospital_appointments")) return { rows: [] };
    if (sql.includes("SELECT set_config")) return { rows: [] };
    return { rows: [] };
  };
}

const app = express();
app.use(express.json());
app.use("/api/navigator", routes);
app.use(errorMiddleware);
const call = (method, path) => request(app)[method](path).set("Authorization", "Bearer test-token");

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockRole = "NAVIGATOR";
  mockPermissions = ["referral.view", "navigation.update", "appointment.book"];
  mockHandler = defaultHandler();
});

describe("Navigator API authorization", () => {
  test("non-Navigators cannot access the Navigator API", async () => {
    mockRole = "SPECIALIST";
    const response = await call("get", "/api/navigator/referrals");
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_referrals r"))).toBe(false);
  });

  test.each([
    ["referral.view", "get", "/api/navigator/referrals", []],
    ["navigation.update", "post", `/api/navigator/referrals/${REFERRAL}/contacts`, { channel: "PHONE", outcome: "REACHED" }],
    ["appointment.book", "post", `/api/navigator/referrals/${REFERRAL}/appointments`, { scheduled_at: "2030-01-01T10:00:00Z" }],
  ])("requires %s before running the operation", async (_permission, method, path, body) => {
    mockPermissions = [];
    const response = await call(method, path).send(body);
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_referrals r"))).toBe(false);
  });

  test("list API validates filters and clamps pagination inputs", async () => {
    const invalid = await call("get", "/api/navigator/referrals?filter=unknown");
    expect(invalid.status).toBe(400);

    mockHandler = defaultHandler({ "COUNT(*)::int AS total": { rows: [{ total: 11 }] } });
    const response = await call("get", "/api/navigator/referrals?page=2&page_size=5&filter=unreachable");
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 2, page_size: 5, total: 11, total_pages: 3 });
    const listQuery = mockQueries.find(({ sql }) => sql.includes("ORDER BY pr.priority_rank"));
    expect(listQuery.params).toEqual(["navigator-1", 5, 5]);
    expect(listQuery.sql).toContain("r.assigned_navigator_id = $1");
    expect(listQuery.sql).toContain("fn_user_has_patient_access($1, p.id)");
    expect(listQuery.sql).toContain("ca.valid_to IS NULL OR ca.valid_to > now()");
    expect(listQuery.sql).toContain("consent.granted IS TRUE");
  });

  test("out-of-range pages safely return the last valid page or empty page one", async () => {
    mockHandler = defaultHandler({ "COUNT(*)::int AS total": { rows: [{ total: 11 }] } });
    const result = await navigatorService.listReferrals("navigator-1", { page: 99, page_size: 5 });
    expect(result.pagination).toEqual({ page: 3, page_size: 5, total: 11, total_pages: 3 });
    expect(mockQueries.find(({ sql }) => sql.includes("ORDER BY pr.priority_rank")).params).toEqual(["navigator-1", 5, 10]);

    mockHandler = defaultHandler();
    const empty = await navigatorService.listReferrals("navigator-1", { page: 99, page_size: 5 });
    expect(empty.pagination).toEqual({ page: 1, page_size: 5, total: 0, total_pages: 0 });
  });
});

describe("assigned referral isolation and consent", () => {
  test("detail access requires the assigned active care relationship and active screening consent", async () => {
    const result = await navigatorService.getReferral("navigator-1", REFERRAL);
    expect(result.referral).toMatchObject({
      contact_phone: "0000000000",
      health_worker_name: "Synthetic Health Worker",
      health_worker_phone: "+1 202 555 0100",
    });
    const accessQuery = mockQueries.find(({ sql }) => sql.includes("fn_user_has_patient_access"));
    expect(accessQuery.params).toEqual(["navigator-1", REFERRAL]);
    expect(accessQuery.sql).toContain("r.assigned_navigator_id = $1");
    expect(accessQuery.sql).toContain("ca.valid_to IS NULL OR ca.valid_to > now()");
    expect(accessQuery.sql).toContain("registrar.id = p.registered_by");
    expect(accessQuery.sql).toContain("registrar_role.code = 'HEALTH_WORKER'");
    expect(accessQuery.sql).not.toContain("registrar.id = $1");

    mockQueries.length = 0;
    mockHandler = defaultHandler({ "FROM tbl_referrals r": { rows: [] } });
    await expect(navigatorService.getReferral("navigator-1", REFERRAL))
      .rejects.toMatchObject({ status: 404, code: "REFERRAL_NOT_FOUND" });
  });

  test("unassigned Navigators cannot record contacts or book appointments", async () => {
    mockHandler = defaultHandler({ "FROM tbl_referrals r": { rows: [] } });
    await expect(navigatorService.recordContact(
      "navigator-1", {}, REFERRAL, { channel: "PHONE", outcome: "REACHED" }
    )).rejects.toMatchObject({ status: 404, code: "REFERRAL_NOT_FOUND" });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 404, code: "REFERRAL_NOT_FOUND" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_patient_contact_history"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
  });

  test("withdrawn screening consent blocks patient details and contact writes", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ screening_consent: false })] },
    });
    await expect(navigatorService.getReferral("navigator-1", REFERRAL))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(navigatorService.recordContact("navigator-1", {}, REFERRAL, { channel: "PHONE", outcome: "REACHED" }))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_patient_contact_history"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
  });
});

describe("Navigator contact and appointment workflows", () => {
  test("contact attempt is tied to the signed-in Navigator and its note is not copied into audit metadata", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_patient_contact_history": {
        rows: [{
          id: "contact-1", channel: "PHONE", outcome: "REACHED",
          notes: "[[recipient:PATIENT]]\nCalled", contacted_at: "2026-05-01T10:00:00Z",
        }],
      },
    });
    const contact = await navigatorService.recordContact(
      "navigator-1", { user: { id: "navigator-1", role_name: "NAVIGATOR" } }, REFERRAL,
      { channel: "phone", outcome: "reached", notes: "Called" }
    );
    expect(contact).toMatchObject({ id: "contact-1", outcome: "REACHED", recipient: "PATIENT", notes: "Called" });
    const insert = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_patient_contact_history"));
    expect(insert.params).toEqual([PATIENT, "navigator-1", "PHONE", "REACHED", "[[recipient:PATIENT]]\nCalled"]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "NAVIGATOR_CONTACT_RECORDED",
      metadata: { referral_code: "REF-2026-000001", channel: "PHONE", outcome: "REACHED", recipient: "PATIENT" },
    }));
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Called");
  });

  test("Navigator contact recipient is validated and Health Worker recipient is verified against registered_by role", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_patient_contact_history": {
        rows: [{
          id: "contact-2", channel: "PHONE", outcome: "REACHED",
          notes: "[[recipient:HEALTH_WORKER]]\nSynthetic coordination", contacted_at: "2026-05-01T10:00:00Z",
        }],
      },
    });
    const contact = await navigatorService.recordContact(
      "navigator-1", {}, REFERRAL,
      { channel: "PHONE", outcome: "REACHED", recipient: "HEALTH_WORKER", notes: "Synthetic coordination" }
    );
    expect(contact).toMatchObject({ recipient: "HEALTH_WORKER", notes: "Synthetic coordination" });
    expect(mockQueries.find(({ sql }) => sql.includes("FROM tbl_referrals r")).sql)
      .toContain("registrar_role.code = 'HEALTH_WORKER'");
    expect(mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_patient_contact_history")).params[4])
      .toBe("[[recipient:HEALTH_WORKER]]\nSynthetic coordination");

    await expect(navigatorService.recordContact(
      "navigator-1", {}, REFERRAL, { channel: "PHONE", outcome: "REACHED", recipient: "OTHER" }
    )).rejects.toMatchObject({ status: 400, code: "INVALID_CONTACT" });

    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ health_worker_id: null })] },
    });
    mockQueries.length = 0;
    await expect(navigatorService.recordContact(
      "navigator-1", {}, REFERRAL, { channel: "PHONE", outcome: "REACHED", recipient: "HEALTH_WORKER" }
    )).rejects.toMatchObject({ status: 409, code: "HEALTH_WORKER_CONTACT_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_patient_contact_history"))).toBe(false);
  });

  test("appointment booking creates a REQUESTED appointment and never confirms attendance", async () => {
    mockHandler = defaultHandler({
      "SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'": { rows: [{ id: 1 }] },
      "INSERT INTO tbl_hospital_appointments": {
        rows: [{ id: "appointment-1", scheduled_at: "2030-01-01T10:00:00Z", attendance: "PENDING" }],
      },
    });
    const result = await navigatorService.bookAppointment(
      "navigator-1", { user: { id: "navigator-1", role_name: "NAVIGATOR" } }, REFERRAL,
      { scheduled_at: "2030-01-01T10:00:00Z", assigned_service: "Oral clinic" }
    );
    expect(result).toMatchObject({ id: "appointment-1", status_code: "REQUESTED" });
    const insert = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"));
    expect(insert.sql).not.toContain("confirmed_by");
    expect(insert.params).toEqual([REFERRAL, PATIENT, 8, 2, "2030-01-01T10:00:00.000Z", 1, "Oral clinic", null, "navigator-1"]);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_appointment_status_history"))).toBe(true);
  });

  test("duplicate active appointments and invalid referral modes are refused", async () => {
    mockHandler = defaultHandler({
      "WHERE a.referral_id = $1 AND ast.is_terminal IS FALSE": { rows: [{ id: "existing" }] },
    });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 409, code: "APPOINTMENT_ALREADY_EXISTS" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);

    mockQueries.length = 0;
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ mode: "VIDEO_CONSULT" })] },
    });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 409, code: "HOSPITAL_VISIT_NOT_ALLOWED" });
  });

  test("COMPLETED referral (specialist assessment done) can still receive a hospital appointment", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": {
        rows: [assignedReferral({ referral_status: "COMPLETED", mode: "HOSPITAL_VISIT" })],
      },
      "SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'": { rows: [{ id: 1 }] },
      "INSERT INTO tbl_hospital_appointments": {
        rows: [{ id: "appointment-2", scheduled_at: "2030-02-01T10:00:00Z", attendance: "PENDING" }],
      },
    });
    const result = await navigatorService.bookAppointment(
      "navigator-1", { user: { id: "navigator-1", role_name: "NAVIGATOR" } }, REFERRAL,
      { scheduled_at: "2030-02-01T10:00:00Z" }
    );
    expect(result).toMatchObject({ id: "appointment-2", status_code: "REQUESTED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(true);
  });

  test("CANCELLED and DECLINED referrals remain unbookable", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ referral_status: "CANCELLED" })] },
    });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 409, code: "REFERRAL_NOT_BOOKABLE" });

    mockQueries.length = 0;
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ referral_status: "DECLINED" })] },
    });
    await expect(navigatorService.bookAppointment(
      "navigator-1", {}, REFERRAL, { scheduled_at: "2030-01-01T10:00:00Z" }
    )).rejects.toMatchObject({ status: 409, code: "REFERRAL_NOT_BOOKABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
  });

  test("terminal prior appointments do not block a new booking at another time", async () => {
    mockHandler = defaultHandler({
      "WHERE a.referral_id = $1 AND ast.is_terminal IS FALSE": { rows: [] },
      "SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'": { rows: [{ id: 1 }] },
      "INSERT INTO tbl_hospital_appointments": {
        rows: [{ id: "appointment-3", scheduled_at: "2030-03-01T09:00:00Z", attendance: "PENDING" }],
      },
    });
    const result = await navigatorService.bookAppointment(
      "navigator-1", { user: { id: "navigator-1", role_name: "NAVIGATOR" } }, REFERRAL,
      { scheduled_at: "2030-03-01T09:00:00Z" }
    );
    expect(result.status_code).toBe("REQUESTED");
    const activeCheck = mockQueries.find(({ sql }) => sql.includes("ast.is_terminal IS FALSE"));
    expect(activeCheck).toBeTruthy();
  });
});
