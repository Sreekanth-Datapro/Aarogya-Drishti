import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Bell,
  Building2,
  ClipboardCheck,
  Hospital,
  RefreshCw,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getAuditActionLabel,
  getCaseStateLabel,
  getDeliveryChannelLabel,
  getDeliveryStatusLabel,
  getLocalizedField,
  getLocalizedMasterName,
  getRegistrationStatusLabel,
  getRoleLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, BarChart, DonutChart, EmptyState, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import ColumnChart from "./ColumnChart";
import "./District.css";

const STAFF_ROLES = ["HEALTH_WORKER", "MEDICAL_OFFICER", "SPECIALIST", "NAVIGATOR"];
const STATE_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--gray-500)", "var(--brand-300)",
];
const REGISTRATION_COLORS = {
  PENDING: "var(--chart-3)",
  APPROVED: "var(--chart-1)",
  REJECTED: "var(--chart-5)",
};

// Case stages counted as "finished" on the dashboard
const COMPLETED_STATES = ["CARE_LINKED", "CLOSED"];

function ChartCard({ title, children, empty, emptyText }) {
  return (
    <section className="district-card">
      <h2 className="district-card-title">{title}</h2>
      {empty ? <p className="district-empty">{emptyText}</p> : children}
    </section>
  );
}

