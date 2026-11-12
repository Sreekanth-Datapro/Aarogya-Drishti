-- Composite keys let assignments enforce the location hierarchy using foreign keys.
ALTER TABLE mst_mandals
    ADD CONSTRAINT uq_mst_mandals_id_district UNIQUE (id, district_id);
ALTER TABLE mst_villages
    ADD CONSTRAINT uq_mst_villages_id_mandal UNIQUE (id, mandal_id);
ALTER TABLE mst_facilities
    ADD CONSTRAINT uq_mst_facilities_id_district_mandal UNIQUE (id, district_id, mandal_id);

-- Keep existing patient rows valid; the trigger below derives this for new/changed locations.
ALTER TABLE tbl_patients
    ADD COLUMN mandal_id BIGINT REFERENCES mst_mandals(id);
ALTER TABLE tbl_patients
    ADD CONSTRAINT fk_patient_village_mandal
    FOREIGN KEY (village_id, mandal_id) REFERENCES mst_villages(id, mandal_id);

-- Each row authorizes one Health Worker to register a patient for this village/facility pair.
CREATE TABLE tbl_health_worker_location_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES tbl_users(id),
    district_id BIGINT NOT NULL REFERENCES mst_districts(id),
    mandal_id BIGINT NOT NULL,
    village_id BIGINT NOT NULL,
    facility_id BIGINT NOT NULL,
    assigned_by UUID NOT NULL REFERENCES tbl_users(id),
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_hw_assignment_mandal_district
        FOREIGN KEY (mandal_id, district_id) REFERENCES mst_mandals(id, district_id),
    CONSTRAINT fk_hw_assignment_village_mandal
        FOREIGN KEY (village_id, mandal_id) REFERENCES mst_villages(id, mandal_id),
    CONSTRAINT fk_hw_assignment_facility_location
        FOREIGN KEY (facility_id, district_id, mandal_id)
        REFERENCES mst_facilities(id, district_id, mandal_id),
    CONSTRAINT uq_hw_assignment_start UNIQUE (user_id, village_id, facility_id, valid_from),
    CONSTRAINT ck_hw_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX uq_hw_assignment_active
    ON tbl_health_worker_location_assignments (user_id, village_id, facility_id)
    WHERE valid_to IS NULL;

-- A Medical Officer may have multiple Mandals; many MOs may serve the same Mandal.
CREATE TABLE tbl_medical_officer_mandal_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES tbl_users(id),
    mandal_id BIGINT NOT NULL REFERENCES mst_mandals(id),
    assigned_by UUID NOT NULL REFERENCES tbl_users(id),
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mo_mandal_assignment_start UNIQUE (user_id, mandal_id, valid_from),
    CONSTRAINT ck_mo_mandal_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX uq_mo_mandal_assignment_active
    ON tbl_medical_officer_mandal_assignments (user_id, mandal_id)
    WHERE valid_to IS NULL;
CREATE INDEX idx_mo_mandal_assignment_scope
    ON tbl_medical_officer_mandal_assignments (mandal_id, user_id)
    WHERE valid_to IS NULL;

-- Claim history is separate from the existing generic case-assignment table.
CREATE TABLE tbl_medical_officer_case_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES tbl_patients(id),
    medical_officer_id UUID NOT NULL REFERENCES tbl_users(id),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES tbl_users(id),
    CONSTRAINT ck_mo_claim_release_time
        CHECK (released_at IS NULL OR released_at >= claimed_at)
);
CREATE UNIQUE INDEX uq_mo_claim_one_active_per_patient
    ON tbl_medical_officer_case_claims (patient_id)
    WHERE released_at IS NULL;
CREATE INDEX idx_mo_claim_active_owner
    ON tbl_medical_officer_case_claims (medical_officer_id)
    WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION fn_validate_health_worker_location_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = NEW.user_id AND r.code = 'HEALTH_WORKER'
    ) THEN
        RAISE EXCEPTION 'Location assignment user must have the HEALTH_WORKER role';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_health_worker_location_assignment
BEFORE INSERT OR UPDATE OF user_id, district_id, mandal_id, village_id, facility_id
ON tbl_health_worker_location_assignments
FOR EACH ROW EXECUTE FUNCTION fn_validate_health_worker_location_assignment();

CREATE OR REPLACE FUNCTION fn_validate_medical_officer_mandal_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = NEW.user_id AND r.code = 'MEDICAL_OFFICER'
    ) THEN
        RAISE EXCEPTION 'Mandal assignment user must have the MEDICAL_OFFICER role';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_medical_officer_mandal_assignment
