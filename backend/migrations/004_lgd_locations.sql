-- 004_lgd_locations.sql | Location master data from the Government of India
-- Local Government Directory (LGD). Additive only: no rows are deleted and
-- existing ids / relationships are kept.
--
-- LGD hierarchy used:  State -> District -> Sub-district (= Mandal in Andhra Pradesh) -> Village
-- LGD "Development Blocks" are a different hierarchy with different codes and are NOT mandals.

-- 1. Source details on districts, mandals and villages
--    lgd_code       official LGD code (NULL for records entered by hand)
--    data_source    'LGD' (imported) or 'MANUAL' (typed in by an administrator)
--    is_verified    TRUE = checked by an administrator; imports never change these rows
--    lgd_synced_at  last time the row was created/updated from LGD
--    import_batch_id  tbl_location_import_batches.id of that import (no FK on purpose:
--                     test clean-up truncates tbl_* tables and must not cascade into masters)
ALTER TABLE mst_districts
    ADD COLUMN IF NOT EXISTS lgd_code        INT,
    ADD COLUMN IF NOT EXISTS state_lgd_code  INT,
    ADD COLUMN IF NOT EXISTS data_source     TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lgd_synced_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS import_batch_id BIGINT;

ALTER TABLE mst_mandals
    ADD COLUMN IF NOT EXISTS lgd_code        INT,
    ADD COLUMN IF NOT EXISTS data_source     TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lgd_synced_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS import_batch_id BIGINT;

ALTER TABLE mst_villages
    ADD COLUMN IF NOT EXISTS lgd_code        INT,
    ADD COLUMN IF NOT EXISTS data_source     TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lgd_synced_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS import_batch_id BIGINT;

ALTER TABLE mst_districts ADD CONSTRAINT ck_districts_source CHECK (data_source IN ('MANUAL', 'LGD'));
ALTER TABLE mst_mandals   ADD CONSTRAINT ck_mandals_source   CHECK (data_source IN ('MANUAL', 'LGD'));
ALTER TABLE mst_villages  ADD CONSTRAINT ck_villages_source  CHECK (data_source IN ('MANUAL', 'LGD'));

-- One row per LGD code (rows without a code are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_districts_lgd_code ON mst_districts (lgd_code) WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mandals_lgd_code   ON mst_mandals   (lgd_code) WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_villages_lgd_code  ON mst_villages  (lgd_code) WHERE lgd_code IS NOT NULL;

-- 2. Villages link straight to their mandal.
--    LGD lists revenue villages under sub-districts (mandals), not under gram panchayats,
--    so the gram panchayat becomes optional. Existing villages get their mandal from
--    their gram panchayat; nothing else changes for them.
ALTER TABLE mst_villages ADD COLUMN IF NOT EXISTS mandal_id BIGINT REFERENCES mst_mandals(id);

UPDATE mst_villages v
   SET mandal_id = gp.mandal_id
  FROM mst_gram_panchayats gp
 WHERE gp.id = v.gram_panchayat_id
   AND v.mandal_id IS NULL;

ALTER TABLE mst_villages ALTER COLUMN gram_panchayat_id DROP NOT NULL;

-- Keeps mandal_id and the gram panchayat's mandal in agreement
CREATE OR REPLACE FUNCTION fn_village_mandal_from_gp() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    gp_mandal BIGINT;
BEGIN
    IF NEW.gram_panchayat_id IS NOT NULL THEN
        SELECT mandal_id INTO gp_mandal FROM mst_gram_panchayats WHERE id = NEW.gram_panchayat_id;

        IF NEW.mandal_id IS NULL THEN
            NEW.mandal_id := gp_mandal;
        ELSIF NEW.mandal_id <> gp_mandal THEN
            RAISE EXCEPTION 'Village mandal % does not match the mandal % of its gram panchayat',
                NEW.mandal_id, gp_mandal;
        END IF;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_village_mandal ON mst_villages;
CREATE TRIGGER trg_village_mandal
BEFORE INSERT OR UPDATE OF gram_panchayat_id, mandal_id ON mst_villages
FOR EACH ROW EXECUTE FUNCTION fn_village_mandal_from_gp();

ALTER TABLE mst_villages ALTER COLUMN mandal_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_villages_mandal ON mst_villages (mandal_id);

-- 3. History of every LGD import (source, date, who, what changed)
CREATE TABLE IF NOT EXISTS tbl_location_import_batches (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    level           TEXT NOT NULL CHECK (level IN ('DISTRICT', 'MANDAL', 'VILLAGE')),
    source          TEXT NOT NULL DEFAULT 'LGD',
    source_url      TEXT NOT NULL,
    parent_lgd_code INT,
    parent_name     TEXT,
    fetched_count   INT NOT NULL,
    selected_count  INT NOT NULL,
    inserted_count  INT NOT NULL DEFAULT 0,
    updated_count   INT NOT NULL DEFAULT 0,
    linked_count    INT NOT NULL DEFAULT 0,
    skipped_count   INT NOT NULL DEFAULT 0,
    imported_by     UUID NOT NULL REFERENCES tbl_users(id),
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_location_imports_at ON tbl_location_import_batches (imported_at DESC);

-- 4. Permission: only SUPER_ADMIN may import location master data
INSERT INTO mst_permissions (code, resource, action, description) VALUES
 ('master.import', 'master', 'import', 'Import location master data from LGD and add locations manually')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM mst_roles r, mst_permissions p
 WHERE r.code = 'SUPER_ADMIN' AND p.code = 'master.import'
ON CONFLICT (role_id, permission_id) DO NOTHING;
