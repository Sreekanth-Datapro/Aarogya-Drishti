-- Phase 2: missed revisit notifications, timeline coverage, care referral support.
-- Additive / replace-view only. Does not auto-close care cases.
-- Idempotent: safe to re-run.

INSERT INTO mst_notification_templates (code, language_id, channel, subject, body)
SELECT v.code, language.id, 'IN_APP', v.subject, v.body
  FROM (VALUES
    ('CARE_REVISIT_MISSED', 'en', 'Hospital revisit missed',
     'A patient hospital revisit date passed without attendance. Coordinate a new revisit. Do not close the case.'),
    ('CARE_REVISIT_MISSED', 'te', 'ఆసుపత్రి రీవిజిట్ మిస్ అయింది',
     'రోగి ఆసుపత్రి రీవిజిట్ తేదీ హాజరు లేకుండా గడిచింది. కొత్త రీవిజిట్ సమన్వయం చేయండి. కేసు మూసివేయవద్దు.')
  ) AS v(code, language_code, subject, body)
  JOIN mst_languages language ON language.code = v.language_code
 WHERE NOT EXISTS (
   SELECT 1
     FROM mst_notification_templates existing
    WHERE existing.code = v.code
      AND existing.language_id = language.id
      AND existing.channel = 'IN_APP'
 );

CREATE INDEX IF NOT EXISTS idx_care_plans_referral
  ON tbl_care_plans (referral_id)
  WHERE referral_id IS NOT NULL;

-- Extend timeline view with care medicines, status history, diagnostic reports, missed revisit notes.
CREATE OR REPLACE VIEW vw_patient_timeline AS
          SELECT p.id AS patient_id, p.created_at AS event_time, 'REGISTRATION' AS event_type, 'patient' AS resource_type, p.id AS resource_id, p.registered_by AS actor_id, NULL::text AS detail_code FROM tbl_patients p
UNION ALL SELECT c.patient_id, c.captured_at, CASE WHEN c.granted THEN 'CONSENT_GRANTED' ELSE 'CONSENT_WITHDRAWN' END, 'consent', c.id, c.captured_by, cp.code FROM tbl_patient_consents c JOIN mst_consent_purposes cp ON cp.id = c.purpose_id
UNION ALL SELECT s.patient_id, s.created_at, 'SCREENING', 'screening', s.id, s.examiner_id, s.case_state::text FROM tbl_screenings s
UNION ALL SELECT ph.patient_id, ph.captured_at, 'IMAGE_CAPTURED', 'photo', ph.id, ph.captured_by, ph.view_type::text FROM tbl_screening_photos ph
UNION ALL SELECT s.patient_id, a.requested_at, 'AI_ASSESSMENT', 'ai_assessment', a.id, a.requested_by, a.status::text FROM tbl_ai_assessments a JOIN tbl_screenings s ON s.id = a.screening_id
UNION ALL SELECT cr.patient_id, COALESCE(cr.signed_at, cr.created_at), CASE WHEN cr.signed_at IS NULL THEN 'CLINICAL_REVIEW_DRAFT' ELSE 'CLINICAL_REVIEW_SIGNED' END, 'clinical_review', cr.id, cr.doctor_id, cr.decision::text FROM tbl_clinical_reviews cr
UNION ALL SELECT r.patient_id, r.created_at, 'REFERRAL', 'referral', r.id, r.created_by, r.status::text FROM tbl_referrals r
UNION ALL SELECT v.patient_id, v.created_at, 'VIDEO_CONSULTATION', 'video_consultation', v.id, v.requested_by, v.attendance::text FROM tbl_video_consultations v
UNION ALL SELECT a.patient_id, a.scheduled_at, 'HOSPITAL_APPOINTMENT', 'hospital_appointment', a.id, a.booked_by, a.attendance::text FROM tbl_hospital_appointments a
UNION ALL SELECT o.patient_id, o.ordered_at, 'INVESTIGATION_ORDERED', 'investigation_order', o.id, o.ordered_by, NULL FROM tbl_investigation_orders o
UNION ALL SELECT rp.patient_id, rp.created_at, 'REPORT_UPLOADED', 'pathology_report', rp.id, rp.uploaded_by, rp.doc_kind FROM tbl_pathology_reports rp
UNION ALL SELECT pr.patient_id, COALESCE(pr.signed_at, pr.created_at), 'PATHOLOGY_REVIEWED', 'pathology_review', pr.id, pr.reviewer_id, pr.diagnosis_category::text FROM tbl_pathology_reviews pr
UNION ALL SELECT cc.patient_id, cc.set_at, 'CLASSIFICATION', 'classification', cc.id, cc.set_by, cc.level::text FROM tbl_case_classifications cc
UNION ALL SELECT tl.patient_id, tl.created_at, 'TREATMENT_LINKAGE', 'treatment_linkage', tl.id, tl.linked_by, tl.status::text FROM tbl_treatment_linkages tl
UNION ALL SELECT t.patient_id, t.created_at, 'FOLLOWUP_TASK', 'followup_task', t.id, t.owner_id, t.task_type::text FROM tbl_followup_tasks t
UNION ALL SELECT h.patient_id, h.contacted_at, 'CONTACT_ATTEMPT', 'contact', h.id, h.contacted_by, h.outcome::text FROM tbl_patient_contact_history h
UNION ALL SELECT cp.patient_id, cp.created_at, 'CARE_PLAN', 'care_plan', cp.id, cp.created_by, cp.status::text FROM tbl_care_plans cp
UNION ALL SELECT cfs.patient_id, cfs.created_at, 'CARE_FOLLOWUP_SCHEDULED', 'care_followup_schedule', cfs.id, cfs.created_by, cfs.status::text FROM tbl_care_followup_schedules cfs
UNION ALL SELECT cfr.patient_id, cfr.submitted_at, 'CARE_FOLLOWUP_REPORTED', 'care_followup_report', cfr.id, cfr.reported_by,
         CASE
           WHEN cfr.hospital_attended IS FALSE THEN 'REVISIT_MISSED'
           WHEN cfr.hospital_attended IS TRUE THEN 'REVISIT_ATTENDED'
           WHEN cfr.discomfort_present THEN 'DISCOMFORT'
           ELSE 'REPORTED'
         END
  FROM tbl_care_followup_reports cfr
