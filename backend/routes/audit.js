const express = require("express");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");
const auditController = require("../controllers/auditController");

const router = express.Router();

router.get("/logs", authenticate, allowRoles("SUPER_ADMIN"), auditController.list);
router.get("/logs/:id", authenticate, allowRoles("SUPER_ADMIN"), auditController.detail);

module.exports = router;
