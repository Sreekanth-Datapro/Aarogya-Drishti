jest.mock("../../controllers/registrationController", () => ({
  applicantStatus: jest.fn((_req, res) => res.status(200).json({ success: true })),
  listForMedicalOfficer: jest.fn((_req, res) => res.status(200).json({ registrations: [] })),
  listMedicalOfficerHistory: jest.fn((_req, res) => res.status(200).json({ registrations: [] })),
  getForMedicalOfficer: jest.fn((_req, res) => res.status(200).json({ registration: {} })),
  recommend: jest.fn((_req, res) => res.status(200).json({ success: true })),
  listForDistrictAdmin: jest.fn((_req, res) => res.status(200).json({ registrations: [] })),
  listDistrictAdminHistory: jest.fn((_req, res) => res.status(200).json({ registrations: [] })),
  decide: jest.fn((_req, res) => res.status(200).json({ success: true })),
}));

jest.mock("../../middleware/authMiddleware", () => {
  const guard = (predicate) => (req, res, next) => (
    predicate(req) ? next() : res.status(403).json({ success: false })
  );
  return {
    authenticate: (req, _res, next) => {
      req.user = {
        id: req.header("x-user-id") || "user-1",
        role_name: req.header("x-role") || "HEALTH_WORKER",
        permissions: (req.header("x-permissions") || "").split(",").filter(Boolean),
      };
      next();
    },
    allowRoles: (...roles) => guard((req) => roles.includes(req.user.role_name)),
    requirePermission: (permission) => guard((req) => req.user.permissions.includes(permission)),
    requireAnyPermission: (...permissions) => guard((req) => permissions.some((code) => req.user.permissions.includes(code))),
  };
});

const express = require("express");
const request = require("supertest");
const controller = require("../../controllers/registrationController");
const router = require("../../routes/registrations");

const app = express();
app.use(express.json());
app.use(router);

beforeEach(() => {
  jest.clearAllMocks();
});

function actor(role, permission) {
  return { "x-role": role, "x-permissions": permission };
}

test("Medical Officer cannot call the final-decision route", async () => {
  const response = await request(app)
    .patch("/request-1/decision")
    .set(actor("MEDICAL_OFFICER", "registration.recommend"))
    .send({ action: "APPROVE" });

  expect(response.status).toBe(403);
  expect(controller.decide).not.toHaveBeenCalled();
});

test("District Admin cannot use the Medical Officer recommendation route", async () => {
  const response = await request(app)
    .post("/request-1/recommendation")
    .set(actor("DISTRICT_ADMIN", "registration.finalize"))
    .send({ action: "APPROVE", remarks: "Not an MO" });

  expect(response.status).toBe(403);
  expect(controller.recommend).not.toHaveBeenCalled();
});

test("each role can access only its designated workflow list", async () => {
  const moResponse = await request(app)
    .get("/medical-officer")
    .set(actor("MEDICAL_OFFICER", "registration.recommend"));
  const daResponse = await request(app)
    .get("/district-admin")
    .set(actor("DISTRICT_ADMIN", "registration.monitor"));

  expect(moResponse.status).toBe(200);
  expect(daResponse.status).toBe(200);
  expect(controller.listForMedicalOfficer).toHaveBeenCalledTimes(1);
  expect(controller.listForDistrictAdmin).toHaveBeenCalledTimes(1);
});

test("history endpoints keep their role and permission guards", async () => {
  const moResponse = await request(app)
    .get("/medical-officer/history")
    .set(actor("MEDICAL_OFFICER", "registration.recommend"));
  const daResponse = await request(app)
    .get("/district-admin/history")
    .set(actor("DISTRICT_ADMIN", "registration.monitor"));

  expect(moResponse.status).toBe(200);
  expect(daResponse.status).toBe(200);
  expect(controller.listMedicalOfficerHistory).toHaveBeenCalledTimes(1);
  expect(controller.listDistrictAdminHistory).toHaveBeenCalledTimes(1);

  const denied = await request(app)
    .get("/medical-officer/history")
    .set(actor("DISTRICT_ADMIN", "registration.recommend"));
  expect(denied.status).toBe(403);
  expect(controller.listMedicalOfficerHistory).toHaveBeenCalledTimes(1);
});

test("before migration 015, a Medical Officer with registration.verify reaches the queue and details", async () => {
  const queue = await request(app)
    .get("/medical-officer")
    .set(actor("MEDICAL_OFFICER", "registration.verify"));
  const details = await request(app)
    .get("/medical-officer/requests/request-1")
    .set(actor("MEDICAL_OFFICER", "registration.verify"));

  expect(queue.status).toBe(200);
  expect(details.status).toBe(200);
  expect(controller.getForMedicalOfficer).toHaveBeenCalledTimes(1);
});

test("District Admin cannot open Medical Officer registration details", async () => {
  const response = await request(app)
    .get("/medical-officer/requests/request-1")
    .set(actor("DISTRICT_ADMIN", "registration.verify"));

  expect(response.status).toBe(403);
  expect(controller.getForMedicalOfficer).not.toHaveBeenCalled();
});

test("Medical Officer without registration.recommend is rejected before the queue controller", async () => {
  const response = await request(app)
    .get("/medical-officer")
    .set(actor("MEDICAL_OFFICER", ""));

  expect(response.status).toBe(403);
  expect(controller.listForMedicalOfficer).not.toHaveBeenCalled();
});
