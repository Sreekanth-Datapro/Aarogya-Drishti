-- 027_case_transition_allowed.sql
-- Non-destructive: extracts the case_state transition matrix into a reusable
-- function so application code can ask the same question as the trigger
-- (fn_check_case_transition) without bypassing database rules.
-- Does not change patient data, drop tables, or alter historical migrations.

BEGIN;

CREATE OR REPLACE FUNCTION fn_case_transition_allowed(from_state text, to_state text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF from_state IS NULL OR to_state IS NULL THEN
    RETURN FALSE;
  END IF;
  IF from_state IS NOT DISTINCT FROM to_state THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
      SELECT 1 FROM (VALUES
        ('DRAFT','CONSENTED'),('DRAFT','CLOSED'),('CONSENTED','SCREENED'),
        ('SCREENED','AWAITING_CLINICIAN'),('SCREENED','CLOSED'),
        ('AWAITING_CLINICIAN','REVIEWED'),('AWAITING_CLINICIAN','SCREENED'),
        ('REVIEWED','REFERRAL_PLANNED'),('REVIEWED','CLOSED'),
        ('REFERRAL_PLANNED','APPOINTED'),('APPOINTED','ASSESSED'),
        ('ASSESSED','DIAGNOSTICS_PENDING'),('ASSESSED','CLOSED'),
        ('DIAGNOSTICS_PENDING','RESULT_REVIEWED'),
        ('RESULT_REVIEWED','CARE_LINKED'),('RESULT_REVIEWED','DIAGNOSTICS_PENDING'),('RESULT_REVIEWED','CLOSED'),
        ('CARE_LINKED','CLOSED')
      ) AS t(a, b)
      WHERE a = from_state AND b = to_state)
    OR (to_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND from_state NOT IN ('DRAFT','CLOSED'))
    OR (from_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND to_state IN ('REFERRAL_PLANNED','APPOINTED','ASSESSED','DIAGNOSTICS_PENDING',
                         'RESULT_REVIEWED','CARE_LINKED','CLOSED','LOST_CONTACT'));
END;
$$;

COMMENT ON FUNCTION fn_case_transition_allowed(text, text) IS
  'Shared case_state transition matrix used by fn_check_case_transition and care lifecycle screening sync.';

-- Keep the trigger behavior identical; only the matrix lookup is shared.
CREATE OR REPLACE FUNCTION fn_check_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok BOOLEAN;
BEGIN
  IF NEW.case_state IS NOT DISTINCT FROM OLD.case_state THEN RETURN NEW; END IF;

  ok := fn_case_transition_allowed(OLD.case_state::text, NEW.case_state::text);

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

COMMIT;
