-- 041_district_custom_accounts_page.sql
-- Seed page.districtCustomAccounts for District Admin menu/route access.
-- Idempotent. Do not run automatically from this change set — apply via approved migrate.

INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'page.districtCustomAccounts', 'page', 'access', 'Open district custom-role account provisioning'
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_permissions WHERE code = 'page.districtCustomAccounts'
 );

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'DISTRICT_ADMIN'
   AND role_row.is_active IS TRUE
   AND permission_row.code = 'page.districtCustomAccounts'
 ON CONFLICT (role_id, permission_id) DO NOTHING;
