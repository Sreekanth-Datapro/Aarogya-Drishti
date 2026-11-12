jest.mock("../../db", () => ({
  query: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(),
}));

const pool = require("../../db");
const { resolveAuthorizedDistrict } = require("../../utils/districtAuthorization");
const dashboard = require("../../controllers/dashboardController");

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  pool.query.mockReset();
});

test("District Admin district is resolved from the authenticated user database record", async () => {
  pool.query.mockResolvedValue({ rows: [{ district_id: 12 }] });
  const req = { user: { id: "da-1", role_name: "DISTRICT_ADMIN" } };

  await expect(resolveAuthorizedDistrict(req)).resolves.toBe(12);
  expect(pool.query.mock.calls[0][1]).toEqual(["da-1"]);
});

test("District Admin without a valid district is rejected", async () => {
  pool.query.mockResolvedValue({ rows: [] });
  const req = { user: { id: "da-2", role_name: "DISTRICT_ADMIN" } };

  await expect(resolveAuthorizedDistrict(req)).rejects.toMatchObject({
    status: 403,
    code: "DISTRICT_NOT_ASSIGNED",
  });
});

test("Super Admin bypasses district resolution and dashboard retains aggregate access", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM tbl_users u") && sql.includes("mst_roles")) {
      throw new Error("District lookup must not run for Super Admin");
    }
    if (sql.includes("FROM vw_district_dashboard_summary")) {
      return { rows: [{ screenings: 0, reviews: 0, referrals: 0, treatment_linked: 0 }] };
    }
    return { rows: [{ total: 0 }] };
  });
  const req = { user: { id: "super-1", role_name: "SUPER_ADMIN", permissions: ["master.view", "dashboard.view_aggregate"] } };
  const res = responseMock();

  await dashboard.summary(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(200);
  expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("vw_district_dashboard_summary WHERE district_id"))).toBe(false);
});

test("District Admin dashboard ignores frontend district_id and scopes every district-aware query", async () => {
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes("JOIN mst_districts d") && sql.includes("r.code = 'DISTRICT_ADMIN'")) {
      return { rows: [{ district_id: 12 }] };
    }
    if (sql.includes("FROM vw_district_dashboard_summary")) {
      return { rows: [{ screenings: 0, reviews: 0, referrals: 0, treatment_linked: 0 }] };
    }
    if (sql.includes("FROM mst_districts d")) {
      return { rows: [] };
    }
    return { rows: [{ total: 0 }] };
  });
  const req = {
    user: { id: "da-1", role_name: "DISTRICT_ADMIN", permissions: ["master.view", "dashboard.view_aggregate"] },
    query: { district_id: 99 },
    body: { district_id: 99 },
  };
  const res = responseMock();

  await dashboard.summary(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(200);
  const districtCalls = pool.query.mock.calls.filter(([, params]) => params && params.includes(12));
  expect(districtCalls.length).toBeGreaterThanOrEqual(4);
  expect(districtCalls.some(([, params]) => params.includes(99))).toBe(false);
});

test("district audit activity SQL is safe for empty and non-numeric metadata values", async () => {
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes("JOIN mst_districts d") && sql.includes("r.code = 'DISTRICT_ADMIN'")) {
      return { rows: [{ district_id: 12 }] };
    }
    if (sql.includes("FROM tbl_audit_logs")) {
      return { rows: [] };
    }
    return {
      rows: sql.includes("server_version")
        ? [{ server_version: "15.0" }]
        : sql.includes("location_import_batches")
          ? [{ at: null }]
          : [{ total: 0 }],
    };
  });
  const req = {
    user: {
      id: "da-audit",
      role_name: "DISTRICT_ADMIN",
      permissions: ["master.view", "dashboard.view_aggregate", "audit.view"],
    },
  };
  const res = responseMock();

  await dashboard.summary(req, res, jest.fn());

  const auditCall = pool.query.mock.calls.find(([sql]) => String(sql).includes("FROM tbl_audit_logs"));
  expect(auditCall).toBeDefined();
  expect(auditCall[0]).not.toContain("actor_user_id");
  expect(auditCall[0]).toContain("actor_id");
  expect(auditCall[0]).not.toContain("::bigint");
  expect(auditCall[0]).toContain("metadata->>'district_id' = $1::text");
  expect(auditCall[1]).toEqual([12]);
});
