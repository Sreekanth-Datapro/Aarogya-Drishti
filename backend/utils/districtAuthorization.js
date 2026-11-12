const pool = require("../db");
const HttpError = require("./httpError");

function isDistrictAdmin(req) {
  const role = req?.user?.role_name || req?.user?.role;
  return role === "DISTRICT_ADMIN";
}

async function resolveAuthorizedDistrict(req, db = pool) {
  if (!isDistrictAdmin(req)) {
    return null;
  }

  const userId = req?.user?.id;
  if (!userId) {
    throw new HttpError(403, "District Admin account is not assigned to a valid district", "DISTRICT_NOT_ASSIGNED");
  }

  const { rows } = await db.query(
    `SELECT d.id AS district_id
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
       JOIN mst_districts d ON d.id = u.district_id
      WHERE u.id = $1
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        AND r.code = 'DISTRICT_ADMIN'
        AND r.is_active IS TRUE
        AND d.is_active IS TRUE
      LIMIT 1`,
    [userId]
  );

  if (!rows.length || rows[0].district_id == null) {
    throw new HttpError(403, "District Admin account is not assigned to a valid district", "DISTRICT_NOT_ASSIGNED");
  }

  return Number(rows[0].district_id);
}

// Route guard for /api/district: only District Admins, and the district always
// comes from their own user record (never from the request).
async function requireDistrictAdminScope(req, res, next) {
  try {
    if (!isDistrictAdmin(req)) {
      throw new HttpError(403, "You are not authorized to access this resource", "FORBIDDEN");
    }
    req.districtId = await resolveAuthorizedDistrict(req);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { isDistrictAdmin, resolveAuthorizedDistrict, requireDistrictAdminScope };
