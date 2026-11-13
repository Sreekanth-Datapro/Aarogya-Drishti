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

const presenceBody = z.object({
  event: z.enum(["JOINED", "LEFT"]),
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

router.post(
  "/:consultationId/presence",
  requirePermission("video.join"),
  validate({ params: consultationParams, body: presenceBody }),
  controller.presence
);

router.get(
  "/:consultationId/clinical-context",
  requireAnyPermission("video.join", "consultation.note", "diagnostic.view"),
  validate({ params: consultationParams }),
  controller.clinicalContext
);

module.exports = router;