import React, { useState, useEffect, useRef } from "react";
import {
  Menu,
  Calendar,
  Bell,
  Globe,
  ChevronDown,
  KeyRound,
  LogOut,
  CheckCircle2,
  Settings,
  ChevronRight,
  Download,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { formatLocalizedDate, formatLocalizedDateTime, getRoleLabel } from "../../i18n/displayLabels";
import api from "../../services/api";
import GlobalVoiceHeaderControl from "../../voice/global/GlobalVoiceHeaderControl";
import { useGlobalVoiceOptional } from "../../voice/global/GlobalVoiceContext";
import usePwaInstall from "../../pwa/usePwaInstall";
import "./Topbar.css";

const NOTIFICATION_COPY_KEYS = {
  SPECIALIST_AVAILABILITY_REQUEST: {
    title: "notifications.availabilityRequestTitle",
    message: "notifications.availabilityRequestMessage",
  },
  SPECIALIST_AVAILABILITY_RESPONSE: {
    title: "notifications.availabilityResponseTitle",
    message: "notifications.availabilityResponseMessage",
  },
  SPECIALIST_AVAILABILITY_ALTERNATIVE: {
    title: "notifications.availabilityAlternativeTitle",
    message: "notifications.availabilityAlternativeMessage",
  },
  SPECIALIST_AVAILABILITY_UNAVAILABLE: {
    title: "notifications.availabilityUnavailableTitle",
    message: "notifications.availabilityUnavailableMessage",
  },
  NAVIGATOR_VIDEO_PREFERRED_TIME: {
    title: "notifications.navigatorPreferredTimeTitle",
    message: "notifications.navigatorPreferredTimeMessage",
  },
  HOSPITAL_VIDEO_REQUEST_DECLINED: {
    title: "notifications.hospitalRequestDeclinedTitle",
    message: "notifications.hospitalRequestDeclinedMessage",
  },
  HOSPITAL_VIDEO_REQUEST_RESCHEDULED: {
    title: "notifications.hospitalRequestRescheduledTitle",
    message: "notifications.hospitalRequestRescheduledMessage",
  },
  VIDEO_APPOINTMENT_CONFIRMED: {
    title: "notifications.videoAppointmentConfirmedTitle",
    message: "notifications.videoAppointmentConfirmedMessage",
  },
  TRACKING_NEXT_ACTION: {
    title: "notifications.trackingNextActionTitle",
    message: "notifications.trackingNextActionMessage",
  },
  SCREENING_AWAITING_REVIEW: {
    title: "notifications.screeningAwaitingReviewTitle",
    message: "notifications.screeningAwaitingReviewMessage",
  },
  CASE_ASSIGNED_TO_MO: {
    title: "notifications.caseAssignedTitle",
    message: "notifications.caseAssignedMessage",
  },
  SPECIALIST_DECISION_FOR_MO: {
    title: "notifications.specialistDecisionTitle",
    message: "notifications.specialistDecisionMessage",
  },
  SPECIALIST_ESCALATION: {
    title: "notifications.specialistEscalationTitle",
    message: "notifications.specialistEscalationMessage",
  },
  DIAGNOSTIC_REPORT_FOR_MO: {
    title: "notifications.diagnosticReportTitle",
    message: "notifications.diagnosticReportMessage",
  },
  CARE_DISCOMFORT_REPORTED: {
    title: "notifications.careDiscomfortTitle",
    message: "notifications.careDiscomfortMessage",
  },
  CARE_DISCOMFORT_ESCALATED: {
    title: "notifications.careEscalationTitle",
    message: "notifications.careEscalationMessage",
  },
  CARE_FINAL_CHECKUP: {
    title: "notifications.careFinalCheckupTitle",
    message: "notifications.careFinalCheckupMessage",
  },
};

/**
 * Live Clock Hook
 * Updates current date and time every 30 seconds
 */
function useLiveClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  return currentTime;
}

/**
 * Upgraded Topbar Header
 * Matches exact UI mockup:
 *  - Hamburger toggle (☰)
 *  - Branding: Aarogya Drishti | Current page
 *  - Live Date/Time pill: Nov 1, 2026 | 11:37 AM
 *  - Language Switcher: English ˅ / తెలుగు
 *  - Notifications: Bell icon with the current unread count
 *  - Account profile dropdown with the signed-in user's name and role
 */