export default function DistrictDashboard() {
  const { t, tm, language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/district/dashboard");
      setData(response.data.dashboard);
    } catch (requestError) {
      setError(apiMessage(requestError, "district.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <PageLoader label={t("district.loading")} />;

  if (error && !data) {
    return (
      <Alert type="error">
        {tm(error)}{" "}
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>{t("common.tryAgain")}</button>
      </Alert>
    );
  }

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const stateCount = (codes) => data.case_states
    .filter((row) => codes.includes(row.state))
    .reduce((sum, row) => sum + row.count, 0);
  const totalRegistrations = data.registrations.PENDING + data.registrations.APPROVED + data.registrations.REJECTED;
  const totalCases = data.case_states.reduce((sum, row) => sum + row.count, 0);

  const monthlyData = data.monthly_registrations.map((row) => ({
    label: formatLocalizedDate(`${row.month}-01T00:00:00`, language, { month: "short", year: "2-digit" }),
    value: row.count,
  }));
  const stateSegments = data.case_states.map((row, index) => ({
    label: getCaseStateLabel(row.state, language),
    value: row.count,
    color: STATE_COLORS[index % STATE_COLORS.length],
  }));
  const registrationSegments = Object.keys(REGISTRATION_COLORS).map((status) => ({
    label: getRegistrationStatusLabel(status, language),
    value: data.registrations[status],
    color: REGISTRATION_COLORS[status],
  }));
  const facilityBars = data.patients_by_facility.map((row) => ({ label: getLocalizedMasterName(row, language), value: row.count }));
  const mandalBars = data.patients_by_mandal.map((row) => ({ label: getLocalizedMasterName(row, language), value: row.count }));
  const staffBars = STAFF_ROLES.map((role) => ({ label: getRoleLabel(role, language), value: data.staff.by_role[role] || 0 }));
  const programmeBars = [
    ["screenings_total", "district.programme.screenings"],
    ["doctor_reviews", "district.programme.doctorReviews"],
    ["specialist_referrals", "district.programme.referrals"],
    ["treatment_linked", "district.programme.treatmentLinked"],
    ["overdue_cases", "district.programme.overdue"],
    ["lost_to_followup", "district.programme.lostToFollowup"],
  ].map(([field, key]) => ({ label: t(key), value: data.programme[field] || 0 }));

  return (
    <div className="district-page">
      <DashboardBanner className="district-hero">
        <div>
          <p className="district-hero-eyebrow">{t("district.eyebrow")}</p>
          <h1 className="district-hero-title">{t("district.dashboardTitle", { district: getLocalizedMasterName(data.district, language) })}</h1>
          <p className="district-hero-text">{t("district.dashboardSubtitle")}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm district-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={15} /> {t("district.refresh")}
        </button>
      </DashboardBanner>

      {error && <Alert type="error">{tm(error)}</Alert>}

      <section className="district-overview" aria-labelledby="district-overview-title">
        <div className="district-overview-heading">
          <div>
            <p className="district-section-kicker">{t("district.eyebrow")}</p>
            <h2 id="district-overview-title">{t("district.overview")}</h2>
          </div>
          <span>{t("district.dashboardSubtitle")}</span>
        </div>
        <div className="district-stat-grid">
          <StatCard icon={Users} label={t("district.totalPatients")} value={number(data.patients.total)} />
          <StatCard icon={UserPlus} tone="blue" label={t("district.newPatients")} value={number(data.patients.new_last_30_days)} hint={t("district.last30Days")} />
          <StatCard icon={Stethoscope} tone="amber" label={t("district.awaitingReview")} value={number(stateCount(["AWAITING_CLINICIAN"]))} />
          <StatCard icon={ClipboardCheck} tone="violet" label={t("district.completedCases")} value={number(stateCount(COMPLETED_STATES))} />
          <StatCard icon={UserCheck} tone="blue" label={t("district.activeStaff")} value={number(data.staff.active)} />
          <StatCard icon={Building2} label={t("district.totalFacilities")} value={number(data.facilities.total)} />
          <StatCard icon={ClipboardCheck} tone="amber" label={t("district.pendingApprovals")} value={number(data.registrations.PENDING)} />
          <StatCard icon={ClipboardCheck} label={t("district.approved")} value={number(data.registrations.APPROVED)} />
        </div>
        <div className="district-overview-details">
          <span><Activity size={15} /> {t("district.suspendedStaff")}: <strong>{number(data.staff.suspended)}</strong></span>
          <span><Building2 size={15} /> {t("district.activeFacilities")}: <strong>{number(data.facilities.active)}</strong></span>
          <span><Hospital size={15} /> {t("district.phcs")}: <strong>{number(data.facilities.phcs)}</strong></span>
          <span><Hospital size={15} /> {t("district.hospitals")}: <strong>{number(data.facilities.hospitals)}</strong></span>
          <span><ClipboardCheck size={15} /> {t("district.rejected")}: <strong>{number(data.registrations.REJECTED)}</strong></span>
        </div>
      </section>

      <div className="district-chart-grid">
        <ChartCard title={t("district.charts.monthly")}>
          <ColumnChart data={monthlyData} />
        </ChartCard>

        <ChartCard title={t("district.charts.patientStatus")} empty={totalCases === 0} emptyText={t("district.noCases")}>
          <div className="district-donut-row">
            <DonutChart segments={stateSegments} centerValue={number(totalCases)} centerLabel={t("district.cases")} />
            <ul className="district-legend">
              {stateSegments.map((segment) => (
                <li key={segment.label}><span style={{ background: segment.color }} />{segment.label}: {number(segment.value)}</li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard title={t("district.charts.byFacility")} empty={!facilityBars.length} emptyText={t("district.noFacilities")}>
          <BarChart data={facilityBars} />
        </ChartCard>

        <ChartCard title={t("district.charts.byMandal")} empty={!mandalBars.length} emptyText={t("district.noMandals")}>
          <BarChart data={mandalBars} />
        </ChartCard>

        <ChartCard title={t("district.charts.staff")}>
          <BarChart data={staffBars} />
        </ChartCard>

        <ChartCard title={t("district.charts.registrations")} empty={totalRegistrations === 0} emptyText={t("district.noRegistrations")}>
          <div className="district-donut-row">
            <DonutChart segments={registrationSegments} centerValue={number(totalRegistrations)} centerLabel={t("district.requests")} />
            <ul className="district-legend">
              {registrationSegments.map((segment) => (
                <li key={segment.label}><span style={{ background: segment.color }} />{segment.label}: {number(segment.value)}</li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard title={t("district.charts.programme")}>
          <BarChart data={programmeBars} />
          <Link to="/district/programme" className="district-card-link">{t("district.openProgramme")}</Link>
        </ChartCard>
      </div>

      <div className="district-recent-grid">
        <section className="district-card">
          <h2 className="district-card-title">{t("district.recentRegistrations")}</h2>
          {data.recent_registrations.length === 0 ? (
            <EmptyState title={t("district.noRegistrations")} />
          ) : (
            <ul className="district-list">
              {data.recent_registrations.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.full_name}</strong>
                    <span>{getRoleLabel(row.requested_role, language)} · {getLocalizedField(row, "facility_name", language) || "-"}</span>
                  </div>
                  <div className="district-list-side">
                    <span className={`district-pill status-${String(row.status).toLowerCase()}`}>{getRegistrationStatusLabel(row.status, language)}</span>
                    <small>{formatLocalizedDate(row.created_at, language)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="district-card">
          <h2 className="district-card-title">{t("district.recentActivity")}</h2>
          {data.recent_activity.length === 0 ? (
            <EmptyState title={t("district.noActivity")} />
          ) : (
            <ul className="district-list">
              {data.recent_activity.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{getAuditActionLabel(row.event, language)}</strong>
                    <span>{row.actor_name || "-"} · {row.actor_role ? getRoleLabel(row.actor_role, language) : "-"}</span>
                  </div>
                  <small>{formatLocalizedDateTime(row.occurred_at, language)}</small>
                </li>
              ))}
            </ul>
          )}
          <Link to="/district/audit" className="district-card-link">{t("district.openAudit")}</Link>
        </section>

        <section className="district-card">
          <h2 className="district-card-title"><Bell size={16} /> {t("district.notifications")}</h2>
          {data.recent_notifications.length === 0 ? (
            <EmptyState title={t("district.noNotifications")} />
          ) : (
            <ul className="district-list">
              {data.recent_notifications.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{getDeliveryChannelLabel(row.channel, language)}</strong>
                    <span>{getDeliveryStatusLabel(row.status, language)}</span>
                  </div>
                  <small>{formatLocalizedDateTime(row.created_at, language)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
