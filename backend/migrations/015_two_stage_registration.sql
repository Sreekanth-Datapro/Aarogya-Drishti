-- PROPOSAL ONLY. Requires reviewed approval before moving into migrations/.
-- Depends on the baseline schema and migrations 010, 011, and 013.
-- Does not modify finalized requests. Pending legacy requests promoted below
-- without a token remain untrackable through the applicant status endpoint.
-- app.actor_id is defense in depth, not independent database authentication.

BEGIN;

-- workflow_version comes from 010; the IF NOT EXISTS is safe only when the
-- preflight type check below confirms that the existing column is SMALLINT.
ALTER TABLE tbl_user_registration_requests
    ADD COLUMN IF NOT EXISTS workflow_version SMALLINT,
    ADD COLUMN IF NOT EXISTS mo_recommended_by UUID REFERENCES tbl_users(id),
    ADD COLUMN IF NOT EXISTS mo_recommended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mo_recommendation TEXT,
    ADD COLUMN IF NOT EXISTS mo_recommendation_note TEXT,
    ADD COLUMN IF NOT EXISTS status_token_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS status_token_expires_at TIMESTAMPTZ;

ALTER TABLE tbl_user_registration_requests
    ALTER COLUMN workflow_version SET DEFAULT 1;

DO $$
DECLARE
    workflow_type TEXT;
BEGIN
    SELECT data_type
      INTO workflow_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tbl_user_registration_requests'
       AND column_name = 'workflow_version';

    IF workflow_type IS DISTINCT FROM 'smallint' THEN
        RAISE EXCEPTION
            'Expected tbl_user_registration_requests.workflow_version to be SMALLINT; found %',
            COALESCE(workflow_type, 'missing');
    END IF;
END;
$$;

DO $$
DECLARE
    missing_columns TEXT;
BEGIN
    SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
      INTO missing_columns
      FROM (VALUES
          ('tbl_user_registration_requests', 'id'),
          ('tbl_user_registration_requests', 'status'),
          ('tbl_user_registration_requests', 'reviewed_by'),
          ('tbl_user_registration_requests', 'reviewed_at'),
          ('tbl_user_registration_requests', 'rejection_reason'),
          ('tbl_user_registration_requests', 'created_user_id'),
          ('tbl_user_registration_requests', 'created_at'),
          ('tbl_user_registration_requests', 'facility_id'),
          ('tbl_user_registration_requests', 'mandal_id'),
          ('tbl_user_registration_requests', 'village_id'),
          ('tbl_user_registration_requests', 'workflow_version'),
          ('tbl_users', 'id'),
          ('tbl_users', 'role_id'),
          ('tbl_users', 'status'),
          ('tbl_users', 'deleted_at'),
          ('tbl_users', 'username'),
          ('tbl_users', 'district_id'),
          ('mst_roles', 'id'),
          ('mst_roles', 'code'),
          ('mst_roles', 'is_active'),
          ('mst_districts', 'id'),
          ('mst_districts', 'is_active'),
          ('mst_facilities', 'id'),
          ('mst_facilities', 'district_id'),
          ('mst_facilities', 'mandal_id'),
          ('mst_facilities', 'is_active'),
          ('mst_mandals', 'id'),
          ('mst_mandals', 'district_id'),
          ('mst_mandals', 'is_active'),
          ('mst_villages', 'id'),
          ('mst_villages', 'mandal_id'),
          ('mst_villages', 'is_active'),
          ('tbl_user_facility_assignments', 'user_id'),
          ('tbl_user_facility_assignments', 'facility_id'),
          ('tbl_user_facility_assignments', 'is_primary'),
          ('tbl_user_facility_assignments', 'valid_to'),
          ('tbl_health_worker_location_assignments', 'user_id'),
          ('tbl_health_worker_location_assignments', 'district_id'),
          ('tbl_health_worker_location_assignments', 'mandal_id'),
          ('tbl_health_worker_location_assignments', 'village_id'),
          ('tbl_health_worker_location_assignments', 'facility_id'),
          ('tbl_health_worker_location_assignments', 'assigned_by'),
          ('tbl_health_worker_location_assignments', 'valid_to'),
          ('tbl_medical_officer_mandal_assignments', 'user_id'),
          ('tbl_medical_officer_mandal_assignments', 'mandal_id'),
          ('tbl_medical_officer_mandal_assignments', 'valid_from'),
          ('tbl_medical_officer_mandal_assignments', 'valid_to'),
          ('mst_permissions', 'id'),
          ('mst_permissions', 'code'),
          ('mst_permissions', 'resource'),
          ('mst_permissions', 'action'),
          ('mst_permissions', 'description'),
          ('tbl_role_permissions', 'role_id'),
          ('tbl_role_permissions', 'permission_id')
      ) AS required(table_name, column_name)
      LEFT JOIN information_schema.columns column_info
        ON column_info.table_schema = 'public'
       AND column_info.table_name = required.table_name
       AND column_info.column_name = required.column_name
     WHERE column_info.column_name IS NULL;

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION
            'Migration 015 prerequisites are missing columns: %',
            missing_columns;
    END IF;

    IF (
        SELECT COUNT(*)
          FROM pg_constraint
           WHERE conrelid = 'tbl_user_registration_requests'::regclass
           AND conname IN (
                 'ck_reg_approved',
                 'ck_reg_rejected',
                 'ck_reg_reviewed',
                 'ck_reg_rejection_reason_nonblank',
                 'ck_registration_workflow_version'
             )
    ) <> 5 THEN
        RAISE EXCEPTION
            'Migration 015 requires baseline registration constraints and migrations 010/011 constraints';
    END IF;
