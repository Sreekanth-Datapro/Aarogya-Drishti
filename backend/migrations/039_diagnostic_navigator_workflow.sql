-- Diagnostic Navigator-centered coordination workflow.
-- Additive only. Does not remove existing diagnostic order/appointment/report tables.
-- Idempotent: safe to re-run. Do not apply from this agent session without operator approval.

-- Workflow statuses (fine-grained handoff states). Coarse mst_investigation_statuses remain.
ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'SPECIALIST_REQUESTED';

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS assigned_health_worker_id UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS requested_date DATE;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS collection_scan_date DATE;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS collection_centre TEXT;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS collection_notes TEXT;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS returned_reason TEXT;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS forwarded_to_hs_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS forwarded_to_hs_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS routed_to_specialist_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS routed_to_specialist_at TIMESTAMPTZ;

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS advice_forwarded_to_hw_by UUID REFERENCES tbl_users(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS advice_forwarded_to_hw_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diagnostic_order_workflow_status'
  ) THEN
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
          'COMPLETED',
          'RETURNED_FOR_CORRECTION',
          'ADDITIONAL_INFORMATION_REQUIRED',
          'CANCELLED'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_workflow
  ON tbl_diagnostic_orders (workflow_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_assigned_hw
  ON tbl_diagnostic_orders (assigned_health_worker_id, created_at DESC)
  WHERE assigned_health_worker_id IS NOT NULL;

-- Expand report review states for Navigator return/verify.
ALTER TABLE tbl_diagnostic_order_reports
  DROP CONSTRAINT IF EXISTS tbl_diagnostic_order_reports_review_status_check;

ALTER TABLE tbl_diagnostic_order_reports
  ADD CONSTRAINT tbl_diagnostic_order_reports_review_status_check
  CHECK (review_status IN ('PENDING', 'RETURNED', 'VERIFIED', 'REVIEWED'));

ALTER TABLE tbl_diagnostic_order_reports
  ADD COLUMN IF NOT EXISTS scan_date DATE;

ALTER TABLE tbl_diagnostic_order_reports
  ADD COLUMN IF NOT EXISTS diagnostic_centre TEXT;

ALTER TABLE tbl_diagnostic_order_reports
  ADD COLUMN IF NOT EXISTS collection_notes TEXT;

-- Signed Specialist advice after diagnostic review (immutable once signed).
CREATE TABLE IF NOT EXISTS tbl_diagnostic_advice (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES tbl_diagnostic_orders(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES tbl_patients(id),
  specialist_id         UUID NOT NULL REFERENCES tbl_users(id),
  findings              TEXT NOT NULL,
  precautions           TEXT,
  treatment_advice      TEXT,
  medicine_name         TEXT,
  dosage                TEXT,
  duration_text         TEXT,
  follow_up_instructions TEXT,
  additional_diagnostics_needed BOOLEAN NOT NULL DEFAULT FALSE,
  additional_diagnostics_notes TEXT,
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'SIGNED')),
  signed_by             UUID REFERENCES tbl_users(id),
  signed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id),
  CONSTRAINT ck_diagnostic_advice_signed CHECK (
    (status = 'DRAFT' AND signed_by IS NULL AND signed_at IS NULL)
    OR (status = 'SIGNED' AND signed_by IS NOT NULL AND signed_at IS NOT NULL)
  ),
  FOREIGN KEY (order_id, patient_id) REFERENCES tbl_diagnostic_orders (id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_advice_patient
  ON tbl_diagnostic_advice (patient_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tbl_diagnostic_advice_updated_at ON tbl_diagnostic_advice;
CREATE TRIGGER trg_tbl_diagnostic_advice_updated_at
  BEFORE UPDATE ON tbl_diagnostic_advice
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_diagnostic_advice_specialist_role ON tbl_diagnostic_advice;
CREATE TRIGGER trg_diagnostic_advice_specialist_role
  BEFORE INSERT OR UPDATE ON tbl_diagnostic_advice
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('specialist_id', 'SPECIALIST');

-- HW patient follow-up after Navigator forwards signed advice.
CREATE TABLE IF NOT EXISTS tbl_diagnostic_advice_followups (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advice_id             UUID NOT NULL REFERENCES tbl_diagnostic_advice(id) ON DELETE CASCADE,
  order_id              UUID NOT NULL REFERENCES tbl_diagnostic_orders(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES tbl_patients(id),
  health_worker_id      UUID NOT NULL REFERENCES tbl_users(id),
  patient_acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
  followup_date         DATE,
  outcome_notes         TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, patient_id) REFERENCES tbl_diagnostic_orders (id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_advice_followups_order
  ON tbl_diagnostic_advice_followups (order_id, created_at DESC);

-- Imaging test seeds for Specialist requests.
INSERT INTO mst_diagnostic_tests (category_id, code, name_en, name_te, default_fasting)
SELECT category.id, v.code, v.name_en, v.name_te, v.default_fasting
  FROM (VALUES
    ('IMAGING', 'MRI_BRAIN', 'MRI Brain', 'ఎంఆర్‌ఐ మెదడు', TRUE),
    ('IMAGING', 'MRI_SPINE', 'MRI Spine', 'ఎంఆర్‌ఐ వెన్నెముక', TRUE),
    ('IMAGING', 'MRI_OTHER', 'MRI Other', 'ఎంఆర్‌ఐ ఇతర', TRUE),
    ('IMAGING', 'XRAY', 'X-Ray', 'ఎక్స్-రే', FALSE),
    ('IMAGING', 'ULTRASOUND', 'Ultrasound', 'అల్ట్రాసౌండ్', FALSE)
  ) AS v(category_code, code, name_en, name_te, default_fasting)
  JOIN mst_diagnostic_categories category ON category.code = v.category_code
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_diagnostic_tests existing WHERE existing.code = v.code
 );

-- Permissions for coordination handoffs.
INSERT INTO mst_permissions (code, resource, action, description)
SELECT v.code, v.resource, v.action, v.description
  FROM (VALUES
    ('diagnostic.assign_hw', 'diagnostic', 'assign', 'Navigator assigns diagnostic collection to Health Worker'),
    ('diagnostic.verify', 'diagnostic', 'verify', 'Navigator verifies uploaded diagnostic reports'),
    ('diagnostic.forward_hs', 'diagnostic', 'forward', 'Navigator forwards verified reports to Hospital Staff'),
    ('diagnostic.route_specialist', 'diagnostic', 'route', 'Hospital Staff routes reports to authorized Specialist'),
    ('diagnostic.advice_sign', 'diagnostic', 'advice', 'Specialist signs diagnostic treatment advice'),
    ('diagnostic.advice_forward', 'diagnostic', 'forward_advice', 'Navigator forwards signed advice to Health Worker'),
    ('diagnostic.patient_followup', 'diagnostic', 'patient_followup', 'Health Worker records patient follow-up on signed advice')
  ) AS v(code, resource, action, description)
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_permissions existing WHERE existing.code = v.code
 );

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'NAVIGATOR'
   AND permission_row.code IN (
     'diagnostic.assign_hw', 'diagnostic.verify', 'diagnostic.forward_hs', 'diagnostic.advice_forward'
   )
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'HOSPITAL_STAFF'
   AND permission_row.code = 'diagnostic.route_specialist'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'SPECIALIST'
   AND permission_row.code = 'diagnostic.advice_sign'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'HEALTH_WORKER'
   AND permission_row.code = 'diagnostic.patient_followup'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Notification templates for each handoff.
INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT v.code, language.id, 'IN_APP', v.subject, v.body
  FROM (VALUES
    ('DIAGNOSTIC_NAV_ASSIGN_HW', 'en', 'Diagnostic collection assigned',
     'Navigator assigned a diagnostic collection task to you.'),
    ('DIAGNOSTIC_NAV_ASSIGN_HW', 'te', 'డయాగ్నస్టిక్ సేకరణ కేటాయించబడింది',
     'నావిగేటర్ మీకు డయాగ్నస్టిక్ సేకరణ పని కేటాయించారు.'),
    ('DIAGNOSTIC_RETURNED', 'en', 'Diagnostic submission returned',
     'Navigator returned a diagnostic submission for correction.'),
    ('DIAGNOSTIC_RETURNED', 'te', 'డయాగ్నస్టిక్ సమర్పణ తిరిగి పంపబడింది',
     'నావిగేటర్ డయాగ్నస్టిక్ సమర్పణను సరిదిద్దడానికి తిరిగి పంపారు.'),
    ('DIAGNOSTIC_FORWARDED_HS', 'en', 'Diagnostic report for Hospital Staff',
     'Navigator forwarded a verified diagnostic report for Specialist routing.'),
    ('DIAGNOSTIC_FORWARDED_HS', 'te', 'ఆసుపత్రి సిబ్బందికి డయాగ్నస్టిక్ నివేదిక',
     'నావిగేటర్ ధృవీకరించిన డయాగ్నస్టిక్ నివేదికను స్పెషలిస్ట్ మార్గానికి పంపారు.'),
    ('DIAGNOSTIC_ROUTED_SPECIALIST', 'en', 'Diagnostic report awaiting your review',
     'Hospital Staff routed a diagnostic report for your clinical review.'),
    ('DIAGNOSTIC_ROUTED_SPECIALIST', 'te', 'మీ సమీక్ష కోసం డయాగ్నస్టిక్ నివేదిక',
     'ఆసుపత్రి సిబ్బంది డయాగ్నస్టిక్ నివేదికను మీ వైద్య సమీక్షకు పంపారు.'),
    ('DIAGNOSTIC_ADVICE_SIGNED', 'en', 'Specialist diagnostic advice signed',
     'Specialist signed diagnostic advice. Forward instructions to the Health Worker.'),
    ('DIAGNOSTIC_ADVICE_SIGNED', 'te', 'స్పెషలిస్ట్ సలహా సంతకం అయింది',
     'స్పెషలిస్ట్ డయాగ్నస్టిక్ సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు సూచనలు పంపండి.'),
    ('DIAGNOSTIC_ADVICE_TO_HW', 'en', 'Specialist advice for patient follow-up',
     'Navigator forwarded signed Specialist advice for patient communication.'),
    ('DIAGNOSTIC_ADVICE_TO_HW', 'te', 'రోగి ఫాలో-అప్ కోసం స్పెషలిస్ట్ సలహా',
     'నావిగేటర్ సంతకం చేసిన స్పెషలిస్ట్ సలహాను రోగి సంప్రదింపు కోసం పంపారు.'),
    ('DIAGNOSTIC_FOLLOWUP_DONE', 'en', 'Diagnostic patient follow-up recorded',
     'Health Worker recorded patient acknowledgement of Specialist advice.'),
    ('DIAGNOSTIC_FOLLOWUP_DONE', 'te', 'డయాగ్నస్టిక్ రోగి ఫాలో-అప్ నమోదు',
     'ఆరోగ్య కార్యకర్త స్పెషలిస్ట్ సలహా రోగి అంగీకారాన్ని నమోదు చేశారు.')
  ) AS v(code, language_code, subject, body)
  JOIN mst_languages language ON language.code = v.language_code
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = v.code
      AND existing.language_id = language.id
      AND existing.channel = 'IN_APP'
 );

-- Backfill existing orders into Navigator-received state when still ADVISED.
UPDATE tbl_diagnostic_orders diagnostic_order
   SET workflow_status = 'NAVIGATOR_RECEIVED'
  FROM mst_investigation_statuses status
 WHERE status.id = diagnostic_order.status_id
   AND status.code = 'ADVISED'
   AND diagnostic_order.workflow_status = 'SPECIALIST_REQUESTED';
