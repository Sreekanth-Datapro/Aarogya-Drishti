-- Care follow-up / MO reassessment: hospital revisit tracking and urgent outcome.
-- Additive only. Does not auto-close cases when medicine duration ends.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'care_final_decision'
       AND e.enumlabel = 'URGENT_ESCALATION'
  ) THEN
    ALTER TYPE care_final_decision ADD VALUE 'URGENT_ESCALATION';
  END IF;
END $$;

ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_revisit_date DATE;

ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS patient_informed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_revisit_scheduled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_attended BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_care_plan_revisit_dates'
  ) THEN
    ALTER TABLE tbl_care_plans
      ADD CONSTRAINT ck_care_plan_revisit_dates CHECK (
        hospital_revisit_date IS NULL
        OR treatment_start_date IS NULL
        OR hospital_revisit_date >= treatment_start_date
      );
  END IF;
END $$;

ALTER TABLE tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS improvement_noted BOOLEAN;

ALTER TABLE tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS side_effects TEXT;

ALTER TABLE tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS hospital_attended BOOLEAN;

ALTER TABLE tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS hospital_revisit_reminded BOOLEAN NOT NULL DEFAULT FALSE;

-- One active (SCHEDULED) follow-up task per care plan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_care_followup_active_plan
  ON tbl_care_followup_schedules (plan_id)
  WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_care_plans_revisit_date
  ON tbl_care_plans (hospital_revisit_date)
  WHERE hospital_revisit_date IS NOT NULL
    AND status NOT IN ('CLOSED', 'SUPERSEDED');
