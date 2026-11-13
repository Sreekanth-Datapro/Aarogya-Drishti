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

const {
  deriveLifecycle,
  MEETING_GRACE_MS,
} = require("../../services/videoMeetingService");
const service = require("../../services/videoConsultationService");

const HW = "11111111-1111-4111-8111-111111111111";
const SPEC = "44444444-4444-4444-8444-444444444444";
const VIDEO = "99999999-9999-4999-8999-999999999999";
const REFERRAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NAV = "33333333-3333-4333-8333-333333333333";

function consultationRow(overrides = {}) {
  const now = Date.now();
  return {
    video_consultation_id: VIDEO,
    referral_id: REFERRAL,
    patient_id: PATIENT,
    specialist_id: SPEC,
    is_active: true,
    provider: "jitsi",
    room_ref: "adroom-lifecycle",
    meeting_expires_at: new Date(now + 45 * 60 * 1000),
    started_at: null,
    ended_at: null,
    attendance: "PENDING",
    status_code: "CONFIRMED",
    status_name: "Confirmed",
    slot_start: new Date(now - 5 * 60 * 1000),
    slot_end: new Date(now + 25 * 60 * 1000),
    duration_seconds: 1800,
    patient_code: "AD-2026-000019",
    patient_name: "aarthi",
    health_worker_id: HW,
    health_worker_name: "HW One",
    referral_code: "REF-2026-000009",
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

beforeEach(() => {
  mockQueries.length = 0;
  mockHandler = () => ({ rows: [] });
});

describe("Feature 1 automatic meeting attendance", () => {
  test("confirmed appointment serializes with PENDING attendance and no join until window", () => {
    const start = new Date("2035-06-01T10:00:00.000Z");
    const end = new Date("2035-06-01T10:30:00.000Z");
    const serialized = service.serializeAppointment(
      consultationRow({
        slot_start: start,
        slot_end: end,
        meeting_expires_at: new Date(end.getTime() + MEETING_GRACE_MS),
        attendance: "PENDING",
        status_code: "CONFIRMED",
      }),
      "en",
      { now: new Date("2035-06-01T09:00:00.000Z") }
    );
    expect(serialized.attendance).toBe("PENDING");
    expect(serialized.appointment_status).toBe("CONFIRMED");
    expect(serialized.can_join).toBe(false);
    expect(serialized.join_blocked_reason).toBe("TOO_EARLY");
  });

  test("time expiry alone never marks ATTENDED in deriveLifecycle", () => {
    const start = new Date("2035-06-01T10:00:00.000Z");
    const end = new Date("2035-06-01T10:30:00.000Z");
    const afterEnd = deriveLifecycle({
      statusCode: "CONFIRMED",
      isActive: true,
      slotStart: start,
      slotEnd: end,
      attendance: "PENDING",
      now: new Date(end.getTime() + MEETING_GRACE_MS + 1000),
    });
    expect(afterEnd.lifecycle_status).toBe("EXPIRED");
    expect(afterEnd.can_join).toBe(false);
    expect(afterEnd.join_blocked_reason).toBe("EXPIRED");
  });

  test("finalize marks ATTENDED only when participation started_at exists", async () => {
    const now = new Date("2035-06-01T11:00:00.000Z");
    mockHandler = (sql) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF consultation") && sql.includes("attendance = 'PENDING'")) {
        return {
          rows: [{
            id: VIDEO,
            patient_id: PATIENT,
            status_id: 2,
            attendance: "PENDING",
            started_at: new Date("2035-06-01T10:05:00.000Z"),
            ended_at: null,
            meeting_expires_at: new Date("2035-06-01T10:45:00.000Z"),
            is_active: true,
            status_code: "CONFIRMED",
            slot_end: new Date("2035-06-01T10:30:00.000Z"),
          }],
        };
      }
      if (sql.includes("FROM mst_appointment_statuses WHERE code = ANY")) {
        return { rows: [{ code: "COMPLETED", id: 5 }, { code: "MISSED", id: 6 }] };
      }
      if (sql.includes("UPDATE tbl_video_consultations") && sql.includes("attendance = $3")) {
        return { rows: [{ id: VIDEO }] };
      }
      if (sql.includes("INSERT INTO tbl_appointment_status_history")) return { rows: [] };
      return { rows: [] };
    };

    const result = await service.finalizeExpiredVideoAttendance(now);
    expect(result.attended).toEqual([VIDEO]);
    expect(result.missed).toEqual([]);
    const update = mockQueries.find(({ sql, params }) =>
      sql.includes("UPDATE tbl_video_consultations") && params.includes("ATTENDED")
    );
    expect(update).toBeTruthy();
  });

  test("finalize marks MISSED / NO_SHOW when nobody joined by meeting end", async () => {
    const now = new Date("2035-06-01T11:00:00.000Z");
    mockHandler = (sql) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF consultation") && sql.includes("attendance = 'PENDING'")) {
        return {
          rows: [{
            id: VIDEO,
            patient_id: PATIENT,
            status_id: 2,
            attendance: "PENDING",
            started_at: null,
            ended_at: null,
            meeting_expires_at: new Date("2035-06-01T10:45:00.000Z"),
            is_active: true,
            status_code: "CONFIRMED",
            slot_end: new Date("2035-06-01T10:30:00.000Z"),
          }],
        };
      }
      if (sql.includes("FROM mst_appointment_statuses WHERE code = ANY")) {
        return { rows: [{ code: "COMPLETED", id: 5 }, { code: "MISSED", id: 6 }] };
      }
      if (sql.includes("UPDATE tbl_video_consultations") && sql.includes("attendance = $3")) {
        return { rows: [{ id: VIDEO }] };
      }
      if (sql.includes("INSERT INTO tbl_appointment_status_history")) return { rows: [] };
      return { rows: [] };
    };

    const result = await service.finalizeExpiredVideoAttendance(now);
    expect(result.missed).toEqual([VIDEO]);
    expect(result.attended).toEqual([]);
    const update = mockQueries.find(({ sql, params }) =>
      sql.includes("UPDATE tbl_video_consultations") && params.includes("NO_SHOW")
    );
    expect(update).toBeTruthy();
  });

  test("finalize is idempotent and skips already finalized attendance", async () => {
    mockHandler = (sql) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF consultation")) return { rows: [] };
      return { rows: [] };
    };
    const first = await service.finalizeExpiredVideoAttendance(new Date());
    const second = await service.finalizeExpiredVideoAttendance(new Date());
    expect(first).toEqual({ attended: [], missed: [] });
    expect(second).toEqual({ attended: [], missed: [] });
  });

  test("recordMeetingPresence records join without changing attendance from PENDING", async () => {
    mockHandler = (sql) => {
      if (sql.includes("SELECT set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_users actor")) {
        return { rows: [{ id: HW, full_name: "HW", email: null, role_code: "HEALTH_WORKER" }] };
      }
      if (sql.includes("FROM tbl_video_consultations consultation")) {
        return { rows: [consultationRow()] };
      }
      if (sql.includes("UPDATE tbl_video_consultations") && sql.includes("started_at = COALESCE")) {
        return {
          rows: [{
            id: VIDEO,
            attendance: "PENDING",
            started_at: new Date("2035-06-01T10:05:00.000Z"),
            ended_at: null,
          }],
        };
      }
      return { rows: [] };
    };

    const result = await service.recordMeetingPresence(HW, { ip: "127.0.0.1" }, VIDEO, { event: "JOINED" });
    expect(result.attendance).toBe("PENDING");
    expect(result.started_at).toBeTruthy();
  });

  test("LEFT presence records ended_at without inventing started_at", async () => {
    mockHandler = (sql) => {
      if (sql.includes("SELECT set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_users actor")) {
        return { rows: [{ id: HW, full_name: "HW", email: null, role_code: "HEALTH_WORKER" }] };
      }
      if (sql.includes("FROM tbl_video_consultations consultation")) {
        return { rows: [consultationRow({ started_at: null, ended_at: null })] };
      }
      if (sql.includes("UPDATE tbl_video_consultations") && sql.includes("SET ended_at = now()")) {
        expect(sql).not.toMatch(/started_at\s*=\s*COALESCE/);
        return {
          rows: [{
            id: VIDEO,
            attendance: "PENDING",
            started_at: null,
            ended_at: new Date("2035-06-01T10:20:00.000Z"),
          }],
        };
      }
      return { rows: [] };
    };

    const result = await service.recordMeetingPresence(HW, { ip: "127.0.0.1" }, VIDEO, { event: "LEFT" });
    expect(result).toMatchObject({
      attendance: "PENDING",
      started_at: null,
      event: "LEFT",
    });
    expect(result.ended_at).toBeTruthy();
  });

  test("recordMeetingPresence does not overwrite ATTENDED or NO_SHOW", async () => {
    mockHandler = (sql) => {
      if (sql.includes("SELECT set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_users actor")) {
        return { rows: [{ id: HW, full_name: "HW", email: null, role_code: "HEALTH_WORKER" }] };
      }
      if (sql.includes("FROM tbl_video_consultations consultation")) {
        return {
          rows: [consultationRow({
            attendance: "ATTENDED",
            status_code: "COMPLETED",
            started_at: new Date("2035-06-01T10:05:00.000Z"),
            ended_at: new Date("2035-06-01T10:20:00.000Z"),
          })],
        };
      }
      return { rows: [] };
    };

    const result = await service.recordMeetingPresence(HW, { ip: "127.0.0.1" }, VIDEO, { event: "JOINED" });
    expect(result).toMatchObject({ attendance: "ATTENDED", unchanged: true });
    expect(mockQueries.some(({ sql }) =>
      sql.includes("UPDATE tbl_video_consultations") && sql.includes("started_at")
    )).toBe(false);
  });
});

