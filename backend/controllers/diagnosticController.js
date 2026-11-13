const diagnosticOrderService = require("../services/diagnosticOrderService");
const diagnosticScheduleService = require("../services/diagnosticScheduleService");
const diagnosticReportService = require("../services/diagnosticReportService");
const diagnosticWorkflowService = require("../services/diagnosticWorkflowService");

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

exports.uploadReport = send(async (req) => {
  try {
    const multi = req.files?.reports || [];
    const single = req.files?.report || (req.file ? [req.file] : []);
    const files = multi.length ? multi : single;
    if (!files.length) {
      const HttpError = require("../utils/httpError");
      throw new HttpError(400, "At least one report file is required", "FILE_REQUIRED");
    }
    if (files.length > 1 || multi.length) {
      const result = await diagnosticReportService.uploadReports(
        req.user.id,
        req.user.role_name,
        req,
        req.params.orderId,
        files
      );
      return {
        ...result,
        message: result.message || "Diagnostic reports uploaded",
      };
    }
    const result = await diagnosticReportService.uploadReport(
      req.user.id,
      req.user.role_name,
      req,
      req.params.orderId,
      files[0] || req.file
    );
    return {
      ...result,
      report: result.report || result.reports?.[0] || null,
      message: result.message || "Diagnostic report uploaded",
    };
  } catch (error) {
    console.error(
      `Diagnostic report upload failed [${req.requestId || "-"}]:`,
      error.message,
      error.code || "",
      error.detail || "",
      `files=${(req.files?.reports || req.files?.report || []).length || (req.file ? 1 : 0)}`
    );
    throw error;
  }
}, 201);

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
    res.setHeader("Content-Disposition", "inline");
    if (file.filePath) {
      return res.sendFile(file.filePath);
    }
    return res.send(file.data);
  } catch (error) {
    next(error);
  }
};

exports.updateReportCategory = send(async (req) =>
  diagnosticReportService.updateReportCategory(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.params.reportId,
    req.body
  )
);

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

exports.listEligibleHealthWorkers = send(async (req) =>
  diagnosticWorkflowService.listEligibleHealthWorkers(
    req.user.id,
    req.user.role_name,
    req.params.orderId
  )
);

exports.assignHealthWorker = send(async (req) => ({
  ...(await diagnosticWorkflowService.assignHealthWorker(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Health Worker assigned for diagnostic collection",
}));

exports.startCollection = send(async (req) => ({
  ...(await diagnosticWorkflowService.startCollection(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Diagnostic collection started",
}));

exports.verifyReports = send(async (req) => ({
  ...(await diagnosticWorkflowService.verifyReports(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: req.body?.action === "return"
    ? "Diagnostic submission returned for correction"
    : "Diagnostic reports verified",
}));

exports.forwardToHospitalStaff = send(async (req) => ({
  ...(await diagnosticWorkflowService.forwardToHospitalStaff(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Verified reports forwarded to Hospital Staff",
}));

exports.routeToSpecialist = send(async (req) => ({
  ...(await diagnosticWorkflowService.routeToSpecialist(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Report routed to authorized Specialist",
}));

exports.saveAdviceDraft = send(async (req) => ({
  ...(await diagnosticWorkflowService.saveAdviceDraft(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Specialist diagnostic advice draft saved",
}));

exports.signAdvice = send(async (req) => ({
  ...(await diagnosticWorkflowService.signAdvice(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Specialist diagnostic advice signed",
}));

exports.forwardAdviceToHealthWorker = send(async (req) => ({
  ...(await diagnosticWorkflowService.forwardAdviceToHealthWorker(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: "Signed advice forwarded to Health Worker",
}));

exports.recordPatientFollowup = send(async (req) => ({
  ...(await diagnosticWorkflowService.recordPatientFollowup(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: req.body?.save_as_draft === true || req.body?.save_as_draft === "true"
    || String(req.body?.action || "").toLowerCase() === "draft"
    ? "Patient follow-up draft saved"
    : "Patient follow-up submitted",
}));

exports.verifyFollowupReport = send(async (req) => ({
  ...(await diagnosticWorkflowService.verifyFollowupReport(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  )),
  message: req.body?.action === "return"
    ? "Follow-up report returned to Health Worker"
    : "Follow-up report forwarded to Specialist",
}));

exports.reassessAfterFollowup = send(async (req) => {
  const result = await diagnosticWorkflowService.reassessAfterFollowup(
    req.user.id,
    req.user.role_name,
    req,
    req.params.orderId,
    req.body
  );
  let message = "Specialist reassessment recorded";
  if (result.created_order_id) {
    message = `Additional diagnostic order ${result.created_order_code || result.created_order_id} created`;
  } else if (result.video_decision_id) {
    message = result.booking_path === "PUBLISHED_SLOT"
      ? "Video consultation request created from published slot (awaiting Hospital Staff confirmation)"
      : "Video availability request created (awaiting Specialist response and Hospital Staff confirmation)";
  } else if (result.closed) {
    message = "Diagnostic follow-up case closed";
  }
  return { ...result, message };
});
