import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber, getLocalizedField, getLocalizedMasterName } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, PageLoader } from "../../components/ui";
import "./District.css";

const EMPTY_PAGE = { page: 1, total: 0, total_pages: 0 };

// Pagination row under each table
function Pager({ pagination, onPage, t, language }) {
  return (
    <div className="district-pager">
      <span>{t("district.locations.total", { count: formatLocalizedNumber(pagination.total, language) })}</span>
      <div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          {t("auditLogs.previous")}
        </button>
        <span>{t("auditLogs.pageOf", { page: pagination.page, total: Math.max(pagination.total_pages, 1) })}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.total_pages} onClick={() => onPage(pagination.page + 1)}>
          {t("auditLogs.next")}
        </button>
      </div>
    </div>
  );
}

// View-only list of the mandals and villages of the District Admin's district.
// Adding or changing locations is done by Super Admin / System Admin.
export default function DistrictLocations() {
  const { t, tm, language } = useLanguage();
  const [tab, setTab] = useState("mandals");
  const [search, setSearch] = useState("");
  const [mandalFilter, setMandalFilter] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [mandalOptions, setMandalOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Mandal names for the village filter (all mandals of the district)
  useEffect(() => {
    api.get("/district/mandals", { params: { page_size: 100 } })
      .then((response) => setMandalOptions(response.data.mandals || []))
      .catch(() => setMandalOptions([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: 25 };
      if (search.trim()) params.search = search.trim();
      if (tab === "villages" && mandalFilter) params.mandal_id = mandalFilter;
      const response = await api.get(`/district/${tab}`, { params });
      setRows(response.data[tab] || []);
      setPagination(response.data.pagination || EMPTY_PAGE);
    } catch (requestError) {
      setError(apiMessage(requestError, "district.loadFailed"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, search, mandalFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const switchTab = (next) => {
    setTab(next);
    setPage(1);
    setSearch("");
  };

  const showVillagesOf = (mandalId) => {
    setTab("villages");
    setMandalFilter(String(mandalId));
    setSearch("");
    setPage(1);
  };

  const verifiedBadge = (row) => (
    <Badge tone={row.is_verified ? "success" : "warning"}>
      {row.is_verified ? t("district.locations.verified") : t("district.locations.unverified")}
    </Badge>
  );
  const activeBadge = (row) => (
    <Badge tone={row.is_active ? "success" : "neutral"}>
      {row.is_active ? t("district.locations.active") : t("district.locations.inactive")}
    </Badge>
  );
  const number = (value) => formatLocalizedNumber(value ?? 0, language);

  return (
    <div className="district-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.districtLocations.title")}</h1>
          <p className="page-subtitle">{t("district.locations.subtitle")}</p>
        </div>
      </div>

      <Alert type="info">{t("district.locations.viewOnly")}</Alert>

      <div className="district-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "mandals"} className={tab === "mandals" ? "active" : ""} onClick={() => switchTab("mandals")}>
          {t("district.locations.mandals")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "villages"} className={tab === "villages" ? "active" : ""} onClick={() => switchTab("villages")}>
          {t("district.locations.villages")}
        </button>
      </div>

      <section className="district-card district-filters">
        <label>
          {t("district.locations.search")}
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("district.locations.searchPlaceholder")} />
        </label>
        {tab === "villages" && (
          <label>
            {t("district.mandal")}
            <select value={mandalFilter} onChange={(event) => { setMandalFilter(event.target.value); setPage(1); }}>
              <option value="">{t("district.allMandals")}</option>
              {mandalOptions.map((mandal) => (
                <option key={mandal.id} value={mandal.id}>{getLocalizedMasterName(mandal, language)}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && <Alert type="error">{tm(error)}</Alert>}

      <section className="district-card">
        {loading ? <PageLoader label={t("district.loading")} /> : (
          <div className="district-table-wrap">
            <table className="district-table">
              <thead>
                {tab === "mandals" ? (
                  <tr>
                    <th>{t("district.locations.name")}</th>
                    <th>{t("district.locations.lgdCode")}</th>
                    <th>{t("district.locations.villageCount")}</th>
                    <th>{t("district.locations.facilityCount")}</th>
                    <th>{t("district.locations.status")}</th>
                    <th>{t("district.locations.verification")}</th>
                    <th>{t("district.locations.actions")}</th>
                  </tr>
                ) : (
                  <tr>
                    <th>{t("district.locations.name")}</th>
                    <th>{t("district.mandal")}</th>
                    <th>{t("district.locations.lgdCode")}</th>
                    <th>{t("district.locations.facilityCount")}</th>
                    <th>{t("district.locations.status")}</th>
                    <th>{t("district.locations.verification")}</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {tab === "mandals" && rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t("district.locations.name")}><strong>{getLocalizedMasterName(row, language)}</strong></td>
                    <td data-label={t("district.locations.lgdCode")}><span className="mono">{row.lgd_code || "-"}</span></td>
                    <td data-label={t("district.locations.villageCount")}>{number(row.village_count)}</td>
                    <td data-label={t("district.locations.facilityCount")}>{number(row.facility_count)}</td>
                    <td data-label={t("district.locations.status")}>{activeBadge(row)}</td>
                    <td data-label={t("district.locations.verification")}>{verifiedBadge(row)}</td>
                    <td data-label={t("district.locations.actions")}>
                      <button type="button" className="event-button" onClick={() => showVillagesOf(row.id)}>{t("district.locations.viewVillages")}</button>
                    </td>
                  </tr>
                ))}
                {tab === "villages" && rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t("district.locations.name")}><strong>{getLocalizedMasterName(row, language)}</strong></td>
                    <td data-label={t("district.mandal")}>{getLocalizedField(row, "mandal_name", language)}</td>
                    <td data-label={t("district.locations.lgdCode")}><span className="mono">{row.lgd_code || "-"}</span></td>
                    <td data-label={t("district.locations.facilityCount")}>{number(row.facility_count)}</td>
                    <td data-label={t("district.locations.status")}>{activeBadge(row)}</td>
                    <td data-label={t("district.locations.verification")}>{verifiedBadge(row)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan="7" className="district-empty">{t("district.locations.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pager pagination={pagination} onPage={setPage} t={t} language={language} />
      </section>
    </div>
  );
}
