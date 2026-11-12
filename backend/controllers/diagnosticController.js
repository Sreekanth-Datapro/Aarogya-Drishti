const diagnosticOrderService = require("../services/diagnosticOrderService");
const diagnosticScheduleService = require("../services/diagnosticScheduleService");
const diagnosticReportService = require("../services/diagnosticReportService");

function send(work, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json({ success: true, ...(await work(req)) });
    } catch (error) {
      next(error);
    }
  };
}

exports.listCategories = send(async () => diagnosticOrderService.listCategories());

exports.listTests = send(async (req) => diagnosticOrderService.listTests(req.query));

exports.listAllTests = send(async () => diagnosticOrderService.listAllTestsForAdmin());

exports.createTest = send(async (req) => ({
  test: await diagnosticOrderService.createOrUpdateTest(req.user.id, req, req.body),
  message: "Diagnostic test created",
}), 201);

exports.updateTest = send(async (req) => ({
  test: await diagnosticOrderService.createOrUpdateTest(req.user.id, req, req.body, req.params.testId),
  message: "Diagnostic test updated",
}));

exports.listFacilities = send(async (req) =>
  diagnosticOrderService.listFacilities(req.user.id, req.user.role_name)
);

exports.listEligiblePatients = send(async (req) =>
  diagnosticOrderService.listEligiblePatients(req.user.id, req.user.role_name, req.query)
);

exports.createOrder = async (req, res, next) => {
  try {
    const result = await diagnosticOrderService.createOrder(req.user.id, req, req.body);
    const status = result.idempotent_replay ? 200 : 201;
    res.status(status).json({
      success: true,
      ...result,
      message: result.idempotent_replay
        ? "Diagnostic order already submitted"
        : "Diagnostic order prescribed",
    });
  } catch (error) {
    next(error);
  }
};

exports.listOrders = send(async (req) =>
  diagnosticOrderService.listOrders(req.user.id, req.user.role_name, req.query)
);

exports.getOrder = send(async (req) =>
  diagnosticOrderService.getOrderForUser(req.user.id, req.user.role_name, req.params.orderId)
);

exports.listScheduleFacilities = send(async (req) =>
  diagnosticScheduleService.listFacilitiesForNavigator(req.user.id)
);

exports.listAppointments = send(async (req) =>
  diagnosticScheduleService.listAppointments(req.user.id, req.user.role_name, req.query)
);

exports.getAppointment = send(async (req) =>
  diagnosticScheduleService.getAppointmentForUser(req.user.id, req.user.role_name, req.params.appointmentId)
);

exports.createScheduleRequest = async (req, res, next) => {
  try {
    const result = await diagnosticScheduleService.createScheduleRequest(
      req.user.id,
      req,
      req.params.orderId,
      req.body
    );
    const status = result.idempotent_replay ? 200 : 201;
    res.status(status).json({
      success: true,
      ...result,
      message: result.idempotent_replay
        ? "Scheduling request already submitted"
        : "Diagnostic scheduling request submitted",
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmAppointment = send(async (req) => ({
  ...(await diagnosticScheduleService.confirmAppointment(
    req.user.id,
    req,
    req.params.appointmentId,
    req.body
  )),
  message: "Diagnostic appointment confirmed",
}));

exports.suggestAlternative = send(async (req) => ({
  ...(await diagnosticScheduleService.suggestAlternative(
    req.user.id,
    req,
    req.params.appointmentId,
    req.body
  )),
  message: "Alternative time suggested",
}));

exports.rescheduleAppointment = send(async (req) => ({
  ...(await diagnosticScheduleService.rescheduleAppointment(
    req.user.id,
    req,
    req.params.appointmentId,
    req.body
  )),
  message: "Diagnostic appointment rescheduled",
}));

exports.cancelAppointment = send(async (req) => ({
  ...(await diagnosticScheduleService.cancelAppointment(
    req.user.id,
    req,
    req.params.appointmentId,
    req.body
  )),
  message: "Diagnostic appointment cancelled",
}));

exports.updateFollowup = send(async (req) => ({
  ...(await diagnosticScheduleService.updateHealthWorkerFollowup(
    req.user.id,
    req,
    req.params.appointmentId,
    req.body
  )),
  message: "Diagnostic follow-up saved",
}));

exports.listReports = send(async (req) =>
  diagnosticReportService.listReports(req.user.id, req.user.role_name, req.params.orderId)
);

exports.uploadReport = send(async (req) => ({
  ...(await diagnosticReportService.uploadReport(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.file
  )),
  message: "Diagnostic report uploaded",
}), 201);

exports.getReportFile = async (req, res, next) => {
  try {
    const file = await diagnosticReportService.getReportFile(
      req.user.id,
      req.user.role_name,
      req,
      req.params.orderId,
      req.params.reportId
    );
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (file.filePath) {
      return res.sendFile(file.filePath);
    }
    return res.send(file.data);
  } catch (error) {
    next(error);
  }
};

exports.reviewReport = send(async (req) => ({
  ...(await diagnosticReportService.reviewReport(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.params.reportId,
    req.body
  )),
  message: "Diagnostic report reviewed",
}));
