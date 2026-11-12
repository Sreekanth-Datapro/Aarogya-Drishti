import React from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Landmark,
  Home,
  Hospital,
  Users,
  UserCheck,
  ClipboardList,
  Stethoscope,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";
import "./SummaryTiles.css";

/**
 * Single KPI Metric Card Component
 */
function MetricCard({ icon: Icon, color, label, value, trend, trendDirection = "up", to }) {
  const { language } = useLanguage();
  const formattedValue =
    typeof value === "number" ? formatLocalizedNumber(value, language) : value || "0";

  const content = (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-card-header">
        <div className={`kpi-icon-wrap icon-bg-${color}`}>
          <Icon size={22} className="kpi-icon" />
        </div>
        <div className="kpi-header-content">
          <p className="kpi-label">{label}</p>
          <div className="kpi-value-row">
            <h3 className="kpi-value">{formattedValue}</h3>
            {trend && (
              <span className={`kpi-trend trend-${trendDirection}`}>
                {trendDirection === "up" ? (
                  <ArrowUpRight size={13} className="trend-arrow" />
                ) : (
                  <ArrowDownRight size={13} className="trend-arrow" />
                )}
                <span>{trend}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="kpi-card-link">
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * 8 KPI Cards Grid - 100% Dynamic data from PostgreSQL
 */
export default function SummaryTiles({ summary, role }) {
  const { t } = useLanguage();

  const isAdmin = role === "SUPER_ADMIN" || role === "SYSTEM_ADMIN";
  const locationsLink = isAdmin ? "/admin/locations" : undefined;
  const facilitiesLink = isAdmin ? "/admin/facilities" : undefined;

  const totalDistricts = summary?.masters?.districts ?? 0;
  const totalMandals = summary?.masters?.mandals ?? 0;
  const totalVillages = summary?.masters?.villages ?? 0;
  const totalFacilities = summary?.facilities?.total ?? summary?.masters?.facilities ?? 0;

  const totalUsers =
    summary?.total_users ??
    (summary?.users_by_role
      ? summary.users_by_role.reduce((acc, r) => acc + Number(r.total || 0), 0)
      : 0);

  const registeredPatients = summary?.patients_registered ?? 0;
  const pendingRegistrations =
    summary?.pending_registrations ??
    summary?.registrations_summary?.pending ??
    0;

  const activeHealthWorkers =
    summary?.active_health_workers ??
    (summary?.users_by_role
      ? summary.users_by_role.find((r) => r.role === "HEALTH_WORKER")?.total || 0
      : 0);

  // Compute month-over-month trend dynamically from trends array if available
  // Returns null trend when no real trend data is available (hides the badge)
  const getDynamicTrend = (key) => {
    if (!summary?.trends || summary.trends.length < 2) return { trend: null, dir: "up" };
    const len = summary.trends.length;
    const curr = Number(summary.trends[len - 1]?.[key] || 0);
    const prev = Number(summary.trends[len - 2]?.[key] || 0);
    if (prev === 0 && curr === 0) return { trend: null, dir: "up" };
    if (prev === 0) return { trend: "+100%", dir: "up" };
    const pct = Math.round(((curr - prev) / prev) * 100);
    return {
      trend: `${Math.abs(pct)}%`,
      dir: pct >= 0 ? "up" : "down",
    };
  };

  const regTrend = getDynamicTrend("registrations");
  const patTrend = getDynamicTrend("patients");
  const facTrend = getDynamicTrend("facilities");

  return (
    <div className="dashboard-kpi-grid">
      {/* 1. Total Districts */}
      <MetricCard
        icon={MapPin}
        color="green"
        label={t("dashboard.totalDistricts")}
        value={totalDistricts}
        to={locationsLink}
      />

      {/* 2. Total Mandals */}
      <MetricCard
        icon={Landmark}
        color="blue"
        label={t("dashboard.totalMandals")}
        value={totalMandals}
        to={locationsLink}
      />

      {/* 3. Total Villages */}
      <MetricCard
        icon={Home}
        color="orange"
        label={t("dashboard.totalVillages")}
        value={totalVillages}
        to={locationsLink}
      />

      {/* 4. Total Facilities */}
      {(summary?.facilities || (isAdmin && summary?.masters?.facilities !== undefined)) && (
        <MetricCard
          icon={Hospital}
          color="purple"
          label={t("dashboard.totalFacilities")}
          value={totalFacilities}
          trend={facTrend.trend}
          trendDirection={facTrend.dir}
          to={facilitiesLink}
        />
      )}

      {/* 5. Registered Users (Visible to Admin or when total_users present) */}
      {(isAdmin || summary?.total_users !== undefined) && (
        <MetricCard
          icon={Users}
          color="green"
          label={t("dashboard.registeredUsers")}
          value={totalUsers}
          trend={regTrend.trend}
          trendDirection={regTrend.dir}
        />
      )}

      {/* 6. Registered Patients */}
      {(isAdmin || summary?.patients_registered !== undefined) && (
        <MetricCard
          icon={UserCheck}
          color="blue"
          label={t("dashboard.patientsRegistered")}
          value={registeredPatients}
          trend={patTrend.trend}
          trendDirection={patTrend.dir}
        />
      )}

      {/* 7. Pending Registrations */}
      {(isAdmin || summary?.pending_registrations !== undefined) && (
        <MetricCard
          icon={ClipboardList}
          color="orange"
          label={t("dashboard.pending")}
          value={pendingRegistrations}
        />
      )}

      {/* 8. Active Health Workers */}
      {(isAdmin || summary?.active_health_workers !== undefined) && (
        <MetricCard
          icon={Stethoscope}
          color="cyan"
          label={t("dashboard.activeHealthWorkers")}
          value={activeHealthWorkers}
        />
      )}
    </div>
  );
}
