const express = require("express");
const { rateLimit } = require("express-rate-limit");
const controller = require("../controllers/registrationController");
const { authenticate, allowRoles, requirePermission, requireAnyPermission } = require("../middleware/authMiddleware");

// Medical Officers: registration.recommend (after migration 015) or the existing
// registration.verify grant (migration 011). Mandal scope is checked in the controller.
const medicalOfficerReview = [
  authenticate,
  allowRoles("MEDICAL_OFFICER"),
  requireAnyPermission("registration.recommend", "registration.verify"),
];

const router = express.Router();
const applicantStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT,
  message: { success: false, message: "Too many status lookups. Please try again later." },
});

router.post("/status", applicantStatusLimiter, controller.applicantStatus);
router.get("/medical-officer", ...medicalOfficerReview, controller.listForMedicalOfficer);
router.get("/medical-officer/history", ...medicalOfficerReview, controller.listMedicalOfficerHistory);
router.get("/medical-officer/requests/:id", ...medicalOfficerReview, controller.getForMedicalOfficer);
router.post("/:id/recommendation", ...medicalOfficerReview, controller.recommend);
router.get(
  "/district-admin",
  authenticate,
  allowRoles("DISTRICT_ADMIN"),
  requirePermission("registration.monitor"),
  controller.listForDistrictAdmin
);
router.get(
  "/district-admin/history",
  authenticate,
  allowRoles("DISTRICT_ADMIN"),
  requirePermission("registration.monitor"),
  controller.listDistrictAdminHistory
);
router.patch(
  "/:id/decision",
  authenticate,
  allowRoles("DISTRICT_ADMIN"),
  requirePermission("registration.finalize"),
  controller.decide
);

module.exports = router;
