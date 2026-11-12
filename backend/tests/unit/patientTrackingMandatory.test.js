jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));

const {
  deriveTrackingSnapshot,
  resolveResponsiblePerson,
  deriveNextAction,
} = require("../../services/patientTrackingService");

const HW = "22222222-2222-4222-8222-222222222222";
const NAV = "33333333-3333-4333-8333-333333333333";
const SPEC = "44444444-4444-4444-8444-444444444444";
const MO = "55555555-5555-4555-8555-555555555555";

describe("mandatory patient tracking fields", () => {
  test("current stage and next action for MO review", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "AWAITING_CLINICIAN",
      careStatus: null,
    });
    expect(snapshot.current_stage).toBe("MO_REVIEW");
    expect(snapshot.current_stage_label).toBe("MO Review");
    expect(snapshot.next_action_label).toBe("MO review pending");
    expect(snapshot.responsible_role).toBe("MEDICAL_OFFICER");
    expect(snapshot.due_at).toBeNull();
    expect(snapshot.is_overdue).toBe(false);
  });

  test("specialist report review stage uses assigned specialist", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      pendingPathologyReview: { id: "r1" },
    });
    expect(snapshot.current_stage_label).toBe("Specialist Report Review");
    expect(snapshot.next_action_label).toBe("Specialist report review pending");

    const responsible = resolveResponsiblePerson(snapshot, {
      specialist_id: SPEC,
      specialist_name: "Dr Rao",
    });
    expect(responsible.display).toBe("Dr Rao (Specialist)");
    expect(responsible.assigned).toBe(true);
  });

  test("responsible person shows Not Assigned when no assignee exists", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "REVIEWED",
    });
    const responsible = resolveResponsiblePerson(snapshot, {});
    expect(snapshot.next_action_label).toBe("Navigator coordination pending");
    expect(responsible.display).toBe("Not Assigned");
    expect(responsible.assigned).toBe(false);
  });

  test("due date comes from scheduled follow-up and marks overdue", () => {
    const due = "2026-10-01T00:00:00.000Z";
    const snapshot = deriveTrackingSnapshot({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      scheduledFollowup: {
        due_at: due,
        assigned_hw_id: HW,
        status: "SCHEDULED",
      },
      now: new Date("2026-11-12T00:00:00.000Z"),
    });
    expect(snapshot.current_stage_label).toBe("Follow-up");
    expect(snapshot.next_action_label).toBe("Health Worker patient follow-up pending");
    expect(snapshot.due_at).toBe(due);
    expect(snapshot.is_overdue).toBe(true);

    const responsible = resolveResponsiblePerson(snapshot, {
      health_worker_id: HW,
      health_worker_name: "Lakshmi",
    });
    expect(responsible.display).toBe("Lakshmi (Health Worker)");
  });

  test("does not invent due dates for escalations", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      openEscalation: { created_at: "2026-11-01T00:00:00.000Z" },
    });
    expect(snapshot.current_stage_label).toBe("Escalation");
    expect(snapshot.next_action_label).toBe("MO review pending");
    expect(snapshot.due_at).toBeNull();
    expect(snapshot.is_overdue).toBe(false);
  });

  test("cancelled follow-up tasks are ignored", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "APPOINTED",
      careStatus: "FOLLOWUP_ACTIVE",
      scheduledFollowup: {
        due_at: "2026-10-01T00:00:00.000Z",
        assigned_hw_id: HW,
        status: "CANCELLED",
      },
      openVideo: { scheduled_at: "2026-11-20T10:00:00.000Z", status_code: "CONFIRMED" },
      now: new Date("2026-11-12T00:00:00.000Z"),
    });
    expect(snapshot.next_action).toBe("JOIN_VIDEO_CONSULTATION");
    expect(snapshot.next_action_label).toBe("Specialist consultation pending");
    expect(snapshot.due_at).toBe("2026-11-20T10:00:00.000Z");
    expect(snapshot.is_overdue).toBe(false);
  });

  test("reassignment updates responsible person for the same next action", () => {
    const snapshot = deriveTrackingSnapshot({
      careStatus: "AWAITING_NAVIGATOR",
    });
    const first = resolveResponsiblePerson(snapshot, {
      navigator_id: NAV,
      navigator_name: "Navigator A",
    });
    const second = resolveResponsiblePerson(snapshot, {
      navigator_id: "66666666-6666-4666-8666-666666666666",
      navigator_name: "Navigator B",
    });
    expect(first.display).toBe("Navigator A (Navigator)");
    expect(second.display).toBe("Navigator B (Navigator)");
    expect(second.user_id).not.toBe(first.user_id);
  });

  test("MO final review and closure stages", () => {
    expect(deriveTrackingSnapshot({
      careStatus: "FINAL_CHECKUP_PENDING",
    }).next_action_label).toBe("MO reassessment / final review pending");

    const closed = deriveTrackingSnapshot({
      caseState: "CLOSED",
      careStatus: "CLOSED",
    });
    expect(closed.current_stage_label).toBe("Closure");
    expect(closed.next_action).toBe("NONE");
  });

  test("legacy deriveNextAction remains compatible", () => {
    const next = deriveNextAction({
      caseState: "AWAITING_CLINICIAN",
      scheduledFollowup: null,
    });
    expect(next).toMatchObject({
      next_action: "MO_CLINICAL_REVIEW",
      responsible_role: "MEDICAL_OFFICER",
      due_at: null,
    });
  });

  test("diagnostic report upload pending stage", () => {
    const snapshot = deriveTrackingSnapshot({
      pendingDiagnosticOrder: { status_code: "REPORT_PENDING", order_code: "DX-1" },
    });
    expect(snapshot.current_stage_label).toBe("Report Upload");
    expect(snapshot.next_action_label).toBe("Report upload pending");
    expect(snapshot.responsible_role).toBe("HOSPITAL_STAFF");
  });

  test("assigned MO is preferred over role-only display", () => {
    const snapshot = deriveTrackingSnapshot({
      caseState: "AWAITING_CLINICIAN",
    });
    const responsible = resolveResponsiblePerson(snapshot, {
      medical_officer_id: MO,
      medical_officer_name: "Dr Devi",
    });
    expect(responsible.display).toBe("Dr Devi (Medical Officer)");
  });
});
