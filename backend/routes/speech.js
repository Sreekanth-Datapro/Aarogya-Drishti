const express = require("express");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");
const controller = require("../controllers/speechController");

const router = express.Router();

// Voice receptionist is used on Health Worker registration / screening flows.
router.use(authenticate, allowRoles("HEALTH_WORKER"));

const speechLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT,
  message: {
    success: false,
    message: "Too many speech requests. Please try again later.",
    code: "SPEECH_RATE_LIMIT",
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    const type = String(file.mimetype || "");
    if (type.startsWith("audio/") || type === "application/octet-stream") {
      cb(null, true);
      return;
    }
    cb(new Error("Only audio uploads are allowed"));
  },
});

function multerErrorHandler(error, req, res, next) {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE"
        ? "Audio file is too large (max 3 MB)"
        : "Invalid audio upload",
      code: "AUDIO_UPLOAD_INVALID",
    });
  }
  if (String(error.message || "").includes("Only audio")) {
    return res.status(400).json({
      success: false,
      message: "Only audio uploads are allowed",
      code: "AUDIO_UPLOAD_INVALID",
    });
  }
  return next(error);
}

router.get("/status", speechLimiter, controller.status);
router.post("/synthesize", speechLimiter, controller.synthesize);
router.post(
  "/recognize",
  speechLimiter,
  (req, res, next) => {
    upload.single("audio")(req, res, (error) => multerErrorHandler(error, req, res, next));
  },
  controller.recognize
);

module.exports = router;
