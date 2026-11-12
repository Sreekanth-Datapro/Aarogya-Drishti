-- Diagnostic order report upload + care duration/precaution follow-up fields.
-- Additive only. Does not auto-close care plans when duration ends.
-- Idempotent: safe to re-run.

ALTER TABLE tbl_care_followup_reports
  ADD COLUMN IF NOT EXISTS precautions_followed BOOLEAN;

ALTER TABLE tbl_care_medicines
  ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE tbl_care_medicines
  ADD COLUMN IF NOT EXISTS expected_end_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_care_medicine_dates'
  ) THEN
    ALTER TABLE tbl_care_medicines
      ADD CONSTRAINT ck_care_medicine_dates CHECK (
        expected_end_date IS NULL
        OR start_date IS NULL
        OR expected_end_date >= start_date
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tbl_diagnostic_order_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES tbl_diagnostic_orders(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES tbl_patients(id),
  report_key        TEXT NOT NULL,
  checksum_sha256   TEXT NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type         TEXT NOT NULL CHECK (mime_type IN (
                      'application/pdf', 'image/jpeg', 'image/png'
                    )),
  original_filename TEXT,
  file_size_bytes   INT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  uploaded_by       UUID NOT NULL REFERENCES tbl_users(id),
  review_status     TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (review_status IN ('PENDING', 'REVIEWED')),
  reviewed_by       UUID REFERENCES tbl_users(id),
  reviewed_at       TIMESTAMPTZ,
  clinical_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_diagnostic_order_report_key UNIQUE (report_key),
  CONSTRAINT ck_diagnostic_report_key_private CHECK (report_key !~* '^(https?:)?//')
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_order_reports_order
  ON tbl_diagnostic_order_reports (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_order_reports_patient
  ON tbl_diagnostic_order_reports (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_order_reports_pending
  ON tbl_diagnostic_order_reports (review_status, created_at DESC)
  WHERE review_status = 'PENDING';

INSERT INTO mst_permissions (code, resource, action, description)
SELECT v.code, v.resource, v.action, v.description
  FROM (VALUES
    ('diagnostic.report_upload', 'diagnostic', 'upload', 'Upload diagnostic order reports (PDF/JPG/PNG)'),
    ('diagnostic.report_review', 'diagnostic', 'review', 'Review uploaded diagnostic order reports')
  ) AS v(code, resource, action, description)
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_permissions existing WHERE existing.code = v.code
 );

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN ('HEALTH_WORKER', 'HOSPITAL_STAFF')
   AND permission_row.code = 'diagnostic.report_upload'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN ('MEDICAL_OFFICER', 'SPECIALIST')
   AND permission_row.code = 'diagnostic.report_review'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code IN (
     'NAVIGATOR', 'MEDICAL_OFFICER', 'SPECIALIST', 'HEALTH_WORKER',
     'HOSPITAL_STAFF', 'SYSTEM_ADMIN', 'SUPER_ADMIN'
   )
   AND permission_row.code = 'diagnostic.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT v.code, language.id, 'IN_APP', v.subject, v.body
  FROM (VALUES
    ('DIAGNOSTIC_REPORT_UPLOADED', 'en', 'Diagnostic report uploaded',
     'A diagnostic report was uploaded and is ready for review.'),
    ('DIAGNOSTIC_REPORT_UPLOADED', 'te', 'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది',
     'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది. సమీక్షకు సిద్ధం.'),
    ('CARE_DURATION_DUE', 'en', 'Treatment or revisit due',
     'A patient treatment duration or hospital revisit date is due. Coordinate follow-up; do not close the case.'),
    ('CARE_DURATION_DUE', 'te', 'చికిత్స లేదా రీవిజిట్ గడువు',
     'రోగి చికిత్స వ్యవధి లేదా ఆసుపత్రి రీవిజిట్ తేదీ వచ్చింది. ఫాలో-అప్ సమన్వయం చేయండి; కేసు మూసివేయవద్దు.')
  ) AS v(code, language_code, subject, body)
  JOIN mst_languages language ON language.code = v.language_code
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = v.code
      AND existing.language_id = language.id
      AND existing.channel = 'IN_APP'
 );
