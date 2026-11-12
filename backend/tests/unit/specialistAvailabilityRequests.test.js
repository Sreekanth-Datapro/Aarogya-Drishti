let mockHandler;
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
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));

const service = require("../../services/specialistAvailabilityRequestService");

const REQUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REFERRAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPECIALIST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const HOSPITAL_STAFF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SLOT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const VIDEO = "99999999-9999-4999-8999-999999999999";
const START = "2035-02-01T10:00:00.000Z";
const END = "2035-02-01T10:30:00.000Z";

function referralRow(overrides = {}) {
  return {
    id: REFERRAL,
    patient_id: PATIENT,
    to_hospital_id: 8,
    specialty_id: 2,
    assigned_specialist_id: SPECIALIST,
    mode: "VIDEO_CONSULT",
    referral_status: "SENT",
    is_emergency_referral: false,
    has_signed_video_decision: true,
    ...overrides,
  };
}

function availabilityRequest(overrides = {}) {
  return {
    id: REQUEST,
    referral_id: REFERRAL,
    patient_id: PATIENT,
    specialist_id: SPECIALIST,
    hospital_id: 8,
    specialty_id: 2,
    requested_by: HOSPITAL_STAFF,
    requested_start: new Date(START),
    requested_end: new Date(END),
    proposed_start: new Date(START),
    proposed_end: new Date(END),
    status: "PENDING",
    referral_mode: "VIDEO_CONSULT",
    referral_status: "SENT",
    assigned_specialist_id: SPECIALIST,
    to_hospital_id: 8,
    is_emergency_referral: false,
    has_signed_video_decision: true,
    ...overrides,
  };
}

function mockDefault(overrides = {}) {
  return (sql, params) => {
    for (const [pattern, response] of Object.entries(overrides)) {
      if (sql.includes(pattern)) {
        return typeof response === "function" ? response(sql, params) : response;
      }
    }
    if (sql.includes("SELECT set_config")) return { rows: [] };
    if (sql.includes("FROM mst_notification_templates")) {
      return { rows: [{ id: 3, language_id: 1 }] };
    }
    if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
    if (sql.includes("FOR UPDATE OF referral")) return { rows: [referralRow()] };
    if (sql.includes("FOR UPDATE OF specialist, role")) return { rows: [{ id: SPECIALIST }] };
    if (sql.includes("FOR UPDATE OF specialist")) return { rows: [{ id: SPECIALIST }] };
    if (sql.includes("FOR UPDATE OF availability")) {
      return { rows: [availabilityRequest()] };
    }
    if (sql.includes("SET is_active = FALSE") && sql.includes("CANCELLED")) {
      return { rows: [] };
    }
    if (sql.includes("status.code = 'CANCELLED'")
        && sql.includes("ORDER BY consultation.updated_at")) {
      return { rows: [] };
    }
    if (sql.includes("FROM tbl_video_consultations consultation")
        && sql.includes("status.code <> 'CANCELLED'")
        && sql.includes("consultation.is_active IS TRUE")
        && !sql.includes("attendance")) {
      return { rows: [] };
    }
    if (sql.includes("FROM tbl_video_consultations") && sql.includes("UNION ALL")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO tbl_specialist_availability_requests")) {
      return { rows: [{
        id: REQUEST,
        referral_id: REFERRAL,
        requested_start: START,
        requested_end: END,
        status: "PENDING",
      }] };
    }
    if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [{ id: "notification-1" }] };
    if (sql.includes("SELECT slot.id") && sql.includes("tstzrange")) return { rows: [] };
    if (sql.includes("FROM tbl_consultation_slots slot")
        && sql.includes("WHERE slot.id = $1")) {
      return { rows: [{
        id: SLOT,
        slot_start: new Date(START),
        slot_end: new Date(END),
        mode: "VIDEO",
        hospital_id: 8,
        is_booked: false,
      }] };
    }
    if (sql.includes("INSERT INTO tbl_consultation_slots")) {
      return { rows: [{
        id: SLOT,
        slot_start: START,
        slot_end: END,
        mode: "VIDEO",
        hospital_id: 8,
        is_booked: false,
      }] };
    }
    if (sql.includes("UPDATE tbl_specialist_availability_requests")) {
      const confirming = sql.includes("SET status = 'CONFIRMED'");
      return { rows: [{
        id: REQUEST,
        status: confirming ? "CONFIRMED" : params[1] || "CONFIRMED",
        response_reason: params[2],
        proposed_start: params[4],
        proposed_end: params[5],
        slot_id: confirming ? params[1] : null,
        video_consultation_id: confirming ? params[2] : null,
        responded_at: START,
      }] };
    }
    if (sql.includes("FROM tbl_consultation_slots")
        && sql.includes("WHERE id = $1")
        && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: SLOT,
        specialist_id: SPECIALIST,
        hospital_id: 8,
        slot_start: new Date(START),
        slot_end: new Date(END),
        mode: "VIDEO",
        is_booked: false,
      }] };
    }
    if (sql.includes("FROM tbl_video_consultations") && sql.includes("WHERE slot_id = $1")) {
      return { rows: [] };
    }
    if (sql.includes("SELECT id FROM mst_appointment_statuses")) return { rows: [{ id: 2 }] };
    if (sql.includes("INSERT INTO tbl_video_consultations")) {
      return { rows: [{
        id: VIDEO,
        slot_id: SLOT,
        status_id: 2,
        attendance: "PENDING",
        provider: null,
        room_ref: null,
        meeting_expires_at: null,
      }] };
    }
    if (sql.includes("INSERT INTO tbl_appointment_status_history")) return { rows: [] };
    if (sql.includes("SELECT id FROM tbl_users WHERE id = $1 FOR UPDATE")) return { rows: [{ id: SPECIALIST }] };
    if (sql.includes("patient.registered_by AS health_worker_id")) {
      return { rows: [{
        referral_code: "REF-2035-000001",
        patient_code: "P-1",
        health_worker_id: "11111111-1111-4111-8111-111111111111",
        health_worker_role: "HEALTH_WORKER",
        assigned_navigator_id: "22222222-2222-4222-8222-222222222222",
        assigned_specialist_id: SPECIALIST,
        specialist_name: "Dr Spec",
        hospital_name: "District Hospital",
        specialty_name: "Oral",
      }] };
    }
    if (sql.includes("payload->>'event' = 'VIDEO_APPOINTMENT_CONFIRMED'")) {
      return { rows: [] };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  // Keep confirmation tests independent of a developer's local VIDEO_PROVIDER setting.
  delete process.env.VIDEO_PROVIDER;
  delete process.env.JITSI_DOMAIN;
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockHandler = mockDefault();
});