describe("Feature 2 join consultation window", () => {
  test("backend rejects expired meeting joins", async () => {
    const end = new Date(Date.now() - 60 * 60 * 1000);
    mockHandler = (sql) => {
      if (sql.includes("SELECT set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_users actor")) {
        return { rows: [{ id: HW, full_name: "HW", email: null, role_code: "HEALTH_WORKER" }] };
      }
      if (sql.includes("FROM tbl_video_consultations consultation")) {
        return {
          rows: [consultationRow({
            slot_start: new Date(end.getTime() - 30 * 60 * 1000),
            slot_end: end,
            meeting_expires_at: new Date(end.getTime() + MEETING_GRACE_MS),
          })],
        };
      }
      if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
      return { rows: [] };
    };

    await expect(service.joinConsultation(HW, { ip: "127.0.0.1" }, VIDEO))
      .rejects.toMatchObject({ status: 409, code: "EXPIRED" });
  });

  test("backend rejects MISSED and COMPLETED joins", async () => {
    for (const [status, attendance, code] of [
      ["MISSED", "NO_SHOW", "MISSED"],
      ["COMPLETED", "ATTENDED", "COMPLETED"],
    ]) {
      mockQueries.length = 0;
      mockHandler = (sql) => {
        if (sql.includes("SELECT set_config")) return { rows: [] };
        if (sql.includes("FROM tbl_users actor")) {
          return { rows: [{ id: HW, full_name: "HW", email: null, role_code: "HEALTH_WORKER" }] };
        }
        if (sql.includes("FROM tbl_video_consultations consultation")) {
          return {
            rows: [consultationRow({
              status_code: status,
              attendance,
              is_active: status !== "MISSED",
            })],
          };
        }
        if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
        return { rows: [] };
      };
      await expect(service.joinConsultation(HW, { ip: "127.0.0.1" }, VIDEO))
        .rejects.toMatchObject({ status: 409, code });
    }
  });

  test("matchesFilter hides join-eligible upcoming after expiry and surfaces missed", () => {
    const end = new Date("2035-06-01T10:30:00.000Z");
    const row = consultationRow({
      slot_start: new Date("2035-06-01T10:00:00.000Z"),
      slot_end: end,
      meeting_expires_at: new Date(end.getTime() + MEETING_GRACE_MS),
      attendance: "PENDING",
      status_code: "CONFIRMED",
    });
    const after = new Date(end.getTime() + MEETING_GRACE_MS + 60_000);
    expect(service.matchesFilter(row, "upcoming", after)).toBe(false);

    const missed = consultationRow({
      status_code: "MISSED",
      attendance: "NO_SHOW",
      is_active: false,
    });
    expect(service.matchesFilter(missed, "missed", after)).toBe(true);
    expect(service.matchesFilter(missed, "upcoming", after)).toBe(false);
  });
});
