const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const controller = require("../controllers/diagnosticController");
const { authenticate, allowRoles, requirePermission, requireAnyPermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const HttpError = require("../utils/httpError");

const router = express.Router();

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
});

function acceptReportUpload(req, res, next) {
  reportUpload.fields([
    { name: "reports", maxCount: 20 },
    { name: "report", maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(new HttpError(400, "Report file must be 10 MB or smaller", "FILE_TOO_LARGE"));
      }
      if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        return next(new HttpError(400, "Upload at most 20 report files per submission", "TOO_MANY_FILES"));
      }
    }
    return next(error);
  });
}

const positiveId = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/).transform(Number),
]);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  patient_id: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  pending_only: z.enum(["true", "false"]).optional(),
  awaiting_navigator: z.enum(["true", "false"]).optional(),
  category_id: positiveId.optional(),
});

const appointmentListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().max(40).optional(),
  pending_only: z.enum(["true", "false"]).optional(),
  missed_only: z.enum(["true", "false"]).optional(),
  order_id: z.string().uuid().optional(),
});

const orderItem = z.object({
  test_id: positiveId,
  clinical_reason: z.string().trim().min(1).max(2000),
  priority: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
  fasting_required: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  instructions: z.string().trim().max(2000).optional().nullable(),
});

const createOrderBody = z.object({
  patient_id: z.string().uuid(),
  referral_id: z.string().uuid().optional().nullable(),
  facility_id: positiveId,
  requested_date: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(100).optional().nullable(),
  items: z.array(orderItem).min(1).max(20),
});

const assignHwBody = z.object({
  health_worker_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const verifyBody = z.object({
  action: z.enum(["verify", "return"]).optional().default("verify"),
  reason: z.string().trim().max(2000).optional().nullable(),
});

const notesBody = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
});

const adviceBody = z.object({
  findings: z.string().trim().min(1).max(4000),
  precautions: z.string().trim().max(4000).optional().nullable(),
  treatment_advice: z.string().trim().max(4000).optional().nullable(),
  medicine_name: z.string().trim().max(200).optional().nullable(),
  dosage: z.string().trim().max(200).optional().nullable(),
  duration_text: z.string().trim().max(200).optional().nullable(),
  follow_up_instructions: z.string().trim().max(4000).optional().nullable(),
  reassessment_instructions: z.string().trim().max(4000).optional().nullable(),
  follow_up_required: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  follow_up_due_date: z.string().date().optional().nullable(),
  additional_diagnostics_needed: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  additional_diagnostics_notes: z.string().trim().max(2000).optional().nullable(),
});

const patientFollowupBody = z.object({
  action: z.enum(["draft", "submit"]).optional(),
  save_as_draft: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  patient_acknowledged: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  patient_contacted: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  contacted_at: z.string().datetime({ offset: true }).optional().nullable(),
  followup_date: z.string().date().optional().nullable(),
  outcome_notes: z.string().trim().max(4000).optional().nullable(),
  followup_notes: z.string().trim().max(4000).optional().nullable(),
  symptoms_status: z.string().trim().max(4000).optional().nullable(),
  improvement_status: z.enum(["Improved", "No Change", "Worsened"]).optional().nullable(),
  advice_followed: z.union([z.boolean(), z.enum(["true", "false"])]).optional().nullable(),
  medicine_adherence: z.string().trim().max(2000).optional().nullable(),
  new_problems: z.string().trim().max(4000).optional().nullable(),
  specialist_review_needed: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  idempotency_key: z.string().trim().min(8).max(100).optional().nullable(),
});

const followupVerifyBody = z.object({
  action: z.enum(["return", "forward"]),
  reason: z.string().trim().max(2000).optional().nullable(),
});

const reassessDiagnosticItem = z.object({
  test_id: positiveId,
  clinical_reason: z.string().trim().min(1).max(2000),
  priority: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]).optional().default("ROUTINE"),
  fasting_required: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  instructions: z.string().trim().max(2000).optional().nullable(),
});

