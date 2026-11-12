-- NULL keeps pre-existing roles unclassified until a reviewed inventory is available.
ALTER TABLE mst_roles
    ADD COLUMN IF NOT EXISTS is_system_role BOOLEAN;

ALTER TABLE tbl_users
    ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES mst_districts(id);

CREATE INDEX IF NOT EXISTS idx_users_district
    ON tbl_users (district_id) WHERE district_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tbl_district_admin_setup_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES tbl_users(id),
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES tbl_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT ck_district_admin_setup_token_lifetime
        CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_district_admin_setup_one_open_token
    ON tbl_district_admin_setup_tokens (user_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_district_admin_setup_token_expiry
    ON tbl_district_admin_setup_tokens (expires_at)
    WHERE used_at IS NULL AND revoked_at IS NULL;

INSERT INTO mst_permissions (code, resource, action, description)
VALUES
    ('role.manage', 'role', 'manage', 'Create and manage custom roles and permissions'),
    ('district_admin.manage', 'district_admin', 'manage', 'Create and map District Admin accounts')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mst_roles r
JOIN mst_permissions p ON p.code IN ('role.manage', 'district_admin.manage')
WHERE r.code = 'SYSTEM_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
