const express = require("express");
const controller = require("../controllers/systemAdminController");
const {
  authenticate,
  allowRoles,
  requirePermission,
} = require("../middleware/authMiddleware");
const { SYSTEM_ADMIN_ROLES } = require("../utils/authorizationPolicy");
const { rateLimit } = require("express-rate-limit");
const validate = require("../middleware/validate");
const { z } = require("zod");

const router = express.Router();
const systemAdminOnly = [authenticate, allowRoles(...SYSTEM_ADMIN_ROLES)];
const superAdminOnly = [authenticate, allowRoles("SUPER_ADMIN")];
const rbacUserQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const userRoleBody = z.object({
  role_id: z.number().int().positive(),
});
const setupDeliveryRetryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT,
  message: { success: false, message: "Too many setup delivery retries. Please try again later." },
});

router.get("/roles", ...systemAdminOnly, requirePermission("role.manage"), controller.listRoles);
router.get("/rbac/dashboard", ...systemAdminOnly, requirePermission("role.manage"), controller.rbacDashboard);
router.get("/permissions", ...systemAdminOnly, requirePermission("role.manage"), controller.listPermissions);
router.get(
  "/users",
  ...systemAdminOnly,
  requirePermission("role.manage"),
  validate({ query: rbacUserQuery }),
  controller.listRbacUsers
);
router.patch(
  "/users/:id/role",
  ...systemAdminOnly,
  requirePermission("role.manage"),
  validate({ body: userRoleBody }),
  controller.updateUserRole
);
router.post("/roles", ...systemAdminOnly, requirePermission("role.manage"), controller.createRole);
router.patch("/roles/:id", ...systemAdminOnly, requirePermission("role.manage"), controller.updateRole);
router.put(
  "/roles/:id/permissions",
  ...systemAdminOnly,
  requirePermission("role.manage"),
  controller.updateRolePermissions
);
router.patch(
  "/roles/:id/status",
  ...systemAdminOnly,
  requirePermission("role.manage"),
  controller.updateRoleStatus
);
router.get(
  "/roles/:id/users",
  ...systemAdminOnly,
  requirePermission("role.manage"),
  controller.listRoleUsers
);

router.get(
  "/district-admins",
  ...superAdminOnly,
  requirePermission("district_admin.manage"),
  controller.listDistrictAdmins
);
router.get(
  "/districts",
  ...superAdminOnly,
  requirePermission("district_admin.manage"),
  controller.listDistricts
);
router.post(
  "/district-admins",
  ...superAdminOnly,
  requirePermission("district_admin.manage"),
  controller.createDistrictAdmin
);
router.patch(
  "/district-admins/:id/district",
  ...superAdminOnly,
  requirePermission("district_admin.manage"),
  controller.mapDistrictAdmin
);
router.post(
  "/district-admins/:id/setup-token",
  ...superAdminOnly,
  requirePermission("district_admin.manage"),
  controller.reissueDistrictAdminSetup
);
router.post(
  "/district-admins/:id/setup-delivery/:channel/retry",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  requirePermission("district_admin.manage"),
  setupDeliveryRetryLimiter,
  controller.retryDistrictAdminSetupDelivery
);

const staffAdminOnly = [authenticate, allowRoles("SYSTEM_ADMIN", "SUPER_ADMIN", "DISTRICT_ADMIN")];

router.get("/staff/options", ...staffAdminOnly, requirePermission("user.create_staff"), controller.listStaffOptions);
router.get("/staff", ...staffAdminOnly, requirePermission("user.create_staff"), controller.listStaff);
router.get("/health-workers", ...staffAdminOnly, requirePermission("user.create_staff"), controller.listHealthWorkers);
router.get(
  "/health-workers/:id/assignments",
  ...staffAdminOnly,
  requirePermission("user.create_staff"),
  controller.getHealthWorkerAssignments
);
router.put(
  "/health-workers/:id/assignments",
  ...staffAdminOnly,
  requirePermission("user.create_staff"),
  controller.updateHealthWorkerAssignments
);
router.post("/staff/:role", ...staffAdminOnly, requirePermission("user.create_staff"), controller.createStaff);
router.get("/staff/:id", ...staffAdminOnly, requirePermission("user.create_staff"), controller.getStaff);
router.patch("/staff/:id", ...staffAdminOnly, requirePermission("user.create_staff"), controller.updateStaff);
router.patch("/staff/:id/status", ...staffAdminOnly, requirePermission("user.create_staff"), controller.setStaffStatus);
router.post("/staff/:id/resend", ...staffAdminOnly, requirePermission("user.create_staff"), controller.resendStaffCredentials);

module.exports = router;
