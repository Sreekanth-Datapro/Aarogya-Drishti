jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));
jest.mock("../../services/diagnosticOrderService", () => {
  const actual = jest.requireActual("../../services/diagnosticOrderService");
  return {
    ...actual,
    getOrderForUser: jest.fn(async () => ({
      order: {
        id: "11111111-1111-4111-8111-111111111111",
        facility_id: 8,
        patient_id: "22222222-2222-4222-8222-222222222222",
        order_code: "DX-1",
        workflow_status: "REPORT_UPLOADED",
      },
    })),
  };
});

const pool = require("../../db");
const orderService = require("../../services/diagnosticOrderService");
const workflow = require("../../services/diagnosticWorkflowService");

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const NAV_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_NAV = "99999999-9999-4999-8999-999999999999";

function connectTx(handler) {
  const client = {
    query: jest.fn(async (sql, params) => handler(sql, params)),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

function orderedItems(list) {
  return list.map((item, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
    test_id: index + 1,
    test_code: item.code,
    test_name: item.name,
    category_code: item.category || "IMAGING",
  }));
}

function reportsWithCategories(categories) {
  return categories.map((code, index) => ({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
    review_status: "PENDING",
    clinical_notes: `[DOC:${code}]`,
    original_filename: `${code}.pdf`,
    created_at: new Date().toISOString(),
  }));
}

function mockVerifyQueries({ items, reports, workflowStatus = "REPORT_UPLOADED", orderPatientId = PATIENT_ID }) {
  return async (sql) => {
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
        rows: [{
          id: ORDER_ID,
          patient_id: orderPatientId,
          facility_id: 8,
          status_id: 4,
          status_code: "REPORT_RECEIVED",
          order_code: "DX-1",
          workflow_status: workflowStatus,
          assigned_health_worker_id: null,
          registered_by: null,
        }],
      };
    }
    if (sql.includes("FROM tbl_diagnostic_order_items")) {
      return { rows: items };
    }
    if (sql.includes("FROM tbl_diagnostic_order_reports") && sql.includes("clinical_notes")) {
      return { rows: reports };
    }
    if (sql.includes("UPDATE tbl_diagnostic_order_reports")) return { rows: [] };
    if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 5 }] };
    if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
    if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
    return { rows: [] };
  };
}

describe("Navigator verify required documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Case 1: Specialist requested MRI only — verify succeeds with MRI uploaded", async () => {
    const items = orderedItems([{ code: "MRI_SCAN", name: "MRI scan" }]);
    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories(["TEST_MRI_SCAN"]),
    }));

    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).resolves.toBeTruthy();
  });

  test("Case 2: MRI + OPG both required before verify", async () => {
    const items = orderedItems([
      { code: "MRI_SCAN", name: "MRI scan" },
      { code: "OPG", name: "Orthopantomogram (OPG)" },
    ]);
    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories(["TEST_MRI_SCAN"]),
    }));

    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).rejects.toMatchObject({
      status: 409,
      code: "REQUIRED_DOCUMENTS_MISSING",
      message: expect.stringContaining("Orthopantomogram (OPG)"),
    });

    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories(["TEST_MRI_SCAN", "TEST_OPG"]),
    }));
    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).resolves.toBeTruthy();
  });

  test("Case 3: all four Specialist-requested categories must be present", async () => {
    const items = orderedItems([
      { code: "MRI_SCAN", name: "MRI scan" },
      { code: "OPG", name: "Orthopantomogram (OPG)" },
      { code: "CYTOLOGY", name: "Cytology smear" },
      { code: "RADIOLOGIST_REPORT", name: "Radiologist written report" },
    ]);
    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories(["TEST_MRI_SCAN", "TEST_OPG", "TEST_CYTOLOGY"]),
    }));

    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Radiologist written report/),
    });

    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories([
        "TEST_MRI_SCAN",
        "TEST_OPG",
        "TEST_CYTOLOGY",
        "TEST_RADIOLOGIST_REPORT",
      ]),
    }));
    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).resolves.toBeTruthy();
  });

  test("Case 4: error lists only the missing requested category", async () => {
    const items = orderedItems([
      { code: "MRI_SCAN", name: "MRI scan" },
      { code: "OPG", name: "Orthopantomogram (OPG)" },
      { code: "CYTOLOGY", name: "Cytology smear" },
    ]);
    connectTx(mockVerifyQueries({
      items,
      reports: reportsWithCategories(["TEST_MRI_SCAN", "TEST_CYTOLOGY"]),
    }));

    try {
      await workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error.code).toBe("REQUIRED_DOCUMENTS_MISSING");
      expect(error.message).toContain("Orthopantomogram (OPG)");
      expect(error.message).not.toContain("MRI scan");
      expect(error.message).not.toContain("Cytology smear");
      expect(error.message).not.toContain("Radiologist written report");
    }
  });

  test("does not invent Radiologist report for imaging-only MRI request", () => {
    const required = orderService.buildRequiredDocuments(orderedItems([
      { code: "MRI_SCAN", name: "MRI scan", category: "IMAGING" },
    ]));
    expect(required).toHaveLength(1);
    expect(required[0].code).toBe("TEST_MRI_SCAN");
  });

  test("missing category metadata does not satisfy requirements", async () => {
    const items = orderedItems([{ code: "MRI_SCAN", name: "MRI scan" }]);
    connectTx(mockVerifyQueries({
      items,
      reports: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        review_status: "PENDING",
        clinical_notes: null,
        original_filename: "scan.pdf",
        created_at: new Date().toISOString(),
      }],
    }));

    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).rejects.toMatchObject({ code: "REQUIRED_DOCUMENTS_MISSING" });
  });

  test("unauthorized role cannot verify", async () => {
    await expect(
      workflow.verifyReports(OTHER_NAV, "HEALTH_WORKER", { user: { id: OTHER_NAV } }, ORDER_ID, { action: "verify" })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("reports for wrong order are not counted (empty for this order_id query)", async () => {
    const items = orderedItems([{ code: "MRI_SCAN", name: "MRI scan" }]);
    connectTx(mockVerifyQueries({
      items,
      reports: [], // query scoped by order_id returns none
    }));

    await expect(
      workflow.verifyReports(NAV_ID, "NAVIGATOR", { user: { id: NAV_ID } }, ORDER_ID, { action: "verify" })
    ).rejects.toMatchObject({ code: "REPORT_REQUIRED" });
  });
});
