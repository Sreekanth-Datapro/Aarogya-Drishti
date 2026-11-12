const hospitalStaffService = require("../services/hospitalStaffService");
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

exports.listAppointments = send(async (req) =>
  hospitalStaffService.listAppointments(req.user.id, req.validatedQuery)
);
exports.listVideoConsultations = send(async (req) =>
  hospitalStaffService.listVideoConsultations(req.user.id, req.validatedQuery)
);
exports.videoAvailabilityReferrals = send(async (req) =>
  specialistAvailabilityRequestService.getEligibleReferrals(req.user.id)
);
exports.listVideoAvailabilityRequests = send(async (req) =>
  specialistAvailabilityRequestService.listHospitalRequests(req.user.id)
);
exports.createVideoAvailabilityRequest = send(async (req) => ({
  request: await specialistAvailabilityRequestService.createHospitalRequest(
    req.user.id, req, req.body
  ),
}), 201);
exports.directConfirmVideoSlot = send(async (req) => ({
  appointment: await specialistAvailabilityRequestService.directConfirmHospitalSlot(
    req.user.id, req, req.body
  ),
}));
exports.forwardVideoAvailabilityRequest = send(async (req) => ({
  request: await specialistAvailabilityRequestService.forwardStaffReviewToSpecialist(
    req.user.id, req, req.params.requestId
  ),
}));
exports.confirmVideoAvailabilityRequest = send(async (req) => ({
  appointment: await specialistAvailabilityRequestService.confirmHospitalRequest(
    req.user.id, req, req.params.requestId
  ),
}));
exports.rescheduleVideoAvailabilityRequest = send(async (req) => ({
  request: await specialistAvailabilityRequestService.rescheduleHospitalRequest(
    req.user.id, req, req.params.requestId, req.body
  ),
}));
exports.declineVideoAvailabilityRequest = send(async (req) => ({
  request: await specialistAvailabilityRequestService.declineHospitalRequest(
    req.user.id, req, req.params.requestId, req.body
  ),
}));
exports.getAppointment = send(async (req) =>
  hospitalStaffService.getAppointment(req.user.id, req.params.appointmentId)
);
exports.confirmAppointment = send(async (req) => ({
  appointment: await hospitalStaffService.confirmAppointment(
    req.user.id, req, req.params.appointmentId
  ),
}));
exports.confirmVideoConsultation = send(async (req) => ({
  consultation: await hospitalStaffService.confirmVideoConsultation(
    req.user.id, req, req.params.consultationId
  ),
}));
exports.rescheduleAppointment = send(async (req) => ({
  appointment: await hospitalStaffService.rescheduleAppointment(
    req.user.id, req, req.params.appointmentId, req.body
  ),
}));
exports.rescheduleVideoConsultation = send(async (req) => ({
  consultation: await hospitalStaffService.rescheduleVideoConsultation(
    req.user.id, req, req.params.consultationId, req.body
  ),
}));
exports.cancelAppointment = send(async (req) => ({
  appointment: await hospitalStaffService.cancelAppointment(
    req.user.id, req, req.params.appointmentId, req.body
  ),
}));
exports.recordAttendance = send(async (req) => ({
  appointment: await hospitalStaffService.recordAttendance(
    req.user.id, req, req.params.appointmentId, req.body
  ),
}));