describe("Hospital Staff Specialist availability requests", () => {
  test("eligible video referrals require a signed VIDEO_CONSULTATION decision", async () => {
    await service.getEligibleReferrals(HOSPITAL_STAFF);

    const eligibilityQuery = mockQueries[0].sql;
    expect(eligibilityQuery).toContain("decision.status = 'SIGNED'");
    expect(eligibilityQuery).toContain("decision.decision_type = 'VIDEO_CONSULTATION'");
    expect(eligibilityQuery).toContain("decision.signed_by = referral.assigned_specialist_id");
    expect(eligibilityQuery).toContain("referral.status::text NOT IN ('CANCELLED', 'DECLINED')");
    expect(eligibilityQuery).not.toContain("'COMPLETED', 'CANCELLED', 'DECLINED'");
    expect(eligibilityQuery).not.toContain("decision.consultation_id IS NOT NULL");
  });

  describe("Specialist appointments listing", () => {
    test("returns pending and accepted requests plus only scoped confirmed and completed consultations", async () => {
      mockHandler = (sql, params) => {
        if (sql.includes("FROM tbl_specialist_availability_requests availability")) {
          return { rows: [
            { id: "request-pending", status: "PENDING" },
            { id: "request-accepted", status: "ACCEPTED" },
            { id: "request-suggested", status: "SUGGESTED" },
          ] };
        }
        if (sql.includes("FROM tbl_video_consultations consultation")) {
          return { rows: [
            { id: "video-confirmed", status: "CONFIRMED" },
            { id: "video-completed", status: "COMPLETED" },
          ] };
        }
        return mockDefault()(sql, params);
      };

      const result = await service.listSpecialistAppointments(SPECIALIST);

      expect(result.pending_requests.map(({ id }) => id)).toEqual(["request-pending"]);
      expect(result.accepted_requests.map(({ id }) => id)).toEqual([
        "request-accepted",
        "request-suggested",
      ]);
      expect(result.confirmed_appointments.map(({ id }) => id)).toEqual(["video-confirmed"]);
      expect(result.completed_consultations.map(({ id }) => id)).toEqual(["video-completed"]);

      const [requestQuery, consultationQuery] = mockQueries;
      expect(requestQuery.params).toEqual([SPECIALIST]);
      expect(requestQuery.sql).toContain("availability.specialist_id = $1");
      expect(requestQuery.sql).toContain("availability.status IN ('PENDING', 'ACCEPTED', 'SUGGESTED')");
      expect(requestQuery.sql).toContain("fn_user_has_patient_access($1, referral.patient_id)");
      expect(consultationQuery.params).toEqual([SPECIALIST]);
      expect(consultationQuery.sql).toContain("referral.assigned_specialist_id = $1");
      expect(consultationQuery.sql).toContain("status.code IN ('CONFIRMED', 'COMPLETED')");
      expect(consultationQuery.sql).toContain("case_assignment.user_id = $1");
    });
  });

  test("direct confirmation uses the assigned Specialist's existing slot without creating a duplicate slot", async () => {
    const result = await service.directConfirmHospitalSlot(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, slot_id: SLOT }
    );

    expect(result).toMatchObject({
      status_code: "CONFIRMED",
      slot_id: SLOT,
      scheduled_at: expect.any(Date),
      request_id: REQUEST,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      sql.includes("INSERT INTO tbl_specialist_availability_requests")
      && sql.includes("'CONFIRMED'")
    )).toBe(true);
    const confirmationNotifications = mockQueries.filter(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && String(params[4] || "").includes("VIDEO_APPOINTMENT_CONFIRMED")
    );
    expect(confirmationNotifications.length).toBeGreaterThanOrEqual(3);
  });

  test("direct confirmation rejects a booked or unavailable existing slot", async () => {
    mockHandler = mockDefault({
      "FROM tbl_consultation_slots slot\n          WHERE slot.id = $1": { rows: [] },
    });

    await expect(service.directConfirmHospitalSlot(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, slot_id: SLOT }
    )).rejects.toMatchObject({
      status: 409,
      message: "This time slot is already booked for another patient.",
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("creates a pending request without inventing a slot or appointment", async () => {
    const result = await service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    );

    expect(result.status).toBe("PENDING");
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
    const notification = mockQueries.find(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && params[0] === SPECIALIST
    );
    expect(JSON.parse(notification.params[4])).toMatchObject({
      event: "SPECIALIST_AVAILABILITY_REQUEST",
      request_id: REQUEST,
    });
  });

  test("allows an unavailable active video request to ask the same Specialist for a replacement time", async () => {
    mockHandler = mockDefault({
      "FROM tbl_video_consultations consultation\n": { rows: [{
        id: VIDEO,
        status: "REQUESTED",
        attendance: "PENDING",
        slot_mode: "VIDEO",
        slot_start: new Date("2020-01-01T10:00:00.000Z"),
        is_booked: true,
        another_consultation_on_slot: false,
      }] },
    });

    const result = await service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      {
        referral_id: REFERRAL,
        requested_start: START,
        requested_end: END,
        reschedule_consultation_id: VIDEO,
      }
    );

    expect(result.status).toBe("PENDING");
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_notifications"))).toBe(true);
  });

  test("Specialist response notifies the Hospital Staff who sent the request", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({ status: "PENDING", proposed_start: null, proposed_end: null })],
      },
    });

    await service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "ACCEPT" }
    );

    const notification = mockQueries.find(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && params[0] === HOSPITAL_STAFF
    );
    expect(JSON.parse(notification.params[4])).toMatchObject({
      event: "SPECIALIST_AVAILABILITY_RESPONSE",
      request_id: REQUEST,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("specialist request listing is scoped to the logged-in user and assigned case", async () => {
    await service.listSpecialistRequests(SPECIALIST);

    expect(mockQueries[0].params).toEqual([SPECIALIST]);
    expect(mockQueries[0].sql).toContain("availability.specialist_id = $1");
    expect(mockQueries[0].sql).toContain("availability.status = 'PENDING'");
    expect(mockQueries[0].sql).toContain("referral.assigned_specialist_id = $1");
    expect(mockQueries[0].sql).toContain("fn_user_has_patient_access($1, referral.patient_id)");
  });

  test("a missing or draft signed-decision flag blocks Path A and Path B", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": { rows: [referralRow({ has_signed_video_decision: false })] },
    });

    await expect(service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_DECISION_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("Hospital Staff outside the assigned facility cannot send an availability request", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": { rows: [] },
    });

    await expect(service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    )).rejects.toMatchObject({ status: 404, code: "REFERRAL_NOT_FOUND" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(false);
  });

  test("emergency referrals remain outside the video availability workflow", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": { rows: [referralRow({ is_emergency_referral: true })] },
    });

    await expect(service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_REFERRAL_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(false);
  });

  test("a draft or missing Specialist VIDEO_CONSULTATION decision blocks availability requests", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": { rows: [referralRow({ has_signed_video_decision: false })] },
    });

    await expect(service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_DECISION_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      sql.includes("decision.status = 'SIGNED'")
      && sql.includes("decision.decision_type = 'VIDEO_CONSULTATION'")
    )).toBe(true);
  });

  test("withdrawn TELECONSULT consent blocks sending an availability request", async () => {
    mockHandler = mockDefault({
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });

    await expect(service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, requested_start: START, requested_end: END }
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_availability_requests"))).toBe(false);
  });

  test("a Specialist accepts the requested time without creating a slot or appointment", async () => {
    const result = await service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "ACCEPT" }
    );

    expect(result.status).toBe("ACCEPTED");
    expect(result.slot_id).toBeNull();
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("FOR UPDATE OF availability"))).toBe(true);
  });

  test("a draft or missing signed decision prevents a Specialist response", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({ has_signed_video_decision: false })],
      },
    });

    await expect(service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "ACCEPT" }
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_DECISION_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_specialist_availability_requests"))).toBe(false);
  });

  test("a Specialist outside assigned-case access cannot respond to a request", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [] },
    });

    await expect(service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "ACCEPT" }
    )).rejects.toMatchObject({ status: 404, code: "AVAILABILITY_REQUEST_NOT_FOUND" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_specialist_availability_requests"))).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      /^(INSERT|UPDATE|DELETE)\s+.*tbl_specialist_consultation_decisions/i.test(sql.trim())
    )).toBe(false);
  });

  test("a Specialist can suggest a different available interval", async () => {
    const proposedStart = "2035-02-02T11:00:00.000Z";
    const proposedEnd = "2035-02-02T11:30:00.000Z";
    mockHandler = mockDefault({
      "tstzrange(slot.slot_start": { rows: [] },
      "UPDATE tbl_specialist_availability_requests": { rows: [{
        id: REQUEST, status: "SUGGESTED", slot_id: null,
        proposed_start: proposedStart, proposed_end: proposedEnd,
      }] },
    });

    const result = await service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "SUGGEST", proposed_start: proposedStart, proposed_end: proposedEnd }
    );
    expect(result.status).toBe("SUGGESTED");
    expect(result.proposed_start).toBe(proposedStart);
    expect(result.slot_id).toBeNull();
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("declining requires a reason and is visible as a terminal response", async () => {
    mockHandler = mockDefault({
      "UPDATE tbl_specialist_availability_requests": { rows: [{
        id: REQUEST, status: "DECLINED", response_reason: "No capacity",
      }] },
    });

    await expect(service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "DECLINE", reason: "No capacity" }
    )).resolves.toMatchObject({ status: "DECLINED", response_reason: "No capacity" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
  });

  test("overlapping existing Specialist slot blocks accepting a time", async () => {
    mockHandler = mockDefault({
      "tstzrange(slot.slot_start": { rows: [{
        id: SLOT,
        slot_start: START,
        slot_end: END,
        mode: "VIDEO",
        hospital_id: 8,
        is_booked: true,
        has_active_video: true,
      }] },
    });

    await expect(service.respondToRequest(
      SPECIALIST,
      { user: { id: SPECIALIST, role_name: "SPECIALIST" } },
      REQUEST,
      { response: "ACCEPT" }
    )).rejects.toMatchObject({
      status: 409,
      message: "This time slot is already booked for another patient.",
    });
  });
});

