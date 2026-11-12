-- READ-ONLY VERIFICATION. Not a migration (the migrator only reads backend/migrations).
-- Checks that the database objects used by these endpoints exist:
--   registration.recommend permission
--   GET /api/registrations/medical-officer
--   GET /api/medical-officer/cases?view=available   (and the claim / release actions)
-- Run only after approval, e.g.:  psql -d Aarogya -f verify_medical_officer_dependencies.sql
-- Every statement is a SELECT on catalog tables or a COUNT; no rows are changed and
-- no personal data is printed. The transaction is READ ONLY and ends with ROLLBACK.

BEGIN TRANSACTION READ ONLY;

-- 1. Migration history: which files were applied (011 / 013 / 015 expected?)
SELECT filename, applied_at
  FROM schema_migrations
 WHERE filename ~ '^(01[0-9])_'
 ORDER BY filename;

-- 2. Tables (expected: every row has exists = true)
SELECT t.table_name, to_regclass('public.' || t.table_name) IS NOT NULL AS exists
  FROM (VALUES
    ('tbl_users'), ('mst_roles'), ('tbl_user_sessions'), ('mst_permissions'), ('tbl_role_permissions'),
    ('tbl_user_registration_requests'), ('mst_facilities'), ('mst_mandals'), ('mst_villages'),
    ('tbl_patients'), ('tbl_screenings'), ('tbl_clinical_reviews'),
    ('tbl_patient_consents'), ('mst_consent_purposes'), ('tbl_audit_logs'),
    ('tbl_medical_officer_mandal_assignments'),   -- migration 013
    ('tbl_medical_officer_case_claims')           -- migration 013
  ) AS t(table_name)
 ORDER BY t.table_name;

-- 3. Columns read or written by the code (expected: missing = false on every row)
WITH required(table_name, column_name) AS (VALUES
  -- GET /registrations/medical-officer and POST /registrations/:id/recommendation
  ('tbl_user_registration_requests', 'id'),
  ('tbl_user_registration_requests', 'full_name'),
  ('tbl_user_registration_requests', 'username'),
  ('tbl_user_registration_requests', 'phone'),
  ('tbl_user_registration_requests', 'email'),
  ('tbl_user_registration_requests', 'designation'),
  ('tbl_user_registration_requests', 'employee_ref'),
  ('tbl_user_registration_requests', 'status'),
  ('tbl_user_registration_requests', 'created_at'),
  ('tbl_user_registration_requests', 'facility_id'),
  ('tbl_user_registration_requests', 'mandal_id'),
  ('tbl_user_registration_requests', 'village_id'),
  ('tbl_user_registration_requests', 'workflow_version'),        -- migration 010
  ('tbl_user_registration_requests', 'mo_recommended_by'),       -- proposed 015
  ('tbl_user_registration_requests', 'mo_recommended_at'),       -- proposed 015
  ('tbl_user_registration_requests', 'mo_recommendation'),       -- proposed 015
  ('tbl_user_registration_requests', 'mo_recommendation_note'),  -- proposed 015
  -- Medical Officer Mandal scope (migration 013)
  ('tbl_medical_officer_mandal_assignments', 'user_id'),
  ('tbl_medical_officer_mandal_assignments', 'mandal_id'),
  ('tbl_medical_officer_mandal_assignments', 'valid_from'),
  ('tbl_medical_officer_mandal_assignments', 'valid_to'),
  -- GET /medical-officer/cases
  ('tbl_patients', 'id'),
  ('tbl_patients', 'patient_code'),
  ('tbl_patients', 'sex'),
  ('tbl_patients', 'age_years'),
  ('tbl_patients', 'village_id'),
  ('tbl_patients', 'registered_facility_id'),
  ('tbl_patients', 'deleted_at'),
  ('tbl_patients', 'mandal_id'),                                 -- migration 013
  ('tbl_screenings', 'id'),
  ('tbl_screenings', 'patient_id'),
  ('tbl_screenings', 'screening_date'),
  ('tbl_screenings', 'case_state'),
  ('tbl_screenings', 'chief_complaint'),
  ('tbl_screenings', 'created_at'),
  ('tbl_clinical_reviews', 'screening_id'),
  ('tbl_clinical_reviews', 'signed_at'),
  ('tbl_patient_consents', 'patient_id'),
  ('tbl_patient_consents', 'purpose_id'),
  ('tbl_patient_consents', 'granted'),
  ('tbl_patient_consents', 'consent_seq'),
  ('mst_consent_purposes', 'id'),
  ('mst_consent_purposes', 'code'),
  ('tbl_medical_officer_case_claims', 'id'),                     -- migration 013
  ('tbl_medical_officer_case_claims', 'patient_id'),
  ('tbl_medical_officer_case_claims', 'medical_officer_id'),
  ('tbl_medical_officer_case_claims', 'claimed_at'),
  ('tbl_medical_officer_case_claims', 'released_at'),
  ('tbl_medical_officer_case_claims', 'released_by'),
  -- authentication and audit used by every request
  ('tbl_users', 'status'),
  ('tbl_users', 'deleted_at'),
  ('tbl_users', 'role_id'),
  ('mst_roles', 'code'),
  ('mst_roles', 'is_active'),
  ('tbl_audit_logs', 'patient_id')
)
SELECT r.table_name, r.column_name, c.column_name IS NULL AS missing
  FROM required r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
 ORDER BY missing DESC, r.table_name, r.column_name;

