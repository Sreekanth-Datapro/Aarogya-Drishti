const express = require("express");
const router = express.Router();

const { authenticate, requirePermission } = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");
const validate = require("../middleware/validate");
const { z } = require("zod");

const registrationListQuery = z.object({
  status: z.string()
    .trim()
    .transform((status) => status.toUpperCase())
    .pipe(z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"], {
      message: "Status must be ALL, PENDING, APPROVED or REJECTED",
    }))
    .optional(),
});

// Main aggregated summary for signed-in dashboard
router.get("/summary", authenticate, dashboardController.summary);

// Administrators may monitor; Medical Officers may review their assigned facilities.
router.get(
  "/registrations",
  authenticate,
  requirePermission("registration.monitor"),
  validate({ query: registrationListQuery }),
  dashboardController.listRegistrations
);

router.patch(
  "/registrations/:id/review",
  authenticate,
  dashboardController.reviewRegistration
);

module.exports = router;
