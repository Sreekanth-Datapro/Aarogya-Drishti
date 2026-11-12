const express = require("express");
const router = express.Router();

const { authenticate, allowRoles, requirePermission } = require("../middleware/authMiddleware");
const { requireDistrictAdminScope } = require("../utils/districtAuthorization");
const districtController = require("../controllers/districtController");
const auditController = require("../controllers/auditController");

// District Admin only. Every handler is read only and limited to the
// district stored on the signed-in user's record.
router.use(
  authenticate,
  allowRoles("DISTRICT_ADMIN"),
  requirePermission("dashboard.view_aggregate"),
  requireDistrictAdminScope
);

router.get("/dashboard", districtController.dashboard);
router.get("/programme", districtController.programme);
router.get("/patients", districtController.patients);
router.get("/health-workers", districtController.healthWorkers);
router.get("/mandals", requirePermission("master.view"), districtController.mandals);
router.get("/villages", requirePermission("master.view"), districtController.villages);
router.get("/audit/logs", auditController.listDistrict);
router.get("/audit/logs/:id", auditController.detailDistrict);

module.exports = router;
