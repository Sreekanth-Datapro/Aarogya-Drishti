jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const { audit } = require("../../utils/audit");
const service = require("../../services/patientTrackingService");

const PATIENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

describe("patientTrackingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("deriveNextAction prioritizes escalation then overdue follow-up", () => {
    const escalation = service.deriveNextAction({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      openEscalation: { created_at: "2026-11-01T00:00:00Z" },
      scheduledFollowup: { due_at: "2026-10-01T00:00:00Z", assigned_hw_id: USER, status: "SCHEDULED" },
    });
    expect(escalation).toMatchObject({
      next_action: "REVIEW_ESCALATION",
      responsible_role: "MEDICAL_OFFICER",
    });

    const overdue = service.deriveNextAction({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      scheduledFollowup: { due_at: "2026-10-01T00:00:00Z", assigned_hw_id: USER, status: "SCHEDULED" },
    });
    expect(overdue).toMatchObject({
      next_action: "COMPLETE_FOLLOWUP",
      responsible_role: "HEALTH_WORKER",
      responsible_user_id: USER,
    });
  });

  test("deriveNextAction returns NONE for closed cases", () => {
    expect(
      service.deriveNextAction({
        caseState: "CLOSED",
        careStatus: "CLOSED",
      })
    ).toMatchObject({ next_action: "NONE", responsible_role: null });
  });

  test("getPatientJourney rejects roles outside tracking set", async () => {
    await expect(
      service.getPatientJourney(USER, "UNKNOWN_ROLE", { user: { id: USER } }, PATIENT)
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("getPatientJourney enforces patient access", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.getPatientJourney(USER, "NAVIGATOR", { user: { id: USER } }, PATIENT)
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("getTrackingDashboard returns aggregate-only payload for District Admin", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        total_patients: 12,
        active_patients: 7,
        overdue_followups: 2,
        upcoming_appointments: 3,
        pending_diagnostic_reports: 1,
        reports_awaiting_review: 1,
        escalations: 1,
        recovered_closed: 4,
      }],
    });

    const result = await service.getTrackingDashboard(USER, "DISTRICT_ADMIN");
    expect(result.dashboard.total_patients).toBe(12);
    expect(result.dashboard.pending_tasks).toBe(5);
    expect(result.dashboard.patients).toEqual([]);
  });

  test("listTrackedPatients filters overdue patients", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: PATIENT,
            patient_code: "P1",
            full_name: "A",
            facility_name: "PHC",
            case_state: "APPOINTED",
            care_plan_status: "FOLLOWUP_ACTIVE",
            followup_due_at: "2026-10-01T00:00:00Z",
            followup_status: "SCHEDULED",
            assigned_hw_id: USER,
            health_worker_name: "HW One",
            open_escalation_id: null,
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            patient_code: "P2",
            full_name: "B",
            facility_name: "PHC",
            case_state: "APPOINTED",
            care_plan_status: "FOLLOWUP_ACTIVE",
            followup_due_at: null,
            open_escalation_id: "44444444-4444-4444-8444-444444444444",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await service.listTrackedPatients(USER, "NAVIGATOR", { filter: "overdue", page: 1, page_size: 20 });
    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].patient_code).toBe("P1");
    expect(result.patients[0].current_stage_label).toBe("Follow-up");
    expect(result.patients[0].is_overdue).toBe(true);
  });

  test("notifyNextResponsible skips duplicates", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }),
    };
    const inserted = await service.notifyNextResponsible(client, {
      recipientUserId: USER,
      patientId: PATIENT,
      nextAction: "ASSIGN_CARE_FOLLOWUP",
      roleName: "NAVIGATOR",
    });
    expect(inserted).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test("notifyNextResponsible inserts with deep link when no duplicate", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 9, language_id: 1 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const inserted = await service.notifyNextResponsible(client, {
      recipientUserId: USER,
      patientId: PATIENT,
      nextAction: "ASSIGN_CARE_FOLLOWUP",
      roleName: "NAVIGATOR",
      title: "Action needed",
      message: "Coordinate follow-up",
    });
    expect(inserted).toBe(true);
    const insertCall = client.query.mock.calls[2];
    expect(insertCall[0]).toMatch(/INSERT INTO tbl_notifications/i);
    const payload = JSON.parse(insertCall[1][4]);
    expect(payload.target_path).toBe(`/navigator/tracking/${PATIENT}`);
    expect(payload.dedupe_key).toContain("TRACKING_NEXT_ACTION");
  });

  test("journeyTargetPath is role scoped", () => {
    expect(service.journeyTargetPath("MEDICAL_OFFICER", PATIENT)).toBe(`/medical-officer/tracking/${PATIENT}`);
    expect(service.journeyTargetPath("HOSPITAL_STAFF", PATIENT)).toBe(`/hospital-staff/tracking/${PATIENT}`);
  });

  test("audit is written when journey is viewed", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: PATIENT,
          patient_code: "P1",
          full_name: "Test Patient",
          registered_facility_id: 1,
          facility_name: "PHC",
          facility_name_te: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ granted: true }] })
      .mockResolvedValue({ rows: [] });

    const req = { user: { id: USER, role_name: "NAVIGATOR" } };
    const result = await service.getPatientJourney(USER, "NAVIGATOR", req, PATIENT);
    expect(result.journey.patient.patient_code).toBe("P1");
    expect(result.journey.timeline).toEqual([]);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "PATIENT_JOURNEY_VIEWED",
      patientId: PATIENT,
    }));
  });
});
