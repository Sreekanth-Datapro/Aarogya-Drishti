import React, { useCallback, useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber, getLocalizedMasterName } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, BarChart, Button, PageLoader } from "../../components/ui";
import "./MedicalOfficer.css";

// Report column -> translation key
const COLUMN_KEYS = {
  patients: "mo.report_patients",
  screenings: "mo.report_screenings",
  awaiting_review: "mo.report_awaiting_review",
  signed_reviews: "mo.report_signed_reviews",
  draft_reviews: "mo.report_draft_reviews",
  referrals: "mo.report_referrals",
  referrals_completed: "mo.report_referrals_completed",
  followups_open: "mo.report_followups_open",
  followups_closed: "mo.report_followups_closed",
};
const COLUMNS = Object.keys(COLUMN_KEYS);

// Counts per assigned Mandal. The CSV contains numbers only (no patient details)
// and every download is logged by the server.
export default function MoReports() {
  const { t, tm, language } = useLanguage();
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/medical-officer/reports/mandals", { params });
      setReport(response.data.report);
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/medical-officer/reports/mandals.csv", { params, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mandal-summary.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const chart = (field) => (report?.mandals || []).map((row) => ({ label: getLocalizedMasterName(row, language), value: row[field] }));

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moReports.title")}</h1>
          <p className="page-subtitle">{t("mo.reportsSubtitle")}</p>
        </div>
        <div className="mo-actions">
          <Button type="button" variant="secondary" onClick={() => window.print()}><Printer size={15} /> {t("mo.print")}</Button>
          <Button type="button" onClick={exportCsv} loading={exporting} disabled={!report?.mandals.length}><Download size={15} /> {t("mo.exportCsv")}</Button>
        </div>
      </div>

      <section className="mo-card mo-filters">
        <label>{t("mo.dateFrom")}<input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /></label>
        <label>{t("mo.dateTo")}<input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></label>
        <Button type="button" variant="secondary" size="sm" onClick={() => setFilters({ date_from: "", date_to: "" })}>{t("mo.clearFilters")}</Button>
      </section>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {loading && !report && <PageLoader label={t("common.loading")} />}

      {report && (
        <>
          <div className="mo-stat-grid">
            {COLUMNS.map((column) => (
              <article key={column} className="mo-metric">
                <span>{t(COLUMN_KEYS[column])}</span>
                <strong>{number(report.totals[column])}</strong>
              </article>
            ))}
          </div>

          <div className="mo-chart-grid">
            <section className="mo-card"><h2 className="mo-card-title">{t("mo.report_screenings")}</h2><BarChart data={chart("screenings")} /></section>
            <section className="mo-card"><h2 className="mo-card-title">{t("mo.report_signed_reviews")}</h2><BarChart data={chart("signed_reviews")} /></section>
            <section className="mo-card"><h2 className="mo-card-title">{t("mo.report_referrals")}</h2><BarChart data={chart("referrals")} /></section>
            <section className="mo-card"><h2 className="mo-card-title">{t("mo.report_followups_open")}</h2><BarChart data={chart("followups_open")} /></section>
          </div>

          <section className="mo-card">
            <h2 className="mo-card-title">{t("mo.mandalTable")}</h2>
            <div className="mo-table-wrap">
              <table className="mo-table">
                <thead>
                  <tr>
                    <th>{t("mo.mandal")}</th>
                    {COLUMNS.map((column) => <th key={column}>{t(COLUMN_KEYS[column])}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.mandals.map((row) => (
                    <tr key={row.id}>
                      <td data-label={t("mo.mandal")}><strong>{getLocalizedMasterName(row, language)}</strong></td>
                      {COLUMNS.map((column) => <td key={column} data-label={t(COLUMN_KEYS[column])}>{number(row[column])}</td>)}
                    </tr>
                  ))}
                  {!report.mandals.length && <tr><td colSpan={COLUMNS.length + 1} className="mo-empty">{t("mo.noMandals")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
