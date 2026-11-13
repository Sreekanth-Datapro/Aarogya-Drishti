-- Diagnostic Specialist follow-up / reassessment / closure cycle.
-- Extends migration 039. Forward-only and idempotent.
-- Do not apply from this agent session without operator approval.

-- ---------------------------------------------------------------------------
-- 1. Expand workflow_status CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE tbl_diagnostic_orders
  DROP CONSTRAINT IF EXISTS ck_diagnostic_order_workflow_status;

ALTER TABLE tbl_diagnostic_orders
  ADD CONSTRAINT ck_diagnostic_order_workflow_status CHECK (
    workflow_status IN (
      'SPECIALIST_REQUESTED',
      'NAVIGATOR_RECEIVED',
      'ASSIGNED_TO_HEALTH_WORKER',
      'COLLECTION_IN_PROGRESS',
      'REPORT_UPLOADED',
      'NAVIGATOR_VERIFICATION',
      'SENT_TO_HOSPITAL_STAFF',
      'SPECIALIST_REVIEW_PENDING',
      'SPECIALIST_REVIEWED',
      'ADVICE_SENT_TO_NAVIGATOR',
      'SENT_TO_HEALTH_WORKER',
      'PATIENT_FOLLOWUP',
      'FOLLOWUP_REPORT_SUBMITTED',
      'FOLLOWUP_RETURNED',
      'REASSESSMENT_PENDING',
      'FOLLOWUP_REQUIRED',
      'VIDEO_CONSULTATION_REQUESTED',
      'COMPLETED',
      'CLOSED',
      'RETURNED_FOR_CORRECTION',
      'ADDITIONAL_INFORMATION_REQUIRED',
      'CANCELLED'
    )
  );

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS followup_forwarded_to_specialist_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS followup_forwarded_to_specialist_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS case_closed_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS case_closed_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS case_closure_reason TEXT;

-- ---------------------------------------------------------------------------
-- 2. Advice versions (drop single-row UNIQUE(order_id))
-- ---------------------------------------------------------------------------
ALTER TABLE tbl_diagnostic_advice
  DROP CONSTRAINT IF EXISTS tbl_diagnostic_advice_order_id_key;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS supersedes_advice_id UUID REFERENCES tbl_diagnostic_advice(id);

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS follow_up_due_date DATE;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS reassessment_instructions TEXT;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

ALTER TABLE tbl_diagnostic_advice
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES tbl_users(id);

UPDATE tbl_diagnostic_advice
   SET created_by = COALESCE(created_by, specialist_id)
 WHERE created_by IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_diagnostic_advice_order_version'
  ) THEN
    ALTER TABLE tbl_diagnostic_advice
      ADD CONSTRAINT uq_diagnostic_advice_order_version UNIQUE (order_id, version_no);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_advice_current_per_order
  ON tbl_diagnostic_advice (order_id)
  WHERE is_current IS TRUE;

CREATE INDEX IF NOT EXISTS idx_diagnostic_advice_follow_up_due
  ON tbl_diagnostic_advice (follow_up_due_date)
  WHERE is_current IS TRUE AND follow_up_required IS TRUE AND follow_up_due_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Rich follow-up reports
