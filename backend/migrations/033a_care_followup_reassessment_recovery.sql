-- =============================================================================
-- Recovery for partially applied 033_care_followup_reassessment.sql
-- Database: Aarogya  |  Schema: public
-- Idempotent. Additive only. Preserves existing rows.
-- Does NOT recreate uq_care_followup_active_plan (already EXISTS).
-- Do NOT re-run the full 033 migration.
--
-- EXECUTION ORDER (required):
--   Step 1  — enum only, then COMMIT (PostgreSQL cannot use a new enum
--             label in the same transaction that adds it; run/commit first).
--   Step 2  — columns, check constraint, index (separate transaction).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 of 2 — care_final_decision.URGENT_ESCALATION
-- Run this block alone, then COMMIT before Step 2.
-- ---------------------------------------------------------------------------
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

-- COMMIT;   -- if your client wraps scripts in a transaction, commit here.


-- ---------------------------------------------------------------------------
-- STEP 2 of 2 — missing columns, constraint, index
-- Run only after Step 1 has committed.
-- ---------------------------------------------------------------------------

-- 2a) tbl_care_plans columns (exact definitions from 033)
ALTER TABLE public.tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_revisit_date DATE;

ALTER TABLE public.tbl_care_plans
  ADD COLUMN IF NOT EXISTS patient_informed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_revisit_scheduled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tbl_care_plans
  ADD COLUMN IF NOT EXISTS hospital_attended BOOLEAN;

-- 2b) CHECK constraint (exact definition from 033)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_care_plan_revisit_dates'
       AND conrelid = 'public.tbl_care_plans'::regclass
  ) THEN
    ALTER TABLE public.tbl_care_plans
      ADD CONSTRAINT ck_care_plan_revisit_dates CHECK (
        hospital_revisit_date IS NULL
        OR treatment_start_date IS NULL
        OR hospital_revisit_date >= treatment_start_date
      );
  END IF;
END $$;

-- 2c) tbl_care_followup_reports columns (exact definitions from 033)
ALTER TABLE public.tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS improvement_noted BOOLEAN;

ALTER TABLE public.tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS side_effects TEXT;

ALTER TABLE public.tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS hospital_attended BOOLEAN;

ALTER TABLE public.tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS hospital_revisit_reminded BOOLEAN NOT NULL DEFAULT FALSE;

-- 2d) Partial index on care plans (exact definition from 033)
CREATE INDEX IF NOT EXISTS idx_care_plans_revisit_date
  ON public.tbl_care_plans (hospital_revisit_date)
  WHERE hospital_revisit_date IS NOT NULL
    AND status NOT IN ('CLOSED', 'SUPERSEDED');

-- Explicitly omitted (already EXISTS):
--   CREATE UNIQUE INDEX uq_care_followup_active_plan
--     ON tbl_care_followup_schedules (plan_id)
--     WHERE status = 'SCHEDULED';
