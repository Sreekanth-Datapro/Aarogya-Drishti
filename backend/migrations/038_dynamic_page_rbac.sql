-- 038_dynamic_page_rbac.sql
-- Dynamic page access via existing mst_permissions + tbl_role_permissions.
-- Codes: page.<moduleKey> (resource=page, action=access).
-- Also backfills is_system_role and trims inactive SYSTEM_ADMIN privilege grants.

-- 1) Built-in roles are system roles; custom roles stay non-system.
UPDATE mst_roles
   SET is_system_role = TRUE
 WHERE code IN (
   'HEALTH_WORKER',
   'MEDICAL_OFFICER',
   'SPECIALIST',
   'NAVIGATOR',
   'HOSPITAL_STAFF',
   'DISTRICT_ADMIN',
   'SYSTEM_ADMIN',
   'SUPER_ADMIN'
 );

UPDATE mst_roles
   SET is_system_role = FALSE
 WHERE code NOT IN (
   'HEALTH_WORKER',
   'MEDICAL_OFFICER',
   'SPECIALIST',
   'NAVIGATOR',
   'HOSPITAL_STAFF',
   'DISTRICT_ADMIN',
   'SYSTEM_ADMIN',
   'SUPER_ADMIN'
 );

-- 2) Inactive SYSTEM_ADMIN must not keep Super-Admin privilege grants.
DELETE FROM tbl_role_permissions rp
 USING mst_roles r, mst_permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.code = 'SYSTEM_ADMIN'
   AND p.code IN ('role.manage', 'district_admin.manage');

-- 3) Page-access permissions for every navigable module key.
INSERT INTO mst_permissions (code, resource, action, description)
SELECT v.code, 'page', 'access', v.description
  FROM (VALUES
    ('page.facilities', 'Open facility list and details'),
    ('page.locationImport', 'Open location master import'),
    ('page.adminAccounts', 'Open admin accounts module (placeholder)'),
    ('page.masterData', 'Open master data module (placeholder)'),
    ('page.diagnosticTestMaster', 'Open diagnostic test master'),
    ('page.registrations', 'Open registrations module (placeholder)'),
    ('page.userManagement', 'Open user management module (placeholder)'),
    ('page.settings', 'Open account/settings navigation'),
    ('page.roleManagement', 'Open role management'),
    ('page.districtAdmins', 'Open district admin management'),
    ('page.staffManagement', 'Open staff management'),
    ('page.healthWorkerAssignments', 'Open health worker assignments'),
    ('page.auditLogs', 'Open platform audit logs'),
    ('page.reports', 'Open platform reports'),
    ('page.registrationMonitoring', 'Open registration monitoring'),
    ('page.screening', 'Open health worker screening'),
    ('page.followUp', 'Open health worker care follow-ups'),
    ('page.healthWorkerPatients', 'Open health worker patient registration'),
    ('page.healthWorkerPatientSearch', 'Open health worker patient search'),
    ('page.healthWorkerAppointments', 'Open health worker appointments'),
    ('page.healthWorkerDiagnostics', 'Open health worker diagnostics'),
    ('page.healthWorkerTracking', 'Open health worker patient tracking'),
    ('page.appointments', 'Open hospital staff appointments'),
    ('page.hsDiagnostics', 'Open hospital staff diagnostics'),
    ('page.hsTracking', 'Open hospital staff tracking'),
    ('page.attendance', 'Open hospital staff attendance'),
    ('page.districtPatients', 'Open district patients'),
    ('page.districtHealthWorkers', 'Open district health workers'),
    ('page.districtMedicalOfficers', 'Open district medical officers staff page'),
    ('page.districtSpecialists', 'Open district specialists staff page'),
    ('page.districtNavigators', 'Open district navigators staff page'),
    ('page.districtHospitalStaff', 'Open district hospital staff page'),
    ('page.districtRegistrations', 'Open district registration approvals'),
    ('page.districtFacilities', 'Open district facilities view'),
    ('page.districtLocations', 'Open district locations'),
    ('page.districtProgramme', 'Open district programme dashboard'),
    ('page.districtTracking', 'Open district patient tracking'),
    ('page.districtReports', 'Open district reports module (placeholder)'),
    ('page.districtAuditLogs', 'Open district audit logs'),
    ('page.moRegistrations', 'Open medical officer registrations'),
    ('page.moMandalPatients', 'Open medical officer mandal patients'),
    ('page.moScreeningQueue', 'Open medical officer screening queue'),
    ('page.moClinicalReview', 'Open medical officer clinical review'),
    ('page.moImageReview', 'Open medical officer image review'),
    ('page.moClinicalNotes', 'Open medical officer clinical notes'),
    ('page.moReferrals', 'Open medical officer referrals'),
    ('page.moFollowUp', 'Open medical officer follow-ups'),
    ('page.moCareLifecycle', 'Open medical officer care lifecycle'),
    ('page.moDiagnostics', 'Open medical officer diagnostics'),
    ('page.moTracking', 'Open medical officer tracking'),
    ('page.moReports', 'Open medical officer reports'),
    ('page.moProfile', 'Open medical officer profile'),
    ('page.navPatients', 'Open navigator patients'),
    ('page.navReferrals', 'Open navigator referrals'),
    ('page.navAppointments', 'Open navigator appointments'),
    ('page.navVideo', 'Open navigator video module'),
    ('page.navFollowUps', 'Open navigator follow-ups'),
    ('page.navDiagnostics', 'Open navigator diagnostics'),
    ('page.navTracking', 'Open navigator tracking'),
    ('page.spReferrals', 'Open specialist referrals'),
    ('page.spConsultations', 'Open specialist consultations'),
    ('page.spVideo', 'Open specialist video module'),
    ('page.spNotes', 'Open specialist notes'),
    ('page.spDiagnostics', 'Open specialist diagnostics'),
    ('page.spFollowUps', 'Open specialist care / follow-ups'),
    ('page.spTracking', 'Open specialist tracking')
  ) AS v(code, description)
 WHERE NOT EXISTS (
   SELECT 1 FROM mst_permissions existing WHERE existing.code = v.code
 );

