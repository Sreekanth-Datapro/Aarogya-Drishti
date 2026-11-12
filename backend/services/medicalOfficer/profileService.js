const pool = require("../../db");
const HttpError = require("../../utils/httpError");
const { audit } = require("../../utils/audit");
const { withTransaction } = require("./scope");

// ==========================================
// MY PROFILE: the MO sees their own account and assignments.
// Only the phone number can be changed here; name, email, role, district and
// Mandals are managed by the District Admin. Passwords use /auth/change-password.
// Password hashes, MFA secrets and tokens are never selected.
// ==========================================

async function getProfile(userId) {
  const [user, mandals, facilities] = await Promise.all([
    pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.designation, u.status::text AS status,
              u.mfa_enabled, u.password_changed_at, u.created_at,
              r.code AS role_code, r.name_en AS role_name, r.name_te AS role_name_te,
              d.name_en AS district_name, d.name_te AS district_name_te
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
         LEFT JOIN mst_districts d ON d.id = u.district_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    ),
    pool.query(
      `SELECT m.id, m.name_en, m.name_te, moa.valid_from
         FROM tbl_medical_officer_mandal_assignments moa
         JOIN mst_mandals m ON m.id = moa.mandal_id
        WHERE moa.user_id = $1 AND moa.valid_from <= CURRENT_DATE
          AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
        ORDER BY m.name_en`,
      [userId]
    ),
    pool.query(
      `SELECT f.id, f.name_en, f.name_te, ufa.is_primary, ufa.valid_from
         FROM tbl_user_facility_assignments ufa
         JOIN mst_facilities f ON f.id = ufa.facility_id
        WHERE ufa.user_id = $1 AND ufa.valid_from <= CURRENT_DATE
          AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)
        ORDER BY ufa.is_primary DESC, f.name_en`,
      [userId]
    ),
  ]);
  if (!user.rows.length) throw new HttpError(404, "Account not found", "NOT_FOUND");
  return {
    ...user.rows[0],
    mfa_enabled: Boolean(user.rows[0].mfa_enabled),
    mandals: mandals.rows.map((row) => ({ ...row, id: Number(row.id) })),
    facilities: facilities.rows.map((row) => ({ ...row, id: Number(row.id) })),
  };
}

async function updatePhone(userId, req, input = {}) {
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!/^\d{10,11}$/.test(phone)) {
    throw new HttpError(400, "Enter a valid 10- or 11-digit phone number", "INVALID_PHONE");
  }
  await withTransaction(pool, async (client) => {
    await client.query("UPDATE tbl_users SET phone = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL", [phone, userId]);
    await audit(req, {
      client,
      required: true,
      event: "PROFILE_PHONE_UPDATED",
      resourceType: "user",
      resourceId: userId,
    });
  });
  return getProfile(userId);
}

module.exports = { getProfile, updatePhone };