describe("Hospital Staff final video appointment confirmation", () => {
  test("confirmation atomically creates the video appointment and never a regular appointment", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({ status: "ACCEPTED", slot_id: null })] },
    });

    const result = await service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    );

    expect(result).toMatchObject({
      request_id: REQUEST,
      status: "CONFIRMED",
      video_consultation_id: VIDEO,
      slot_id: SLOT,
      video_status: "CONFIRMED",
      meeting_provisioned: false,
      meeting_error_code: "VIDEO_PROVIDER_NOT_CONFIGURED",
    });
    expect(result.meeting_retry_path).toContain(`/api/video-consultations/${VIDEO}/provision`);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(true);
    const confirmedRequest = mockQueries.find(({ sql }) =>
      sql.includes("UPDATE tbl_specialist_availability_requests")
      && sql.includes("SET status = 'CONFIRMED'")
    );
    expect(confirmedRequest.params).toEqual([REQUEST, SLOT, VIDEO, HOSPITAL_STAFF]);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_hospital_appointments"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_appointment_status_history")
      && sql.includes("video_consultation_id"))).toBe(true);
    const confirmationNotifications = mockQueries.filter(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && String(params[4] || "").includes("VIDEO_APPOINTMENT_CONFIRMED")
    );
    expect(confirmationNotifications.length).toBeGreaterThanOrEqual(3);
  });

  test("replacement availability confirmation updates the existing consultation instead of duplicating it", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({ status: "ACCEPTED", slot_id: null })] },
      "FROM tbl_video_consultations consultation\n": { rows: [{
        id: VIDEO,
        status_id: 1,
        status: "REQUESTED",
        attendance: "PENDING",
      }] },
      "UPDATE tbl_video_consultations": { rows: [{
        id: VIDEO,
        slot_id: SLOT,
        status_id: 2,
        attendance: "PENDING",
        provider: null,
        room_ref: null,
        meeting_expires_at: null,
      }] },
    });

    const result = await service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    );

    expect(result).toMatchObject({
      status: "CONFIRMED",
      video_consultation_id: VIDEO,
      slot_id: SLOT,
      meeting_provisioned: false,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_video_consultations"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("withdrawn TELECONSULT consent blocks final confirmation", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({ status: "ACCEPTED" })] },
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });

    await expect(service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("final confirmation revalidates the signed video decision", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({
          status: "ACCEPTED",
          has_signed_video_decision: false,
        })],
      },
    });

    await expect(service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_DECISION_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      sql.includes("decision.status = 'SIGNED'")
      && sql.includes("decision.decision_type = 'VIDEO_CONSULTATION'")
    )).toBe(true);
  });

  test("final confirmation rejects a changed Specialist assignment", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({
          status: "ACCEPTED",
          assigned_specialist_id: "11111111-1111-4111-8111-111111111111",
        })],
      },
    });

    await expect(service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    )).rejects.toMatchObject({ status: 409, code: "VIDEO_SPECIALIST_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("a booked or changed slot is rejected with the required conflict message", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({ status: "SUGGESTED" })] },
      "tstzrange(slot.slot_start": { rows: [{
        id: SLOT,
        slot_start: new Date(START),
        slot_end: new Date(END),
        mode: "VIDEO",
        hospital_id: 8,
        is_booked: true,
        has_active_video: true,
      }] },
    });

    await expect(service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    )).rejects.toMatchObject({
      status: 409,
      message: "This time slot is already booked for another patient.",
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("availability response alone cannot be confirmed before Specialist acceptance", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({
        status: "PENDING",
        slot_id: null,
        proposed_start: null,
        proposed_end: null,
      })] },
    });

    await expect(service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    )).rejects.toMatchObject({ status: 409, code: "INVALID_AVAILABILITY_TRANSITION" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("concurrent confirmation attempts for one Specialist slot produce only one booking", async () => {
    let booked = false;
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": { rows: [availabilityRequest({ status: "SUGGESTED" })] },
      "SELECT slot.id, slot.slot_start": () => ({
        rows: [{
          id: SLOT,
          slot_start: new Date(START),
          slot_end: new Date(END),
          mode: "VIDEO",
          hospital_id: 8,
          is_booked: booked,
          has_active_video: booked,
        }],
      }),
      "INSERT INTO tbl_video_consultations": () => {
        if (booked) {
          const error = new Error("duplicate active slot");
          error.code = "23505";
          throw error;
        }
        booked = true;
        return { rows: [{
          id: VIDEO,
          slot_id: SLOT,
          status_id: 2,
          attendance: "PENDING",
          provider: null,
          room_ref: null,
          meeting_expires_at: null,
        }] };
      },
    });

    const confirmations = await Promise.allSettled([
      service.confirmHospitalRequest(
        HOSPITAL_STAFF,
        { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
        REQUEST
      ),
      service.confirmHospitalRequest(
        HOSPITAL_STAFF,
        { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
        REQUEST
      ),
    ]);

    expect(confirmations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(confirmations.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(confirmations.find((result) => result.status === "rejected").reason).toMatchObject({
      status: 409,
      message: "This time slot is already booked for another patient.",
    });
  });
});

describe("Navigator preferred video time coordination", () => {
  const NAVIGATOR = "22222222-2222-4222-8222-222222222222";

  test("Navigator preferred time lands in STAFF_REVIEW without notifying the Specialist yet", async () => {
    mockHandler = mockDefault({
      "referral.assigned_navigator_id = $1": {
        rows: [referralRow()],
      },
      "INSERT INTO tbl_specialist_availability_requests": {
        rows: [{
          id: REQUEST,
          referral_id: REFERRAL,
          requested_start: START,
          requested_end: END,
          status: "STAFF_REVIEW",
        }],
      },
    });

    const result = await service.createNavigatorPreferredRequest(
      NAVIGATOR,
      { user: { id: NAVIGATOR, role_name: "NAVIGATOR" } },
      REFERRAL,
      { requested_start: START, requested_end: END }
    );

    expect(result.status).toBe("STAFF_REVIEW");
    expect(mockQueries.some(({ sql }) =>
      sql.includes("INSERT INTO tbl_specialist_availability_requests")
      && sql.includes("'STAFF_REVIEW'")
    )).toBe(true);
    expect(mockQueries.some(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && String(params[4] || "").includes("SPECIALIST_AVAILABILITY_REQUEST")
    )).toBe(false);
  });

  test("Navigator can submit preferred time after Specialist assessment COMPLETED with signed video decision", async () => {
    mockHandler = mockDefault({
      "referral.assigned_navigator_id = $1": {
        rows: [referralRow({
          mode: "HOSPITAL_VISIT",
          referral_status: "COMPLETED",
          has_signed_video_decision: true,
        })],
      },
      "INSERT INTO tbl_specialist_availability_requests": {
        rows: [{
          id: REQUEST,
          referral_id: REFERRAL,
          requested_start: START,
          requested_end: END,
          status: "STAFF_REVIEW",
        }],
      },
    });

    const result = await service.createNavigatorPreferredRequest(
      NAVIGATOR,
      { user: { id: NAVIGATOR, role_name: "NAVIGATOR" } },
      REFERRAL,
      { requested_start: START, requested_end: END }
    );

    expect(result.status).toBe("STAFF_REVIEW");
  });

  test("Hospital Staff can forward a STAFF_REVIEW request to the Specialist as PENDING", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability, referral": {
        rows: [availabilityRequest({
          status: "STAFF_REVIEW",
          requested_by: NAVIGATOR,
          proposed_start: null,
          proposed_end: null,
        })],
      },
      "UPDATE tbl_specialist_availability_requests": {
        rows: [{
          id: REQUEST,
          referral_id: REFERRAL,
          patient_id: PATIENT,
          specialist_id: SPECIALIST,
          status: "PENDING",
          requested_start: START,
          requested_end: END,
        }],
      },
    });

    const result = await service.forwardStaffReviewToSpecialist(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    );

    expect(result.status).toBe("PENDING");
    const specialistNotification = mockQueries.find(({ sql, params }) =>
      sql.includes("INSERT INTO tbl_notifications")
      && params[0] === SPECIALIST
    );
    expect(JSON.parse(specialistNotification.params[4])).toMatchObject({
      event: "SPECIALIST_AVAILABILITY_REQUEST",
      request_id: REQUEST,
    });
  });

  test("confirming a Specialist alternative keeps the original requested time on the request row", async () => {
    const proposedStart = new Date("2026-11-13T08:30:00.000Z");
    const proposedEnd = new Date("2026-11-13T09:00:00.000Z");
    const requestedStart = new Date("2026-11-12T05:00:00.000Z");
    const requestedEnd = new Date("2026-11-12T05:30:00.000Z");
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({
          status: "SUGGESTED",
          requested_start: requestedStart,
          requested_end: requestedEnd,
          proposed_start: proposedStart,
          proposed_end: proposedEnd,
          slot_id: null,
        })],
      },
      "tstzrange(slot.slot_start": { rows: [] },
      "INSERT INTO tbl_consultation_slots": {
        rows: [{
          id: SLOT,
          slot_start: proposedStart,
          slot_end: proposedEnd,
          mode: "VIDEO",
          hospital_id: 8,
          is_booked: false,
        }],
      },
    });

    const result = await service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    );

    expect(result.status).toBe("CONFIRMED");
    expect(new Date(result.scheduled_at).toISOString()).toBe(proposedStart.toISOString());
    const confirmUpdate = mockQueries.find(({ sql }) =>
      sql.includes("UPDATE tbl_specialist_availability_requests")
      && sql.includes("SET status = 'CONFIRMED'")
    );
    expect(confirmUpdate).toBeTruthy();
    expect(confirmUpdate.sql).not.toMatch(/requested_start\s*=/);
    expect(confirmUpdate.sql).not.toMatch(/requested_end\s*=/);
  });
});

