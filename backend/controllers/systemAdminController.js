const HttpError = require("../utils/httpError");
const systemAdmin = require("../services/systemAdminService");

function handle(action) {
  return async (req, res, next) => {
    try {
      const result = await action(req);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}

exports.listRoles = handle(async (req) => ({ roles: await systemAdmin.listRoles(req.user) }));
exports.rbacDashboard = handle(async (req) => systemAdmin.getRbacDashboard(req.user));
exports.listPermissions = handle(async (req) => ({
  permissions: await systemAdmin.listAssignablePermissions(req.user),
}));
exports.createRole = handle(async (req) => ({
  role: await systemAdmin.createRole(req.user, req, req.body),
}));
exports.updateRole = handle(async (req) => ({
  role: await systemAdmin.updateRole(req.user, req, req.params.id, req.body),
}));
exports.updateRolePermissions = handle(async (req) => ({
  permission_ids: await systemAdmin.updateRolePermissions(
    req.user,
    req,
    req.params.id,
    req.body?.permission_ids
  ),
}));
exports.updateRoleStatus = handle(async (req) => ({
  role: await systemAdmin.updateRoleStatus(req.user, req, req.params.id, req.body?.is_active),
}));
exports.listRoleUsers = handle(async (req) => ({
  users: await systemAdmin.listRoleUsers(req.user, req.params.id),
}));
exports.listRbacUsers = handle(async (req) => ({
  ...await systemAdmin.listRbacUsers(req.user, req.validatedQuery),
}));
exports.updateUserRole = handle(async (req) => ({
  user: await systemAdmin.updateUserRole(req.user, req, req.params.id, req.body.role_id),
}));
exports.listDistrictAdmins = handle(async (req) => ({
  district_admins: await systemAdmin.listDistrictAdmins(req.user),
}));
exports.listDistricts = handle(async (req) => ({ districts: await systemAdmin.listDistricts(req.user) }));
exports.createDistrictAdmin = async (req, res, next) => {
  try {
    const result = await systemAdmin.createDistrictAdmin(req.user, req, req.body);
    return res.status(201).json({
      success: true,
      district_admin: result.user,
      delivery_status: result.delivery_status,
      message: "Account created and email delivery of the login details was attempted. The account remains pending until setup is completed.",
    });
  } catch (error) {
    next(error);
  }
};
exports.mapDistrictAdmin = handle(async (req) => ({
  mapping: await systemAdmin.mapDistrictAdmin(
    req.user,
    req,
    req.params.id,
    req.body?.district_id
  ),
}));
exports.reissueDistrictAdminSetup = handle(async (req) => ({
  ...(await systemAdmin.reissueDistrictAdminSetup(req.user, req, req.params.id)),
  message: "New login details were issued and email delivery was attempted. The previous temporary password no longer works.",
}));
exports.retryDistrictAdminSetupDelivery = handle(async (req) => ({
  ...(await systemAdmin.retryDistrictAdminSetupDelivery(
    req.user,
    req,
    req.params.id,
    req.params.channel
  )),
}));
exports.listStaff = handle(async (req) => ({
  staff: await systemAdmin.listStaff(req.user, req, req.query),
}));
exports.listStaffOptions = handle(async (req) => ({
  options: await systemAdmin.listStaffOptions(req.user, req),
}));
exports.listHealthWorkers = handle(async (req) => ({
  health_workers: await systemAdmin.listHealthWorkers(req.user, req),
}));
exports.getHealthWorkerAssignments = handle(async (req) => ({
  health_worker: await systemAdmin.getHealthWorkerAssignments(req.user, req, req.params.id),
}));
exports.updateHealthWorkerAssignments = handle(async (req) => ({
  health_worker: await systemAdmin.updateHealthWorkerAssignments(req.user, req, req.params.id, req.body),
}));
exports.createStaff = async (req, res, next) => {
  try {
    const result = await systemAdmin.createStaff(req.user, req, req.params.role, req.body);
    res.status(201).json({
      success: true,
      staff: result.user,
      delivery_status: result.delivery_status,
      message: "Account created and email delivery of the login details was attempted.",
    });
  } catch (error) {
    next(error);
  }
};
exports.getStaff = handle(async (req) => ({
  staff: await systemAdmin.getStaff(req.user, req, req.params.id),
}));
exports.updateStaff = handle(async (req) => ({
  staff: await systemAdmin.updateStaff(req.user, req, req.params.id, req.body),
}));
exports.setStaffStatus = handle(async (req) => ({
  staff: await systemAdmin.setStaffStatus(req.user, req, req.params.id, req.body?.status),
}));
exports.resendStaffCredentials = handle(async (req) => ({
  ...(await systemAdmin.resendStaffCredentials(req.user, req, req.params.id)),
  message: "New login details were issued. The previous temporary password no longer works.",
}));
exports.completeDistrictAdminSetup = async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!password) throw new HttpError(400, "Password is required", "INVALID_PASSWORD");
    const result = await systemAdmin.completeDistrictAdminSetup(token, password, req);
    res.json({
      success: true,
      message: "Password saved. Sign in to complete required MFA enrollment; your account remains pending until then.",
      account: result,
    });
  } catch (error) {
    next(error);
  }
};
