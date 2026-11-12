-- Diagnostic Module Phase 1: categories, test master, multi-item orders.
-- Keeps existing tbl_investigation_orders (Specialist decision path) unchanged.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS mst_diagnostic_categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name_en     TEXT NOT NULL,
    name_te     TEXT,
    sort_order  INT NOT NULL DEFAULT 100,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mst_diagnostic_tests (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id            BIGINT NOT NULL REFERENCES mst_diagnostic_categories(id),
    code                   TEXT NOT NULL UNIQUE,
    name_en                TEXT NOT NULL,
    name_te                TEXT,
    default_fasting        BOOLEAN NOT NULL DEFAULT FALSE,
    investigation_type_id  BIGINT REFERENCES mst_investigation_types(id),
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_tests_category
  ON mst_diagnostic_tests (category_id) WHERE is_active IS TRUE;
DROP TRIGGER IF EXISTS trg_mst_diagnostic_tests_updated_at ON mst_diagnostic_tests;
CREATE TRIGGER trg_mst_diagnostic_tests_updated_at
  BEFORE UPDATE ON mst_diagnostic_tests
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE SEQUENCE IF NOT EXISTS seq_diagnostic_order_code START 1;

CREATE TABLE IF NOT EXISTS tbl_diagnostic_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code      TEXT NOT NULL UNIQUE,
    patient_id      UUID NOT NULL REFERENCES tbl_patients(id),
    referral_id     UUID,
    facility_id     BIGINT NOT NULL REFERENCES mst_facilities(id),
    prescribed_by   UUID NOT NULL REFERENCES tbl_users(id),
    status_id       BIGINT NOT NULL REFERENCES mst_investigation_statuses(id),
    notes           TEXT,
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, patient_id),
    UNIQUE (prescribed_by, idempotency_key),
    FOREIGN KEY (referral_id, patient_id) REFERENCES tbl_referrals (id, patient_id)
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_patient
  ON tbl_diagnostic_orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_referral
  ON tbl_diagnostic_orders (referral_id) WHERE referral_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_prescriber
  ON tbl_diagnostic_orders (prescribed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_facility
  ON tbl_diagnostic_orders (facility_id);
DROP TRIGGER IF EXISTS trg_tbl_diagnostic_orders_updated_at ON tbl_diagnostic_orders;
CREATE TRIGGER trg_tbl_diagnostic_orders_updated_at
  BEFORE UPDATE ON tbl_diagnostic_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_diagnostic_prescriber_role ON tbl_diagnostic_orders;
CREATE TRIGGER trg_diagnostic_prescriber_role
  BEFORE INSERT ON tbl_diagnostic_orders
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('prescribed_by', 'SPECIALIST,MEDICAL_OFFICER');

CREATE TABLE IF NOT EXISTS tbl_diagnostic_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES tbl_diagnostic_orders(id) ON DELETE CASCADE,
    test_id           BIGINT NOT NULL REFERENCES mst_diagnostic_tests(id),
    clinical_reason   TEXT NOT NULL,
    priority          TEXT NOT NULL CHECK (priority IN ('ROUTINE', 'URGENT', 'EMERGENCY')),
    fasting_required  BOOLEAN NOT NULL DEFAULT FALSE,
    instructions      TEXT,
    status_id         BIGINT NOT NULL REFERENCES mst_investigation_statuses(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, test_id)
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_order_items_order
  ON tbl_diagnostic_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_order_items_status
  ON tbl_diagnostic_order_items (status_id);
DROP TRIGGER IF EXISTS trg_tbl_diagnostic_order_items_updated_at ON tbl_diagnostic_order_items;
CREATE TRIGGER trg_tbl_diagnostic_order_items_updated_at
  BEFORE UPDATE ON tbl_diagnostic_order_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS tbl_diagnostic_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES tbl_diagnostic_orders(id) ON DELETE CASCADE,
    item_id         UUID REFERENCES tbl_diagnostic_order_items(id) ON DELETE CASCADE,
    from_status_id  BIGINT REFERENCES mst_investigation_statuses(id),
    to_status_id    BIGINT NOT NULL REFERENCES mst_investigation_statuses(id),
    changed_by      UUID NOT NULL REFERENCES tbl_users(id),
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_status_history_order
  ON tbl_diagnostic_status_history (order_id, changed_at);
DROP TRIGGER IF EXISTS trg_tbl_diagnostic_status_history_append_only ON tbl_diagnostic_status_history;
CREATE TRIGGER trg_tbl_diagnostic_status_history_append_only
  BEFORE UPDATE OR DELETE ON tbl_diagnostic_status_history
  FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

-- Seed categories (idempotent)
INSERT INTO mst_diagnostic_categories (code, name_en, name_te, sort_order)
SELECT v.code, v.name_en, v.name_te, v.sort_order
  FROM (VALUES
    ('LAB', 'Laboratory', 'ప్రయోగశాల', 10),
    ('IMAGING', 'Imaging', 'ఇమేజింగ్', 20),
    ('PATHOLOGY', 'Pathology', 'పాథాలజీ', 30),
    ('CLINICAL', 'Clinical examination', 'వైద్య పరీక్ష', 40)
  ) AS v(code, name_en, name_te, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_diagnostic_categories existing WHERE existing.code = v.code
 );

-- Seed tests from existing investigation types (bridge, no duplicates)
INSERT INTO mst_diagnostic_tests (
  category_id, code, name_en, name_te, default_fasting, investigation_type_id
)
SELECT category.id,
       inv.code,
       inv.name_en,
       inv.name_te,
       CASE WHEN inv.code IN ('BIOPSY', 'HISTOPATHOLOGY') THEN FALSE
            WHEN inv.code IN ('CT', 'MRI') THEN TRUE
            ELSE FALSE END,
       inv.id
  FROM mst_investigation_types inv
  JOIN mst_diagnostic_categories category ON category.code = CASE
         WHEN inv.code IN ('BIOPSY', 'HISTOPATHOLOGY') THEN 'PATHOLOGY'
         WHEN inv.code IN ('CT', 'MRI') THEN 'IMAGING'
         WHEN inv.code = 'CLINICAL_REEXAM' THEN 'CLINICAL'
         ELSE 'LAB'
       END
 WHERE inv.is_active IS TRUE
   AND NOT EXISTS (
     SELECT 1 FROM mst_diagnostic_tests existing WHERE existing.code = inv.code
   );

-- Extra common oral-cancer screening tests (demo master data)
INSERT INTO mst_diagnostic_tests (category_id, code, name_en, name_te, default_fasting)
SELECT category.id, v.code, v.name_en, v.name_te, v.default_fasting
  FROM (VALUES
    ('LAB', 'CBC', 'Complete blood count', 'పూర్తి రక్త గణన', TRUE),
    ('LAB', 'BLOOD_GLUCOSE', 'Blood glucose', 'రక్తంలో చక్కెర', TRUE),
    ('IMAGING', 'OPG', 'Orthopantomogram (OPG)', 'ఓపిజి ఎక్స్-రే', FALSE),
    ('PATHOLOGY', 'CYTOLOGY', 'Cytology smear', 'సైటాలజీ స్మియర్', FALSE)
  ) AS v(category_code, code, name_en, name_te, default_fasting)
  JOIN mst_diagnostic_categories category ON category.code = v.category_code
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_diagnostic_tests existing WHERE existing.code = v.code
 );

-- Ensure prescribe permission exists (may already be present from base schema)
INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'investigation.record', 'investigation', 'create', 'Order / track biopsy and investigations'
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'investigation.record');

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN ('MEDICAL_OFFICER', 'SPECIALIST')
   AND permission_row.code = 'investigation.record'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Navigator and clinicians can list diagnostic orders for assigned patients
INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'diagnostic.view', 'diagnostic', 'view', 'View diagnostic orders for assigned patients'
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'diagnostic.view');

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN ('NAVIGATOR', 'MEDICAL_OFFICER', 'SPECIALIST', 'SYSTEM_ADMIN', 'SUPER_ADMIN')
   AND permission_row.code = 'diagnostic.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
