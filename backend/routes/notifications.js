const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

router.get("/", controller.list);
router.post(
  "/:notificationId/read",
  validate({ params: z.object({ notificationId: z.string().uuid() }) }),
  controller.markRead
);

module.exports = router;
