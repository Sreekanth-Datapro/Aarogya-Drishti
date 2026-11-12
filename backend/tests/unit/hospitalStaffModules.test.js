let mockHandler;
let mockRole = "HOSPITAL_STAFF";
let mockPermissions = [];
const mockQueries = [];

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
jest.mock("../../utils/jwt", () => ({ verifyAccessToken: jest.fn(() => ({ sub: "staff-1", sid: "session-1" })) }));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => mockPermissions),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));

const express = require("express");
const request = require("supertest");
const routes = require("../../routes/hospitalStaff");
const service = require("../../services/hospitalStaffService");
const audit = require("../../utils/audit").audit;
const errorMiddleware = require("../../middleware/errorMiddleware");

const APPOINTMENT = "44444444-4444-4444-8444-444444444444";
const PATIENT = "11111111-1111-4111-8111-111111111111";
const VIDEO_CONSULTATION = "66666666-6666-4666-8666-666666666666";
const VIDEO_SLOT = "77777777-7777-4777-8777-777777777777";
const ALTERNATIVE_SLOT = "88888888-8888-4888-8888-888888888888";

function appointment(overrides = {}) {
  return {
    id: APPOINTMENT,
    patient_id: PATIENT,
    referral_id: "22222222-2222-4222-8222-222222222222",
    hospital_id: 8,
    specialty_id: 2,
    assigned_service: "Oral clinic",
    location_note: "Synthetic coordination note",
    scheduled_at: "2030-01-01T10:00:00.000Z",
    status_id: 1,
    status_code: "REQUESTED",
    is_terminal: false,
    attendance: "PENDING",
    ...overrides,
  };
}

function videoConsultation(overrides = {}) {
  return {
    id: VIDEO_CONSULTATION,
    patient_id: PATIENT,
    referral_id: "22222222-2222-4222-8222-222222222222",
    specialist_id: "33333333-3333-4333-8333-333333333333",
    slot_id: VIDEO_SLOT,
    status_id: 1,
    status_code: "REQUESTED",
    is_terminal: false,
    attendance: "PENDING",
    is_active: true,
    patient_code: "AD-SYNTH-0001",
    referral_code: "REF-SYNTH-0001",
    referral_mode: "VIDEO_CONSULT",
    assigned_specialist_id: "33333333-3333-4333-8333-333333333333",
    to_hospital_id: 8,
    specialty_id: 2,
    specialty_name: "Synthetic specialty",
    specialist_name: "Synthetic Specialist",
    hospital_name: "Synthetic Hospital",
    scheduled_at: "2030-01-01T10:00:00.000Z",
    slot_end: "2030-01-01T10:30:00.000Z",
    consultation_mode: "VIDEO",
    slot_hospital_id: 8,
    is_booked: true,
    specialist_active: true,
    specialist_facility_assigned: true,
    signed_video_decision: true,
    teleconsult_consent_granted: true,
    teleconsult_consent_status: "ACTIVE",
    availability_status: "RESERVED",
    alternative_slots: [],
    ...overrides,
  };
}

function defaultHandler(overrides = {}) {
  return (sql, params) => {
    for (const [pattern, answer] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return typeof answer === "function" ? answer(sql, params) : answer;
    }
    if (sql.includes("JOIN tbl_user_sessions")) {
      return { rows: [{
        id: "staff-1", username: "staff.one", full_name: "Synthetic Hospital Staff",
        role_id: 9, role_name: mockRole, status: "ACTIVE", must_change_password: false,
        mfa_enabled: false, mfa_required: false, session_id: "session-1", mfa_verified: true,
      }] };
    }
    if (sql.includes("FOR UPDATE OF vc, slot")) return { rows: [videoConsultation()] };
    if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
    if (sql.includes("SELECT id, slot_start, slot_end")) {
      return { rows: [{ id: ALTERNATIVE_SLOT, slot_start: "2030-01-02T10:00:00.000Z", slot_end: "2030-01-02T10:30:00.000Z" }] };
    }
    if (sql.includes("UPDATE tbl_video_consultations")) {
      return { rows: [{
        id: VIDEO_CONSULTATION,
        slot_id: sql.includes("SET slot_id = $2") ? params[1] : params[2],
        status_id: sql.includes("SET slot_id = $2") ? params[2] : params[1],
        attendance: "PENDING",
      }] };
    }
    if (sql.includes("FOR UPDATE OF appointment")) return { rows: [appointment()] };
    if (sql.includes("SELECT id FROM mst_hospitals")) return { rows: [{ id: 8 }] };
    if (sql.includes("SELECT id FROM mst_appointment_statuses")) {
      return { rows: [{ id: params[0] === "CONFIRMED" ? 2 : params[0] === "RESCHEDULED" ? 3 : params[0] === "CANCELLED" ? 4 : 5 }] };
    }
    if (sql.includes("SELECT appointment.id") && sql.includes("scheduled_at = $2")) return { rows: [] };
    if (sql.includes("UPDATE tbl_hospital_appointments")) {
      return { rows: [{ id: APPOINTMENT, scheduled_at: "2030-01-02T10:00:00.000Z", attendance: params[2] || "PENDING" }] };
    }
    if (sql.includes("INSERT INTO tbl_hospital_appointments")) {
      return { rows: [{ id: "55555555-5555-4555-8555-555555555555", scheduled_at: params[6], attendance: "PENDING" }] };
    }
    if (sql.includes("INSERT INTO tbl_appointment_status_history")) return { rows: [] };
    if (sql.includes("SELECT set_config")) return { rows: [] };
    return { rows: [] };
  };
}

