-- Patient care lifecycle (community treatment / field follow-up).
-- Additive only: keeps tbl_screenings as the case and does not alter case_state enum.
-- Does NOT reuse tbl_treatment_linkages (oncology linkage) or tbl_followup_tasks
-- (Navigator-owned referral logistics). Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_plan_status') THEN
    CREATE TYPE care_plan_status AS ENUM (
      'AWAITING_NAVIGATOR',
      'FOLLOWUP_ACTIVE',
      'PATIENT_UNCOMFORTABLE',
      'MO_REASSESSMENT',
      'TREATMENT_COMPLETED',
      'FINAL_CHECKUP_PENDING',
      'RECOVERY_CONFIRMED',
      'CLOSED',
      'SUPERSEDED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_plan_source') THEN
    CREATE TYPE care_plan_source AS ENUM ('MO', 'SPECIALIST');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_followup_status') THEN
    CREATE TYPE care_followup_status AS ENUM (
      'SCHEDULED',
      'COMPLETED',
      'MISSED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_discomfort_status') THEN
    CREATE TYPE care_discomfort_status AS ENUM (
      'OPEN',
      'ESCALATED',
      'RESOLVED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_final_decision') THEN
    CREATE TYPE care_final_decision AS ENUM (
      'CLOSE_RECOVERED',
      'CONTINUE_TREATMENT',
      'REFER_SPECIALIST'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tbl_care_plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id            UUID NOT NULL REFERENCES tbl_screenings(id),
    patient_id              UUID NOT NULL REFERENCES tbl_patients(id),
    referral_id             UUID,
    source                  care_plan_source NOT NULL,
    status                  care_plan_status NOT NULL DEFAULT 'AWAITING_NAVIGATOR',
    plan_version            INT NOT NULL DEFAULT 1 CHECK (plan_version >= 1),
    supersedes_plan_id      UUID REFERENCES tbl_care_plans(id),
    responsible_mo_id       UUID NOT NULL REFERENCES tbl_users(id),
    assigned_navigator_id   UUID REFERENCES tbl_users(id),
    clinical_summary        TEXT NOT NULL,
    precautions             TEXT,
    treatment_start_date    DATE,
    expected_end_date       DATE,
    closed_at               TIMESTAMPTZ,
    closed_by               UUID REFERENCES tbl_users(id),
    created_by              UUID NOT NULL REFERENCES tbl_users(id),
    updated_by              UUID REFERENCES tbl_users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, patient_id),
    CONSTRAINT ck_care_plan_dates CHECK (
      expected_end_date IS NULL
      OR treatment_start_date IS NULL
      OR expected_end_date >= treatment_start_date
    ),
    CONSTRAINT ck_care_plan_closed CHECK (
      (status = 'CLOSED' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
      OR (status <> 'CLOSED' AND closed_at IS NULL)
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_care_plans_referral_patient'
  ) THEN
    ALTER TABLE tbl_care_plans
      ADD CONSTRAINT fk_care_plans_referral_patient
      FOREIGN KEY (referral_id, patient_id) REFERENCES tbl_referrals (id, patient_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_care_plans_active_screening
  ON tbl_care_plans (screening_id)
  WHERE status NOT IN ('CLOSED', 'SUPERSEDED');

CREATE INDEX IF NOT EXISTS idx_care_plans_navigator_status
  ON tbl_care_plans (assigned_navigator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_plans_mo_status
  ON tbl_care_plans (responsible_mo_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_plans_patient
  ON tbl_care_plans (patient_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tbl_care_plans_updated_at ON tbl_care_plans;
CREATE TRIGGER trg_tbl_care_plans_updated_at
  BEFORE UPDATE ON tbl_care_plans
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_care_plan_mo_role ON tbl_care_plans;
CREATE TRIGGER trg_care_plan_mo_role
  BEFORE INSERT OR UPDATE ON tbl_care_plans
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('responsible_mo_id', 'MEDICAL_OFFICER');

DROP TRIGGER IF EXISTS trg_care_plan_navigator_role ON tbl_care_plans;
CREATE TRIGGER trg_care_plan_navigator_role
  BEFORE INSERT OR UPDATE ON tbl_care_plans
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('assigned_navigator_id', 'NAVIGATOR');

CREATE TABLE IF NOT EXISTS tbl_care_plan_status_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      UUID NOT NULL REFERENCES tbl_care_plans(id),
    from_status  care_plan_status,
    to_status    care_plan_status NOT NULL,
    changed_by   UUID NOT NULL REFERENCES tbl_users(id),
    reason       TEXT,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_plan_status_history
  ON tbl_care_plan_status_history (plan_id, changed_at DESC);

DROP TRIGGER IF EXISTS trg_tbl_care_plan_status_history_append_only ON tbl_care_plan_status_history;
CREATE TRIGGER trg_tbl_care_plan_status_history_append_only
  BEFORE UPDATE OR DELETE ON tbl_care_plan_status_history
  FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

CREATE TABLE IF NOT EXISTS tbl_care_medicines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES tbl_care_plans(id),
    medicine_name   TEXT NOT NULL,
    dosage          TEXT NOT NULL,
    frequency       TEXT NOT NULL,
    duration_days   INT NOT NULL CHECK (duration_days > 0),
    precautions     TEXT,
    sort_order      INT NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID NOT NULL REFERENCES tbl_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_medicines_plan
  ON tbl_care_medicines (plan_id, sort_order)
  WHERE is_active IS TRUE;

DROP TRIGGER IF EXISTS trg_tbl_care_medicines_updated_at ON tbl_care_medicines;
CREATE TRIGGER trg_tbl_care_medicines_updated_at
  BEFORE UPDATE ON tbl_care_medicines
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS tbl_care_followup_schedules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES tbl_care_plans(id),
    patient_id       UUID NOT NULL REFERENCES tbl_patients(id),
    assigned_hw_id   UUID NOT NULL REFERENCES tbl_users(id),
    due_at           TIMESTAMPTZ NOT NULL,
    instructions     TEXT,
    status           care_followup_status NOT NULL DEFAULT 'SCHEDULED',
    created_by       UUID NOT NULL REFERENCES tbl_users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, patient_id)
);
CREATE INDEX IF NOT EXISTS idx_care_followup_hw_due
  ON tbl_care_followup_schedules (assigned_hw_id, due_at)
  WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS idx_care_followup_plan
  ON tbl_care_followup_schedules (plan_id, due_at);

DROP TRIGGER IF EXISTS trg_tbl_care_followup_schedules_updated_at ON tbl_care_followup_schedules;
CREATE TRIGGER trg_tbl_care_followup_schedules_updated_at
  BEFORE UPDATE ON tbl_care_followup_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_care_followup_hw_role ON tbl_care_followup_schedules;
CREATE TRIGGER trg_care_followup_hw_role
  BEFORE INSERT OR UPDATE ON tbl_care_followup_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('assigned_hw_id', 'HEALTH_WORKER');

CREATE TABLE IF NOT EXISTS tbl_care_followup_reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id           UUID NOT NULL,
    patient_id            UUID NOT NULL,
    reported_by           UUID NOT NULL REFERENCES tbl_users(id),
    visit_at              TIMESTAMPTZ NOT NULL,
    adhering_to_treatment BOOLEAN NOT NULL,
    patient_feedback      TEXT,
    reported_symptoms     TEXT,
    discomfort_present    BOOLEAN NOT NULL DEFAULT FALSE,
    notes                 TEXT,
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (schedule_id, patient_id)
      REFERENCES tbl_care_followup_schedules (id, patient_id),
    UNIQUE (schedule_id)
);
CREATE INDEX IF NOT EXISTS idx_care_followup_reports_patient
  ON tbl_care_followup_reports (patient_id, submitted_at DESC);

DROP TRIGGER IF EXISTS trg_care_followup_report_hw_role ON tbl_care_followup_reports;
CREATE TRIGGER trg_care_followup_report_hw_role
  BEFORE INSERT OR UPDATE ON tbl_care_followup_reports
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('reported_by', 'HEALTH_WORKER');

CREATE TABLE IF NOT EXISTS tbl_care_discomfort_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES tbl_care_plans(id),
    patient_id       UUID NOT NULL REFERENCES tbl_patients(id),
    reported_by      UUID NOT NULL REFERENCES tbl_users(id),
    issue_type       TEXT NOT NULL CHECK (issue_type IN (
                       'INCREASED_SYMPTOMS',
                       'MEDICINE_DISCOMFORT',
                       'NO_IMPROVEMENT',
                       'NEW_COMPLAINT',
                       'DIFFICULTY_FOLLOWING',
                       'OTHER'
                     )),
    severity         TEXT NOT NULL CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'EMERGENCY')),
    is_urgent        BOOLEAN NOT NULL DEFAULT FALSE,
    description      TEXT NOT NULL,
    status           care_discomfort_status NOT NULL DEFAULT 'OPEN',
    escalated_to_mo  UUID REFERENCES tbl_users(id),
    escalated_at     TIMESTAMPTZ,
    resolved_at      TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_discomfort_open
  ON tbl_care_discomfort_reports (plan_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_tbl_care_discomfort_reports_updated_at ON tbl_care_discomfort_reports;
CREATE TRIGGER trg_tbl_care_discomfort_reports_updated_at
  BEFORE UPDATE ON tbl_care_discomfort_reports
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_care_discomfort_hw_role ON tbl_care_discomfort_reports;
CREATE TRIGGER trg_care_discomfort_hw_role
  BEFORE INSERT OR UPDATE ON tbl_care_discomfort_reports
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('reported_by', 'HEALTH_WORKER');

CREATE TABLE IF NOT EXISTS tbl_care_final_reviews (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id              UUID NOT NULL REFERENCES tbl_care_plans(id),
    screening_id         UUID NOT NULL REFERENCES tbl_screenings(id),
    patient_id           UUID NOT NULL REFERENCES tbl_patients(id),
    medical_officer_id   UUID NOT NULL REFERENCES tbl_users(id),
    observations         TEXT NOT NULL,
    clinical_assessment  TEXT,
    recovery_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
    decision             care_final_decision NOT NULL,
    signed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (plan_id, signed_at)
);
CREATE INDEX IF NOT EXISTS idx_care_final_reviews_plan
  ON tbl_care_final_reviews (plan_id, signed_at DESC);

DROP TRIGGER IF EXISTS trg_care_final_review_mo_role ON tbl_care_final_reviews;
CREATE TRIGGER trg_care_final_review_mo_role
  BEFORE INSERT OR UPDATE ON tbl_care_final_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('medical_officer_id', 'MEDICAL_OFFICER');

-- Permissions
INSERT INTO mst_permissions (code, resource, action, description)
SELECT v.code, v.resource, v.action, v.description
  FROM (VALUES
    ('care.plan_manage', 'care', 'manage', 'Create and update community care treatment plans'),
    ('care.followup_assign', 'care', 'assign', 'Assign Health Worker field follow-ups'),
    ('care.followup_report', 'care', 'report', 'Submit Health Worker follow-up reports'),
    ('care.discomfort_report', 'care', 'escalate', 'Report patient discomfort during treatment'),
    ('care.final_review', 'care', 'review', 'Perform Medical Officer final checkup'),
    ('care.close', 'care', 'close', 'Close a care plan after recovery confirmation')
  ) AS v(code, resource, action, description)
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions p WHERE p.code = v.code);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE (
        (role_row.code = 'MEDICAL_OFFICER' AND permission_row.code IN (
          'care.plan_manage', 'care.final_review', 'care.close', 'care.followup_assign'
        ))
     OR (role_row.code = 'SPECIALIST' AND permission_row.code IN (
          'care.plan_manage'
        ))
     OR (role_row.code = 'NAVIGATOR' AND permission_row.code IN (
          'care.followup_assign'
        ))
     OR (role_row.code = 'HEALTH_WORKER' AND permission_row.code IN (
          'care.followup_report', 'care.discomfort_report'
        ))
       )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Notification templates (no diagnosis / clinical secrets in body)
INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT t.code, l.id, 'IN_APP'::notification_channel, t.subject, t.body
  FROM (VALUES
    ('CARE_PLAN_READY', 'en', 'Care plan ready', 'A treatment plan is ready for follow-up coordination.'),
    ('CARE_PLAN_READY', 'te', 'చికిత్స ప్రణాళిక సిద్ధం', 'ఫాలో-అప్ సమన్వయం కోసం చికిత్స ప్రణాళిక సిద్ధంగా ఉంది.'),
    ('CARE_FOLLOWUP_ASSIGNED', 'en', 'Follow-up assigned', 'A patient follow-up visit has been assigned to you.'),
    ('CARE_FOLLOWUP_ASSIGNED', 'te', 'ఫాలో-అప్ కేటాయించబడింది', 'రోగి ఫాలో-అప్ సందర్శన మీకు కేటాయించబడింది.'),
    ('CARE_FOLLOWUP_SUBMITTED', 'en', 'Follow-up report received', 'A Health Worker submitted a follow-up report.'),
    ('CARE_FOLLOWUP_SUBMITTED', 'te', 'ఫాలో-అప్ నివేదిక వచ్చింది', 'ఆరోగ్య కార్యకర్త ఫాలో-అప్ నివేదిక సమర్పించారు.'),
    ('CARE_DISCOMFORT_ALERT', 'en', 'Patient discomfort alert', 'A patient discomfort report needs attention.'),
    ('CARE_DISCOMFORT_ALERT', 'te', 'రోగి అసౌకర్య హెచ్చరిక', 'రోగి అసౌకర్య నివేదికకు దృష్టి అవసరం.'),
    ('CARE_FINAL_CHECKUP', 'en', 'Final checkup pending', 'A patient is ready for Medical Officer final checkup.'),
    ('CARE_FINAL_CHECKUP', 'te', 'చివరి పరీక్ష పెండింగ్', 'రోగి వైద్య అధికారి చివరి పరీక్షకు సిద్ధం.'),
    ('CARE_CASE_CLOSED', 'en', 'Case closed', 'A patient care case was closed after final review.'),
    ('CARE_CASE_CLOSED', 'te', 'కేసు మూసివేయబడింది', 'చివరి సమీక్ష తర్వాత రోగి సంరక్షణ కేసు మూసివేయబడింది.')
  ) AS t(code, lang, subject, body)
  JOIN mst_languages l ON l.code = t.lang
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = t.code
      AND existing.language_id = l.id
      AND existing.channel = 'IN_APP'
 );
