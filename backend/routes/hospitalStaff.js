const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/hospitalStaffController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(authenticate, allowRoles("HOSPITAL_STAFF"));

const appointmentId = z.object({ appointmentId: z.string().uuid() });
const consultationId = z.object({ consultationId: z.string().uuid() });
const statusQuery = z.object({
  status: z.enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "MISSED", "CANCELLED"]).optional(),
});
const reasonBody = z.object({ reason: z.string().trim().min(1).max(1000) });
const rescheduleBody = z.object({
  scheduled_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
});
const videoRescheduleBody = z.object({
  slot_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});
const availabilityRequestId = z.object({ requestId: z.string().uuid() });
const availabilityRequestBody = z.object({
  referral_id: z.string().uuid(),
  requested_start: z.string().datetime({ offset: true }),
  requested_end: z.string().datetime({ offset: true }),
  reschedule_consultation_id: z.string().uuid().optional(),
});
const directVideoSlotBody = z.object({
  referral_id: z.string().uuid(),
  slot_id: z.string().uuid(),
});
const availabilityRescheduleBody = z.object({
  requested_start: z.string().datetime({ offset: true }),
  requested_end: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
});
const attendanceBody = z.object({
  attendance: z.enum(["ATTENDED", "NO_SHOW"]),
  reason: z.string().trim().max(1000).optional().default(""),
});

router.get("/appointments", requirePermission("appointment.view"), validate({ query: statusQuery }), controller.listAppointments);
router.get("/video-consultations", requirePermission("appointment.view"), validate({ query: statusQuery }), controller.listVideoConsultations);
router.get(
  "/video-availability-requests",
  requirePermission("appointment.view"),
  controller.listVideoAvailabilityRequests
);
router.get(
  "/video-availability-requests/eligible-referrals",
  requirePermission("appointment.view"),
  controller.videoAvailabilityReferrals
);
router.post(
  "/video-availability-requests",
  requirePermission("appointment.confirm"),
  validate({ body: availabilityRequestBody }),
  controller.createVideoAvailabilityRequest
);
router.post(
  "/video-availability-requests/direct-confirm",
  requirePermission("appointment.confirm"),
  validate({ body: directVideoSlotBody }),
  controller.directConfirmVideoSlot
);
router.post(
  "/video-availability-requests/:requestId/forward",
  requirePermission("appointment.confirm"),
  validate({ params: availabilityRequestId }),
  controller.forwardVideoAvailabilityRequest
);
router.post(
  "/video-availability-requests/:requestId/confirm",
  requirePermission("appointment.confirm"),
  validate({ params: availabilityRequestId }),
  controller.confirmVideoAvailabilityRequest
);
router.post(
  "/video-availability-requests/:requestId/reschedule",
  requirePermission("appointment.confirm"),
  validate({ params: availabilityRequestId, body: availabilityRescheduleBody }),
  controller.rescheduleVideoAvailabilityRequest
);
router.post(
  "/video-availability-requests/:requestId/decline",
  requirePermission("appointment.confirm"),
  validate({ params: availabilityRequestId, body: reasonBody }),
  controller.declineVideoAvailabilityRequest
);
router.get("/appointments/:appointmentId", requirePermission("appointment.view"), validate({ params: appointmentId }), controller.getAppointment);
router.post("/appointments/:appointmentId/confirm", requirePermission("appointment.confirm"), validate({ params: appointmentId }), controller.confirmAppointment);
router.post("/appointments/:appointmentId/reschedule", requirePermission("appointment.confirm"), validate({ params: appointmentId, body: rescheduleBody }), controller.rescheduleAppointment);
router.post(
  "/video-consultations/:consultationId/confirm",
  requirePermission("appointment.confirm"),
  validate({ params: consultationId }),
  controller.confirmVideoConsultation
);
router.post(
  "/video-consultations/:consultationId/reschedule",
  requirePermission("appointment.confirm"),
  validate({ params: consultationId, body: videoRescheduleBody }),
  controller.rescheduleVideoConsultation
);
router.post("/appointments/:appointmentId/cancel", requirePermission("appointment.confirm"), validate({ params: appointmentId, body: reasonBody }), controller.cancelAppointment);
router.post("/appointments/:appointmentId/attendance", requirePermission("appointment.confirm"), validate({ params: appointmentId, body: attendanceBody }), controller.recordAttendance);

module.exports = router;
