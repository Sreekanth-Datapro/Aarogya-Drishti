import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  Building,
  CircleCheck,
  CircleOff,
  Hospital,
  Plus,
  Search,
  Stethoscope,
} from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber, getLocalizedField, getLocalizedMasterName } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Card, DataTable, SelectField, StatCard, TextField } from "../../components/ui";
import StatusDialog from "../../components/facilities/StatusDialog";
import useLocationLists from "../../components/facilities/useLocationLists";
import { FACILITY_TYPES, canManageFacilities } from "../../components/facilities/facilityTypes";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { search: "", district_id: "", mandal_id: "", village_id: "", category: "", status: "" };

export default function FacilityList() {
  const { user } = useAuth();
  const { t, tm, language } = useLanguage();
  const location = useLocation();
  const canManage = canManageFacilities(user);

  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ facilities: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(location.state?.message || "");

  // Facility waiting for activate / deactivate confirmation
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const { districts, mandals, villages } = useLocationLists(filters.district_id, filters.mandal_id);

  useEffect(() => {
    if (user?.role === "DISTRICT_ADMIN" && districts.length === 1 && !filters.district_id) {
      setFilters((previous) => ({
        ...previous,
        district_id: String(districts[0].id),
      }));
      setPage(1);
    }
  }, [districts, filters.district_id, user?.role]);

  const loadSummary = useCallback(() => {
    api.get("/facilities/summary").then(({ data: res }) => setSummary(res.summary)).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Only send filters that have a value
      const params = { page, page_size: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });

      const { data: res } = await api.get("/facilities", { params });
      setData({ facilities: res.facilities, total: res.total });
    } catch (err) {
      setError(apiMessage(err, "facilities.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);

  // Wait until the user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((previous) => (previous.search === searchText ? previous : { ...previous, search: searchText }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Changing the district clears mandal and village; changing the mandal clears the village
  const setFilter = (name, value) => {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "district_id" ? { mandal_id: "", village_id: "" } : {}),
      ...(name === "mandal_id" ? { village_id: "" } : {}),
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
    setPage(1);
  };

  const changeStatus = async () => {
    setStatusBusy(true);
    try {
      const { data: res } = await api.patch(`/facilities/${statusTarget.id}/status`, { is_active: !statusTarget.is_active });
      setMessage(res.message);
      setStatusTarget(null);
      await Promise.all([loadList(), loadSummary()]);
    } catch (err) {
      setStatusTarget(null);
      setError(apiMessage(err, "facilities.statusFailed"));
    } finally {
      setStatusBusy(false);
    }
  };

  const columns = [
    {
      key: "name_en",
      header: t("facilities.colName"),
      render: (row) => (
        <div>
          <Link to={`/admin/facilities/${row.id}`}><strong>{getLocalizedMasterName(row, language)}</strong></Link>
          {language === "en" && row.name_te && <p className="cell-sub">{row.name_te}</p>}
        </div>
      ),
    },
    { key: "category", header: t("facilities.colType"), render: (row) => t(`facilities.types.${row.category}`) },
    {
      key: "code",
      header: t("facilities.colCode"),
      render: (row) => (row.code ? <span className="mono">{row.code}</span> : <span className="muted-cell">-</span>),
    },
    {
      key: "location",
      header: t("facilities.colLocation"),
      render: (row) => (
        <div>
          <span>{getLocalizedField(row, "village_name", language) || "-"}</span>
          <p className="cell-sub">
            {[getLocalizedField(row, "mandal_name", language), getLocalizedField(row, "district_name", language)].filter(Boolean).join(", ")}
          </p>
        </div>
      ),
    },
    { key: "contact_phone", header: t("facilities.colContact"), render: (row) => row.contact_phone || <span className="muted-cell">-</span> },
    { key: "patient_count", header: t("facilities.colPatients"), render: (row) => formatLocalizedNumber(row.patient_count ?? 0, language) },
    { key: "staff_count", header: t("facilities.colStaff"), render: (row) => formatLocalizedNumber(row.staff_count ?? 0, language) },
    {
      key: "is_active",
      header: t("facilities.colStatus"),
      render: (row) => (
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? t("facilities.statusActive") : t("facilities.statusInactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("facilities.colActions"),
      render: (row) => (
        <div className="table-actions">
          <Link className="btn btn-ghost btn-sm" to={`/admin/facilities/${row.id}`}>{t("facilities.view")}</Link>
          {canManage && (
            <>
              <Link className="btn btn-ghost btn-sm" to={`/admin/facilities/${row.id}/edit`}>{t("facilities.edit")}</Link>
              <Button size="sm" variant={row.is_active ? "danger" : "secondary"} onClick={() => setStatusTarget(row)}>
                {row.is_active ? t("facilities.deactivate") : t("facilities.activate")}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const firstShown = data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(page * PAGE_SIZE, data.total);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("facilities.title")}</h1>
          <p className="page-subtitle">{t("facilities.subtitle")}</p>
        </div>
        {canManage && (
          <Link className="btn btn-primary" to="/admin/facilities/new">
            <Plus size={18} aria-hidden="true" /> {t("facilities.add")}
          </Link>
        )}
      </div>

      {/* Dashboard counts */}
      <div className="grid grid-3">
        <StatCard icon={Building} label={t("facilities.total")} value={summary?.total ?? "-"} tone="blue" />
        <StatCard icon={CircleCheck} label={t("facilities.active")} value={summary?.active ?? "-"} tone="green" />
        <StatCard icon={CircleOff} label={t("facilities.inactive")} value={summary?.inactive ?? "-"} tone="rose" />
        <StatCard icon={Stethoscope} label={t("facilities.phc")} value={summary?.phc ?? "-"} tone="green" />
        <StatCard icon={Activity} label={t("facilities.chc")} value={summary?.chc ?? "-"} tone="amber" />
        <StatCard icon={Hospital} label={t("facilities.hospital")} value={summary?.hospital ?? "-"} tone="violet" />
      </div>

      {!canManage && (
        <div className="section">
          <Alert type="info">{t("facilities.readOnly")}</Alert>
        </div>
      )}

      {message && (
        <div className="section">
          <Alert type="success">{tm(message)}</Alert>
        </div>
      )}

      <div className="section">
        <Card padded={false}>
          {/* Search and filters */}
          <div className="filters-grid">
            <TextField
              id="facility-search"
              label={t("facilities.search")}
              icon={Search}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("facilities.search")}
            />
            {user?.role !== "DISTRICT_ADMIN" && (
              <SelectField id="filter-district" label={t("facilities.district")} value={filters.district_id} onChange={(e) => setFilter("district_id", e.target.value)}>
                <option value="">{t("facilities.allDistricts")}</option>
                {districts.map((d) => <option key={d.id} value={d.id}>{getLocalizedMasterName(d, language)}</option>)}
              </SelectField>
            )}
            <SelectField id="filter-mandal" label={t("facilities.mandal")} value={filters.mandal_id} onChange={(e) => setFilter("mandal_id", e.target.value)} disabled={user?.role !== "DISTRICT_ADMIN" && !filters.district_id}>
              <option value="">{t("facilities.allMandals")}</option>
              {mandals.map((m) => <option key={m.id} value={m.id}>{getLocalizedMasterName(m, language)}</option>)}
            </SelectField>
            <SelectField id="filter-village" label={t("facilities.village")} value={filters.village_id} onChange={(e) => setFilter("village_id", e.target.value)} disabled={!filters.mandal_id}>
              <option value="">{t("facilities.allVillages")}</option>
              {villages.map((v) => <option key={v.id} value={v.id}>{getLocalizedMasterName(v, language)}</option>)}
            </SelectField>
            <SelectField id="filter-type" label={t("facilities.type")} value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
              <option value="">{t("facilities.allTypes")}</option>
              {FACILITY_TYPES.map((type) => <option key={type} value={type}>{t(`facilities.types.${type}`)}</option>)}
            </SelectField>
            <SelectField id="filter-status" label={t("facilities.status")} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">{t("facilities.allStatuses")}</option>
              <option value="active">{t("facilities.statusActive")}</option>
              <option value="inactive">{t("facilities.statusInactive")}</option>
            </SelectField>
          </div>

          {hasFilters && (
            <div className="toolbar">
              <span className="text-sm text-muted">{data.total} {t("facilities.total").toLowerCase()}</span>
              <Button size="sm" variant="ghost" onClick={clearFilters}>{t("facilities.clearFilters")}</Button>
            </div>
          )}

          {error && <div className="card-body"><Alert type="error">{tm(error)}</Alert></div>}

          {loading ? (
            <div className="card-body" aria-busy="true">
              {[1, 2, 3].map((n) => <div key={n} className="skeleton facility-skeleton-line" />)}
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={data.facilities}
              emptyTitle={t("facilities.empty")}
              emptyText={t("facilities.emptyText")}
            />
          )}

          {data.total > 0 && (
            <div className="pagination">
              <span className="text-sm text-muted">
                {t("facilities.showing")} {firstShown}–{lastShown} {t("facilities.of")} {data.total}
              </span>
              <div className="toolbar-actions">
                <Button size="sm" variant="secondary" onClick={() => setPage(page - 1)} disabled={page === 1}>
                  {t("facilities.previous")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPage(page + 1)} disabled={lastShown >= data.total}>
                  {t("facilities.next")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <StatusDialog facility={statusTarget} busy={statusBusy} onCancel={() => setStatusTarget(null)} onConfirm={changeStatus} />
    </>
  );
}