const app = express();
app.use(express.json());
app.use("/api/hospital-staff", routes);
app.use(errorMiddleware);
const call = (method, path) => request(app)[method](path).set("Authorization", "Bearer synthetic-access-token");

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockRole = "HOSPITAL_STAFF";
  mockPermissions = ["appointment.view", "appointment.confirm"];
  mockHandler = defaultHandler();
});

describe("Hospital Staff route authorization", () => {
  test("other roles cannot access appointment actions", async () => {
    mockRole = "NAVIGATOR";
    const response = await call("get", "/api/hospital-staff/appointments");
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("tbl_hospital_appointments"))).toBe(false);
  });

  test("appointment actions require their existing permissions", async () => {
    mockPermissions = ["appointment.view"];
    const response = await call("post", `/api/hospital-staff/appointments/${APPOINTMENT}/confirm`);
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FOR UPDATE OF appointment"))).toBe(false);

    mockPermissions = [];
    const list = await call("get", "/api/hospital-staff/appointments");
    expect(list.status).toBe(403);
  });

  test("video consultation requests require existing appointment permissions", async () => {
    mockPermissions = ["appointment.view"];
    const response = await call(
      "post",
      `/api/hospital-staff/video-consultations/${VIDEO_CONSULTATION}/confirm`
    );
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FOR UPDATE OF vc, slot"))).toBe(false);
  });
});

