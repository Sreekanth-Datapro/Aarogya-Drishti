import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getAuditActionLabel,
  getAuditModuleLabel,
  getAuditStatusLabel,
  getLabelCodes,
  getRoleLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Modal, PageLoader } from "../../components/ui";
import "./AdminPages.css";

const EMPTY_FILTERS = {
  date_from: "",
  date_to: "",
  user: "",
  role: "",
  action: "",
  module: "",
  status: "",
  search: "",
};

// Summary cards: translation key -> field of the API summary
const SUMMARY_CARDS = [
  ["auditLogs.totalEvents", "total"],
  ["auditLogs.loginSuccess", "login_success"],
  ["auditLogs.loginFailures", "login_failed"],
  ["auditLogs.userChanges", "user_changes"],
  ["auditLogs.roleChanges", "role_permission_changes"],
  ["auditLogs.districtAdminActivity", "district_admin_activity"],
  ["auditLogs.emailEvents", "email_events"],
  ["auditLogs.smsEvents", "sms_events"],
  ["auditLogs.passwordMfaEvents", "password_mfa_events"],
];

// apiPath: /audit/logs for Super Admin, /district/audit/logs for District Admin
export default function AuditLogs({ apiPath = "/audit/logs" }) {
  const { t, tm, language } = useLanguage();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 25, total: 0, total_pages: 0 });
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: 25 };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get(apiPath, { params });
      setEvents(response.data.events || []);
      setPagination(response.data.pagination || { page: 1, page_size: 25, total: 0, total_pages: 0 });
      setSummary(response.data.summary || null);
    } catch (requestError) {
      setError(apiMessage(requestError, "auditLogs.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters, apiPath]);

  useEffect(() => { load(1); }, [load]);

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const openDetail = async (id) => {
    try {
      const response = await api.get(`${apiPath}/${id}`);
      setSelected(response.data.event);
    } catch (requestError) {
      setError(apiMessage(requestError, "auditLogs.detailFailed"));
    }
  };

  const statusClass = (status) => status === "SUCCESS" ? "success" : status === "DENIED" ? "warning" : "danger";
  const dateTime = (value) => formatLocalizedDateTime(value, language) || "-";
  const roleText = (role) => (role ? getRoleLabel(role, language) : "-");

  // Dropdown choices: the value sent to the API is the code, the text is translated
  const codeOptions = (group, labelOf) =>
    getLabelCodes(group).map((code) => <option key={code} value={code}>{labelOf(code, language)}</option>);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{t("auditLogs.title")}</h1>
          <p className="admin-page-subtitle">{t("auditLogs.subtitle")}</p>
        </div>
      </div>

      {summary && (
        <div className="admin-card-grid">
          {SUMMARY_CARDS.map(([labelKey, field]) => (
            <div key={field} className="metric-card">
              <span>{t(labelKey)}</span>
              <strong>{formatLocalizedNumber(summary[field] ?? 0, language)}</strong>
            </div>
          ))}
        </div>
      )}

      <section className="admin-panel">
        <div className="audit-toolbar" style={{ padding: 16 }}>
          <label>{t("auditLogs.dateFrom")}<input type="date" value={filters.date_from} onChange={(event) => update("date_from", event.target.value)} /></label>
          <label>{t("auditLogs.dateTo")}<input type="date" value={filters.date_to} onChange={(event) => update("date_to", event.target.value)} /></label>
          <label>{t("auditLogs.user")}<input value={filters.user} onChange={(event) => update("user", event.target.value)} placeholder={t("auditLogs.userPlaceholder")} /></label>
          <label>{t("auditLogs.role")}<select value={filters.role} onChange={(event) => update("role", event.target.value)}>
            <option value="">{t("auditLogs.allRoles")}</option>
            {codeOptions("roles", getRoleLabel)}
          </select></label>
          <label>{t("auditLogs.action")}<select value={filters.action} onChange={(event) => update("action", event.target.value)}>
            <option value="">{t("auditLogs.allActions")}</option>
            {codeOptions("auditActions", getAuditActionLabel)}
          </select></label>
          <label>{t("auditLogs.module")}<select value={filters.module} onChange={(event) => update("module", event.target.value)}>
            <option value="">{t("auditLogs.allModules")}</option>
            {codeOptions("auditModules", getAuditModuleLabel)}
          </select></label>
          <label>{t("auditLogs.status")}<select value={filters.status} onChange={(event) => update("status", event.target.value)}>
            <option value="">{t("auditLogs.allStatuses")}</option>
            {codeOptions("auditStatuses", getAuditStatusLabel)}
          </select></label>
          <label>{t("auditLogs.search")}<input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder={t("auditLogs.searchPlaceholder")} /></label>
        </div>
      </section>

      {error && <Alert type="error">{tm(error)}</Alert>}
      <section className="admin-panel">
        {loading ? <div style={{ padding: 16 }}><PageLoader label={t("auditLogs.loading")} /></div> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("auditLogs.colDateTime")}</th>
                  <th>{t("auditLogs.colUser")}</th>
                  <th>{t("auditLogs.colRole")}</th>
                  <th>{t("auditLogs.colAction")}</th>
                  <th>{t("auditLogs.colModule")}</th>
                  <th>{t("auditLogs.colStatus")}</th>
                  <th>{t("auditLogs.colDetails")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{dateTime(event.occurred_at)}</td>
                    <td>{event.actor_name || event.actor_username || "-"}</td>
                    <td>{roleText(event.actor_role)}</td>
                    <td>{getAuditActionLabel(event.event, language)}</td>
                    <td>{getAuditModuleLabel(event.resource_type, language)}</td>
                    <td><span className={`status-badge ${statusClass(event.outcome)}`}>{getAuditStatusLabel(event.outcome, language)}</span></td>
                    <td><button type="button" className="event-button" onClick={() => openDetail(event.id)}>{t("auditLogs.view")}</button></td>
                  </tr>
                ))}
                {!events.length && <tr><td colSpan="7" className="empty-state-box">{t("auditLogs.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="audit-pagination">
          <span>{t("auditLogs.eventsCount", { count: formatLocalizedNumber(pagination.total, language) })}</span>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page <= 1 || loading} onClick={() => load(pagination.page - 1)}>{t("auditLogs.previous")}</button>{" "}
            <span>{t("auditLogs.pageOf", { page: pagination.page, total: Math.max(pagination.total_pages, 1) })}</span>{" "}
            <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.total_pages || loading} onClick={() => load(pagination.page + 1)}>{t("auditLogs.next")}</button>
          </div>
        </div>
      </section>

      <Modal open={Boolean(selected)} title={t("auditLogs.detailTitle")} onClose={() => setSelected(null)}>
        {selected && (
          <dl className="detail-grid">
            <dt>{t("auditLogs.event")}</dt><dd>{getAuditActionLabel(selected.event, language)} <code>{selected.event}</code></dd>
            <dt>{t("auditLogs.colDateTime")}</dt><dd>{dateTime(selected.occurred_at)}</dd>
            <dt>{t("auditLogs.colUser")}</dt><dd>{selected.actor_name || selected.actor_username || "-"}</dd>
            <dt>{t("auditLogs.colRole")}</dt><dd>{roleText(selected.actor_role)}</dd>
            <dt>{t("auditLogs.colModule")}</dt><dd>{getAuditModuleLabel(selected.resource_type, language)}</dd>
            <dt>{t("auditLogs.resourceId")}</dt><dd>{selected.resource_id || "-"}</dd>
            <dt>{t("auditLogs.colStatus")}</dt><dd><span className={`status-badge ${statusClass(selected.outcome)}`}>{getAuditStatusLabel(selected.outcome, language)}</span></dd>
            <dt>{t("auditLogs.ipAddress")}</dt><dd>{selected.ip_address || "-"}</dd>
            <dt>{t("auditLogs.requestId")}</dt><dd>{selected.request_id || "-"}</dd>
            <dt>{t("auditLogs.metadata")}</dt><dd><pre className="metadata-code">{JSON.stringify(selected.metadata || {}, null, 2)}</pre></dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}
