const specialistService = require("../services/specialistService");
const specialistAvailabilityRequestService = require("../services/specialistAvailabilityRequestService");
const careLifecycleService = require("../services/careLifecycleService");

function send(work) {
  return async (req, res, next) => {
    try {
      res.json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.dashboard = send(async (req) => ({
  dashboard: await specialistService.getDashboard(req.user.id),
}));

exports.availabilityHospitals = send(async (req) => ({
  hospitals: await specialistService.getAssignedHospitals(req.user.id),
}));

exports.availabilitySlots = send(async (req) => ({
  slots: await specialistService.listAvailabilitySlots(req.user.id),
}));

exports.availabilityRequests = send(async (req) => ({
  requests: await specialistAvailabilityRequestService.listSpecialistRequests(req.user.id),
}));

exports.appointments = send(async (req) =>
  specialistAvailabilityRequestService.listSpecialistAppointments(req.user.id)
);

exports.respondToAvailabilityRequest = send(async (req) => ({
  request: await specialistAvailabilityRequestService.respondToRequest(
    req.user.id, req, req.params.requestId, req.body
  ),
}));

exports.createAvailabilitySlot = send(async (req) => ({
  slot: await specialistService.createAvailabilitySlot(req.user.id, req, req.body),
}));

exports.cancelAvailabilitySlot = send(async (req) => ({
  slot: await specialistService.cancelAvailabilitySlot(req.user.id, req, req.params.slotId),
}));

exports.referrals = send(async (req) =>
  specialistService.listReferrals(req.user.id, req.validatedQuery)
);

exports.referral = send(async (req) => ({
  ...(await specialistService.getReferral(req.user.id, req, req.params.referralId)),
}));

exports.consultationSlots = send(async (req) => ({
  slots: await specialistService.getAvailableConsultationSlots(
    req.user.id, req.params.referralId
  ),
}));

exports.createConsultation = send(async (req) => ({
  consultation: await specialistService.createConsultation(
    req.user.id, req, req.params.referralId, req.body
  ),
}));

exports.saveDraft = send(async (req) => ({
  decision: await specialistService.saveAssessment(
    req.user.id, req, req.params.referralId, req.body, false
  ),
  message: "Clinical decision draft saved",
}));

exports.signAssessment = send(async (req) => ({
  decision: await specialistService.saveAssessment(
    req.user.id, req, req.params.referralId, req.body, true
  ),
  message: "Clinical decision submitted and signed",
}));

exports.sendToNavigator = send(async (req) => ({
  plan: await careLifecycleService.sendSpecialistReviewToNavigator(
    req.user.id, req, req.params.referralId, req.body
  ),
  message: "Specialist review sent to Navigator",
}));

exports.authorizeReturnToMo = send(async (req) => ({
  ...(await careLifecycleService.authorizeReturnToMo(
    req.user.id, req, req.params.patientId, req.body
  )),
}));

exports.careDashboard = send(async (req) => ({
  care: await careLifecycleService.getSpecialistCareDashboard(req.user.id),
}));

exports.carePlans = send(async (req) =>
  careLifecycleService.listSpecialistCarePlans(req.user.id, req.query)
);

exports.carePlan = send(async (req) => ({
  plan: await careLifecycleService.getCarePlanForSpecialist(req.user.id, req.params.planId),
}));

exports.reassessCarePlan = send(async (req) => ({
  plan: await careLifecycleService.reassessCarePlanForSpecialist(
    req.user.id, req, req.params.planId, req.body
  ),
  message: "Specialist care plan updated",
}));

exports.finalReview = send(async (req) => ({
  plan: await careLifecycleService.finalReviewForSpecialist(
    req.user.id, req, req.params.planId, req.body
  ),
  message: "Specialist reassessment recorded",
}));

exports.closeCarePlan = send(async (req) => ({
  plan: await careLifecycleService.closeCarePlanForSpecialist(
    req.user.id, req, req.params.planId
  ),
  message: "Specialist care case closed",
}));

async function stream(work, req, res, next) {
  try {
    const { filePath, data, mimeType } = await work();
    res.set({
      "Content-Type": mimeType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (data) return res.send(data);
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
}

exports.streamOriginalImage = (req, res, next) => stream(
  () => specialistService.getOriginalImageFile(
    req.user.id, req, req.params.referralId, req.params.photoId
  ),
  req,
  res,
  next
);

exports.streamEnhancedImage = (req, res, next) => stream(
  () => specialistService.getEnhancedImageFile(
    req.user.id, req, req.params.referralId, req.params.photoId
  ),
  req,
  res,
  next
);

exports.enhanceImage = send(async (req) => ({
  enhancement: await specialistService.enhanceAssignedPhoto(
    req.user.id, req, req.params.referralId, req.params.photoId
  ),
}));

exports.streamInvestigationReport = (req, res, next) => {
  const { referralId, reportId } = req.params;
  return stream(
    () => specialistService.getInvestigationReportFile(
      req.user.id, req, referralId, reportId
    ),
    req,
    res,
    next
  );
};
