-- Patient tracking: extend the existing timeline view with care lifecycle
-- and diagnostic module events. Does not invent a new status machine.
-- Idempotent via CREATE OR REPLACE VIEW.

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
-- Care lifecycle (026)
UNION ALL SELECT cp.patient_id, cp.created_at, 'CARE_PLAN', 'care_plan', cp.id, cp.created_by, cp.status::text FROM tbl_care_plans cp
UNION ALL SELECT cfs.patient_id, cfs.created_at, 'CARE_FOLLOWUP_SCHEDULED', 'care_followup_schedule', cfs.id, cfs.created_by, cfs.status::text FROM tbl_care_followup_schedules cfs
UNION ALL SELECT cfr.patient_id, cfr.submitted_at, 'CARE_FOLLOWUP_REPORTED', 'care_followup_report', cfr.id, cfr.reported_by,
         CASE WHEN cfr.discomfort_present THEN 'DISCOMFORT' ELSE 'REPORTED' END
  FROM tbl_care_followup_reports cfr
UNION ALL SELECT cdr.patient_id, cdr.created_at, 'CARE_ESCALATION', 'care_discomfort_report', cdr.id, cdr.reported_by, cdr.status::text FROM tbl_care_discomfort_reports cdr
UNION ALL SELECT fr.patient_id, fr.signed_at, 'CARE_FINAL_REVIEW', 'care_final_review', fr.id, fr.medical_officer_id, fr.decision::text FROM tbl_care_final_reviews fr
-- Diagnostic module (029/030)
UNION ALL SELECT d.patient_id, d.created_at, 'DIAGNOSTIC_ORDER', 'diagnostic_order', d.id, d.prescribed_by, st.code FROM tbl_diagnostic_orders d JOIN mst_investigation_statuses st ON st.id = d.status_id
UNION ALL SELECT da.patient_id, da.created_at, 'DIAGNOSTIC_APPOINTMENT', 'diagnostic_appointment', da.id, da.booked_by, ast.code FROM tbl_diagnostic_appointments da JOIN mst_appointment_statuses ast ON ast.id = da.status_id;

COMMENT ON VIEW vw_patient_timeline IS
  'Codes/ids only patient journey events. Authorise with fn_user_has_patient_access before use.';
