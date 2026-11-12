-- End-to-end clinical workflow and safety-rule checks.
-- Executed by workflow.test.js inside a transaction that is always rolled back.
CREATE TEMP TABLE t_results (n serial, status text, label text, detail text);
CREATE FUNCTION pg_temp.chk(l text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
$f$ INSERT INTO t_results (status, label, detail) VALUES (CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, l, d) $f$;
CREATE FUNCTION pg_temp.ef(l text, qs text[], pat text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE q text;
BEGIN
  BEGIN
    FOREACH q IN ARRAY qs LOOP EXECUTE q; END LOOP;
    RAISE EXCEPTION 'SUCCEEDED_UNEXPECTEDLY';
  EXCEPTION WHEN others THEN
    INSERT INTO t_results (status, label, detail)
    VALUES (CASE WHEN SQLERRM = 'SUCCEEDED_UNEXPECTEDLY' THEN 'FAIL' WHEN SQLERRM ~* pat THEN 'PASS' ELSE 'FAIL' END, l, SQLERRM);
  END;
END $f$;
CREATE FUNCTION pg_temp.go(s uuid, st text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE tbl_screenings SET case_state = st::case_state WHERE id = s;
  INSERT INTO t_results (status, label, detail) VALUES ('PASS', 'case transition -> ' || st, '');
END $f$;
CREATE FUNCTION pg_temp.mk_user(n text, r text) RETURNS uuid LANGUAGE sql AS
$f$ INSERT INTO tbl_users (username, password_hash, full_name, role_id)
    SELECT n, 'x', n, id FROM mst_roles WHERE code = r RETURNING id $f$;

DO $w$
DECLARE
  step text := 'init';
  u_hw uuid; u_hw2 uuid; u_mo uuid; u_mo_unassigned uuid; u_sp uuid; u_sp2 uuid; u_nav uuid; u_hs uuid; u_da uuid; u_sa uuid; u_super uuid; u_new uuid;
  f_phc bigint; f_hosp bigint; h_ah bigint; v1 bigint; mandal2 bigint; lang_te bigint; phc bigint; dist bigint;
  st_req bigint; st_conf bigint; st_done bigint; inv_biopsy bigint; inv_adv bigint; fs_open bigint; spec bigint; prio bigint;
  model bigint; tmpl bigint; sym bigint; expo bigint; cp_scr bigint; cp_img bigint; cp_tele bigint;
  reg1 uuid; reg2 uuid; p1 uuid; p2 uuid; s1 uuid; c_scr uuid; c_img uuid; c_p2 uuid; ph1 uuid; ai1 uuid; rv1 uuid; ref1 uuid;
  ap1 uuid; slot1 uuid; vc1 uuid; availability1 uuid; ord1 uuid; rep1 uuid; pr1 uuid; tl1 uuid; task1 uuid;
  gen_code text; b boolean; n int; rec record;
BEGIN
  step := 'load masters';
  SELECT id INTO f_phc FROM mst_facilities WHERE code = 'FAC_PHC_GM';
  SELECT id INTO f_hosp FROM mst_facilities WHERE code = 'FAC_AH_PADERU_DEMO';
  SELECT id INTO h_ah FROM mst_hospitals WHERE code = 'AH_PADERU_DEMO';
  SELECT id INTO v1 FROM mst_villages WHERE code = 'VIL_DEMO_1';
  SELECT id INTO mandal2 FROM mst_mandals WHERE code = 'G_MADUGULA';
  SELECT id INTO lang_te FROM mst_languages WHERE code = 'te';
  SELECT id INTO phc FROM mst_phcs WHERE code = 'PHC_GM_DEMO';
  SELECT id INTO dist FROM mst_districts WHERE code = 'ASR';
  SELECT id INTO st_req FROM mst_appointment_statuses WHERE code = 'REQUESTED';
  SELECT id INTO st_conf FROM mst_appointment_statuses WHERE code = 'CONFIRMED';
  SELECT id INTO st_done FROM mst_appointment_statuses WHERE code = 'COMPLETED';
  SELECT id INTO inv_biopsy FROM mst_investigation_types WHERE code = 'BIOPSY';
  SELECT id INTO inv_adv FROM mst_investigation_statuses WHERE code = 'ADVISED';
  SELECT id INTO fs_open FROM mst_followup_statuses WHERE code = 'OPEN';
  SELECT id INTO spec FROM mst_specialties WHERE code = 'ORAL_MEDICINE';
  SELECT id INTO prio FROM mst_referral_priorities WHERE code = 'SOON';
  SELECT id INTO model FROM mst_ai_models WHERE model_version = 'mock-v1';
  SELECT id INTO tmpl FROM mst_notification_templates WHERE code = 'APPT_REMINDER' LIMIT 1;
  SELECT id INTO sym FROM mst_symptoms WHERE code = 'WHITE_PATCH';
  SELECT id INTO expo FROM mst_exposure_types WHERE code = 'GUTKHA';
  SELECT id INTO cp_scr FROM mst_consent_purposes WHERE code = 'SCREENING';
  SELECT id INTO cp_img FROM mst_consent_purposes WHERE code = 'IMAGE_CAPTURE';
  SELECT id INTO cp_tele FROM mst_consent_purposes WHERE code = 'TELECONSULT';

  step := 'create one user per role';
  u_hw := pg_temp.mk_user('zz_t_hw', 'HEALTH_WORKER');
  u_hw2 := pg_temp.mk_user('zz_t_hw2', 'HEALTH_WORKER');
  u_mo := pg_temp.mk_user('zz_t_mo', 'MEDICAL_OFFICER');
  u_mo_unassigned := pg_temp.mk_user('zz_t_mo_unassigned', 'MEDICAL_OFFICER');
  u_sp := pg_temp.mk_user('zz_t_sp', 'SPECIALIST');
  u_sp2 := pg_temp.mk_user('zz_t_sp2', 'SPECIALIST');
  u_nav := pg_temp.mk_user('zz_t_nav', 'NAVIGATOR');
  u_hs := pg_temp.mk_user('zz_t_hs', 'HOSPITAL_STAFF');
  u_da := pg_temp.mk_user('zz_t_da', 'DISTRICT_ADMIN');
  u_sa := pg_temp.mk_user('zz_t_sa', 'SYSTEM_ADMIN');
  u_super := pg_temp.mk_user('zz_t_super', 'SUPER_ADMIN');
  PERFORM pg_temp.chk('users created for all 8 roles', (SELECT count(*) FROM tbl_users WHERE username LIKE 'zz_t_%') = 11);
  PERFORM pg_temp.ef('duplicate username (case-insensitive) blocked',
    ARRAY[format('INSERT INTO tbl_users (username,password_hash,full_name,role_id) SELECT %L,%L,%L,id FROM mst_roles WHERE code=%L', 'ZZ_T_HW', 'x', 'x', 'HEALTH_WORKER')], 'uq_users_username');

  step := 'registration requests';
  INSERT INTO tbl_user_facility_assignments (user_id, facility_id, is_primary)
  VALUES (u_mo, f_phc, true);

  INSERT INTO tbl_user_registration_requests (full_name, username, phone, designation, facility_id, mandal_id, village_id, language_id, password_hash, terms_accepted_at)
  VALUES ('Test HW', 'zz_t_reg', '9999999999', 'ASHA', f_phc, mandal2, v1, lang_te, 'x', now()) RETURNING id INTO reg1;
  PERFORM pg_temp.chk('pending registration with mandal_id/village_id accepted', true);
  INSERT INTO tbl_user_registration_requests (full_name, username, phone, designation, facility_id, mandal_id, village_id, language_id, password_hash, terms_accepted_at)
  VALUES ('Test HW Other Facility', 'zz_t_reg_other', '9999999998', 'ANM', f_hosp, mandal2, v1, lang_te, 'x', now()) RETURNING id INTO reg2;
  PERFORM pg_temp.ef('second pending request with same username blocked',
    ARRAY[format('INSERT INTO tbl_user_registration_requests (full_name,username,phone,designation,facility_id,mandal_id,village_id,language_id,password_hash,terms_accepted_at) VALUES (%L,%L,%L,%L,%s,%s,%s,%s,%L,now())', 'x', 'ZZ_T_REG', '9999999999', 'ANM', f_phc, mandal2, v1, lang_te, 'x')], 'uq_reg_pending_username');
  PERFORM pg_temp.ef('reject without reviewer blocked',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L WHERE id=%L', 'REJECTED', 'dup', reg1)], 'Registration reviewer must be an active MEDICAL_OFFICER');
  PERFORM pg_temp.ef('health worker cannot review registrations',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', 'dup', u_hw, reg1)], 'Registration reviewer must be an active MEDICAL_OFFICER');
  PERFORM pg_temp.ef('SYSTEM_ADMIN cannot reject registrations',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', 'dup', u_sa, reg1)], 'Registration reviewer must be an active MEDICAL_OFFICER');
  PERFORM pg_temp.ef('SUPER_ADMIN cannot reject registrations',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', 'dup', u_super, reg1)], 'Registration reviewer must be an active MEDICAL_OFFICER');
  PERFORM pg_temp.ef('Medical Officer cannot review an unassigned facility',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', 'dup', u_mo_unassigned, reg2)], 'Registration reviewer must have a current assignment');
  PERFORM pg_temp.ef('blank rejection reason blocked',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', '   ', u_mo, reg1)], 'ck_reg_rejection_reason_nonblank');
  PERFORM pg_temp.ef('tab and newline rejection reason blocked',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, rejection_reason=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'REJECTED', E'\t\n', u_mo, reg1)], 'ck_reg_rejection_reason_nonblank');
  PERFORM pg_temp.ef('approve without created user blocked',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L, reviewed_by=%L, reviewed_at=now() WHERE id=%L', 'APPROVED', u_mo, reg1)], 'ck_reg_approved');
  u_new := pg_temp.mk_user('zz_t_reg', 'HEALTH_WORKER');
  UPDATE tbl_user_registration_requests SET status = 'APPROVED', reviewed_by = u_mo, reviewed_at = now(), created_user_id = u_new WHERE id = reg1;
  PERFORM pg_temp.chk('assigned Medical Officer approval with created user accepted', true);
  PERFORM pg_temp.ef('finalized request status cannot be changed',
    ARRAY[format('UPDATE tbl_user_registration_requests SET status=%L WHERE id=%L', 'REJECTED', reg1)], 'A finalized registration request cannot change status');
  PERFORM pg_temp.ef('finalized reviewer cannot be changed',
    ARRAY[format('UPDATE tbl_user_registration_requests SET reviewed_by=%L WHERE id=%L', u_super, reg1)], 'Reviewer, review time, and facility are immutable');
  PERFORM pg_temp.ef('finalized review timestamp cannot be changed',
    ARRAY[format('UPDATE tbl_user_registration_requests SET reviewed_at=now() + interval %L WHERE id=%L', '1 day', reg1)], 'Reviewer, review time, and facility are immutable');
  PERFORM pg_temp.ef('finalized facility cannot be changed',
    ARRAY[format('UPDATE tbl_user_registration_requests SET facility_id=%s WHERE id=%L', f_hosp, reg1)], 'Reviewer, review time, and facility are immutable');

  step := 'facilities and assignments';
  PERFORM pg_temp.ef('second active primary facility blocked',
    ARRAY[format('INSERT INTO tbl_user_facility_assignments (user_id,facility_id,is_primary) VALUES (%L,%s,true)', u_mo, f_hosp)], 'uq_ufa_one_primary');
  PERFORM pg_temp.ef('PHC facility without phc_id blocked',
    ARRAY[format('INSERT INTO mst_facilities (district_id,facility_type,code,name_en) VALUES (%s,%L,%L,%L)', dist, 'PHC', 'ZZ_BAD', 'bad')], 'ck_facility_parent');

  step := 'patient registration';
  PERFORM pg_temp.ef('system admin cannot register a patient',
    ARRAY[format('INSERT INTO tbl_patients (full_name,age_years,registered_facility_id,registered_by) VALUES (%L,40,%s,%L)', 'x', f_phc, u_sa)], 'registered_by must be a user with role');
  PERFORM pg_temp.ef('real (non-synthetic) patient data blocked',
    ARRAY[format('INSERT INTO tbl_patients (full_name,age_years,registered_facility_id,registered_by,is_synthetic) VALUES (%L,40,%s,%L,false)', 'x', f_phc, u_hw)], 'is_synthetic|check constraint');
  PERFORM pg_temp.ef('patient without age or DOB blocked',
    ARRAY[format('INSERT INTO tbl_patients (full_name,registered_facility_id,registered_by) VALUES (%L,%s,%L)', 'x', f_phc, u_hw)], 'ck_patient_age_known');
  INSERT INTO tbl_patients (full_name, sex, age_years, village_id, phc_id, preferred_language_id, registered_facility_id, registered_by)
  VALUES ('Test Patient One', 'FEMALE', 45, v1, phc, lang_te, f_phc, u_hw) RETURNING id, patient_code INTO p1, gen_code;
  PERFORM pg_temp.chk('health worker registers patient, code generated', gen_code LIKE 'AD-____-______', gen_code);
  INSERT INTO tbl_patients (full_name, age_years, registered_facility_id, registered_by) VALUES ('Test Patient Two', 50, f_phc, u_hw) RETURNING id INTO p2;

  step := 'screening + consent';
  INSERT INTO tbl_screenings (patient_id, examiner_id, facility_id) VALUES (p1, u_hw, f_phc) RETURNING id INTO s1;
  PERFORM pg_temp.chk('screening starts in DRAFT', (SELECT case_state::text FROM tbl_screenings WHERE id = s1) = 'DRAFT');
  PERFORM pg_temp.ef('DRAFT -> CONSENTED without consent blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'CONSENTED', s1)], 'ck_consent_gate');
  PERFORM pg_temp.ef('photo before IMAGE_CAPTURE consent blocked',
    ARRAY[format('INSERT INTO tbl_screening_photos (screening_id,patient_id,view_type,private_key,checksum_sha256,mime_type,size_bytes,captured_by) VALUES (%L,%L,%L,%L,repeat(%L,64),%L,1000,%L)', s1, p1, 'TONGUE', 'k/0.jpg', 'c', 'image/jpeg', u_hw)], 'no active IMAGE_CAPTURE consent');
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by) VALUES (p1, cp_scr, lang_te, 'v1', true, u_hw) RETURNING id INTO c_scr;
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by) VALUES (p1, cp_img, lang_te, 'v1', true, u_hw) RETURNING id INTO c_img;
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by) VALUES (p2, cp_scr, lang_te, 'v1', true, u_hw) RETURNING id INTO c_p2;
  PERFORM pg_temp.ef('consent rows are append-only',
    ARRAY[format('UPDATE tbl_patient_consents SET granted=false WHERE id=%L', c_scr)], 'append-only');
  PERFORM pg_temp.ef('screening consent must be a SCREENING consent',
    ARRAY[format('UPDATE tbl_screenings SET consent_id=%L WHERE id=%L', c_img, s1)], 'granted SCREENING consent');
  PERFORM pg_temp.ef('consent of another patient blocked',
    ARRAY[format('UPDATE tbl_screenings SET consent_id=%L WHERE id=%L', c_p2, s1)], 'foreign key');
  UPDATE tbl_screenings SET consent_id = c_scr, case_state = 'CONSENTED' WHERE id = s1;
  PERFORM pg_temp.chk('case transition -> CONSENTED (with consent)', true);
  INSERT INTO tbl_patient_medical_histories (patient_id, history_kind, exposure_type_id, duration_years, is_current, recorded_by) VALUES (p1, 'EXPOSURE', expo, 10, true, u_hw);
  INSERT INTO tbl_screening_findings (screening_id, finding_kind, symptom_id, oral_site, recorded_by) VALUES (s1, 'SYMPTOM', sym, 'CHEEK_LINING', u_hw);
  PERFORM pg_temp.chk('exposure history and symptom finding recorded', true);
  PERFORM pg_temp.go(s1, 'SCREENED');

  step := 'image capture + quality';
  PERFORM pg_temp.ef('public URL as photo key blocked',
    ARRAY[format('INSERT INTO tbl_screening_photos (screening_id,patient_id,view_type,private_key,checksum_sha256,mime_type,size_bytes,captured_by) VALUES (%L,%L,%L,%L,repeat(%L,64),%L,1000,%L)', s1, p1, 'TONGUE', 'https://x/y.jpg', 'd', 'image/jpeg', u_hw)], 'ck_photo_key_private');
  INSERT INTO tbl_screening_photos (screening_id, patient_id, view_type, private_key, checksum_sha256, mime_type, size_bytes, captured_by)
  VALUES (s1, p1, 'CHEEK_LINING', 'screenings/test/1.jpg', repeat('a', 64), 'image/jpeg', 204800, u_hw) RETURNING id INTO ph1;
  PERFORM pg_temp.chk('photo stored with private key (consent present)', true);
  PERFORM pg_temp.ef('quality RECAPTURE without reason blocked',
    ARRAY[format('INSERT INTO tbl_image_quality_results (photo_id,checker_version,status) VALUES (%L,%L,%L)', ph1, 'q1', 'RECAPTURE')], 'ck_quality_reason');
  INSERT INTO tbl_image_quality_results (photo_id, checker_version, status, blur_score) VALUES (ph1, 'q1', 'ACCEPTABLE', 120.5);

  step := 'AI assessment (advisory only)';
  PERFORM pg_temp.ef('AI row marked clinical_use=true blocked',
    ARRAY[format('INSERT INTO tbl_ai_assessments (screening_id,photo_id,ai_model_id,requested_by,clinical_use) VALUES (%L,%L,%s,%L,true)', s1, ph1, model, u_hw)], 'clinical_use');
  PERFORM pg_temp.ef('AI row without NOT FOR CLINICAL USE warning blocked',
    ARRAY[format('INSERT INTO tbl_ai_assessments (screening_id,photo_id,ai_model_id,requested_by,warning) VALUES (%L,%L,%s,%L,%L)', s1, ph1, model, u_hw, 'all good')], 'warning');
  PERFORM pg_temp.ef('AI lesion localisation from non-localising model blocked',
    ARRAY[format('INSERT INTO tbl_ai_assessments (screening_id,photo_id,ai_model_id,requested_by,localization) VALUES (%L,%L,%s,%L,%L)', s1, ph1, model, u_hw, '{"box":[1,2,3,4]}')], 'does not support localisation');
  INSERT INTO tbl_ai_assessments (screening_id, photo_id, ai_model_id, requested_by) VALUES (s1, ph1, model, u_hw) RETURNING id INTO ai1;
  SELECT model_provider = 'mock' AND requires_clinician_review AND NOT clinical_use AND warning ILIKE '%NOT FOR CLINICAL USE%' INTO b FROM tbl_ai_assessments WHERE id = ai1;
  PERFORM pg_temp.chk('AI queued: provider snapshot, requires clinician review, NOT FOR CLINICAL USE', b);
  PERFORM pg_temp.ef('AI COMPLETED without a result label blocked',
    ARRAY[format('UPDATE tbl_ai_assessments SET status=%L WHERE id=%L', 'COMPLETED', ai1)], 'ck_ai_completed_has_label');
  UPDATE tbl_ai_assessments SET status = 'COMPLETED', result_label = 'SUSPICIOUS_FOR_CLINICAL_REVIEW', image_quality_status = 'ACCEPTABLE', score = 0.8, completed_at = now() WHERE id = ai1;
  PERFORM pg_temp.chk('AI completed with label SUSPICIOUS_FOR_CLINICAL_REVIEW (not a diagnosis label)', true);
  PERFORM pg_temp.ef('finished AI output is immutable',
    ARRAY[format('UPDATE tbl_ai_assessments SET result_label=%L WHERE id=%L', 'NO_SUSPICIOUS_FINDING_DEMO', ai1)], 'immutable');
  PERFORM pg_temp.go(s1, 'AWAITING_CLINICIAN');

  step := 'doctor review is mandatory';
  PERFORM pg_temp.ef('AI cannot bypass doctor: AWAITING_CLINICIAN -> REVIEWED without signed review',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'REVIEWED', s1)], 'without a signed clinician review');
  PERFORM pg_temp.ef('bypass via MISSED -> APPOINTED blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'MISSED', s1), format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'APPOINTED', s1)], 'APPOINTED needs');
  PERFORM pg_temp.ef('bypass via LOST_CONTACT -> DIAGNOSTICS_PENDING blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'LOST_CONTACT', s1), format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'DIAGNOSTICS_PENDING', s1)], 'DIAGNOSTICS_PENDING needs');
  PERFORM pg_temp.ef('skip AWAITING_CLINICIAN -> REFERRAL_PLANNED blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'REFERRAL_PLANNED', s1)], 'invalid case transition');
  PERFORM pg_temp.ef('health worker cannot write a clinical review',
    ARRAY[format('INSERT INTO tbl_clinical_reviews (screening_id,patient_id,doctor_id,finding) VALUES (%L,%L,%L,%L)', s1, p1, u_hw, 'x')], 'doctor_id must be a user with role');
  PERFORM pg_temp.ef('signing a review without a decision blocked',
    ARRAY[format('INSERT INTO tbl_clinical_reviews (screening_id,patient_id,doctor_id,finding,signed_at,signature_hash) VALUES (%L,%L,%L,%L,now(),%L)', s1, p1, u_mo, 'x', 'h')], 'ck_sign_needs_decision');
  PERFORM pg_temp.ef('doctor disagreeing with AI must write a note',
    ARRAY[format('INSERT INTO tbl_clinical_reviews (screening_id,patient_id,doctor_id,finding,ai_assessment_id,ai_agreement) VALUES (%L,%L,%L,%L,%L,%L)', s1, p1, u_mo, 'x', ai1, 'DISAGREE')], 'ck_ai_disagree_note');
  INSERT INTO tbl_clinical_reviews (screening_id, patient_id, doctor_id, finding, impression, ai_assessment_id, ai_agreement, decision, referral_reason)
  VALUES (s1, p1, u_mo, 'White patch on left buccal mucosa (synthetic)', 'Clinical suspicion', ai1, 'AGREE', 'SPECIALIST_REVIEW', 'Needs specialist assessment') RETURNING id INTO rv1;
  PERFORM pg_temp.ef('unsigned (draft) review cannot mark case REVIEWED',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'REVIEWED', s1)], 'without a signed clinician review');
  PERFORM pg_temp.ef('review update without version bump blocked',
    ARRAY[format('UPDATE tbl_clinical_reviews SET impression=%L WHERE id=%L', 'z', rv1)], 'version conflict');
  UPDATE tbl_clinical_reviews SET signed_at = now(), signature_hash = 'sig-1', version = version + 1 WHERE id = rv1;
  PERFORM pg_temp.chk('medical officer signs review', true);
  PERFORM pg_temp.ef('amending a signed review without a reason blocked',
    ARRAY[format('UPDATE tbl_clinical_reviews SET impression=%L, version=version+1 WHERE id=%L', 'z', rv1)], 'amendment_reason');
  UPDATE tbl_clinical_reviews SET impression = 'Clinical suspicion (amended)', version = version + 1, amendment_reason = 'clarified site' WHERE id = rv1;
  SELECT count(*) INTO n FROM tbl_clinical_review_versions WHERE review_id = rv1;
  PERFORM pg_temp.chk('review history snapshots kept (expect 3)', n = 3, n::text);
  PERFORM pg_temp.go(s1, 'REVIEWED');
  PERFORM pg_temp.ef('health worker cannot set clinical classification',
    ARRAY[format('INSERT INTO tbl_case_classifications (patient_id,screening_id,level,set_by) VALUES (%L,%L,%L,%L)', p1, s1, 'CLINICAL_SUSPICION', u_hw)], 'only a clinician');
  INSERT INTO tbl_case_classifications (patient_id, screening_id, level, clinical_review_id, set_by) VALUES (p1, s1, 'CLINICAL_SUSPICION', rv1, u_mo);

  step := 'referral';
  PERFORM pg_temp.ef('health worker cannot create referral',
    ARRAY[format('INSERT INTO tbl_referrals (review_id,patient_id,from_facility_id,to_hospital_id,specialty_id,priority_id,reason,created_by) VALUES (%L,%L,%s,%s,%s,%s,%L,%L)', rv1, p1, f_phc, h_ah, spec, prio, 'x', u_hw)], 'created_by must be a user with role');
  INSERT INTO tbl_referrals (review_id, patient_id, from_facility_id, to_hospital_id, specialty_id, priority_id, mode, reason, assigned_specialist_id, assigned_navigator_id, created_by)
  VALUES (rv1, p1, f_phc, h_ah, spec, prio, 'BOTH', 'Specialist review of white patch', u_sp, u_nav, u_mo) RETURNING id, referral_code INTO ref1, gen_code;
  PERFORM pg_temp.chk('medical officer creates referral, code generated', gen_code LIKE 'REF-____-______', gen_code);
  INSERT INTO tbl_referral_status_history (referral_id, to_status, changed_by) VALUES (ref1, 'PLANNED', u_mo);
  PERFORM pg_temp.go(s1, 'REFERRAL_PLANNED');
  PERFORM pg_temp.ef('REFERRAL_PLANNED -> APPOINTED without any appointment blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'APPOINTED', s1)], 'APPOINTED needs');

  step := 'specialist availability request';
  INSERT INTO tbl_specialist_availability_requests
    (referral_id, patient_id, specialist_id, hospital_id, specialty_id, requested_by, requested_start, requested_end)
  VALUES (ref1, p1, u_sp, h_ah, spec, u_hs, now() + interval '2 days', now() + interval '2 days 30 minutes')
  RETURNING id INTO availability1;
  PERFORM pg_temp.chk('pending availability request is not an appointment or slot',
    (SELECT status = 'PENDING' AND slot_id IS NULL AND video_consultation_id IS NULL
       FROM tbl_specialist_availability_requests WHERE id = availability1)
    AND NOT EXISTS (SELECT 1 FROM tbl_consultation_slots WHERE specialist_id = u_sp
                     AND slot_start > now() + interval '1 day 23 hours')
    AND NOT EXISTS (SELECT 1 FROM tbl_video_consultations WHERE referral_id = ref1));
  PERFORM pg_temp.ef('duplicate active availability request for a referral blocked',
    ARRAY[format(
      'INSERT INTO tbl_specialist_availability_requests (referral_id,patient_id,specialist_id,hospital_id,specialty_id,requested_by,requested_start,requested_end) VALUES (%L,%L,%L,%s,%s,%L,now()+interval %L,now()+interval %L)',
      ref1, p1, u_sp, h_ah, spec, u_hs, '2 days', '2 days 30 minutes'
    )], 'uq_specialist_availability_active_referral');
  UPDATE tbl_specialist_availability_requests
     SET status = 'CANCELLED', cancelled_by = u_hs, cancelled_at = now(),
         cancellation_reason = 'Synthetic workflow test cleanup'
   WHERE id = availability1;

  step := 'video consultation';
  INSERT INTO tbl_consultation_slots (specialist_id, slot_start, slot_end, created_by) VALUES (u_sp, now() + interval '1 day', now() + interval '1 day 30 minutes', u_sp) RETURNING id INTO slot1;
  PERFORM pg_temp.ef('overlapping specialist slot blocked',
    ARRAY[format('INSERT INTO tbl_consultation_slots (specialist_id,slot_start,slot_end,created_by) VALUES (%L,now()+interval %L,now()+interval %L,%L)', u_sp, '1 day 10 minutes', '1 day 40 minutes', u_sp)], 'ex_no_overlapping_slots');
  PERFORM pg_temp.ef('video consult without TELECONSULT consent blocked',
    ARRAY[format('INSERT INTO tbl_video_consultations (referral_id,patient_id,slot_id,specialist_id,requested_by,status_id) VALUES (%L,%L,%L,%L,%L,%s)', ref1, p1, slot1, u_sp, u_nav, st_req)], 'no active TELECONSULT consent');
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by) VALUES (p1, cp_tele, lang_te, 'v1', true, u_hw);
  PERFORM pg_temp.ef('video consult on another specialist slot blocked',
    ARRAY[format('INSERT INTO tbl_video_consultations (referral_id,patient_id,slot_id,specialist_id,requested_by,status_id) VALUES (%L,%L,%L,%L,%L,%s)', ref1, p1, slot1, u_sp2, u_nav, st_req)], 'must match the slot specialist');
  INSERT INTO tbl_video_consultations (referral_id, patient_id, slot_id, specialist_id, requested_by, status_id) VALUES (ref1, p1, slot1, u_sp, u_nav, st_req) RETURNING id INTO vc1;
  PERFORM pg_temp.chk('slot.is_booked set automatically on booking', (SELECT is_booked FROM tbl_consultation_slots WHERE id = slot1));
  PERFORM pg_temp.ef('double booking same slot blocked',
    ARRAY[format('INSERT INTO tbl_video_consultations (referral_id,patient_id,slot_id,specialist_id,requested_by,status_id) VALUES (%L,%L,%L,%L,%L,%s)', ref1, p1, slot1, u_sp, u_nav, st_req)], 'uq_video_active_slot');
  UPDATE tbl_video_consultations SET is_active = false, cancel_reason = 'test' WHERE id = vc1;
  PERFORM pg_temp.chk('slot.is_booked cleared when consult cancelled', NOT (SELECT is_booked FROM tbl_consultation_slots WHERE id = slot1));
  UPDATE tbl_video_consultations SET is_active = true, cancel_reason = NULL WHERE id = vc1;

  step := 'hospital appointment';
  PERFORM pg_temp.ef('health worker cannot book hospital appointment',
    ARRAY[format('INSERT INTO tbl_hospital_appointments (referral_id,patient_id,hospital_id,specialty_id,scheduled_at,status_id,booked_by) VALUES (%L,%L,%s,%s,now(),%s,%L)', ref1, p1, h_ah, spec, st_req, u_hw)], 'booked_by must be a user with role');
  INSERT INTO tbl_hospital_appointments (referral_id, patient_id, hospital_id, specialty_id, scheduled_at, status_id, booked_by, confirmed_by, confirmed_at)
  VALUES (ref1, p1, h_ah, spec, now() + interval '2 days', st_conf, u_nav, u_hs, now()) RETURNING id INTO ap1;
  INSERT INTO tbl_appointment_status_history (hospital_appointment_id, from_status_id, to_status_id, changed_by) VALUES (ap1, st_req, st_conf, u_hs);
  PERFORM pg_temp.ef('status history with two parents blocked',
    ARRAY[format('INSERT INTO tbl_appointment_status_history (hospital_appointment_id,video_consultation_id,to_status_id,changed_by) VALUES (%L,%L,%s,%L)', ap1, vc1, st_conf, u_hs)], 'ck_one_appointment_parent');
  PERFORM pg_temp.go(s1, 'APPOINTED');
  PERFORM pg_temp.ef('APPOINTED -> ASSESSED without specialist assessment blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'ASSESSED', s1)], 'ASSESSED needs');
  UPDATE tbl_hospital_appointments SET attendance = 'ATTENDED', attended_at = now(), status_id = st_done WHERE id = ap1;
  INSERT INTO tbl_consultation_notes (consultation_id, patient_id, author_id, note_text, outcome, signed_at) VALUES (vc1, p1, u_sp, 'Examined (synthetic)', 'Biopsy advised', now());
  PERFORM pg_temp.ef('navigator cannot write consultation notes',
    ARRAY[format('INSERT INTO tbl_consultation_notes (consultation_id,patient_id,author_id,note_text,version_no) VALUES (%L,%L,%L,%L,2)', vc1, p1, u_nav, 'x')], 'author_id must be a user with role');
  PERFORM pg_temp.ef('referral COMPLETED without assessment time blocked',
    ARRAY[format('UPDATE tbl_referrals SET status=%L WHERE id=%L', 'COMPLETED', ref1)], 'ck_ref_complete');
  UPDATE tbl_referrals SET status = 'COMPLETED', assessment_completed_at = now(), assessment_completed_by = u_sp WHERE id = ref1;
  PERFORM pg_temp.go(s1, 'ASSESSED');

  step := 'diagnostics';
  PERFORM pg_temp.ef('ASSESSED -> DIAGNOSTICS_PENDING without investigation order blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'DIAGNOSTICS_PENDING', s1)], 'DIAGNOSTICS_PENDING needs');
  PERFORM pg_temp.ef('navigator cannot order investigations',
    ARRAY[format('INSERT INTO tbl_investigation_orders (referral_id,patient_id,investigation_type_id,status_id,ordered_by) VALUES (%L,%L,%s,%s,%L)', ref1, p1, inv_biopsy, inv_adv, u_nav)], 'ordered_by must be a user with role');
  INSERT INTO tbl_investigation_orders (referral_id, patient_id, investigation_type_id, status_id, indication, ordered_by) VALUES (ref1, p1, inv_biopsy, inv_adv, 'Persistent white patch', u_sp) RETURNING id INTO ord1;
  PERFORM pg_temp.go(s1, 'DIAGNOSTICS_PENDING');
  PERFORM pg_temp.ef('RESULT_REVIEWED without signed pathology review blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'RESULT_REVIEWED', s1)], 'RESULT_REVIEWED needs');
  INSERT INTO tbl_pathology_reports (order_id, patient_id, report_key, checksum_sha256, mime_type, uploaded_by) VALUES (ord1, p1, 'reports/test/1.pdf', repeat('b', 64), 'application/pdf', u_sp) RETURNING id INTO rep1;
  PERFORM pg_temp.ef('health worker cannot enter a diagnosis',
    ARRAY[format('INSERT INTO tbl_pathology_reviews (report_id,patient_id,reviewer_id,diagnosis_text,diagnosis_category) VALUES (%L,%L,%L,%L,%L)', rep1, p1, u_hw, 'x', 'BENIGN')], 'reviewer_id must be a user with role');
  INSERT INTO tbl_pathology_reviews (report_id, patient_id, reviewer_id, diagnosis_text, diagnosis_category, signed_at)
  VALUES (rep1, p1, u_sp, 'Leukoplakia with mild dysplasia (synthetic)', 'PRE_MALIGNANT', now()) RETURNING id INTO pr1;
  PERFORM pg_temp.ef('signed pathology review is immutable',
    ARRAY[format('UPDATE tbl_pathology_reviews SET diagnosis_text=%L WHERE id=%L', 'x', pr1)], 'immutable');
  PERFORM pg_temp.go(s1, 'RESULT_REVIEWED');
  PERFORM pg_temp.ef('MALIGNANCY confirmed requires a MALIGNANT signed pathology review',
    ARRAY[format('INSERT INTO tbl_case_classifications (patient_id,screening_id,level,pathology_review_id,set_by) VALUES (%L,%L,%L,%L,%L)', p1, s1, 'MALIGNANCY_PATHOLOGY_CONFIRMED', pr1, u_sp)], 'category MALIGNANT');
  INSERT INTO tbl_case_classifications (patient_id, screening_id, level, pathology_review_id, set_by) VALUES (p1, s1, 'PRECANCER_CLINICIAN_CONFIRMED', pr1, u_sp);
  PERFORM pg_temp.chk('current classification = PRECANCER_CLINICIAN_CONFIRMED',
    (SELECT level::text FROM vw_case_current_classification WHERE screening_id = s1) = 'PRECANCER_CLINICIAN_CONFIRMED');

  step := 'treatment linkage';
  PERFORM pg_temp.ef('CARE_LINKED without confirmed treatment linkage blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'CARE_LINKED', s1)], 'CARE_LINKED needs');
  PERFORM pg_temp.ef('treatment STARTED without start date blocked',
    ARRAY[format('INSERT INTO tbl_treatment_linkages (referral_id,patient_id,linkage_type,status,linked_by) VALUES (%L,%L,%L,%L,%L)', ref1, p1, 'SURGERY', 'STARTED', u_sp)], 'ck_linkage_started');
  INSERT INTO tbl_treatment_linkages (referral_id, patient_id, pathology_review_id, hospital_id, linkage_type, status, planned_date, linked_by)
  VALUES (ref1, p1, pr1, h_ah, 'SURGERY', 'CONFIRMED', current_date + 7, u_sp) RETURNING id INTO tl1;
  PERFORM pg_temp.go(s1, 'CARE_LINKED');

  step := 'follow-up / navigation';
  PERFORM pg_temp.ef('follow-up task owned by a health worker blocked',
    ARRAY[format('INSERT INTO tbl_followup_tasks (referral_id,patient_id,owner_id,task_type,due_at,status_id) VALUES (%L,%L,%L,%L,now(),%s)', ref1, p1, u_hw, 'REMINDER', fs_open)], 'owner_id must be a user with role');
  INSERT INTO tbl_followup_tasks (referral_id, patient_id, owner_id, task_type, due_at, status_id, priority)
  VALUES (ref1, p1, u_nav, 'TREATMENT_LINKAGE', now() - interval '1 day', fs_open, 2) RETURNING id INTO task1;
  PERFORM pg_temp.chk('overdue task appears in vw_overdue_followups', EXISTS (SELECT 1 FROM vw_overdue_followups WHERE task_id = task1));
  INSERT INTO tbl_patient_contact_history (patient_id, task_id, contacted_by, channel, outcome) VALUES (p1, task1, u_nav, 'PHONE', 'REACHED');
  PERFORM pg_temp.ef('contact history linked to another patient task blocked',
    ARRAY[format('INSERT INTO tbl_patient_contact_history (patient_id,task_id,contacted_by,channel,outcome) VALUES (%L,%L,%L,%L,%L)', p2, task1, u_nav, 'PHONE', 'REACHED')], 'foreign key');
  INSERT INTO tbl_transport_support_records (task_id, referral_id, patient_id, from_village_id, to_hospital_id, status, arranged_by) VALUES (task1, ref1, p1, v1, h_ah, 'ARRANGED', u_nav);
  INSERT INTO tbl_case_escalations (task_id, referral_id, patient_id, reason) VALUES (task1, ref1, p1, 'Overdue treatment linkage');
  PERFORM pg_temp.ef('escalation with mismatched patient blocked',
    ARRAY[format('INSERT INTO tbl_case_escalations (task_id,referral_id,patient_id,reason) VALUES (%L,%L,%L,%L)', task1, ref1, p2, 'x')], 'foreign key');
  PERFORM pg_temp.ef('notification payload with diagnosis blocked',
    ARRAY[format('INSERT INTO tbl_notifications (patient_id,template_id,payload) VALUES (%L,%s,%L)', p1, tmpl, '{"diagnosis":"x"}')], 'ck_notification_no_sensitive');
  INSERT INTO tbl_notifications (patient_id, template_id, payload) VALUES (p1, tmpl, '{"appointment_date":"2026-11-02"}');
  PERFORM pg_temp.ef('closing a task without reason blocked',
    ARRAY[format('UPDATE tbl_followup_tasks SET closed_at=now() WHERE id=%L', task1)], 'ck_task_closed');
  PERFORM pg_temp.go(s1, 'CLOSED');
  PERFORM pg_temp.ef('CLOSED -> SCREENED blocked',
    ARRAY[format('UPDATE tbl_screenings SET case_state=%L WHERE id=%L', 'SCREENED', s1)], 'invalid case transition');

  step := 'patient-level access rules';
  PERFORM pg_temp.chk('access: registering health worker = true', fn_user_has_patient_access(u_hw, p1));
  PERFORM pg_temp.chk('access: other health worker = false', NOT fn_user_has_patient_access(u_hw2, p1));
  PERFORM pg_temp.chk('access: medical officer of facility = true', fn_user_has_patient_access(u_mo, p1));
  PERFORM pg_temp.chk('access: specialist before assignment = false', NOT fn_user_has_patient_access(u_sp, p1));
  INSERT INTO tbl_case_assignments (patient_id, referral_id, user_id, assigned_by) VALUES (p1, ref1, u_sp, u_mo);
  PERFORM pg_temp.chk('access: specialist after care assignment = true', fn_user_has_patient_access(u_sp, p1));
  PERFORM pg_temp.chk('access: system admin = false', NOT fn_user_has_patient_access(u_sa, p1));
  PERFORM pg_temp.chk('access: district admin = false', NOT fn_user_has_patient_access(u_da, p1));
  PERFORM pg_temp.ef('case assignment to system admin blocked',
    ARRAY[format('INSERT INTO tbl_case_assignments (patient_id,user_id,assigned_by) VALUES (%L,%L,%L)', p1, u_sa, u_mo)], 'user_id must be a user with role');

  step := 'reporting views';
  SELECT * INTO rec FROM vw_case_facts WHERE screening_id = s1;
  PERFORM pg_temp.chk('vw_case_facts flags (reviewed, ai_flagged, referred, assessed, appt done, biopsy, pathology, precancer, treatment)',
    rec.is_reviewed AND rec.ai_flagged AND rec.is_referred AND rec.assessment_completed AND rec.appointment_completed
    AND rec.biopsy_ordered AND rec.pathology_reviewed AND rec.precancer_confirmed AND rec.treatment_linked AND NOT rec.cancer_confirmed);
  PERFORM pg_temp.chk('vw_district_dashboard_summary aggregates the case',
    (SELECT sum(screenings_total) FROM vw_district_dashboard_summary) >= 1);
  SELECT count(*) INTO n FROM vw_patient_timeline WHERE patient_id = p1;
  PERFORM pg_temp.chk('vw_patient_timeline has events for patient', n >= 12, n::text || ' events');

  step := 'governance';
  INSERT INTO tbl_audit_logs (actor_id, actor_role, event, resource_type, resource_id) VALUES (u_mo, 'MEDICAL_OFFICER', 'REVIEW_SIGNED', 'clinical_review', rv1::text);
  PERFORM pg_temp.ef('audit log is append-only',
    ARRAY['UPDATE tbl_audit_logs SET event = ''X'''], 'append-only');
  PERFORM pg_temp.ef('identifiable export without approval blocked',
    ARRAY[format('INSERT INTO tbl_data_exports (exported_by,export_kind,contains_identifiers) VALUES (%L,%L,true)', u_da, 'cases')], 'ck_identifiable_export_approved');
  INSERT INTO tbl_offline_sync_queue (user_id, device_id, idempotency_key, entity_type, operation, payload, client_created_at) VALUES (u_hw, 'dev1', 'k1', 'patient', 'CREATE', '{}', now());
  PERFORM pg_temp.ef('offline replay with same idempotency key blocked',
    ARRAY[format('INSERT INTO tbl_offline_sync_queue (user_id,device_id,idempotency_key,entity_type,operation,payload,client_created_at) VALUES (%L,%L,%L,%L,%L,%L,now())', u_hw, 'dev1', 'k1', 'patient', 'CREATE', '{}')], 'unique|duplicate');
  PERFORM pg_temp.ef('sync CONFIRMED without server ack blocked',
    ARRAY[format('UPDATE tbl_offline_sync_queue SET status=%L WHERE user_id=%L', 'CONFIRMED', u_hw)], 'ck_confirmed_has_ack');
EXCEPTION WHEN others THEN
  INSERT INTO t_results (status, label, detail) VALUES ('FAIL', 'WORKFLOW ABORTED at step: ' || step, SQLERRM);
END $w$;
