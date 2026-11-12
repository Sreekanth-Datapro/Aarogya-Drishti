const jwt = require("jsonwebtoken");
const pool = require("../db");
const { verifyAccessToken } = require("../utils/jwt");
const { getRolePermissions, clearPermissionCache } = require("../utils/permissions");
const { getEffectivePermissions } = require("../utils/authorizationPolicy");
const { audit } = require("../utils/audit");
const { createAuthorizationGuards } = require("./authorizationGuards");

const { requirePermission, requireAnyPermission, allowRoles } = createAuthorizationGuards(audit);

function unauthorized(res, message, code) {
  return res.status(401).json({ success: false, message, code });
}

// Verifies the access token AND its server-side session, so logout, password
// change, suspension or role change take effect immediately.
async function loadAuthContext(req, res) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    unauthorized(res, "Authentication token required", "TOKEN_REQUIRED");
    return false;
  }

  let decoded;
  try {
    decoded = verifyAccessToken(header.slice(7));
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      unauthorized(res, "Access token expired", "TOKEN_EXPIRED");
    } else {
      unauthorized(res, "Invalid or expired authentication token", "TOKEN_INVALID");
    }
    return false;
  }

  if (!decoded.sid) {
    unauthorized(res, "Session expired. Please sign in again.", "SESSION_EXPIRED");
    return false;
  }

  const result = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role_id, u.district_id,
            u.status, u.must_change_password, u.mfa_enabled,
            r.code AS role_name, r.name_en AS role_display_name, r.mfa_required,
            s.id AS session_id, s.mfa_verified
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
       JOIN tbl_user_sessions s ON s.user_id = u.id
      WHERE u.id = $1
        AND s.id = $2
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.deleted_at IS NULL`,
    [decoded.sub, decoded.sid]
  );

  if (!result.rows.length) {
    unauthorized(res, "Session expired. Please sign in again.", "SESSION_EXPIRED");
    return false;
  }

  const user = result.rows[0];

  if (user.status !== "ACTIVE") {
    unauthorized(res, "Account is unavailable", "ACCOUNT_UNAVAILABLE");
    return false;
  }

  if ((user.mfa_required || user.mfa_enabled) && !user.mfa_verified) {
    unauthorized(res, "Multi-factor authentication required", "MFA_REQUIRED");
    return false;
  }

  clearPermissionCache();
  req.user = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role_id: user.role_id,
    district_id: user.district_id,
    role_name: user.role_name,
    role: user.role_name,
    role_display_name: user.role_display_name,
    status: user.status,
    must_change_password: user.must_change_password,
    mfa_enabled: user.mfa_enabled,
    session_id: user.session_id,
    permissions: getEffectivePermissions(
      user.role_name,
      await getRolePermissions(user.role_id)
    ),
  };

  return true;
}

// Standard guard: a pending forced password change blocks everything else.
async function authenticate(req, res, next) {
  if (!(await loadAuthContext(req, res))) return;

  if (req.user.must_change_password) {
    return res.status(403).json({
      success: false,
      message: "You must change your password before continuing",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }

  next();
}

// For /me, /logout and /change-password, which must work during a forced change.
async function authenticateAllowPasswordChange(req, res, next) {
  if (!(await loadAuthContext(req, res))) return;
  next();
}

module.exports = {
  authenticate,
  authenticateAllowPasswordChange,
  requirePermission,
  requireAnyPermission,
  allowRoles,
};
