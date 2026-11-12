-- Specialist care lifecycle ownership (Phase 1–9 gaps).
-- Additive only. Reuses tbl_care_plans / final reviews / navigator / HW workflows.
-- Does not auto-close cases. Does not duplicate appointment or video modules.
-- Idempotent: safe to re-run.

-- Clinical owner for SPECIALIST-sourced care plans (referring MO stays on responsible_mo_id).
ALTER TABLE tbl_care_plans
  ADD COLUMN IF NOT EXISTS responsible_specialist_id UUID REFERENCES tbl_users(id);

CREATE INDEX IF NOT EXISTS idx_care_plans_responsible_specialist
  ON tbl_care_plans (responsible_specialist_id)
  WHERE responsible_specialist_id IS NOT NULL;

COMMENT ON COLUMN tbl_care_plans.responsible_specialist_id IS
  'Specialist clinical owner when source=SPECIALIST. responsible_mo_id remains the referring Medical Officer for return-from-specialist.';

DROP TRIGGER IF EXISTS trg_care_plan_specialist_role ON tbl_care_plans;
CREATE TRIGGER trg_care_plan_specialist_role
  BEFORE INSERT OR UPDATE OF responsible_specialist_id ON tbl_care_plans
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('responsible_specialist_id', 'SPECIALIST');

-- Allow Specialist to sign final reviews on their plans (column name kept for reuse).
CREATE OR REPLACE FUNCTION fn_care_final_review_clinician_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE rcode TEXT;
BEGIN
  SELECT r.code INTO rcode
    FROM tbl_users u
    JOIN mst_roles r ON r.id = u.role_id
   WHERE u.id = NEW.medical_officer_id
     AND u.deleted_at IS NULL;
  IF rcode IS NULL OR rcode NOT IN ('MEDICAL_OFFICER', 'SPECIALIST') THEN
    RAISE EXCEPTION 'tbl_care_final_reviews.medical_officer_id must be MEDICAL_OFFICER or SPECIALIST, got %',
      COALESCE(rcode, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_care_final_review_mo_role ON tbl_care_final_reviews;
DROP TRIGGER IF EXISTS trg_care_final_review_clinician ON tbl_care_final_reviews;
CREATE TRIGGER trg_care_final_review_clinician
  BEFORE INSERT OR UPDATE OF medical_officer_id ON tbl_care_final_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_care_final_review_clinician_guard();

-- Backfill Specialist ownership on existing SPECIALIST plans.
UPDATE tbl_care_plans plan
   SET responsible_specialist_id = plan.created_by
  FROM tbl_users u
  JOIN mst_roles role ON role.id = u.role_id AND role.code = 'SPECIALIST'
 WHERE plan.source = 'SPECIALIST'
   AND plan.responsible_specialist_id IS NULL
   AND plan.created_by = u.id
   AND u.deleted_at IS NULL;

UPDATE tbl_care_plans plan
   SET responsible_specialist_id = r.assigned_specialist_id
  FROM tbl_referrals r
 WHERE plan.source = 'SPECIALIST'
   AND plan.responsible_specialist_id IS NULL
   AND plan.referral_id = r.id
   AND r.assigned_specialist_id IS NOT NULL;

-- Specialist may reassess and close their own care plans (API still scopes by ownership).
INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SPECIALIST'
   AND permission_row.code IN ('care.final_review', 'care.close')
ON CONFLICT (role_id, permission_id) DO NOTHING;
