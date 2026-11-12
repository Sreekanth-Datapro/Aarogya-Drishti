const express = require("express");
const multer = require("multer");
const controller = require("../controllers/screeningController");
const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const HttpError = require("../utils/httpError");
const { MAX_PHOTO_BYTES } = require("../services/screeningService");

const router = express.Router();

// Photos are kept in memory only until they are checked and saved privately
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 8 },
});

// Turns multer's errors (e.g. a file over 10 MB) into a clear message
function singlePhoto(req, res, next) {
  upload.single("photo")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return next(new HttpError(400, "Each photo must be at most 10 MB", "IMAGE_TOO_LARGE"));
    return next(new HttpError(400, "Upload one photo at a time", "INVALID_IMAGE"));
  });
}

// Health Workers only; each action also needs its permission
router.use(authenticate, allowRoles("HEALTH_WORKER"));

router.get("/options", requirePermission("screening.create"), controller.options);
router.get("/patients", requirePermission("screening.create"), controller.patients);
router.get("/patients/:patientId/consents", requirePermission("consent.record"), controller.consents);
router.post("/patients/:patientId/consents", requirePermission("consent.record"), controller.recordConsent);
router.get("/", requirePermission("screening.create"), controller.mine);
router.post("/", requirePermission("screening.create"), controller.create);
// Category suitability check must be registered before /:id photo id routes.
router.post("/:id/photos/validate", requirePermission("image.upload"), singlePhoto, controller.validatePhoto);
router.post("/:id/photos/enhance-preview", requirePermission("image.upload"), singlePhoto, controller.enhancePhotoPreview);
router.post("/:id/photos", requirePermission("image.upload"), singlePhoto, controller.uploadPhoto);
router.get("/:id", requirePermission("screening.create"), controller.detail);
router.put("/:id/requested-information", requirePermission("screening.create"), controller.updateRequestedInformation);
router.post("/:id/analyze", requirePermission("ai.analyze"), controller.analyzeScreening);
router.delete("/:id/photos/:photoId", requirePermission("image.upload"), controller.removePhoto);
router.get("/:id/photos/:photoId/file", requirePermission("image.upload"), controller.photoFile);
router.post("/:id/photos/:photoId/enhance", requirePermission("image.upload"), controller.enhancePhoto);
router.get("/:id/photos/:photoId/enhanced/file", requirePermission("image.upload"), controller.enhancedPhotoFile);
router.post("/:id/submit", requirePermission("screening.create"), controller.submit);

module.exports = router;
