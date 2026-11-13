const videoConsultationService = require("../services/videoConsultationService");

function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.provision = send(async (req) => ({
  meeting: await videoConsultationService.provisionMeeting(
    req.user.id,
    req,
    req.params.consultationId
  ),
}));

exports.join = send(async (req) => ({
  join: await videoConsultationService.joinConsultation(
    req.user.id,
    req,
    req.params.consultationId
  ),
}));

exports.presence = send(async (req) => ({
  presence: await videoConsultationService.recordMeetingPresence(
    req.user.id,
    req,
    req.params.consultationId,
    req.body
  ),
}));

exports.clinicalContext = send(async (req) => ({
  clinical: await videoConsultationService.getClinicalContext(
    req.user.id,
    req.params.consultationId
  ),
}));
