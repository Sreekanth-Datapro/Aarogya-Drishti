const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/specialistController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(authenticate, allowRoles("SPECIALIST"));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  filter: z.enum(["all", "pending", "urgent", "completed"]).optional(),
  search: z.string().trim().max(100).optional(),
});
const assessmentBody = z.object({
  decision_type: z.enum([
    "VIDEO_CONSULTATION",
    "DIRECT_HOSPITAL_VISIT",
    "ADDITIONAL_INVESTIGATIONS",
    "CLINICAL_FOLLOW_UP",
    "EMERGENCY_HOSPITAL_REFERRAL",
  ]).optional(),
  clinical_reason: z.string().trim().max(4000).optional(),
  clinical_recommendation: z.string().trim().max(4000).optional(),
  instructions: z.string().trim().max(4000).optional(),
  additional_notes: z.string().trim().max(4000).optional(),
  assessment: z.string().trim().max(4000).optional(),
  recommendations: z.string().trim().max(4000).optional(),
  follow_up_recommendation: z.string().trim().max(4000).optional(),
  next_action: z.enum([
    "VIDEO_CONSULTATION", "HOSPITAL_VISIT", "ADDITIONAL_TESTS", "FOLLOW_UP", "URGENT_REFERRAL",
  ]).optional(),
  priority_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/).transform(Number)]).nullable().optional(),
  hospital_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/).transform(Number)]).nullable().optional(),
  investigation_type_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/).transform(Number)]).nullable().optional(),
  follow_up_date: z.string().date().nullable().optional(),
  slot_id: z.string().uuid().nullable().optional(),
});
const consultationBody = z.object({
  slot_id: z.string().uuid(),
});
const availabilitySlotBody = z.object({
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  hospital_id: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/).transform(Number),
    z.null(),
  ]).optional(),
});
const availabilitySlotParams = z.object({
  slotId: z.string().uuid(),
});
const availabilityRequestParams = z.object({
  requestId: z.string().uuid(),
});
const availabilityResponseBody = z.discriminatedUnion("response", [
  z.object({
    response: z.literal("ACCEPT"),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    response: z.literal("SUGGEST"),
    proposed_start: z.string().datetime({ offset: true }),
    proposed_end: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    response: z.literal("DECLINE"),
    reason: z.string().trim().min(1).max(1000),
  }),
]);

router.get("/dashboard", requirePermission("referral.view"), controller.dashboard);
router.get("/availability/hospitals", requirePermission("appointment.slot_manage"), controller.availabilityHospitals);
router.get("/availability/slots", requirePermission("appointment.slot_manage"), controller.availabilitySlots);
router.get(
  "/availability/requests",
  requirePermission("appointment.slot_manage"),
  controller.availabilityRequests
);
router.get(
  "/appointments",
  requirePermission("appointment.slot_manage"),
  controller.appointments
);
router.post(
  "/availability/requests/:requestId/respond",
  requirePermission("appointment.slot_manage"),
  validate({ params: availabilityRequestParams, body: availabilityResponseBody }),
  controller.respondToAvailabilityRequest
);
router.post(
  "/availability/slots",
  requirePermission("appointment.slot_manage"),
  validate({ body: availabilitySlotBody }),
  controller.createAvailabilitySlot
);
router.delete(
  "/availability/slots/:slotId",
  requirePermission("appointment.slot_manage"),
  validate({ params: availabilitySlotParams }),
  controller.cancelAvailabilitySlot
);
router.get("/referrals", requirePermission("referral.view"), validate({ query: listQuery }), controller.referrals);
router.get(
  "/referrals/:referralId",
  requirePermission("referral.view", "patient.read_assigned"),
  controller.referral
);
router.get(
  "/referrals/:referralId/consultation-slots",
  requirePermission("referral.view", "patient.read_assigned", "appointment.view"),
  controller.consultationSlots
);
router.post(
  "/referrals/:referralId/consultations",
  requirePermission("referral.view", "patient.read_assigned", "appointment.book", "consultation.note"),
  validate({ body: consultationBody }),
  controller.createConsultation
);
router.get(
  "/referrals/:referralId/images/:photoId/file",
  requirePermission("referral.view", "patient.read_assigned", "image.view"),
  controller.streamOriginalImage
);
router.get(
  "/referrals/:referralId/images/:photoId/enhanced-file",
  requirePermission("referral.view", "patient.read_assigned", "image.view"),
  controller.streamEnhancedImage
);
router.post(
  "/referrals/:referralId/images/:photoId/enhance",
  requirePermission("referral.view", "patient.read_assigned", "image.view"),
  controller.enhanceImage
);
router.get(
  "/referrals/:referralId/reports/:reportId/file",
  requirePermission("referral.view", "patient.read_assigned"),
  controller.streamInvestigationReport
);
router.put(
  "/referrals/:referralId/assessment/draft",
  requirePermission("referral.view", "patient.read_assigned", "consultation.note"),
  validate({ body: assessmentBody }),
  controller.saveDraft
);
router.post(
  "/referrals/:referralId/assessment/sign",
  requirePermission("referral.view", "patient.read_assigned", "consultation.note"),
  validate({ body: assessmentBody }),
  controller.signAssessment
);
// Body fields are required for create; service enforces after idempotent reuse check.
const sendToNavigatorBody = z.object({
  clinical_summary: z.string().trim().max(4000).optional(),
  precautions: z.string().trim().max(2000).optional().nullable(),
  follow_up_instructions: z.string().trim().max(2000).optional().nullable(),
  treatment_start_date: z.string().date().optional(),
  expected_end_date: z.string().date().optional().nullable(),
  hospital_revisit_date: z.string().date().optional(),
  precautions_duration_days: z.coerce.number().int().min(1).max(365).optional().nullable(),
  medicines: z.array(z.object({
    medicine_name: z.string().trim().min(1).max(200),
    dosage: z.string().trim().min(1).max(120),
    frequency: z.string().trim().min(1).max(120),
    duration_days: z.coerce.number().int().min(1).max(365),
    precautions: z.string().trim().max(1000).optional().nullable(),
  })).max(20).optional(),
}).optional().default({});
const patientParams = z.object({ patientId: z.string().uuid() });
const authorizeReturnBody = z.object({
  notes: z.string().trim().min(1).max(2000).optional(),
  authorization_notes: z.string().trim().min(1).max(2000).optional(),
}).refine((body) => Boolean(body.notes || body.authorization_notes), {
  message: "Authorization notes are required",
});

