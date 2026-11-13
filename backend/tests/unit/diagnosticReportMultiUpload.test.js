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
const HW_ID = "77777777-7777-4777-8777-777777777777";

function pdfFile(name = "report.pdf", content = "%PDF-1.4 sample") {
  const buffer = Buffer.from(content);
  return {
    buffer,
    mimetype: "application/pdf",
    size: buffer.length,
    originalname: name,
  };
}

function jpegFile(name = "scan.jpg") {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  return {
    buffer,
    mimetype: "image/jpeg",
    size: buffer.length,
    originalname: name,
  };
}

function connectTx(handler) {
  const client = {
    query: jest.fn(async (sql, params) => handler(sql, params)),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

function baseOrderHandler({
  items = [],
  existingReports = [],
  statusCode = "SAMPLE_COLLECTED",
  insertFails = false,
  uploadRoleOk = true,
} = {}) {
  const inserted = [];
  return async (sql, params) => {
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
    if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("workflow_status")) {
      return { rows: [] };
    }
    if (sql.includes("UPDATE tbl_diagnostic_orders") && sql.includes("status_id")) {
      return { rows: [] };
    }
    if (sql.includes("UPDATE tbl_diagnostic_order_items") && sql.includes("status_id")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) {
      return { rows: [] };
    }
    if (sql.includes("FROM mst_investigation_statuses")) {
      return { rows: [{ id: 5 }] };
    }
    if (sql.includes("FROM mst_notification_templates")) {
      return { rows: [{ id: 1, language_id: 1 }] };
    }
    if (sql.includes("INSERT INTO tbl_notifications")) {
      return { rows: [] };
    }
    if (sql.includes("FROM tbl_diagnostic_orders") && sql.includes("diagnostic_order.id = $2")) {
      if (!uploadRoleOk) return { rows: [] };
      return {
        rows: [{
          id: ORDER_ID,
          patient_id: PATIENT_ID,
          order_code: "DX-2026-000010",
          prescribed_by: MO_ID,
          status_id: 4,
          status_code: statusCode,
          patient_code: "AD-10",
          assigned_navigator_id: NAV_ID,
          care_navigator_id: null,
          prescribed_by_role: "SPECIALIST",
        }],
      };
    }
    if (sql.includes("FROM tbl_diagnostic_order_items")) {
      return { rows: items };
    }
    // List query also selects checksum_sha256 — match ORDER BY before the checksum lookup.
    if (sql.includes("FROM tbl_diagnostic_order_reports report") && sql.includes("ORDER BY report.created_at DESC")) {
      return { rows: [...existingReports, ...inserted] };
    }
    if (sql.includes("FROM tbl_diagnostic_order_reports report") && sql.includes("checksum_sha256")) {
      const checksum = params?.[1];
      const found = [...existingReports, ...inserted].find((row) => row.checksum_sha256 === checksum);
      return { rows: found ? [found] : [] };
    }
    if (sql.includes("INSERT INTO tbl_diagnostic_order_reports")) {
      if (insertFails) {
        const error = new Error("db insert failed");
        error.code = "23505";
        throw error;
      }
      const row = {
        id: params[0],
        order_id: ORDER_ID,
        patient_id: PATIENT_ID,
        mime_type: params[5],
        original_filename: params[6],
        file_size_bytes: params[7],
        uploaded_by: HW_ID,
        review_status: "PENDING",
        reviewed_by: null,
        reviewed_at: null,
        clinical_notes: params[9],
        created_at: new Date().toISOString(),
        checksum_sha256: params[4],
      };
      inserted.push(row);
      return { rows: [row] };
    }
    if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 5 }] };
    if (sql.includes("FROM mst_notification_templates")) return { rows: [{ id: 9, language_id: 1 }] };
    if (sql.includes("FROM tbl_notifications")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
    if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
    if (sql.includes("UPDATE tbl_diagnostic_order_items")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
    return { rows: [] };
  };
}

