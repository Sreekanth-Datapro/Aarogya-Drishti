const express = require("express");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");
const reportsController = require("../controllers/reportsController");

const router = express.Router();

router.get("/analytics", authenticate, allowRoles("SUPER_ADMIN"), reportsController.analytics);

module.exports = router;
