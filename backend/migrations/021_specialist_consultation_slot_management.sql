DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mst_roles WHERE code = 'SPECIALIST') THEN
        RAISE EXCEPTION 'Migration 021 requires the Specialist role';
    END IF;
END;
$$;

INSERT INTO mst_permissions (code, resource, action, description)
VALUES (
    'appointment.slot_manage',
    'appointment_slot',
    'manage',
    'Create, view, and cancel own Specialist consultation availability slots'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SPECIALIST'
   AND permission_row.code = 'appointment.slot_manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