-- ---------------------------------------------------------------------------
ALTER TABLE tbl_diagnostic_advice_followups
  ALTER COLUMN outcome_notes DROP NOT NULL;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS patient_contacted BOOLEAN;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS symptoms_status TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS improvement_status TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS advice_followed BOOLEAN;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS medicine_adherence TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS new_problems TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS specialist_review_needed BOOLEAN;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS followup_notes TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS cycle_no INT NOT NULL DEFAULT 1;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS return_reason TEXT;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS forwarded_to_specialist_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS forwarded_to_specialist_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_advice_followups
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diagnostic_advice_followup_status'
  ) THEN
    ALTER TABLE tbl_diagnostic_advice_followups
      ADD CONSTRAINT ck_diagnostic_advice_followup_status
      CHECK (status IN ('DRAFT', 'SUBMITTED', 'RETURNED', 'FORWARDED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diagnostic_advice_followup_improvement'
  ) THEN
    ALTER TABLE tbl_diagnostic_advice_followups
      ADD CONSTRAINT ck_diagnostic_advice_followup_improvement
      CHECK (
        improvement_status IS NULL
        OR improvement_status IN ('Improved', 'No Change', 'Worsened')
      );
  END IF;
END $$;

-- Existing rows predate draft workflow; treat as submitted.
UPDATE tbl_diagnostic_advice_followups
   SET status = 'SUBMITTED',
       submitted_at = COALESCE(submitted_at, created_at)
 WHERE status IS NULL OR (status = 'SUBMITTED' AND submitted_at IS NULL AND outcome_notes IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_followup_idempotency
  ON tbl_diagnostic_advice_followups (order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_followup_open_draft
  ON tbl_diagnostic_advice_followups (order_id, advice_id)
  WHERE status IN ('DRAFT', 'RETURNED');

CREATE INDEX IF NOT EXISTS idx_diagnostic_followups_status
  ON tbl_diagnostic_advice_followups (order_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_tbl_diagnostic_advice_followups_updated_at ON tbl_diagnostic_advice_followups;
CREATE TRIGGER trg_tbl_diagnostic_advice_followups_updated_at
  BEFORE UPDATE ON tbl_diagnostic_advice_followups
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Permissions
-- ---------------------------------------------------------------------------
INSERT INTO mst_permissions (code, resource, action, description)
SELECT v.code, v.resource, v.action, v.description
  FROM (VALUES
    ('diagnostic.followup_verify', 'diagnostic', 'followup_verify', 'Navigator verifies or returns Health Worker follow-up reports'),
    ('diagnostic.reassess', 'diagnostic', 'reassess', 'Specialist reassesses after follow-up and continues or updates advice'),
    ('diagnostic.case_close', 'diagnostic', 'case_close', 'Specialist closes diagnostic follow-up case with documented reason')
  ) AS v(code, resource, action, description)
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_permissions existing WHERE existing.code = v.code
 );

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'NAVIGATOR'
   AND permission_row.code = 'diagnostic.followup_verify'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SPECIALIST'
   AND permission_row.code IN ('diagnostic.reassess', 'diagnostic.case_close', 'diagnostic.advice_sign')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Notification templates
-- ---------------------------------------------------------------------------
INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT v.code, language.id, 'IN_APP', v.subject, v.body
  FROM (VALUES
    ('DIAGNOSTIC_FOLLOWUP_RETURNED', 'en', 'Follow-up report returned',
     'Navigator returned a patient follow-up report for correction.'),
    ('DIAGNOSTIC_FOLLOWUP_RETURNED', 'te', 'ఫాలో-అప్ నివేదిక తిరిగి పంపబడింది',
     'నావిగేటర్ రోగి ఫాలో-అప్ నివేదికను సరిదిద్దడానికి తిరిగి పంపారు.'),
    ('DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 'en', 'Follow-up ready for reassessment',
     'Navigator forwarded a verified patient follow-up for Specialist reassessment.'),
    ('DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 'te', 'పునఃసమీక్ష కోసం ఫాలో-అప్',
     'నావిగేటర్ ధృవీకరించిన రోగి ఫాలో-అప్‌ను స్పెషలిస్ట్ పునఃసమీక్షకు పంపారు.'),
    ('DIAGNOSTIC_REASSESSMENT_ADVICE', 'en', 'Updated Specialist advice after reassessment',
     'Specialist signed updated advice after reassessment. Forward to Health Worker.'),
    ('DIAGNOSTIC_REASSESSMENT_ADVICE', 'te', 'పునఃసమీక్ష తర్వాత నవీకరించిన సలహా',
     'స్పెషలిస్ట్ పునఃసమీక్ష తర్వాత నవీకరించిన సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు పంపండి.'),
    ('DIAGNOSTIC_FOLLOWUP_DUE', 'en', 'Patient follow-up due',
     'A Specialist-defined patient follow-up is due.'),
    ('DIAGNOSTIC_FOLLOWUP_DUE', 'te', 'రోగి ఫాలో-అప్ గడువు',
     'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు వచ్చింది.'),
    ('DIAGNOSTIC_FOLLOWUP_OVERDUE', 'en', 'Patient follow-up overdue',
     'A Specialist-defined patient follow-up is overdue. Contact the patient and submit the report.'),
    ('DIAGNOSTIC_FOLLOWUP_OVERDUE', 'te', 'రోగి ఫాలో-అప్ గడువు దాటింది',
     'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు దాటింది. రోగిని సంప్రదించి నివేదిక సమర్పించండి.'),
    ('DIAGNOSTIC_CASE_CLOSED', 'en', 'Diagnostic follow-up case closed',
     'Specialist closed the diagnostic follow-up case. No further follow-up is required.'),
    ('DIAGNOSTIC_CASE_CLOSED', 'te', 'డయాగ్నస్టిక్ ఫాలో-అప్ కేసు మూసివేయబడింది',
     'స్పెషలిస్ట్ డయాగ్నస్టిక్ ఫాలో-అప్ కేసును మూసివేశారు. మరిన్ని ఫాలో-అప్‌లు అవసరం లేదు.')
  ) AS v(code, language_code, subject, body)
  JOIN mst_languages language ON language.code = v.language_code
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = v.code
      AND existing.language_id = language.id
      AND existing.channel = 'IN_APP'
 );
