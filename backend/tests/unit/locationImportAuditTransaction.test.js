const mockClientQuery = jest.fn();
const mockConnect = jest.fn();
const mockGetStates = jest.fn();
const mockGetDistricts = jest.fn();
const mockAudit = jest.fn();
const mockEvents = [];
let mockClient;

jest.mock("../../db", () => ({
  connect: (...args) => mockConnect(...args),
}));
jest.mock("../../services/lgdClient", () => ({
  getStates: (...args) => mockGetStates(...args),
  getDistricts: (...args) => mockGetDistricts(...args),
}));
jest.mock("../../utils/audit", () => ({
  audit: (...args) => mockAudit(...args),
}));

const { runImport } = require("../../services/locationImportService");

const req = { user: { id: "admin-1", role_name: "SUPER_ADMIN" } };
const selectedRow = { lgd_code: 744, name_en: "New District", name_te: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockGetStates.mockResolvedValue({
    rows: [{ lgd_code: 28, name_en: "Andhra Pradesh" }],
  });
  mockGetDistricts.mockResolvedValue({
    rows: [selectedRow],
    sourceUrl: "https://example.invalid/lgd",
  });
  mockClient = {
    query: async (sql) => {
      mockClientQuery(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        mockEvents.push(sql);
        return { rows: [] };
      }
      if (sql.includes("FROM mst_districts") && sql.includes("state_lgd_code")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_location_import_batches")) return { rows: [{ id: 9 }] };
      if (sql.includes("INSERT INTO mst_districts")) {
        mockEvents.push("business-change");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: jest.fn(),
  };
  mockConnect.mockResolvedValue(mockClient);
  mockAudit.mockImplementation(async (_req, options) => {
    mockEvents.push("audit");
    expect(options.required).toBe(true);
    expect(options.client).toBeDefined();
  });
});

test("location import audit is required on the import transaction before commit", async () => {
  const result = await runImport("district", { stateCode: "28" }, [744], req);

  expect(result.batch_id).toBe(9);
  expect(mockEvents).toEqual(["BEGIN", "business-change", "audit", "COMMIT"]);
  expect(mockAudit).toHaveBeenCalledWith(req, expect.objectContaining({
    client: mockClient,
    required: true,
    event: "LOCATION_IMPORT",
    resourceType: "location_import",
    resourceId: 9,
  }));
});

test("location import rolls back when audit writing fails", async () => {
  mockAudit.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(runImport("district", { stateCode: "28" }, [744], req))
    .rejects.toThrow("audit unavailable");

  expect(mockEvents).toEqual(["BEGIN", "business-change", "ROLLBACK"]);
  expect(mockEvents).not.toContain("COMMIT");
});
