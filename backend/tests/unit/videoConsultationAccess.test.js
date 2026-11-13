const mockQueries = [];
let mockHandler;

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
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));

process.env.VIDEO_PROVIDER = "jitsi";
process.env.JITSI_DOMAIN = "meet.jit.si";
delete process.env.JITSI_APP_ID;
delete process.env.JITSI_APP_SECRET;

const service = require("../../services/videoConsultationService");

const HW = "11111111-1111-4111-8111-111111111111";
const OTHER_HW = "22222222-2222-4222-8222-222222222222";
const NAV = "33333333-3333-4333-8333-333333333333";
const OTHER_NAV = "55555555-5555-4555-8555-555555555555";
const SPEC = "44444444-4444-4444-8444-444444444444";
const VIDEO = "99999999-9999-4999-8999-999999999999";
const REFERRAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function consultationRow(overrides = {}) {
  const now = Date.now();
  return {
    video_consultation_id: VIDEO,
    referral_id: REFERRAL,
    patient_id: PATIENT,
    specialist_id: SPEC,
    is_active: true,
    provider: "jitsi",
    room_ref: "adroom-lumbini",
    meeting_expires_at: new Date(now + 45 * 60 * 1000),
    started_at: null,
    ended_at: null,
    attendance: "PENDING",
    status_code: "CONFIRMED",
    status_name: "Confirmed",
    slot_start: new Date(now - 5 * 60 * 1000),
    slot_end: new Date(now + 25 * 60 * 1000),
    duration_seconds: 1800,
    patient_code: "AD-2026-000009",
    patient_name: "Lumbini",
    health_worker_id: HW,
    health_worker_name: "HW One",
    referral_code: "REF-2026-000005",
    assigned_navigator_id: NAV,
    navigator_name: "Nav One",
    specialist_name: "Dr Spec",
    specialty_name: "ENT",
    specialty_name_te: null,
    hospital_name: "Area Hospital Paderu",
    hospital_name_te: null,
    has_navigator_contact: true,
    latest_contact_outcome: "REACHED",
    reminder_sent: true,
    has_signed_report: false,
    ...overrides,
  };
}

function actor(id, role, name = "User") {
  return { id, full_name: name, email: null, role_code: role };
}

function mockJoinAccess({ actorRow, consultation, caseAssigned = true, consent = true }) {
  return (sql) => {
    if (sql.includes("FROM tbl_users actor")) return { rows: [actorRow] };
    if (sql.includes("FROM tbl_video_consultations consultation")) {
      return { rows: [consultation] };
    }
    if (sql.includes("FROM tbl_case_assignments")) {
      return { rows: caseAssigned ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("SELECT pc.granted")) {
      return { rows: [{ granted: consent }] };
    }
    if (sql.includes("SELECT set_config")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_video_join_tokens")) return { rows: [] };
    if (sql.includes("payload->>'event' = 'VIDEO_APPOINTMENT_CONFIRMED'")) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  mockQueries.length = 0;
  mockHandler = () => ({ rows: [] });
});

test("Health Worker list is scoped to registered_by patients", async () => {
  mockHandler = (sql) => {
    if (sql.includes("patient.registered_by = $1")) {
      return { rows: [consultationRow()] };
    }
    return { rows: [] };
  };
  const result = await service.listHealthWorkerAppointments(HW, { filter: "upcoming" });
  expect(mockQueries[0].params).toEqual([HW]);
  expect(mockQueries[0].sql).toContain("patient.registered_by = $1");
  expect(result.appointments).toHaveLength(1);
});

test("Navigator list is scoped to assigned_navigator_id", async () => {
  mockHandler = (sql) => {
    if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
    if (sql.includes("FOR UPDATE OF consultation")) return { rows: [] };
    if (sql.includes("referral.assigned_navigator_id = $1")) {
      return { rows: [consultationRow()] };
    }
    return { rows: [] };
  };
  const result = await service.listNavigatorAppointments(NAV, { filter: "upcoming" });
  const listQuery = mockQueries.find(({ sql }) => sql.includes("referral.assigned_navigator_id = $1"));
  expect(listQuery.params).toEqual([NAV]);
  expect(result.appointments[0].navigator_id).toBe(NAV);
});

test("assigned Specialist can join a confirmed consultation", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(SPEC, "SPECIALIST", "Raju"),
    consultation: consultationRow(),
    caseAssigned: true,
  });

  const result = await service.joinConsultation(SPEC, { ip: "127.0.0.1" }, VIDEO);
  expect(result).toMatchObject({
    video_consultation_id: VIDEO,
    room_ref: "adroom-lumbini",
    domain: "meet.jit.si",
    moderator: true,
  });
});

