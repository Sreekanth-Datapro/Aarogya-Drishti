
import React from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./components/MainLayout";
import RequireRole from "./components/RequireRole";
import OfflineBanner from "./components/pwa/OfflineBanner";
import { PageLoader } from "./components/ui";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Settings from "./pages/Settings";
import LocationImport from "./pages/LocationImport";
import FacilityList from "./pages/facilities/FacilityList";
import FacilityForm from "./pages/facilities/FacilityForm";
import FacilityDetails from "./pages/facilities/FacilityDetails";
import RoleManagement from "./pages/admin/RoleManagement";
import DistrictAdminManagement from "./pages/admin/DistrictAdminManagement";
import StaffManagement from "./pages/admin/StaffManagement";
import HealthWorkerAssignments from "./pages/admin/HealthWorkerAssignments";
import DistrictAdminSetup from "./pages/DistrictAdminSetup";
import ReportsAnalytics from "./pages/admin/ReportsAnalytics";
import AuditLogs from "./pages/admin/AuditLogs";
import RegistrationMonitoring from "./pages/admin/RegistrationMonitoring";
import DistrictLocations from "./pages/district/DistrictLocations";
import DistrictPatients from "./pages/district/DistrictPatients";
import DistrictHealthWorkers from "./pages/district/DistrictHealthWorkers";
import ScreeningWizard from "./pages/healthWorker/screening/ScreeningWizard";
import FinalApprovals from "./pages/district/FinalApprovals";
import ProgrammeDashboard from "./pages/district/ProgrammeDashboard";
import PatientRegistration from "./pages/PatientRegistration";
import PatientSearch from "./pages/healthWorker/PatientSearch";
import PatientDetails from "./pages/healthWorker/PatientDetails";
import MedicalOfficerQueue from "./pages/MedicalOfficerQueue";
import RegistrationStatus from "./pages/RegistrationStatus";
import MandalPatients from "./pages/medicalOfficer/MandalPatients";
import MoRegistrations from "./pages/medicalOfficer/MoRegistrations";
import ClinicalReview from "./pages/medicalOfficer/ClinicalReview";
import ImageReview from "./pages/medicalOfficer/ImageReview";
import ClinicalNotes from "./pages/medicalOfficer/ClinicalNotes";
import Referrals from "./pages/medicalOfficer/Referrals";
import FollowUps from "./pages/medicalOfficer/FollowUps";
import CareLifecycle from "./pages/medicalOfficer/CareLifecycle";
import SpecialistCareLifecycle from "./pages/careTeam/SpecialistCareLifecycle";
import MoReports from "./pages/medicalOfficer/MoReports";
import MoProfile from "./pages/medicalOfficer/MoProfile";
import CareModulePage from "./pages/careTeam/CareModulePage";
import NavigatorDashboard from "./pages/careTeam/NavigatorDashboard";
import NavigatorCareFollowups from "./pages/careTeam/NavigatorCareFollowups";
import SpecialistDashboard from "./pages/careTeam/SpecialistDashboard";
import SpecialistAppointments from "./pages/careTeam/SpecialistAppointments";
import SpecialistClinicalNotes from "./pages/careTeam/SpecialistClinicalNotes";
import MyAppointments from "./pages/careTeam/MyAppointments";
import VideoConsultationMeeting from "./pages/careTeam/VideoConsultationMeeting";
import CareFollowups from "./pages/healthWorker/CareFollowups";
import HospitalStaffDashboard from "./pages/hospitalStaff/HospitalStaffDashboard";
import DiagnosticOrders from "./pages/diagnostics/DiagnosticOrders";
import DiagnosticOrderDetails from "./pages/diagnostics/DiagnosticOrderDetails";
import DiagnosticAppointments from "./pages/diagnostics/DiagnosticAppointments";
import DiagnosticAppointmentDetails from "./pages/diagnostics/DiagnosticAppointmentDetails";
import DiagnosticTestMaster from "./pages/admin/DiagnosticTestMaster";
import PatientTracking from "./pages/tracking/PatientTracking";
import PatientJourney from "./pages/tracking/PatientJourney";
import { NAVIGATOR_MODULES, SPECIALIST_MODULES } from "./config/navigation";
import { pagePermission } from "./config/pageAccess";