-- 4. Enum values used in the queries
SELECT t.typname, e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
 WHERE (t.typname = 'case_state' AND e.enumlabel = 'AWAITING_CLINICIAN')
    OR (t.typname = 'registration_status' AND e.enumlabel = 'PENDING')
    OR (t.typname = 'user_status' AND e.enumlabel = 'ACTIVE');

-- 5. Consent purpose used for the chief-complaint gate
SELECT code, is_active FROM mst_consent_purposes WHERE code IN ('SCREENING', 'IMAGE_CAPTURE');

-- 6. Permissions: exist, and which roles hold them
--    Expected after approval: MEDICAL_OFFICER -> registration.recommend,
--    DISTRICT_ADMIN -> registration.finalize and registration.monitor.
SELECT p.code, r.code AS role_code
  FROM mst_permissions p
  LEFT JOIN tbl_role_permissions rp ON rp.permission_id = p.id
  LEFT JOIN mst_roles r ON r.id = rp.role_id
 WHERE p.code IN ('registration.recommend', 'registration.finalize',
                  'registration.monitor', 'registration.verify', 'registration.review')
 ORDER BY p.code, r.code;

-- 7. Constraints the code relies on
--    uq_mo_claim_one_active_per_patient: the claim API turns this unique-index
--    violation into "Another Medical Officer has already claimed this patient".
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name, indisunique
  FROM pg_index
 WHERE indexrelid::regclass::text IN (
         'uq_mo_claim_one_active_per_patient',
         'idx_mo_claim_active_owner',
         'uq_mo_mandal_assignment_active',
         'idx_mo_mandal_assignment_scope',
         'idx_reg_015_pending_mandal',
         'idx_reg_015_pending_final_decision');

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conname IN ('ck_mo_claim_release_time', 'ck_mo_mandal_assignment_dates',
                   'uq_mo_mandal_assignment_start', 'ck_reg_015_recommendation',
                   'ck_reg_015_workflow_version', 'ck_registration_workflow_version');

-- 8. Functions and triggers
SELECT p.proname,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       pg_get_functiondef(p.oid) LIKE '%tbl_medical_officer_mandal_assignments%' AS uses_mandal_assignments,
       pg_get_functiondef(p.oid) LIKE '%app.actor_id%' AS uses_actor_setting
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('fn_validate_registration_reviewer',
                     'fn_validate_medical_officer_case_claim',
                     'fn_validate_medical_officer_mandal_assignment',
                     'fn_user_has_patient_access',
                     'fn_require_role');

SELECT tgrelid::regclass AS table_name, tgname, tgenabled
  FROM pg_trigger
 WHERE NOT tgisinternal
   AND tgname IN ('trg_reg_reviewer_role',
                  'trg_validate_medical_officer_case_claim',
                  'trg_validate_medical_officer_mandal_assignment');

