-- PROPOSAL ONLY. Requires reviewed approval before moving into migrations/.
-- Depends on migration 013 (tbl_health_worker_location_assignments and the
-- patient trigger / access function it created).
--
-- Purpose: a Health Worker keeps a fixed District and Mandal (from their
-- location assignment) but may register patients in ANY active village of that
-- Mandal, at ANY active facility of that Mandal.
--
-- Changes (no table, column, row or permission is added, changed or deleted):
--   1. fn_patient_set_mandal_and_validate_hw_assignment(): the Health Worker
--      check changes from "exact assigned village + facility pair" to
--      "currently assigned to the patient's Mandal, and the facility is an active
--      facility of that Mandal". The Mandal is still derived from the village.
--   2. fn_user_has_patient_access(): Health Workers additionally see patients
--      THEY registered while they are still assigned to that patient's Mandal.
--      The existing exact-pair rule and the other roles are unchanged.
-- Existing patients and assignments are not modified.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.tbl_health_worker_location_assignments') IS NULL
       OR to_regprocedure('public.fn_patient_set_mandal_and_validate_hw_assignment()') IS NULL
       OR to_regprocedure('public.fn_user_has_patient_access(uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'Migration 017 requires migration 013 (Health Worker location assignments)';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'tbl_patients'::regclass
           AND tgname = 'trg_patient_set_mandal_and_validate_hw_assignment'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Expected trigger trg_patient_set_mandal_and_validate_hw_assignment was not found';
    END IF;
END;
$$;

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

    -- Health Worker: currently assigned to this Mandal, village and facility active in it
    IF v_role_code = 'HEALTH_WORKER' AND NOT (
        EXISTS (
            SELECT 1 FROM tbl_health_worker_location_assignments a
            WHERE a.user_id = NEW.registered_by
              AND a.mandal_id = v_patient_mandal
              AND a.valid_from <= CURRENT_DATE
              AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        )
        AND EXISTS (
            SELECT 1 FROM mst_villages v
            WHERE v.id = NEW.village_id AND v.mandal_id = v_patient_mandal AND v.is_active IS TRUE
        )
        AND EXISTS (
            SELECT 1 FROM mst_facilities f
            WHERE f.id = NEW.registered_facility_id
              AND f.mandal_id = v_patient_mandal
              AND f.is_active IS TRUE
        )
    ) THEN
        RAISE EXCEPTION 'Health Worker is not assigned to this Mandal, or the village or facility is not an active part of it';
    END IF;

    RETURN NEW;
END;
$$;

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
             -- New: own registrations in a Mandal the Health Worker is still assigned to
             OR (r.code = 'HEALTH_WORKER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    LEFT JOIN mst_villages v ON v.id = p.village_id
                    JOIN tbl_health_worker_location_assignments a
                      ON a.user_id = p_user
                     AND a.mandal_id = COALESCE(p.mandal_id, v.mandal_id)
                    WHERE p.id = p_patient
                      AND p.registered_by = p_user
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

COMMIT;
