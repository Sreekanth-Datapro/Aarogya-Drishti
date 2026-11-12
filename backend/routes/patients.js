const express = require("express");
const controller = require("../controllers/patientController");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
const healthWorkerOnly = [authenticate, allowRoles("HEALTH_WORKER")];

router.get("/registration-options", ...healthWorkerOnly, controller.registrationOptions);
router.get("/mine", ...healthWorkerOnly, controller.listMine);
router.get("/summary", ...healthWorkerOnly, controller.summary);
router.get("/search", ...healthWorkerOnly, controller.search);
router.post("/duplicate-check", ...healthWorkerOnly, controller.checkDuplicates);
router.post("/", ...healthWorkerOnly, controller.register);
router.get("/:patientId", ...healthWorkerOnly, controller.details);

module.exports = router;