const reassessBody = z.object({
  decision: z.enum(["CONTINUE", "UPDATE", "REQUEST_DIAGNOSTICS", "REQUEST_VIDEO", "CLOSE"]),
  findings: z.string().trim().max(4000).optional().nullable(),
  final_assessment: z.string().trim().max(4000).optional().nullable(),
  precautions: z.string().trim().max(4000).optional().nullable(),
  treatment_advice: z.string().trim().max(4000).optional().nullable(),
  medicine_name: z.string().trim().max(200).optional().nullable(),
  dosage: z.string().trim().max(200).optional().nullable(),
  duration_text: z.string().trim().max(200).optional().nullable(),
  follow_up_instructions: z.string().trim().max(4000).optional().nullable(),
  reassessment_instructions: z.string().trim().max(4000).optional().nullable(),
  follow_up_required: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  follow_up_due_date: z.string().date().optional().nullable(),
  additional_diagnostics_needed: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  additional_diagnostics_notes: z.string().trim().max(2000).optional().nullable(),
  facility_id: positiveId.optional().nullable(),
  items: z.array(reassessDiagnosticItem).max(20).optional(),
  idempotency_key: z.string().trim().min(8).max(100).optional().nullable(),
  slot_id: z.string().uuid().optional().nullable(),
  requested_start: z.string().datetime({ offset: true }).optional().nullable(),
  requested_end: z.string().datetime({ offset: true }).optional().nullable(),
  closure_reason: z.string().trim().max(4000).optional().nullable(),
  recovery_confirmed: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  reason: z.string().trim().max(4000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const scheduleBody = z.object({
  facility_id: positiveId,
  requested_at: z.string().datetime({ offset: true }),
  coordination_notes: z.string().trim().max(2000).optional().nullable(),
  location_note: z.string().trim().max(500).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(100).optional().nullable(),
});

const confirmBody = z.object({
  confirmed_at_time: z.string().datetime({ offset: true }).optional().nullable(),
  location_note: z.string().trim().max(500).optional().nullable(),
});

const alternativeBody = z.object({
  suggested_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
});

const rescheduleBody = z.object({
  scheduled_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
});

const reasonBody = z.object({
  reason: z.string().trim().min(1).max(1000),
});

const reviewReportBody = z.object({
  clinical_notes: z.string().trim().min(1).max(4000),
});

const reportCategoryBody = z.object({
  document_category: z.string().trim().min(2).max(80),
});

const reportParams = z.object({
  orderId: z.string().uuid(),
  reportId: z.string().uuid(),
});

const followupBody = z.object({
  contact_status: z.enum(["NOT_CONTACTED", "INFORMED", "REACHED", "UNREACHABLE"]).optional(),
  contact_notes: z.string().trim().max(2000).optional().nullable(),
  patient_informed: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  attendance: z.enum(["ATTENDED", "NO_SHOW"]).optional(),
  missed_reason_text: z.string().trim().max(1000).optional().nullable(),
});

const testBody = z.object({
  category_id: positiveId,
  code: z.string().trim().min(2).max(40),
  name_en: z.string().trim().min(1).max(200),
  name_te: z.string().trim().max(200).optional().nullable(),
  default_fasting: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  is_active: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
});

const testParams = z.object({
  testId: z.coerce.number().int().positive(),
});

const orderParams = z.object({
  orderId: z.string().uuid(),
});

const appointmentParams = z.object({
  appointmentId: z.string().uuid(),
});

const doctorRoles = ["MEDICAL_OFFICER", "SPECIALIST"];
const viewerRoles = [
  ...doctorRoles,
  "NAVIGATOR",
  "HOSPITAL_STAFF",
  "HEALTH_WORKER",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
];
const adminRoles = ["SYSTEM_ADMIN", "SUPER_ADMIN"];

router.use(authenticate);

router.get(
  "/categories",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  controller.listCategories
);
router.get(
  "/tests",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  validate({
    query: z.object({
      category_id: positiveId.optional(),
    }),
  }),
  controller.listTests
);
router.get(
  "/facilities",
  allowRoles(...doctorRoles),
  requirePermission("investigation.record"),
  controller.listFacilities
);
router.get(
  "/schedule-facilities",
  allowRoles("NAVIGATOR"),
  requirePermission("diagnostic.schedule"),
  controller.listScheduleFacilities
);
router.get(
  "/eligible-patients",
  allowRoles(...doctorRoles),
  requirePermission("investigation.record"),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).max(10000).optional(),
      page_size: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  controller.listEligiblePatients
);

router.get(
  "/admin/tests",
  allowRoles(...adminRoles),
  requirePermission("master.manage"),
  controller.listAllTests
);
router.post(
  "/admin/tests",
  allowRoles(...adminRoles),
  requirePermission("master.manage"),
  validate({ body: testBody }),
  controller.createTest
);
router.patch(
  "/admin/tests/:testId",
  allowRoles(...adminRoles),
  requirePermission("master.manage"),
  validate({ params: testParams, body: testBody }),
  controller.updateTest
);

router.get(
  "/orders",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  validate({ query: listQuery }),
  controller.listOrders
);
router.get(
  "/orders/:orderId",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  validate({ params: orderParams }),
  controller.getOrder
);
router.post(
  "/orders",
  allowRoles(...doctorRoles),
  requirePermission("investigation.record"),
  validate({ body: createOrderBody }),
  controller.createOrder
);
router.post(
  "/orders/:orderId/schedule",
  allowRoles("NAVIGATOR"),
  requirePermission("diagnostic.schedule"),
  validate({ params: orderParams, body: scheduleBody }),
  controller.createScheduleRequest
);

router.get(
  "/appointments",
  allowRoles("NAVIGATOR", "HOSPITAL_STAFF", "HEALTH_WORKER"),
  requirePermission("diagnostic.view"),
  validate({ query: appointmentListQuery }),
  controller.listAppointments
);
router.get(
  "/appointments/:appointmentId",
  allowRoles("NAVIGATOR", "HOSPITAL_STAFF", "HEALTH_WORKER", ...doctorRoles, ...adminRoles),
  requirePermission("diagnostic.view"),
  validate({ params: appointmentParams }),
  controller.getAppointment
);
router.post(
  "/appointments/:appointmentId/confirm",
  allowRoles("HOSPITAL_STAFF"),
  requirePermission("diagnostic.confirm"),
  validate({ params: appointmentParams, body: confirmBody }),
  controller.confirmAppointment
);
router.post(
  "/appointments/:appointmentId/suggest-alternative",
  allowRoles("HOSPITAL_STAFF"),
  requirePermission("diagnostic.confirm"),
  validate({ params: appointmentParams, body: alternativeBody }),
  controller.suggestAlternative
);
router.post(
  "/appointments/:appointmentId/reschedule",
  allowRoles("HOSPITAL_STAFF"),
  requirePermission("diagnostic.confirm"),
  validate({ params: appointmentParams, body: rescheduleBody }),
  controller.rescheduleAppointment
);
router.post(
  "/appointments/:appointmentId/cancel",
  allowRoles("HOSPITAL_STAFF"),
  requirePermission("diagnostic.confirm"),
  validate({ params: appointmentParams, body: reasonBody }),
  controller.cancelAppointment
);
router.post(
  "/appointments/:appointmentId/followup",
  allowRoles("HEALTH_WORKER"),
  requirePermission("diagnostic.followup"),
  validate({ params: appointmentParams, body: followupBody }),
  controller.updateFollowup
);

router.get(
  "/orders/:orderId/reports",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  validate({ params: orderParams }),
  controller.listReports
);
router.post(
  "/orders/:orderId/reports",
  allowRoles("HEALTH_WORKER", "HOSPITAL_STAFF", ...adminRoles),
  requireAnyPermission("diagnostic.report_upload", "diagnostic.confirm"),
  acceptReportUpload,
  validate({ params: orderParams }),
  controller.uploadReport
);
router.get(
  "/orders/:orderId/reports/:reportId/file",
  allowRoles(...viewerRoles),
  requirePermission("diagnostic.view"),
  validate({ params: reportParams }),
  controller.getReportFile
);
router.patch(
  "/orders/:orderId/reports/:reportId/category",
  allowRoles("HEALTH_WORKER", "HOSPITAL_STAFF", ...adminRoles),
  requireAnyPermission("diagnostic.report_upload", "diagnostic.confirm"),
  validate({ params: reportParams, body: reportCategoryBody }),
  controller.updateReportCategory
);
router.post(
  "/orders/:orderId/reports/:reportId/review",
  allowRoles(...doctorRoles, ...adminRoles),
  requirePermission("diagnostic.report_review"),
  validate({ params: reportParams, body: reviewReportBody }),
  controller.reviewReport
);

router.get(
  "/orders/:orderId/eligible-health-workers",
  allowRoles("NAVIGATOR"),
  // assign_hw is from migration 039; fall back to schedule/view so local DBs without 039 still work.
  requireAnyPermission("diagnostic.assign_hw", "diagnostic.schedule", "diagnostic.view"),
  validate({ params: orderParams }),
  controller.listEligibleHealthWorkers
);
router.post(
  "/orders/:orderId/assign-health-worker",
  allowRoles("NAVIGATOR"),
  requireAnyPermission("diagnostic.assign_hw", "diagnostic.schedule", "diagnostic.view"),
  validate({ params: orderParams, body: assignHwBody }),
  controller.assignHealthWorker
);
router.post(
  "/orders/:orderId/start-collection",
  allowRoles("HEALTH_WORKER"),
  requirePermission("diagnostic.report_upload"),
  validate({ params: orderParams, body: notesBody }),
  controller.startCollection
);
router.post(
  "/orders/:orderId/verify",
  allowRoles("NAVIGATOR"),
  requireAnyPermission("diagnostic.verify", "diagnostic.schedule", "diagnostic.view"),
  validate({ params: orderParams, body: verifyBody }),
  controller.verifyReports
);
router.post(
  "/orders/:orderId/forward-hospital-staff",
  allowRoles("NAVIGATOR"),
  requireAnyPermission("diagnostic.forward_hs", "diagnostic.schedule", "diagnostic.view"),
  validate({ params: orderParams, body: notesBody }),
  controller.forwardToHospitalStaff
);
router.post(
  "/orders/:orderId/route-specialist",
  allowRoles("HOSPITAL_STAFF"),
  // migration 039 permission; fall back so local DBs without 039 still work
  requireAnyPermission("diagnostic.route_specialist", "diagnostic.confirm", "diagnostic.view"),
  validate({ params: orderParams, body: notesBody }),
  controller.routeToSpecialist
);
router.post(
  "/orders/:orderId/advice/draft",
  allowRoles("SPECIALIST"),
  requireAnyPermission("diagnostic.advice_sign", "diagnostic.report_review"),
  validate({ params: orderParams, body: adviceBody }),
  controller.saveAdviceDraft
);
router.post(
  "/orders/:orderId/advice",
  allowRoles("SPECIALIST"),
  requireAnyPermission("diagnostic.advice_sign", "diagnostic.report_review"),
  validate({ params: orderParams, body: adviceBody }),
  controller.signAdvice
);
router.post(
  "/orders/:orderId/forward-advice",
  allowRoles("NAVIGATOR"),
  requireAnyPermission("diagnostic.advice_forward", "diagnostic.schedule"),
  validate({ params: orderParams, body: notesBody }),
  controller.forwardAdviceToHealthWorker
);
router.post(
  "/orders/:orderId/patient-followup",
  allowRoles("HEALTH_WORKER"),
  requireAnyPermission("diagnostic.patient_followup", "diagnostic.followup"),
  validate({ params: orderParams, body: patientFollowupBody }),
  controller.recordPatientFollowup
);
router.post(
  "/orders/:orderId/followup/verify",
  allowRoles("NAVIGATOR"),
  requireAnyPermission(
    "diagnostic.followup_verify",
    "diagnostic.advice_forward",
    "diagnostic.verify"
  ),
  validate({ params: orderParams, body: followupVerifyBody }),
  controller.verifyFollowupReport
);
router.post(
  "/orders/:orderId/reassess",
  allowRoles("SPECIALIST"),
  requireAnyPermission(
    "diagnostic.reassess",
    "diagnostic.case_close",
    "diagnostic.advice_sign"
  ),
  validate({ params: orderParams, body: reassessBody }),
  controller.reassessAfterFollowup
);

module.exports = router;
