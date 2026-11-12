const videoConsultationService = require("../services/videoConsultationService");
const careLifecycleService = require("../services/careLifecycleService");

function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.appointments = send(async (req) =>
  videoConsultationService.listHealthWorkerAppointments(req.user.id, {
    ...req.validatedQuery,
    language: req.headers["accept-language"]?.startsWith("te") ? "te" : "en",
  })
);

exports.careFollowups = send(async (req) =>
  careLifecycleService.listHwFollowups(req.user.id, req.query)
);
exports.careFollowup = send(async (req) =>
  careLifecycleService.getHwFollowupDetail(req.user.id, req.params.scheduleId)
);
exports.submitCareFollowupReport = send(async (req) => ({
  ...(await careLifecycleService.submitFollowupReport(
    req.user.id, req, req.params.scheduleId, req.body
  )),
  message: "Follow-up report submitted",
}), 201);
exports.reportCareDiscomfort = send(async (req) => ({
  ...(await careLifecycleService.reportDiscomfort(
    req.user.id, req, req.params.planId, req.body
  )),
  message: "Discomfort report submitted",
}), 201);
