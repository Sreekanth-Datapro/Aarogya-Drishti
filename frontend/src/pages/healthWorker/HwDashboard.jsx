import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  Camera,
  ClipboardList,
  HeartPulse,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getLocalizedField,
  getSexLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, BarChart, DonutChart, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import ColumnChart from "../district/ColumnChart";
import "../district/District.css";
import "./HwDashboard.css";

const EMPTY_SUMMARY = {
  total: 0, this_month: 0, today: 0, screening_consented: 0,
  last_7_days: [], by_village: [], by_sex: [], by_age_group: [],
};
const AGE_GROUPS = [
  ["0_17", "hwDashboard.age0_17", "var(--chart-2)"],
  ["18_39", "hwDashboard.age18_39", "var(--chart-1)"],
  ["40_59", "hwDashboard.age40_59", "var(--chart-3)"],
  ["60_PLUS", "hwDashboard.age60Plus", "var(--chart-4)"],
];
const SEX_COLORS = {
  FEMALE: "var(--chart-5)",
  MALE: "var(--chart-2)",
  OTHER: "var(--chart-6)",
  UNDISCLOSED: "var(--gray-400)",
};
const NEXT_MODULES = [
  { key: "hwDashboard.nextScreening", icon: ClipboardList, path: "/health-worker/screening" },
  { key: "hwDashboard.nextImages", icon: Camera, path: "/health-worker/screening" },
  { key: "hwDashboard.nextFollowUp", icon: CalendarDays },
];