describe("diagnostic multi-report upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1. single PDF upload", async () => {
    connectTx(baseOrderHandler({
      items: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        test_id: 1,
        test_code: "CBC",
        test_name: "Complete blood count",
        category_code: "LAB",
      }],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [pdfFile()],
      ["TEST_CBC"]
    );

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].document_category).toBe("TEST_CBC");
    expect(privateImageStorage.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("report_key");
  });

  test("2. multiple PDF/image uploads", async () => {
    connectTx(baseOrderHandler({
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          test_id: 2,
          test_code: "MRI_BRAIN",
          test_name: "MRI Brain",
          category_code: "IMAGING",
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          test_id: 3,
          test_code: "OPG",
          test_name: "Orthopantomogram (OPG)",
          category_code: "IMAGING",
        },
      ],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [pdfFile("report.pdf"), jpegFile("scan.jpg")],
      ["TEST_MRI_BRAIN", "TEST_OPG"]
    );

    expect(result.reports).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(privateImageStorage.uploadBuffer).toHaveBeenCalledTimes(2);
  });

  test("3. multiple files for same document category", async () => {
    connectTx(baseOrderHandler({
      items: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        test_id: 2,
        test_code: "MRI_BRAIN",
        test_name: "MRI Brain",
        category_code: "IMAGING",
      }],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [jpegFile("slice1.jpg"), jpegFile("slice2.jpg")],
      ["TEST_MRI_BRAIN", "TEST_MRI_BRAIN"]
    );

    expect(result.reports).toHaveLength(2);
    expect(result.reports.every((row) => row.document_category === "TEST_MRI_BRAIN")).toBe(true);
  });

  test("4. missing required report does not advance workflow", async () => {
    connectTx(baseOrderHandler({
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          test_id: 2,
          test_code: "MRI_BRAIN",
          test_name: "MRI Brain",
          category_code: "IMAGING",
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          test_id: 3,
          test_code: "OPG",
          test_name: "Orthopantomogram (OPG)",
          category_code: "IMAGING",
        },
      ],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [jpegFile("slice1.jpg")],
      ["TEST_MRI_BRAIN"]
    );

    expect(result.requirements_met).toBe(false);
    expect(result.workflow_advanced).toBe(false);
    expect(result.missing_requirements.map((row) => row.code)).toEqual(["TEST_OPG"]);
    expect(result.missing_requirements.some((row) => row.code === "RADIOLOGIST_REPORT")).toBe(false);
  });

  test("5. invalid file rejection", async () => {
    await expect(
      service.uploadReports(
        HW_ID,
        "HEALTH_WORKER",
        { user: { id: HW_ID }, body: {} },
        ORDER_ID,
        [{
          buffer: Buffer.from("not-a-pdf"),
          mimetype: "application/pdf",
          size: 9,
          originalname: "fake.pdf",
        }],
        ["GENERAL_REPORT"]
      )
    ).rejects.toMatchObject({ code: "INVALID_FILE_CONTENT" });
  });

  test("6. oversized file rejection", async () => {
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1, 0x25);
    huge.write("%PDF", 0);
    await expect(
      service.uploadReports(
        HW_ID,
        "HEALTH_WORKER",
        { user: { id: HW_ID }, body: {} },
        ORDER_ID,
        [{
          buffer: huge,
          mimetype: "application/pdf",
          size: huge.length,
          originalname: "big.pdf",
        }],
        ["GENERAL_REPORT"]
      )
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  test("7. Supabase upload failure", async () => {
    connectTx(baseOrderHandler());
    privateImageStorage.uploadBuffer.mockRejectedValueOnce(new Error("storage down"));

    await expect(
      service.uploadReports(
        HW_ID,
        "HEALTH_WORKER",
        { user: { id: HW_ID }, body: {} },
        ORDER_ID,
        [pdfFile()],
        ["GENERAL_REPORT"]
      )
    ).rejects.toThrow(/storage down/i);
  });

  test("8. database save failure cleans storage object", async () => {
    connectTx(baseOrderHandler({ insertFails: true }));

    await expect(
      service.uploadReports(
        HW_ID,
        "HEALTH_WORKER",
        { user: { id: HW_ID }, body: {} },
        ORDER_ID,
        [pdfFile()],
        ["GENERAL_REPORT"]
      )
    ).rejects.toThrow(/db insert failed/i);

    expect(privateImageStorage.deleteObject).toHaveBeenCalled();
  });

  test("9. partial upload and checksum retry reuse", async () => {
    const first = pdfFile("ok.pdf", "%PDF first");
    const checksum = require("crypto").createHash("sha256").update(first.buffer).digest("hex");
    connectTx(baseOrderHandler({
      existingReports: [{
        id: "55555555-5555-4555-8555-555555555555",
        order_id: ORDER_ID,
        patient_id: PATIENT_ID,
        mime_type: "application/pdf",
        original_filename: "ok.pdf",
        file_size_bytes: first.buffer.length,
        uploaded_by: HW_ID,
        review_status: "PENDING",
        reviewed_by: null,
        reviewed_at: null,
        clinical_notes: "[DOC:GENERAL_REPORT]",
        created_at: new Date().toISOString(),
        checksum_sha256: checksum,
      }],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [first],
      ["GENERAL_REPORT"]
    );

    expect(result.reports[0].reused).toBe(true);
    expect(privateImageStorage.uploadBuffer).not.toHaveBeenCalled();
  });

  test("10. duplicate submission prevention via checksum", async () => {
    const file = pdfFile("dup.pdf", "%PDF duplicate-body");
    const checksum = require("crypto").createHash("sha256").update(file.buffer).digest("hex");
    connectTx(baseOrderHandler({
      existingReports: [{
        id: "55555555-5555-4555-8555-555555555555",
        order_id: ORDER_ID,
        patient_id: PATIENT_ID,
        mime_type: "application/pdf",
        original_filename: "dup.pdf",
        file_size_bytes: file.buffer.length,
        uploaded_by: HW_ID,
        review_status: "PENDING",
        clinical_notes: "[DOC:GENERAL_REPORT]",
        created_at: new Date().toISOString(),
        checksum_sha256: checksum,
      }],
    }));

    const result = await service.uploadReports(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      [file, file],
      ["GENERAL_REPORT", "GENERAL_REPORT"]
    );

    expect(result.reports).toHaveLength(2);
    expect(result.reports.every((row) => row.reused)).toBe(true);
    expect(privateImageStorage.uploadBuffer).not.toHaveBeenCalled();
  });

  test("11. unauthorized Health Worker rejection", async () => {
    connectTx(baseOrderHandler({ uploadRoleOk: false }));

    await expect(
      service.uploadReports(
        HW_ID,
        "HEALTH_WORKER",
        { user: { id: HW_ID }, body: {} },
        ORDER_ID,
        [pdfFile()],
        ["GENERAL_REPORT"]
      )
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("12. requirementsSatisfied uses only Specialist-ordered tests (no invented radiologist)", () => {
    const required = service.buildRequiredDocuments([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        test_id: 2,
        test_code: "MRI_BRAIN",
        test_name: "MRI Brain",
        category_code: "IMAGING",
      },
    ]);
    expect(required.map((row) => row.code)).toEqual(["TEST_MRI_BRAIN"]);
    expect(service.requirementsSatisfied(required, [{ document_category: "TEST_MRI_BRAIN" }]).ok).toBe(true);
    expect(service.requirementsSatisfied(required, [{ document_category: "RADIOLOGIST_REPORT" }]).ok).toBe(false);
  });

  test("12b. updateReportCategory retags DOC prefix and reports remaining gaps", async () => {
    const REPORT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let listedNotes = "[DOC:TEST_BLOOD_GLUCOSE]";
    const handler = baseOrderHandler({
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          test_id: 1,
          test_code: "MRI",
          test_name: "MRI scan",
          category_code: "IMAGING",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          test_id: 2,
          test_code: "OPG",
          test_name: "Orthopantomogram (OPG)",
          category_code: "IMAGING",
        },
      ],
      existingReports: [],
    });
    connectTx(async (sql, params) => {
      if (sql.includes("FOR UPDATE") && sql.includes("tbl_diagnostic_order_reports")) {
        return {
          rows: [{
            id: REPORT_ID,
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "scan.pdf",
            file_size_bytes: 12,
            uploaded_by: HW_ID,
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: "[DOC:TEST_BLOOD_GLUCOSE]",
            created_at: new Date().toISOString(),
          }],
        };
      }
      if (sql.includes("UPDATE tbl_diagnostic_order_reports") && sql.includes("SET clinical_notes")) {
        listedNotes = params[1];
        return {
          rows: [{
            id: REPORT_ID,
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "scan.pdf",
            file_size_bytes: 12,
            uploaded_by: HW_ID,
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: listedNotes,
            created_at: new Date().toISOString(),
          }],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_order_reports report") && sql.includes("ORDER BY report.created_at DESC")) {
        return {
          rows: [{
            id: REPORT_ID,
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "scan.pdf",
            file_size_bytes: 12,
            uploaded_by: HW_ID,
            review_status: "PENDING",
            reviewed_by: null,
            reviewed_at: null,
            clinical_notes: listedNotes,
            created_at: new Date().toISOString(),
            checksum_sha256: "abc",
            uploaded_by_name: "HW",
          }],
        };
      }
      return handler(sql, params);
    });

    const result = await service.updateReportCategory(
      HW_ID,
      "HEALTH_WORKER",
      { user: { id: HW_ID }, body: {} },
      ORDER_ID,
      REPORT_ID,
      { document_category: "TEST_MRI" }
    );
    expect(result.report.document_category).toBe("TEST_MRI");
    expect(result.requirements_met).toBe(false);
    expect(result.missing_requirements.map((row) => row.code)).toContain("TEST_OPG");
  });

  test("13. specialist review path still returns private report metadata only", async () => {
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
      if (sql.includes("FROM tbl_diagnostic_orders")) {
        return {
          rows: [{
            id: ORDER_ID,
            patient_id: PATIENT_ID,
            order_code: "DX-1",
            prescribed_by: MO_ID,
            status_id: 5,
            status_code: "REPORT_RECEIVED",
            patient_code: "AD-1",
            assigned_navigator_id: NAV_ID,
            care_navigator_id: null,
            prescribed_by_role: "SPECIALIST",
          }],
        };
      }
      if (sql.includes("FROM tbl_diagnostic_order_reports") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            order_id: ORDER_ID,
            review_status: "PENDING",
          }],
        };
      }
      if (sql.includes("UPDATE tbl_diagnostic_order_reports")) {
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            order_id: ORDER_ID,
            patient_id: PATIENT_ID,
            mime_type: "application/pdf",
            original_filename: "report.pdf",
            file_size_bytes: 12,
            uploaded_by: HW_ID,
            review_status: "REVIEWED",
            reviewed_by: MO_ID,
            reviewed_at: new Date().toISOString(),
            clinical_notes: "Reviewed findings",
            created_at: new Date().toISOString(),
          }],
        };
      }
      if (sql.includes("FROM mst_investigation_statuses")) return { rows: [{ id: 9 }] };
      if (sql.includes("UPDATE tbl_diagnostic_orders")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_diagnostic_status_history")) return { rows: [] };
      return { rows: [] };
    });

    const result = await service.reviewReport(
      MO_ID,
      "SPECIALIST",
      { user: { id: MO_ID } },
      ORDER_ID,
      "55555555-5555-4555-8555-555555555555",
      { clinical_notes: "Reviewed findings" }
    );

    expect(result.report.review_status).toBe("REVIEWED");
    expect(JSON.stringify(result)).not.toContain("report_key");
  });
});
