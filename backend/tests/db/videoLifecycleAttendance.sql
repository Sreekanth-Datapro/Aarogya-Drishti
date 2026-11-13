-- Disposable PostgreSQL checks for video appointment attendance lifecycle.
-- Executed by videoLifecycleAttendance.test.js inside a rolled-back transaction.
CREATE TEMP TABLE t_vl_results (n serial, status text, label text, detail text);
CREATE FUNCTION pg_temp.vl_chk(l text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS
$f$ INSERT INTO t_vl_results (status, label, detail) VALUES (CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, l, d) $f$;
CREATE FUNCTION pg_temp.vl_user(n text, r text) RETURNS uuid LANGUAGE sql AS
$f$ INSERT INTO tbl_users (username, password_hash, full_name, role_id)
    SELECT n, 'x', n, id FROM mst_roles WHERE code = r RETURNING id $f$;
CREATE FUNCTION pg_temp.vl_go(s uuid, st text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE tbl_screenings SET case_state = st::case_state WHERE id = s;
END $f$;

DO $vl$
DECLARE
  u_hw uuid; u_mo uuid; u_sp uuid; u_nav uuid; u_hs uuid;
  f_phc bigint; h_ah bigint; v1 bigint; lang_te bigint; phc bigint;
  st_req bigint; st_conf bigint; st_done bigint; st_miss bigint; st_resched bigint;
  spec bigint; prio bigint; model bigint; sym bigint; expo bigint;
  cp_tele bigint; cp_scr bigint; cp_img bigint;
  p1 uuid; s1 uuid; c_scr uuid; c_img uuid; ph1 uuid; ai1 uuid; rv1 uuid; ref1 uuid;
  slot_past uuid; slot_new uuid; slot_other uuid;
  vc_pending uuid; vc_missed uuid; vc_new uuid;
  now_ts timestamptz := now();
BEGIN
  SELECT id INTO f_phc FROM mst_facilities WHERE code = 'FAC_PHC_GM';
  SELECT id INTO h_ah FROM mst_hospitals WHERE code = 'AH_PADERU_DEMO';
  SELECT id INTO v1 FROM mst_villages WHERE code = 'VIL_DEMO_1';
  SELECT id INTO lang_te FROM mst_languages WHERE code = 'te';
  SELECT id INTO phc FROM mst_phcs WHERE code = 'PHC_GM_DEMO';
  SELECT id INTO st_req FROM mst_appointment_statuses WHERE code = 'REQUESTED';
  SELECT id INTO st_conf FROM mst_appointment_statuses WHERE code = 'CONFIRMED';
  SELECT id INTO st_done FROM mst_appointment_statuses WHERE code = 'COMPLETED';
  SELECT id INTO st_miss FROM mst_appointment_statuses WHERE code = 'MISSED';
  SELECT id INTO st_resched FROM mst_appointment_statuses WHERE code = 'RESCHEDULED';
  SELECT id INTO spec FROM mst_specialties WHERE code = 'ORAL_MEDICINE';
  SELECT id INTO prio FROM mst_referral_priorities WHERE code = 'SOON';
  SELECT id INTO model FROM mst_ai_models WHERE model_version = 'mock-v1';
  SELECT id INTO sym FROM mst_symptoms WHERE code = 'WHITE_PATCH';
  SELECT id INTO expo FROM mst_exposure_types WHERE code = 'GUTKHA';
  SELECT id INTO cp_tele FROM mst_consent_purposes WHERE code = 'TELECONSULT';
  SELECT id INTO cp_scr FROM mst_consent_purposes WHERE code = 'SCREENING';
  SELECT id INTO cp_img FROM mst_consent_purposes WHERE code = 'IMAGE_CAPTURE';

  PERFORM pg_temp.vl_chk('lifecycle statuses configured',
    st_conf IS NOT NULL AND st_done IS NOT NULL AND st_miss IS NOT NULL AND st_resched IS NOT NULL);

  u_hw := pg_temp.vl_user('zz_vl_hw', 'HEALTH_WORKER');
  u_mo := pg_temp.vl_user('zz_vl_mo', 'MEDICAL_OFFICER');
  u_sp := pg_temp.vl_user('zz_vl_sp', 'SPECIALIST');
  u_nav := pg_temp.vl_user('zz_vl_nav', 'NAVIGATOR');
  u_hs := pg_temp.vl_user('zz_vl_hs', 'HOSPITAL_STAFF');
  INSERT INTO tbl_user_facility_assignments (user_id, facility_id, is_primary)
  VALUES (u_mo, f_phc, true);

  INSERT INTO tbl_patients (full_name, sex, age_years, village_id, phc_id, preferred_language_id, registered_facility_id, registered_by)
  VALUES ('VL Lifecycle Patient', 'FEMALE', 40, v1, phc, lang_te, f_phc, u_hw) RETURNING id INTO p1;

  INSERT INTO tbl_screenings (patient_id, examiner_id, facility_id) VALUES (p1, u_hw, f_phc) RETURNING id INTO s1;
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by)
  VALUES (p1, cp_scr, lang_te, 'v1', true, u_hw) RETURNING id INTO c_scr;
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by)
  VALUES (p1, cp_img, lang_te, 'v1', true, u_hw) RETURNING id INTO c_img;
  UPDATE tbl_screenings SET consent_id = c_scr, case_state = 'CONSENTED' WHERE id = s1;
  INSERT INTO tbl_patient_medical_histories (patient_id, history_kind, exposure_type_id, duration_years, is_current, recorded_by)
  VALUES (p1, 'EXPOSURE', expo, 5, true, u_hw);
  INSERT INTO tbl_screening_findings (screening_id, finding_kind, symptom_id, oral_site, recorded_by)
  VALUES (s1, 'SYMPTOM', sym, 'CHEEK_LINING', u_hw);
  PERFORM pg_temp.vl_go(s1, 'SCREENED');
  INSERT INTO tbl_screening_photos (screening_id, patient_id, view_type, private_key, checksum_sha256, mime_type, size_bytes, captured_by)
  VALUES (s1, p1, 'CHEEK_LINING', 'screenings/vl/1.jpg', repeat('b', 64), 'image/jpeg', 204800, u_hw) RETURNING id INTO ph1;
  INSERT INTO tbl_image_quality_results (photo_id, checker_version, status, blur_score) VALUES (ph1, 'q1', 'ACCEPTABLE', 120.5);
  INSERT INTO tbl_ai_assessments (screening_id, photo_id, ai_model_id, requested_by) VALUES (s1, ph1, model, u_hw) RETURNING id INTO ai1;
  UPDATE tbl_ai_assessments
     SET status = 'COMPLETED', result_label = 'SUSPICIOUS_FOR_CLINICAL_REVIEW',
         image_quality_status = 'ACCEPTABLE', score = 0.8, completed_at = now()
   WHERE id = ai1;
  PERFORM pg_temp.vl_go(s1, 'AWAITING_CLINICIAN');
  INSERT INTO tbl_clinical_reviews (screening_id, patient_id, doctor_id, finding, impression, ai_assessment_id, ai_agreement, decision, referral_reason)
  VALUES (s1, p1, u_mo, 'Synthetic white patch', 'Clinical suspicion', ai1, 'AGREE', 'SPECIALIST_REVIEW', 'Needs specialist')
  RETURNING id INTO rv1;
  UPDATE tbl_clinical_reviews SET signed_at = now(), signature_hash = 'vl-sig', version = version + 1 WHERE id = rv1;
  PERFORM pg_temp.vl_go(s1, 'REVIEWED');
  INSERT INTO tbl_case_classifications (patient_id, screening_id, level, clinical_review_id, set_by)
  VALUES (p1, s1, 'CLINICAL_SUSPICION', rv1, u_mo);
  INSERT INTO tbl_referrals (review_id, patient_id, from_facility_id, to_hospital_id, specialty_id, priority_id, mode, reason, assigned_specialist_id, assigned_navigator_id, created_by)
  VALUES (rv1, p1, f_phc, h_ah, spec, prio, 'VIDEO_CONSULT', 'Synthetic video referral', u_sp, u_nav, u_mo)
  RETURNING id INTO ref1;
  PERFORM pg_temp.vl_go(s1, 'REFERRAL_PLANNED');
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by)
  VALUES (p1, cp_tele, lang_te, 'v1', true, u_hw);

  INSERT INTO tbl_consultation_slots (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
  VALUES (u_sp, h_ah, now_ts - interval '2 hours', now_ts - interval '90 minutes', 'VIDEO', u_sp)
  RETURNING id INTO slot_past;
  INSERT INTO tbl_consultation_slots (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
  VALUES (u_sp, h_ah, now_ts + interval '1 day', now_ts + interval '1 day 30 minutes', 'VIDEO', u_sp)
  RETURNING id INTO slot_new;
  INSERT INTO tbl_consultation_slots (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
  VALUES (u_sp, h_ah, now_ts + interval '2 days', now_ts + interval '2 days 30 minutes', 'VIDEO', u_sp)
  RETURNING id INTO slot_other;

  -- Check 1: confirmed appointment starts PENDING
  INSERT INTO tbl_video_consultations (
    referral_id, patient_id, slot_id, specialist_id, requested_by, status_id,
    provider, room_ref, meeting_expires_at, attendance
  ) VALUES (
    ref1, p1, slot_past, u_sp, u_hs, st_conf,
    'jitsi', 'ad-vl-room-pending', now_ts - interval '30 minutes', 'PENDING'
  ) RETURNING id INTO vc_pending;
  PERFORM pg_temp.vl_chk('1 confirmed appointment has PENDING attendance',
    (SELECT attendance::text FROM tbl_video_consultations WHERE id = vc_pending) = 'PENDING');
  PERFORM pg_temp.vl_chk('1 confirmed appointment has null started_at',
    (SELECT started_at FROM tbl_video_consultations WHERE id = vc_pending) IS NULL);

  -- Check 1b: JOINED presence stamps started_at, keeps PENDING
  UPDATE tbl_video_consultations
     SET started_at = COALESCE(started_at, now_ts - interval '100 minutes')
   WHERE id = vc_pending AND attendance = 'PENDING';
  PERFORM pg_temp.vl_chk('1b JOINED presence keeps PENDING attendance',
    (SELECT attendance::text FROM tbl_video_consultations WHERE id = vc_pending) = 'PENDING'
    AND (SELECT started_at FROM tbl_video_consultations WHERE id = vc_pending) IS NOT NULL);

  -- Check 2: participation + finalize => ATTENDED/COMPLETED
  UPDATE tbl_video_consultations
     SET status_id = st_done,
         attendance = 'ATTENDED',
         ended_at = COALESCE(ended_at, now_ts)
   WHERE id = vc_pending
     AND attendance = 'PENDING'
     AND is_active IS TRUE
     AND started_at IS NOT NULL
     AND meeting_expires_at <= now_ts;
  PERFORM pg_temp.vl_chk('2 participation after expiry marks ATTENDED',
    (SELECT attendance::text FROM tbl_video_consultations WHERE id = vc_pending) = 'ATTENDED'
    AND (SELECT status_id FROM tbl_video_consultations WHERE id = vc_pending) = st_done);

  -- Check 3 / idempotency: cannot overwrite ATTENDED via PENDING filter
  UPDATE tbl_video_consultations
     SET attendance = 'NO_SHOW', status_id = st_miss
   WHERE id = vc_pending AND attendance = 'PENDING';
  PERFORM pg_temp.vl_chk('3 finalize idempotent; ATTENDED not overwritten',
    (SELECT attendance::text FROM tbl_video_consultations WHERE id = vc_pending) = 'ATTENDED');

  UPDATE tbl_video_consultations SET is_active = FALSE WHERE id = vc_pending;

  -- Check 4: no presence => MISSED after expiry
  INSERT INTO tbl_video_consultations (
    referral_id, patient_id, slot_id, specialist_id, requested_by, status_id,
    provider, room_ref, meeting_expires_at, attendance
  ) VALUES (
    ref1, p1, slot_other, u_sp, u_hs, st_conf,
    'jitsi', 'ad-vl-room-missed', now_ts - interval '10 minutes', 'PENDING'
  ) RETURNING id INTO vc_missed;
  -- Use a past slot without overlapping: free slot_other by using a dedicated past-ish future then expire via meeting_expires only
  -- slot_other is in the future; meeting_expires_at already past for finalize rule.
  UPDATE tbl_video_consultations
     SET status_id = st_miss,
         attendance = 'NO_SHOW',
         is_active = FALSE
   WHERE id = vc_missed
     AND attendance = 'PENDING'
     AND is_active IS TRUE
     AND started_at IS NULL
     AND meeting_expires_at <= now_ts;
  PERFORM pg_temp.vl_chk('4 no presence after expiry marks MISSED/NO_SHOW inactive',
    (SELECT attendance::text FROM tbl_video_consultations WHERE id = vc_missed) = 'NO_SHOW'
    AND (SELECT status_id FROM tbl_video_consultations WHERE id = vc_missed) = st_miss
    AND (SELECT is_active FROM tbl_video_consultations WHERE id = vc_missed) IS FALSE);

  -- Check 4b: time expiry alone never invents ATTENDED
  PERFORM pg_temp.vl_chk('4b MISSED row still has null started_at',
    (SELECT started_at FROM tbl_video_consultations WHERE id = vc_missed) IS NULL);

  -- Check 5/6: reschedule link; old RESCHEDULED does not block
  INSERT INTO tbl_video_consultations (
    referral_id, patient_id, slot_id, specialist_id, requested_by, status_id,
    rescheduled_from_id, attendance
  ) VALUES (
    ref1, p1, slot_new, u_sp, u_hs, st_conf, vc_missed, 'PENDING'
  ) RETURNING id INTO vc_new;
  UPDATE tbl_video_consultations
     SET status_id = st_resched, is_active = FALSE
   WHERE id = vc_missed;
  PERFORM pg_temp.vl_chk('5 replacement links rescheduled_from_id',
    (SELECT rescheduled_from_id FROM tbl_video_consultations WHERE id = vc_new) = vc_missed);
  PERFORM pg_temp.vl_chk('5 old appointment becomes RESCHEDULED inactive',
    (SELECT status_id FROM tbl_video_consultations WHERE id = vc_missed) = st_resched
    AND (SELECT is_active FROM tbl_video_consultations WHERE id = vc_missed) IS FALSE);
  PERFORM pg_temp.vl_chk('6 RESCHEDULED old does not block as active',
    NOT EXISTS (
      SELECT 1 FROM tbl_video_consultations v
       JOIN mst_appointment_statuses s ON s.id = v.status_id
      WHERE v.id = vc_missed
        AND v.is_active IS TRUE
        AND s.code IN ('REQUESTED', 'CONFIRMED', 'RESCHEDULED')
    ));
  PERFORM pg_temp.vl_chk('6 new appointment is the only active CONFIRMED',
    (SELECT count(*) FROM tbl_video_consultations v
       JOIN mst_appointment_statuses s ON s.id = v.status_id
      WHERE v.patient_id = p1 AND v.is_active IS TRUE AND s.code = 'CONFIRMED') = 1);

  -- Check 3b: future slot (no meeting_expires_at) is not finalize-eligible yet
  PERFORM pg_temp.vl_chk('3b before expiry+grace not finalize-eligible',
    NOT EXISTS (
      SELECT 1
        FROM tbl_video_consultations consultation
        JOIN mst_appointment_statuses status ON status.id = consultation.status_id
        JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
       WHERE consultation.id = vc_new
         AND consultation.is_active IS TRUE
         AND consultation.attendance = 'PENDING'
         AND status.code IN ('CONFIRMED', 'RESCHEDULED')
         AND COALESCE(
               consultation.meeting_expires_at,
               slot.slot_end + interval '15 minutes'
             ) <= now_ts
    ));

  -- Check 7 (slot concurrency): duplicate active slot blocked
  BEGIN
    INSERT INTO tbl_video_consultations (
      referral_id, patient_id, slot_id, specialist_id, requested_by, status_id
    ) VALUES (ref1, p1, slot_new, u_sp, u_hs, st_conf);
    PERFORM pg_temp.vl_chk('7 duplicate active slot blocked', false, 'insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.vl_chk('7 duplicate active slot blocked', true, SQLERRM);
  END;

  -- Check 7b: patient row exists and can be locked (app uses FOR UPDATE before insert)
  PERFORM pg_temp.vl_chk('7b patient row lock target exists',
    (SELECT id FROM tbl_patients WHERE id = p1 FOR UPDATE) = p1);

  -- Check LEFT contract: ended_at without inventing started_at
  UPDATE tbl_video_consultations
     SET ended_at = now_ts
   WHERE id = vc_new AND attendance = 'PENDING';
  PERFORM pg_temp.vl_chk('LEFT alone does not invent started_at',
    (SELECT started_at FROM tbl_video_consultations WHERE id = vc_new) IS NULL
    AND (SELECT ended_at FROM tbl_video_consultations WHERE id = vc_new) IS NOT NULL);

  -- Check 9/10 adjacent: TELECONSULT consent still required for new inserts
  INSERT INTO tbl_patient_consents (patient_id, purpose_id, language_id, consent_version, granted, captured_by)
  VALUES (p1, cp_tele, lang_te, 'v1', false, u_hw);
  BEGIN
    INSERT INTO tbl_consultation_slots (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
    VALUES (u_sp, h_ah, now_ts + interval '3 days', now_ts + interval '3 days 30 minutes', 'VIDEO', u_sp);
    INSERT INTO tbl_video_consultations (
      referral_id, patient_id, slot_id, specialist_id, requested_by, status_id
    )
    SELECT ref1, p1, id, u_sp, u_hs, st_conf
      FROM tbl_consultation_slots
     WHERE specialist_id = u_sp
     ORDER BY slot_start DESC
     LIMIT 1;
    PERFORM pg_temp.vl_chk('10 withdrawn TELECONSULT blocks insert', false, 'insert succeeded');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.vl_chk('10 withdrawn TELECONSULT blocks insert', SQLERRM ~* 'TELECONSULT|consent', SQLERRM);
  END;

END $vl$;
