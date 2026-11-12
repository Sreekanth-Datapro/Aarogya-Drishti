import React, { useCallback, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime, getCodeLabel, getLocalizedField } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import Pager from "./Pager";
import "./MedicalOfficer.css";

const EMPTY_FORM = { referral_id: "", navigator_id: "", task_type: "REMINDER", priority: "3", due_at: "", reason: "" };
const PRIORITY_KEYS = { 1: "mo.priority1", 2: "mo.priority2", 3: "mo.priority3", 4: "mo.priority4", 5: "mo.priority5" };
const TAB_KEYS = { open: "mo.tasks_open", overdue: "mo.tasks_overdue", closed: "mo.tasks_closed", "": "mo.tasks_all" };

// Follow-up tasks for referred patients of my Mandals, owned by a Navigator
// (the existing database only allows Navigator-owned, referral-linked tasks).
export default function FollowUps() {
  const { t, tm, language } = useLanguage();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [state, setState] = useState("open");
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/medical-officer/followups/options")
      .then((response) => setOptions(response.data.options))
      .catch((requestError) => setError(apiMessage(requestError, "mo.loadFailed")));
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/medical-officer/followups", { params: { state: state || undefined, page } });
      setTasks(response.data.tasks || []);
      setPaging(response.data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [state, page]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const referral = options?.referrals.find((item) => item.id === form.referral_id);
  const navigators = options?.navigators.filter((item) => !referral || item.district_id === referral.district_id) || [];

  const submit = async (event) => {
    event.preventDefault();
    if (!window.confirm(t("mo.confirmFollowup"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/medical-officer/followups", { ...form, priority: Number(form.priority), due_at: new Date(form.due_at).toISOString() });
      setMessage(t("mo.followupCreated"));
      setForm(EMPTY_FORM);
      await loadTasks();
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moFollowUp.title")}</h1>
          <p className="page-subtitle">{t("mo.followupSubtitle")}</p>
        </div>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <h2 className="mo-card-title"><CalendarPlus size={16} /> {t("mo.newFollowup")}</h2>
        {!options && <p className="mo-muted">{t("common.loading")}</p>}
        {options && !options.referrals.length && <Alert type="info">{t("mo.followupNeedsReferral")}</Alert>}
        {options && options.referrals.length > 0 && (
          <form className="mo-form" onSubmit={submit}>
            <label>{t("mo.referral")} *
              <select required value={form.referral_id} onChange={(event) => { update("referral_id", event.target.value); update("navigator_id", ""); }}>
                <option value="">{t("mo.choose")}</option>
                {options.referrals.map((item) => <option key={item.id} value={item.id}>{item.referral_code} · {item.patient_code}</option>)}
              </select>
            </label>
            <label>{t("mo.navigator")} *
              <select required value={form.navigator_id} onChange={(event) => update("navigator_id", event.target.value)} disabled={!form.referral_id}>
                <option value="">{t("mo.choose")}</option>
                {navigators.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
              </select>
            </label>
            <label>{t("mo.taskType")} *
              <select value={form.task_type} onChange={(event) => update("task_type", event.target.value)}>
                {options.task_types.map((code) => <option key={code} value={code}>{getCodeLabel("followupTypes", code, language)}</option>)}
              </select>
            </label>
            <label>{t("mo.priority")}
              <select value={form.priority} onChange={(event) => update("priority", event.target.value)}>
                {Object.entries(PRIORITY_KEYS).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
              </select>
            </label>
            <label>{t("mo.dueDate")} *
              <input type="datetime-local" required value={form.due_at} onChange={(event) => update("due_at", event.target.value)} />
            </label>
            <label className="mo-span-2">{t("mo.followupReason")} *
              <textarea required rows={2} maxLength={500} value={form.reason} onChange={(event) => update("reason", event.target.value)} />
            </label>
            <div className="mo-actions mo-span-2">
              <Button type="submit" loading={saving}><CalendarPlus size={15} /> {t("mo.createFollowup")}</Button>
            </div>
          </form>
        )}
      </section>

      <div className="mo-tabs" role="tablist">
        {["open", "overdue", "closed", ""].map((value) => (
          <button key={value || "all"} type="button" role="tab" aria-selected={state === value}
            className={state === value ? "active" : ""} onClick={() => { setState(value); setPage(1); }}>
            {t(TAB_KEYS[value])}
          </button>
        ))}
      </div>

      <section className="mo-card">
        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("mo.patient")}</th>
                  <th>{t("mo.taskType")}</th>
                  <th>{t("mo.navigator")}</th>
                  <th>{t("mo.dueDate")}</th>
                  <th>{t("mo.status")}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td data-label={t("mo.patient")}>
                      <span className="mono">{task.patient_code}</span>
                      <small className="mo-secondary">{task.referral_code}</small>
                    </td>
                    <td data-label={t("mo.taskType")}>
                      {getCodeLabel("followupTypes", task.task_type, language)}
                      <small className="mo-secondary">{task.reason}</small>
                    </td>
                    <td data-label={t("mo.navigator")}>{task.navigator_name || "-"}</td>
                    <td data-label={t("mo.dueDate")}>
                      {formatLocalizedDateTime(task.due_at, language)}
                      {task.overdue && <Badge tone="danger">{t("mo.overdue")}</Badge>}
                    </td>
                    <td data-label={t("mo.status")}>
                      <Badge tone={task.closed_at ? "success" : "warning"}>{getLocalizedField(task, "status_name", language)}</Badge>
                      {task.closed_at && <small className="mo-secondary">{formatLocalizedDateTime(task.closed_at, language)}</small>}
                    </td>
                  </tr>
                ))}
                {!tasks.length && <tr><td colSpan="5" className="mo-empty">{t("mo.noTasks")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pager paging={paging} onPage={setPage} disabled={loading} />
      </section>
    </div>
  );
}
