const express = require("express");
const { z } = require("zod");
const controller = require("../controllers/videoConsultationController");
const {
  authenticate,
  allowRoles,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(
  authenticate,
  allowRoles("HEALTH_WORKER", "NAVIGATOR", "SPECIALIST", "HOSPITAL_STAFF")
);

const consultationParams = z.object({
  consultationId: z.string().uuid(),
});

router.post(
  "/:consultationId/provision",
  requireAnyPermission("video.join", "appointment.view", "appointment.confirm"),
  validate({ params: consultationParams }),
  controller.provision
);

router.post(
  "/:consultationId/join",
  requirePermission("video.join"),
  validate({ params: consultationParams }),
  controller.join
);

module.exports = router;