export default function Topbar({ title, user, menuOpen, onMenuClick }) {
  const { t, language, setLanguage } = useLanguage();
  const { canPrompt, showIosHelp, install } = usePwaInstall();
  const showInstallHint = canPrompt || showIosHelp;
  const globalVoice = useGlobalVoiceOptional();
  const { logout, isOffline } = useAuth();
  const navigate = useNavigate();
  const clock = useLiveClock();

  // Dropdown states
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  const langRef = useRef(null);
  const profileRef = useRef(null);
  const notificationsRef = useRef(null);

  const loadNotifications = React.useCallback(async () => {
    if (!user?.id || isOffline) return;
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const response = await api.get("/notifications");
      setNotifications(Array.isArray(response.data.notifications) ? response.data.notifications : []);
      setUnreadCount(Number(response.data.unread_count) || 0);
    } catch (requestError) {
      if (requestError?.code === "OFFLINE_MODE_NO_API" || requestError?.isOfflineError) return;
      setNotificationsError(requestError?.response?.data?.message || t("notifications.loadFailed"));
    } finally {
      setNotificationsLoading(false);
    }
  }, [user?.id, t, isOffline]);

  // Close popups on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  const openNotification = async (notification) => {
    setNotificationsError("");
    try {
      if (!notification.is_read) {
        await api.post(`/notifications/${notification.id}/read`);
        await loadNotifications();
      }
      setNotificationsOpen(false);
      if (notification.target_path) navigate(notification.target_path);
    } catch (requestError) {
      setNotificationsError(requestError?.response?.data?.message || t("notifications.markReadFailed"));
    }
  };

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
  const displayName = user?.full_name || user?.username || t("common.account");
  const displayRole = user?.role ? getRoleLabel(user.role, language) : "";

  const formattedDate = formatLocalizedDate(clock, language);
  const formattedTime = formatLocalizedDateTime(clock, language, {
    hour: "numeric",
    minute: "2-digit",
  });
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <header className="admin-topbar">
      {/* Left: Hamburger & Brand Title */}
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu-toggle"
          onClick={onMenuClick}
          aria-label={t("common.openMenu")}
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
        >
          <Menu size={22} />
        </button>

        <div className="topbar-titles">
          {isSuperAdmin ? (
            <>
              <nav className="topbar-breadcrumbs" aria-label={t("common.breadcrumbs")}>
                <Link to="/dashboard">{t("common.appName")}</Link>
                <ChevronRight size={14} aria-hidden="true" />
                <span aria-current="page">{title || t("nav.dashboard")}</span>
              </nav>
              <h1 className="brand-heading">{title || t("nav.dashboard")}</h1>
            </>
          ) : (
            <>
              <h1 className="brand-heading">{t("common.appName")}</h1>
              <p className="brand-subtitle">{title || t("dashboard.systemAdminTitle")}</p>
            </>
          )}
        </div>
      </div>

      {/* Right: Date, Language and Profile */}
      <div className="topbar-right">
        {/* Date & Time Pill */}
        <div className="datetime-pill">
          <Calendar size={15} className="datetime-icon" />
          <span className="datetime-text">
            {formattedDate} | {formattedTime}
          </span>
        </div>

        {/* Global Voice Receptionist (Sarvam) — explicit user activation only */}
        <GlobalVoiceHeaderControl key="global-voice-header" />

        {/* PWA install — only when browser can prompt or iOS Add-to-Home-Screen help applies */}
        {showInstallHint ? (
          canPrompt ? (
            <button
              type="button"
              className="topbar-install-btn"
              onClick={() => install()}
              aria-label={t("pwa.installButton")}
              title={t("pwa.installTitle")}
            >
              <Download size={16} aria-hidden="true" />
              <span className="topbar-install-label">{t("pwa.installButton")}</span>
            </button>
          ) : (
            <Link
              to="/settings"
              className="topbar-install-btn"
              aria-label={t("pwa.installTitle")}
              title={t("pwa.iosHelpTitle")}
            >
              <Download size={16} aria-hidden="true" />
              <span className="topbar-install-label">{t("pwa.installButton")}</span>
            </Link>
          )
        ) : null}

        {/* UI Language Selector */}
        <div className="header-dropdown-wrap" ref={langRef}>
          <button
            type="button"
            className="topbar-action-pill"
            onClick={() => setLangOpen(!langOpen)}
            aria-expanded={langOpen}
            aria-label={`${t("common.language")}: ${language === "te" ? "తెలుగు" : "English"}`}
          >
            <Globe size={16} className="pill-icon" />
            <span className="pill-text">{language === "te" ? "తెలుగు" : "English"}</span>
            <ChevronDown size={13} className="chevron-icon" />
          </button>

          {langOpen && (
            <div className="dropdown-panel lang-panel">
              <button
                type="button"
                className={`dropdown-item ${language === "en" ? "active" : ""}`}
                onClick={() => {
                  setLanguage("en");
                  globalVoice?.setVoiceLocale?.("en");
                  setLangOpen(false);
                }}
              >
                <span>English</span>
                {language === "en" && <CheckCircle2 size={14} className="check-icon" />}
              </button>
              <button
                type="button"
                className={`dropdown-item ${language === "te" ? "active" : ""}`}
                onClick={() => {
                  setLanguage("te");
                  globalVoice?.setVoiceLocale?.("te");
                  setLangOpen(false);
                }}
              >
                <span>తెలుగు</span>
                {language === "te" && <CheckCircle2 size={14} className="check-icon" />}
              </button>
            </div>
          )}
        </div>

        <div className="header-dropdown-wrap" ref={notificationsRef}>
          <button
            type="button"
            className="icon-action-btn"
            aria-label={t("notifications.open")}
            aria-expanded={notificationsOpen}
            onClick={() => {
              const nextOpen = !notificationsOpen;
              setNotificationsOpen(nextOpen);
              if (nextOpen) loadNotifications();
            }}
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="notification-badge" aria-label={t("notifications.unreadCount", { count: unreadCount })}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="dropdown-panel notification-panel">
              <div className="notification-panel-heading">
                <strong>{t("notifications.title")}</strong>
                <span>{t("notifications.unreadCount", { count: unreadCount })}</span>
              </div>
              {notificationsError && <p className="notification-error" role="alert">{notificationsError}</p>}
              {notificationsLoading ? (
                <p className="notification-empty" role="status">{t("notifications.loading")}</p>
              ) : notifications.length ? (
                <div className="notification-list">
                  {notifications.map((notification) => (
                    <button
                      type="button"
                      key={notification.id}
                      className={`notification-item${notification.is_read ? "" : " unread"}`}
                      onClick={() => openNotification(notification)}
                    >
                      <strong>{NOTIFICATION_COPY_KEYS[notification.event_type]
                        ? t(NOTIFICATION_COPY_KEYS[notification.event_type].title)
                        : notification.title || t("notifications.untitled")}</strong>
                      <span>{NOTIFICATION_COPY_KEYS[notification.event_type]
                        ? t(NOTIFICATION_COPY_KEYS[notification.event_type].message)
                        : notification.message || ""}</span>
                      <time dateTime={notification.created_at}>
                        {formatLocalizedDateTime(notification.created_at, language)}
                      </time>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="notification-empty">{t("notifications.empty")}</p>
              )}
            </div>
          )}
        </div>

        {/* Admin Profile Dropdown */}
        <div className="header-dropdown-wrap" ref={profileRef}>
          <button
            type="button"
            className="admin-profile-btn"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-expanded={profileOpen}
            aria-label={`${displayName}${displayRole ? `, ${displayRole}` : ""}`}
          >
            <span className="admin-avatar-initials" aria-hidden="true">{initials || "?"}</span>
            <div className="admin-profile-meta">
              <div className="admin-name-row">
                <span className="admin-name">{displayName}</span>
                <ChevronDown size={12} className="chevron-icon" />
              </div>
              <span className="admin-role-title">{displayRole}</span>
            </div>
          </button>

          {profileOpen && (
            <div className="dropdown-panel profile-panel">
              <div className="profile-panel-header">
                <p className="user-name">{user?.full_name || t("common.systemAdministrator")}</p>
                <p className="user-role">{displayRole}</p>
              </div>
              <div className="dropdown-divider" />
              <Link
                to="/settings"
                className="dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <Settings size={15} />
                <span>{t("nav.accountSettings")}</span>
              </Link>
              <Link
                to="/change-password"
                className="dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <KeyRound size={15} />
                <span>{t("nav.changePassword")}</span>
              </Link>
              <button
                type="button"
                className="dropdown-item logout-item"
                onClick={handleLogout}
              >
                <LogOut size={15} />
                <span>{t("common.signOut")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
