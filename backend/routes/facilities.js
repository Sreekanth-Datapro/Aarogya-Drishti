const express = require("express");
const router = express.Router();

const { authenticate, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const facilityController = require("../controllers/facilityController");
const { facilityBody, listQuery, idParams, statusBody } = require("../utils/facilityValidation");

const canView = requirePermission("master.view");
const canManage = requirePermission("master.manage");

router.use(authenticate);

router.get("/summary", canView, facilityController.summary);
router.get("/", canView, validate({ query: listQuery }), facilityController.list);
router.get("/:id", canView, validate({ params: idParams }), facilityController.getOne);
router.post("/", canManage, validate({ body: facilityBody }), facilityController.create);
router.put("/:id", canManage, validate({ params: idParams, body: facilityBody }), facilityController.update);
router.patch(
  "/:id/status",
  canManage,
  validate({ params: idParams, body: statusBody }),
  facilityController.setStatus
);

module.exports = router;