const P = pagePermission;

function MoDiagnosticsPage() {
  return <DiagnosticOrders role="MEDICAL_OFFICER" />;
}
function MoDiagnosticDetailsPage() {
  return <DiagnosticOrderDetails role="MEDICAL_OFFICER" />;
}
function NavDiagnosticsPage() {
  return <DiagnosticOrders role="NAVIGATOR" />;
}
function NavDiagnosticDetailsPage() {
  return <DiagnosticOrderDetails role="NAVIGATOR" />;
}
function NavDiagnosticAppointmentPage() {
  return <DiagnosticAppointmentDetails role="NAVIGATOR" />;
}
function SpDiagnosticsPage() {
  return <DiagnosticOrders role="SPECIALIST" />;
}
function SpDiagnosticDetailsPage() {
  return <DiagnosticOrderDetails role="SPECIALIST" />;
}
function HsDiagnosticsPage() {
  return <DiagnosticAppointments role="HOSPITAL_STAFF" />;
}
function HsDiagnosticOrdersPage() {
  return <DiagnosticOrders role="HOSPITAL_STAFF" />;
}
function HsDiagnosticOrderDetailsPage() {
  return <DiagnosticOrderDetails role="HOSPITAL_STAFF" />;
}
function HsDiagnosticAppointmentPage() {
  return <DiagnosticAppointmentDetails role="HOSPITAL_STAFF" />;
}
function HwDiagnosticsPage() {
  return <DiagnosticAppointments role="HEALTH_WORKER" />;
}
function HwDiagnosticOrdersPage() {
  return <DiagnosticOrders role="HEALTH_WORKER" />;
}
function HwDiagnosticOrderDetailsPage() {
  return <DiagnosticOrderDetails role="HEALTH_WORKER" />;
}
function HwDiagnosticAppointmentPage() {
  return <DiagnosticAppointmentDetails role="HEALTH_WORKER" />;
}
function MoTrackingPage() {
  return <PatientTracking role="MEDICAL_OFFICER" />;
}
function MoJourneyPage() {
  return <PatientJourney role="MEDICAL_OFFICER" />;
}

// Medical Officer pages (address -> page key -> component).
// Role or matching page.* permission can open the UI; APIs stay authoritative.
const MEDICAL_OFFICER_PAGES = [
  ["/medical-officer/patients", "moMandalPatients", MandalPatients],
  ["/medical-officer/review", "moClinicalReview", ClinicalReview],
  ["/medical-officer/images", "moImageReview", ImageReview],
  ["/medical-officer/notes", "moClinicalNotes", ClinicalNotes],
  ["/medical-officer/referrals", "moReferrals", Referrals],
  ["/medical-officer/followups", "moFollowUp", FollowUps],
  ["/medical-officer/care", "moCareLifecycle", CareLifecycle],
  ["/medical-officer/diagnostics", "moDiagnostics", MoDiagnosticsPage],
  ["/medical-officer/diagnostics/:orderId", "moDiagnostics", MoDiagnosticDetailsPage],
  ["/medical-officer/tracking", "moTracking", MoTrackingPage],
  ["/medical-officer/tracking/:patientId", "moTracking", MoJourneyPage],
  ["/medical-officer/reports", "moReports", MoReports],
  ["/medical-officer/profile", "moProfile", MoProfile],
];

// Who may open the facility pages (the server checks permissions too)
const FACILITY_VIEWERS = ["SUPER_ADMIN", "SYSTEM_ADMIN", "DISTRICT_ADMIN"];
const FACILITY_MANAGERS = ["SYSTEM_ADMIN", "SUPER_ADMIN"];
const FACILITY_VIEW_PAGES = [P("facilities"), P("districtFacilities")];
const FACILITY_MANAGE_PAGES = [P("facilities")];