-- 4) Seed page permissions onto built-in roles to match current ROLE_MODULES menus.
INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
  JOIN (VALUES
    ('SUPER_ADMIN', 'page.districtAdmins'),
    ('SUPER_ADMIN', 'page.staffManagement'),
    ('SUPER_ADMIN', 'page.healthWorkerAssignments'),
    ('SUPER_ADMIN', 'page.roleManagement'),
    ('SUPER_ADMIN', 'page.locationImport'),
    ('SUPER_ADMIN', 'page.facilities'),
    ('SUPER_ADMIN', 'page.diagnosticTestMaster'),
    ('SUPER_ADMIN', 'page.registrationMonitoring'),
    ('SUPER_ADMIN', 'page.reports'),
    ('SUPER_ADMIN', 'page.auditLogs'),
    ('SUPER_ADMIN', 'page.settings'),
    ('SYSTEM_ADMIN', 'page.facilities'),
    ('SYSTEM_ADMIN', 'page.adminAccounts'),
    ('SYSTEM_ADMIN', 'page.masterData'),
    ('SYSTEM_ADMIN', 'page.diagnosticTestMaster'),
    ('SYSTEM_ADMIN', 'page.staffManagement'),
    ('SYSTEM_ADMIN', 'page.registrations'),
    ('SYSTEM_ADMIN', 'page.userManagement'),
    ('SYSTEM_ADMIN', 'page.settings'),
    ('SYSTEM_ADMIN', 'page.auditLogs'),
    ('SYSTEM_ADMIN', 'page.roleManagement'),
    ('DISTRICT_ADMIN', 'page.districtPatients'),
    ('DISTRICT_ADMIN', 'page.districtHealthWorkers'),
    ('DISTRICT_ADMIN', 'page.districtMedicalOfficers'),
    ('DISTRICT_ADMIN', 'page.districtSpecialists'),
    ('DISTRICT_ADMIN', 'page.districtNavigators'),
    ('DISTRICT_ADMIN', 'page.districtHospitalStaff'),
    ('DISTRICT_ADMIN', 'page.healthWorkerAssignments'),
    ('DISTRICT_ADMIN', 'page.districtRegistrations'),
    ('DISTRICT_ADMIN', 'page.districtFacilities'),
    ('DISTRICT_ADMIN', 'page.facilities'),
    ('DISTRICT_ADMIN', 'page.districtLocations'),
    ('DISTRICT_ADMIN', 'page.districtProgramme'),
    ('DISTRICT_ADMIN', 'page.districtTracking'),
    ('DISTRICT_ADMIN', 'page.districtReports'),
    ('DISTRICT_ADMIN', 'page.districtAuditLogs'),
    ('MEDICAL_OFFICER', 'page.moRegistrations'),
    ('MEDICAL_OFFICER', 'page.moMandalPatients'),
    ('MEDICAL_OFFICER', 'page.moScreeningQueue'),
    ('MEDICAL_OFFICER', 'page.moClinicalReview'),
    ('MEDICAL_OFFICER', 'page.moImageReview'),
    ('MEDICAL_OFFICER', 'page.moClinicalNotes'),
    ('MEDICAL_OFFICER', 'page.moReferrals'),
    ('MEDICAL_OFFICER', 'page.moFollowUp'),
    ('MEDICAL_OFFICER', 'page.moCareLifecycle'),
    ('MEDICAL_OFFICER', 'page.moDiagnostics'),
    ('MEDICAL_OFFICER', 'page.moTracking'),
    ('MEDICAL_OFFICER', 'page.moReports'),
    ('MEDICAL_OFFICER', 'page.moProfile'),
    ('SPECIALIST', 'page.spReferrals'),
    ('SPECIALIST', 'page.spConsultations'),
    ('SPECIALIST', 'page.spVideo'),
    ('SPECIALIST', 'page.spNotes'),
    ('SPECIALIST', 'page.spDiagnostics'),
    ('SPECIALIST', 'page.spFollowUps'),
    ('SPECIALIST', 'page.spTracking'),
    ('HEALTH_WORKER', 'page.healthWorkerPatientSearch'),
    ('HEALTH_WORKER', 'page.healthWorkerPatients'),
    ('HEALTH_WORKER', 'page.screening'),
    ('HEALTH_WORKER', 'page.healthWorkerAppointments'),
    ('HEALTH_WORKER', 'page.healthWorkerDiagnostics'),
    ('HEALTH_WORKER', 'page.healthWorkerTracking'),
    ('HEALTH_WORKER', 'page.followUp'),
    ('NAVIGATOR', 'page.navPatients'),
    ('NAVIGATOR', 'page.navReferrals'),
    ('NAVIGATOR', 'page.navAppointments'),
    ('NAVIGATOR', 'page.navVideo'),
    ('NAVIGATOR', 'page.navFollowUps'),
    ('NAVIGATOR', 'page.navDiagnostics'),
    ('NAVIGATOR', 'page.navTracking'),
    ('HOSPITAL_STAFF', 'page.appointments'),
    ('HOSPITAL_STAFF', 'page.hsDiagnostics'),
    ('HOSPITAL_STAFF', 'page.hsTracking'),
    ('HOSPITAL_STAFF', 'page.attendance')
  ) AS map(role_code, permission_code)
    ON map.role_code = role_row.code
   AND map.permission_code = permission_row.code
 ON CONFLICT (role_id, permission_id) DO NOTHING;
