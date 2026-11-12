const express = require("express");
const controller = require("../controllers/medicalOfficerController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");

// Every route: signed-in, active Medical Officer. Data is limited in the services
// to the officer's current Mandal assignments; clinical routes also need an
// active claim and the existing permission codes below.
const router = express.Router();
router.use(authenticate, allowRoles("MEDICAL_OFFICER"));

// Dashboard, patients, queue
router.get("/dashboard", controller.dashboard);
router.get("/patients", controller.patients);
router.get("/patients/villages", controller.patientVillages);
router.get("/cases", controller.listCases);
router.post("/patients/:patientId/claim", controller.claimCase);
router.post("/patients/:patientId/release", controller.releaseCase);

// Clinical review and sign-off
router.get("/patients/:patientId/case", requirePermission("patient.read_assigned"), controller.caseContext);
router.put("/patients/:patientId/review", requirePermission("review.create"), controller.saveDraft);
router.post("/patients/:patientId/review/sign", requirePermission("review.sign"), controller.signReview);
router.get("/reviews", requirePermission("review.create"), controller.myReviews);
router.get("/reviews/:reviewId/versions", requirePermission("review.create"), controller.reviewVersions);
router.post("/reviews/:reviewId/amend", requirePermission("review.sign"), controller.amendReview);

// Oral images (private files, consent checked in the service)
router.get("/patients/:patientId/images", requirePermission("image.view"), controller.listImages);
router.get("/patients/:patientId/images/:photoId/file", requirePermission("image.view"), controller.streamImage);
router.get("/patients/:patientId/images/:photoId/enhanced-file", requirePermission("image.view"), controller.streamEnhancedImage);

// Referrals and follow-ups
router.get("/patients/:patientId/referral-options", requirePermission("referral.create"), controller.referralOptions);
router.post("/patients/:patientId/referrals", requirePermission("referral.create"), controller.createReferral);
router.get("/referrals", requirePermission("referral.view"), controller.referrals);
router.get("/referrals/:referralId/history", requirePermission("referral.view"), controller.referralHistory);
router.get("/followups/options", requirePermission("case.assign"), controller.followupOptions);
router.get("/followups", requirePermission("case.assign"), controller.followups);
router.post("/followups", requirePermission("case.assign"), controller.createFollowup);

// Community care lifecycle (treatment plans, escalations, final checkup)
router.get("/care/navigators", requirePermission("care.plan_manage"), controller.careNavigators);
router.get(
  "/care/eligible-patients",
  requirePermission("care.plan_manage"),
  controller.careEligiblePatients
);
router.get("/care/plans", requirePermission("care.plan_manage"), controller.carePlans);
router.get("/care/plans/:planId", requirePermission("care.plan_manage"), controller.carePlan);
router.post(
  "/patients/:patientId/care-plans",
  requirePermission("care.plan_manage"),
  controller.createCarePlan
);
router.post(
  "/care/plans/:planId/reassess",
  requirePermission("care.plan_manage"),
  controller.reassessCarePlan
);
router.post(
  "/care/plans/:planId/final-review",
  requirePermission("care.final_review"),
  controller.finalReviewCarePlan
);
router.post(
  "/care/plans/:planId/close",
  requirePermission("care.close"),
  controller.closeCarePlan
);
router.post(
  "/patients/:patientId/care/return-from-specialist",
  requirePermission("care.plan_manage"),
  controller.confirmReturnFromSpecialist
);

// Reports and profile
router.get("/reports/mandals", controller.report);
router.get("/reports/mandals.csv", controller.exportReport);
router.get("/profile", controller.profile);
router.patch("/profile", controller.updateProfile);

module.exports = router;
