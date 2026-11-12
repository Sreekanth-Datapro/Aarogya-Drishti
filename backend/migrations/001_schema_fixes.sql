-- 001_schema_fixes.sql | Upgrades a database created from the ORIGINAL ALL_IN_ONE.sql.
-- A fresh database built from the current ALL_IN_ONE (1).sql already contains all of this.
-- Run:  psql -d <db> -v ON_ERROR_STOP=1 -f migrations/001_schema_fixes.sql
BEGIN;

-- 1. Case state machine: evidence gates for APPOINTED / DIAGNOSTICS_PENDING,
--    and allow returning to RESULT_REVIEWED / CARE_LINKED after a missed visit
CREATE OR REPLACE FUNCTION fn_check_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok BOOLEAN;
BEGIN
  IF NEW.case_state IS NOT DISTINCT FROM OLD.case_state THEN RETURN NEW; END IF;

  SELECT EXISTS (
      SELECT 1 FROM (VALUES
        ('DRAFT','CONSENTED'),('DRAFT','CLOSED'),('CONSENTED','SCREENED'),
        ('SCREENED','AWAITING_CLINICIAN'),('SCREENED','CLOSED'),
        ('AWAITING_CLINICIAN','REVIEWED'),('AWAITING_CLINICIAN','SCREENED'),      -- SCREENED = recapture requested
        ('REVIEWED','REFERRAL_PLANNED'),('REVIEWED','CLOSED'),
        ('REFERRAL_PLANNED','APPOINTED'),('APPOINTED','ASSESSED'),
        ('ASSESSED','DIAGNOSTICS_PENDING'),('ASSESSED','CLOSED'),
        ('DIAGNOSTICS_PENDING','RESULT_REVIEWED'),
        ('RESULT_REVIEWED','CARE_LINKED'),('RESULT_REVIEWED','DIAGNOSTICS_PENDING'),('RESULT_REVIEWED','CLOSED'),
        ('CARE_LINKED','CLOSED')
      ) AS t(a, b)
      WHERE a = OLD.case_state::text AND b = NEW.case_state::text)
    OR (NEW.case_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND OLD.case_state NOT IN ('DRAFT','CLOSED'))
    OR (OLD.case_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND NEW.case_state IN ('REFERRAL_PLANNED','APPOINTED','ASSESSED','DIAGNOSTICS_PENDING',
                               'RESULT_REVIEWED','CARE_LINKED','CLOSED','LOST_CONTACT'))
  INTO ok;

  IF NOT ok THEN
    RAISE EXCEPTION 'invalid case transition % -> %', OLD.case_state, NEW.case_state
          USING ERRCODE = 'check_violation';
  END IF;

  -- AI can never bypass the clinician
  IF NEW.case_state = 'REVIEWED' AND NOT EXISTS (
        SELECT 1 FROM tbl_clinical_reviews cr WHERE cr.screening_id = NEW.id AND cr.signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'case cannot be REVIEWED without a signed clinician review' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'REFERRAL_PLANNED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'REFERRAL_PLANNED needs a referral record' USING ERRCODE = 'check_violation';
  END IF;
  -- exception states (MISSED etc.) must not become a shortcut past review / referral
  IF NEW.case_state = 'APPOINTED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.status <> 'CANCELLED'
           AND (EXISTS (SELECT 1 FROM tbl_hospital_appointments a WHERE a.referral_id = r.id)
             OR EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.referral_id = r.id AND v.is_active))) THEN
    RAISE EXCEPTION 'APPOINTED needs a booked appointment or video consultation' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'DIAGNOSTICS_PENDING' AND NOT EXISTS (
        SELECT 1 FROM tbl_investigation_orders o
          JOIN tbl_referrals r ON r.id = o.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id) THEN
    RAISE EXCEPTION 'DIAGNOSTICS_PENDING needs an investigation order' USING ERRCODE = 'check_violation';
  END IF;
  -- creating a referral is NOT completing specialist care
  IF NEW.case_state = 'ASSESSED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.assessment_completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSESSED needs a completed specialist assessment on the referral' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'RESULT_REVIEWED' AND NOT EXISTS (
        SELECT 1 FROM tbl_pathology_reviews pr
          JOIN tbl_pathology_reports rep ON rep.id = pr.report_id
          JOIN tbl_investigation_orders o ON o.id = rep.order_id
          JOIN tbl_referrals r ON r.id = o.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND pr.signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'RESULT_REVIEWED needs a signed clinician review of the report' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'CARE_LINKED' AND NOT EXISTS (
        SELECT 1 FROM tbl_treatment_linkages tl
          JOIN tbl_referrals r ON r.id = tl.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND tl.status IN ('CONFIRMED','STARTED','COMPLETED')) THEN
    RAISE EXCEPTION 'CARE_LINKED needs a confirmed treatment linkage' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 2. Facility type must match its parent
ALTER TABLE mst_facilities DROP CONSTRAINT IF EXISTS ck_facility_one_parent;
ALTER TABLE mst_facilities DROP CONSTRAINT IF EXISTS ck_facility_parent;
ALTER TABLE mst_facilities ADD CONSTRAINT ck_facility_parent CHECK (
    (facility_type = 'PHC'      AND phc_id IS NOT NULL AND hospital_id IS NULL) OR
    (facility_type = 'HOSPITAL' AND hospital_id IS NOT NULL AND phc_id IS NULL) OR
    (facility_type IN ('SCREENING_SITE','DISTRICT_OFFICE') AND phc_id IS NULL AND hospital_id IS NULL));

-- 3. Registration requests: mandal / village become master-data foreign keys
ALTER TABLE tbl_user_registration_requests
    ADD COLUMN IF NOT EXISTS mandal_id  BIGINT REFERENCES mst_mandals(id),
    ADD COLUMN IF NOT EXISTS village_id BIGINT REFERENCES mst_villages(id);

DO $$
DECLARE unmatched INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'tbl_user_registration_requests' AND column_name = 'mandal_name') THEN

    -- best-effort backfill of existing rows by English name
    UPDATE tbl_user_registration_requests r
       SET mandal_id = m.id
      FROM mst_mandals m
     WHERE r.mandal_id IS NULL AND lower(m.name_en) = lower(trim(r.mandal_name));

    UPDATE tbl_user_registration_requests r
       SET village_id = v.id
      FROM mst_villages v JOIN mst_gram_panchayats gp ON gp.id = v.gram_panchayat_id
     WHERE r.village_id IS NULL AND gp.mandal_id = r.mandal_id
       AND lower(v.name_en) = lower(trim(r.village_name));

    SELECT count(*) INTO unmatched FROM tbl_user_registration_requests
     WHERE mandal_id IS NULL OR village_id IS NULL;

    IF unmatched = 0 THEN
      ALTER TABLE tbl_user_registration_requests DROP COLUMN mandal_name, DROP COLUMN village_name;
      ALTER TABLE tbl_user_registration_requests
          ALTER COLUMN mandal_id SET NOT NULL, ALTER COLUMN village_id SET NOT NULL;
    ELSE
      -- keep old text columns for the unmatched rows; new rows always use the ids
      ALTER TABLE tbl_user_registration_requests
          ALTER COLUMN mandal_name DROP NOT NULL, ALTER COLUMN village_name DROP NOT NULL;
      RAISE NOTICE '% registration request(s) could not be matched to a mandal/village. '
                   'Fix them, then drop mandal_name/village_name and set mandal_id/village_id NOT NULL.', unmatched;
    END IF;
  END IF;