describe("Hospital Staff facility-scoped appointment workflow", () => {
  test("appointment list is restricted to active Hospital Staff facility assignments", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_hospital_appointments appointment": { rows: [{
        id: APPOINTMENT, patient_code: "AD-SYNTH-0001", referral_code: "REF-SYNTH-0001",
        specialty_name: "Synthetic specialty", requesting_clinician: "Synthetic MO",
        scheduled_at: "2030-01-01T10:00:00Z", location_note: "Synthetic note",
        status_code: "REQUESTED",
      }] },
    });
    const response = await call("get", "/api/hospital-staff/appointments?status=REQUESTED");
    expect(response.status).toBe(200);
    expect(response.body.appointments[0]).toMatchObject({
      patient_code: "AD-SYNTH-0001",
      referral_code: "REF-SYNTH-0001",
      status_code: "REQUESTED",
    });
    const query = mockQueries.find(({ sql }) => sql.includes("FROM tbl_hospital_appointments appointment"));
    expect(query.sql).toContain("assignment.user_id = $1");
    expect(query.sql).toContain("facility.hospital_id = appointment.hospital_id");
    expect(query.sql).toContain("facility.facility_type = 'HOSPITAL'");
    expect(query.sql).toContain("appointment.assigned_service ILIKE '%video consultation%'");
    expect(query.sql).toContain("video.is_active IS TRUE");
    expect(query.params).toEqual(["staff-1", "REQUESTED"]);
  });

  test("video consultation requests expose assigned Specialist, consent, availability and facility scope", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_video_consultations vc": { rows: [videoConsultation()] },
    });
    const response = await call("get", "/api/hospital-staff/video-consultations?status=REQUESTED");
    expect(response.status).toBe(200);
    expect(response.body.consultations[0]).toMatchObject({
      specialist_name: "Synthetic Specialist",
      specialty_name: "Synthetic specialty",
      scheduled_at: "2030-01-01T10:00:00.000Z",
      hospital_name: "Synthetic Hospital",
      teleconsult_consent_status: "ACTIVE",
      availability_status: "RESERVED",
    });
    const query = mockQueries.find(({ sql }) => sql.includes("FROM tbl_video_consultations vc"));
    expect(query.sql).toContain("referral.assigned_specialist_id = vc.specialist_id");
    expect(query.sql).toContain("specialist_facility.hospital_id = referral.to_hospital_id");
    expect(query.sql).toContain("decision.decision_type = 'VIDEO_CONSULTATION'");
    expect(query.sql).toContain("consent.granted IS TRUE");
    expect(query.sql).toContain("candidate.is_booked IS FALSE");
    expect(query.sql).toContain("facility.hospital_id = referral.to_hospital_id");
    expect(query.params).toEqual(["staff-1", "REQUESTED"]);
  });

  test("expired video slots are reported as expired instead of ordinary unavailable", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_video_consultations vc": { rows: [videoConsultation({ availability_status: "EXPIRED" })] },
    });
    const response = await call("get", "/api/hospital-staff/video-consultations?status=REQUESTED");
    expect(response.status).toBe(200);
    expect(response.body.consultations[0].availability_status).toBe("EXPIRED");
    const query = mockQueries.find(({ sql }) => sql.includes("FROM tbl_video_consultations vc"));
    expect(query.sql).toContain("slot.slot_start <= now() THEN 'EXPIRED'");
  });

  test("appointment outside the staff member's facility scope is not found", async () => {
    mockHandler = defaultHandler({ "FOR UPDATE OF appointment": { rows: [] } });
    await expect(service.confirmAppointment("staff-1", {}, APPOINTMENT))
      .rejects.toMatchObject({ status: 404, code: "APPOINTMENT_NOT_FOUND" });
  });

  test("Hospital Staff can confirm a requested appointment and audit the action", async () => {
    const result = await service.confirmAppointment("staff-1", { user: { id: "staff-1" } }, APPOINTMENT);
    expect(result).toMatchObject({ status_code: "CONFIRMED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_appointment_status_history"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "HOSPITAL_APPOINTMENT_CONFIRMED",
      resourceId: APPOINTMENT,
      patientId: PATIENT,
    }));
  });

  test("video consultation confirmation requires its own live Specialist reservation and records history", async () => {
    const result = await service.confirmVideoConsultation(
      "staff-1", { user: { id: "staff-1" } }, VIDEO_CONSULTATION
    );
    expect(result).toMatchObject({ status_code: "CONFIRMED", slot_id: VIDEO_SLOT });
    const lock = mockQueries.find(({ sql }) => sql.includes("FOR UPDATE OF vc, slot"));
    expect(lock.sql).toContain("referral.assigned_specialist_id = vc.specialist_id");
    expect(lock.sql).toContain("slot.is_booked IS TRUE");
    expect(lock.sql).toContain("NOT EXISTS");
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("video_consultation_id"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "HOSPITAL_VIDEO_CONSULTATION_CONFIRMED",
      resourceId: VIDEO_CONSULTATION,
      patientId: PATIENT,
    }));
  });

  test.each([
    ["unavailable", { availability_status: "UNAVAILABLE", is_booked: false }],
    ["already booked", { availability_status: "UNAVAILABLE", is_booked: true }],
  ])("video confirmation rejects an %s requested slot", async (_label, overrides) => {
    mockHandler = defaultHandler({
      "FOR UPDATE OF vc, slot": { rows: [videoConsultation(overrides)] },
    });
    await expect(service.confirmVideoConsultation(
      "staff-1", {}, VIDEO_CONSULTATION
    )).rejects.toMatchObject({ status: 409, code: "CONSULTATION_SLOT_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(false);
  });

  test("video confirmation rejects withdrawn TELECONSULT consent", async () => {
    mockHandler = defaultHandler({
      "FOR UPDATE OF vc, slot": {
        rows: [videoConsultation({
          availability_status: "UNAVAILABLE",
          teleconsult_consent_granted: false,
          teleconsult_consent_status: "WITHDRAWN",
        })],
      },
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });
    await expect(service.confirmVideoConsultation(
      "staff-1", {}, VIDEO_CONSULTATION
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(false);
  });

  test("video confirmation rejects a Specialist who is inactive or no longer assigned to the facility", async () => {
    mockHandler = defaultHandler({
      "FOR UPDATE OF vc, slot": {
        rows: [videoConsultation({
          specialist_active: false,
          availability_status: "UNAVAILABLE",
        })],
      },
    });
    await expect(service.confirmVideoConsultation(
      "staff-1", {}, VIDEO_CONSULTATION
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_SPECIALIST_UNAVAILABLE" });

    mockHandler = defaultHandler({
      "FOR UPDATE OF vc, slot": {
        rows: [videoConsultation({
          specialist_facility_assigned: false,
          availability_status: "UNAVAILABLE",
        })],
      },
    });
    await expect(service.confirmVideoConsultation(
      "staff-1", {}, VIDEO_CONSULTATION
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_SPECIALIST_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(false);
  });

  test("video rescheduling accepts only a free slot for the already assigned Specialist", async () => {
    const result = await service.rescheduleVideoConsultation(
      "staff-1",
      { user: { id: "staff-1" } },
      VIDEO_CONSULTATION,
      { slot_id: ALTERNATIVE_SLOT, reason: "Synthetic reschedule reason" }
    );
    expect(result).toMatchObject({
      slot_id: ALTERNATIVE_SLOT,
      status_code: "RESCHEDULED",
      scheduled_at: "2030-01-02T10:00:00.000Z",
    });
    const availableSlot = mockQueries.find(({ sql }) => sql.includes("SELECT id, slot_start, slot_end"));
    expect(availableSlot.sql).toContain("candidate.specialist_id = $2");
    expect(availableSlot.sql).toContain("candidate.is_booked IS FALSE");
    expect(availableSlot.sql).toContain("NOT EXISTS");
    const update = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_video_consultations"));
    expect(update.params).toEqual([VIDEO_CONSULTATION, ALTERNATIVE_SLOT, 3]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "HOSPITAL_VIDEO_CONSULTATION_RESCHEDULED",
      resourceId: VIDEO_CONSULTATION,
      patientId: PATIENT,
    }));
  });

  test("video rescheduling rejects a slot that was booked after the request loaded", async () => {
    mockHandler = defaultHandler({
      "SELECT id, slot_start, slot_end": { rows: [] },
    });
    await expect(service.rescheduleVideoConsultation(
      "staff-1",
      {},
      VIDEO_CONSULTATION,
      { slot_id: ALTERNATIVE_SLOT, reason: "Synthetic reschedule reason" }
    )).rejects.toMatchObject({ status: 409, code: "CONSULTATION_SLOT_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(false);
  });

  test("concurrent video confirmations serialize and only confirm once", async () => {
    let status = "REQUESTED";
    let updateCount = 0;
    let lockTail = Promise.resolve();
    const releaseLocks = [];
    mockHandler = async (sql, params) => {
      if (sql.includes("FOR UPDATE OF vc, slot")) {
        const previous = lockTail;
        let releaseLock;
        lockTail = new Promise((resolve) => { releaseLock = resolve; });
        await previous;
        releaseLocks.push(releaseLock);
        return { rows: [videoConsultation({ status_code: status, status_id: status === "CONFIRMED" ? 2 : 1 })] };
      }
      if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
      if (sql.includes("SELECT id FROM mst_appointment_statuses")) {
        return { rows: [{ id: params[0] === "CONFIRMED" ? 2 : 3 }] };
      }
      if (sql.includes("UPDATE tbl_video_consultations")) {
        updateCount += 1;
        status = "CONFIRMED";
        return { rows: [{ id: VIDEO_CONSULTATION, slot_id: VIDEO_SLOT, status_id: 2, attendance: "PENDING" }] };
      }
      if (sql.includes("COMMIT")) {
        const release = releaseLocks.shift();
        if (release) release();
      }
      return { rows: [] };
    };
    const outcomes = await Promise.allSettled([
      service.confirmVideoConsultation("staff-1", {}, VIDEO_CONSULTATION),
      service.confirmVideoConsultation("staff-1", {}, VIDEO_CONSULTATION),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")[0].reason)
      .toMatchObject({ status: 409, code: "INVALID_APPOINTMENT_TRANSITION" });
    expect(updateCount).toBe(1);
  });

  test("video consultation requests cannot be confirmed or completed through generic hospital actions", async () => {
    mockHandler = defaultHandler({
      "FOR UPDATE OF appointment": {
        rows: [appointment({
          referral_mode: "BOTH",
          assigned_service: "ENT - Video Consultation",
          has_active_video_consultation: true,
        })],
      },
    });
    await expect(service.confirmAppointment("staff-1", {}, APPOINTMENT))
      .rejects.toMatchObject({ status: 409, code: "VIDEO_CONSULTATION_CONFIRMATION_REQUIRED" });
    await expect(service.recordAttendance("staff-1", {}, APPOINTMENT, { attendance: "ATTENDED" }))
      .rejects.toMatchObject({ status: 409, code: "VIDEO_CONSULTATION_CONFIRMATION_REQUIRED" });
    await expect(service.rescheduleAppointment("staff-1", {}, APPOINTMENT, {
      scheduled_at: "2030-01-03T10:00:00Z",
      reason: "Synthetic reschedule reason",
    })).rejects.toMatchObject({ status: 409, code: "VIDEO_CONSULTATION_CONFIRMATION_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_hospital_appointments"))).toBe(false);
    const lock = mockQueries.find(({ sql }) => sql.includes("FOR UPDATE OF appointment"));
    expect(lock.sql).toContain("video.is_active IS TRUE");
    expect(lock.sql).toContain("referral.mode::text AS referral_mode");
  });

  test("conflicting appointment time blocks confirmation", async () => {
    mockHandler = defaultHandler({
      "scheduled_at = $2": { rows: [{ id: "other-appointment" }] },
    });
    await expect(service.confirmAppointment("staff-1", {}, APPOINTMENT))
      .rejects.toMatchObject({ status: 409, code: "APPOINTMENT_TIME_CONFLICT" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_hospital_appointments"))).toBe(false);
  });

  test("Hospital Staff can reschedule with a future time and reason", async () => {
    const result = await service.rescheduleAppointment("staff-1", {}, APPOINTMENT, {
      scheduled_at: "2030-01-02T10:00:00Z",
      reason: "Synthetic reschedule reason",
    });
    expect(result).toMatchObject({
      status_code: "CONFIRMED",
      rescheduled_from_id: APPOINTMENT,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(true);
    expect(mockQueries.filter(({ sql }) => sql.includes("INSERT INTO tbl_appointment_status_history"))).toHaveLength(2);
  });

  test("reschedule requires a reason and a future date", async () => {
    await expect(service.rescheduleAppointment("staff-1", {}, APPOINTMENT, {
      scheduled_at: "2030-01-02T10:00:00Z",
      reason: "",
    })).rejects.toMatchObject({ status: 400, code: "INVALID_APPOINTMENT" });
    await expect(service.rescheduleAppointment("staff-1", {}, APPOINTMENT, {
      scheduled_at: "2020-01-02T10:00:00Z",
      reason: "Synthetic reason",
    })).rejects.toMatchObject({ status: 400, code: "INVALID_APPOINTMENT" });
  });

  test("Hospital Staff can cancel only a pending request and records the reason", async () => {
    await expect(service.cancelAppointment("staff-1", {}, APPOINTMENT, { reason: "Synthetic cancellation" }))
      .resolves.toMatchObject({ status_code: "CANCELLED" });
    const update = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_hospital_appointments"));
    expect(update.params).toContain("Synthetic cancellation");
    mockHandler = defaultHandler({
      "FOR UPDATE OF appointment": { rows: [appointment({ status_code: "CONFIRMED", status_id: 2 })] },
    });
    await expect(service.cancelAppointment("staff-1", {}, APPOINTMENT, { reason: "Synthetic cancellation" }))
      .rejects.toMatchObject({ status: 409, code: "INVALID_APPOINTMENT_TRANSITION" });
  });

  test.each([
    ["ATTENDED", "COMPLETED"],
    ["NO_SHOW", "MISSED"],
  ])("Hospital Staff can record %s attendance", async (attendance, status) => {
    mockHandler = defaultHandler({
      "FOR UPDATE OF appointment": {
        rows: [appointment({ status_code: "CONFIRMED", status_id: 2, attendance: "PENDING" })],
      },
    });
    const result = await service.recordAttendance("staff-1", {}, APPOINTMENT, {
      attendance,
      reason: attendance === "NO_SHOW" ? "Synthetic no-show reason" : "",
    });
    expect(result).toMatchObject({ attendance, status_code: status });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_appointment_status_history"))).toBe(true);
  });

  test("no-show attendance requires a reason and attendance cannot be recorded twice", async () => {
    await expect(service.recordAttendance("staff-1", {}, APPOINTMENT, { attendance: "NO_SHOW" }))
      .rejects.toMatchObject({ status: 400, code: "INVALID_ATTENDANCE" });
    mockHandler = defaultHandler({
      "FOR UPDATE OF appointment": { rows: [appointment({ status_code: "COMPLETED", status_id: 5, attendance: "ATTENDED" })] },
    });
    await expect(service.recordAttendance("staff-1", {}, APPOINTMENT, { attendance: "NO_SHOW", reason: "Synthetic" }))
      .rejects.toMatchObject({ status: 409, code: "INVALID_ATTENDANCE_TRANSITION" });
  });
});
