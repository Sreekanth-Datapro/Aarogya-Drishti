const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/navigatorController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(authenticate, allowRoles("NAVIGATOR"));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  filter: z.enum(["all", "pending", "contacted", "scheduled", "completed", "unreachable"]).optional(),
});
const appointmentListQuery = z.object({
  filter: z.enum([
    "upcoming",
    "today",
    "pending_attendance",
    "completed",
    "missed",
    "rescheduled",
    "cancelled",
  ]).optional(),
});
const contactBody = z.object({
  channel: z.enum(["PHONE", "HOME_VISIT", "SMS", "IN_PERSON", "OTHER"]),
  outcome: z.enum(["REACHED", "NOT_REACHED", "WRONG_NUMBER", "REFUSED", "RESCHEDULED"]),
  recipient: z.enum(["PATIENT", "HEALTH_WORKER"]).optional().default("PATIENT"),
  notes: z.string().trim().max(1000).optional().default(""),
});
const appointmentBody = z.object({
  scheduled_at: z.string().datetime({ offset: true }),
  assigned_service: z.string().trim().max(200).optional().default(""),
  location_note: z.string().trim().max(500).optional().default(""),
});
const videoPreferredTimeBody = z.object({
  requested_start: z.string().datetime({ offset: true }),
  requested_end: z.string().datetime({ offset: true }),
});

router.get("/dashboard", requirePermission("referral.view"), controller.dashboard);
router.get(
  "/appointments",
  requirePermission("appointment.view"),
  validate({ query: appointmentListQuery }),
  controller.appointments
);
router.get("/referrals", requirePermission("referral.view"), validate({ query: listQuery }), controller.referrals);
router.get("/referrals/:referralId", requirePermission("referral.view"), controller.referral);
router.post("/referrals/:referralId/contacts", requirePermission("navigation.update"), validate({ body: contactBody }), controller.recordContact);
router.post("/referrals/:referralId/appointments", requirePermission("appointment.book"), validate({ body: appointmentBody }), controller.bookAppointment);
router.post(
  "/referrals/:referralId/video-preferred-time",
  requirePermission("appointment.book"),
  validate({ body: videoPreferredTimeBody }),
  controller.submitVideoPreferredTime
);

router.get("/care/plans", requirePermission("care.followup_assign"), controller.carePlans);
router.get("/care/plans/:planId", requirePermission("care.followup_assign"), controller.carePlan);
router.get(
  "/care/plans/:planId/health-workers",
  requirePermission("care.followup_assign"),
  controller.careHealthWorkers
);
router.post(
  "/care/plans/:planId/schedule-followup",
  requirePermission("care.followup_assign"),
  controller.scheduleCareFollowup
);
router.post(
  "/care/plans/:planId/treatment-completed",
  requirePermission("care.followup_assign"),
  controller.markCareTreatmentCompleted
);
router.post(
  "/care/plans/:planId/discomfort/:discomfortId/escalate",
  requirePermission("care.followup_assign"),
  controller.escalateCareDiscomfort
);
router.patch(
  "/care/plans/:planId/coordination",
  requirePermission("care.followup_assign"),
  controller.updateCareCoordination
);

module.exports = router;
