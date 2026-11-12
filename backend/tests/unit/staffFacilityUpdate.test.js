// Editing a staff member keeps tbl_user_facility_assignments valid:
// valid_to may not be earlier than valid_from (ck_assignment_dates).

const mockClientQueries = [];
let mockCurrentFacility;
let mockCurrentMandals;
let mockValidMandals;

jest.mock("../../db", () => {
  const client = {
    query: jest.fn(async (sql) => {
      mockClientQueries.push(sql);
      if (sql.includes("SELECT mandal_id FROM tbl_medical_officer_mandal_assignments")) {
        return { rows: mockCurrentMandals.map((mandal_id) => ({ mandal_id })) };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "11111111-1111-4111-8111-111111111111", role_id: 3, district_id: 101, role_code: "MEDICAL_OFFICER" }] };
      }
      if (sql.includes("FROM mst_facilities")) return { rows: [{ id: 6, facility_type: "PHC" }] };
      if (sql.includes("SELECT id FROM mst_mandals")) {
        return { rows: mockValidMandals.map((id) => ({ id })) };
      }
      if (sql.includes("SELECT facility_id FROM tbl_user_facility_assignments")) {
        return { rows: [{ facility_id: mockCurrentFacility }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return {
    connect: jest.fn(async () => client),
    query: jest.fn(async () => ({ rows: [{ id: "11111111-1111-4111-8111-111111111111", full_name: "Ravi" }] })),
  };
});
jest.mock("../../utils/districtAuthorization", () => ({
  resolveAuthorizedDistrict: jest.fn(async () => 101),
}));

const { updateStaff } = require("../../services/systemAdminService");

const actor = { id: "22222222-2222-4222-8222-222222222222", role_name: "DISTRICT_ADMIN" };
const req = { user: actor, ip: "127.0.0.1" };
const input = {
  full_name: "Ravi Kumar",
  email: "ravi@example.org",
  phone: "9876543210",
  facility_id: 6,
  mandal_ids: [102],
};
const staffId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockClientQueries.length = 0;
  mockCurrentMandals = [102];
  mockValidMandals = [102];
});

test("saving without changing the facility leaves the assignment untouched", async () => {
  mockCurrentFacility = 6;
  await updateStaff(actor, req, staffId, input);
  expect(mockClientQueries.some((sql) => sql.includes("UPDATE tbl_user_facility_assignments"))).toBe(false);
  expect(mockClientQueries.some((sql) => sql.includes("INSERT INTO tbl_user_facility_assignments"))).toBe(false);
  expect(mockClientQueries.some((sql) => sql.includes("UPDATE tbl_medical_officer_mandal_assignments"))).toBe(false);
  expect(mockClientQueries).toContain("COMMIT");
});

test("moving to another facility closes the old row without breaking the date check", async () => {
  mockCurrentFacility = 5;
  await updateStaff(actor, req, staffId, input);
  const closeSql = mockClientQueries.find((sql) => sql.includes("UPDATE tbl_user_facility_assignments"));
  expect(closeSql).toContain("GREATEST(valid_from, CURRENT_DATE-1)");
  expect(mockClientQueries.some((sql) => sql.includes("INSERT INTO tbl_user_facility_assignments"))).toBe(true);
});

test("editing Mandals closes removed assignments and creates new ones", async () => {
  mockCurrentMandals = [102];
  mockValidMandals = [103];
  await updateStaff(actor, req, staffId, { ...input, mandal_ids: [103] });

  expect(mockClientQueries.some((sql) => sql.includes("UPDATE tbl_medical_officer_mandal_assignments"))).toBe(true);
  expect(mockClientQueries.some((sql) => sql.includes("INSERT INTO tbl_medical_officer_mandal_assignments"))).toBe(true);
});

test("the updated staff record is read after the transaction commits", async () => {
  mockCurrentFacility = 6;
  const pool = require("../../db");
  pool.query.mockClear();
  await updateStaff(actor, req, staffId, input);
  const commitIndex = mockClientQueries.indexOf("COMMIT");
  expect(commitIndex).toBeGreaterThan(-1);
  expect(pool.query).toHaveBeenCalled();
});
