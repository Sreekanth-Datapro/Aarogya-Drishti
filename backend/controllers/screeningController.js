const screeningService = require("../services/screeningService");
const aiAnalysisService = require("../services/aiAnalysisService");

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

exports.options = send(async () => ({ options: await screeningService.getOptions() }));
exports.patients = send(async (req) => ({ patients: await screeningService.listPatients(req.user.id) }));
exports.consents = send(async (req) => screeningService.getConsents(req.user.id, req.params.patientId));
exports.recordConsent = send(async (req) => ({
  consent: await screeningService.recordConsent(req.user.id, req, req.params.patientId, req.body),
}), 201);
exports.mine = send(async (req) => ({ screenings: await screeningService.listMyScreenings(req.user.id) }));
exports.create = send(async (req) => ({ screening: await screeningService.createScreening(req.user.id, req, req.body) }), 201);
exports.detail = send(async (req) => ({ screening: await screeningService.getScreening(req.user.id, req.params.id) }));
exports.updateRequestedInformation = send(async (req) => ({
  screening: await screeningService.updateRequestedInformation(req.user.id, req, req.params.id, req.body),
}));
exports.validatePhoto = send(async (req) => (
  screeningService.validatePhoto(req.user.id, req.params.id, req.body?.category, req.file)
));
exports.uploadPhoto = send(async (req) => ({
  photo: await screeningService.uploadPhoto(req.user.id, req, req.params.id, req.body?.view, req.file),
}), 201);
exports.analyzeScreening = send(async (req) => ({
  analysis: await aiAnalysisService.analyzeScreening(req.user.id, req, req.params.id),
}), 201);
exports.removePhoto = send(async (req) => screeningService.removePhoto(req.user.id, req, req.params.id, req.params.photoId));
exports.submit = send(async (req) => ({ screening: await screeningService.submitScreening(req.user.id, req, req.params.id) }));
exports.enhancePhoto = send(async (req) => ({
  enhanced: await screeningService.enhancePhoto(req.user.id, req, req.params.id, req.params.photoId),
}), 201);

exports.enhancePhotoPreview = async (req, res, next) => {
  try {
    const enhanced = await screeningService.enhancePhotoPreview(
      req.user.id,
      req,
      req.params.id,
      req.file
    );
    res.set({
      "Content-Type": enhanced.mimeType || "image/jpeg",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Enhanced-Width": String(enhanced.width),
      "X-Enhanced-Height": String(enhanced.height),
      "X-Enhanced-Model": enhanced.model || "",
    });
    return res.status(200).send(enhanced.data);
  } catch (error) {
    return next(error);
  }
};

// Streams one of the worker's own photos (no public URL, no caching)
function streamFile(find) {
  return async (req, res, next) => {
    try {
      const { filePath, data, mimeType } = await find(req.user.id, req.params.id, req.params.photoId);
      res.set({ "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      if (data) return res.send(data);
      res.sendFile(filePath, (error) => { if (error && !res.headersSent) next(error); });
    } catch (error) {
      next(error);
    }
  };
}

exports.photoFile = streamFile(screeningService.getPhotoFile);
exports.enhancedPhotoFile = streamFile(screeningService.getEnhancedPhotoFile);
