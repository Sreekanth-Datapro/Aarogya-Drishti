import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  KeyRound,
  Route,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedNumber } from "../../i18n/displayLabels";
import { Alert, Badge, BarChart, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import VideoNotConfigured from "./VideoNotConfigured";
import SpecialistAvailabilityRequests from "./SpecialistAvailabilityRequests";
import { CARE_ROLES, CARE_STEPS, PERMISSION_LABELS } from "./careModules";
import "../district/District.css";
import "./CareTeam.css";

export default function CareDashboard({ role }) {
  const { user } = useAuth();
  const { t, tm, language } = useLanguage();
  const config = CARE_ROLES[role];
  const [dashboard, setDashboard] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const myPermissions = (user?.permissions || []).filter((code) => PERMISSION_LABELS[code]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardResponse, referralResponse] = await Promise.all([
        api.get("/specialist/dashboard"),
        api.get("/specialist/referrals", { params: { filter: "pending", page: 1, page_size: 5 } }),
      ]);
      const dashboardData = dashboardResponse?.data?.dashboard;
      const referralData = referralResponse?.data?.referrals;
      if (!dashboardData || typeof dashboardData !== "object" || Array.isArray(dashboardData)) {
        throw new Error(t("care.dashboardLoadFailed"));
      }
      if (!Array.isArray(referralData)) throw new Error(t("care.dashboardLoadFailed"));
      setDashboard(dashboardData);
      setReferrals(referralData);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("care.dashboardLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => [
    { key: "assigned", label: t("care.spStatAssigned"), icon: ClipboardList },
    { key: "pending", label: t("care.spStatPending"), icon: Stethoscope },
    { key: "urgent", label: t("care.spStatUrgent"), icon: ShieldAlert },
    { key: "completed", label: t("care.spStatCompleted"), icon: CheckCircle2 },
  ], [t]);
  const chartData = metrics.map((metric) => ({
    label: metric.label,
    value: dashboard?.[metric.key] ?? 0,
  }));
  const number = (value) => formatLocalizedNumber(value ?? 0, language);

  if (loading) return <PageLoader label={t("common.loading")} />;
  if (error && !dashboard) {
    return (
      <Alert type="error">
        {tm(error)}{" "}
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
          {t("common.tryAgain")}
        </button>
      </Alert>
    );
  }

  return (
    <div className="care-page">
      <DashboardBanner className="care-hero">
        <div>
          <span className="care-eyebrow"><HeartPulse size={15} aria-hidden="true" /> {t(config.eyebrowKey)}</span>
          <h1 className="care-hero-title">{t("care.greeting", { name: user?.full_name || "" })}</h1>
          <p className="care-hero-text">{t(config.heroTextKey)}</p>
        </div>
        <span className="care-chip">{formatLocalizedDate(new Date(), language)}</span>
      </DashboardBanner>

      {error && <Alert type="error">{tm(error)} <button type="button" className="btn btn-secondary btn-sm" onClick={load}>{t("common.tryAgain")}</button></Alert>}

      {role === "SPECIALIST" && <SpecialistAvailabilityRequests />}

      <section aria-labelledby="care-summary-title">
        <h2 id="care-summary-title" className="care-section-title">{t("care.summaryTitle")}</h2>
        <div className="district-stat-grid care-stat-grid">
          {metrics.map((stat) => (
            <StatCard
              key={stat.key}
              icon={stat.icon}
              tone={stat.key === "urgent" ? "rose" : stat.key === "pending" ? "amber" : "green"}
              label={stat.label}
              value={number(dashboard?.[stat.key])}
            />
          ))}
        </div>
      </section>

      <section className="district-card">
        <h2 className="district-card-title">{t("care.referralStatus")}</h2>
        {dashboard?.assigned ? <BarChart data={chartData} /> : <p className="district-empty">{t("care.noAssignedCases")}</p>}
      </section>

      <section className="district-card">
        <h2 className="district-card-title">{t("care.recentCases")}</h2>
        {referrals.length ? (
          <ul className="district-list">
            {referrals.map((referral, index) => (
              <li key={referral?.id ?? `referral-${index}`}>
                <div>
                  <strong>{referral?.patient_code || t("common.notAvailable")}</strong>
                  <small>
                    {referral?.referral_code || t("common.notAvailable")} ·{" "}
                    {referral?.specialty_name || t("common.notAvailable")}
                  </small>
                </div>
                <div className="district-list-side">
                  <Badge tone={referral?.priority_code === "URGENT" ? "danger" : "neutral"}>
                    {referral?.priority_name || t("common.notAvailable")}
                  </Badge>
                  <Link className="district-card-link" to="/specialist/referrals">{t("care.openReferrals")}</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="district-empty">{t("care.noAssignedCases")}</p>}
      </section>

      <section className="district-card">
        <h2 className="district-card-title"><Route size={16} aria-hidden="true" /> {t("care.workflowTitle")}</h2>
        <ol className="care-steps">
          {CARE_STEPS.map((stepKey, index) => {
            const mine = config.mySteps.includes(stepKey);
            return (
              <li key={stepKey} className={mine ? "mine" : ""}>
                <span className="care-step-number">{index + 1}</span>
                <span>{t(stepKey)}</span>
                {mine && <Badge tone="success">{t("care.yourStep")}</Badge>}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="care-modules-title">
        <h2 id="care-modules-title" className="care-section-title">{t("care.modulesTitle")}</h2>
        <div className="care-module-grid">
          {Object.entries(config.modules).map(([key, menuItem]) => (
            <Link key={key} to={menuItem.path} className="care-module-card">
              <span className="care-module-icon" aria-hidden="true"><menuItem.icon size={20} /></span>
              <span className="care-module-text">
                <strong>{t(`modules.${key}.title`)}</strong>
                <small>{t(`modules.${key}.text`)}</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" className="care-module-arrow" />
            </Link>
          ))}
        </div>
      </section>

      <div className="care-grid">
        <VideoNotConfigured />

        <section className="district-card">
          <h2 className="district-card-title"><ShieldCheck size={16} aria-hidden="true" /> {t("care.rulesTitle")}</h2>
          <ul className="care-list">
            {config.rules.map((ruleKey) => <li key={ruleKey}>{t(ruleKey)}</li>)}
          </ul>
        </section>

        <section className="district-card">
          <h2 className="district-card-title"><KeyRound size={16} aria-hidden="true" /> {t("care.accessTitle")}</h2>
          <p className="care-muted">{t("care.accessText")}</p>
          {myPermissions.length ? (
            <ul className="care-list care-list-check">
              {myPermissions.map((code) => <li key={code}>{t(PERMISSION_LABELS[code])}</li>)}
            </ul>
          ) : <p className="district-empty">{t("care.accessNone")}</p>}
        </section>
      </div>
    </div>
  );
}
