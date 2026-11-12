const navigatorService = require("../services/navigatorService");
const videoConsultationService = require("../services/videoConsultationService");
const careLifecycleService = require("../services/careLifecycleService");
const specialistAvailabilityRequestService = require("../services/specialistAvailabilityRequestService");

function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.dashboard = send(async (req) => ({
  dashboard: await navigatorService.getDashboard(req.user.id),
}));
exports.referrals = send(async (req) => navigatorService.listReferrals(req.user.id, req.validatedQuery));
exports.referral = send(async (req) => navigatorService.getReferral(req.user.id, req.params.referralId));
exports.recordContact = send(async (req) => ({
  contact: await navigatorService.recordContact(req.user.id, req, req.params.referralId, req.body),
}), 201);
exports.bookAppointment = send(async (req) => ({
  appointment: await navigatorService.bookAppointment(req.user.id, req, req.params.referralId, req.body),
}), 201);
exports.submitVideoPreferredTime = send(async (req) => ({
  request: await specialistAvailabilityRequestService.createNavigatorPreferredRequest(
    req.user.id, req, req.params.referralId, req.body
  ),
}), 201);

exports.appointments = send(async (req) =>
  videoConsultationService.listNavigatorAppointments(req.user.id, {
    ...req.validatedQuery,
    language: req.headers["accept-language"]?.startsWith("te") ? "te" : "en",
  })
);

exports.carePlans = send(async (req) =>
  careLifecycleService.listNavigatorCarePlans(req.user.id, req.query)
);
exports.carePlan = send(async (req) => ({
  plan: await careLifecycleService.getCarePlanForNavigator(req.user.id, req.params.planId),
}));
exports.careHealthWorkers = send(async (req) => ({
  health_workers: await careLifecycleService.listAssignableHealthWorkers(
    req.user.id, req.params.planId
  ),
}));
exports.scheduleCareFollowup = send(async (req) => ({
  ...(await careLifecycleService.scheduleFollowup(req.user.id, req, req.params.planId, req.body)),
  message: "Follow-up assigned to Health Worker",
}), 201);
exports.markCareTreatmentCompleted = send(async (req) => ({
  plan: await careLifecycleService.markTreatmentCompleted(req.user.id, req, req.params.planId),
  message: "Final checkup requested from Medical Officer",
}));
exports.escalateCareDiscomfort = send(async (req) => ({
  plan: await careLifecycleService.escalateDiscomfort(
    req.user.id, req, req.params.planId, req.params.discomfortId
  ),
  message: "Discomfort escalated to Medical Officer",
}));
exports.updateCareCoordination = send(async (req) => ({
  plan: await careLifecycleService.updateNavigatorCoordination(
    req.user.id, req, req.params.planId, req.body
  ),
  message: "Coordination status updated",
}));
