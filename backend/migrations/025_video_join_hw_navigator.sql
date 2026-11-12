-- Grant video.join to Health Worker and Navigator so assigned participants
-- can request short-lived join tokens for confirmed video consultations.
-- Idempotent: safe to re-run.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'video.join') THEN
        RAISE EXCEPTION 'Migration 025 requires the video.join permission';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mst_roles WHERE code = 'HEALTH_WORKER') THEN
        RAISE EXCEPTION 'Migration 025 requires the HEALTH_WORKER role';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mst_roles WHERE code = 'NAVIGATOR') THEN
        RAISE EXCEPTION 'Migration 025 requires the NAVIGATOR role';
    END IF;
END;
$$;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN ('HEALTH_WORKER', 'NAVIGATOR')
   AND permission_row.code = 'video.join'
ON CONFLICT (role_id, permission_id) DO NOTHING;