END $$;

-- 4. Approved / rejected requests must record who reviewed them and when
ALTER TABLE tbl_user_registration_requests DROP CONSTRAINT IF EXISTS ck_reg_reviewed;
ALTER TABLE tbl_user_registration_requests ADD CONSTRAINT ck_reg_reviewed
    CHECK (status = 'PENDING' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));

-- 5. One active primary facility per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_ufa_one_primary ON tbl_user_facility_assignments (user_id)
    WHERE is_primary AND valid_to IS NULL;

-- 6. Only health workers / medical officers may register patients
DROP TRIGGER IF EXISTS trg_patient_registrar_role ON tbl_patients;
CREATE TRIGGER trg_patient_registrar_role BEFORE INSERT ON tbl_patients
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('registered_by', 'HEALTH_WORKER,MEDICAL_OFFICER');

-- 7. Video consultation: slot must belong to the same specialist; is_booked kept in sync
CREATE OR REPLACE FUNCTION fn_video_slot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid UUID;
BEGIN
  SELECT s.specialist_id INTO sid FROM tbl_consultation_slots s WHERE s.id = NEW.slot_id;
  IF sid IS DISTINCT FROM NEW.specialist_id THEN
    RAISE EXCEPTION 'video consultation specialist must match the slot specialist' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_video_slot_booked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slot_id IS DISTINCT FROM NEW.slot_id THEN
    UPDATE tbl_consultation_slots s
       SET is_booked = EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.slot_id = OLD.slot_id AND v.is_active)
     WHERE s.id = OLD.slot_id;
  END IF;
  UPDATE tbl_consultation_slots s
     SET is_booked = EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.slot_id = NEW.slot_id AND v.is_active)
   WHERE s.id = NEW.slot_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_video_slot_guard ON tbl_video_consultations;
CREATE TRIGGER trg_video_slot_guard BEFORE INSERT OR UPDATE OF slot_id, specialist_id ON tbl_video_consultations
    FOR EACH ROW EXECUTE FUNCTION fn_video_slot_guard();
DROP TRIGGER IF EXISTS trg_video_slot_booked ON tbl_video_consultations;
CREATE TRIGGER trg_video_slot_booked AFTER INSERT OR UPDATE OF slot_id, is_active ON tbl_video_consultations
    FOR EACH ROW EXECUTE FUNCTION fn_video_slot_booked();

UPDATE tbl_consultation_slots s
   SET is_booked = EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.slot_id = s.id AND v.is_active);

-- 8. Escalations: task and referral must belong to the same patient
ALTER TABLE tbl_case_escalations ADD COLUMN IF NOT EXISTS patient_id UUID;
UPDATE tbl_case_escalations e
   SET patient_id = t.patient_id
  FROM tbl_followup_tasks t
 WHERE e.patient_id IS NULL AND t.id = e.task_id;
ALTER TABLE tbl_case_escalations ALTER COLUMN patient_id SET NOT NULL;
ALTER TABLE tbl_case_escalations DROP CONSTRAINT IF EXISTS tbl_case_escalations_task_id_fkey;
ALTER TABLE tbl_case_escalations DROP CONSTRAINT IF EXISTS tbl_case_escalations_referral_id_fkey;
ALTER TABLE tbl_case_escalations DROP CONSTRAINT IF EXISTS tbl_case_escalations_task_id_patient_id_fkey;
ALTER TABLE tbl_case_escalations DROP CONSTRAINT IF EXISTS tbl_case_escalations_referral_id_patient_id_fkey;
ALTER TABLE tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_task_id_patient_id_fkey
        FOREIGN KEY (task_id, patient_id) REFERENCES tbl_followup_tasks (id, patient_id),
    ADD CONSTRAINT tbl_case_escalations_referral_id_patient_id_fkey
        FOREIGN KEY (referral_id, patient_id) REFERENCES tbl_referrals (id, patient_id);

COMMIT;
