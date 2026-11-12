const mockPool = { query: jest.fn() };

jest.mock("../../db", () => mockPool);
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../middleware/authMiddleware", () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: req.header("x-user-id") || "user-1",
      role_name: req.header("x-role") || "HEALTH_WORKER",
      permissions: (req.header("x-permissions") || "").split(",").filter(Boolean),
    };
    next();
  },
  requirePermission: (permission) => (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }
    next();
  },
}));

const express = require("express");
const request = require("supertest");
const router = require("../../routes/dashboard");

const app = express();
app.use(express.json());
app.use(router);

function asUser(role, permissions) {
  return {
    "x-role": role,
    "x-permissions": permissions.join(","),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [] });
});

describe("legacy registration monitoring and decision APIs", () => {
  test("Medical Officer monitoring remains scoped to currently assigned Mandals", async () => {
    const response = await request(app)
      .get("/registrations?status=PENDING")
      .set(asUser("MEDICAL_OFFICER", ["registration.monitor"]));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("ma.mandal_id = r.mandal_id"),
      ["user-1", "PENDING"]
    );
    expect(mockPool.query.mock.calls[0][0]).toContain("ma.valid_from <= CURRENT_DATE");
  });

  test("SUPER_ADMIN can monitor registrations without a Mandal filter", async () => {
    const response = await request(app)
      .get("/registrations")
      .set(asUser("SUPER_ADMIN", ["registration.monitor"]));

    expect(response.status).toBe(200);
    expect(mockPool.query.mock.calls[0][0]).not.toContain("tbl_medical_officer_mandal_assignments");
  });

  test("invalid monitoring status is rejected before querying registrations", async () => {
    const response = await request(app)
      .get("/registrations?status=IN_REVIEW")
      .set(asUser("SUPER_ADMIN", ["registration.monitor"]));

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test.each(["SYSTEM_ADMIN", "DISTRICT_ADMIN", "SPECIALIST"])(
    "%s cannot monitor using an unauthorized stale permission",
    async (role) => {
      const response = await request(app)
        .get("/registrations")
        .set(asUser(role, ["registration.monitor"]));

      expect(response.status).toBe(403);
      expect(mockPool.query).not.toHaveBeenCalled();
    }
  );

  test.each(["MEDICAL_OFFICER", "SUPER_ADMIN", "SYSTEM_ADMIN", "DISTRICT_ADMIN", "SPECIALIST"])(
    "%s cannot use the retired single-stage final-decision endpoint",
    async (role) => {
      const response = await request(app)
        .patch("/registrations/request-1/review")
        .set(asUser(role, ["registration.verify"]))
        .send({ action: "APPROVE" });

      expect(response.status).toBe(410);
      expect(mockPool.query).not.toHaveBeenCalled();
    }
  );
});
