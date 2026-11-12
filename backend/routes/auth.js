const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const {
  authenticate,
  authenticateAllowPasswordChange,
} = require("../middleware/authMiddleware");

const { rateLimit } = require("express-rate-limit");

const limiter = (limit, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT,
  message: { success: false, message },
});

const loginLimiter = limiter(10, "Too many login attempts. Please try again later.");
const registrationLimiter = limiter(20, "Too many registration attempts. Please try again later.");
const mfaLimiter = limiter(10, "Too many verification attempts. Please try again later.");
const resetLimiter = limiter(5, "Too many password reset requests. Please try again later.");
const refreshLimiter = limiter(120, "Too many session refresh requests.");
const setupLimiter = limiter(10, "Too many setup attempts. Please try again later.");

router.post("/register", registrationLimiter, authController.register);

router.post("/login", loginLimiter, authController.login);
// Same rate limit (and counter) as /login
router.post("/temporary-password/change", loginLimiter, authController.changeTemporaryPassword);

router.post("/mfa/setup", mfaLimiter, authController.mfaSetup);
router.post("/mfa/enable", mfaLimiter, authController.mfaEnable);
router.post("/mfa/verify", mfaLimiter, authController.mfaVerify);

router.post("/refresh", refreshLimiter, authController.refresh);

router.post("/password-reset/request", resetLimiter, authController.requestPasswordReset);
router.post("/password-reset/confirm", resetLimiter, authController.confirmPasswordReset);
router.post(
  "/account-setup",
  setupLimiter,
  require("../controllers/systemAdminController").completeDistrictAdminSetup
);

router.get("/me", authenticateAllowPasswordChange, authController.me);
router.post("/change-password", authenticateAllowPasswordChange, authController.changePassword);
router.post("/logout", authenticateAllowPasswordChange, authController.logout);

router.get("/sessions", authenticate, authController.sessions);
router.post("/logout-all", authenticate, authController.logoutAll);

module.exports = router;