function HomeRedirect() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) return <PageLoader label={t("common.loading")} />;

  return (
    <Navigate
      to={user ? "/dashboard" : "/login"}
      replace
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registration-status" element={<RegistrationStatus />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup-account" element={<DistrictAdminSetup />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route
            path="/admin/locations"
            element={
              <RequireRole roles={["SUPER_ADMIN"]} permissions={[P("locationImport")]}>
                <LocationImport />
              </RequireRole>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <RequireRole roles={["SUPER_ADMIN", "SYSTEM_ADMIN"]} permissions={[P("roleManagement")]}>
                <RoleManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/district-admins"
            element={
              <RequireRole roles={["SUPER_ADMIN"]} permissions={[P("districtAdmins")]}>
                <DistrictAdminManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/staff"
            element={
              <RequireRole
                roles={["SYSTEM_ADMIN", "SUPER_ADMIN", "DISTRICT_ADMIN"]}
                permissions={[P("staffManagement"), P("districtMedicalOfficers"), P("districtSpecialists"), P("districtNavigators"), P("districtHospitalStaff")]}
              >
                <StaffManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/health-worker-assignments"
            element={
              <RequireRole roles={["SUPER_ADMIN", "DISTRICT_ADMIN"]} permissions={[P("healthWorkerAssignments")]}>
                <HealthWorkerAssignments />
              </RequireRole>
            }
          />
          <Route
            path="/admin/registrations"
            element={
              <RequireRole roles={["SUPER_ADMIN"]} permissions={[P("registrationMonitoring")]}>
                <RegistrationMonitoring />
              </RequireRole>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <RequireRole roles={["SUPER_ADMIN"]} permissions={[P("reports")]}>
                <ReportsAnalytics />
              </RequireRole>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireRole roles={["SUPER_ADMIN"]} permissions={[P("auditLogs")]}>
                <AuditLogs />
              </RequireRole>
            }
          />
          <Route
            path="/district/staff/:staffPage"
            element={(
              <RequireRole
                roles={["DISTRICT_ADMIN"]}
                permissions={[P("districtMedicalOfficers"), P("districtSpecialists"), P("districtNavigators"), P("districtHospitalStaff")]}
              >
                <StaffManagement />
              </RequireRole>
            )}
          />
          <Route
            path="/district/custom-accounts"
            element={(
              <RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtCustomAccounts")]}>
                <StaffManagement customOnly />
              </RequireRole>
            )}
          />
          <Route
            path="/health-worker/screening"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("screening")]}><ScreeningWizard /></RequireRole>}
          />
          <Route
            path="/health-worker/patients"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerPatients")]}><PatientRegistration /></RequireRole>}
          />
          <Route
            path="/health-worker/patient-search"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerPatientSearch")]}><PatientSearch /></RequireRole>}
          />
          <Route
            path="/health-worker/patients/:patientId"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerPatients"), P("healthWorkerPatientSearch")]}><PatientDetails /></RequireRole>}
          />
          <Route
            path="/health-worker/appointments"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerAppointments")]}><MyAppointments role="HEALTH_WORKER" /></RequireRole>}
          />
          <Route
            path="/health-worker/followups"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("followUp")]}><CareFollowups /></RequireRole>}
          />
          <Route
            path="/video-consultations/:consultationId/meeting"
            element={(
              <RequireRole
                roles={["HEALTH_WORKER", "NAVIGATOR", "SPECIALIST"]}
                permissions={[P("navVideo"), P("spVideo"), "video.join"]}
              >
                <VideoConsultationMeeting />
              </RequireRole>
            )}
          />
          <Route
            path="/medical-officer/queue"
            element={<RequireRole roles={["MEDICAL_OFFICER"]} permissions={[P("moScreeningQueue")]}><MedicalOfficerQueue /></RequireRole>}
          />
          <Route
            path="/medical-officer/registrations"
            element={<RequireRole roles={["MEDICAL_OFFICER"]} permissions={[P("moRegistrations")]}><MoRegistrations /></RequireRole>}
          />
          {MEDICAL_OFFICER_PAGES.map(([path, pageKey, Page]) => (
            <Route
              key={path}
              path={path}
              element={<RequireRole roles={["MEDICAL_OFFICER"]} permissions={[P(pageKey)]}><Page /></RequireRole>}
            />
          ))}
          {Object.entries(NAVIGATOR_MODULES).map(([key, { path }]) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireRole roles={["NAVIGATOR"]} permissions={[P(key)]}>
                  {key === "navAppointments"
                    ? <MyAppointments role="NAVIGATOR" />
                    : key === "navFollowUps"
                      ? <NavigatorCareFollowups />
                      : key === "navDiagnostics"
                        ? <NavDiagnosticsPage />
                        : key === "navTracking"
                          ? <PatientTracking role="NAVIGATOR" />
                          : ["navPatients", "navReferrals"].includes(key)
                            ? <NavigatorDashboard />
                            : <CareModulePage moduleKey={key} />}
                </RequireRole>
              }
            />
          ))}
          <Route
            path="/navigator/tracking/:patientId"
            element={<RequireRole roles={["NAVIGATOR"]} permissions={[P("navTracking")]}><PatientJourney role="NAVIGATOR" /></RequireRole>}
          />
          <Route
            path="/navigator/diagnostics/appointments/:appointmentId"
            element={<RequireRole roles={["NAVIGATOR"]} permissions={[P("navDiagnostics")]}><NavDiagnosticAppointmentPage /></RequireRole>}
          />
          <Route
            path="/navigator/diagnostics/:orderId"
            element={<RequireRole roles={["NAVIGATOR"]} permissions={[P("navDiagnostics")]}><NavDiagnosticDetailsPage /></RequireRole>}
          />
          {Object.entries(SPECIALIST_MODULES).map(([key, { path }]) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireRole roles={["SPECIALIST"]} permissions={[P(key)]}>
                  {key === "spReferrals"
                    ? <SpecialistDashboard />
                    : key === "spConsultations"
                      ? <SpecialistAppointments />
                      : key === "spNotes"
                        ? <SpecialistClinicalNotes />
                      : key === "spDiagnostics"
                        ? <SpDiagnosticsPage />
                        : key === "spTracking"
                          ? <PatientTracking role="SPECIALIST" />
                          : key === "spFollowUps"
                            ? <SpecialistCareLifecycle />
                            : <CareModulePage moduleKey={key} />}
                </RequireRole>
              }
            />
          ))}
          <Route
            path="/specialist/followups"
            element={<RequireRole roles={["SPECIALIST"]} permissions={[P("spFollowUps")]}><SpecialistCareLifecycle /></RequireRole>}
          />
          <Route
            path="/specialist/tracking/:patientId"
            element={<RequireRole roles={["SPECIALIST"]} permissions={[P("spTracking")]}><PatientJourney role="SPECIALIST" /></RequireRole>}
          />
          <Route
            path="/specialist/diagnostics/:orderId"
            element={<RequireRole roles={["SPECIALIST"]} permissions={[P("spDiagnostics")]}><SpDiagnosticDetailsPage /></RequireRole>}
          />
          <Route
            path="/hospital-staff/appointments"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("appointments")]}><HospitalStaffDashboard /></RequireRole>}
          />
          <Route
            path="/hospital-staff/attendance"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("attendance")]}><HospitalStaffDashboard /></RequireRole>}
          />
          <Route
            path="/hospital-staff/diagnostics"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsDiagnostics")]}><HsDiagnosticsPage /></RequireRole>}
          />
          <Route
            path="/hospital-staff/diagnostics/orders"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsDiagnostics")]}><HsDiagnosticOrdersPage /></RequireRole>}
          />
          <Route
            path="/hospital-staff/diagnostics/orders/:orderId"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsDiagnostics")]}><HsDiagnosticOrderDetailsPage /></RequireRole>}
          />
          <Route
            path="/hospital-staff/diagnostics/:appointmentId"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsDiagnostics")]}><HsDiagnosticAppointmentPage /></RequireRole>}
          />
          <Route
            path="/hospital-staff/tracking"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsTracking")]}><PatientTracking role="HOSPITAL_STAFF" /></RequireRole>}
          />
          <Route
            path="/hospital-staff/tracking/:patientId"
            element={<RequireRole roles={["HOSPITAL_STAFF"]} permissions={[P("hsTracking")]}><PatientJourney role="HOSPITAL_STAFF" /></RequireRole>}
          />
          <Route
            path="/health-worker/diagnostics"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerDiagnostics")]}><HwDiagnosticsPage /></RequireRole>}
          />
          <Route
            path="/health-worker/diagnostics/orders"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerDiagnostics")]}><HwDiagnosticOrdersPage /></RequireRole>}
          />
          <Route
            path="/health-worker/diagnostics/orders/:orderId"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerDiagnostics")]}><HwDiagnosticOrderDetailsPage /></RequireRole>}
          />
          <Route
            path="/health-worker/diagnostics/:appointmentId"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerDiagnostics")]}><HwDiagnosticAppointmentPage /></RequireRole>}
          />
          <Route
            path="/health-worker/tracking"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerTracking")]}><PatientTracking role="HEALTH_WORKER" /></RequireRole>}
          />
          <Route
            path="/health-worker/tracking/:patientId"
            element={<RequireRole roles={["HEALTH_WORKER"]} permissions={[P("healthWorkerTracking")]}><PatientJourney role="HEALTH_WORKER" /></RequireRole>}
          />
          <Route
            path="/district/registrations"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtRegistrations")]}><FinalApprovals /></RequireRole>}
          />
          <Route
            path="/district/tracking"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtTracking")]}><PatientTracking role="DISTRICT_ADMIN" /></RequireRole>}
          />
          <Route
            path="/district/tracking/:patientId"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtTracking")]}><PatientJourney role="DISTRICT_ADMIN" /></RequireRole>}
          />
          <Route
            path="/district/health-workers"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtHealthWorkers")]}><DistrictHealthWorkers /></RequireRole>}
          />
          <Route
            path="/district/patients"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtPatients")]}><DistrictPatients /></RequireRole>}
          />
          <Route
            path="/district/locations"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtLocations")]}><DistrictLocations /></RequireRole>}
          />
          <Route
            path="/district/programme"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtProgramme")]}><ProgrammeDashboard /></RequireRole>}
          />
          <Route
            path="/district/audit"
            element={<RequireRole roles={["DISTRICT_ADMIN"]} permissions={[P("districtAuditLogs")]}><AuditLogs apiPath="/district/audit/logs" /></RequireRole>}
          />
          <Route
            path="/admin/diagnostic-tests"
            element={<RequireRole roles={["SYSTEM_ADMIN", "SUPER_ADMIN"]} permissions={[P("diagnosticTestMaster")]}><DiagnosticTestMaster /></RequireRole>}
          />
          <Route
            path="/admin/facilities"
            element={<RequireRole roles={FACILITY_VIEWERS} permissions={FACILITY_VIEW_PAGES}><FacilityList /></RequireRole>}
          />
          <Route
            path="/admin/facilities/new"
            element={<RequireRole roles={FACILITY_MANAGERS} permissions={FACILITY_MANAGE_PAGES}><FacilityForm /></RequireRole>}
          />
          <Route
            path="/admin/facilities/:id"
            element={<RequireRole roles={FACILITY_VIEWERS} permissions={FACILITY_VIEW_PAGES}><FacilityDetails /></RequireRole>}
          />
          <Route
            path="/admin/facilities/:id/edit"
            element={<RequireRole roles={FACILITY_MANAGERS} permissions={FACILITY_MANAGE_PAGES}><FacilityForm /></RequireRole>}
          />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <OfflineBanner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
