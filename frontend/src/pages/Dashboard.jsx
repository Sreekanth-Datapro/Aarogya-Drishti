import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Hospital,
  ClipboardList,
  Users,
  Zap,
  ArrowRight,
  RefreshCw,
  UserCheck,
  UserCog,
  UserPlus,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { formatLocalizedDateTime, getAuditActionLabel, getLocalizedMasterName } from "../i18n/displayLabels";
import { apiMessage } from "../i18n/translate";
import { Alert, StatCard } from "../components/ui";

// Upgraded Modern Healthcare Dashboard Components
import DashboardBanner from "../components/dashboard/DashboardBanner";
import SummaryTiles from "../components/dashboard/SummaryTiles";
import AnalyticsOverview from "../components/dashboard/AnalyticsOverview";
import FacilityDistributionCard from "../components/dashboard/FacilityDistributionCard";
import UserDistributionCard from "../components/dashboard/UserDistributionCard";
import RecentActivity from "../components/dashboard/RecentActivity";
import RegistrationRequestsCard from "../components/dashboard/RegistrationRequestsCard";
import DistrictOverviewCard from "../components/dashboard/DistrictOverviewCard";
import SystemStatusCard from "../components/dashboard/SystemStatusCard";
import { getModulesForUser, isSystemAdministrator } from "../config/navigation";

// Preserved existing components for non-admin roles / test compatibility
import LocationSummary from "../components/dashboard/LocationSummary";
import QuickActions from "../components/dashboard/QuickActions";

import DistrictDashboard from "./district/DistrictDashboard";
import MoDashboard from "./medicalOfficer/MoDashboard";
import HwDashboard from "./healthWorker/HwDashboard";
import CareDashboard from "./careTeam/CareDashboard";
import NavigatorDashboard from "./careTeam/NavigatorDashboard";
import HospitalStaffDashboard from "./hospitalStaff/HospitalStaffDashboard";
import "./Dashboard.css";
import "./admin/AdminPages.css";

// Loading Skeleton Placeholder
function LoadingSkeleton() {
  return (
    <div className="dashboard-loading-skeleton" aria-hidden="true">
      <div className="skeleton-banner skeleton" />
      <div className="skeleton-grid-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <div key={n} className="skeleton dashboard-skeleton-card" />
        ))}
      </div>
    </div>
  );
}

/**
 * Main Aarogya Drishti Dashboard
 * Upgraded to match the high-fidelity System Administrator UI mockup.
 * Simple, readable student-level React code with standard useState & useEffect.
 */
// Built-in roles keep dedicated dashboards; custom roles get a generic landing page.
export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "DISTRICT_ADMIN") return <DistrictDashboard />;
  if (user?.role === "MEDICAL_OFFICER") return <MoDashboard />;
  if (user?.role === "HEALTH_WORKER") return <HwDashboard />;
  if (user?.role === "NAVIGATOR") return <NavigatorDashboard />;
  if (user?.role === "SPECIALIST") return <CareDashboard role={user.role} />;
  if (user?.role === "HOSPITAL_STAFF") return <HospitalStaffDashboard />;
  if (isSystemAdministrator(user?.role)) return <RoleDashboard />;
  return <CustomRoleDashboard />;
}

