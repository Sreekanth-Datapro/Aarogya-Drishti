-- 002_security_core.sql | Phase 1: SUPER_ADMIN role, new permissions, session rotation,
-- password reset tokens, MFA replay protection. Additive only: no data is removed.

-- 1. SUPER_ADMIN role: platform owner, no clinical record access (like SYSTEM_ADMIN)
INSERT INTO mst_roles (code, name_en, name_te, description, mfa_required) VALUES
 ('SUPER_ADMIN', 'Super administrator', 'సూపర్ నిర్వాహకుడు',
  'Manages system administrators, master data and platform settings; no clinical record access', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. New permission codes
INSERT INTO mst_permissions (code, resource, action, description) VALUES
 ('master.view',         'master',       'read',   'View master data (geography and facilities)'),
 ('master.manage',       'master',       'manage', 'Create, update and deactivate master data'),
 ('user.create_staff',   'user',         'create', 'Create Medical Officer, Specialist, Navigator, Hospital Staff and District Admin accounts'),
 ('user.create_admin',   'user',         'create', 'Create System Administrator accounts'),
 ('registration.verify', 'registration', 'verify', 'Verify health worker registrations for own facility'),
 ('settings.manage',     'settings',     'manage', 'Manage platform settings')
ON CONFLICT (code) DO NOTHING;

-- 3. Role permissions (existing grants are kept; only additions)
--    MEDICAL_OFFICER gains patient.register + consent.record to match the existing
--    trg_patient_registrar_role rule (HEALTH_WORKER, MEDICAL_OFFICER may register patients).
INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
   ('SUPER_ADMIN', 'user.manage'), ('SUPER_ADMIN', 'user.create_admin'), ('SUPER_ADMIN', 'user.create_staff'),
   ('SUPER_ADMIN', 'registration.review'), ('SUPER_ADMIN', 'audit.view'), ('SUPER_ADMIN', 'master.view'),
   ('SUPER_ADMIN', 'master.manage'), ('SUPER_ADMIN', 'settings.manage'),
   ('SYSTEM_ADMIN', 'user.create_staff'), ('SYSTEM_ADMIN', 'master.view'), ('SYSTEM_ADMIN', 'master.manage'),
   ('DISTRICT_ADMIN', 'master.view'),
   ('MEDICAL_OFFICER', 'registration.verify'), ('MEDICAL_OFFICER', 'patient.register'),
   ('MEDICAL_OFFICER', 'consent.record')
  ) AS m(role_code, perm_code)
  JOIN mst_roles r ON r.code = m.role_code
  JOIN mst_permissions p ON p.code = m.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Final registration approval: SUPER_ADMIN may act like SYSTEM_ADMIN
DROP TRIGGER IF EXISTS trg_reg_reviewer_role ON tbl_user_registration_requests;
CREATE TRIGGER trg_reg_reviewer_role
BEFORE INSERT OR UPDATE ON tbl_user_registration_requests
FOR EACH ROW
EXECUTE FUNCTION fn_require_role('reviewed_by', 'SYSTEM_ADMIN,SUPER_ADMIN');

-- 5. Patient-level access: SUPER_ADMIN never sees identifiable patient records
CREATE OR REPLACE FUNCTION fn_user_has_patient_access(p_user UUID, p_patient UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
     WHERE u.id = p_user AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
       AND r.code NOT IN ('DISTRICT_ADMIN','SYSTEM_ADMIN','SUPER_ADMIN')
       AND (
            EXISTS (SELECT 1 FROM tbl_case_assignments ca
                     WHERE ca.patient_id = p_patient AND ca.user_id = p_user
                       AND ca.valid_from <= now() AND (ca.valid_to IS NULL OR ca.valid_to > now()))
         OR (r.code = 'HEALTH_WORKER' AND EXISTS (
                SELECT 1 FROM tbl_patients p WHERE p.id = p_patient AND p.registered_by = p_user))
         OR (r.code = 'MEDICAL_OFFICER' AND EXISTS (
                SELECT 1 FROM tbl_patients p
                  JOIN tbl_user_facility_assignments ufa ON ufa.facility_id = p.registered_facility_id
                 WHERE p.id = p_patient AND ufa.user_id = p_user
                   AND ufa.valid_from <= CURRENT_DATE AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)))
       )
  );
$$;

-- 6. Refresh-token rotation with reuse detection
ALTER TABLE tbl_user_sessions
    ADD COLUMN IF NOT EXISTS previous_refresh_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_previous_hash
    ON tbl_user_sessions (previous_refresh_token_hash) WHERE previous_refresh_token_hash IS NOT NULL;

-- 7. MFA: replay protection and enrolment time
ALTER TABLE tbl_users
    ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT,
    ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

-- 8. Password reset: only SHA-256 hashes of single-use tokens, at most 15 minutes valid
CREATE TABLE IF NOT EXISTS tbl_password_reset_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES tbl_users(id),
    token_hash   CHAR(64) NOT NULL UNIQUE,
    requested_ip INET,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    CONSTRAINT ck_reset_token_lifetime
        CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_open
    ON tbl_password_reset_tokens (user_id) WHERE used_at IS NULL;
