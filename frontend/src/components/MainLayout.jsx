import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import Sidebar from "./layout/Sidebar";
import Topbar from "./layout/Topbar";

// Title shown in the top bar for each page address
// (a page also matches when the address starts with the key, e.g. /admin/facilities/12)
const PAGE_TITLES = {
  "/dashboard": "nav.dashboard",
  "/settings": "settings.title",
  "/admin/locations": "locations.title",
  "/admin/facilities": "facilities.title",
  "/admin/roles": "nav.roleManagement",
  "/admin/district-admins": "nav.districtAdmins",
  "/admin/registrations": "nav.registrationMonitoring",
  "/admin/reports": "modules.reports.title",
  "/admin/audit": "modules.auditLogs.title",
  "/admin/staff": "staff.title",
  "/admin/health-worker-assignments": "modules.healthWorkerAssignments.title",
  "/district/staff": "staff.title",
  "/district/patients": "modules.districtPatients.title",
  "/district/locations": "modules.districtLocations.title",
  "/district/programme": "modules.districtProgramme.title",
  "/district/audit": "modules.districtAuditLogs.title",
  "/health-worker/patients": "modules.healthWorkerPatients.title",
  "/health-worker/appointments": "modules.healthWorkerAppointments.title",
  "/medical-officer/queue": "modules.moScreeningQueue.title",
  "/medical-officer/registrations": "modules.moRegistrations.title",
  "/medical-officer/patients": "modules.moMandalPatients.title",
  "/medical-officer/review": "modules.moClinicalReview.title",
  "/medical-officer/images": "modules.moImageReview.title",
  "/medical-officer/notes": "modules.moClinicalNotes.title",
  "/medical-officer/referrals": "modules.moReferrals.title",
  "/medical-officer/followups": "modules.moFollowUp.title",
  "/medical-officer/care": "modules.moCareLifecycle.title",
  "/medical-officer/diagnostics": "modules.moDiagnostics.title",
  "/medical-officer/tracking": "modules.moTracking.title",
  "/medical-officer/reports": "modules.moReports.title",
  "/medical-officer/profile": "modules.moProfile.title",
  "/admin/diagnostic-tests": "modules.diagnosticTestMaster.title",
  "/district/registrations": "modules.districtRegistrations.title",
  "/district/health-workers": "modules.districtHealthWorkers.title",
  "/district/tracking": "modules.districtTracking.title",
  "/health-worker/screening": "modules.screening.title",
  "/health-worker/tracking": "modules.healthWorkerTracking.title",
  "/navigator/patients": "modules.navPatients.title",
  "/navigator/referrals": "modules.navReferrals.title",
  "/navigator/appointments": "modules.navAppointments.title",
  "/navigator/video": "modules.navVideo.title",
  "/navigator/followups": "modules.navFollowUps.title",
  "/navigator/diagnostics": "modules.navDiagnostics.title",
  "/navigator/tracking": "modules.navTracking.title",
  "/hospital-staff/appointments": "modules.appointments.title",
  "/hospital-staff/diagnostics": "modules.hsDiagnostics.title",
  "/hospital-staff/tracking": "modules.hsTracking.title",
  "/hospital-staff/attendance": "modules.attendance.title",
  "/health-worker/diagnostics": "modules.healthWorkerDiagnostics.title",
  "/specialist/referrals": "modules.spReferrals.title",
  "/specialist/consultations": "modules.spConsultations.title",
  "/specialist/video": "modules.spVideo.title",
  "/specialist/notes": "modules.spNotes.title",
  "/specialist/diagnostics": "modules.spDiagnostics.title",
  "/specialist/followups": "modules.spFollowUps.title",
  "/specialist/care": "modules.spFollowUps.title",
  "/specialist/tracking": "modules.spTracking.title",
};

function titleKeyFor(pathname) {
  const match = Object.keys(PAGE_TITLES).find((path) => pathname === path || pathname.startsWith(`${path}/`));
  return match ? PAGE_TITLES[match] : "common.appName";
}

// The frame around every signed-in page: sidebar + top bar + page content.
function MainLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Only used on small screens, where the sidebar is a slide-in drawer
  const [menuOpen, setMenuOpen] = useState(false);

  // Desktop icon-only sidebar preference is shared across dashboard roles.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      localStorage.setItem("sidebarCollapsed", String(!current));
      return !current;
    });
  };
  const sidebarCollapsed = collapsed;

  // Close the drawer after moving to another page
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close the drawer with the Escape key
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    const result = await logout();
    if (result?.needsConfirm) {
      const ok = window.confirm(
        t("offline.logoutWarnDrafts", { count: result.pendingCount })
      );
      if (!ok) return;
      await logout({ force: true });
    }
    navigate("/login");
  };

  const title = t(titleKeyFor(location.pathname));

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {menuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label={t("common.closeMenu")}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="app-main">
        <Topbar title={title} user={user} menuOpen={menuOpen} onMenuClick={() => setMenuOpen(true)} />

        <main className="page" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
