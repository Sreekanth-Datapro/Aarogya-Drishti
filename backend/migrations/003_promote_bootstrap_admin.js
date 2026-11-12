// 003_promote_bootstrap_admin.js
// Promotes the existing bootstrap account (SYSTEM_ADMIN_USERNAME) from SYSTEM_ADMIN to
// SUPER_ADMIN. The user row is updated in place: same id, password, MFA settings and
// audit history. Nothing is deleted or recreated. Skipped when the account does not
// exist or a SUPER_ADMIN already exists. Active sessions are revoked so the new role
// takes effect on the next login.
const { clearPermissionCache } = require("../utils/permissions");

exports.up = async (client, { bootstrapUsername, log = () => {} }) => {
  if (!bootstrapUsername) {
    log("  003: SYSTEM_ADMIN_USERNAME not configured, nothing to promote");
    return;
  }

  const account = await client.query(
    `SELECT u.id, r.code AS role_code
       FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
      WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL`,
    [bootstrapUsername]
  );

  if (!account.rows.length) {
    log(`  003: bootstrap account "${bootstrapUsername}" not found, nothing to promote`);
    return;
  }

  const { id, role_code: roleCode } = account.rows[0];

  if (roleCode === "SUPER_ADMIN") return;

  if (roleCode !== "SYSTEM_ADMIN") {
    throw new Error(
      `Bootstrap account "${bootstrapUsername}" has role ${roleCode}; refusing to change it automatically`
    );
  }

  const supers = await client.query(
    `SELECT count(*)::int AS n
       FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
      WHERE r.code = 'SUPER_ADMIN' AND u.deleted_at IS NULL`
  );

  if (supers.rows[0].n > 0) {
    log("  003: a SUPER_ADMIN already exists, bootstrap account left as SYSTEM_ADMIN");
    return;
  }

  await client.query(
    `UPDATE tbl_users
        SET role_id = (SELECT id FROM mst_roles WHERE code = 'SUPER_ADMIN')
      WHERE id = $1`,
    [id]
  );

  await client.query(
    `UPDATE tbl_user_sessions
        SET revoked_at = now(), revoke_reason = 'ROLE_CHANGED'
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [id]
  );

  await client.query(
    `INSERT INTO tbl_audit_logs (actor_id, actor_role, event, resource_type, resource_id, metadata)
     VALUES (NULL, 'MIGRATION', 'ROLE_CHANGED', 'user', $1,
             jsonb_build_object('from', 'SYSTEM_ADMIN', 'to', 'SUPER_ADMIN',
                                'migration', '003_promote_bootstrap_admin'))`,
    [id]
  );

  clearPermissionCache();

  log(`  003: "${bootstrapUsername}" promoted from SYSTEM_ADMIN to SUPER_ADMIN (same user id)`);
};
