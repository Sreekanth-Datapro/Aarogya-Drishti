// /api/district: District Admin only, read only, and always scoped to the
// district stored on the signed-in user's record (never a request value).

let mockSessionRow;
let mockAssignedDistrict;
const mockDataQueries = [];

jest.mock("../../db", () => ({
  query: jest.fn(async (sql, params) => {
    if (sql.includes("JOIN tbl_user_sessions")) return { rows: mockSessionRow ? [mockSessionRow] : [] };
    if (sql.includes("JOIN mst_districts d ON d.id = u.district_id")) {
      return { rows: mockAssignedDistrict ? [{ district_id: mockAssignedDistrict }] : [] };
    }
    mockDataQueries.push({ sql, params });
    if (sql.includes("FROM mst_districts WHERE id = $1")) return { rows: [{ id: "101", code: "D1", name_en: "District", name_te: null }] };
    if (sql.includes("FROM mst_mandals WHERE id = $1 AND district_id = $2")) {
      return { rows: params[0] === 7 ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("COUNT(*) AS total")) return { rows: [{ total: "0" }] };
    return { rows: [] };
  }),
}));
jest.mock("../../utils/jwt", () => ({
  verifyAccessToken: jest.fn(() => ({ sub: "user-1", sid: "session-1" })),
}));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async (roleId) =>
    roleId === 6 ? ["dashboard.view_aggregate", "export.aggregate", "master.view"] : ["audit.view", "master.view"]),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));

const express = require("express");
const request = require("supertest");
const districtRoutes = require("../../routes/district");
const errorMiddleware = require("../../middleware/errorMiddleware");

const app = express();
app.use("/api/district", districtRoutes);
app.use(errorMiddleware);

function session(roleName) {
  return {
    id: "user-1",
    username: "da.ravi.4821",
    full_name: "Ravi",
    role_id: roleName === "DISTRICT_ADMIN" ? 6 : 1,
    role_name: roleName,
    status: "ACTIVE",
    must_change_password: false,
    mfa_enabled: true,
    mfa_required: true,
    session_id: "session-1",
    mfa_verified: true,
  };
}

const call = (path) => request(app).get(path).set("Authorization", "Bearer access-token");

beforeEach(() => {
  mockSessionRow = session("DISTRICT_ADMIN");
  mockAssignedDistrict = 101;
  mockDataQueries.length = 0;
});

test("a Super Admin cannot use the District Admin API", async () => {
  mockSessionRow = session("SUPER_ADMIN");
  const response = await call("/api/district/mandals");
  expect(response.status).toBe(403);
  expect(mockDataQueries).toHaveLength(0);
});

test("a District Admin without an assigned district is refused", async () => {
  mockAssignedDistrict = null;
  const response = await call("/api/district/mandals");
  expect(response.status).toBe(403);
  expect(response.body.code).toBe("DISTRICT_NOT_ASSIGNED");
  expect(mockDataQueries).toHaveLength(0);
});

test("mandal list uses the district from the user record, not district_id in the URL", async () => {
  const response = await call("/api/district/mandals?district_id=202");
  expect(response.status).toBe(200);
  expect(mockDataQueries.length).toBeGreaterThan(0);
  for (const query of mockDataQueries) {
    expect(query.params[0]).toBe(101);
    expect(query.params).not.toContain(202);
    expect(query.params).not.toContain("202");
  }
});

test("villages of a mandal from another district are not returned", async () => {
  const response = await call("/api/district/villages?mandal_id=999");
  expect(response.status).toBe(404);
  expect(mockDataQueries.some((query) => query.sql.includes("FROM mst_villages"))).toBe(false);
});

test("villages of a mandal in the district are listed", async () => {
  const response = await call("/api/district/villages?mandal_id=7");
  expect(response.status).toBe(200);
  const villageQuery = mockDataQueries.find((query) => query.sql.includes("FROM mst_villages v"));
  expect(villageQuery.params.slice(0, 3)).toEqual([101, null, 7]);
});

test("district audit logs always include the district condition", async () => {
  const response = await call("/api/district/audit/logs?district_id=202");
  expect(response.status).toBe(200);
  const listQuery = mockDataQueries.find((query) => query.sql.includes("ORDER BY a.occurred_at DESC"));
  expect(listQuery.sql).toContain("du.district_id = $1");
  expect(listQuery.params[0]).toBe(101);
  expect(listQuery.params).not.toContain("202");
});

test("district audit detail is limited to the district", async () => {
  const response = await call("/api/district/audit/logs/5");
  expect(response.status).toBe(404);
  const detailQuery = mockDataQueries.find((query) => query.sql.includes("WHERE a.id = $1"));
  expect(detailQuery.sql).toContain("du.district_id = $2");
  expect(detailQuery.params).toEqual([5, 101]);
});

