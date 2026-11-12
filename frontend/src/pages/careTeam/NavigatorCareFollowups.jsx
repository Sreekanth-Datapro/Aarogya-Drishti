import React, { useCallback, useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "./CareTeam.css";

const FILTERS = ["inbox", "active", "specialist", "discomfort", "duration_due", "completion", "closed"];

export default function NavigatorCareFollowups() {
  const { t, tm } = useLanguage();
  const [filter, setFilter] = useState("inbox");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [healthWorkers, setHealthWorkers] = useState([]);
  const [hwId, setHwId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [revisitDate, setRevisitDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/navigator/care/plans", { params: { filter } });
      setItems(response.data.items || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function openPlan(planId) {
    setError("");
    setMessage("");
    try {
      const [planRes, hwRes] = await Promise.all([
        api.get(`/navigator/care/plans/${planId}`),
        api.get(`/navigator/care/plans/${planId}/health-workers`),
      ]);
      setSelected(planRes.data.plan);
      setHealthWorkers(hwRes.data.health_workers || []);
      setHwId("");
      setDueAt("");
      setInstructions("");
      setRevisitDate(
        planRes.data.plan?.hospital_revisit_date
          ? String(planRes.data.plan.hospital_revisit_date).slice(0, 10)
          : ""
      );
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    }
  }

  async function assignFollowup(event) {
    event.preventDefault();
    if (!selected) return;
    if (!window.confirm(t("care.confirmAssignFollowup"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/navigator/care/plans/${selected.id}/schedule-followup`, {
        health_worker_id: hwId,
        due_at: new Date(dueAt).toISOString(),
        instructions,
      });
      setSelected(response.data.plan);
      setMessage(t("care.followupAssigned"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function markCompleted() {
    if (!selected) return;
    if (!window.confirm(t("care.confirmTreatmentComplete"))) return;
    setSaving(true);
    try {
      const response = await api.post(`/navigator/care/plans/${selected.id}/treatment-completed`);
      setSelected(response.data.plan);
      setMessage(t("care.finalCheckupRequested"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function escalate(discomfortId) {
    if (!window.confirm(t("care.confirmEscalate"))) return;
    setSaving(true);
    try {
      const response = await api.post(
        `/navigator/care/plans/${selected.id}/discomfort/${discomfortId}/escalate`
      );
      setSelected(response.data.plan);
      setMessage(t("care.escalated"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function updateCoordination(payload, successKey = "care.coordinationUpdated") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.patch(
        `/navigator/care/plans/${selected.id}/coordination`,
        payload
      );
      setSelected(response.data.plan);
      if (response.data.plan?.hospital_revisit_date) {
        setRevisitDate(String(response.data.plan.hospital_revisit_date).slice(0, 10));
      }
      setMessage(t(successKey));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function rescheduleRevisit(event) {
    event.preventDefault();
    if (!selected || !revisitDate) return;
    await updateCoordination(
      { hospital_revisit_date: revisitDate, hospital_revisit_scheduled: true },
      "care.rescheduleRevisitSaved"
    );
  }

  return (
    <div className="care-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><CalendarCheck size={22} /> {t("care.navTitle")}</h1>
          <p className="page-subtitle">{t("care.navSubtitle")}</p>
        </div>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <div className="navigator-filters" role="tablist">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "is-active" : ""}
            onClick={() => { setFilter(key); setSelected(null); }}
          >
            {t(`care.filter.${key}`)}
          </button>
        ))}
      </div>

      {loading && <PageLoader label={t("common.loading")} />}
      {!loading && !items.length && <p className="care-muted">{t("care.emptyPlans")}</p>}

      {!loading && items.length > 0 && (
        <section className="district-card">
          <div className="specialist-table-wrap">
            <table className="specialist-table">
              <thead>
                <tr>
                  <th>{t("care.patient")}</th>
                  <th>{t("care.source")}</th>
                  <th>{t("care.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.patient_name}</strong><small>{item.patient_code}</small></td>
                    <td>{t(`care.sourceLabel.${item.source}`)}</td>
                    <td>
                      <Badge tone={item.duration_due ? "warning" : "info"}>{item.status}</Badge>
                      {item.duration_due && (
                        <Badge tone="warning">{t("care.filter.duration_due")}</Badge>
                      )}
                    </td>
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => openPlan(item.id)}>
                        {t("care.open")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <section className="district-card">
          <h2 className="district-card-title">{selected.patient_name}</h2>
          <p className="care-muted">{selected.clinical_summary}</p>
          <p><strong>{t("care.precautions")}:</strong> {selected.precautions || "—"}</p>
          <p className="care-muted">
            {t("care.expectedEndDate")}: {selected.expected_end_date || "—"}
            {" · "}
            {t("care.hospitalRevisitDate")}: {selected.hospital_revisit_date || "—"}
            {" · "}
            {t("care.revisitAttendance")}:{" "}
            {selected.hospital_revisit_status
              || (selected.hospital_attended == null
                ? t("care.attendancePending")
                : selected.hospital_attended
                  ? t("care.attendanceAttended")
                  : t("care.attendanceNotAttended"))}
          </p>
          {selected.hospital_attended === false && (
            <Alert type="warning">{t("care.missedRevisitBadge")}</Alert>
          )}
          {selected.duration_due && (
            <Alert type="warning">{t("care.filter.duration_due")}</Alert>
          )}
          <Alert type="info">{t("care.navigatorNoCloseNote")}</Alert>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(selected.patient_informed)}
                disabled={saving || Boolean(selected.patient_informed)}
                onChange={(event) => {
                  if (event.target.checked) updateCoordination({ patient_informed: true });
                }}
              />{" "}
              {t("care.patientInformed")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(selected.hospital_revisit_scheduled)}
                disabled={saving || Boolean(selected.hospital_revisit_scheduled)}
                onChange={(event) => {
                  if (event.target.checked) updateCoordination({ hospital_revisit_scheduled: true });
                }}
              />{" "}
              {t("care.hospitalRevisitScheduled")}
            </label>
          </div>
          {!["CLOSED", "SUPERSEDED"].includes(selected.status) && (
            <form className="navigator-form" onSubmit={rescheduleRevisit}>
              <h3>{t("care.rescheduleRevisit")}</h3>
              <p className="care-muted">{t("care.rescheduleRevisitHint")}</p>
              <label>{t("care.hospitalRevisitDate")} *
                <input
                  required
                  type="date"
                  value={revisitDate}
                  onChange={(event) => setRevisitDate(event.target.value)}
                  disabled={saving}
                />
              </label>
              <Button type="submit" disabled={saving || !revisitDate}>
                {t("care.rescheduleRevisit")}
              </Button>
            </form>
          )}
          <h3>{t("care.medicines")}</h3>
          <ul>
            {(selected.medicines || []).map((medicine) => (
              <li key={medicine.id}>
                {medicine.medicine_name} — {medicine.dosage}, {medicine.frequency}, {medicine.duration_days}d
              </li>
            ))}
          </ul>

          {!["CLOSED", "SUPERSEDED", "FINAL_CHECKUP_PENDING"].includes(selected.status) && (
            <form className="navigator-form" onSubmit={assignFollowup}>
              <h3>{t("care.assignFollowup")}</h3>
              <label>{t("care.healthWorker")} *
                <select required value={hwId} onChange={(event) => setHwId(event.target.value)}>
                  <option value="">{t("mo.choose")}</option>
                  {healthWorkers.map((item) => (
                    <option key={item.id} value={item.id}>{item.full_name}</option>
                  ))}
                </select>
              </label>
              <label>{t("care.dueDate")} *
                <input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label>{t("care.instructions")}
                <textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
              </label>
              <Button type="submit" disabled={saving}>{t("care.assign")}</Button>
            </form>
          )}

          {(selected.discomforts || []).filter((item) => item.status !== "RESOLVED").map((item) => (
            <div key={item.id} style={{ marginTop: "0.75rem" }}>
              <Alert type={item.is_urgent ? "error" : "warning"}>
                {item.severity}: {item.description}
              </Alert>
              {item.status === "OPEN" && (
                <Button size="sm" onClick={() => escalate(item.id)} disabled={saving}>
                  {t("care.escalateToMo")}
                </Button>
              )}
            </div>
          ))}

          {!["CLOSED", "SUPERSEDED", "FINAL_CHECKUP_PENDING"].includes(selected.status) && (
            <div style={{ marginTop: "1rem" }}>
              <Button variant="secondary" onClick={markCompleted} disabled={saving}>
                {t("care.markTreatmentComplete")}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