UNION ALL SELECT cdr.patient_id, cdr.created_at, 'CARE_ESCALATION', 'care_discomfort_report', cdr.id, cdr.reported_by, cdr.status::text FROM tbl_care_discomfort_reports cdr
UNION ALL SELECT fr.patient_id, fr.signed_at, 'CARE_FINAL_REVIEW', 'care_final_review', fr.id, fr.medical_officer_id, fr.decision::text FROM tbl_care_final_reviews fr
UNION ALL SELECT plan.patient_id, history.changed_at, 'CARE_STATUS_CHANGE', 'care_plan_status_history', history.id, history.changed_by,
         history.from_status::text || '->' || history.to_status::text
  FROM tbl_care_plan_status_history history
  JOIN tbl_care_plans plan ON plan.id = history.plan_id
UNION ALL SELECT plan.patient_id, med.created_at, 'CARE_MEDICINE', 'care_medicine', med.id, med.created_by, med.medicine_name
  FROM tbl_care_medicines med
  JOIN tbl_care_plans plan ON plan.id = med.plan_id
 WHERE med.is_active IS TRUE
UNION ALL SELECT d.patient_id, d.created_at, 'DIAGNOSTIC_ORDER', 'diagnostic_order', d.id, d.prescribed_by, st.code FROM tbl_diagnostic_orders d JOIN mst_investigation_statuses st ON st.id = d.status_id
UNION ALL SELECT da.patient_id, da.created_at, 'DIAGNOSTIC_APPOINTMENT', 'diagnostic_appointment', da.id, da.booked_by, ast.code FROM tbl_diagnostic_appointments da JOIN mst_appointment_statuses ast ON ast.id = da.status_id
UNION ALL SELECT report.patient_id, report.created_at, 'DIAGNOSTIC_REPORT_UPLOADED', 'diagnostic_order_report', report.id, report.uploaded_by, report.review_status
  FROM tbl_diagnostic_order_reports report
UNION ALL SELECT report.patient_id, report.reviewed_at, 'DIAGNOSTIC_REPORT_REVIEWED', 'diagnostic_order_report', report.id, report.reviewed_by, report.review_status
  FROM tbl_diagnostic_order_reports report
 WHERE report.reviewed_at IS NOT NULL;

COMMENT ON VIEW vw_patient_timeline IS
  'Codes/ids only patient journey events. Authorise with fn_user_has_patient_access before use.';