END;
$$;

DO $$
DECLARE
    reviewer_function REGPROCEDURE;
BEGIN
    reviewer_function := to_regprocedure('public.fn_validate_registration_reviewer()');

    IF reviewer_function IS NULL OR NOT EXISTS (
        SELECT 1
          FROM pg_trigger trigger_row
         WHERE trigger_row.tgrelid = 'tbl_user_registration_requests'::regclass
           AND trigger_row.tgname = 'trg_reg_reviewer_role'
           AND trigger_row.tgfoid = reviewer_function
           AND trigger_row.tgenabled = 'O'
           AND (trigger_row.tgtype & 1) = 1
           AND (trigger_row.tgtype & 2) = 2
           AND (trigger_row.tgtype & 4) = 4
           AND (trigger_row.tgtype & 16) = 16
           AND NOT trigger_row.tgisinternal
    ) THEN
        RAISE EXCEPTION
            'Expected enabled row-level BEFORE INSERT OR UPDATE trigger trg_reg_reviewer_role was not found';
    END IF;
END;
$$;

-- Never silently skip same-name objects: an existing object must be reviewed
-- and this proposal revised against its actual definition before proceeding.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'tbl_user_registration_requests'::regclass
           AND conname IN (
               'ck_reg_015_recommendation',
               'ck_reg_015_status_token_pair'
           )
    ) THEN
        RAISE EXCEPTION
            'A Migration 015 constraint name already exists; inspect its definition before applying';
    END IF;

    IF to_regclass('public.uq_reg_015_status_token_hash') IS NOT NULL
       OR to_regclass('public.idx_reg_015_pending_mandal') IS NOT NULL
       OR to_regclass('public.idx_reg_015_pending_final_decision') IS NOT NULL THEN
        RAISE EXCEPTION
            'A Migration 015 index name already exists; inspect its definition before applying';
    END IF;
END;
$$;

-- Legacy pending requests without a token cannot use applicant status lookup.
-- Do not derive or backfill tokens from applicant data. This workflow promotion
-- lets authorized staff review them but does not restore applicant tracking.
-- Resolve the policy for these applicants before approval; a secure recovery
-- flow requires independent identity checks and verified-channel delivery.
-- Recovery tokens are short-lived, single-use challenge tokens, stored as
-- hashes and atomically consumed; do not disclose applicant data before
-- verification.
UPDATE tbl_user_registration_requests
   SET workflow_version = 1
 WHERE status = 'PENDING'
   AND workflow_version IS NULL;

DO $$
BEGIN
    ALTER TABLE tbl_user_registration_requests
        ADD CONSTRAINT ck_reg_015_recommendation
        CHECK (
            (
                mo_recommended_by IS NULL
                AND mo_recommended_at IS NULL
                AND mo_recommendation IS NULL
                AND mo_recommendation_note IS NULL
            )
            OR
            (
                mo_recommended_by IS NOT NULL
                AND mo_recommended_at IS NOT NULL
                AND mo_recommendation IS NOT NULL
                AND mo_recommendation IN ('RECOMMENDED', 'NOT_RECOMMENDED')
                AND mo_recommendation_note IS NOT NULL
                AND length(regexp_replace(
                    mo_recommendation_note, '[[:space:]]', '', 'g'
                )) > 0
            )
        ) NOT VALID;

    ALTER TABLE tbl_user_registration_requests
        ADD CONSTRAINT ck_reg_015_status_token_pair
        CHECK (
            (
                status_token_hash IS NULL
                AND status_token_expires_at IS NULL
            )
            OR
            (
                status_token_hash IS NOT NULL
                AND status_token_hash ~ '^[0-9a-f]{64}$'
                AND status_token_expires_at IS NOT NULL
            )
        ) NOT VALID;