// Home page of a Health Worker: own registrations, assigned villages and next steps.
// Every number comes from the worker's own records on the server.
export default function HwDashboard() {
  const { user, isOffline, pendingDraftCount } = useAuth();
  const { t, tm, language } = useLanguage();
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [mandals, setMandals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (isOffline) {
      setSummary(EMPTY_SUMMARY);
      setMandals([]);
      setPatients([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, optionResponse, patientResponse] = await Promise.all([
        api.get("/patients/summary"),
        api.get("/patients/registration-options"),
        api.get("/patients/mine"),
      ]);
      setSummary({ ...EMPTY_SUMMARY, ...(summaryResponse.data.summary || {}) });
      setMandals(optionResponse.data.mandals || []);
      setPatients((patientResponse.data.patients || []).slice(0, 5));
    } catch (requestError) {
      if (requestError?.code === "OFFLINE_MODE_NO_API" || requestError?.isOfflineError) {
        setError("");
      } else {
        setError(apiMessage(requestError, "hwDashboard.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  useEffect(() => {
    load();
  }, [load]);

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const locale = language === "te" ? "te-IN" : "en-IN";
  const weekData = summary.last_7_days.map((day) => ({
    label: new Date(day.day).toLocaleDateString(locale, { weekday: "short", day: "numeric" }),
    value: day.count,
  }));
  const weekTotal = summary.last_7_days.reduce((total, day) => total + day.count, 0);
  const villageData = summary.by_village.map((item) => ({
    label: getLocalizedField(item, "village_name", language),
    value: item.count,
  }));
  const ageData = AGE_GROUPS.map(([code, key, color]) => ({
    label: t(key),
    value: summary.by_age_group.find((item) => item.age_group === code)?.count || 0,
    color,
  }));
  const sexData = summary.by_sex.map((item) => ({
    label: getSexLabel(item.sex, language),
    value: item.count,
    color: SEX_COLORS[item.sex],
  }));
  const withoutConsent = Math.max(summary.total - summary.screening_consented, 0);
  const consentShare = summary.total ? Math.round((summary.screening_consented / summary.total) * 100) : 0;
  const villageCount = mandals.reduce((total, mandal) => total + (mandal.villages || []).length, 0);

  const screeningStatus = (patient) => {
    if (!patient.screening_consent) return null;
    if (patient.case_state === "AWAITING_CLINICIAN") {
      return { label: t("hwDashboard.statusAwaitingReview"), tone: "warning" };
    }
    if (patient.case_state === "SCREENED" && patient.medical_officer_decision === "REQUEST_RECAPTURE") {
      return { label: t("hwDashboard.statusRecaptureRequired"), tone: "warning", recapture: true };
    }
    if (patient.case_state === "SCREENED" && patient.medical_officer_decision === "REQUEST_MORE_INFO") {
      return { label: t("hwDashboard.statusMoreInformationRequired"), tone: "warning", moreInfo: true };
    }
    if (patient.reviewed_at && patient.case_state !== "SCREENED") {
      return { label: t("hwDashboard.statusReviewed"), tone: "success" };
    }
    return null;
  };

  if (loading) return <PageLoader label={t("common.loading")} />;

  if (isOffline) {
    return (
      <div className="hw-dashboard">
        <DashboardBanner variant="healthWorker" className="hw-hero">
          <div className="hw-hero-text">
            <span className="hw-hero-eyebrow"><HeartPulse size={15} /> {t("offline.modeBanner")}</span>
            <h1>{t("hwDashboard.greeting", { name: user?.full_name || "" })}</h1>
            <p>{t("offline.dashboardCta")}</p>
            {pendingDraftCount > 0 && (
              <p className="hw-chip warning">{t("offline.pendingBadge", { count: pendingDraftCount })}</p>
            )}
            <div className="hw-hero-actions">
              <Link className="btn btn-primary hw-hero-primary" to="/health-worker/patients">
                <UserPlus size={17} /> {t("offline.registerOffline")}
              </Link>
              <Link className="btn btn-secondary hw-hero-secondary" to="/settings">
                {t("settings.title")}
              </Link>
            </div>
          </div>
        </DashboardBanner>
      </div>
    );
  }

  return (
    <div className="hw-dashboard">
      <DashboardBanner variant="healthWorker" className="hw-hero">
        <div className="hw-hero-text">
          <span className="hw-hero-eyebrow"><HeartPulse size={15} /> {t("hwDashboard.eyebrow")}</span>
          <h1>{t("hwDashboard.greeting", { name: user?.full_name || "" })}</h1>
          <p>{t("hwDashboard.heroText")}</p>
          <div className="hw-chip-row">
            {mandals.length ? mandals.map((mandal) => (
              <span key={mandal.mandal_id} className="hw-chip">
                <MapPin size={13} /> {getLocalizedField(mandal, "mandal_name", language)} · {getLocalizedField(mandal, "district_name", language)}
              </span>
            )) : <span className="hw-chip warning">{t("hwDashboard.noLocationChip")}</span>}
            <span className="hw-chip">{formatLocalizedDate(new Date(), language)}</span>
          </div>
          <div className="hw-hero-actions">
            <Link className="btn btn-secondary hw-hero-secondary" to="/health-worker/patient-search">
              <Search size={16} /> {t("hwDashboard.searchPatients")}
            </Link>
            <Link className="btn btn-primary hw-hero-primary" to="/health-worker/patients">
              <UserPlus size={17} /> {t("hwDashboard.registerPatient")}
            </Link>
            <button type="button" className="btn btn-secondary hw-hero-secondary" onClick={load}>
              <RefreshCw size={16} /> {t("hwDashboard.refresh")}
            </button>
          </div>
        </div>
        <div className="hw-hero-today" aria-label={t("hwDashboard.today")}>
          <span>{t("hwDashboard.today")}</span>
          <strong>{number(summary.today)}</strong>
          <small>{t("hwDashboard.registeredToday")}</small>
        </div>
      </DashboardBanner>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {!mandals.length && !error && <Alert type="warning">{t("hwDashboard.noLocations")}</Alert>}

      <section className="hw-analytics-band" aria-label={t("hwDashboard.analyticsTitle")}>
        <div className="district-stat-grid resp-stat-grid hw-stat-grid-animated">
          <StatCard icon={Users} label={t("hwDashboard.totalPatients")} value={number(summary.total)} />
          <StatCard icon={UserPlus} tone="blue" label={t("hwDashboard.thisMonth")} value={number(summary.this_month)} />
          <StatCard icon={ShieldCheck} tone="violet" label={t("hwDashboard.screeningConsent")} value={number(summary.screening_consented)}
            hint={t("hwDashboard.screeningConsentHint")} />
          <StatCard icon={MapPin} tone="amber" label={t("hwDashboard.villages")} value={number(villageCount)}
            hint={t("hwDashboard.mandalCount", { count: number(mandals.length) })} />
        </div>
      </section>

      <div className="hw-grid hw-grid-wide hw-chart-animated">
        <section className="district-card hw-card-chart">
          <h2 className="district-card-title"><BarChart3 size={16} /> {t("hwDashboard.weekTitle")}</h2>
          {weekTotal ? <ColumnChart data={weekData} /> : <p className="district-empty">{t("hwDashboard.weekEmpty")}</p>}
          <p className="hw-muted">{t("hwDashboard.weekTotal", { count: number(weekTotal) })}</p>
        </section>

        <section className="district-card hw-card-chart">
          <h2 className="district-card-title"><ShieldCheck size={16} /> {t("hwDashboard.consentTitle")}</h2>
          <div className="hw-donut-row">
            <DonutChart
              segments={[
                { label: t("hwDashboard.consentGiven"), value: summary.screening_consented, color: "var(--chart-1)" },
                { label: t("hwDashboard.consentNotGiven"), value: withoutConsent, color: "var(--gray-300)" },
              ]}
              centerValue={`${number(consentShare)}%`}
              centerLabel={t("hwDashboard.consentCenter")}
            />
            <ul className="district-legend">
              <li><span style={{ background: "var(--chart-1)" }} />{t("hwDashboard.consentGiven")}: {number(summary.screening_consented)}</li>
              <li><span style={{ background: "var(--gray-300)" }} />{t("hwDashboard.consentNotGiven")}: {number(withoutConsent)}</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="hw-grid hw-grid-three hw-chart-animated">
        <section className="district-card hw-card-chart">
          <h2 className="district-card-title"><MapPin size={16} /> {t("hwDashboard.villageTitle")}</h2>
          {villageData.length ? <BarChart data={villageData} /> : <p className="district-empty">{t("hwDashboard.noData")}</p>}
        </section>
        <section className="district-card hw-card-chart">
          <h2 className="district-card-title"><Users size={16} /> {t("hwDashboard.ageTitle")}</h2>
          {summary.total ? <BarChart data={ageData} /> : <p className="district-empty">{t("hwDashboard.noData")}</p>}
        </section>
        <section className="district-card hw-card-chart">
          <h2 className="district-card-title"><Users size={16} /> {t("hwDashboard.sexTitle")}</h2>
          {sexData.length ? <BarChart data={sexData} /> : <p className="district-empty">{t("hwDashboard.noData")}</p>}
        </section>
      </div>

      <div className="hw-grid">
        <section className="district-card">
          <h2 className="district-card-title"><Users size={16} /> {t("hwDashboard.recentTitle")}</h2>
          {patients.length ? (
            <ul className="district-list">
              {patients.map((patient) => {
                const status = screeningStatus(patient);
                return (
                  <li key={patient.id}>
                    <div>
                      <strong>{patient.full_name}</strong>
                      <small>
                        <span className="mono">{patient.patient_code}</span>
                        {" · "}{patient.age_years == null ? "-" : number(patient.age_years)}
                        {" · "}{patient.sex ? getSexLabel(patient.sex, language) : "-"}
                        {" · "}{getLocalizedField(patient, "village_name", language)}
                      </small>
                    </div>
                    <div className="district-list-side">
                      <Badge tone={patient.screening_consent ? "success" : "neutral"}>
                        {t(patient.screening_consent ? "hwDashboard.consentGiven" : "hwDashboard.consentNotGiven")}
                      </Badge>
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                      {(status?.recapture || status?.moreInfo)
                        && patient.medical_officer_request_note && (
                        <small>{patient.medical_officer_request_note}</small>
                      )}
                      <small>{formatLocalizedDate(patient.created_at, language)}</small>
                      {(status?.recapture || status?.moreInfo) && (
                        <Link className="district-card-link" to={`/health-worker/screening?patientId=${encodeURIComponent(patient.id)}`}>
                          {t(status.moreInfo ? "hwDashboard.updateRequestedInformation" : "hwDashboard.continueRecapture")}
                        </Link>
                      )}
                      <Link className="district-card-link" to={`/health-worker/patients/${patient.id}`}>
                        {t("hwDashboard.viewDetails")}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="district-empty">{t("hwDashboard.noPatients")}</p>}
          <Link className="district-card-link" to="/health-worker/patient-search">{t("hwDashboard.viewAll")}</Link>
        </section>

        <section className="district-card">
          <h2 className="district-card-title"><HeartPulse size={16} /> {t("hwDashboard.nextTitle")}</h2>
          <ul className="hw-next-list">
            {NEXT_MODULES.map(({ key, icon: Icon, path }) => (
              <li key={key}>
                <span className="hw-location-icon"><Icon size={15} /></span>
                <span>{t(key)}</span>
                {path
                  ? <Link className="district-card-link hw-open-link" to={path}>{t("hwDashboard.open")}</Link>
                  : <Badge tone="neutral">{t("hwDashboard.comingSoon")}</Badge>}
              </li>
            ))}
          </ul>
          <p className="hw-muted">{t("hwDashboard.nextNote")}</p>
        </section>
      </div>
    </div>
  );
}
