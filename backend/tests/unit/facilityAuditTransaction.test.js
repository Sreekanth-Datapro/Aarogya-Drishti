const mockClientQuery = jest.fn();
const mockConnect = jest.fn();
const mockAudit = jest.fn();
const mockEvents = [];
let mockClient;

jest.mock("../../db", () => ({
  connect: (...args) => mockConnect(...args),
}));
jest.mock("../../utils/audit", () => ({
  audit: (...args) => mockAudit(...args),
}));

const facilityService = require("../../services/facilityService");

const req = { user: { id: "admin-1", role_name: "SUPER_ADMIN" } };
const facility = {
  id: 8,
  district_id: 1,
  mandal_id: 2,
  village_id: 3,
  is_active: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockClient = {
    query: async (sql) => {
      mockClientQuery(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        mockEvents.push(sql);
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE mst_facilities SET is_active")) {
        mockEvents.push("business-change");
        return { rows: [{ phc_id: null, hospital_id: null }] };
      }
      if (sql.includes("SELECT f.id")) return { rows: [facility] };
      if (sql.includes("SELECT u.id")) return { rows: [] };
      return { rows: [] };
    },
    release: jest.fn(),
  };
  mockConnect.mockResolvedValue(mockClient);
  mockAudit.mockImplementation(async (_req, options) => {
    mockEvents.push("audit");
    expect(options.client).toBeDefined();
    expect(options.required).toBe(true);
  });
});

test("facility status audit is required on the transaction client before commit", async () => {
  await facilityService.setStatus(8, true, null, req);

  expect(mockEvents).toEqual(["BEGIN", "business-change", "audit", "COMMIT"]);
  expect(mockAudit).toHaveBeenCalledWith(req, expect.objectContaining({
    event: "FACILITY_STATUS_CHANGED",
    resourceId: 8,
  }));
  expect(mockAudit.mock.calls[0][1].client).toBe(mockClient);
});

test("facility status change rolls back when audit writing fails", async () => {
  mockAudit.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(facilityService.setStatus(8, true, null, req)).rejects.toThrow("audit unavailable");

  expect(mockEvents).toEqual(["BEGIN", "business-change", "ROLLBACK"]);
  expect(mockAudit).toHaveBeenCalled();
  expect(mockEvents).not.toContain("COMMIT");
});
