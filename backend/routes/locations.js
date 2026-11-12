const express = require("express");
const { z } = require("zod");
const router = express.Router();

const { authenticate, requirePermission } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const locationController = require("../controllers/locationController");

const level = z.enum(["district", "mandal", "village"], { message: "Level must be district, mandal or village" });
const id = z.coerce.number().int().positive();

const scopeQuery = z.object({
  level,
  state_code: id.optional(),
  parent_id: id.optional(),
});

const importBody = z.object({
  level,
  state_code: id.optional(),
  parent_id: id.optional(),
  lgd_codes: z.array(z.number().int().positive()).min(1, "Select at least one record").max(5000),
  confirm: z.literal(true, { message: "Please confirm the import" }),
});

const manualBody = z.object({
  level,
  parent_id: id.optional(),
  state_name: z.string().trim().min(2).max(80).optional(),
  name_en: z.string().trim().min(2, "Enter the English name").max(120),
  name_te: z.string().trim().max(120).optional(),
  lgd_code: z.number().int().positive().optional(),
});

const verifyParams = z.object({ level, id });
const verifyBody = z.object({ is_verified: z.boolean() });

// Every route: signed in + SUPER_ADMIN permission "master.import"
router.use(authenticate, requirePermission("master.import"));

router.get("/lgd/states", locationController.lgdStates);
router.get("/records", validate({ query: scopeQuery }), locationController.listRecords);
router.get("/preview", validate({ query: scopeQuery }), locationController.preview);
router.get("/imports", locationController.importHistory);
router.post("/import", validate({ body: importBody }), locationController.importSelected);
router.post("/manual", validate({ body: manualBody }), locationController.addManual);
router.patch("/records/:level/:id", validate({ params: verifyParams, body: verifyBody }), locationController.setVerified);

module.exports = router;
