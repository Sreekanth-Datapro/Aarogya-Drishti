jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));
jest.mock("../../services/privateImageStorage", () => ({
  uploadBuffer: jest.fn(async () => "diagnostic-reports/order/report.pdf"),
  getFile: jest.fn(async () => ({ data: Buffer.from("%PDF") })),
  deleteObject: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const privateImageStorage = require("../../services/privateImageStorage");
const service = require("../../services/diagnosticReportService");

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const MO_ID = "33333333-3333-4333-8333-333333333333";
const NAV_ID = "44444444-4444-4444-8444-444444444444";

function connectTx(handler) {
  const client = {
    query: jest.fn(async (sql, params) => handler(sql, params)),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

describe("diagnosticReportService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uploadReport rejects unsupported mime types", async () => {
    await expect(
      service.uploadReport(
        "hw-1",
        "HEALTH_WORKER",
        { user: { id: "hw-1" } },
        ORDER_ID,
        { buffer: Buffer.from("x"), mimetype: "text/plain", size: 1, originalname: "a.txt" }
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_FILE_TYPE" });
  });

  test("uploadReport stores private object and never returns report_key", async () => {
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
      if (sql.includes("LIMIT 0") && sql.includes("assigned_health_worker_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM mst_investigation_statuses")) {
        return { rows: [{ id: 5 }] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) {
        return { rows: [] };
      }
      if (sql.includes("FROM mst_notification_templates")) {
        return { rows: [{ id: 1, language_id: 1 }] };
      }
      if (sql.includes("INSERT INTO tbl_notifications")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_diagnostic_orders")) {
        return {
          rows: [{
            id: ORDER_ID,
            patient_id: PATIENT_ID,
            order_code: "DX-2026-000001",
            prescribed_by: MO_ID,
            status_id: 4,
            status_code: "REPORT_PENDING",
            patient_code: "AD-1",
            assigned_navigator_id: NAV_ID,
            care_navigator_id: null,
            prescribed_by_role: "MEDICAL_OFFICER",
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_diagnostic_order_reports")) {
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "report.pdf",
            file_size_bytes: 4,
            uploaded_by: "hw-1",
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: null,
            created_at: new Date().toISOString(),
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) {
        return { rows: [{ id: 5 }] };
      }
      if (sql.includes("FROM mst_notification_templates")) {
        return { rows: [{ id: 9, language_id: 1 }] };
      }
      if (sql.includes("FROM tbl_notifications")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_order_status_history") || sql.includes("status_history")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await service.uploadReport(
      "hw-1",
      "HEALTH_WORKER",
      { user: { id: "hw-1" } },
      ORDER_ID,
      {
        buffer: Buffer.from("%PDF"),
        mimetype: "application/pdf",
        size: 4,
        originalname: "report.pdf",
      }
    );

    expect(privateImageStorage.uploadBuffer).toHaveBeenCalled();
    expect(result.report.review_status).toBe("PENDING");
    expect(JSON.stringify(result)).not.toContain("report_key");
  });

  test("uploadReport notifies Navigator only (Specialist waits for Hospital Staff routing)", async () => {
    const SP_ID = "66666666-6666-4666-8666-666666666666";
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
      if (sql.includes("LIMIT 0") && sql.includes("assigned_health_worker_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM mst_investigation_statuses")) {
        return { rows: [{ id: 5 }] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_diagnostic_orders")) {
        return {
          rows: [{
            id: ORDER_ID,
            patient_id: PATIENT_ID,
            order_code: "DX-2026-000002",
            prescribed_by: SP_ID,
            status_id: 4,
            status_code: "COLLECTION_IN_PROGRESS",
            workflow_status: "COLLECTION_IN_PROGRESS",
            patient_code: "AD-2",
            assigned_navigator_id: NAV_ID,
            care_navigator_id: null,
            prescribed_by_role: "SPECIALIST",
          }],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_order_items")) {
        return {
          rows: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            test_id: 1,
            test_code: "MRI",
            test_name: "MRI scan",
            category_code: "IMAGING",
          }],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_order_reports report") && sql.includes("ORDER BY report.created_at DESC")) {
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "report.pdf",
            file_size_bytes: 4,
            uploaded_by: "hw-1",
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: "[DOC:TEST_MRI]",
            created_at: new Date().toISOString(),
            checksum_sha256: "abc",
            uploaded_by_name: "HW",
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_diagnostic_order_reports")) {
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "report.pdf",
            file_size_bytes: 4,
            uploaded_by: "hw-1",
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: "[DOC:TEST_MRI]",
            created_at: new Date().toISOString(),
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 5 }] };
      if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 9, language_id: 1 }] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        payloads.push(String(params?.[4] || ""));
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
      return { rows: [] };
    });

    await service.uploadReport(
      "hw-1",
      "HEALTH_WORKER",
      { user: { id: "hw-1" } },
      ORDER_ID,
      {
        buffer: Buffer.from("%PDF"),
        mimetype: "application/pdf",
        size: 4,
        originalname: "report.pdf",
      }
    );

    const flat = payloads.join("\n");
    expect(flat).toContain(`/navigator/diagnostics/${ORDER_ID}`);
    expect(flat).not.toContain(`/specialist/diagnostics/${ORDER_ID}`);
    expect(flat).not.toContain(`/medical-officer/diagnostics/${ORDER_ID}`);
  });
});
