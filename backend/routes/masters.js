const express = require("express");
const { z } = require("zod");
const router = express.Router();

const { authenticate, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const mastersController = require("../controllers/mastersController");

const id = z.coerce.number().int().positive();

// Public: options for the health worker registration form
router.get("/registration-options", mastersController.registrationOptions);

// Signed-in admins: dependent location dropdowns (District -> Mandal -> Village)
const canView = [authenticate, requirePermission("master.view")];
router.get("/districts", canView, mastersController.districts);
router.get("/mandals", canView, validate({ query: z.object({ district_id: id }) }), mastersController.mandals);
router.get("/villages", canView, validate({ query: z.object({ mandal_id: id }) }), mastersController.villages);

module.exports = router;