test("the District Admin API has no write routes", async () => {
  for (const method of ["post", "put", "patch", "delete"]) {
    const response = await request(app)[method]("/api/district/mandals").set("Authorization", "Bearer access-token");
    expect(response.status).toBe(404);
  }
});

test("patient list never selects names, phone numbers, addresses or date of birth", async () => {
  const response = await call("/api/district/patients");
  expect(response.status).toBe(200);
  const listQuery = mockDataQueries.find((query) => query.sql.includes("p.patient_code,"));
  const selectPart = listQuery.sql.split(/\bFROM tbl_patients\b/)[0];
  expect(selectPart).not.toMatch(/full_name|contact_phone|address_line|habitation|date_of_birth\s+AS|p\.date_of_birth,/);
  expect(selectPart).toContain("p.patient_code");
  expect(selectPart).toContain("case_state");
});

test("patient list is scoped to the user's district and ignores district_id in the URL", async () => {
  const response = await call("/api/district/patients?district_id=202&status=AWAITING_CLINICIAN&review=alert");
  expect(response.status).toBe(200);
  for (const query of mockDataQueries) {
    expect(query.params[0]).toBe(101);
    expect(query.params).not.toContain("202");
  }
  const countQuery = mockDataQueries.find((query) => query.sql.includes("AS review_alerts"));
  expect(countQuery.sql).toContain("COALESCE(pf.district_id, vm.district_id) = $1");
  expect(countQuery.params).toEqual([101, "AWAITING_CLINICIAN"]);
});

test("unknown patient status values are not passed to the database", async () => {
  await call("/api/district/patients?status=DROP%20TABLE");
  const countQuery = mockDataQueries.find((query) => query.sql.includes("AS review_alerts"));
  expect(countQuery.params).toEqual([101]);
});

test("patients can be narrowed to one Health Worker, still inside the user's district", async () => {
  const healthWorkerId = "5b8e1c2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d";
  await call(`/api/district/patients?health_worker_id=${healthWorkerId}`);
  const countQuery = mockDataQueries.find((query) => query.sql.includes("AS review_alerts"));
  expect(countQuery.sql).toContain("p.registered_by = $2");
  expect(countQuery.sql).toContain("COALESCE(pf.district_id, vm.district_id) = $1");
  expect(countQuery.params).toEqual([101, healthWorkerId]);

  mockDataQueries.length = 0;
  await call("/api/district/patients?health_worker_id=1%20OR%201=1");
  expect(mockDataQueries.find((query) => query.sql.includes("AS review_alerts")).params).toEqual([101]);
});

test("Health Worker list is scoped to the user's district and never returns secrets", async () => {
  const response = await call("/api/district/health-workers?district_id=202&status=ACTIVE&search=lak");
  expect(response.status).toBe(200);
  const listQuery = mockDataQueries.find((query) => query.sql.includes("LIMIT $5 OFFSET $6"));
  expect(listQuery.sql).toContain("r.code = 'HEALTH_WORKER'");
  expect(listQuery.sql).toContain("u.district_id = $1 OR f.district_id = $1");
  expect(listQuery.params.slice(0, 4)).toEqual([101, "%lak%", null, "ACTIVE"]);
  expect(listQuery.params).not.toContain("202");
  const selectPart = listQuery.sql.split(/\bFROM tbl_users u\b/)[0];
  expect(selectPart).not.toMatch(/password_hash|mfa_secret|employee_ref|email/);
  expect(selectPart).not.toMatch(/p\.full_name|contact_phone|address_line/);
  expect(response.body.summary).toEqual({ total: 0, active: 0, without_location: 0, patients: 0 });
});

test("Health Worker list ignores unknown status values and Mandals of another district", async () => {
  await call("/api/district/health-workers?status=DROP%20TABLE");
  const listQuery = mockDataQueries.find((query) => query.sql.includes("LIMIT $5 OFFSET $6"));
  expect(listQuery.params[3]).toBeNull();

  mockDataQueries.length = 0;
  const response = await call("/api/district/health-workers?mandal_id=999");
  expect(response.status).toBe(404);
  expect(mockDataQueries.some((query) => query.sql.includes("r.code = 'HEALTH_WORKER'"))).toBe(false);
});

test("a Super Admin cannot list a district's Health Workers through the District Admin API", async () => {
  mockSessionRow = session("SUPER_ADMIN");
  const response = await call("/api/district/health-workers");
  expect(response.status).toBe(403);
  expect(mockDataQueries).toHaveLength(0);
});

test("dashboard returns only aggregate patient numbers", async () => {
  const response = await call("/api/district/dashboard");
  expect(response.status).toBe(200);
  const patientSql = mockDataQueries.map((query) => query.sql).join("\n");
  expect(patientSql).not.toMatch(/p\.full_name|p\.contact_phone|p\.address_line/);
  expect(response.body.dashboard.patients).toEqual({ total: 0, new_last_30_days: 0 });
});
