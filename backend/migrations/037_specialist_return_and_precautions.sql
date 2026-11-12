-- Specialist return-to-MO authorization + precaution duration tracking.
-- Additive only. Does not auto-close care cases. Idempotent.

-- Precaution duration (mirrors medicine duration pattern; never auto-closes cases).
ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS precautions_duration_days INT;

ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS precautions_expected_end_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_care_plan_precautions_duration'
  ) THEN
    ALTER TABLE tbl_care_plans
      ADD CONSTRAINT ck_care_plan_precautions_duration CHECK (
        precautions_duration_days IS NULL
        OR (precautions_duration_days >= 1 AND precautions_duration_days <= 365)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_care_plan_precautions_end'
  ) THEN
    ALTER TABLE tbl_care_plans
      ADD CONSTRAINT ck_care_plan_precautions_end CHECK (
        precautions_expected_end_date IS NULL
        OR treatment_start_date IS NULL
        OR precautions_expected_end_date >= treatment_start_date
      );
  END IF;
END $$;

COMMENT ON COLUMN tbl_care_plans.precautions_duration_days IS
  'Optional precaution follow-up duration in days. Expiry never auto-closes the case.';

-- Two-step return: Specialist authorizes, then MO confirms. Referral COMPLETED alone is insufficient.
CREATE TABLE IF NOT EXISTS tbl_care_return_to_mo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES tbl_patients(id),
  referral_id     UUID REFERENCES tbl_referrals(id),
  authorized_by   UUID NOT NULL REFERENCES tbl_users(id),
  authorized_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  confirmed_by    UUID REFERENCES tbl_users(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_care_return_confirm_pair CHECK (
    (confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_care_return_to_mo_pending_patient
  ON tbl_care_return_to_mo (patient_id)
  WHERE confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_care_return_to_mo_patient
  ON tbl_care_return_to_mo (patient_id, authorized_at DESC);

DROP TRIGGER IF EXISTS trg_care_return_authorizer_role ON tbl_care_return_to_mo;
CREATE TRIGGER trg_care_return_authorizer_role
  BEFORE INSERT OR UPDATE OF authorized_by ON tbl_care_return_to_mo
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('authorized_by', 'SPECIALIST');

DROP TRIGGER IF EXISTS trg_care_return_confirmer_role ON tbl_care_return_to_mo;
CREATE TRIGGER trg_care_return_confirmer_role
  BEFORE INSERT OR UPDATE OF confirmed_by ON tbl_care_return_to_mo
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('confirmed_by', 'MEDICAL_OFFICER');

INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT v.code, language.id, 'IN_APP', v.subject, v.body
  FROM (VALUES
    ('CARE_RETURN_AUTHORIZED', 'en', 'Return to MO authorized',
     'Specialist authorized return to Medical Officer community care. Confirm only after Specialist care is no longer active.'),
    ('CARE_RETURN_AUTHORIZED', 'te', 'MO కు తిరిగి రాక అనుమతి',
     'స్పెషలిస్ట్ వైద్య అధికారి కమ్యూనిటీ సంరక్షణకు తిరిగి రాకను అనుమతించారు. స్పెషలిస్ట్ సంరక్షణ క్రియాశీలంగా లేనప్పుడు మాత్రమే నిర్ధారించండి.')
  ) AS v(code, language_code, subject, body)
  JOIN mst_languages language ON language.code = v.language_code
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = v.code
      AND existing.language_id = language.id
      AND existing.channel = 'IN_APP'
 );
