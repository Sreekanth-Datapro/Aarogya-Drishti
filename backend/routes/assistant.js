const express = require("express");
const { rateLimit } = require("express-rate-limit");
const multer = require("multer");
const { authenticate } = require("../middleware/authMiddleware");
const controller = require("../controllers/assistantController");

const router = express.Router();
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (!IMAGE_MIMES.has(file.mimetype)) {
      callback(new Error("CHAT_IMAGE_TYPE_UNSUPPORTED"));
      return;
    }
    callback(null, true);
  },
});

function handleImageUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Images must be 10 MB or smaller.",
        code: "CHAT_IMAGE_TOO_LARGE",
      });
    }
    if (error.message === "CHAT_IMAGE_TYPE_UNSUPPORTED") {
      return res.status(400).json({
        success: false,
        message: "Use a JPEG, PNG, or WEBP image.",
        code: error.message,
      });
    }
    return next(error);
  });
}

router.use(authenticate);
router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many assistant requests. Please try again later.",
    code: "ASSISTANT_RATE_LIMIT",
  },
}));
router.post("/chat", handleImageUpload, controller.chat);

module.exports = router;
