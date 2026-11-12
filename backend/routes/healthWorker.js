const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/healthWorkerController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(authenticate, allowRoles("HEALTH_WORKER"));

const appointmentQuery = z.object({
  filter: z.enum(["upcoming", "today", "completed", "cancelled"]).optional(),
});

router.get(
  "/appointments",
  requirePermission("patient.read_assigned"),
  validate({ query: appointmentQuery }),
  controller.appointments
);

router.get(
  "/care/followups",
  requirePermission("care.followup_report"),
  controller.careFollowups
);
router.get(
  "/care/followups/:scheduleId",
  requirePermission("care.followup_report"),
  controller.careFollowup
);
router.post(
  "/care/followups/:scheduleId/report",
  requirePermission("care.followup_report"),
  controller.submitCareFollowupReport
);
router.post(
  "/care/plans/:planId/discomfort",
  requirePermission("care.discomfort_report"),
  controller.reportCareDiscomfort
);

module.exports = router;
