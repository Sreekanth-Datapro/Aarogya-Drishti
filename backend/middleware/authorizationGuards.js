const { hasRole, hasAllPermissions, hasAnyPermission } = require("../utils/authorizationPolicy");

function createAuthorizationGuards(audit) {
  async function denied(req, res, required) {
    await audit(req, {
      event: "ACCESS_DENIED",
      outcome: "DENIED",
      resourceType: "api",
      resourceId: `${req.method} ${req.baseUrl}${req.path}`,
      metadata: { required },
    });

    return res.status(403).json({
      success: false,
      message: "You are not authorized to access this resource",
      code: "FORBIDDEN",
    });
  }

  function requirePermission(...codes) {
    return async (req, res, next) => {
      if (!hasAllPermissions(req.user?.permissions, codes)) return denied(req, res, codes);
      next();
    };
  }

  function requireAnyPermission(...codes) {
    return async (req, res, next) => {
      if (!hasAnyPermission(req.user?.permissions, codes)) return denied(req, res, codes);
      next();
    };
  }

  function allowRoles(...roles) {
    return async (req, res, next) => {
      if (!hasRole(req.user, roles)) return denied(req, res, roles);
      next();
    };
  }

  return { requirePermission, requireAnyPermission, allowRoles };
}

module.exports = { createAuthorizationGuards };