test("assigned Health Worker can join a confirmed consultation", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(HW, "HEALTH_WORKER", "raji"),
    consultation: consultationRow(),
  });

  const result = await service.joinConsultation(HW, { ip: "127.0.0.1" }, VIDEO);
  expect(result).toMatchObject({
    video_consultation_id: VIDEO,
    room_ref: "adroom-lumbini",
    domain: "meet.jit.si",
    moderator: false,
  });
});

test("assigned Navigator can join a confirmed consultation", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(NAV, "NAVIGATOR", "Srinu"),
    consultation: consultationRow(),
  });

  const result = await service.joinConsultation(NAV, { ip: "127.0.0.1" }, VIDEO);
  expect(result).toMatchObject({
    video_consultation_id: VIDEO,
    room_ref: "adroom-lumbini",
    domain: "meet.jit.si",
    moderator: false,
  });
});

test("authorized participants receive the same room details", async () => {
  const joins = [];
  for (const [userId, role, name] of [
    [SPEC, "SPECIALIST", "Raju"],
    [HW, "HEALTH_WORKER", "raji"],
    [NAV, "NAVIGATOR", "Srinu"],
  ]) {
    mockQueries.length = 0;
    mockHandler = mockJoinAccess({
      actorRow: actor(userId, role, name),
      consultation: consultationRow(),
      caseAssigned: true,
    });
    joins.push(await service.joinConsultation(userId, { ip: "127.0.0.1" }, VIDEO));
  }

  expect(new Set(joins.map((row) => row.room_ref)).size).toBe(1);
  expect(new Set(joins.map((row) => row.domain)).size).toBe(1);
  expect(joins[0].room_ref).toBe("adroom-lumbini");
  expect(joins[0].domain).toBe("meet.jit.si");
});

test("wrong Health Worker cannot join another worker consultation", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(OTHER_HW, "HEALTH_WORKER", "Other"),
    consultation: consultationRow({ health_worker_id: HW }),
  });

  await expect(service.joinConsultation(OTHER_HW, { ip: "127.0.0.1" }, VIDEO))
    .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
});

test("unrelated Navigator is rejected", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(OTHER_NAV, "NAVIGATOR", "Other Nav"),
    consultation: consultationRow({ assigned_navigator_id: NAV }),
  });

  await expect(service.joinConsultation(OTHER_NAV, { ip: "127.0.0.1" }, VIDEO))
    .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
});

test("join is rejected for cancelled consultations", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(HW, "HEALTH_WORKER", "raji"),
    consultation: consultationRow({
      status_code: "CANCELLED",
      is_active: false,
    }),
  });

  await expect(service.joinConsultation(HW, { ip: "127.0.0.1" }, VIDEO))
    .rejects.toMatchObject({ status: 409, code: "CANCELLED" });
});

test("non-confirmed appointment cannot be joined", async () => {
  mockHandler = mockJoinAccess({
    actorRow: actor(NAV, "NAVIGATOR", "Srinu"),
    consultation: consultationRow({
      status_code: "REQUESTED",
    }),
  });

  await expect(service.joinConsultation(NAV, { ip: "127.0.0.1" }, VIDEO))
    .rejects.toMatchObject({ status: 409, code: "NOT_CONFIRMED" });
});
