import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock,
  ClipboardList,
  FileSignature,
  RefreshCw,
  ShieldAlert,
  Send,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getAuditActionLabel,
  getCaseStateLabel,
  getCodeLabel,
  getLocalizedMasterName,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, BarChart, DonutChart, EmptyState, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import ColumnChart from "../district/ColumnChart";
import RegistrationQueue from "./RegistrationQueue";
import "./MedicalOfficer.css";

const STATE_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--gray-500)", "var(--brand-300)",
];
const REFERRAL_STATUSES = ["PLANNED", "SENT", "ACCEPTED", "COMPLETED", "DECLINED", "CANCELLED"];

export default function MoDashboard() {
  const { user } = useAuth();
  const { t, tm, language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/medical-officer/dashboard");
      setData(response.data.dashboard);
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <PageLoader label={t("common.loading")} />;
  if (error && !data) {
    return (
      <Alert type="error">
        {tm(error)}{" "}
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>{t("common.tryAgain")}</button>
      </Alert>
    );
  }

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const totals = data.totals;
  const stateSegments = data.case_states.map((row, index) => ({
    label: getCaseStateLabel(row.state, language),
    value: row.count,
    color: STATE_COLORS[index % STATE_COLORS.length],
  }));
  const totalCases = stateSegments.reduce((sum, item) => sum + item.value, 0);
  const weeklyScreenings = data.weekly.map((row) => ({
    label: formatLocalizedDate(`${row.week}T00:00:00`, language, { day: "2-digit", month: "short" }),
    value: row.screenings,
  }));
  const weeklyReviews = data.weekly.map((row) => ({
    label: formatLocalizedDate(`${row.week}T00:00:00`, language, { day: "2-digit", month: "short" }),
    value: row.signed_reviews,
  }));
  const mandalBars = data.by_mandal.map((row) => ({ label: getLocalizedMasterName(row, language), value: row.patients }));
  const referralBars = REFERRAL_STATUSES.map((status) => ({
    label: getCodeLabel("referralStatuses", status, language),
    value: data.referrals_by_status[status] || 0,
  }));

  return (
    <div className="mo-page">
      <DashboardBanner variant="medicalOfficer" className="mo-hero">
        <div>
          <p className="mo-hero-eyebrow"><Stethoscope size={15} /> {t("mo.eyebrow")}</p>
          <h1 className="mo-hero-title">{t("mo.welcome", { name: user?.full_name || "" })}</h1>
          <p className="mo-hero-text">{t("mo.dashboardSubtitle")}</p>
          <div className="mo-chip-row">
            {data.assigned_mandals.length
              ? data.assigned_mandals.map((mandal) => <span key={mandal.id} className="mo-chip">{getLocalizedMasterName(mandal, language)}</span>)
              : <span className="mo-chip warning">{t("mo.noMandals")}</span>}
          </div>
        </div>
        <div className="mo-hero-aside">
          <div className="mo-hero-pulse" aria-hidden="true" />
          <button type="button" className="btn btn-secondary btn-sm mo-hero-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {t("mo.refresh")}
          </button>
        </div>
      </DashboardBanner>

      {error && <Alert type="error">{tm(error)}</Alert>}

      <section className="mo-analytics-band" aria-label={t("mo.analyticsTitle")}>
        <div className="mo-stat-grid mo-stat-grid-animated">
          <StatCard icon={Users} label={t("mo.totalPatients")} value={number(totals.total_patients)} />
          <StatCard icon={ClipboardList} tone="amber" label={t("mo.pendingScreenings")} value={number(totals.pending_screenings)} hint={t("mo.pendingScreeningsHint")} />
          <StatCard icon={UserCheck} tone="blue" label={t("mo.claimedCases")} value={number(totals.my_claimed_cases)} />
          <StatCard icon={FileSignature} tone="violet" label={t("mo.pendingReviews")} value={number(totals.pending_reviews)} />
          <StatCard icon={Send} tone="green" label={t("mo.referrals")} value={number(totals.referrals)} />
          <StatCard icon={ShieldAlert} tone="rose" label={t("mo.urgentReferrals")} value={number(totals.urgent_referrals)} hint={t("mo.urgentReferralsHint")} />
          <StatCard icon={AlarmClock} tone="rose" label={t("mo.openFollowups")} value={number(totals.open_followups)} hint={t("mo.overdueValue", { count: number(totals.overdue_followups) })} />
        </div>
      </section>

      <RegistrationQueue compact />

      <div className="mo-quick-row mo-quick-row-animated">
        <Link className="mo-quick" to="/medical-officer/queue"><ClipboardList size={18} /> {t("modules.moScreeningQueue.title")}</Link>
        <Link className="mo-quick" to="/medical-officer/review"><Stethoscope size={18} /> {t("modules.moClinicalReview.title")}</Link>
        <Link className="mo-quick" to="/medical-officer/notes"><FileSignature size={18} /> {t("modules.moClinicalNotes.title")}</Link>
        <Link className="mo-quick" to="/medical-officer/referrals"><Send size={18} /> {t("modules.moReferrals.title")}</Link>
        <Link className="mo-quick mo-quick-diagnostics" to="/medical-officer/diagnostics"><FileSignature size={18} /> {t("modules.moDiagnostics.title")}</Link>
      </div>

      <div className="mo-chart-grid mo-chart-grid-animated">
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.weeklyScreenings")}</h2>
          <ColumnChart data={weeklyScreenings} />
        </section>
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.weeklyReviews")}</h2>
          <ColumnChart data={weeklyReviews} />
        </section>
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.caseStatus")}</h2>
          {totalCases === 0 ? <p className="mo-empty">{t("mo.noScreenings")}</p> : (
            <div className="mo-donut-row">
              <DonutChart segments={stateSegments} centerValue={number(totalCases)} centerLabel={t("mo.cases")} />
              <ul className="mo-legend">
                {stateSegments.map((segment) => (
                  <li key={segment.label}><span style={{ background: segment.color }} />{segment.label}: {number(segment.value)}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.patientsByMandal")}</h2>
          {mandalBars.length ? <BarChart data={mandalBars} /> : <p className="mo-empty">{t("mo.noMandals")}</p>}
        </section>
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.referralStatus")}</h2>
          <BarChart data={referralBars} />
        </section>
        <section className="mo-card mo-card-chart">
          <h2 className="mo-card-title">{t("mo.recentActivity")}</h2>
          {data.recent_activity.length === 0 ? <EmptyState title={t("mo.noActivity")} /> : (
            <ul className="mo-list">
              {data.recent_activity.map((item) => (
                <li key={item.id}>
                  <strong>{getAuditActionLabel(item.event, language)}</strong>
                  <small>{formatLocalizedDateTime(item.occurred_at, language)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