END;
$$;

CREATE UNIQUE INDEX uq_reg_015_status_token_hash
    ON tbl_user_registration_requests (status_token_hash)
    WHERE status_token_hash IS NOT NULL;

CREATE INDEX idx_reg_015_pending_mandal
    ON tbl_user_registration_requests (mandal_id, created_at)
    WHERE workflow_version = 1 AND status = 'PENDING';

CREATE INDEX idx_reg_015_pending_final_decision
    ON tbl_user_registration_requests (facility_id, mo_recommended_at)
    WHERE workflow_version = 1
      AND status = 'PENDING'
      AND mo_recommended_by IS NOT NULL;

INSERT INTO mst_permissions (code, resource, action, description)
VALUES
    ('registration.recommend', 'registration', 'recommend',
     'Recommend a Health Worker registration in an assigned Mandal'),
    ('registration.finalize', 'registration', 'finalize',
     'Make a final Health Worker registration decision within the assigned district')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
  FROM (VALUES
      ('MEDICAL_OFFICER', 'registration.recommend'),
      ('DISTRICT_ADMIN', 'registration.monitor'),
      ('DISTRICT_ADMIN', 'registration.finalize')
  ) AS required_grant(role_code, permission_code)
  JOIN mst_roles role
    ON role.code = required_grant.role_code
   AND role.is_active IS TRUE
  JOIN mst_permissions permission
    ON permission.code = required_grant.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

DELETE FROM tbl_role_permissions rp
 USING mst_permissions permission, mst_roles role
 WHERE rp.permission_id = permission.id
   AND rp.role_id = role.id
   AND permission.code = 'registration.recommend'
   AND role.code <> 'MEDICAL_OFFICER';

DELETE FROM tbl_role_permissions rp
 USING mst_permissions permission, mst_roles role
 WHERE rp.permission_id = permission.id
   AND rp.role_id = role.id
   AND permission.code = 'registration.finalize'
   AND role.code <> 'DISTRICT_ADMIN';