router.post(
  "/referrals/:referralId/send-to-navigator",
  requirePermission("care.plan_manage", "referral.view", "patient.read_assigned"),
  validate({ body: sendToNavigatorBody }),
  controller.sendToNavigator
);
router.post(
  "/patients/:patientId/care/authorize-return-to-mo",
  requirePermission("care.plan_manage", "patient.read_assigned"),
  validate({ params: patientParams, body: authorizeReturnBody }),
  controller.authorizeReturnToMo
);

const carePlanParams = z.object({ planId: z.string().uuid() });
const careListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  filter: z.enum([
    "active",
    "escalations",
    "final",
    "reassessment",
    "revisit_due",
    "missed_revisit",
    "closed",
  ]).optional(),
});
const careMedicineSchema = z.object({
  medicine_name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(120),
  duration_days: z.coerce.number().int().min(1).max(365),
  precautions: z.string().trim().max(1000).optional().nullable(),
});
const careReassessBody = z.object({
  clinical_summary: z.string().trim().min(1).max(4000),
  precautions: z.string().trim().max(2000).optional().nullable(),
  reason: z.string().trim().min(1).max(1000),
  treatment_start_date: z.string().date().optional(),
  expected_end_date: z.string().date().optional().nullable(),
  hospital_revisit_date: z.string().date(),
  medicines: z.array(careMedicineSchema).min(1).max(20),
});
const careFinalReviewBody = z.object({
  observations: z.string().trim().min(1).max(4000),
  clinical_assessment: z.string().trim().max(4000).optional().nullable(),
  recovery_confirmed: z.boolean().optional(),
  decision: z.enum([
    "CLOSE_RECOVERED",
    "CONTINUE_TREATMENT",
    "REFER_SPECIALIST",
    "URGENT_ESCALATION",
  ]),
  referral_reason: z.string().trim().max(2000).optional().nullable(),
  urgent_reason: z.string().trim().max(2000).optional().nullable(),
  clinical_summary: z.string().trim().max(4000).optional().nullable(),
  precautions: z.string().trim().max(2000).optional().nullable(),
  treatment_start_date: z.string().date().optional(),
  expected_end_date: z.string().date().optional().nullable(),
  hospital_revisit_date: z.string().date().optional(),
  medicines: z.array(careMedicineSchema).max(20).optional(),
  hospital_facility_id: z.coerce.number().int().positive().optional().nullable(),
  specialty_id: z.coerce.number().int().positive().optional().nullable(),
  priority_id: z.coerce.number().int().positive().optional().nullable(),
  mode: z.enum(["HOSPITAL_VISIT", "VIDEO"]).optional(),
});

router.get("/care/dashboard", requirePermission("care.plan_manage"), controller.careDashboard);
router.get(
  "/care/plans",
  requirePermission("care.plan_manage"),
  validate({ query: careListQuery }),
  controller.carePlans
);
router.get(
  "/care/plans/:planId",
  requirePermission("care.plan_manage"),
  validate({ params: carePlanParams }),
  controller.carePlan
);
router.post(
  "/care/plans/:planId/reassess",
  requirePermission("care.plan_manage"),
  validate({ params: carePlanParams, body: careReassessBody }),
  controller.reassessCarePlan
);
router.post(
  "/care/plans/:planId/final-review",
  requirePermission("care.final_review"),
  validate({ params: carePlanParams, body: careFinalReviewBody }),
  controller.finalReview
);
router.post(
  "/care/plans/:planId/close",
  requirePermission("care.close"),
  validate({ params: carePlanParams }),
  controller.closeCarePlan
);

module.exports = router;
