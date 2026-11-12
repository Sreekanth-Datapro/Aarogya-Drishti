jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const { audit } = require("../../utils/audit");
const service = require("../../services/diagnosticOrderService");

function mockClient(handlers = []) {
  let call = 0;
  return {
    query: jest.fn(async (sql, params) => {
      const text = String(sql).trim().toUpperCase();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      const handler = handlers[call];
      call += 1;
      if (typeof handler === "function") return handler(sql, params);
      if (handler) return handler;
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
}

describe("diagnosticOrderService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createOrder rejects empty items", async () => {
    await expect(
      service.createOrder("mo-1", { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } }, {
        patient_id: "11111111-1111-4111-8111-111111111111",
        facility_id: 1,
        items: [],
      })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  test("createOrder rejects invalid priority", async () => {
    await expect(
      service.createOrder("mo-1", { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } }, {
        patient_id: "11111111-1111-4111-8111-111111111111",
        facility_id: 1,
        items: [{
          test_id: 1,
          clinical_reason: "Suspected lesion",
          priority: "SOON",
        }],
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_PRIORITY" });
  });

  test("createOrder rejects unauthorized role", async () => {
    const client = mockClient([
      { rows: [] }, // setActor
      { rows: [{ granted: true }] }, // consent
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createOrder("nav-1", { user: { id: "nav-1", role_name: "NAVIGATOR" } }, {
        patient_id: "11111111-1111-4111-8111-111111111111",
        facility_id: 1,
        items: [{
          test_id: 1,
          clinical_reason: "Suspected lesion",
          priority: "ROUTINE",
        }],
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("createOrder rejects invalid referral for patient", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const referralId = "22222222-2222-4222-8222-222222222222";
    const client = mockClient([
      { rows: [] }, // setActor
      { rows: [{ granted: true }] }, // consent
      { rows: [{ id: patientId, claim_id: "c1" }] }, // requireActiveClaim
      { rows: [] }, // no open specialist referral
      { rows: [] }, // referral lookup miss
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createOrder("mo-1", { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } }, {
        patient_id: patientId,
        referral_id: referralId,
        facility_id: 1,
        items: [{
          test_id: 1,
          clinical_reason: "Suspected lesion",
          priority: "ROUTINE",
        }],
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_REFERRAL" });
  });

  test("createOrder rejects MO prescribe while specialist referral is open", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const client = mockClient([
      { rows: [] },
      { rows: [{ granted: true }] },
      { rows: [{ id: patientId, claim_id: "c1" }] },
      { rows: [{ referral_code: "REF-OPEN", status: "PLANNED" }] },
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createOrder("mo-1", { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } }, {
        patient_id: patientId,
        facility_id: 9,
        items: [{ test_id: 1, clinical_reason: "Check", priority: "ROUTINE" }],
      })
    ).rejects.toMatchObject({ status: 409, code: "REFERRAL_ACTIVE" });
  });

  test("listEligiblePatients for MO excludes open specialist referrals", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await service.listEligiblePatients("mo-1", "MEDICAL_OFFICER", { page_size: 20 });
    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).toContain("open_ref.status IN ('PLANNED', 'SENT', 'ACCEPTED')");
    expect(sql).toContain("tbl_medical_officer_case_claims");
  });

  test("createOrder saves multiple tests and notifies navigator", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const orderId = "33333333-3333-4333-8333-333333333333";
    const itemOne = "44444444-4444-4444-8444-444444444444";
    const itemTwo = "55555555-5555-4555-8555-555555555555";
    const navigatorId = "66666666-6666-4666-8666-666666666666";

    const client = mockClient([
      { rows: [] }, // setActor
      { rows: [{ granted: true }] }, // consent
      { rows: [{ id: patientId, claim_id: "c1" }] }, // claim
      { rows: [] }, // no open PLANNED/SENT/ACCEPTED
      { rows: [] }, // no completed-referral navigator hint
      { rows: [{ id: 9, name_en: "District Hospital", facility_type: "HOSPITAL" }] }, // facility
      { rows: [{ id: 1 }] }, // status ADVISED
      { rows: [] }, // idempotency miss
      { rows: [{ id: 1 }, { id: 2 }] }, // active tests
      { rows: [{ n: 7 }] }, // sequence
      {
        rows: [{
          id: orderId,
          order_code: "DX-2026-000007",
          patient_id: patientId,
          referral_id: null,
          facility_id: 9,
          created_at: new Date().toISOString(),
        }],
      },
      { rows: [{ id: itemOne }] }, // item 1
      { rows: [] }, // item history 1
      { rows: [{ id: itemTwo }] }, // item 2
      { rows: [] }, // item history 2
      { rows: [] }, // order history
      { rows: [{ patient_code: "P-100", registered_by: "77777777-7777-4777-8777-777777777777" }] },
      { rows: [{ assigned_navigator_id: navigatorId }] }, // care-plan navigator
      { rows: [] }, // navigator notify dedupe miss
      { rows: [{ id: 10, language_id: 1 }] }, // navigator template
      { rows: [] }, // navigator notification insert
      { rows: [] }, // HW notify dedupe miss
      { rows: [{ id: 10, language_id: 1 }] }, // HW template
      { rows: [] }, // HW notification insert
      {
        rows: [
          {
            id: itemOne,
            order_id: orderId,
            test_id: 1,
            clinical_reason: "Lesion check",
            priority: "URGENT",
            fasting_required: true,
            instructions: "No food",
            status_code: "ADVISED",
            status_name: "Advised",
            status_name_te: null,
            test_code: "CBC",
            test_name: "Complete blood count",
            test_name_te: null,
            category_code: "LAB",
            category_name: "Laboratory",
          },
          {
            id: itemTwo,
            order_id: orderId,
            test_id: 2,
            clinical_reason: "Lesion check",
            priority: "URGENT",
            fasting_required: true,
            instructions: "No food",
            status_code: "ADVISED",
            status_name: "Advised",
            status_name_te: null,
            test_code: "OPG",
            test_name: "OPG",
            test_name_te: null,
            category_code: "IMAGING",
            category_name: "Imaging",
          },
        ],
      },
    ]);
    pool.connect.mockResolvedValue(client);

    const result = await service.createOrder(
      "mo-1",
      { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" }, ip: "127.0.0.1", requestId: "r1" },
      {
        patient_id: patientId,
        facility_id: 9,
        idempotency_key: "idem-key-123456",
        items: [
          {
            test_id: 1,
            clinical_reason: "Lesion check",
            priority: "URGENT",
            fasting_required: true,
            instructions: "No food",
          },
          {
            test_id: 2,
            clinical_reason: "Lesion check",
            priority: "URGENT",
            fasting_required: true,
            instructions: "No food",
          },
        ],
      }
    );

    expect(result.order.order_code).toBe("DX-2026-000007");
    expect(result.order.items).toHaveLength(2);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "DIAGNOSTIC_ORDER_CREATED", required: true })
    );
    const notificationCalls = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO tbl_notifications")
    );
    expect(notificationCalls).toHaveLength(2);
    expect(notificationCalls[0][1][0]).toBe(navigatorId);
    expect(notificationCalls[1][1][0]).toBe("77777777-7777-4777-8777-777777777777");
  });

  test("createOrder replays idempotent submissions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const orderId = "33333333-3333-4333-8333-333333333333";
    const client = mockClient([
      { rows: [] }, // setActor
      { rows: [{ granted: true }] }, // consent
      { rows: [{ id: patientId, claim_id: "c1" }] }, // claim
      { rows: [] }, // no open specialist referral
      { rows: [] }, // no referral navigator hint
      { rows: [{ id: 9, name_en: "Hospital", facility_type: "HOSPITAL" }] },
      { rows: [{ id: 1 }] }, // status
      { rows: [{ id: orderId, order_code: "DX-2026-000001" }] }, // existing idempotency
      // getOrderForUser
      {
        rows: [{
          id: orderId,
          order_code: "DX-2026-000001",
          patient_id: patientId,
          referral_id: null,
          facility_id: 9,
          prescribed_by: "mo-1",
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status_code: "ADVISED",
          status_name: "Advised",
          status_name_te: null,
          patient_code: "P-1",
          patient_name: "Patient",
          referral_code: null,
          assigned_navigator_id: null,
          facility_name: "Hospital",
          facility_name_te: null,
          facility_type: "HOSPITAL",
          prescribed_by_name: "MO",
          prescribed_by_role: "MEDICAL_OFFICER",
        }],
      },
      { rows: [] }, // items
      { rows: [] }, // history
    ]);
    pool.connect.mockResolvedValue(client);

    const result = await service.createOrder(
      "mo-1",
      { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } },
      {
        patient_id: patientId,
        facility_id: 9,
        idempotency_key: "same-key-abcdef",
        items: [{ test_id: 1, clinical_reason: "Check", priority: "ROUTINE" }],
      }
    );

    expect(result.idempotent_replay).toBe(true);
    expect(result.order.order_code).toBe("DX-2026-000001");
  });

  test("createOrder rolls back when a later step fails", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const client = mockClient([
      { rows: [] },
      { rows: [{ granted: true }] },
      { rows: [{ id: patientId, claim_id: "c1" }] },
      { rows: [] }, // no open specialist referral
      { rows: [] }, // no referral navigator hint
      { rows: [{ id: 9, name_en: "Hospital", facility_type: "HOSPITAL" }] },
      { rows: [{ id: 1 }] },
      { rows: [{ id: 1 }] },
      { rows: [{ n: 8 }] },
      () => {
        const error = new Error("insert failed");
        error.code = "23505";
        throw error;
      },
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createOrder("mo-1", { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" } }, {
        patient_id: patientId,
        facility_id: 9,
        items: [{ test_id: 1, clinical_reason: "Check", priority: "ROUTINE" }],
      })
    ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_ORDER" });

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
