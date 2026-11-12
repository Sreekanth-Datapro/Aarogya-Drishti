const medicalOfficerService = require("../services/medicalOfficerService");
const dashboardService = require("../services/medicalOfficer/dashboardService");
const patientListService = require("../services/medicalOfficer/patientListService");
const reviewService = require("../services/medicalOfficer/reviewService");
const imageService = require("../services/medicalOfficer/imageService");
const referralService = require("../services/medicalOfficer/referralService");
const followupService = require("../services/medicalOfficer/followupService");
const reportService = require("../services/medicalOfficer/reportService");
const profileService = require("../services/medicalOfficer/profileService");
const careLifecycleService = require("../services/careLifecycleService");

// Small helper: run the service and send its result as JSON
function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

// ---------- screening queue (claim / release) ----------
exports.listCases = send(async (req) => {
  const view = typeof req.query.view === "string" ? req.query.view : "available";
  return medicalOfficerService.listCases(req.user.id, view, req.query);
});
exports.claimCase = send(async (req) => ({
  claim: await medicalOfficerService.claimCase(req.user.id, req, req.params.patientId),
}), 201);
exports.releaseCase = send(async (req) => ({
  claim: await medicalOfficerService.releaseCase(req.user.id, req, req.params.patientId),
}));

// ---------- dashboard and patient list ----------
exports.dashboard = send(async (req) => ({ dashboard: await dashboardService.getDashboard(req.user.id) }));
exports.patients = send(async (req) => patientListService.listMandalPatients(req.user.id, req.query));
exports.patientVillages = send(async (req) => ({ villages: await patientListService.listPatientVillages(req.user.id) }));

// ---------- clinical review and sign-off ----------
exports.caseContext = send(async (req) => ({
  case: await reviewService.getCaseContext(req.user.id, req, req.params.patientId),
}));
exports.saveDraft = send(async (req) => ({
  review: await reviewService.saveDraft(req.user.id, req, req.params.patientId, req.body),
  message: "Draft saved",
}));
exports.signReview = send(async (req) => ({
  review: await reviewService.signReview(req.user.id, req, req.params.patientId, req.body),
  message: "Clinical review signed",
}));
exports.amendReview = send(async (req) => ({
  review: await reviewService.amendReview(req.user.id, req, req.params.reviewId, req.body),
  message: "Amendment signed",
}));
exports.myReviews = send(async (req) => reviewService.listMyReviews(req.user.id, req.query));
exports.reviewVersions = send(async (req) => ({
  versions: await reviewService.listReviewVersions(req.user.id, req.params.reviewId),
}));

// ---------- oral images ----------
exports.listImages = send(async (req) => ({
  images: await imageService.listImages(req.user.id, req, req.params.patientId),
}));
exports.streamImage = async (req, res, next) => {
  try {
    const { filePath, data, mimeType } = await imageService.getImageFile(req.user.id, req, req.params.patientId, req.params.photoId);
    res.set({ "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (data) return res.send(data);
    res.sendFile(filePath, (error) => { if (error && !res.headersSent) next(error); });
  } catch (error) {
    next(error);
  }
};
exports.streamEnhancedImage = async (req, res, next) => {
  try {
    const { filePath, data, mimeType } = await imageService.getEnhancedImageFile(
      req.user.id, req, req.params.patientId, req.params.photoId
    );
    res.set({ "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (data) return res.send(data);
    res.sendFile(filePath, (error) => { if (error && !res.headersSent) next(error); });
  } catch (error) {
    next(error);
  }
};

// ---------- referrals and follow-ups ----------
exports.referralOptions = send(async (req) => ({
  options: await referralService.getReferralOptions(req.user.id, req.params.patientId),
}));
exports.createReferral = send(async (req) => ({
  referral: await referralService.createReferral(req.user.id, req, req.params.patientId, req.body),
  message: "Referral created",
}), 201);
exports.referrals = send(async (req) => referralService.listReferrals(req.user.id, req.query));
exports.referralHistory = send(async (req) =>
  referralService.getReferralHistory(req.user.id, req.params.referralId)
);
exports.followupOptions = send(async (req) => ({ options: await followupService.getFollowupOptions(req.user.id) }));
exports.createFollowup = send(async (req) => ({
  task: await followupService.createFollowup(req.user.id, req, req.body),
  message: "Follow-up created",
}), 201);
exports.followups = send(async (req) => followupService.listFollowups(req.user.id, req.query));

// ---------- reports ----------
exports.report = send(async (req) => ({ report: await reportService.getMandalReport(req.user.id, req.query) }));
exports.exportReport = async (req, res, next) => {
  try {
    const csv = await reportService.exportMandalReport(req.user.id, req, req.query);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mandal-summary.csv"',
      "Cache-Control": "no-store",
    });
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

// ---------- my profile ----------
exports.profile = send(async (req) => ({ profile: await profileService.getProfile(req.user.id) }));
exports.updateProfile = send(async (req) => ({
  profile: await profileService.updatePhone(req.user.id, req, req.body),
  message: "Profile updated",
}));

// ---------- community care lifecycle ----------
exports.careNavigators = send(async (req) => ({
  navigators: await careLifecycleService.listNavigatorOptionsForMo(req.user.id),
}));
exports.careEligiblePatients = send(async (req) =>
  careLifecycleService.listCareEligiblePatients(req.user.id, req.query)
);
exports.carePlans = send(async (req) => careLifecycleService.listMoCarePlans(req.user.id, req.query));
exports.carePlan = send(async (req) => ({
  plan: await careLifecycleService.getCarePlanForMo(req.user.id, req.params.planId),
}));
exports.createCarePlan = send(async (req) => ({
  plan: await careLifecycleService.createMoCarePlan(req.user.id, req, req.params.patientId, req.body),
  message: "Treatment plan sent to Navigator",
}), 201);
exports.reassessCarePlan = send(async (req) => ({
  plan: await careLifecycleService.reassessCarePlan(req.user.id, req, req.params.planId, req.body),
  message: "Treatment plan updated after reassessment",
}));
exports.finalReviewCarePlan = send(async (req) => {
  const plan = await careLifecycleService.finalReview(req.user.id, req, req.params.planId, req.body);
  return {
    plan,
    referral: plan.referral || null,
    referral_workflow_required: Boolean(plan.referral_workflow_required),
    message: plan.referral
      ? "Specialist referral saved. Patient removed from MO active treatment workflow."
      : "Final review saved",
  };
});
exports.closeCarePlan = send(async (req) => ({
  plan: await careLifecycleService.closeCarePlan(req.user.id, req, req.params.planId),
  message: "Care case closed",
}));
exports.confirmReturnFromSpecialist = send(async (req) => ({
  ...(await careLifecycleService.confirmReturnFromSpecialist(
    req.user.id,
    req,
    req.params.patientId,
    req.body
  )),
}));
