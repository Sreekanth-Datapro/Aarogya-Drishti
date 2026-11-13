-- 040_system_admin_role_manage.sql
-- Grant role.manage to SYSTEM_ADMIN for Role Management / screen page RBAC.
-- Does NOT re-grant district_admin.manage (Super-Admin only).
-- Idempotent. Do not run automatically from this change set — apply via approved migrate.

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SYSTEM_ADMIN'
   AND role_row.is_active IS TRUE
   AND permission_row.code = 'role.manage'
 ON CONFLICT (role_id, permission_id) DO NOTHING;