DELETE FROM tbl_role_permissions rp
 USING mst_permissions permission, mst_roles role
 WHERE rp.permission_id = permission.id
   AND rp.role_id = role.id
   AND permission.code = 'registration.verify'
   AND role.code = 'MEDICAL_OFFICER';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code = 'MEDICAL_OFFICER'
           AND role.is_active IS TRUE
           AND permission.code = 'registration.recommend'
    ) OR NOT EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code = 'DISTRICT_ADMIN'
           AND role.is_active IS TRUE
           AND permission.code = 'registration.monitor'
    ) OR NOT EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code = 'DISTRICT_ADMIN'
           AND role.is_active IS TRUE
           AND permission.code = 'registration.finalize'
    ) OR EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code = 'MEDICAL_OFFICER'
           AND permission.code = 'registration.verify'
    ) OR EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code <> 'MEDICAL_OFFICER'
           AND permission.code = 'registration.recommend'
    ) OR EXISTS (
        SELECT 1
          FROM tbl_role_permissions rp
          JOIN mst_roles role ON role.id = rp.role_id
          JOIN mst_permissions permission ON permission.id = rp.permission_id
         WHERE role.code <> 'DISTRICT_ADMIN'
           AND permission.code = 'registration.finalize'
    ) THEN
        RAISE EXCEPTION
            'Required registration permissions are missing or granted to an unauthorized role';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_validate_registration_reviewer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    actor_id UUID;
    v_district_id BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING'
           OR NEW.workflow_version IS DISTINCT FROM 1
           OR NEW.status_token_hash IS NULL
           OR NEW.status_token_hash !~ '^[0-9a-f]{64}$'
           OR NEW.status_token_expires_at IS NULL
           OR NEW.status_token_expires_at <= CURRENT_TIMESTAMP
           OR NEW.status_token_expires_at > CURRENT_TIMESTAMP + INTERVAL '30 days'
           OR NEW.reviewed_by IS NOT NULL
           OR NEW.reviewed_at IS NOT NULL
           OR NEW.created_user_id IS NOT NULL
           OR NEW.mo_recommended_by IS NOT NULL
           OR NEW.mo_recommended_at IS NOT NULL
           OR NEW.mo_recommendation IS NOT NULL
           OR NEW.mo_recommendation_note IS NOT NULL THEN
            RAISE EXCEPTION
                'Registration requests must begin pending and undecided with a valid status token'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status IN ('APPROVED', 'REJECTED') THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION
                'A finalized registration request is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.workflow_version IS DISTINCT FROM 1
       OR NEW.workflow_version IS DISTINCT FROM OLD.workflow_version
       OR NEW.facility_id IS DISTINCT FROM OLD.facility_id
       OR NEW.mandal_id IS DISTINCT FROM OLD.mandal_id
       OR NEW.village_id IS DISTINCT FROM OLD.village_id THEN
        RAISE EXCEPTION
            'Two-stage workflow and submitted locations are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Permit changes only to fields used by one of the explicit workflow
    -- transitions below; applicant-submitted fields and token data stay fixed.
    -- Token columns are deliberately not excluded from these row comparisons.
    IF (to_jsonb(NEW) - ARRAY[
            'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
            'created_user_id', 'mo_recommended_by', 'mo_recommended_at',
            'mo_recommendation', 'mo_recommendation_note'
        ]) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
            'created_user_id', 'mo_recommended_by', 'mo_recommended_at',
            'mo_recommendation', 'mo_recommendation_note'
        ]) THEN
        RAISE EXCEPTION
            'Submitted registration details and status token are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    -- This setting is caller-settable by a database session with sufficient
    -- privileges; this trigger does not authenticate callers. API
    -- authentication and private DB access are still required.
    actor_id := NULLIF(current_setting('app.actor_id', TRUE), '')::UUID;

    IF NEW.mo_recommended_by IS DISTINCT FROM OLD.mo_recommended_by
       OR NEW.mo_recommended_at IS DISTINCT FROM OLD.mo_recommended_at
       OR NEW.mo_recommendation IS DISTINCT FROM OLD.mo_recommendation
       OR NEW.mo_recommendation_note IS DISTINCT FROM OLD.mo_recommendation_note THEN
        IF OLD.status <> 'PENDING'
           OR NEW.status <> 'PENDING'
           OR OLD.mo_recommended_by IS NOT NULL
           OR NEW.mo_recommended_by IS DISTINCT FROM actor_id
           OR NEW.mo_recommended_at IS NULL
           OR NEW.mo_recommendation IS NULL
           OR NEW.mo_recommendation NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED')
           OR NEW.mo_recommendation_note IS NULL
           OR length(regexp_replace(
                NEW.mo_recommendation_note, '[[:space:]]', '', 'g'
              )) = 0
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
           OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
           OR NEW.created_user_id IS DISTINCT FROM OLD.created_user_id
           OR (to_jsonb(NEW) - ARRAY[
                  'mo_recommended_by', 'mo_recommended_at',
                  'mo_recommendation', 'mo_recommendation_note'
              ]) IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY[
                  'mo_recommended_by', 'mo_recommended_at',
                  'mo_recommendation', 'mo_recommendation_note'
              ]) THEN
            RAISE EXCEPTION
                'Only one separate recommendation may be recorded on a pending request'
                USING ERRCODE = 'check_violation';
        END IF;

        PERFORM 1
          FROM tbl_users u
          JOIN mst_roles role ON role.id = u.role_id
          JOIN tbl_medical_officer_mandal_assignments assignment
            ON assignment.user_id = u.id
          JOIN mst_mandals mandal ON mandal.id = assignment.mandal_id
         WHERE u.id = actor_id
           AND u.id = NEW.mo_recommended_by
           AND u.status = 'ACTIVE'
           AND u.deleted_at IS NULL
           AND role.code = 'MEDICAL_OFFICER'
           AND role.is_active IS TRUE
           AND assignment.mandal_id = NEW.mandal_id
           AND mandal.is_active IS TRUE
           AND assignment.valid_from <= CURRENT_DATE
           AND (assignment.valid_to IS NULL
                OR assignment.valid_to >= CURRENT_DATE)
         FOR SHARE OF u, role, assignment;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Recommending Medical Officer must be active and assigned to this Mandal'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status <> 'PENDING'
       OR NEW.status NOT IN ('APPROVED', 'REJECTED')
       OR NEW.mo_recommended_by IS NULL
       OR NEW.mo_recommended_at IS NULL
       OR NEW.mo_recommendation IS NULL
       OR NEW.mo_recommendation NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED')
       OR NEW.mo_recommendation_note IS NULL
       OR length(regexp_replace(
            NEW.mo_recommendation_note, '[[:space:]]', '', 'g'
          )) = 0
       OR NEW.reviewed_by IS DISTINCT FROM actor_id
       OR NEW.reviewed_at IS NULL
       OR NEW.mo_recommended_by IS DISTINCT FROM OLD.mo_recommended_by
       OR NEW.mo_recommended_at IS DISTINCT FROM OLD.mo_recommended_at
       OR NEW.mo_recommendation IS DISTINCT FROM OLD.mo_recommendation
       OR NEW.mo_recommendation_note IS DISTINCT FROM OLD.mo_recommendation_note
       OR (to_jsonb(NEW) - ARRAY[
              'status', 'reviewed_by', 'reviewed_at',
              'rejection_reason', 'created_user_id'
          ]) IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY[
              'status', 'reviewed_by', 'reviewed_at',
              'rejection_reason', 'created_user_id'
          ]) THEN
        RAISE EXCEPTION
            'Final decision requires a prior recommendation and immutable request details'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'REJECTED' THEN
        IF NEW.created_user_id IS NOT NULL
           OR NEW.rejection_reason IS NULL
           OR length(regexp_replace(
                NEW.rejection_reason, '[[:space:]]', '', 'g'
              )) = 0 THEN
            RAISE EXCEPTION
                'Final rejection requires a reason and cannot create an account'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.created_user_id IS NULL
       OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION
            'Final approval must reference the created Health Worker account and have no rejection reason'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT facility.district_id
      INTO v_district_id
      FROM mst_facilities facility
     WHERE facility.id = NEW.facility_id
       AND facility.is_active IS TRUE;

    IF v_district_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM mst_facilities facility
          JOIN mst_mandals mandal
            ON mandal.id = NEW.mandal_id
           AND mandal.district_id = facility.district_id
           AND mandal.is_active IS TRUE
          JOIN mst_villages village
            ON village.id = NEW.village_id
           AND village.mandal_id = mandal.id
           AND village.is_active IS TRUE
         WHERE facility.id = NEW.facility_id
           AND facility.mandal_id = mandal.id
           AND facility.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION
            'Registration location must be active and internally consistent'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM 1
      FROM tbl_users u
      JOIN mst_roles role ON role.id = u.role_id
      JOIN mst_districts district ON district.id = u.district_id
     WHERE u.id = actor_id
       AND u.id = NEW.reviewed_by
       AND u.status = 'ACTIVE'
       AND u.deleted_at IS NULL
       AND role.code = 'DISTRICT_ADMIN'
       AND role.is_active IS TRUE
       AND u.district_id = v_district_id
       AND district.is_active IS TRUE
     FOR SHARE OF u, role;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Final decision must be made by the active District Admin for this district'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status = 'APPROVED' AND NOT EXISTS (
        SELECT 1
          FROM tbl_users worker
          JOIN mst_roles worker_role ON worker_role.id = worker.role_id
          JOIN tbl_user_facility_assignments facility_assignment
            ON facility_assignment.user_id = worker.id
           AND facility_assignment.facility_id = NEW.facility_id
           AND facility_assignment.is_primary IS TRUE
           AND facility_assignment.valid_to IS NULL
          JOIN tbl_health_worker_location_assignments location_assignment
            ON location_assignment.user_id = worker.id
           AND location_assignment.district_id = v_district_id
           AND location_assignment.mandal_id = NEW.mandal_id
           AND location_assignment.village_id = NEW.village_id
           AND location_assignment.facility_id = NEW.facility_id
           AND location_assignment.assigned_by = actor_id
           AND location_assignment.valid_to IS NULL
         WHERE worker.id = NEW.created_user_id
           AND worker.username = NEW.username
           AND worker.district_id = v_district_id
           AND worker.status = 'ACTIVE'
           AND worker.deleted_at IS NULL
           AND worker_role.code = 'HEALTH_WORKER'
           AND worker_role.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION
            'Approved Health Worker must be active and have the submitted assignments'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
