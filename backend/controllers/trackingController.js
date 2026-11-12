const tracking = require("../services/patientTrackingService");

function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.dashboard = send(async (req) =>
  tracking.getTrackingDashboard(req.user.id, req.user.role_name)
);

exports.patients = send(async (req) =>
  tracking.listTrackedPatients(req.user.id, req.user.role_name, req.query)
);

exports.journey = send(async (req) =>
  tracking.getPatientJourney(req.user.id, req.user.role_name, req, req.params.patientId)
);
