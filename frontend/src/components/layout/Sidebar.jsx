import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  MapPin,
  Hospital,
  Users,
  UserCheck,
  ClipboardList,
  BarChart3,
  ScrollText,
  Settings,
  X,
  ShieldCheck,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";
import { getModulesForUser, isSystemAdministrator } from "../../config/navigation";
import useMedicalOfficerCounts from "./useMedicalOfficerCounts";
import "./Sidebar.css";

// The case and registration APIs return at most 100 rows
const COUNT_LIMIT = 100;

// Helper for user initials
export function initials(name = "") {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase());
  return letters.join("") || "?";
}

/**
 * Modern Dark Forest Green Sidebar Component
 * Perfectly matching the Aarogya Drishti administration design:
 *  - Brand logo & healthy community motto
 *  - Sleek navigation links without clutter or scrollbars
 *  - Red counter badge for Registration Requests
 *  - Clean Logout action (Change password located in Profile menu)
 *  - Eastern Ghats Paderu illustration with ITDA Paderu / ASR District footer
 */
// collapsed / onToggleCollapse: desktop icon-only mode
export default function Sidebar({ user, open, onClose, onLogout, pendingCount = 1, collapsed = false, onToggleCollapse }) {
  const { t, language } = useLanguage();
  const isAdmin = isSystemAdministrator(user?.role);
  const modules = getModulesForUser(user);
  const counts = useMedicalOfficerCounts(user);

  const countText = (value) => (value >= COUNT_LIMIT
    ? `${formatLocalizedNumber(COUNT_LIMIT, language)}+`
    : formatLocalizedNumber(value, language));

  return (
    <aside
      id="app-sidebar"
      className={`admin-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
      aria-label={t("nav.menu")}
    >
      {/* Sidebar Header — Aarogya Drishti app icon */}
      <div className="sidebar-brand-header">
        <div className="sidebar-brand-logo-wrap">
          <img
            className="sidebar-brand-icon"
            src={`${process.env.PUBLIC_URL || ""}/icons/icon-512.png`}
            alt=""
            width={48}
            height={48}
            decoding="async"
          />
        </div>

        <div className="sidebar-brand-text">
          <span className="sidebar-brand-title">{t("common.appName")}</span>
          <span className="sidebar-brand-motto">
            {t("common.motto")}
          </span>
        </div>

        <button
          type="button"
          className="sidebar-mobile-close"
          onClick={onClose}
          aria-label={t("common.closeMenu")}
        >
          <X size={20} />
        </button>

        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={onToggleCollapse}
            aria-label={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
            aria-expanded={!collapsed}
            title={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav-container">
        <ul className="sidebar-nav-list">
          {/* Dashboard Home Link */}
          <li className="sidebar-nav-item">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
              onClick={onClose}
              title={collapsed ? t("nav.dashboard") : undefined}
            >
              <Home size={17} className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">{t("nav.dashboard")}</span>
            </NavLink>
          </li>

          {user?.role === "SUPER_ADMIN" && (
            <>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/district-admins" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <UserCog size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.districtAdmins")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/roles" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <ShieldCheck size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.roleManagement")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/locations" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <MapPin size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.locationManagement")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/facilities" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <Hospital size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.facilityManagement")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/registrations" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <UserCheck size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.registrationMonitoring")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/reports" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <BarChart3 size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.reportsAnalytics")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <NavLink to="/admin/audit" className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`} onClick={onClose}>
                  <ScrollText size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.auditLogs")}</span>
                </NavLink>
              </li>
              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <Settings size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">
                    {t("nav.settings")}
                    <span className="sidebar-secondary-label">{t("common.comingSoon")}</span>
                  </span>
                </span>
              </li>
            </>
          )}

          {isAdmin && user?.role !== "SUPER_ADMIN" && (
            <>
              <li className="sidebar-nav-item">
                <NavLink
                  to="/admin/roles"
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <ShieldCheck size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.roleManagement")}</span>
                </NavLink>
              </li>
            </>
          )}

          {/* Administrator Menu Matching Exact User Mockup */}
          {user?.role === "SUPER_ADMIN" ? null : isAdmin ? (
            <>
              <li className="sidebar-nav-item">
                <NavLink
                  to="/admin/facilities"
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <Hospital size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.facilityManagement")}</span>
                </NavLink>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <Users size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.patientManagement")}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <UserCheck size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.healthWorkers")}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <ClipboardList size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.registrationRequests")}</span>
                  <span className="sidebar-red-badge">{pendingCount || 1}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <BarChart3 size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.reportsAnalytics")}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <ScrollText size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.auditLogs")}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>

              <li className="sidebar-nav-item">
                <span className="sidebar-nav-link">
                  <Settings size={17} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{t("nav.settings")}</span>
                  <span className="sr-only">{t("common.comingSoon")}</span>
                </span>
              </li>
            </>
          ) : (
            /* Role-specific modules for other roles (Health Worker, etc.) */
            modules.map((mod, index) => (
              <React.Fragment key={mod.key}>
                {mod.group && mod.group !== modules[index - 1]?.group && (
                  <li className="sidebar-group-label">{t(`modules.${mod.group}.title`)}</li>
                )}
                <li className={`sidebar-nav-item ${mod.group ? "sidebar-sub-item" : ""}`}>
                  {mod.path ? (
                    <NavLink
                      to={mod.path}
                      className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                      onClick={onClose}
                      title={collapsed ? t(`modules.${mod.key}.title`) : undefined}
                    >
                      <mod.icon size={17} className="sidebar-nav-icon" />
                      <span className="sidebar-nav-label">{t(`modules.${mod.key}.title`)}</span>
                      {mod.countKey && counts[mod.countKey] > 0 && (
                        <span
                          className="sidebar-red-badge"
                          aria-label={t("nav.pendingCount", { count: countText(counts[mod.countKey]) })}
                        >
                          {countText(counts[mod.countKey])}
                        </span>
                      )}
                    </NavLink>
                  ) : (
                    <span
                      className="sidebar-nav-link sidebar-nav-disabled"
                      aria-disabled="true"
                      title={collapsed ? `${t(`modules.${mod.key}.title`)} (${t("common.comingSoon")})` : undefined}
                    >
                      <mod.icon size={17} className="sidebar-nav-icon" />
                      <span className="sidebar-nav-label">
                        {t(`modules.${mod.key}.title`)}
                        <span className="sidebar-secondary-label">{t("common.comingSoon")}</span>
                      </span>
                    </span>
                  )}
                </li>
              </React.Fragment>
            ))
          )}

        </ul>
      </nav>

      {/* Bottom Footer with Paderu Forest Image & Agency Branding */}
      <div className="sidebar-bottom-footer">
        <div className="sidebar-hills-wrapper">
          <img
            src="/assets/sidebar_hills.png"
            alt={t("common.sidebarImageAlt")}
            className="hills-img"
          />
          <div className="sidebar-hills-overlay">
            <span className="agency-title">{t("common.agencyFooter")}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
