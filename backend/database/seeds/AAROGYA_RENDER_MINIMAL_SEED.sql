-- =============================================================================
-- Aarogya Drishti — RENDER MINIMAL SEED (core config only)
-- Generated: 2026-11-13T19:51:30.769Z
--
-- Prerequisites: schema already loaded; master tables empty or compatible.
-- NO geography / facilities / users / clinical / transactional data.
-- Idempotent via ON CONFLICT on natural unique keys (code / composite).
--
-- Excluded by design:
--   mst_districts, mst_mandals, mst_gram_panchayats, mst_villages,
--   mst_hospitals, mst_phcs, mst_facilities, mst_screening_sites,
--   tbl_location_import_batches, mst_ai_models, mst_ui_translations,
--   mst_protocol_rules, mst_missed_reasons, tbl_users, clinical tbl_*.
-- =============================================================================

BEGIN;
INSERT INTO public.mst_languages (id, code, name_en, native_name, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'en', 'English', 'English', true),
	(2, 'te', 'Telugu', 'తెలుగు', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_appointment_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'REQUESTED', 'Requested', 'అభ్యర్థించబడింది', false, 1),
	(2, 'CONFIRMED', 'Confirmed', 'నిర్ధారించబడింది', false, 2),
	(3, 'RESCHEDULED', 'Rescheduled', 'తిరిగి షెడ్యూల్ చేయబడింది', true, 3),
	(4, 'COMPLETED', 'Completed', 'పూర్తయింది', true, 4),
	(5, 'MISSED', 'Missed', 'హాజరు కాలేదు', true, 5),
	(6, 'CANCELLED', 'Cancelled', 'రద్దు చేయబడింది', true, 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_followup_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'OPEN', 'Open', 'తెరిచి ఉంది', false, 1),
	(2, 'IN_PROGRESS', 'In progress', 'పురోగతిలో ఉంది', false, 2),
	(3, 'ESCALATED', 'Escalated', 'ఉన్నత స్థాయికి పంపబడింది', false, 3),
	(4, 'CLOSED', 'Closed', 'ముగించబడింది', true, 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_investigation_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'ADVISED', 'Advised', 'సూచించబడింది', false, 1),
	(2, 'SCHEDULED', 'Scheduled', 'షెడ్యూల్ చేయబడింది', false, 2),
	(3, 'SAMPLE_COLLECTED', 'Performed / sample collected', 'నమూనా సేకరించబడింది', false, 3),
	(4, 'REPORT_PENDING', 'Report pending', 'నివేదిక పెండింగ్‌లో ఉంది', false, 4),
	(5, 'REPORT_RECEIVED', 'Report received', 'నివేదిక అందింది', false, 5),
	(6, 'CLINICIAN_REVIEWED', 'Clinician reviewed', 'వైద్యుడు సమీక్షించారు', true, 6),
	(7, 'CANCELLED', 'Cancelled', 'రద్దు చేయబడింది', true, 7)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_consent_purposes (id, code, name_en, name_te, text_en, text_te, version, is_required, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'SCREENING', 'Oral screening examination', 'నోటి పరీక్ష', 'I agree to a demonstration oral screening examination (synthetic data only).', NULL, 'v1', true, true),
	(2, 'IMAGE_CAPTURE', 'Photograph capture', 'ఫోటో తీయడం', 'I agree to oral photographs being taken for this demonstration.', NULL, 'v1', true, true),
	(3, 'TELECONSULT', 'Video consultation', 'వీడియో సంప్రదింపు', 'I agree to a video consultation with a specialist (not recorded).', NULL, 'v1', false, true),
	(4, 'DATA_PROCESSING', 'Data processing', 'డేటా ప్రాసెసింగ్', 'I agree to my demonstration record being stored and processed securely.', NULL, 'v1', true, true),
	(5, 'AI_RESEARCH', 'Research AI demonstration', 'పరిశోధన AI ప్రదర్శన', 'I understand the AI output is a research demonstration, not a diagnosis.', NULL, 'v1', false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_exposure_types (id, code, name_en, name_te, category, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'SMOKED_TOBACCO', 'Smoked tobacco', 'పొగాకు తాగడం', 'TOBACCO', true),
	(2, 'SMOKELESS_TOBACCO', 'Chewing tobacco', 'పొగాకు నమలడం', 'TOBACCO', true),
	(3, 'GUTKHA', 'Gutkha', 'గుట్కా', 'TOBACCO', true),
	(4, 'REVERSE_SMOKING', 'Reverse smoking', 'రివర్స్ స్మోకింగ్', 'TOBACCO', true),
	(5, 'ARECA_NUT', 'Areca nut / betel quid', 'వక్క / తాంబూలం', 'ARECA', true),
	(6, 'ALCOHOL', 'Alcohol', 'మద్యం', 'ALCOHOL', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_symptoms (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'MOUTH_ULCER', 'Non-healing mouth ulcer', 'మానని నోటి పుండు', true),
	(2, 'WHITE_PATCH', 'White patch', 'తెల్లని మచ్చ', true),
	(3, 'RED_PATCH', 'Red patch', 'ఎర్రని మచ్చ', true),
	(4, 'PAIN', 'Pain in mouth', 'నోటిలో నొప్పి', true),
	(5, 'DIFFICULTY_SWALLOWING', 'Difficulty swallowing', 'మింగడంలో ఇబ్బంది', true),
	(6, 'LIMITED_MOUTH_OPENING', 'Limited mouth opening', 'నోరు తెరవడంలో ఇబ్బంది', true),
	(7, 'BLEEDING', 'Bleeding', 'రక్తస్రావం', true),
	(8, 'VISIBLE_GROWTH', 'Visible growth / lump', 'నోటిలో గడ్డ', true),
	(9, 'NECK_SWELLING', 'Neck swelling', 'మెడలో వాపు', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_diagnostic_categories (id, code, name_en, name_te, sort_order, is_active, created_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 'LAB', 'Laboratory', 'ప్రయోగశాల', 10, true, '2026-11-11 22:10:42.069943+05:30'),
	(2, 'PATHOLOGY', 'Pathology', 'పాథాలజీ', 30, true, '2026-11-11 22:10:42.069943+05:30'),
	(3, 'IMAGING', 'Imaging', 'ఇమేజింగ్', 20, true, '2026-11-11 22:10:42.069943+05:30'),
	(4, 'CLINICAL', 'Clinical examination', 'వైద్య పరీక్ష', 40, true, '2026-11-11 22:10:42.069943+05:30')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_investigation_types (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'CLINICAL_REEXAM', 'Specialist clinical re-examination', 'నిపుణుల తిరిగి పరీక్ష', true),
	(2, 'BIOPSY', 'Biopsy', 'బయాప్సీ', true),
	(3, 'HISTOPATHOLOGY', 'Histopathology', 'హిస్టోపాథాలజీ', true),
	(4, 'CT', 'CT scan', 'సిటి స్కాన్', true),
	(5, 'MRI', 'MRI scan', 'ఎంఆర్‌ఐ స్కాన్', true),
	(6, 'OTHER', 'Other investigation', 'ఇతర పరీక్ష', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_diagnostic_tests (id, category_id, code, name_en, name_te, default_fasting, investigation_type_id, is_active, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 4, 'CLINICAL_REEXAM', 'Specialist clinical re-examination', 'నిపుణుల తిరిగి పరీక్ష', false, 1, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(2, 2, 'BIOPSY', 'Biopsy', 'బయాప్సీ', false, 2, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(3, 2, 'HISTOPATHOLOGY', 'Histopathology', 'హిస్టోపాథాలజీ', false, 3, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(4, 3, 'CT', 'CT scan', 'సిటి స్కాన్', true, 4, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(5, 3, 'MRI', 'MRI scan', 'ఎంఆర్‌ఐ స్కాన్', true, 5, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(6, 1, 'OTHER', 'Other investigation', 'ఇతర పరీక్ష', false, 6, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(7, 2, 'CYTOLOGY', 'Cytology smear', 'సైటాలజీ స్మియర్', false, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(8, 1, 'BLOOD_GLUCOSE', 'Blood glucose', 'రక్తంలో చక్కెర', true, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(9, 3, 'OPG', 'Orthopantomogram (OPG)', 'ఓపిజి ఎక్స్-రే', false, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(10, 1, 'CBC', 'Complete blood count', 'పూర్తి రక్త గణన', true, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(16, 3, 'ULTRASOUND', 'Ultrasound', 'అల్ట్రాసౌండ్', false, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(17, 3, 'MRI_BRAIN', 'MRI Brain', 'ఎంఆర్‌ఐ మెదడు', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(18, 3, 'XRAY', 'X-Ray', 'ఎక్స్-రే', false, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(19, 3, 'MRI_SPINE', 'MRI Spine', 'ఎంఆర్‌ఐ వెన్నెముక', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(20, 3, 'MRI_OTHER', 'MRI Other', 'ఎంఆర్‌ఐ ఇతర', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_specialties (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'ORAL_MEDICINE', 'Oral medicine', 'ఓరల్ మెడిసిన్', true),
	(2, 'ORAL_SURGERY', 'Oral & maxillofacial surgery', 'నోరు మరియు దవడ శస్త్రచికిత్స', true),
	(3, 'ENT', 'ENT', 'చెవి ముక్కు గొంతు (ENT)', true),
	(4, 'ONCOLOGY', 'Oncology', 'ఆంకాలజీ', true),
	(5, 'PATHOLOGY', 'Pathology', 'పాథాలజీ', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_referral_priorities (id, code, name_en, name_te, priority_rank, target_days, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'URGENT', 'Urgent', 'అత్యవసరం', 1, NULL, true),
	(2, 'SOON', 'Soon', 'త్వరగా', 2, NULL, true),
	(3, 'ROUTINE', 'Routine', 'సాధారణం', 3, NULL, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_notification_templates (id, code, language_id, channel, subject, body, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'MISSED_VISIT', 1, 'IN_APP', 'Missed visit', 'We missed you at your appointment. Please contact us to choose a new date.', true),
	(2, 'FOLLOWUP_REMINDER', 1, 'IN_APP', 'Follow-up reminder', 'Your follow-up visit is pending. Please contact your health worker.', true),
	(3, 'APPT_REMINDER', 1, 'IN_APP', 'Appointment reminder', 'Reminder: you have an upcoming appointment. Please contact your health worker for details.', true),
	(4, 'MISSED_VISIT', 2, 'IN_APP', 'హాజరు కాలేదు', 'మీరు అపాయింట్‌మెంట్‌కు రాలేకపోయారు. కొత్త తేదీ కోసం దయచేసి సంప్రదించండి.', true),
	(5, 'FOLLOWUP_REMINDER', 2, 'IN_APP', 'ఫాలో-అప్ రిమైండర్', 'మీ ఫాలో-అప్ సందర్శన పెండింగ్‌లో ఉంది. దయచేసి మీ ఆరోగ్య కార్యకర్తను సంప్రదించండి.', true),
	(6, 'APPT_REMINDER', 2, 'IN_APP', 'అపాయింట్‌మెంట్ రిమైండర్', 'గుర్తు చేస్తున్నాము: మీకు త్వరలో అపాయింట్‌మెంట్ ఉంది. వివరాల కోసం దయచేసి మీ ఆరోగ్య కార్యకర్తను సంప్రదించండి.', true),
	(7, 'CARE_CASE_CLOSED', 1, 'IN_APP', 'Case closed', 'A patient care case was closed after final review.', true),
	(8, 'CARE_FINAL_CHECKUP', 1, 'IN_APP', 'Final checkup pending', 'A patient is ready for Medical Officer final checkup.', true),
	(9, 'CARE_DISCOMFORT_ALERT', 1, 'IN_APP', 'Patient discomfort alert', 'A patient discomfort report needs attention.', true),
	(10, 'CARE_FOLLOWUP_SUBMITTED', 1, 'IN_APP', 'Follow-up report received', 'A Health Worker submitted a follow-up report.', true),
	(11, 'CARE_FOLLOWUP_ASSIGNED', 1, 'IN_APP', 'Follow-up assigned', 'A patient follow-up visit has been assigned to you.', true),
	(12, 'CARE_PLAN_READY', 1, 'IN_APP', 'Care plan ready', 'A treatment plan is ready for follow-up coordination.', true),
	(13, 'CARE_CASE_CLOSED', 2, 'IN_APP', 'కేసు మూసివేయబడింది', 'చివరి సమీక్ష తర్వాత రోగి సంరక్షణ కేసు మూసివేయబడింది.', true),
	(14, 'CARE_FINAL_CHECKUP', 2, 'IN_APP', 'చివరి పరీక్ష పెండింగ్', 'రోగి వైద్య అధికారి చివరి పరీక్షకు సిద్ధం.', true),
	(15, 'CARE_DISCOMFORT_ALERT', 2, 'IN_APP', 'రోగి అసౌకర్య హెచ్చరిక', 'రోగి అసౌకర్య నివేదికకు దృష్టి అవసరం.', true),
	(16, 'CARE_FOLLOWUP_SUBMITTED', 2, 'IN_APP', 'ఫాలో-అప్ నివేదిక వచ్చింది', 'ఆరోగ్య కార్యకర్త ఫాలో-అప్ నివేదిక సమర్పించారు.', true),
	(17, 'CARE_FOLLOWUP_ASSIGNED', 2, 'IN_APP', 'ఫాలో-అప్ కేటాయించబడింది', 'రోగి ఫాలో-అప్ సందర్శన మీకు కేటాయించబడింది.', true),
	(18, 'CARE_PLAN_READY', 2, 'IN_APP', 'చికిత్స ప్రణాళిక సిద్ధం', 'ఫాలో-అప్ సమన్వయం కోసం చికిత్స ప్రణాళిక సిద్ధంగా ఉంది.', true),
	(19, 'CARE_DURATION_DUE', 1, 'IN_APP', 'Treatment or revisit due', 'A patient treatment duration or hospital revisit date is due. Coordinate follow-up; do not close the case.', true),
	(20, 'DIAGNOSTIC_REPORT_UPLOADED', 1, 'IN_APP', 'Diagnostic report uploaded', 'A diagnostic report was uploaded and is ready for review.', true),
	(21, 'CARE_DURATION_DUE', 2, 'IN_APP', 'చికిత్స లేదా రీవిజిట్ గడువు', 'రోగి చికిత్స వ్యవధి లేదా ఆసుపత్రి రీవిజిట్ తేదీ వచ్చింది. ఫాలో-అప్ సమన్వయం చేయండి; కేసు మూసివేయవద్దు.', true),
	(22, 'DIAGNOSTIC_REPORT_UPLOADED', 2, 'IN_APP', 'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది', 'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది. సమీక్షకు సిద్ధం.', true),
	(23, 'CARE_REVISIT_MISSED', 1, 'IN_APP', 'Hospital revisit missed', 'A patient hospital revisit date passed without attendance. Coordinate a new revisit. Do not close the case.', true),
	(24, 'CARE_REVISIT_MISSED', 2, 'IN_APP', 'ఆసుపత్రి రీవిజిట్ మిస్ అయింది', 'రోగి ఆసుపత్రి రీవిజిట్ తేదీ హాజరు లేకుండా గడిచింది. కొత్త రీవిజిట్ సమన్వయం చేయండి. కేసు మూసివేయవద్దు.', true),
	(25, 'CARE_RETURN_AUTHORIZED', 1, 'IN_APP', 'Return to MO authorized', 'Specialist authorized return to Medical Officer community care. Confirm only after Specialist care is no longer active.', true),
	(26, 'CARE_RETURN_AUTHORIZED', 2, 'IN_APP', 'MO కు తిరిగి రాక అనుమతి', 'స్పెషలిస్ట్ వైద్య అధికారి కమ్యూనిటీ సంరక్షణకు తిరిగి రాకను అనుమతించారు. స్పెషలిస్ట్ సంరక్షణ క్రియాశీలంగా లేనప్పుడు మాత్రమే నిర్ధారించండి.', true),
	(41, 'DIAGNOSTIC_FOLLOWUP_DONE', 1, 'IN_APP', 'Diagnostic patient follow-up recorded', 'Health Worker recorded patient acknowledgement of Specialist advice.', true),
	(42, 'DIAGNOSTIC_ADVICE_TO_HW', 1, 'IN_APP', 'Specialist advice for patient follow-up', 'Navigator forwarded signed Specialist advice for patient communication.', true),
	(43, 'DIAGNOSTIC_ADVICE_SIGNED', 1, 'IN_APP', 'Specialist diagnostic advice signed', 'Specialist signed diagnostic advice. Forward instructions to the Health Worker.', true),
	(44, 'DIAGNOSTIC_ROUTED_SPECIALIST', 1, 'IN_APP', 'Diagnostic report awaiting your review', 'Hospital Staff routed a diagnostic report for your clinical review.', true),
	(45, 'DIAGNOSTIC_FORWARDED_HS', 1, 'IN_APP', 'Diagnostic report for Hospital Staff', 'Navigator forwarded a verified diagnostic report for Specialist routing.', true),
	(46, 'DIAGNOSTIC_RETURNED', 1, 'IN_APP', 'Diagnostic submission returned', 'Navigator returned a diagnostic submission for correction.', true),
	(47, 'DIAGNOSTIC_NAV_ASSIGN_HW', 1, 'IN_APP', 'Diagnostic collection assigned', 'Navigator assigned a diagnostic collection task to you.', true),
	(48, 'DIAGNOSTIC_FOLLOWUP_DONE', 2, 'IN_APP', 'డయాగ్నస్టిక్ రోగి ఫాలో-అప్ నమోదు', 'ఆరోగ్య కార్యకర్త స్పెషలిస్ట్ సలహా రోగి అంగీకారాన్ని నమోదు చేశారు.', true),
	(49, 'DIAGNOSTIC_ADVICE_TO_HW', 2, 'IN_APP', 'రోగి ఫాలో-అప్ కోసం స్పెషలిస్ట్ సలహా', 'నావిగేటర్ సంతకం చేసిన స్పెషలిస్ట్ సలహాను రోగి సంప్రదింపు కోసం పంపారు.', true),
	(50, 'DIAGNOSTIC_ADVICE_SIGNED', 2, 'IN_APP', 'స్పెషలిస్ట్ సలహా సంతకం అయింది', 'స్పెషలిస్ట్ డయాగ్నస్టిక్ సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు సూచనలు పంపండి.', true),
	(51, 'DIAGNOSTIC_ROUTED_SPECIALIST', 2, 'IN_APP', 'మీ సమీక్ష కోసం డయాగ్నస్టిక్ నివేదిక', 'ఆసుపత్రి సిబ్బంది డయాగ్నస్టిక్ నివేదికను మీ వైద్య సమీక్షకు పంపారు.', true),
	(52, 'DIAGNOSTIC_FORWARDED_HS', 2, 'IN_APP', 'ఆసుపత్రి సిబ్బందికి డయాగ్నస్టిక్ నివేదిక', 'నావిగేటర్ ధృవీకరించిన డయాగ్నస్టిక్ నివేదికను స్పెషలిస్ట్ మార్గానికి పంపారు.', true),
	(53, 'DIAGNOSTIC_RETURNED', 2, 'IN_APP', 'డయాగ్నస్టిక్ సమర్పణ తిరిగి పంపబడింది', 'నావిగేటర్ డయాగ్నస్టిక్ సమర్పణను సరిదిద్దడానికి తిరిగి పంపారు.', true),
	(54, 'DIAGNOSTIC_NAV_ASSIGN_HW', 2, 'IN_APP', 'డయాగ్నస్టిక్ సేకరణ కేటాయించబడింది', 'నావిగేటర్ మీకు డయాగ్నస్టిక్ సేకరణ పని కేటాయించారు.', true),
	(55, 'DIAGNOSTIC_CASE_CLOSED', 1, 'IN_APP', 'Diagnostic follow-up case closed', 'Specialist closed the diagnostic follow-up case. No further follow-up is required.', true),
	(56, 'DIAGNOSTIC_FOLLOWUP_OVERDUE', 1, 'IN_APP', 'Patient follow-up overdue', 'A Specialist-defined patient follow-up is overdue. Contact the patient and submit the report.', true),
	(57, 'DIAGNOSTIC_FOLLOWUP_DUE', 1, 'IN_APP', 'Patient follow-up due', 'A Specialist-defined patient follow-up is due.', true),
	(58, 'DIAGNOSTIC_REASSESSMENT_ADVICE', 1, 'IN_APP', 'Updated Specialist advice after reassessment', 'Specialist signed updated advice after reassessment. Forward to Health Worker.', true),
	(59, 'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 1, 'IN_APP', 'Follow-up ready for reassessment', 'Navigator forwarded a verified patient follow-up for Specialist reassessment.', true),
	(60, 'DIAGNOSTIC_FOLLOWUP_RETURNED', 1, 'IN_APP', 'Follow-up report returned', 'Navigator returned a patient follow-up report for correction.', true),
	(61, 'DIAGNOSTIC_CASE_CLOSED', 2, 'IN_APP', 'డయాగ్నస్టిక్ ఫాలో-అప్ కేసు మూసివేయబడింది', 'స్పెషలిస్ట్ డయాగ్నస్టిక్ ఫాలో-అప్ కేసును మూసివేశారు. మరిన్ని ఫాలో-అప్‌లు అవసరం లేదు.', true),
	(62, 'DIAGNOSTIC_FOLLOWUP_OVERDUE', 2, 'IN_APP', 'రోగి ఫాలో-అప్ గడువు దాటింది', 'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు దాటింది. రోగిని సంప్రదించి నివేదిక సమర్పించండి.', true),
	(63, 'DIAGNOSTIC_FOLLOWUP_DUE', 2, 'IN_APP', 'రోగి ఫాలో-అప్ గడువు', 'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు వచ్చింది.', true),
	(64, 'DIAGNOSTIC_REASSESSMENT_ADVICE', 2, 'IN_APP', 'పునఃసమీక్ష తర్వాత నవీకరించిన సలహా', 'స్పెషలిస్ట్ పునఃసమీక్ష తర్వాత నవీకరించిన సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు పంపండి.', true),
	(65, 'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 2, 'IN_APP', 'పునఃసమీక్ష కోసం ఫాలో-అప్', 'నావిగేటర్ ధృవీకరించిన రోగి ఫాలో-అప్‌ను స్పెషలిస్ట్ పునఃసమీక్షకు పంపారు.', true),
	(66, 'DIAGNOSTIC_FOLLOWUP_RETURNED', 2, 'IN_APP', 'ఫాలో-అప్ నివేదిక తిరిగి పంపబడింది', 'నావిగేటర్ రోగి ఫాలో-అప్ నివేదికను సరిదిద్దడానికి తిరిగి పంపారు.', true)
ON CONFLICT (code, language_id, channel) DO NOTHING;

INSERT INTO public.mst_roles (id, code, name_en, name_te, description, mfa_required, is_active, created_at, is_system_role) OVERRIDING SYSTEM VALUE VALUES
	(1, 'HEALTH_WORKER', 'Village health worker', 'గ్రామ ఆరోగ్య కార్యకర్త', 'Registers patients, screening intake, image capture, assigned follow-up', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(2, 'MEDICAL_OFFICER', 'Medical Officer', 'వైద్యాధికారి', 'Reviews findings independently of AI, signs review, decides referral', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(3, 'SPECIALIST', 'Specialist', 'నిపుణ వైద్యుడు', 'Sees referred cases, consultations, investigations', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(4, 'NAVIGATOR', 'Patient navigator', 'రోగి మార్గదర్శకుడు', 'Appointments, contacts, transport, missed-visit workflow', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(5, 'HOSPITAL_STAFF', 'Hospital staff', 'ఆసుపత్రి సిబ్బంది', 'Confirms / reschedules hospital appointments, records attendance', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(6, 'DISTRICT_ADMIN', 'District administrator', 'జిల్లా నిర్వాహకుడు', 'Aggregated programme indicators only; no default access to identifiable records', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(7, 'SYSTEM_ADMIN', 'System administrator', 'సిస్టమ్ నిర్వాహకుడు', 'User management and audit review; no clinical record access', true, false, '2026-10-31 17:01:20.369913+05:30', true),
	(8, 'SUPER_ADMIN', 'Super administrator', 'సూపర్ నిర్వాహకుడు', 'Manages system administrators, master data and platform settings; no clinical record access', true, true, '2026-10-31 18:14:10.324168+05:30', true)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_te = EXCLUDED.name_te,
  description = EXCLUDED.description,
  mfa_required = EXCLUDED.mfa_required,
  is_active = EXCLUDED.is_active,
  is_system_role = EXCLUDED.is_system_role;

INSERT INTO public.mst_permissions (id, code, resource, action, description, created_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 'patient.register', 'patient', 'create', 'Register synthetic patient', '2026-10-31 17:01:20.369913+05:30'),
	(2, 'patient.read_assigned', 'patient', 'read', 'Read patients within a care relationship', '2026-10-31 17:01:20.369913+05:30'),
	(3, 'consent.record', 'consent', 'create', 'Record purpose-specific consent', '2026-10-31 17:01:20.369913+05:30'),
	(4, 'screening.create', 'screening', 'create', 'Create screening and history', '2026-10-31 17:01:20.369913+05:30'),
	(5, 'image.upload', 'image', 'create', 'Upload oral photo for assigned screening', '2026-10-31 17:01:20.369913+05:30'),
	(6, 'image.view', 'image', 'read', 'View image via short-lived signed access (audited)', '2026-10-31 17:01:20.369913+05:30'),
	(7, 'ai.analyze', 'ai', 'create', 'Queue non-clinical AI analysis', '2026-10-31 17:01:20.369913+05:30'),
	(8, 'review.create', 'review', 'create', 'Save clinician observations', '2026-10-31 17:01:20.369913+05:30'),
	(9, 'review.sign', 'review', 'sign', 'Sign clinical review', '2026-10-31 17:01:20.369913+05:30'),
	(10, 'referral.create', 'referral', 'create', 'Create specialist referral', '2026-10-31 17:01:20.369913+05:30'),
	(11, 'referral.view', 'referral', 'read', 'View referrals in care relationship', '2026-10-31 17:01:20.369913+05:30'),
	(12, 'appointment.book', 'appointment', 'create', 'Book or request appointment', '2026-10-31 17:01:20.369913+05:30'),
	(13, 'appointment.confirm', 'appointment', 'confirm', 'Confirm / reschedule hospital appointment, record attendance', '2026-10-31 17:01:20.369913+05:30'),
	(14, 'appointment.view', 'appointment', 'read', 'View appointments', '2026-10-31 17:01:20.369913+05:30'),
	(15, 'video.join', 'video', 'join', 'Join authorised video consultation', '2026-10-31 17:01:20.369913+05:30'),
	(16, 'consultation.note', 'consultation', 'create', 'Record consultation notes and outcome', '2026-10-31 17:01:20.369913+05:30'),
	(17, 'investigation.record', 'investigation', 'create', 'Order / track biopsy and investigations', '2026-10-31 17:01:20.369913+05:30'),
	(18, 'pathology.review', 'pathology', 'review', 'Enter diagnosis on a pathology report', '2026-10-31 17:01:20.369913+05:30'),
	(19, 'classification.set', 'classification', 'create', 'Set clinician classification', '2026-10-31 17:01:20.369913+05:30'),
	(20, 'treatment.link', 'treatment', 'create', 'Create treatment linkage', '2026-10-31 17:01:20.369913+05:30'),
	(21, 'treatment.track', 'treatment', 'update', 'Track treatment initiation', '2026-10-31 17:01:20.369913+05:30'),
	(22, 'navigation.update', 'navigation', 'update', 'Track contact and attendance', '2026-10-31 17:01:20.369913+05:30'),
	(23, 'case.assign', 'case', 'assign', 'Assign care team / navigator', '2026-10-31 17:01:20.369913+05:30'),
	(24, 'dashboard.view_aggregate', 'dashboard', 'read', 'View aggregate reporting', '2026-10-31 17:01:20.369913+05:30'),
	(25, 'export.aggregate', 'export', 'create', 'Export aggregate report', '2026-10-31 17:01:20.369913+05:30'),
	(26, 'user.manage', 'user', 'manage', 'Manage users and assignments', '2026-10-31 17:01:20.369913+05:30'),
	(27, 'registration.review', 'registration', 'review', 'Approve / reject health worker registration requests', '2026-10-31 17:01:20.369913+05:30'),
	(28, 'audit.view', 'audit', 'read', 'View audit trail', '2026-10-31 17:01:20.369913+05:30'),
	(29, 'master.view', 'master', 'read', 'View master data (geography and facilities)', '2026-10-31 18:14:10.324168+05:30'),
	(30, 'master.manage', 'master', 'manage', 'Create, update and deactivate master data', '2026-10-31 18:14:10.324168+05:30'),
	(31, 'user.create_staff', 'user', 'create', 'Create Medical Officer, Specialist, Navigator, Hospital Staff and District Admin accounts', '2026-10-31 18:14:10.324168+05:30'),
	(32, 'user.create_admin', 'user', 'create', 'Create System Administrator accounts', '2026-10-31 18:14:10.324168+05:30'),
	(33, 'registration.verify', 'registration', 'verify', 'Verify health worker registrations for own facility', '2026-10-31 18:14:10.324168+05:30'),
	(34, 'settings.manage', 'settings', 'manage', 'Manage platform settings', '2026-10-31 18:14:10.324168+05:30'),
	(35, 'master.import', 'master', 'import', 'Import location master data from LGD and add locations manually', '2026-10-31 20:58:54.038049+05:30'),
	(36, 'role.manage', 'role', 'manage', 'Create and manage custom roles and permissions', '2026-11-03 12:11:43.112455+05:30'),
	(37, 'district_admin.manage', 'district_admin', 'manage', 'Create and map District Admin accounts', '2026-11-03 12:11:43.112455+05:30'),
	(38, 'registration.monitor', 'registration', 'read', 'Monitor Health Worker registration requests without approving or rejecting them', '2026-11-03 17:57:01.917852+05:30'),
	(39, 'registration.recommend', 'registration', 'recommend', 'Recommend a Health Worker registration in an assigned Mandal', '2026-11-07 16:45:27.233725+05:30'),
	(40, 'registration.finalize', 'registration', 'finalize', 'Make a final Health Worker registration decision within the assigned district', '2026-11-07 16:45:27.233725+05:30'),
	(41, 'appointment.slot_manage', 'appointment_slot', 'manage', 'Create, view, and cancel own Specialist consultation availability slots', '2026-11-10 06:21:11.333947+05:30'),
	(42, 'care.discomfort_report', 'care', 'escalate', 'Report patient discomfort during treatment', '2026-11-11 17:40:40.190042+05:30'),
	(43, 'care.final_review', 'care', 'review', 'Perform Medical Officer final checkup', '2026-11-11 17:40:40.190042+05:30'),
	(44, 'care.close', 'care', 'close', 'Close a care plan after recovery confirmation', '2026-11-11 17:40:40.190042+05:30'),
	(45, 'care.followup_assign', 'care', 'assign', 'Assign Health Worker field follow-ups', '2026-11-11 17:40:40.190042+05:30'),
	(46, 'care.plan_manage', 'care', 'manage', 'Create and update community care treatment plans', '2026-11-11 17:40:40.190042+05:30'),
	(47, 'care.followup_report', 'care', 'report', 'Submit Health Worker follow-up reports', '2026-11-11 17:40:40.190042+05:30'),
	(48, 'diagnostic.view', 'diagnostic', 'view', 'View diagnostic orders for assigned patients', '2026-11-11 22:10:42.069943+05:30'),
	(49, 'diagnostic.schedule', 'diagnostic', 'schedule', 'Request diagnostic appointment scheduling', '2026-11-11 22:22:30.154835+05:30'),
	(50, 'diagnostic.confirm', 'diagnostic', 'confirm', 'Confirm, reschedule or cancel diagnostic appointments', '2026-11-11 22:22:30.154835+05:30'),
	(51, 'diagnostic.followup', 'diagnostic', 'followup', 'Record patient contact and attendance for diagnostics', '2026-11-11 22:22:30.154835+05:30'),
	(52, 'diagnostic.report_upload', 'diagnostic', 'upload', 'Upload diagnostic order reports (PDF/JPG/PNG)', '2026-11-12 03:32:46.290039+05:30'),
	(53, 'diagnostic.report_review', 'diagnostic', 'review', 'Review uploaded diagnostic order reports', '2026-11-12 03:32:46.290039+05:30'),
	(54, 'page.healthWorkerAppointments', 'page', 'access', 'Open health worker appointments', '2026-11-12 05:04:35.351475+05:30'),
	(55, 'page.navVideo', 'page', 'access', 'Open navigator video module', '2026-11-12 05:04:35.351475+05:30'),
	(56, 'page.districtSpecialists', 'page', 'access', 'Open district specialists staff page', '2026-11-12 05:04:35.351475+05:30'),
	(57, 'page.moClinicalNotes', 'page', 'access', 'Open medical officer clinical notes', '2026-11-12 05:04:35.351475+05:30'),
	(58, 'page.moFollowUp', 'page', 'access', 'Open medical officer follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(59, 'page.districtNavigators', 'page', 'access', 'Open district navigators staff page', '2026-11-12 05:04:35.351475+05:30'),
	(60, 'page.appointments', 'page', 'access', 'Open hospital staff appointments', '2026-11-12 05:04:35.351475+05:30'),
	(61, 'page.registrations', 'page', 'access', 'Open registrations module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(62, 'page.navAppointments', 'page', 'access', 'Open navigator appointments', '2026-11-12 05:04:35.351475+05:30'),
	(63, 'page.spFollowUps', 'page', 'access', 'Open specialist care / follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(64, 'page.districtFacilities', 'page', 'access', 'Open district facilities view', '2026-11-12 05:04:35.351475+05:30'),
	(65, 'page.registrationMonitoring', 'page', 'access', 'Open registration monitoring', '2026-11-12 05:04:35.351475+05:30'),
	(66, 'page.districtHealthWorkers', 'page', 'access', 'Open district health workers', '2026-11-12 05:04:35.351475+05:30'),
	(67, 'page.navDiagnostics', 'page', 'access', 'Open navigator diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(68, 'page.moProfile', 'page', 'access', 'Open medical officer profile', '2026-11-12 05:04:35.351475+05:30'),
	(69, 'page.navReferrals', 'page', 'access', 'Open navigator referrals', '2026-11-12 05:04:35.351475+05:30'),
	(70, 'page.districtPatients', 'page', 'access', 'Open district patients', '2026-11-12 05:04:35.351475+05:30'),
	(71, 'page.staffManagement', 'page', 'access', 'Open staff management', '2026-11-12 05:04:35.351475+05:30'),
	(72, 'page.hsDiagnostics', 'page', 'access', 'Open hospital staff diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(73, 'page.spVideo', 'page', 'access', 'Open specialist video module', '2026-11-12 05:04:35.351475+05:30'),
	(74, 'page.districtProgramme', 'page', 'access', 'Open district programme dashboard', '2026-11-12 05:04:35.351475+05:30'),
	(75, 'page.moReferrals', 'page', 'access', 'Open medical officer referrals', '2026-11-12 05:04:35.351475+05:30'),
	(76, 'page.districtTracking', 'page', 'access', 'Open district patient tracking', '2026-11-12 05:04:35.351475+05:30'),
	(77, 'page.attendance', 'page', 'access', 'Open hospital staff attendance', '2026-11-12 05:04:35.351475+05:30'),
	(78, 'page.spDiagnostics', 'page', 'access', 'Open specialist diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(79, 'page.spTracking', 'page', 'access', 'Open specialist tracking', '2026-11-12 05:04:35.351475+05:30'),
	(80, 'page.adminAccounts', 'page', 'access', 'Open admin accounts module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(81, 'page.masterData', 'page', 'access', 'Open master data module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(82, 'page.districtRegistrations', 'page', 'access', 'Open district registration approvals', '2026-11-12 05:04:35.351475+05:30'),
	(83, 'page.facilities', 'page', 'access', 'Open facility list and details', '2026-11-12 05:04:35.351475+05:30'),
	(84, 'page.settings', 'page', 'access', 'Open account/settings navigation', '2026-11-12 05:04:35.351475+05:30'),
	(85, 'page.moTracking', 'page', 'access', 'Open medical officer tracking', '2026-11-12 05:04:35.351475+05:30'),
	(86, 'page.districtLocations', 'page', 'access', 'Open district locations', '2026-11-12 05:04:35.351475+05:30'),
	(87, 'page.spNotes', 'page', 'access', 'Open specialist notes', '2026-11-12 05:04:35.351475+05:30'),
	(88, 'page.followUp', 'page', 'access', 'Open health worker care follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(89, 'page.healthWorkerTracking', 'page', 'access', 'Open health worker patient tracking', '2026-11-12 05:04:35.351475+05:30'),
	(90, 'page.userManagement', 'page', 'access', 'Open user management module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(91, 'page.navPatients', 'page', 'access', 'Open navigator patients', '2026-11-12 05:04:35.351475+05:30'),
	(92, 'page.navTracking', 'page', 'access', 'Open navigator tracking', '2026-11-12 05:04:35.351475+05:30'),
	(93, 'page.navFollowUps', 'page', 'access', 'Open navigator follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(94, 'page.moRegistrations', 'page', 'access', 'Open medical officer registrations', '2026-11-12 05:04:35.351475+05:30'),
	(95, 'page.moMandalPatients', 'page', 'access', 'Open medical officer mandal patients', '2026-11-12 05:04:35.351475+05:30'),
	(96, 'page.districtAuditLogs', 'page', 'access', 'Open district audit logs', '2026-11-12 05:04:35.351475+05:30'),
	(97, 'page.spReferrals', 'page', 'access', 'Open specialist referrals', '2026-11-12 05:04:35.351475+05:30'),
	(98, 'page.moReports', 'page', 'access', 'Open medical officer reports', '2026-11-12 05:04:35.351475+05:30'),
	(99, 'page.screening', 'page', 'access', 'Open health worker screening', '2026-11-12 05:04:35.351475+05:30'),
	(100, 'page.diagnosticTestMaster', 'page', 'access', 'Open diagnostic test master', '2026-11-12 05:04:35.351475+05:30')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mst_permissions (id, code, resource, action, description, created_at) OVERRIDING SYSTEM VALUE VALUES
	(101, 'page.districtHospitalStaff', 'page', 'access', 'Open district hospital staff page', '2026-11-12 05:04:35.351475+05:30'),
	(102, 'page.districtReports', 'page', 'access', 'Open district reports module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(103, 'page.healthWorkerPatients', 'page', 'access', 'Open health worker patient registration', '2026-11-12 05:04:35.351475+05:30'),
	(104, 'page.locationImport', 'page', 'access', 'Open location master import', '2026-11-12 05:04:35.351475+05:30'),
	(105, 'page.moDiagnostics', 'page', 'access', 'Open medical officer diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(106, 'page.healthWorkerPatientSearch', 'page', 'access', 'Open health worker patient search', '2026-11-12 05:04:35.351475+05:30'),
	(107, 'page.auditLogs', 'page', 'access', 'Open platform audit logs', '2026-11-12 05:04:35.351475+05:30'),
	(108, 'page.healthWorkerAssignments', 'page', 'access', 'Open health worker assignments', '2026-11-12 05:04:35.351475+05:30'),
	(109, 'page.roleManagement', 'page', 'access', 'Open role management', '2026-11-12 05:04:35.351475+05:30'),
	(110, 'page.districtMedicalOfficers', 'page', 'access', 'Open district medical officers staff page', '2026-11-12 05:04:35.351475+05:30'),
	(111, 'page.reports', 'page', 'access', 'Open platform reports', '2026-11-12 05:04:35.351475+05:30'),
	(112, 'page.moClinicalReview', 'page', 'access', 'Open medical officer clinical review', '2026-11-12 05:04:35.351475+05:30'),
	(113, 'page.districtAdmins', 'page', 'access', 'Open district admin management', '2026-11-12 05:04:35.351475+05:30'),
	(114, 'page.healthWorkerDiagnostics', 'page', 'access', 'Open health worker diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(115, 'page.moScreeningQueue', 'page', 'access', 'Open medical officer screening queue', '2026-11-12 05:04:35.351475+05:30'),
	(116, 'page.hsTracking', 'page', 'access', 'Open hospital staff tracking', '2026-11-12 05:04:35.351475+05:30'),
	(117, 'page.spConsultations', 'page', 'access', 'Open specialist consultations', '2026-11-12 05:04:35.351475+05:30'),
	(118, 'page.moCareLifecycle', 'page', 'access', 'Open medical officer care lifecycle', '2026-11-12 05:04:35.351475+05:30'),
	(119, 'page.moImageReview', 'page', 'access', 'Open medical officer image review', '2026-11-12 05:04:35.351475+05:30'),
	(120, 'diagnostic.advice_forward', 'diagnostic', 'forward_advice', 'Navigator forwards signed advice to Health Worker', '2026-11-13 12:38:39.153489+05:30'),
	(121, 'diagnostic.patient_followup', 'diagnostic', 'patient_followup', 'Health Worker records patient follow-up on signed advice', '2026-11-13 12:38:39.153489+05:30'),
	(122, 'diagnostic.verify', 'diagnostic', 'verify', 'Navigator verifies uploaded diagnostic reports', '2026-11-13 12:38:39.153489+05:30'),
	(123, 'diagnostic.forward_hs', 'diagnostic', 'forward', 'Navigator forwards verified reports to Hospital Staff', '2026-11-13 12:38:39.153489+05:30'),
	(124, 'diagnostic.route_specialist', 'diagnostic', 'route', 'Hospital Staff routes reports to authorized Specialist', '2026-11-13 12:38:39.153489+05:30'),
	(125, 'diagnostic.assign_hw', 'diagnostic', 'assign', 'Navigator assigns diagnostic collection to Health Worker', '2026-11-13 12:38:39.153489+05:30'),
	(126, 'diagnostic.advice_sign', 'diagnostic', 'advice', 'Specialist signs diagnostic treatment advice', '2026-11-13 12:38:39.153489+05:30'),
	(127, 'page.districtCustomAccounts', 'page', 'access', 'Open district custom-role account provisioning', '2026-11-13 18:38:38.843692+05:30'),
	(128, 'diagnostic.followup_verify', 'diagnostic', 'followup_verify', 'Navigator verifies or returns Health Worker follow-up reports', '2026-11-13 19:14:54.215913+05:30'),
	(129, 'diagnostic.case_close', 'diagnostic', 'case_close', 'Specialist closes diagnostic follow-up case with documented reason', '2026-11-13 19:14:54.215913+05:30'),
	(130, 'diagnostic.reassess', 'diagnostic', 'reassess', 'Specialist reassesses after follow-up and continues or updates advice', '2026-11-13 19:14:54.215913+05:30')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- tbl_role_permissions (system roles; by role/permission code)
-- Pairs: 177
-- ---------------------------------------------------------------------------

INSERT INTO public.tbl_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('DISTRICT_ADMIN', 'dashboard.view_aggregate'),
  ('DISTRICT_ADMIN', 'export.aggregate'),
  ('DISTRICT_ADMIN', 'master.view'),
  ('DISTRICT_ADMIN', 'page.districtAuditLogs'),
  ('DISTRICT_ADMIN', 'page.districtCustomAccounts'),
  ('DISTRICT_ADMIN', 'page.districtFacilities'),
  ('DISTRICT_ADMIN', 'page.districtHealthWorkers'),
  ('DISTRICT_ADMIN', 'page.districtHospitalStaff'),
  ('DISTRICT_ADMIN', 'page.districtLocations'),
  ('DISTRICT_ADMIN', 'page.districtMedicalOfficers'),
  ('DISTRICT_ADMIN', 'page.districtNavigators'),
  ('DISTRICT_ADMIN', 'page.districtPatients'),
  ('DISTRICT_ADMIN', 'page.districtProgramme'),
  ('DISTRICT_ADMIN', 'page.districtRegistrations'),
  ('DISTRICT_ADMIN', 'page.districtReports'),
  ('DISTRICT_ADMIN', 'page.districtSpecialists'),
  ('DISTRICT_ADMIN', 'page.districtTracking'),
  ('DISTRICT_ADMIN', 'page.facilities'),
  ('DISTRICT_ADMIN', 'page.healthWorkerAssignments'),
  ('DISTRICT_ADMIN', 'registration.finalize'),
  ('DISTRICT_ADMIN', 'registration.monitor'),
  ('HEALTH_WORKER', 'ai.analyze'),
  ('HEALTH_WORKER', 'care.discomfort_report'),
  ('HEALTH_WORKER', 'care.followup_report'),
  ('HEALTH_WORKER', 'consent.record'),
  ('HEALTH_WORKER', 'diagnostic.followup'),
  ('HEALTH_WORKER', 'diagnostic.patient_followup'),
  ('HEALTH_WORKER', 'diagnostic.report_upload'),
  ('HEALTH_WORKER', 'diagnostic.view'),
  ('HEALTH_WORKER', 'image.upload'),
  ('HEALTH_WORKER', 'image.view'),
  ('HEALTH_WORKER', 'page.followUp'),
  ('HEALTH_WORKER', 'page.healthWorkerAppointments'),
  ('HEALTH_WORKER', 'page.healthWorkerDiagnostics'),
  ('HEALTH_WORKER', 'page.healthWorkerPatients'),
  ('HEALTH_WORKER', 'page.healthWorkerPatientSearch'),
  ('HEALTH_WORKER', 'page.healthWorkerTracking'),
  ('HEALTH_WORKER', 'page.screening'),
  ('HEALTH_WORKER', 'patient.read_assigned'),
  ('HEALTH_WORKER', 'patient.register'),
  ('HEALTH_WORKER', 'screening.create'),
  ('HEALTH_WORKER', 'video.join'),
  ('HOSPITAL_STAFF', 'appointment.confirm'),
  ('HOSPITAL_STAFF', 'appointment.view'),
  ('HOSPITAL_STAFF', 'diagnostic.confirm'),
  ('HOSPITAL_STAFF', 'diagnostic.report_upload'),
  ('HOSPITAL_STAFF', 'diagnostic.route_specialist'),
  ('HOSPITAL_STAFF', 'diagnostic.view'),
  ('HOSPITAL_STAFF', 'page.appointments'),
  ('HOSPITAL_STAFF', 'page.attendance'),
  ('HOSPITAL_STAFF', 'page.hsDiagnostics'),
  ('HOSPITAL_STAFF', 'page.hsTracking'),
  ('HOSPITAL_STAFF', 'patient.read_assigned'),
  ('HOSPITAL_STAFF', 'referral.view'),
  ('MEDICAL_OFFICER', 'appointment.book'),
  ('MEDICAL_OFFICER', 'appointment.view'),
  ('MEDICAL_OFFICER', 'care.close'),
  ('MEDICAL_OFFICER', 'care.final_review'),
  ('MEDICAL_OFFICER', 'care.followup_assign'),
  ('MEDICAL_OFFICER', 'care.plan_manage'),
  ('MEDICAL_OFFICER', 'case.assign'),
  ('MEDICAL_OFFICER', 'classification.set'),
  ('MEDICAL_OFFICER', 'consent.record'),
  ('MEDICAL_OFFICER', 'diagnostic.report_review'),
  ('MEDICAL_OFFICER', 'diagnostic.view'),
  ('MEDICAL_OFFICER', 'image.view'),
  ('MEDICAL_OFFICER', 'investigation.record'),
  ('MEDICAL_OFFICER', 'page.moCareLifecycle'),
  ('MEDICAL_OFFICER', 'page.moClinicalNotes'),
  ('MEDICAL_OFFICER', 'page.moClinicalReview'),
  ('MEDICAL_OFFICER', 'page.moDiagnostics'),
  ('MEDICAL_OFFICER', 'page.moFollowUp'),
  ('MEDICAL_OFFICER', 'page.moImageReview'),
  ('MEDICAL_OFFICER', 'page.moMandalPatients'),
  ('MEDICAL_OFFICER', 'page.moProfile'),
  ('MEDICAL_OFFICER', 'page.moReferrals'),
  ('MEDICAL_OFFICER', 'page.moRegistrations'),
  ('MEDICAL_OFFICER', 'page.moReports'),
  ('MEDICAL_OFFICER', 'page.moScreeningQueue'),
  ('MEDICAL_OFFICER', 'page.moTracking'),
  ('MEDICAL_OFFICER', 'patient.read_assigned'),
  ('MEDICAL_OFFICER', 'patient.register'),
  ('MEDICAL_OFFICER', 'referral.create'),
  ('MEDICAL_OFFICER', 'referral.view'),
  ('MEDICAL_OFFICER', 'registration.monitor'),
  ('MEDICAL_OFFICER', 'registration.recommend'),
  ('MEDICAL_OFFICER', 'review.create'),
  ('MEDICAL_OFFICER', 'review.sign'),
  ('MEDICAL_OFFICER', 'video.join'),
  ('NAVIGATOR', 'appointment.book'),
  ('NAVIGATOR', 'appointment.view'),
  ('NAVIGATOR', 'care.followup_assign'),
  ('NAVIGATOR', 'diagnostic.advice_forward'),
  ('NAVIGATOR', 'diagnostic.assign_hw'),
  ('NAVIGATOR', 'diagnostic.followup_verify'),
  ('NAVIGATOR', 'diagnostic.forward_hs'),
  ('NAVIGATOR', 'diagnostic.schedule'),
  ('NAVIGATOR', 'diagnostic.verify'),
  ('NAVIGATOR', 'diagnostic.view'),
  ('NAVIGATOR', 'navigation.update'),
  ('NAVIGATOR', 'page.navAppointments'),
  ('NAVIGATOR', 'page.navDiagnostics'),
  ('NAVIGATOR', 'page.navFollowUps'),
  ('NAVIGATOR', 'page.navPatients'),
  ('NAVIGATOR', 'page.navReferrals'),
  ('NAVIGATOR', 'page.navTracking'),
  ('NAVIGATOR', 'page.navVideo'),
  ('NAVIGATOR', 'patient.read_assigned'),
  ('NAVIGATOR', 'referral.view'),
  ('NAVIGATOR', 'treatment.track'),
  ('NAVIGATOR', 'video.join'),
  ('SPECIALIST', 'appointment.book'),
  ('SPECIALIST', 'appointment.slot_manage'),
  ('SPECIALIST', 'appointment.view'),
  ('SPECIALIST', 'care.close'),
  ('SPECIALIST', 'care.final_review'),
  ('SPECIALIST', 'care.plan_manage'),
  ('SPECIALIST', 'classification.set'),
  ('SPECIALIST', 'consultation.note'),
  ('SPECIALIST', 'diagnostic.advice_sign'),
  ('SPECIALIST', 'diagnostic.case_close'),
  ('SPECIALIST', 'diagnostic.reassess'),
  ('SPECIALIST', 'diagnostic.report_review'),
  ('SPECIALIST', 'diagnostic.view'),
  ('SPECIALIST', 'image.view'),
  ('SPECIALIST', 'investigation.record'),
  ('SPECIALIST', 'page.spConsultations'),
  ('SPECIALIST', 'page.spDiagnostics'),
  ('SPECIALIST', 'page.spFollowUps'),
  ('SPECIALIST', 'page.spNotes'),
  ('SPECIALIST', 'page.spReferrals'),
  ('SPECIALIST', 'page.spTracking'),
  ('SPECIALIST', 'page.spVideo'),
  ('SPECIALIST', 'pathology.review'),
  ('SPECIALIST', 'patient.read_assigned'),
  ('SPECIALIST', 'referral.view'),
  ('SPECIALIST', 'treatment.link'),
  ('SPECIALIST', 'video.join'),
  ('SUPER_ADMIN', 'audit.view'),
  ('SUPER_ADMIN', 'diagnostic.view'),
  ('SUPER_ADMIN', 'district_admin.manage'),
  ('SUPER_ADMIN', 'master.import'),
  ('SUPER_ADMIN', 'master.manage'),
  ('SUPER_ADMIN', 'master.view'),
  ('SUPER_ADMIN', 'page.auditLogs'),
  ('SUPER_ADMIN', 'page.diagnosticTestMaster'),
  ('SUPER_ADMIN', 'page.districtAdmins'),
  ('SUPER_ADMIN', 'page.facilities'),
  ('SUPER_ADMIN', 'page.healthWorkerAssignments'),
  ('SUPER_ADMIN', 'page.locationImport'),
  ('SUPER_ADMIN', 'page.registrationMonitoring'),
  ('SUPER_ADMIN', 'page.reports'),
  ('SUPER_ADMIN', 'page.roleManagement'),
  ('SUPER_ADMIN', 'page.settings'),
  ('SUPER_ADMIN', 'page.staffManagement'),
  ('SUPER_ADMIN', 'registration.monitor'),
  ('SUPER_ADMIN', 'role.manage'),
  ('SUPER_ADMIN', 'settings.manage'),
  ('SUPER_ADMIN', 'user.create_admin'),
  ('SUPER_ADMIN', 'user.create_staff'),
  ('SUPER_ADMIN', 'user.manage'),
  ('SYSTEM_ADMIN', 'audit.view'),
  ('SYSTEM_ADMIN', 'diagnostic.view'),
  ('SYSTEM_ADMIN', 'master.manage'),
  ('SYSTEM_ADMIN', 'master.view'),
  ('SYSTEM_ADMIN', 'page.adminAccounts'),
  ('SYSTEM_ADMIN', 'page.auditLogs'),
  ('SYSTEM_ADMIN', 'page.diagnosticTestMaster'),
  ('SYSTEM_ADMIN', 'page.facilities'),
  ('SYSTEM_ADMIN', 'page.masterData'),
  ('SYSTEM_ADMIN', 'page.registrations'),
  ('SYSTEM_ADMIN', 'page.roleManagement'),
  ('SYSTEM_ADMIN', 'page.settings'),
  ('SYSTEM_ADMIN', 'page.staffManagement'),
  ('SYSTEM_ADMIN', 'page.userManagement'),
  ('SYSTEM_ADMIN', 'user.create_staff'),
  ('SYSTEM_ADMIN', 'user.manage')
) AS v(role_code, permission_code)
JOIN public.mst_roles r ON r.code = v.role_code
JOIN public.mst_permissions p ON p.code = v.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
-- Align identity sequences
SELECT setval(pg_get_serial_sequence('public.mst_languages', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_languages), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_appointment_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_appointment_statuses), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_followup_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_followup_statuses), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_investigation_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_investigation_statuses), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_consent_purposes', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_consent_purposes), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_exposure_types', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_exposure_types), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_symptoms', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_symptoms), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_diagnostic_categories', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_diagnostic_categories), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_investigation_types', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_investigation_types), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_diagnostic_tests', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_diagnostic_tests), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_specialties', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_specialties), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_referral_priorities', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_referral_priorities), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_notification_templates', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_notification_templates), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_roles', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_roles), 1), true);
SELECT setval(pg_get_serial_sequence('public.mst_permissions', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_permissions), 1), true);

COMMIT;

-- End of AAROGYA_RENDER_MINIMAL_SEED.sql
