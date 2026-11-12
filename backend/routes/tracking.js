const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/trackingController");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();

const roles = [
  "HEALTH_WORKER",
  "NAVIGATOR",
  "SPECIALIST",
  "MEDICAL_OFFICER",
  "HOSPITAL_STAFF",
  "DISTRICT_ADMIN",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
];

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  filter: z.enum(["all", "active", "overdue", "escalations", "diagnostics"]).optional(),
});

const patientParams = z.object({
  patientId: z.string().uuid(),
});

router.use(authenticate, allowRoles(...roles));

router.get("/dashboard", controller.dashboard);
router.get("/patients", validate({ query: listQuery }), controller.patients);
router.get("/patients/:patientId/journey", validate({ params: patientParams }), controller.journey);

module.exports = router;