function CustomRoleDashboard() {
  const { user } = useAuth();
  const { t, tm } = useLanguage();
  const modules = getModulesForUser(user).filter((module) => module.path);

  return (
    <div className="health-worker-dash custom-role-dashboard">
      <div className="welcome-box">
        <h2>{t("dashboard.welcome")}, {user?.full_name}!</h2>
        <p>{t("dashboard.customRoleAccessText")}</p>
      </div>
      {modules.length === 0 ? (
        <Alert type="info">{tm("dashboard.customRoleNoPages")}</Alert>
      ) : (
        <section className="admin-panel" aria-label={t("dashboard.customRolePages")}>
          <div className="admin-panel-header">
            <h3>{t("dashboard.customRolePages")}</h3>
          </div>
          <div className="district-admin-overview-grid">
            {modules.map((module) => {
              const Icon = module.icon || ClipboardList;
              return (
                <Link key={module.key} to={module.path} className="district-admin-create-link">
                  <Icon size={17} aria-hidden="true" />
                  <span>{t(`modules.${module.key}.title`)}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function RoleDashboard() {
  const { user } = useAuth();
  const { language, t, tm } = useLanguage();

  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [districtAdmins, setDistrictAdmins] = useState([]);
  const [districtAdminsLoading, setDistrictAdminsLoading] = useState(false);
  const [districtAdminsError, setDistrictAdminsError] = useState("");
  const [rbacDashboard, setRbacDashboard] = useState(null);
  const [rbacDashboardError, setRbacDashboardError] = useState("");
  const [rbacDashboardLoading, setRbacDashboardLoading] = useState(false);

  // Load dashboard data from PostgreSQL via backend API
  const loadSummary = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await api.get("/dashboard/summary");
      setSummary(response.data);
    } catch {
      setError("dashboard.loadFailed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDistrictAdmins = useCallback(async () => {
    if (user?.role !== "SUPER_ADMIN") {
      setDistrictAdmins([]);
      setDistrictAdminsLoading(false);
      setDistrictAdminsError("");
      return;
    }

    setDistrictAdminsLoading(true);
    setDistrictAdminsError("");
    try {
      const response = await api.get("/admin/district-admins");
      setDistrictAdmins(response.data.district_admins);
    } catch (requestError) {
      setDistrictAdminsError(apiMessage(requestError, "dashboard.loadDistrictAdminsFailed"));
    } finally {
      setDistrictAdminsLoading(false);
    }
  }, [user?.role]);

  const loadRbacDashboard = useCallback(async () => {
    if (user?.role !== "SUPER_ADMIN") return;
    setRbacDashboardLoading(true);
    setRbacDashboardError("");
    try {
      const response = await api.get("/admin/rbac/dashboard");
      setRbacDashboard(response.data);
    } catch (requestError) {
      setRbacDashboardError(apiMessage(requestError, "dashboard.rbacLoadFailed"));
    } finally {
      setRbacDashboardLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadSummary();
    const interval = setInterval(() => loadSummary(true), 60000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") loadDistrictAdmins();
  }, [loadDistrictAdmins, user?.role]);

  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") loadRbacDashboard();
  }, [loadRbacDashboard, user?.role]);

  const isAdmin = isSystemAdministrator(user?.role);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canMonitorRegistrations = user?.permissions?.includes("registration.monitor") === true;
  const ready = !loading && summary;
  const activeDistrictAdmins = districtAdmins.filter((admin) => admin.status === "ACTIVE").length;
  const pendingDistrictAdmins = districtAdmins.filter((admin) => admin.status === "PENDING_SETUP").length;
  const assignedDistricts = new Set(
    districtAdmins
      .filter((admin) => admin.district_id !== null && admin.district_id !== undefined)
      .map((admin) => String(admin.district_id))
  ).size;
  const districtAdminMetric = (value) => {
    if (districtAdminsLoading) return t("dashboard.loadingMetrics");
    if (districtAdminsError) return t("dashboard.unavailable");
    return value;
  };

  return (
    <div className="admin-dashboard-container">
      {/* Loading Skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Error Banner with Retry Button */}
      {!loading && error && (
        <Alert type="error">
          {tm(error)}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm dashboard-inline-action"
            onClick={() => loadSummary()}
          >
            {t("common.tryAgain")}
          </button>
        </Alert>
      )}

      {/* Main Dashboard Layout when data is ready */}
      {ready && (
        <>
          {/* For non-admin roles (e.g. Health Worker), render role-appropriate overview */}
          {!isAdmin ? (
            <div className="health-worker-dash">
              <div className="welcome-box">
                <h2>{t("dashboard.welcome")}, {user?.full_name}!</h2>
              </div>
              <SummaryTiles summary={summary} role={user?.role} />
              <LocationSummary masters={summary.masters} canManage={false} />
              <QuickActions user={user} />
              {canMonitorRegistrations && user?.role !== "MEDICAL_OFFICER" && (
                <RegistrationRequestsCard
                  summary={summary}
                />
              )}
            </div>
          ) : (
            /* System & Super Administrator Upgraded Dashboard */
            <>
              {/* Accessible headings & helpers for screen readers & test compatibility */}
              <div className="sr-only">
                <h2>{t("dashboard.welcome")}, {user?.full_name}!</h2>
                <span>{user?.role === "SUPER_ADMIN" ? t("dashboard.accessFull") : t("dashboard.accessRole")}</span>
                {summary.users_by_role && <span>{t("dashboard.usersByRole")}</span>}
                {summary.system && (
                  <div>
                    <span>{t("dashboard.systemInfo")}</span>
                    <span>{t("dashboard.systemHealthy")}</span>
                    <span>v{summary.system.app_version}</span>
                    <span>{summary.system.database}</span>
                  </div>
                )}
                {summary.facilities && <span>{t("dashboard.facilitySummary")}</span>}
                <span>{t("dashboard.locationSummary")}</span>
              </div>
              {/* 1. Panoramic Healthcare Banner */}
              <DashboardBanner />

              {isSuperAdmin && (
                <section className="district-admin-overview" aria-label={t("dashboard.rbacOverview")}>
                  <div className="district-admin-overview-header">
                    <div>
                      <h2>{t("dashboard.rbacOverview")}</h2>
                      <p>{t("dashboard.rbacOverviewText")}</p>
                    </div>
                    <Link to="/admin/roles" className="district-admin-create-link">
                      <UserCog size={17} aria-hidden="true" />
                      {t("dashboard.manageAccess")}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  {rbacDashboardError && <Alert type="error">{tm(rbacDashboardError)}</Alert>}
                  <div className="district-admin-overview-grid">
                    <StatCard icon={Users} label={t("dashboard.rbacTotalUsers")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.total_users ?? 0} tone="blue" />
                    <StatCard icon={UserCheck} label={t("dashboard.rbacActiveUsers")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.active_users ?? 0} tone="green" />
                    <StatCard icon={Users} label={t("dashboard.rbacInactiveUsers")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.inactive_users ?? 0} tone="amber" />
                    <StatCard icon={UserCog} label={t("dashboard.rbacTotalRoles")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.total_roles ?? 0} tone="violet" />
                    <StatCard icon={ClipboardList} label={t("dashboard.rbacTotalPermissions")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.total_permissions ?? 0} tone="blue" />
                    <StatCard icon={UserPlus} label={t("dashboard.rbacCustomRoles")} value={rbacDashboardLoading ? "…" : rbacDashboard?.metrics?.custom_roles ?? 0} tone="green" />
                  </div>
                  <div className="admin-panel">
                    <div className="admin-panel-header"><h3>{t("dashboard.rbacRecentActivity")}</h3></div>
                    {rbacDashboardLoading ? <p>{t("dashboard.loadingMetrics")}</p> : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead><tr><th>{t("dashboard.rbacActivityDate")}</th><th>{t("dashboard.rbacActivityActor")}</th><th>{t("dashboard.rbacActivityAction")}</th><th>{t("dashboard.rbacActivityTarget")}</th></tr></thead>
                          <tbody>
                            {(rbacDashboard?.activities || []).map((activity) => (
                              <tr key={activity.id}>
                                <td>{formatLocalizedDateTime(activity.occurred_at, language)}</td>
                                <td>{activity.actor_name || activity.actor_role || "-"}</td>
                                <td>{getAuditActionLabel(activity.event, language)}</td>
                                <td>{activity.resource_type} · {activity.resource_id || "-"}</td>
                              </tr>
                            ))}
                            {!rbacDashboard?.activities?.length && <tr><td colSpan="4" className="empty-state-box">{t("dashboard.rbacNoActivity")}</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {rbacDashboardError && <button type="button" className="btn btn-secondary btn-sm dashboard-inline-action" onClick={loadRbacDashboard}>{t("common.tryAgain")}</button>}
                </section>
              )}

              {isSuperAdmin && !loading && summary && (
                <>
                  <section className="district-admin-overview" aria-label={t("dashboard.administrationOverview")}>
                    <div className="district-admin-overview-header">
                      <div>
                        <h2>{t("dashboard.administrationOverview")}</h2>
                        <p>{t("dashboard.administrationOverviewText")}</p>
                      </div>
                    </div>
                    <div className="district-admin-overview-grid">
                      <StatCard icon={MapPin} label={t("dashboard.totalDistricts")} value={summary.masters?.districts ?? 0} tone="violet" />
                      <StatCard icon={Hospital} label={t("dashboard.totalFacilities")} value={summary.masters?.facilities ?? 0} tone="blue" />
                      <StatCard icon={Users} label={t("dashboard.districtAdmins")} value={districtAdminMetric(districtAdmins.length)} tone="amber" />
                      <StatCard icon={UserCheck} label={t("dashboard.activeUsers")} value={summary.total_users ?? 0} tone="green" />
                      <StatCard icon={ClipboardList} label={t("dashboard.pendingSetup")} value={summary.pending_setup_accounts ?? 0} tone="amber" />
                      <StatCard icon={UserCheck} label={t("dashboard.pendingRequests")} value={summary.pending_registrations ?? 0} tone="blue" />
                    </div>
                  </section>

                  <section className="admin-page admin-district-table">
                    <div className="admin-panel">
                      <div className="admin-panel-header"><h2>{t("dashboard.districtWiseOverview")}</h2></div>
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead><tr><th>{t("dashboard.district")}</th><th>{t("dashboard.mandals")}</th><th>{t("dashboard.villages")}</th><th>{t("dashboard.facilitiesLabel")}</th><th>{t("dashboard.activeUsers")}</th></tr></thead>
                          <tbody>
                            {(Array.isArray(summary.district_info) ? summary.district_info : []).map((district) => (
                              <tr key={district.id}>
                                <td>{getLocalizedMasterName(district, language)}</td><td>{district.mandals}</td><td>{district.villages}</td><td>{district.facilities}</td><td>{district.active_users}</td>
                              </tr>
                            ))}
                            {(!Array.isArray(summary.district_info) || !summary.district_info.length) && (
                              <tr><td colSpan="5" className="empty-state-box">{t("dashboard.noActiveDistricts")}</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {isSuperAdmin && (
                <section className="district-admin-overview" aria-labelledby="district-admin-overview-title">
                  <div className="district-admin-overview-header">
                    <div>
                      <h2 id="district-admin-overview-title">{t("dashboard.districtAdminManagement")}</h2>
                      <p>{t("dashboard.districtAdminManagementDescription")}</p>
                    </div>
                    <Link to="/admin/district-admins" className="district-admin-create-link">
                      <UserPlus size={17} aria-hidden="true" />
                    {t("dashboard.createDistrictAdmin")}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>

                  {districtAdminsError && (
                    <Alert type="error">
                      {tm(districtAdminsError)}{" "}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm dashboard-inline-action"
                        onClick={loadDistrictAdmins}
                      >
                        {t("common.tryAgain")}
                      </button>
                    </Alert>
                  )}

                  <div className="district-admin-overview-grid">
                    <StatCard
                      icon={Users}
                      label={t("dashboard.totalDistrictAdmins")}
                      value={districtAdminMetric(districtAdmins.length)}
                      tone="blue"
                    />
                    <StatCard
                      icon={UserCheck}
                      label={t("dashboard.activeDistrictAdmins")}
                      value={districtAdminMetric(activeDistrictAdmins)}
                      tone="green"
                    />
                    <StatCard
                      icon={ClipboardList}
                      label={t("dashboard.pendingSetup")}
                      value={districtAdminMetric(pendingDistrictAdmins)}
                      tone="amber"
                    />
                    <StatCard
                      icon={MapPin}
                      label={t("dashboard.districtsAssigned")}
                      value={districtAdminMetric(assignedDistricts)}
                      tone="violet"
                    />
                  </div>
                </section>
              )}

              {/* 2. Existing role summaries are kept for SYSTEM_ADMIN; SUPER_ADMIN uses the overview above. */}
              {!isSuperAdmin && <SummaryTiles summary={summary} role={user?.role} />}

              {/* 3. Analytics & Distribution Section (3 Columns on Desktop) */}
              {!isSuperAdmin && <div className="analytics-section-row">
                {/* Left: Interactive Multi-Line Trend Chart (50% width) */}
                <div className="analytics-col-wide">
                  <AnalyticsOverview trends={summary.trends || []} />
                </div>

                {/* Middle: Facility Distribution Donut Ring (25% width) */}
                <div className="analytics-col-narrow">
                  <FacilityDistributionCard facilities={summary.facilities || {}} />
                </div>

                {/* Right: User Distribution Donut Ring (25% width) */}
                <div className="analytics-col-narrow">
                  <UserDistributionCard summary={summary} />
                </div>
              </div>}

              {/* 4. Bottom Row: 4 Cards (Activities, Requests, District, System Status) */}
              <div className="bottom-cards-row">
                {/* Recent Audit Activities */}
                <RecentActivity items={summary.recent_activity || []} />

                {/* Registration Requests & Review Modal Action */}
                {canMonitorRegistrations && user?.role !== "MEDICAL_OFFICER" && (
                  <RegistrationRequestsCard
                    summary={summary}
                  />
                )}

                {/* District Overview: Paderu / ASR District */}
                <DistrictOverviewCard
                  districtInfo={Array.isArray(summary.district_info) ? summary.district_info[0] : summary.district_info}
                  masters={summary.masters}
                />

                {/* System Status: DB, API & Backup Monitoring */}
                <SystemStatusCard system={summary.system || {}} />
              </div>

              {/* Quick Actions Row for Easy Administrator Viva Navigation */}
              <div className="quick-actions-bar">
                <div className="quick-actions-title">
                  <Zap size={16} className="zap-icon" />
                  <span>{t("dashboard.quickActions")}:</span>
                </div>
                <div className="quick-actions-links">
                  {isSuperAdmin ? (
                    <>
                      <Link to="/admin/district-admins" className="quick-action-pill">
                        <UserPlus size={14} />
                        <span>{t("dashboard.districtAdminManagement")}</span>
                      </Link>
                      <Link to="/admin/roles" className="quick-action-pill">
                        <UserCheck size={14} />
                        <span>{t("dashboard.customRolesPermissions")}</span>
                      </Link>
                      <Link to="/admin/locations" className="quick-action-pill">
                        <MapPin size={14} />
                        <span>{t("dashboard.locationManagement")}</span>
                      </Link>
                      <Link to="/admin/facilities" className="quick-action-pill">
                        <Hospital size={14} />
                        <span>{t("dashboard.facilityManagement")}</span>
                      </Link>
                      <Link to="/admin/registrations" className="quick-action-pill">
                        <ClipboardList size={14} />
                        <span>{t("dashboard.registrationMonitoring")}</span>
                      </Link>
                      <Link to="/admin/reports" className="quick-action-pill">
                        <ArrowRight size={14} />
                        <span>{t("dashboard.reportsAnalytics")}</span>
                      </Link>
                      <Link to="/admin/audit" className="quick-action-pill">
                        <ArrowRight size={14} />
                        <span>{t("dashboard.auditLogs")}</span>
                      </Link>
                      <span className="quick-action-pill" aria-disabled="true">
                        <span>{t("dashboard.systemSettings")}</span>
                        <small>{t("dashboard.comingSoon")}</small>
                      </span>
                    </>
                  ) : (
                    <>
                      <Link to="/admin/locations" className="quick-action-pill">
                        <MapPin size={14} />
                        <span>{t("dashboard.importFromLgd")}</span>
                      </Link>
                      <Link to="/admin/facilities" className="quick-action-pill">
                        <Hospital size={14} />
                        <span>{t("dashboard.manageFacilitiesShort")}</span>
                      </Link>
                      <Link to="/admin/facilities/new" className="quick-action-pill">
                        <span>+ {t("dashboard.addFacilityShort")}</span>
                      </Link>
                      <button
                        type="button"
                        className="quick-action-pill refresh-btn"
                        onClick={() => loadSummary(true)}
                        disabled={refreshing}
                      >
                        <RefreshCw size={13} className={refreshing ? "spin" : ""} />
                        <span>{refreshing ? t("common.loading") : t("dashboard.refreshData")}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