-- 9. Data readiness (counts only)
SELECT
  (SELECT COUNT(*) FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
    WHERE r.code = 'MEDICAL_OFFICER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) AS active_medical_officers,
  (SELECT COUNT(*) FROM tbl_user_registration_requests
    WHERE status = 'PENDING' AND workflow_version IS NULL) AS pending_legacy_requests,
  (SELECT COUNT(*) FROM tbl_user_registration_requests
    WHERE status = 'PENDING' AND workflow_version = 1) AS pending_two_stage_requests,
  (SELECT COUNT(*) FROM tbl_screenings WHERE case_state = 'AWAITING_CLINICIAN') AS screenings_awaiting_review;

-- 10. Objects used by the full Medical Officer module (dashboard, review, images,
--     referrals, follow-ups, reports, profile)
SELECT t.object_name, to_regclass('public.' || t.object_name) IS NOT NULL AS exists
  FROM (VALUES
    ('tbl_clinical_review_versions'), ('tbl_screening_findings'), ('tbl_patient_medical_histories'),
    ('tbl_screening_photos'), ('tbl_image_quality_results'), ('tbl_ai_assessments'),
    ('tbl_referrals'), ('tbl_referral_status_history'), ('tbl_case_assignments'),
    ('tbl_followup_tasks'), ('mst_followup_statuses'), ('mst_referral_priorities'), ('mst_specialties'),
    ('mst_hospitals'), ('mst_symptoms'), ('mst_exposure_types'), ('tbl_data_exports'), ('vw_patient_timeline')
  ) AS t(object_name)
 ORDER BY t.object_name;

WITH required(table_name, column_name) AS (VALUES
  ('mst_facilities', 'hospital_id'), ('mst_facilities', 'facility_type'), ('mst_facilities', 'district_id'),
  ('tbl_users', 'password_changed_at'), ('tbl_users', 'updated_at'), ('tbl_users', 'phone'), ('tbl_users', 'district_id'),
  ('tbl_clinical_reviews', 'signature_hash'), ('tbl_clinical_reviews', 'amendment_reason'), ('tbl_clinical_reviews', 'version'),
  ('tbl_screening_photos', 'private_key'), ('tbl_followup_tasks', 'trigger_event'), ('tbl_followup_tasks', 'status_id')
)
SELECT r.table_name, r.column_name, c.column_name IS NULL AS missing
  FROM required r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
 ORDER BY missing DESC, r.table_name;

-- Clinical permission codes the MO routes require (expected: all 7 rows for MEDICAL_OFFICER)
SELECT p.code, r.code IS NOT NULL AS granted_to_medical_officer
  FROM mst_permissions p
  LEFT JOIN tbl_role_permissions rp ON rp.permission_id = p.id
  LEFT JOIN mst_roles r ON r.id = rp.role_id AND r.code = 'MEDICAL_OFFICER'
 WHERE p.code IN ('patient.read_assigned', 'review.create', 'review.sign', 'image.view',
                  'referral.create', 'referral.view', 'case.assign')
 ORDER BY p.code;

-- Clinical safety triggers relied on (expected: all present and enabled)
SELECT tgrelid::regclass AS table_name, tgname, tgenabled
  FROM pg_trigger
 WHERE NOT tgisinternal
   AND tgname IN ('trg_review_guard', 'trg_review_snapshot', 'trg_review_doctor_role',
                  'trg_screening_state', 'trg_referral_guard', 'trg_referral_author_role',
                  'trg_followup_owner_role', 'trg_case_assign_role', 'trg_tbl_data_exports_append_only');

-- Reference data (expected: OPEN follow-up status and at least one priority / specialty)
SELECT
  (SELECT COUNT(*) FROM mst_followup_statuses WHERE code = 'OPEN') AS open_followup_status,
  (SELECT COUNT(*) FROM mst_referral_priorities WHERE is_active) AS referral_priorities,
  (SELECT COUNT(*) FROM mst_specialties WHERE is_active) AS specialties,
  (SELECT COUNT(*) FROM mst_facilities WHERE facility_type = 'HOSPITAL' AND hospital_id IS NOT NULL AND is_active) AS referral_hospitals;

-- Run only if step 2 shows the 013 tables exist:
-- SELECT COUNT(*) AS active_mo_mandal_assignments FROM tbl_medical_officer_mandal_assignments WHERE valid_to IS NULL;
-- SELECT COUNT(*) AS active_claims FROM tbl_medical_officer_case_claims WHERE released_at IS NULL;

ROLLBACK;
