DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM mst_roles
        WHERE id = 7
          AND code = 'SYSTEM_ADMIN'
          AND mfa_required = TRUE
    ) OR NOT EXISTS (
        SELECT 1
        FROM mst_roles
        WHERE id = 8
          AND code = 'SUPER_ADMIN'
          AND mfa_required = TRUE
    ) THEN
        RAISE EXCEPTION
            'Expected MFA-protected administrative roles 7 and 8 were not found';
    END IF;
END;
$$;

INSERT INTO mst_permissions (code, resource, action, description)
VALUES (
    'registration.monitor',
    'registration',
    'read',
    'Monitor Health Worker registration requests without approving or rejecting them'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT canonical.id, rp.permission_id
FROM mst_roles AS legacy
JOIN tbl_role_permissions AS rp
  ON rp.role_id = legacy.id
JOIN mst_permissions AS permission
  ON permission.id = rp.permission_id
JOIN mst_roles AS canonical
  ON canonical.id = 8
 AND canonical.code = 'SUPER_ADMIN'
WHERE legacy.id = 7
  AND legacy.code = 'SYSTEM_ADMIN'
  AND permission.code NOT IN ('registration.review', 'registration.verify')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mst_roles AS r
CROSS JOIN mst_permissions AS p
WHERE (r.code = 'SUPER_ADMIN' AND p.code = 'registration.monitor')
   OR (r.code = 'MEDICAL_OFFICER' AND p.code IN ('registration.monitor', 'registration.verify'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

DELETE FROM tbl_role_permissions AS rp
USING mst_permissions AS p
WHERE rp.permission_id = p.id
  AND p.code = 'registration.monitor'
  AND NOT EXISTS (
      SELECT 1
      FROM mst_roles AS r
      WHERE r.id = rp.role_id
        AND r.code IN ('SUPER_ADMIN', 'MEDICAL_OFFICER')
  );

DELETE FROM tbl_role_permissions AS rp
USING mst_permissions AS p, mst_roles AS r
WHERE rp.permission_id = p.id
  AND rp.role_id = r.id
  AND p.code = 'registration.verify'
  AND r.code <> 'MEDICAL_OFFICER';

DELETE FROM tbl_role_permissions AS rp
USING mst_permissions AS p
WHERE rp.permission_id = p.id
  AND p.code = 'registration.review';

INSERT INTO tbl_audit_logs
    (actor_id, actor_role, event, outcome, resource_type, resource_id, metadata)
SELECT
    NULL,
    'MIGRATION',
    'ROLE_CHANGED',
    'SUCCESS',
    'user',
    u.id::text,
    jsonb_build_object(
        'from', 'SYSTEM_ADMIN',
        'to', 'SUPER_ADMIN',
        'migration', '011_unify_admin_roles'
    )
FROM tbl_users AS u
WHERE u.role_id = 7
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_audit_logs AS a
      WHERE a.resource_type = 'user'
        AND a.resource_id = u.id::text
        AND a.event = 'ROLE_CHANGED'
        AND a.actor_role = 'MIGRATION'
        AND a.metadata->>'migration' = '011_unify_admin_roles'
  );

UPDATE tbl_user_sessions AS s
SET revoked_at = now(),
    revoke_reason = 'ROLE_CHANGED'
FROM tbl_users AS u
WHERE u.id = s.user_id
  AND u.role_id = 7
  AND s.revoked_at IS NULL;

UPDATE tbl_users
SET role_id = 8
WHERE role_id = 7;

UPDATE mst_roles
SET is_active = FALSE
WHERE id = 7
  AND code = 'SYSTEM_ADMIN';

CREATE OR REPLACE FUNCTION fn_validate_registration_reviewer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    reviewer_id UUID;
    assignment_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING' THEN
            RAISE EXCEPTION
                'Registration requests must be created with PENDING status'
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.status IN ('APPROVED', 'REJECTED') THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION
                'A finalized registration request cannot change status'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
           OR NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
            RAISE EXCEPTION
                'Reviewer, review time, and facility are immutable after a registration is finalized'
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        RAISE EXCEPTION
            'Registration facility cannot be changed after submission'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'PENDING' THEN
        IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
            RAISE EXCEPTION
                'Reviewer fields may only be set when a pending request is finalized'
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION
            'Registration requests may only transition from PENDING to APPROVED or REJECTED'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION
            'A finalized registration request must include a review timestamp'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT u.id
      INTO reviewer_id
      FROM tbl_users AS u
      JOIN mst_roles AS r ON r.id = u.role_id
     WHERE u.id = NEW.reviewed_by
       AND u.status = 'ACTIVE'
       AND u.deleted_at IS NULL
       AND r.code = 'MEDICAL_OFFICER'
       AND r.is_active IS TRUE
     FOR SHARE OF u, r;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Registration reviewer must be an active MEDICAL_OFFICER'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT ufa.id
      INTO assignment_id
      FROM tbl_user_facility_assignments AS ufa
     WHERE ufa.user_id = reviewer_id
       AND ufa.facility_id = NEW.facility_id
       AND ufa.valid_from <= CURRENT_DATE
       AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)
     FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Registration reviewer must have a current assignment to this facility'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

ALTER TABLE tbl_user_registration_requests
    ADD CONSTRAINT ck_reg_rejection_reason_nonblank
    CHECK (
        status <> 'REJECTED'
        OR coalesce(
            length(regexp_replace(rejection_reason, '[[:space:]]', '', 'g')) > 0,
            FALSE
        )
    ) NOT VALID;

DROP TRIGGER IF EXISTS trg_reg_reviewer_role
    ON tbl_user_registration_requests;

CREATE TRIGGER trg_reg_reviewer_role
BEFORE INSERT OR UPDATE ON tbl_user_registration_requests
FOR EACH ROW
EXECUTE FUNCTION fn_validate_registration_reviewer();

INSERT INTO tbl_audit_logs
    (actor_id, actor_role, event, outcome, resource_type, resource_id, metadata)
SELECT
    NULL,
    'MIGRATION',
    'ADMIN_ROLE_RETIRED',
    'SUCCESS',
    'role',
    id::text,
    jsonb_build_object(
        'from', 'SYSTEM_ADMIN',
        'to', 'SUPER_ADMIN',
        'migration', '011_unify_admin_roles'
    )
FROM mst_roles
WHERE id = 7
  AND code = 'SYSTEM_ADMIN'
  AND is_active = FALSE
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_audit_logs AS a
      WHERE a.resource_type = 'role'
        AND a.resource_id = '7'
        AND a.event = 'ADMIN_ROLE_RETIRED'
        AND a.actor_role = 'MIGRATION'
        AND a.metadata->>'migration' = '011_unify_admin_roles'
  );
