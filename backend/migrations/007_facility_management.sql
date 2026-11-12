-- 007_facility_management.sql | Facility Management module.
-- Extends the existing mst_facilities table (no new facility table).
-- Additive only: no rows are deleted, ids and relationships are kept,
-- the demo facilities stay as they are.

-- 1. Detailed facility type shown in the app
--    facility_type (existing, coarse)   category (new, detailed)
--    PHC                                PHC
--    HOSPITAL                           CHC, DISTRICT_HOSPITAL, AREA_HOSPITAL, MEDICAL_COLLEGE
--    SUB_CENTRE                         SUB_CENTRE
--    OTHER                              OTHER
--    SCREENING_SITE / DISTRICT_OFFICE   same as facility_type (existing rows)
ALTER TABLE mst_facilities ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE mst_facilities f
   SET category = CASE
         WHEN f.facility_type = 'PHC' THEN 'PHC'
         WHEN f.facility_type = 'HOSPITAL' THEN
              CASE (SELECT h.level FROM mst_hospitals h WHERE h.id = f.hospital_id)
                   WHEN 'CHC' THEN 'CHC'
                   WHEN 'DH' THEN 'DISTRICT_HOSPITAL'
                   WHEN 'TERTIARY' THEN 'MEDICAL_COLLEGE'   -- tertiary / teaching hospital
                   ELSE 'AREA_HOSPITAL'                     -- 'AH' and anything unknown
              END
         ELSE f.facility_type::text
       END
 WHERE f.category IS NULL;

ALTER TABLE mst_facilities ALTER COLUMN category SET NOT NULL;

ALTER TABLE mst_facilities ADD CONSTRAINT ck_facility_category CHECK (
    (category = 'PHC' AND facility_type = 'PHC') OR
    (category IN ('CHC', 'DISTRICT_HOSPITAL', 'AREA_HOSPITAL', 'MEDICAL_COLLEGE') AND facility_type = 'HOSPITAL') OR
    (category = 'SUB_CENTRE' AND facility_type = 'SUB_CENTRE') OR
    (category = 'OTHER' AND facility_type = 'OTHER') OR
    (category IN ('SCREENING_SITE', 'DISTRICT_OFFICE') AND facility_type::text = category));

-- Sub-centres and other facilities have no PHC / hospital parent row
ALTER TABLE mst_facilities DROP CONSTRAINT IF EXISTS ck_facility_parent;
ALTER TABLE mst_facilities ADD CONSTRAINT ck_facility_parent CHECK (
    (facility_type = 'PHC'      AND phc_id IS NOT NULL AND hospital_id IS NULL) OR
    (facility_type = 'HOSPITAL' AND hospital_id IS NOT NULL AND phc_id IS NULL) OR
    (facility_type IN ('SCREENING_SITE', 'DISTRICT_OFFICE', 'SUB_CENTRE', 'OTHER')
        AND phc_id IS NULL AND hospital_id IS NULL));

-- 2. Location and contact details
ALTER TABLE mst_facilities
    ADD COLUMN IF NOT EXISTS mandal_id     BIGINT REFERENCES mst_mandals(id),
    ADD COLUMN IF NOT EXISTS village_id    BIGINT REFERENCES mst_villages(id),
    ADD COLUMN IF NOT EXISTS address       TEXT,
    ADD COLUMN IF NOT EXISTS pin_code      TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS email         TEXT,
    ADD COLUMN IF NOT EXISTS incharge_name TEXT,
    ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE mst_facilities ADD CONSTRAINT ck_facility_pin
    CHECK (pin_code IS NULL OR pin_code ~ '^[1-9][0-9]{5}$');
ALTER TABLE mst_facilities ADD CONSTRAINT ck_facility_phone
    CHECK (contact_phone IS NULL OR contact_phone ~ '^[0-9]{10,11}$');

-- Existing PHCs already know their mandal through mst_phcs
UPDATE mst_facilities f
   SET mandal_id = p.mandal_id
  FROM mst_phcs p
 WHERE p.id = f.phc_id
   AND f.mandal_id IS NULL;

-- 3. Facility code is optional now, but still unique (also ignoring upper/lower case)
ALTER TABLE mst_facilities ALTER COLUMN code DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_facilities_code_upper
    ON mst_facilities (upper(code)) WHERE code IS NOT NULL;

-- 4. The mandal must belong to the district and the village to the mandal.
--    Older code that inserts without a category gets one from facility_type.
CREATE OR REPLACE FUNCTION fn_facility_location_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    mandal_district BIGINT;
    village_mandal  BIGINT;
BEGIN
    IF NEW.category IS NULL THEN
        NEW.category := CASE NEW.facility_type::text
                            WHEN 'HOSPITAL' THEN 'AREA_HOSPITAL'
                            ELSE NEW.facility_type::text
                        END;
    END IF;

    IF NEW.mandal_id IS NOT NULL THEN
        SELECT district_id INTO mandal_district FROM mst_mandals WHERE id = NEW.mandal_id;
        IF mandal_district IS DISTINCT FROM NEW.district_id THEN
            RAISE EXCEPTION 'Facility mandal % does not belong to district %', NEW.mandal_id, NEW.district_id;
        END IF;
    END IF;

    IF NEW.village_id IS NOT NULL THEN
        IF NEW.mandal_id IS NULL THEN
            RAISE EXCEPTION 'A facility with a village must also have a mandal';
        END IF;
        SELECT mandal_id INTO village_mandal FROM mst_villages WHERE id = NEW.village_id;
        IF village_mandal IS DISTINCT FROM NEW.mandal_id THEN
            RAISE EXCEPTION 'Facility village % does not belong to mandal %', NEW.village_id, NEW.mandal_id;
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_facility_location ON mst_facilities;
CREATE TRIGGER trg_facility_location
BEFORE INSERT OR UPDATE ON mst_facilities
FOR EACH ROW EXECUTE FUNCTION fn_facility_location_check();

-- 5. Indexes for the list filters
CREATE INDEX IF NOT EXISTS idx_facilities_mandal   ON mst_facilities (mandal_id);
CREATE INDEX IF NOT EXISTS idx_facilities_village  ON mst_facilities (village_id);
CREATE INDEX IF NOT EXISTS idx_facilities_category ON mst_facilities (category);
CREATE INDEX IF NOT EXISTS idx_facilities_active   ON mst_facilities (is_active);