describe("Cancelled video consultation rescheduling", () => {
  const NAVIGATOR = "22222222-2222-4222-8222-222222222222";
  const HEALTH_WORKER = "33333333-3333-4333-8333-333333333333";
  const CANCELLED_VIDEO = "88888888-8888-4888-8888-888888888888";
  const NEW_VIDEO = "77777777-7777-4777-8777-777777777777";

  test("Navigator can reschedule after CANCELLED without reopening COMPLETED referral", async () => {
    mockHandler = mockDefault({
      "referral.assigned_navigator_id = $1": {
        rows: [referralRow({
          referral_status: "COMPLETED",
          mode: "HOSPITAL_VISIT",
          has_signed_video_decision: true,
        })],
      },
      "INSERT INTO tbl_specialist_availability_requests": {
        rows: [{
          id: REQUEST,
          referral_id: REFERRAL,
          requested_start: START,
          requested_end: END,
          status: "STAFF_REVIEW",
        }],
      },
    });

    const result = await service.createNavigatorPreferredRequest(
      NAVIGATOR,
      { user: { id: NAVIGATOR, role_name: "NAVIGATOR" } },
      REFERRAL,
      { requested_start: START, requested_end: END }
    );

    expect(result.status).toBe("STAFF_REVIEW");
    expect(mockQueries.some(({ sql }) =>
      sql.includes("SET is_active = FALSE") && sql.includes("CANCELLED")
    )).toBe(true);
    expect(mockQueries.some(({ sql }) =>
      sql.includes("UPDATE tbl_referrals") && sql.includes("COMPLETED")
    )).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      sql.includes("UPDATE tbl_video_consultations")
      && sql.includes("CONFIRMED")
    )).toBe(false);
  });

  test("Hospital Staff can request Specialist availability from a cancelled consultation", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": {
        rows: [referralRow({ referral_status: "COMPLETED" })],
      },
      "FROM tbl_video_consultations consultation": (sql) => {
        if (sql.includes("status.code = 'CANCELLED'") && sql.includes("consultation.id = $1")) {
          return { rows: [{ id: CANCELLED_VIDEO }] };
        }
        if (sql.includes("status.code <> 'CANCELLED'")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      "INSERT INTO tbl_specialist_availability_requests": {
        rows: [{
          id: REQUEST,
          referral_id: REFERRAL,
          requested_start: START,
          requested_end: END,
          status: "PENDING",
        }],
      },
    });

    const result = await service.createHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      {
        referral_id: REFERRAL,
        requested_start: START,
        requested_end: END,
        reschedule_consultation_id: CANCELLED_VIDEO,
      }
    );

    expect(result.status).toBe("PENDING");
    expect(mockQueries.some(({ sql }) =>
      sql.includes("INSERT INTO tbl_specialist_availability_requests")
    )).toBe(true);
  });

  test("published-slot confirmation after cancel creates a new consultation and notifies roles", async () => {
    const notified = [];
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": {
        rows: [referralRow({ referral_status: "COMPLETED" })],
      },
      "status.code = 'CANCELLED'": { rows: [{ id: CANCELLED_VIDEO }] },
      "INSERT INTO tbl_video_consultations": {
        rows: [{
          id: NEW_VIDEO,
          slot_id: SLOT,
          status_id: 2,
          attendance: "PENDING",
          provider: null,
          room_ref: null,
          meeting_expires_at: null,
          rescheduled_from_id: CANCELLED_VIDEO,
        }],
      },
      "INSERT INTO tbl_notifications": (sql, params) => {
        notified.push({ userId: params[0], payload: JSON.parse(params[4]) });
        return { rows: [{ id: `notification-${notified.length}` }] };
      },
      "FROM tbl_referrals referral": {
        rows: [{
          referral_code: "REF-2026-000005",
          patient_code: "AD-2026-000009",
          health_worker_id: HEALTH_WORKER,
          health_worker_role: "HEALTH_WORKER",
          assigned_navigator_id: NAVIGATOR,
          assigned_specialist_id: SPECIALIST,
          specialist_name: "Dr Spec",
          hospital_name: "Test Hospital",
          specialty_name: "Cardiology",
        }],
      },
    });

    const result = await service.directConfirmHospitalSlot(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, slot_id: SLOT }
    );

    expect(result.id).toBe(NEW_VIDEO);
    expect(result.status_code).toBe("CONFIRMED");
    const insert = mockQueries.find(({ sql }) =>
      sql.includes("INSERT INTO tbl_video_consultations")
      && sql.includes("rescheduled_from_id")
    );
    expect(insert).toBeTruthy();
    expect(insert.params).toContain(CANCELLED_VIDEO);
    expect(result.id).not.toBe(CANCELLED_VIDEO);
    expect(mockQueries.some(({ sql, params }) =>
      sql.includes("UPDATE tbl_video_consultations")
      && Array.isArray(params)
      && params.includes(CANCELLED_VIDEO)
    )).toBe(false);

    const confirmed = notified.filter((row) => row.payload.event === "VIDEO_APPOINTMENT_CONFIRMED");
    expect(confirmed.map((row) => row.userId).sort()).toEqual(
      [HEALTH_WORKER, NAVIGATOR, SPECIALIST].sort()
    );
  });

  test("confirming Specialist alternative after cancel inserts a new consultation ID", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF availability": {
        rows: [availabilityRequest({
          status: "SUGGESTED",
          referral_status: "COMPLETED",
        })],
      },
      "ORDER BY consultation.updated_at": { rows: [{ id: CANCELLED_VIDEO }] },
      "FROM tbl_video_consultations consultation": (sql) => {
        if (sql.includes("status.code <> 'CANCELLED'") && sql.includes("attendance")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      "INSERT INTO tbl_video_consultations": {
        rows: [{
          id: NEW_VIDEO,
          slot_id: SLOT,
          status_id: 2,
          attendance: "PENDING",
          provider: null,
          room_ref: null,
          meeting_expires_at: null,
          rescheduled_from_id: CANCELLED_VIDEO,
        }],
      },
    });

    const result = await service.confirmHospitalRequest(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      REQUEST
    );

    expect(result.status).toBe("CONFIRMED");
    expect(result.video_consultation_id).toBe(NEW_VIDEO);
    expect(result.video_consultation_id).not.toBe(CANCELLED_VIDEO);
    const insert = mockQueries.find(({ sql }) =>
      sql.includes("INSERT INTO tbl_video_consultations")
      && sql.includes("rescheduled_from_id")
    );
    expect(insert.params[0]).toBe(REFERRAL);
    expect(insert.params).toContain(CANCELLED_VIDEO);
  });

  test("duplicate active appointment still blocks cancelled reschedule confirmation", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": {
        rows: [referralRow({ referral_status: "COMPLETED" })],
      },
      "FROM tbl_video_consultations consultation": {
        rows: [{ id: VIDEO, status: "CONFIRMED" }],
      },
    });

    await expect(service.directConfirmHospitalSlot(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, slot_id: SLOT }
    )).rejects.toMatchObject({
      status: 409,
      code: "AVAILABILITY_REQUEST_EXISTS",
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("double booking the same published slot is rejected", async () => {
    mockHandler = mockDefault({
      "FOR UPDATE OF referral": {
        rows: [referralRow({ referral_status: "COMPLETED" })],
      },
      "FROM tbl_consultation_slots slot": { rows: [] },
    });

    await expect(service.directConfirmHospitalSlot(
      HOSPITAL_STAFF,
      { user: { id: HOSPITAL_STAFF, role_name: "HOSPITAL_STAFF" } },
      { referral_id: REFERRAL, slot_id: SLOT }
    )).rejects.toMatchObject({
      status: 409,
      code: "CONSULTATION_SLOT_UNAVAILABLE",
    });
  });
});
