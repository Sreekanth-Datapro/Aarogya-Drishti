-- Harden diagnostic follow-up integrity, timeline, and due-scan support.
-- Forward-only. Extends 039/042. Do not apply without operator approval.

-- One SUBMITTED follow-up report per order at a time (blocks concurrent duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_followup_one_submitted
  ON tbl_diagnostic_advice_followups (order_id)
  WHERE status = 'SUBMITTED';

-- One FORWARDED report per advice version + cycle (history preserved).
CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_followup_forwarded_cycle
  ON tbl_diagnostic_advice_followups (order_id, advice_id, cycle_no)
  WHERE status = 'FORWARDED';

-- Link reassessment-created diagnostic orders / video decisions on the source order.
ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS reassessment_source_order_id UUID REFERENCES tbl_diagnostic_orders(id);

ALTER TABLE tbl_diagnostic_orders
  ADD COLUMN IF NOT EXISTS video_decision_id UUID;

CREATE INDEX IF NOT EXISTS idx_diagnostic_orders_reassessment_source
  ON tbl_diagnostic_orders (reassessment_source_order_id)
  WHERE reassessment_source_order_id IS NOT NULL;

-- Expand patient timeline with diagnostic advice / follow-up / workflow handoffs.
-- Codes and ids only; callers must still authorize with fn_user_has_patient_access.
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
 WHERE report.reviewed_at IS NOT NULL
UNION ALL SELECT advice.patient_id, COALESCE(advice.signed_at, advice.created_at),
         CASE WHEN advice.status = 'SIGNED' THEN 'DIAGNOSTIC_ADVICE_SIGNED' ELSE 'DIAGNOSTIC_ADVICE_DRAFT' END,
         'diagnostic_advice', advice.id, COALESCE(advice.signed_by, advice.specialist_id),
         COALESCE('v' || advice.version_no::text, advice.status)
  FROM tbl_diagnostic_advice advice
UNION ALL SELECT followup.patient_id, COALESCE(followup.submitted_at, followup.created_at),
         CASE
           WHEN followup.status = 'DRAFT' THEN 'DIAGNOSTIC_FOLLOWUP_DRAFT'
           WHEN followup.status = 'SUBMITTED' THEN 'DIAGNOSTIC_FOLLOWUP_SUBMITTED'
           WHEN followup.status = 'RETURNED' THEN 'DIAGNOSTIC_FOLLOWUP_RETURNED'
           WHEN followup.status = 'FORWARDED' THEN 'DIAGNOSTIC_FOLLOWUP_FORWARDED'
           ELSE 'DIAGNOSTIC_FOLLOWUP'
         END,
         'diagnostic_advice_followup', followup.id, followup.health_worker_id, followup.status
  FROM tbl_diagnostic_advice_followups followup
UNION ALL SELECT followup.patient_id, followup.returned_at, 'DIAGNOSTIC_FOLLOWUP_RETURNED_BY_NAV',
         'diagnostic_advice_followup', followup.id, followup.returned_by, 'RETURNED'
  FROM tbl_diagnostic_advice_followups followup
 WHERE followup.returned_at IS NOT NULL
UNION ALL SELECT followup.patient_id, followup.forwarded_to_specialist_at, 'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST',
         'diagnostic_advice_followup', followup.id, followup.forwarded_to_specialist_by, 'FORWARDED'
  FROM tbl_diagnostic_advice_followups followup
 WHERE followup.forwarded_to_specialist_at IS NOT NULL
UNION ALL SELECT d.patient_id, history.changed_at, 'DIAGNOSTIC_WORKFLOW',
         'diagnostic_status_history', history.id, history.changed_by, history.reason
  FROM tbl_diagnostic_status_history history
  JOIN tbl_diagnostic_orders d ON d.id = history.order_id
UNION ALL SELECT d.patient_id, d.advice_forwarded_to_hw_at, 'DIAGNOSTIC_ADVICE_TO_HW',
         'diagnostic_order', d.id, d.advice_forwarded_to_hw_by, d.workflow_status
  FROM tbl_diagnostic_orders d
 WHERE d.advice_forwarded_to_hw_at IS NOT NULL
UNION ALL SELECT d.patient_id, d.case_closed_at, 'DIAGNOSTIC_CASE_CLOSED',
         'diagnostic_order', d.id, d.case_closed_by, 'CLOSED'
  FROM tbl_diagnostic_orders d
 WHERE d.case_closed_at IS NOT NULL;

COMMENT ON VIEW vw_patient_timeline IS
  'Codes/ids only patient journey events including diagnostic advice/follow-up cycle. Authorise with fn_user_has_patient_access before use.';