BEFORE INSERT OR UPDATE OF user_id, mandal_id
ON tbl_medical_officer_mandal_assignments
FOR EACH ROW EXECUTE FUNCTION fn_validate_medical_officer_mandal_assignment();

-- The Mandal is derived from the selected village, never accepted from the request body.
-- Health Workers must also have an active assignment for that village/facility pair.
CREATE OR REPLACE FUNCTION fn_patient_set_mandal_and_validate_hw_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_role_code TEXT;
    v_patient_mandal BIGINT;
BEGIN
    SELECT r.code INTO v_role_code
    FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
    WHERE u.id = NEW.registered_by;

    IF NEW.village_id IS NULL THEN
        NEW.mandal_id := NULL;
        IF v_role_code = 'HEALTH_WORKER' THEN
            RAISE EXCEPTION 'Health Worker patient registration requires a village';
        END IF;
        RETURN NEW;
    END IF;

    SELECT v.mandal_id INTO v_patient_mandal
    FROM mst_villages v WHERE v.id = NEW.village_id;
    IF v_patient_mandal IS NULL THEN
        RAISE EXCEPTION 'Patient village must belong to a Mandal';
    END IF;
    NEW.mandal_id := v_patient_mandal;

    IF v_role_code = 'HEALTH_WORKER' AND NOT EXISTS (
        SELECT 1 FROM tbl_health_worker_location_assignments a
        WHERE a.user_id = NEW.registered_by
          AND a.mandal_id = v_patient_mandal
          AND a.village_id = NEW.village_id
          AND a.facility_id = NEW.registered_facility_id
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Health Worker is not assigned to this village and facility';
    END IF;

    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_patient_set_mandal_and_validate_hw_assignment
BEFORE INSERT OR UPDATE OF village_id, registered_facility_id, registered_by, mandal_id
ON tbl_patients
FOR EACH ROW EXECUTE FUNCTION fn_patient_set_mandal_and_validate_hw_assignment();

CREATE OR REPLACE FUNCTION fn_validate_medical_officer_case_claim()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_patient_mandal BIGINT;
BEGIN
    SELECT COALESCE(p.mandal_id, v.mandal_id) INTO v_patient_mandal
    FROM tbl_patients p
    LEFT JOIN mst_villages v ON v.id = p.village_id
    WHERE p.id = NEW.patient_id AND p.deleted_at IS NULL;

    IF v_patient_mandal IS NULL THEN
        RAISE EXCEPTION 'Patient must have a village and Mandal before it can be claimed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM tbl_users u
        JOIN mst_roles r ON r.id = u.role_id
        JOIN tbl_medical_officer_mandal_assignments a ON a.user_id = u.id
        WHERE u.id = NEW.medical_officer_id
          AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND r.code = 'MEDICAL_OFFICER'
          AND a.mandal_id = v_patient_mandal
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Medical Officer is not assigned to the patient Mandal';
    END IF;

    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_medical_officer_case_claim
BEFORE INSERT OR UPDATE OF patient_id, medical_officer_id
ON tbl_medical_officer_case_claims
FOR EACH ROW EXECUTE FUNCTION fn_validate_medical_officer_case_claim();

-- Scope Health Workers to currently assigned village/facility pairs, and MOs to assigned Mandals.
CREATE OR REPLACE FUNCTION fn_user_has_patient_access(p_user UUID, p_patient UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = p_user AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND r.code NOT IN ('DISTRICT_ADMIN', 'SYSTEM_ADMIN', 'SUPER_ADMIN')
          AND (
                (r.code NOT IN ('HEALTH_WORKER', 'MEDICAL_OFFICER') AND EXISTS (
                    SELECT 1 FROM tbl_case_assignments ca
                    WHERE ca.patient_id = p_patient AND ca.user_id = p_user
                      AND ca.valid_from <= now() AND (ca.valid_to IS NULL OR ca.valid_to > now())
                ))
             OR (r.code = 'HEALTH_WORKER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    JOIN tbl_health_worker_location_assignments a
                      ON a.user_id = p_user
                     AND a.village_id = p.village_id
                     AND a.facility_id = p.registered_facility_id
                    WHERE p.id = p_patient
                      AND a.valid_from <= CURRENT_DATE
                      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
                ))
             OR (r.code = 'MEDICAL_OFFICER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    LEFT JOIN mst_villages v ON v.id = p.village_id
                    JOIN tbl_medical_officer_mandal_assignments a
                      ON a.user_id = p_user
                     AND a.mandal_id = COALESCE(p.mandal_id, v.mandal_id)
                    WHERE p.id = p_patient
                      AND a.valid_from <= CURRENT_DATE
                      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
                ))
          )
    );
$$;
