import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, Clock, Stethoscope, Users } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getCaseStateLabel,
  getLabelCodes,
  getLocalizedField,
  getLocalizedMasterName,
  getSexLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, PageLoader, StatCard } from "../../components/ui";
import "./District.css";

const EMPTY_FILTERS = { search: "", mandal_id: "", facility_id: "", status: "", review: "", date_from: "", date_to: "", health_worker_id: "" };
const EMPTY_SUMMARY = { total: 0, awaiting_review: 0, review_alerts: 0, review_escalations: 0 };
const EMPTY_PAGE = { page: 1, total: 0, total_pages: 0 };

// De-identified patient list for District Admins: no names, phone numbers or addresses.
export default function DistrictPatients() {
  const { t, tm, language } = useLanguage();
  // "View patients" on the Health Workers page opens this page with ?health_worker_id=...
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, health_worker_id: searchParams.get("health_worker_id") || "" });
  const [page, setPage] = useState(1);
  const [patients, setPatients] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [mandals, setMandals] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Choices for the mandal and facility filters (both limited to the district by the server)
  useEffect(() => {
    api.get("/district/mandals", { params: { page_size: 100 } })
      .then((response) => setMandals(response.data.mandals || []))
      .catch(() => setMandals([]));
    api.get("/facilities", { params: { page: 1, page_size: 100 } })
      .then((response) => setFacilities(response.data.facilities || []))
      .catch(() => setFacilities([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: 25 };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/district/patients", { params });
      setPatients(response.data.patients || []);
      setSummary(response.data.summary || EMPTY_SUMMARY);
      setPagination(response.data.pagination || EMPTY_PAGE);
    } catch (requestError) {
      setError(apiMessage(requestError, "district.loadFailed"));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  };
  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const clearHealthWorker = () => {
    update("health_worker_id", "");
    setSearchParams({});
  };

  const reviewBadge = (row) => {
    if (row.review_escalation) return <Badge tone="danger">{t("district.patients.escalation")}</Badge>;
    if (row.review_alert) return <Badge tone="warning">{t("district.patients.alert")}</Badge>;
    return null;
  };

  return (
    <div className="district-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.districtPatients.title")}</h1>
          <p className="page-subtitle">{t("district.patients.subtitle")}</p>
        </div>
      </div>

      <Alert type="info">{t("district.patients.privacyNote")}</Alert>

      <div className="district-stat-grid">
        <StatCard icon={Users} label={t("district.totalPatients")} value={number(summary.total)} />
        <StatCard icon={Stethoscope} tone="blue" label={t("district.awaitingReview")} value={number(summary.awaiting_review)} />
        <StatCard icon={Clock} tone="amber" label={t("district.patients.alerts")} value={number(summary.review_alerts)} hint={t("district.patients.alertHint")} />
        <StatCard icon={AlertTriangle} tone="rose" label={t("district.patients.escalations")} value={number(summary.review_escalations)} hint={t("district.patients.escalationHint")} />
      </div>

      <section className="district-card district-filters">
        <label>
          {t("district.patients.patientCode")}
          <input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder={t("district.patients.searchPlaceholder")} />
        </label>
        <label>
          {t("district.mandal")}
          <select value={filters.mandal_id} onChange={(event) => update("mandal_id", event.target.value)}>
            <option value="">{t("district.allMandals")}</option>
            {mandals.map((mandal) => <option key={mandal.id} value={mandal.id}>{getLocalizedMasterName(mandal, language)}</option>)}
          </select>
        </label>
        <label>
          {t("district.patients.facility")}
          <select value={filters.facility_id} onChange={(event) => update("facility_id", event.target.value)}>
            <option value="">{t("district.patients.allFacilities")}</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{getLocalizedMasterName(facility, language)}</option>)}
          </select>
        </label>
        <label>
          {t("district.patients.status")}
          <select value={filters.status} onChange={(event) => update("status", event.target.value)}>
            <option value="">{t("district.patients.allStatuses")}</option>
            <option value="NOT_SCREENED">{t("district.patients.notScreened")}</option>
            {getLabelCodes("caseStates").map((code) => <option key={code} value={code}>{getCaseStateLabel(code, language)}</option>)}
          </select>
        </label>
        <label>
          {t("district.patients.reviewTime")}
          <select value={filters.review} onChange={(event) => update("review", event.target.value)}>
            <option value="">{t("district.patients.anyTime")}</option>
            <option value="alert">{t("district.patients.alertHint")}</option>
            <option value="escalation">{t("district.patients.escalationHint")}</option>
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); setSearchParams({}); }}>
          {t("district.clearFilters")}
        </button>
      </section>

      {filters.health_worker_id && (
        <div className="district-filter-chip">
          <span>{t("district.patients.byHealthWorker", { name: location.state?.healthWorkerName || "-" })}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearHealthWorker}>
            {t("district.patients.showAll")}
          </button>
        </div>
      )}

      {error && <Alert type="error">{tm(error)}</Alert>}

      <section className="district-card">
        {loading ? <PageLoader label={t("district.loading")} /> : (
          <div className="district-table-wrap">
            <table className="district-table">
              <thead>
                <tr>
                  <th>{t("district.patients.patientCode")}</th>
                  <th>{t("district.patients.age")}</th>
                  <th>{t("district.patients.sex")}</th>
                  <th>{t("district.patients.village")}</th>
                  <th>{t("district.mandal")}</th>
                  <th>{t("district.patients.facility")}</th>
                  <th>{t("district.patients.registeredOn")}</th>
                  <th>{t("district.patients.status")}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t("district.patients.patientCode")}><span className="mono">{row.patient_code || "-"}</span></td>
                    <td data-label={t("district.patients.age")}>{row.age_years == null ? "-" : number(row.age_years)}</td>
                    <td data-label={t("district.patients.sex")}>{row.sex ? getSexLabel(row.sex, language) : "-"}</td>
                    <td data-label={t("district.patients.village")}>{getLocalizedField(row, "village_name", language) || "-"}</td>
                    <td data-label={t("district.mandal")}>{getLocalizedField(row, "mandal_name", language) || "-"}</td>
                    <td data-label={t("district.patients.facility")}>{getLocalizedField(row, "facility_name", language) || "-"}</td>
                    <td data-label={t("district.patients.registeredOn")}>{formatLocalizedDate(row.registered_at, language) || "-"}</td>
                    <td data-label={t("district.patients.status")}>
                      <div className="district-status-cell">
                        <span>{row.case_state ? getCaseStateLabel(row.case_state, language) : t("district.patients.notScreened")}</span>
                        {reviewBadge(row)}
                      </div>
                    </td>
                  </tr>
                ))}
                {!patients.length && (
                  <tr><td colSpan="8" className="district-empty">{t("district.patients.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="district-pager">
          <span>{t("district.locations.total", { count: number(pagination.total) })}</span>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page <= 1 || loading} onClick={() => setPage(pagination.page - 1)}>
              {t("auditLogs.previous")}
            </button>
            <span>{t("auditLogs.pageOf", { page: pagination.page, total: Math.max(pagination.total_pages, 1) })}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.total_pages || loading} onClick={() => setPage(pagination.page + 1)}>
              {t("auditLogs.next")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
