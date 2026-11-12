-- Grants Specialists the existing appointment.book permission so they can
-- create a video consultation only from their own available slot.
-- No tables, columns, or other role permissions are changed.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mst_roles WHERE code = 'SPECIALIST')
       OR NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'appointment.book') THEN
        RAISE EXCEPTION 'Migration 020 requires the Specialist role and appointment.book permission';
    END IF;
END;
$$;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SPECIALIST'
   AND permission_row.code = 'appointment.book'
ON CONFLICT (role_id, permission_id) DO NOTHING;
