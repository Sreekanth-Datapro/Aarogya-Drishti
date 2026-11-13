jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));
jest.mock("../../services/diagnosticOrderService", () => ({
  getOrderForUser: jest.fn(async () => ({
    order: {
      id: "11111111-1111-4111-8111-111111111111",
      facility_id: 8,
      patient_id: "22222222-2222-4222-8222-222222222222",
      order_code: "DX-1",
      workflow_status: "NAVIGATOR_RECEIVED",
    },
  })),
  createOrder: jest.fn(async () => ({
    order: {
      id: "99999999-9999-4999-8999-999999999999",
      order_code: "DX-NEW-1",
      patient_id: "22222222-2222-4222-8222-222222222222",
      workflow_status: "NAVIGATOR_RECEIVED",
    },
  })),
}));
jest.mock("../../services/specialistService", () => ({
  createConsultationForReferral: jest.fn(async () => ({
    consultation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    already_exists: false,
  })),
}));
jest.mock("../../services/specialistAvailabilityRequestService", () => ({
  fanOutDiagnosticVideoAvailabilityNotifications: jest.fn(async () => ({
    hospital_staff_notified: 2,
    hospital_staff_candidates: 2,
  })),
  notifyHospitalStaffForReferral: jest.fn(async () => ({ staff_count: 2, notified: 2 })),
  notifyReferralCoordinators: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const { audit } = require("../../utils/audit");
const orderService = require("../../services/diagnosticOrderService");
const specialistService = require("../../services/specialistService");
const availabilityService = require("../../services/specialistAvailabilityRequestService");
const service = require("../../services/diagnosticWorkflowService");

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const NAV_ID = "33333333-3333-4333-8333-333333333333";
const HW_ID = "44444444-4444-4444-8444-444444444444";
const SP_ID = "55555555-5555-4555-8555-555555555555";
const HS_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_HW = "77777777-7777-4777-8777-777777777777";
const OTHER_NAV = "88888888-8888-4888-8888-888888888888";
const OTHER_SP = "99999999-aaaa-4aaa-8aaa-999999999999";
const REFERRAL_ID = "abababab-abab-4aba-8aba-abababababab";
const NEW_ORDER_ID = "99999999-9999-4999-8999-999999999999";
const SLOT_ID = "12121212-1212-4121-8121-121212121212";

function connectTx(handler) {
  const client = {
    query: jest.fn(async (sql, params) => handler(sql, params)),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

function baseOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    patient_id: PATIENT_ID,
    facility_id: 8,
    status_id: 1,
    order_code: "DX-1",
    prescribed_by: SP_ID,
    prescribed_by_role: "SPECIALIST",
    assigned_navigator_id: NAV_ID,
    care_navigator_id: null,
    assigned_health_worker_id: null,
    workflow_status: "NAVIGATOR_RECEIVED",
    ...overrides,
  };
}

describe("diagnosticWorkflowService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("listEligibleHealthWorkers returns scoped ACTIVE Health Workers", async () => {
    pool.query = jest.fn(async (sql) => {
      if (sql.includes("FROM tbl_diagnostic_orders diagnostic_order") && sql.includes("tbl_patients")) {
        return {
          rows: [{
            id: ORDER_ID,
            facility_id: 8,
            patient_id: PATIENT_ID,
            registered_by: HW_ID,
            registered_facility_id: 8,
            village_id: 1,
            mandal_id: 2,
          }],
        };
      }
      if (sql.includes("HEALTH_WORKER") && sql.includes("DISTINCT")) {
        return {
          rows: [{
            id: HW_ID,
            full_name: "Ananya Health Worker",
            username: "hw.ananya",
            facility_name: "PHC Demo",
            mandal_name: "Demo Mandal",
          }],
        };
      }
      return { rows: [] };
    });

    const result = await service.listEligibleHealthWorkers(NAV_ID, "NAVIGATOR", ORDER_ID);
    expect(result.health_workers).toHaveLength(1);
    expect(result.health_workers[0]).toMatchObject({
      id: HW_ID,
      full_name: "Ananya Health Worker",
      facility_name: "PHC Demo",
    });
  });

  test("listEligibleHealthWorkers rejects non-Navigator roles", async () => {
    await expect(
      service.listEligibleHealthWorkers(SP_ID, "SPECIALIST", ORDER_ID)
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Specialist role cannot assign Health Worker", async () => {
    await expect(
      Promise.resolve().then(() =>
        service.assignHealthWorker(SP_ID, "SPECIALIST", { user: { id: SP_ID } }, ORDER_ID, {
          health_worker_id: HW_ID,
        })
      )
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Navigator assigns Health Worker and notifies them", async () => {
    const payloads = [];
    connectTx(async (sql, params) => {
      if (
        sql.includes("BEGIN")
        || sql.includes("COMMIT")
        || sql.includes("ROLLBACK")
        || sql.includes("SAVEPOINT")
        || sql.includes("set_config")
      ) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder()] };
      }
      if (sql.includes("FROM tbl_diagnostic_orders diagnostic_order") && sql.includes("tbl_patients")) {
        return {
          rows: [{
            id: ORDER_ID,
            facility_id: 8,
            patient_id: PATIENT_ID,
            registered_by: HW_ID,
            registered_facility_id: 8,
            village_id: 1,
            mandal_id: 2,
          }],
        };
      }
      if (sql.includes("HEALTH_WORKER") && sql.includes("DISTINCT")) {
        return {
          rows: [{
            id: HW_ID,
            full_name: "Ananya Health Worker",
            username: "hw.ananya",
            facility_name: "PHC Demo",
            mandal_name: "Demo Mandal",
          }],
        };
      }
      if (sql.includes("FOR UPDATE OF users") && sql.includes("HEALTH_WORKER")) {
        return { rows: [{ id: HW_ID }] };
      }
      if (sql.includes("FROM mst_investigation_statuses")) {
        return { rows: [{ id: 2 }] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await service.assignHealthWorker(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {
      health_worker_id: HW_ID,
    });

    expect(payloads.join("\n")).toContain(`/health-worker/diagnostics/orders/${ORDER_ID}`);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "DIAGNOSTIC_ASSIGNED_TO_HW", required: true })
    );
    expect(orderService.getOrderForUser).toHaveBeenCalled();
  });

  test("Hospital Staff cannot route when order is not forwarded", async () => {
    connectTx(async (sql) => {
      if (
        sql.includes("BEGIN")
        || sql.includes("COMMIT")
        || sql.includes("ROLLBACK")
        || sql.includes("SAVEPOINT")
        || sql.includes("set_config")
      ) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "NAVIGATOR_VERIFICATION" })] };
      }
      return { rows: [] };
    });

    await expect(
      service.routeToSpecialist(HS_ID, "HOSPITAL_STAFF", { user: { id: HS_ID } }, ORDER_ID, {})
    ).rejects.toMatchObject({ status: 409, code: "INVALID_STATE" });
  });

  test("Navigator cannot forward advice without assigned Health Worker", async () => {
    connectTx(async (sql) => {
      if (
        sql.includes("BEGIN")
        || sql.includes("COMMIT")
        || sql.includes("ROLLBACK")
        || sql.includes("SAVEPOINT")
        || sql.includes("set_config")
      ) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "ADVICE_SENT_TO_NAVIGATOR",
            assigned_health_worker_id: null,
          })],
        };
      }
      return { rows: [] };
    });

    await expect(
      service.forwardAdviceToHealthWorker(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {})
    ).rejects.toMatchObject({ status: 409, code: "HW_REQUIRED" });
  });

  test("Health Worker cannot record follow-up for another assignee", async () => {
    connectTx(async (sql) => {
      if (
        sql.includes("BEGIN")
        || sql.includes("COMMIT")
        || sql.includes("ROLLBACK")
        || sql.includes("SAVEPOINT")
        || sql.includes("set_config")
      ) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: "99999999-9999-4999-8999-999999999999",
          })],
        };
      }
      return { rows: [] };
    });

    await expect(
      service.recordPatientFollowup(HW_ID, "HEALTH_WORKER", { user: { id: HW_ID } }, ORDER_ID, {
        outcome_notes: "Patient reached",
        patient_acknowledged: true,
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  function txBasics(sql) {
    return (
      sql.includes("BEGIN")
      || sql.includes("COMMIT")
      || sql.includes("ROLLBACK")
      || sql.includes("SAVEPOINT")
      || sql.includes("set_config")
      || sql.includes("RELEASE SAVEPOINT")
    );
  }

  test("Specialist signs initial advice and notifies Navigator", async () => {
    const payloads = [];
    let insertedAdvice = false;
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "SPECIALIST_REVIEW_PENDING" })] };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && sql.includes("is_current")) {
        return { rows: [] };
      }
      if (sql.includes("MAX(version_no)")) return { rows: [{ max_version: 0 }] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice")) {
        insertedAdvice = true;
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            order_id: ORDER_ID,
            status: "SIGNED",
            version_no: 1,
            findings: "Clear findings",
          }],
        };
      }
      if (sql.includes("UPDATE tbl_diagnostic_order_reports")) return { rows: [] };
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await service.signAdvice(SP_ID, "SPECIALIST", { user: { id: SP_ID } }, ORDER_ID, {
      findings: "Clear findings",
      follow_up_required: true,
      follow_up_due_date: "2026-12-01",
    });
    expect(insertedAdvice).toBe(true);
    expect(result.advice.status).toBe("SIGNED");
    expect(payloads.join("\n")).toContain("DIAGNOSTIC_ADVICE_SIGNED");
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "DIAGNOSTIC_ADVICE_SIGNED" })
    );
  });

  test("Unauthorized Specialist cannot sign another Specialist order", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({
          workflow_status: "SPECIALIST_REVIEW_PENDING",
          prescribed_by: "99999999-9999-4999-8999-999999999999",
        })] };
      }
      return { rows: [] };
    });
    await expect(
      service.signAdvice(SP_ID, "SPECIALIST", { user: { id: SP_ID } }, ORDER_ID, {
        findings: "Nope",
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Navigator forwards signed advice to Health Worker", async () => {
    const payloads = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "ADVICE_SENT_TO_NAVIGATOR",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED", is_current: true }] };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await service.forwardAdviceToHealthWorker(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {});
    expect(payloads.join("\n")).toContain("DIAGNOSTIC_ADVICE_TO_HW");
  });

  test("Health Worker submits follow-up without auto-completing case", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice_followups")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "SUBMITTED",
            cycle_no: 1,
          }],
        };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && !sql.includes("followups")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED", is_current: true }] };
      }
      if (sql.includes("idempotency_key =")) return { rows: [] };
      if (sql.includes("status IN ('DRAFT', 'RETURNED')")) return { rows: [] };
      if (sql.includes("status IN ('SUBMITTED', 'FORWARDED')")) return { rows: [] };
      if (sql.includes("MAX(cycle_no)")) return { rows: [{ max_cycle: 0 }] };
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.recordPatientFollowup(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID } },
      ORDER_ID,
      {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        patient_contacted: true,
      }
    );
    expect(result.followup.status).toBe("SUBMITTED");
    expect(workflows).toContain("FOLLOWUP_REPORT_SUBMITTED");
    expect(workflows).not.toContain("COMPLETED");
    expect(workflows).not.toContain("CLOSED");
  });

  test("Duplicate follow-up idempotency returns existing row", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED" }] };
      }
      if (sql.includes("idempotency_key")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "SUBMITTED",
            idempotency_key: "idem-followup-001",
          }],
        };
      }
      return { rows: [] };
    });

    const result = await service.recordPatientFollowup(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID } },
      ORDER_ID,
      {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        idempotency_key: "idem-followup-001",
      }
    );
    expect(result.idempotent_replay).toBe(true);
  });

  test("Navigator forwards verified follow-up to Specialist", async () => {
    const payloads = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "FOLLOWUP_REPORT_SUBMITTED",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice_followups") && sql.includes("SUBMITTED")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "SUBMITTED",
            health_worker_id: HW_ID,
          }],
        };
      }
      if (sql.includes("UPDATE tbl_diagnostic_advice_followups")) return { rows: [] };
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await service.verifyFollowupReport(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {
      action: "forward",
    });
    expect(payloads.join("\n")).toContain("DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST");
  });

  test("Navigator returns incomplete follow-up to Health Worker", async () => {
    const payloads = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "FOLLOWUP_REPORT_SUBMITTED",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice_followups")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "SUBMITTED",
            health_worker_id: HW_ID,
          }],
        };
      }
      if (sql.includes("UPDATE tbl_diagnostic_advice_followups")) return { rows: [] };
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await service.verifyFollowupReport(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {
      action: "return",
      reason: "Missing adherence details",
    });
    expect(payloads.join("\n")).toContain("DIAGNOSTIC_FOLLOWUP_RETURNED");
  });

  test("Navigator cannot modify signed advice via reassess", async () => {
    await expect(
      service.reassessAfterFollowup(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {
        decision: "CLOSE",
        closure_reason: "Nope",
        final_assessment: "Nope",
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Health Worker cannot close the case", async () => {
    await expect(
      service.reassessAfterFollowup(HW_ID, "HEALTH_WORKER", { user: { id: HW_ID } }, ORDER_ID, {
        decision: "CLOSE",
        closure_reason: "Nope",
        final_assessment: "Nope",
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Specialist continues follow-up after reassessment", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "REASSESSMENT_PENDING" })] };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && sql.includes("LIMIT 1")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            findings: "Stable",
            precautions: "Rest",
            treatment_advice: "Continue",
            medicine_name: null,
            dosage: null,
            duration_text: null,
            follow_up_instructions: "Call in 7 days",
            reassessment_instructions: null,
            follow_up_due_date: "2026-12-01",
            is_current: true,
          }],
        };
      }
      if (sql.includes("MAX(version_no)")) return { rows: [{ max_version: 1 }] };
      if (sql.includes("UPDATE tbl_diagnostic_advice") && sql.includes("is_current")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            status: "SIGNED",
            version_no: 2,
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID } },
      ORDER_ID,
      { decision: "CONTINUE", follow_up_due_date: "2026-12-15" }
    );
    expect(result.decision).toBe("CONTINUE");
    expect(workflows).toContain("FOLLOWUP_REQUIRED");
    expect(workflows).not.toContain("CLOSED");
  });

  test("Specialist closes case with documented reason", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "REASSESSMENT_PENDING" })] };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && sql.includes("LIMIT 1")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            findings: "Stable",
            precautions: "Rest",
            treatment_advice: "Continue",
            medicine_name: null,
            dosage: null,
            duration_text: null,
            follow_up_instructions: "Done",
            is_current: true,
          }],
        };
      }
      if (sql.includes("MAX(version_no)")) return { rows: [{ max_version: 1 }] };
      if (sql.includes("UPDATE tbl_diagnostic_advice")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            status: "SIGNED",
            version_no: 2,
            closure_reason: "Recovered",
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID } },
      ORDER_ID,
      {
        decision: "CLOSE",
        closure_reason: "Recovered after follow-up",
        final_assessment: "No further follow-up required",
      }
    );
    expect(result.closed).toBe(true);
    expect(workflows).toContain("CLOSED");
  });

  test("Unassigned Health Worker cannot submit follow-up", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: null,
          })],
        };
      }
      return { rows: [] };
    });
    await expect(
      service.recordPatientFollowup(HW_ID, "HEALTH_WORKER", { user: { id: HW_ID } }, ORDER_ID, {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        patient_contacted: true,
      })
    ).rejects.toMatchObject({ status: 409, code: "HW_REQUIRED" });
  });

  test("Other Health Worker cannot submit assigned follow-up", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      return { rows: [] };
    });
    await expect(
      service.recordPatientFollowup(OTHER_HW, "HEALTH_WORKER", { user: { id: OTHER_HW } }, ORDER_ID, {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        patient_contacted: true,
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Unassigned Navigator cannot verify or forward follow-up", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "FOLLOWUP_REPORT_SUBMITTED",
            assigned_navigator_id: null,
            care_navigator_id: null,
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      return { rows: [] };
    });
    await expect(
      service.verifyFollowupReport(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, {
        action: "forward",
      })
    ).rejects.toMatchObject({ status: 409, code: "NAVIGATOR_REQUIRED" });
  });

  test("Other Navigator cannot verify or forward follow-up", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "FOLLOWUP_REPORT_SUBMITTED",
            assigned_navigator_id: NAV_ID,
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      return { rows: [] };
    });
    await expect(
      service.verifyFollowupReport(OTHER_NAV, "NAVIGATOR", { user: { id: OTHER_NAV } }, ORDER_ID, {
        action: "forward",
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("Other Specialist cannot sign or close reassessment", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "REASSESSMENT_PENDING", prescribed_by: SP_ID })] };
      }
      return { rows: [] };
    });
    await expect(
      service.reassessAfterFollowup(OTHER_SP, "SPECIALIST", { user: { id: OTHER_SP } }, ORDER_ID, {
        decision: "CLOSE",
        closure_reason: "Nope",
        final_assessment: "Nope",
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("New idempotency key cannot create duplicate SUBMITTED follow-up", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && !sql.includes("followups")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED" }] };
      }
      if (sql.includes("idempotency_key =")) return { rows: [] };
      if (sql.includes("SELECT id FROM tbl_diagnostic_advice_followups")
        && sql.includes("status = 'SUBMITTED'")) {
        return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      return { rows: [] };
    });
    await expect(
      service.recordPatientFollowup(HW_ID, "HEALTH_WORKER", { user: { id: HW_ID } }, ORDER_ID, {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        patient_contacted: true,
        idempotency_key: "brand-new-idempotency-key-99",
      })
    ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_FOLLOWUP" });
  });

  test("Concurrent duplicate submissions are rejected via unique constraint", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "SENT_TO_HEALTH_WORKER",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && !sql.includes("followups")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED" }] };
      }
      if (sql.includes("idempotency_key =")) return { rows: [] };
      if (sql.includes("SELECT id FROM tbl_diagnostic_advice_followups")
        && sql.includes("status = 'SUBMITTED'")) {
        return { rows: [] };
      }
      if (sql.includes("status IN ('DRAFT', 'RETURNED')")) return { rows: [] };
      if (sql.includes("MAX(cycle_no)")) return { rows: [{ max_cycle: 0 }] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice_followups")) {
        const err = new Error("duplicate key");
        err.code = "23505";
        throw err;
      }
      return { rows: [] };
    });
    await expect(
      service.recordPatientFollowup(HW_ID, "HEALTH_WORKER", { user: { id: HW_ID } }, ORDER_ID, {
        symptoms_status: "Mild pain",
        improvement_status: "Improved",
        outcome_notes: "Patient improving",
        patient_contacted: true,
      })
    ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_FOLLOWUP" });
  });

  test("Returned report can be resubmitted correctly", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_advice_followups") && sql.includes("RETURNING")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "SUBMITTED",
            cycle_no: 1,
          }],
        };
      }
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "FOLLOWUP_RETURNED",
            assigned_health_worker_id: HW_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice ") || (sql.includes("FROM tbl_diagnostic_advice\n"))) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "SIGNED" }] };
      }
      if (sql.includes("idempotency_key =")) return { rows: [] };
      if (sql.includes("SELECT id FROM tbl_diagnostic_advice_followups")
        && sql.includes("status = 'SUBMITTED'")) {
        return { rows: [] };
      }
      if (sql.includes("status IN ('DRAFT', 'RETURNED')")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "RETURNED",
            cycle_no: 1,
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.recordPatientFollowup(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID } },
      ORDER_ID,
      {
        symptoms_status: "Updated symptoms",
        improvement_status: "Improved",
        outcome_notes: "Resubmitted after return",
        patient_contacted: true,
      }
    );
    expect(result.followup.status).toBe("SUBMITTED");
    expect(workflows).toContain("FOLLOWUP_REPORT_SUBMITTED");
  });

  test("Without explicit recovery, diagnostic closes but linked care plans stay open", async () => {
    const workflows = [];
    const inserts = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return { rows: [baseOrder({ workflow_status: "REASSESSMENT_PENDING" })] };
      }
      if (sql.includes("FROM tbl_diagnostic_advice") && sql.includes("LIMIT 1")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            findings: "Stable",
            precautions: "Rest",
            treatment_advice: "Continue",
            medicine_name: null,
            dosage: null,
            duration_text: null,
            follow_up_instructions: "Done",
            is_current: true,
          }],
        };
      }
      if (sql.includes("MAX(version_no)")) return { rows: [{ max_version: 1 }] };
      if (sql.includes("UPDATE tbl_diagnostic_advice")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            status: "SIGNED",
            version_no: 2,
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans")) {
        return {
          rows: [{
            id: "plan-1",
            status: "ACTIVE",
            screening_id: "screen-1",
            patient_id: PATIENT_ID,
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) {
        inserts.push("final_review");
        return { rows: [] };
      }
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID } },
      ORDER_ID,
      {
        decision: "CLOSE",
        closure_reason: "Clinical follow-up complete; care plan continues separately",
        final_assessment: "Diagnostic cycle closed without recovery confirmation",
        recovery_confirmed: false,
      }
    );
    expect(result.closed).toBe(true);
    expect(workflows).toContain("CLOSED");
    expect(result.care_plans_left_open).toEqual(["plan-1"]);
    expect(result.care_plans_closed).toEqual([]);
    expect(result.care_recovery_recorded).toBe(false);
    expect(inserts).not.toContain("final_review");
  });

  test("Truthy-looking recovery strings other than true are rejected for care closure", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes("FROM tbl_care_plans")) {
          return {
            rows: [{
              id: "plan-1",
              status: "ACTIVE",
              screening_id: "screen-1",
              patient_id: PATIENT_ID,
            }],
          };
        }
        if (sql.includes("INSERT INTO tbl_care_final_reviews")) {
          throw new Error("must not insert final review");
        }
        return { rows: [] };
      }),
    };
    const result = await service.bridgeCloseSpecialistCarePlans(client, {
      patientId: PATIENT_ID,
      specialistId: SP_ID,
      userId: SP_ID,
      observations: "Stable",
      clinicalAssessment: "Done",
      recoveryConfirmed: "yes",
    });
    expect(result.closed_plan_ids).toEqual([]);
    expect(result.left_open_plan_ids).toEqual(["plan-1"]);
    expect(result.recovery_recorded).toBe(false);
  });

  test("Explicit recovery_confirmed closes linked care plans with real final review", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes("FROM tbl_care_plans")) {
          return {
            rows: [{
              id: "plan-1",
              status: "ACTIVE",
              screening_id: "screen-1",
              patient_id: PATIENT_ID,
            }],
          };
        }
        if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
        if (sql.includes("UPDATE tbl_care_plans")) return { rows: [] };
        return { rows: [] };
      }),
    };
    const result = await service.bridgeCloseSpecialistCarePlans(client, {
      patientId: PATIENT_ID,
      specialistId: SP_ID,
      userId: SP_ID,
      observations: "Recovered",
      clinicalAssessment: "Close recovered",
      recoveryConfirmed: true,
    });
    expect(result.closed_plan_ids).toEqual(["plan-1"]);
    expect(result.recovery_recorded).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO tbl_care_final_reviews"))).toBe(true);
  });

  test("Specialist creates real additional diagnostic order on REQUEST_DIAGNOSTICS", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "REASSESSMENT_PENDING",
            referral_id: REFERRAL_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            findings: "Needs more",
            is_current: true,
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID, role_name: "SPECIALIST" } },
      ORDER_ID,
      {
        decision: "REQUEST_DIAGNOSTICS",
        additional_diagnostics_notes: "Need MRI",
        facility_id: 8,
        items: [{ test_id: 3, clinical_reason: "Need MRI", priority: "ROUTINE" }],
      }
    );
    expect(orderService.createOrder).toHaveBeenCalled();
    expect(result.created_order_id).toBe(NEW_ORDER_ID);
    expect(result.create_diagnostic_order).toBeUndefined();
    expect(workflows).toContain("ADDITIONAL_INFORMATION_REQUIRED");
    expect(workflows).not.toContain("CLOSED");
  });

  test("REQUEST_VIDEO requires TELECONSULT consent", async () => {
    connectTx(async (sql) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "REASSESSMENT_PENDING",
            referral_id: REFERRAL_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            is_current: true,
          }],
        };
      }
      if (sql.includes("tbl_patient_consents")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      service.reassessAfterFollowup(SP_ID, "SPECIALIST", { user: { id: SP_ID } }, ORDER_ID, {
        decision: "REQUEST_VIDEO",
        notes: "Discuss findings",
        slot_id: SLOT_ID,
      })
    ).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
  });

  test("REQUEST_VIDEO published slot path returns consultation id without auto-confirm", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "REASSESSMENT_PENDING",
            referral_id: REFERRAL_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            is_current: true,
          }],
        };
      }
      if (sql.includes("tbl_patient_consents")) {
        return { rows: [{ granted: true }] };
      }
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: REFERRAL_ID,
            patient_id: PATIENT_ID,
            referral_code: "RF-1",
            to_hospital_id: 1,
            specialty_id: 1,
            assigned_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("FROM tbl_specialist_consultation_decisions")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_specialist_consultation_decisions")) {
        return { rows: [{ id: "decision-1", decision_type: "VIDEO_CONSULTATION", status: "SIGNED" }] };
      }
      if (sql.includes("video_decision_id")) return { rows: [] };
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID } },
      ORDER_ID,
      { decision: "REQUEST_VIDEO", notes: "Discuss findings", slot_id: SLOT_ID }
    );
    expect(specialistService.createConsultationForReferral).toHaveBeenCalled();
    expect(result.video_decision_id).toBe("decision-1");
    expect(result.video_consultation_id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(result.booking_path).toBe("PUBLISHED_SLOT");
    expect(result.create_video_consultation).toBeUndefined();
    expect(workflows).toContain("VIDEO_CONSULTATION_REQUESTED");
    expect(workflows).not.toContain("CLOSED");
  });

  test("REQUEST_VIDEO availability path returns request id without auto-confirm", async () => {
    const workflows = [];
    connectTx(async (sql, params) => {
      if (txBasics(sql)) return { rows: [] };
      if (sql.includes("FOR UPDATE OF diagnostic_order")) {
        return {
          rows: [baseOrder({
            workflow_status: "REASSESSMENT_PENDING",
            referral_id: REFERRAL_ID,
          })],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_advice")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "SIGNED",
            is_current: true,
          }],
        };
      }
      if (sql.includes("tbl_patient_consents")) {
        return { rows: [{ granted: true }] };
      }
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: REFERRAL_ID,
            patient_id: PATIENT_ID,
            referral_code: "RF-1",
            to_hospital_id: 1,
            specialty_id: 1,
            assigned_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("FROM tbl_specialist_consultation_decisions")) {
        return {
          rows: [{ id: "decision-2", decision_type: "VIDEO_CONSULTATION", status: "SIGNED" }],
        };
      }
      if (sql.includes("video_decision_id")) return { rows: [] };
      if (sql.includes("FROM tbl_specialist_availability_requests") && sql.includes("LIMIT 1")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_specialist_availability_requests")) {
        return {
          rows: [{
            id: "avail-1",
            referral_id: REFERRAL_ID,
            status: "STAFF_REVIEW",
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
        workflows.push(params?.[2]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.now() + 90000000).toISOString();
    const result = await service.reassessAfterFollowup(
      SP_ID,
      "SPECIALIST",
      { user: { id: SP_ID } },
      ORDER_ID,
      {
        decision: "REQUEST_VIDEO",
        notes: "No suitable slot",
        requested_start: start,
        requested_end: end,
      }
    );
    expect(result.availability_request_id).toBe("avail-1");
    expect(result.booking_path).toBe("AVAILABILITY_REQUEST");
    expect(workflows).toContain("VIDEO_CONSULTATION_REQUESTED");
    expect(availabilityService.fanOutDiagnosticVideoAvailabilityNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: "avail-1",
        excludeUserId: SP_ID,
      })
    );
  });

  test("Due scan notifies without opening the order and dedupes repeats", async () => {
    const insertCalls = [];
    pool.connect.mockResolvedValue({
      query: jest.fn(async (sql, params) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }] };
        if (sql.includes("FROM tbl_diagnostic_orders") && sql.includes("follow_up_due_date")) {
          return {
            rows: [baseOrder({
              workflow_status: "SENT_TO_HEALTH_WORKER",
              assigned_health_worker_id: HW_ID,
            })],
          };
        }
        if (sql.includes("FROM tbl_diagnostic_advice")) {
          return {
            rows: [{
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              status: "SIGNED",
              follow_up_required: true,
              follow_up_due_date: "2020-01-01",
              is_current: true,
            }],
          };
        }
        if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
        if (sql.includes("FROM tbl_notifications")) {
          // Second scan path: already notified for this dedupe key.
          if (insertCalls.length > 0) return { rows: [{ id: 1 }] };
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO tbl_notifications")) {
          insertCalls.push(params);
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    });

    const first = await service.scanDueFollowupNotifications();
    expect(first.skipped).toBe(false);
    expect(first.scanned).toBe(1);
    expect(insertCalls.length).toBeGreaterThan(0);

    const secondClient = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }] };
        if (sql.includes("FROM tbl_diagnostic_orders") && sql.includes("follow_up_due_date")) {
          return {
            rows: [baseOrder({
              workflow_status: "SENT_TO_HEALTH_WORKER",
              assigned_health_worker_id: HW_ID,
            })],
          };
        }
        if (sql.includes("FROM tbl_diagnostic_advice")) {
          return {
            rows: [{
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              status: "SIGNED",
              follow_up_required: true,
              follow_up_due_date: "2020-01-01",
              is_current: true,
            }],
          };
        }
        if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
        if (sql.includes("FROM tbl_notifications")) return { rows: [{ id: 1 }] };
        if (sql.includes("INSERT INTO tbl_notifications")) {
          insertCalls.push(params);
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(secondClient);
    const insertsBefore = insertCalls.length;
    await service.scanDueFollowupNotifications();
    expect(insertCalls.length).toBe(insertsBefore);
  });

  test("Overdue follow-up notify does not close the order", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes("FROM tbl_diagnostic_advice")) {
          return {
            rows: [{
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              status: "SIGNED",
              follow_up_required: true,
              follow_up_due_date: "2020-01-01",
              is_current: true,
            }],
          };
        }
        if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
        if (sql.includes("FROM tbl_notifications")) return { rows: [] };
        if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
        return { rows: [] };
      }),
    };
    const flags = await service.notifyFollowupDueForOrder(client, baseOrder({
      workflow_status: "SENT_TO_HEALTH_WORKER",
      assigned_health_worker_id: HW_ID,
    }));
    expect(flags.follow_up_overdue).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE tbl_diagnostic_orders"))).toBe(false);
  });

  test("Scheduler uses one connection for lock and unlock and releases it", async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        queries.push(String(sql));
        if (sql.includes("pg_try_advisory_lock")) {
          expect(queries[0]).toContain("pg_try_advisory_lock");
          return { rows: [{ acquired: true }] };
        }
        if (sql.includes("pg_advisory_unlock")) {
          expect(queries.some((q) => q.includes("pg_try_advisory_lock"))).toBe(true);
          return { rows: [{ pg_advisory_unlock: true }] };
        }
        if (sql.includes("FROM tbl_diagnostic_orders") && sql.includes("follow_up_due_date")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const result = await service.scanDueFollowupNotifications();
    expect(result.skipped).toBe(false);
    expect(result.scanned).toBe(0);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_try_advisory_lock"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_unlock"))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
    // Lock key must match exported constant (same connection ownership contract).
    const lockParams = client.query.mock.calls.find(([sql]) => String(sql).includes("pg_try_advisory_lock"))[1];
    const unlockParams = client.query.mock.calls.find(([sql]) => String(sql).includes("pg_advisory_unlock"))[1];
    expect(lockParams[0]).toBe(service.FOLLOWUP_DUE_ADVISORY_LOCK_KEY);
    expect(unlockParams[0]).toBe(service.FOLLOWUP_DUE_ADVISORY_LOCK_KEY);
  });

  test("Scheduler skips cleanly when lock is held elsewhere and still releases connection", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: false }] };
        if (sql.includes("pg_advisory_unlock")) {
          throw new Error("should not unlock when lock was not acquired");
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const result = await service.scanDueFollowupNotifications();
    expect(result).toMatchObject({ skipped: true, lock_held_elsewhere: true, scanned: 0 });
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_unlock"))).toBe(false);
  });

  test("Scheduler continues after a per-order notify failure and unlocks", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }] };
        if (sql.includes("FROM tbl_diagnostic_orders") && sql.includes("follow_up_due_date")) {
          return {
            rows: [
              baseOrder({
                id: "order-fail",
                workflow_status: "SENT_TO_HEALTH_WORKER",
                assigned_health_worker_id: HW_ID,
              }),
              baseOrder({
                id: "order-ok",
                order_code: "DX-2",
                workflow_status: "SENT_TO_HEALTH_WORKER",
                assigned_health_worker_id: HW_ID,
              }),
            ],
          };
        }
        if (sql.includes("FROM tbl_diagnostic_advice")) {
          // First order advice load will be followed by template failure path via notifyOnce
          return {
            rows: [{
              id: "advice-1",
              status: "SIGNED",
              follow_up_required: true,
              follow_up_due_date: "2020-01-01",
              is_current: true,
            }],
          };
        }
        if (sql.includes("FROM mst_notification_templates")) {
          if (client.query.mock.calls.filter(([q]) => String(q).includes("mst_notification_templates")).length <= 2) {
            throw new Error("template lookup failed for first order");
          }
          return { rows: [{ id: 1, language_id: 1 }] };
        }
        if (sql.includes("FROM tbl_notifications")) return { rows: [] };
        if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const result = await service.scanDueFollowupNotifications();
    expect(result.scanned).toBe(2);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_unlock"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE tbl_diagnostic_orders"))).toBe(false);
  });

  test("Eligible Health Workers are scoped per facility and exclude other districts", async () => {
    pool.query = jest.fn(async (sql, params) => {
      if (sql.includes("FROM tbl_diagnostic_orders diagnostic_order") && sql.includes("tbl_patients")) {
        return {
          rows: [{
            id: ORDER_ID,
            facility_id: 8,
            patient_id: PATIENT_ID,
            registered_by: HW_ID,
            registered_facility_id: 8,
            village_id: 1,
            mandal_id: 2,
          }],
        };
      }
      if (sql.includes("HEALTH_WORKER") && sql.includes("DISTINCT")) {
        expect(params[0]).toBe(PATIENT_ID);
        expect(params[1]).toBe(8);
        return {
          rows: [
            {
              id: HW_ID,
              full_name: "Facility 8 HW",
              username: "hw.f8",
              facility_name: "PHC Demo",
              mandal_name: "Demo Mandal",
            },
          ],
        };
      }
      return { rows: [] };
    });

    orderService.getOrderForUser.mockResolvedValueOnce({
      order: baseOrder({ facility_id: 8 }),
    });
    const facilityA = await service.listEligibleHealthWorkers(NAV_ID, "NAVIGATOR", ORDER_ID);
    expect(facilityA.health_workers).toHaveLength(1);
    expect(facilityA.health_workers[0].id).toBe(HW_ID);

    pool.query = jest.fn(async (sql, params) => {
      if (sql.includes("FROM tbl_diagnostic_orders diagnostic_order") && sql.includes("tbl_patients")) {
        return {
          rows: [{
            id: ORDER_ID,
            facility_id: 99,
            patient_id: PATIENT_ID,
            registered_by: OTHER_HW,
            registered_facility_id: 99,
            village_id: 50,
            mandal_id: 60,
          }],
        };
      }
      if (sql.includes("HEALTH_WORKER") && sql.includes("DISTINCT")) {
        expect(params[1]).toBe(99);
        return {
          rows: [
            {
              id: OTHER_HW,
              full_name: "Facility 99 HW",
              username: "hw.f99",
              facility_name: "Other District PHC",
              mandal_name: "Other Mandal",
            },
          ],
        };
      }
      return { rows: [] };
    });

    orderService.getOrderForUser.mockResolvedValueOnce({
      order: baseOrder({ facility_id: 99 }),
    });
    const facilityB = await service.listEligibleHealthWorkers(NAV_ID, "NAVIGATOR", ORDER_ID);
    expect(facilityB.health_workers).toHaveLength(1);
    expect(facilityB.health_workers[0].id).toBe(OTHER_HW);
    expect(facilityB.health_workers[0].id).not.toBe(HW_ID);
  });
});
