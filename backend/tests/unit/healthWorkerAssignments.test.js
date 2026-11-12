const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

jest.mock("../../db", () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: (...args) => mockPoolConnect(...args),
}));

const systemAdminService = require("../../services/systemAdminService");

const actor = { id: "22222222-2222-4222-8222-222222222222", role_name: "DISTRICT_ADMIN" };
const req = { user: actor, ip: "127.0.0.1" };
const workerId = "11111111-1111-4111-8111-111111111111";
const location = { mandal_id: 10, village_id: 20, facility_id: 30 };

beforeEach(() => {
  jest.clearAllMocks();
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: jest.fn(),
  });
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("FROM tbl_users u")) {
      return { rows: [{ id: workerId, full_name: "Asha", district_id: 1 }] };
    }
    if (sql.includes("FROM tbl_health_worker_location_assignments")) return { rows: [] };
    return { rows: [] };
  });
  mockClientQuery.mockImplementation(async (sql) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FOR UPDATE OF u")) return { rows: [{ id: workerId, district_id: 1 }] };
    if (sql.includes("FROM mst_villages v")) {
      return { rows: [{ village_id: 20, mandal_id: 10, district_id: 1, facility_id: 30 }] };
    }
    if (sql.includes("FROM tbl_health_worker_location_assignments")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_health_worker_location_assignments")) return { rows: [] };
    return { rows: [] };
  });
});

test("an administrator can assign a Health Worker to validated Mandal, village and facility locations", async () => {
  const result = await systemAdminService.updateHealthWorkerAssignments(
    actor,
    req,
    workerId,
    { assignments: [location] }
  );

  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_health_worker_location_assignments"),
    [workerId, 1, 10, 20, 30, actor.id]
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_audit_logs"),
    expect.any(Array)
  );
  expect(result.full_name).toBe("Asha");
  expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
});

test("location assignment rejects a village and facility pair outside the selected Mandal", async () => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("FOR UPDATE OF u")) return { rows: [{ id: workerId, district_id: 1 }] };
    if (sql.includes("FROM mst_villages v")) return { rows: [] };
    return { rows: [] };
  });

  await expect(systemAdminService.updateHealthWorkerAssignments(
    actor,
    req,
    workerId,
    { assignments: [location] }
  )).rejects.toMatchObject({ status: 400, code: "INVALID_LOCATION_ASSIGNMENT" });
  expect(mockClientQuery).not.toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO tbl_health_worker_location_assignments"),
    expect.any(Array)
  );
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("at least one Health Worker location is required", async () => {
  await expect(systemAdminService.updateHealthWorkerAssignments(
    actor,
    req,
    workerId,
    { assignments: [] }
  )).rejects.toMatchObject({ status: 400, code: "HEALTH_WORKER_ASSIGNMENT_REQUIRED" });
  expect(mockPoolConnect).not.toHaveBeenCalled();
});
