import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPinOff, UserCheck, UserRound, Users } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getAccountStatusLabel,
  getDesignationLabel,
  getLocalizedField,
  getLocalizedMasterName,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, PageLoader, StatCard } from "../../components/ui";
import "./District.css";

const EMPTY_FILTERS = { search: "", mandal_id: "", status: "" };
const EMPTY_SUMMARY = { total: 0, active: 0, without_location: 0, patients: 0 };
const EMPTY_PAGE = { page: 1, total: 0, total_pages: 0 };
const STATUS_CODES = ["ACTIVE", "PENDING_SETUP", "SUSPENDED", "DISABLED"];
const STATUS_TONES = { ACTIVE: "success", PENDING_SETUP: "warning", SUSPENDED: "danger", DISABLED: "neutral" };

// Health Workers of the District Admin's own district (view only).
// The server decides which district this is; the page never sends a district id.
export default function DistrictHealthWorkers() {
  const { t, tm, language } = useLanguage();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [workers, setWorkers] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [mandals, setMandals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/district/mandals", { params: { page_size: 100 } })
      .then((response) => setMandals(response.data.mandals || []))
      .catch(() => setMandals([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: 25 };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/district/health-workers", { params });
      setWorkers(response.data.health_workers || []);
      setSummary(response.data.summary || EMPTY_SUMMARY);
      setPagination(response.data.pagination || EMPTY_PAGE);
    } catch (requestError) {
      setError(apiMessage(requestError, "districtHealthWorkers.loadFailed"));
      setWorkers([]);
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

  return (
    <div className="district-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.districtHealthWorkers.title")}</h1>
          <p className="page-subtitle">{t("districtHealthWorkers.subtitle")}</p>
        </div>
      </div>

      <div className="district-stat-grid">
        <StatCard icon={Users} label={t("districtHealthWorkers.total")} value={number(summary.total)} />
        <StatCard icon={UserCheck} tone="blue" label={t("districtHealthWorkers.active")} value={number(summary.active)} />
        <StatCard icon={UserRound} tone="violet" label={t("districtHealthWorkers.patients")} value={number(summary.patients)} />
        <StatCard icon={MapPinOff} tone="amber" label={t("districtHealthWorkers.withoutLocation")} value={number(summary.without_location)} />
      </div>

      <section className="district-card district-filters">
        <label>
          {t("districtHealthWorkers.search")}
          <input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder={t("districtHealthWorkers.searchPlaceholder")} />
        </label>
        <label>
          {t("district.mandal")}
          <select value={filters.mandal_id} onChange={(event) => update("mandal_id", event.target.value)}>
            <option value="">{t("district.allMandals")}</option>
            {mandals.map((mandal) => <option key={mandal.id} value={mandal.id}>{getLocalizedMasterName(mandal, language)}</option>)}
          </select>
        </label>
        <label>
          {t("districtHealthWorkers.status")}
          <select value={filters.status} onChange={(event) => update("status", event.target.value)}>
            <option value="">{t("districtHealthWorkers.allStatuses")}</option>
            {STATUS_CODES.map((code) => <option key={code} value={code}>{getAccountStatusLabel(code, language)}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
          {t("district.clearFilters")}
        </button>
      </section>

      {error && <Alert type="error">{tm(error)}</Alert>}

      <section className="district-card">
        {loading ? <PageLoader label={t("district.loading")} /> : (
          <div className="district-table-wrap">
            <table className="district-table">
              <thead>
                <tr>
                  <th>{t("districtHealthWorkers.worker")}</th>
                  <th>{t("districtHealthWorkers.designation")}</th>
                  <th>{t("districtHealthWorkers.phone")}</th>
                  <th>{t("districtHealthWorkers.location")}</th>
                  <th>{t("districtHealthWorkers.facility")}</th>
                  <th>{t("districtHealthWorkers.status")}</th>
                  <th>{t("districtHealthWorkers.lastLogin")}</th>
                  <th>{t("districtHealthWorkers.patients")}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td data-label={t("districtHealthWorkers.worker")}>
                      <div className="district-person">
                        <strong>{worker.full_name}</strong>
                        <small className="mono">{worker.username}</small>
                      </div>
                    </td>
                    <td data-label={t("districtHealthWorkers.designation")}>{worker.designation ? getDesignationLabel(worker.designation, language) : "-"}</td>
                    <td data-label={t("districtHealthWorkers.phone")}>{worker.phone || "-"}</td>
                    <td data-label={t("districtHealthWorkers.location")}>
                      {worker.has_location ? (
                        <div className="district-person">
                          <span>{getLocalizedField(worker, "village_name", language)}</span>
                          <small>{getLocalizedField(worker, "mandal_name", language)}</small>
                        </div>
                      ) : <Badge tone="warning">{t("districtHealthWorkers.noLocation")}</Badge>}
                    </td>
                    <td data-label={t("districtHealthWorkers.facility")}>{getLocalizedField(worker, "facility_name", language) || "-"}</td>
                    <td data-label={t("districtHealthWorkers.status")}>
                      <Badge tone={STATUS_TONES[worker.status] || "neutral"}>{getAccountStatusLabel(worker.status, language)}</Badge>
                    </td>
                    <td data-label={t("districtHealthWorkers.lastLogin")}>
                      {worker.last_login_at ? formatLocalizedDate(worker.last_login_at, language) : t("districtHealthWorkers.never")}
                    </td>
                    <td data-label={t("districtHealthWorkers.patients")}>
                      <div className="district-person">
                        <strong>{number(worker.patient_count)}</strong>
                        {worker.patient_count > 0 && (
                          <Link
                            className="district-card-link"
                            to={`/district/patients?health_worker_id=${worker.id}`}
                            state={{ healthWorkerName: worker.full_name }}
                          >
                            {t("districtHealthWorkers.viewPatients")}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!workers.length && (
                  <tr><td colSpan="8" className="district-empty">{t("districtHealthWorkers.empty")}</td></tr>
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
