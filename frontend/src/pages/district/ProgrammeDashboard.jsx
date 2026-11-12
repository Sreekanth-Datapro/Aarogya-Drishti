import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedNumber, getLocalizedMasterName } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, BarChart, PageLoader } from "../../components/ui";
import ColumnChart from "./ColumnChart";
import "./District.css";

// Indicator cards: API field -> translation key
const INDICATORS = [
  ["screenings_total", "district.programme.screenings"],
  ["doctor_reviews", "district.programme.doctorReviews"],
  ["suspicious_findings", "district.programme.suspicious"],
  ["specialist_referrals", "district.programme.referrals"],
  ["appointments_completed", "district.programme.appointments"],
  ["biopsies_ordered", "district.programme.biopsies"],
  ["pathology_completed", "district.programme.pathology"],
  ["precancers_clinician_confirmed", "district.programme.precancers"],
  ["cancers_pathology_confirmed", "district.programme.cancers"],
  ["treatment_linked", "district.programme.treatmentLinked"],
  ["treatment_started", "district.programme.treatmentStarted"],
  ["overdue_cases", "district.programme.overdue"],
  ["lost_to_followup", "district.programme.lostToFollowup"],
];

const EMPTY_FILTERS = { mandal_id: "", date_from: "", date_to: "" };

export default function ProgrammeDashboard() {
  const { t, tm, language } = useLanguage();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/district/programme", { params });
      setData(response.data.programme);
    } catch (requestError) {
      setError(apiMessage(requestError, "district.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const hours = (value) => (value == null ? "-" : t("district.programme.hoursValue", { hours: number(value) }));

  return (
    <div className="district-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.districtProgramme.title")}</h1>
          <p className="page-subtitle">{t("district.programme.subtitle")}</p>
        </div>
      </div>

      <Alert type="info">{t("district.programme.noProgrammeTables")}</Alert>

      <section className="district-card district-filters">
        <label>
          {t("district.mandal")}
          <select value={filters.mandal_id} onChange={(event) => update("mandal_id", event.target.value)}>
            <option value="">{t("district.allMandals")}</option>
            {(data?.mandals || []).map((mandal) => (
              <option key={mandal.id} value={mandal.id}>{getLocalizedMasterName(mandal, language)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("district.dateFrom")}
          <input type="date" value={filters.date_from} onChange={(event) => update("date_from", event.target.value)} />
        </label>
        <label>
          {t("district.dateTo")}
          <input type="date" value={filters.date_to} onChange={(event) => update("date_to", event.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>
          {t("district.clearFilters")}
        </button>
      </section>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {loading && !data && <PageLoader label={t("district.loading")} />}

      {data && (
        <>
          <div className="district-stat-grid">
            {INDICATORS.map(([field, key]) => (
              <article key={field} className="district-metric">
                <span>{t(key)}</span>
                <strong>{number(data.summary[field])}</strong>
              </article>
            ))}
            <article className="district-metric">
              <span>{t("district.programme.avgReview")}</span>
              <strong>{hours(data.summary.avg_hours_to_review)}</strong>
            </article>
            <article className="district-metric">
              <span>{t("district.programme.avgDiagnosis")}</span>
              <strong>{hours(data.summary.avg_hours_to_diagnosis)}</strong>
            </article>
          </div>

          <div className="district-chart-grid">
            <section className="district-card">
              <h2 className="district-card-title">{t("district.programme.byMonth")}</h2>
              {data.by_month.length === 0 ? (
                <p className="district-empty">{t("district.programme.noData")}</p>
              ) : (
                <ColumnChart
                  data={data.by_month.map((row) => ({
                    label: formatLocalizedDate(`${row.month}-01T00:00:00`, language, { month: "short", year: "2-digit" }),
                    value: row.screenings_total,
                  }))}
                />
              )}
            </section>
            <section className="district-card">
              <h2 className="district-card-title">{t("district.programme.byMandal")}</h2>
              {data.by_mandal.length === 0 ? (
                <p className="district-empty">{t("district.programme.noData")}</p>
              ) : (
                <BarChart
                  data={data.by_mandal.map((row) => ({
                    label: getLocalizedMasterName(row, language) || t("district.unknownMandal"),
                    value: row.screenings_total,
                  }))}
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
