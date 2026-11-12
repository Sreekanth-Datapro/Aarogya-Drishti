import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "../careTeam/CareTeam.css";

export default function CareFollowups() {
  const { t, tm } = useLanguage();
  const [filter, setFilter] = useState("open");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState({
    visit_at: "",
    adhering_to_treatment: true,
    patient_feedback: "",
    reported_symptoms: "",
    discomfort_present: false,
    notes: "",
    improvement_noted: true,
    side_effects: "",
    precautions_followed: true,
    hospital_revisit_reminded: false,
    hospital_attended: "",
  });
  const [discomfort, setDiscomfort] = useState({
    issue_type: "INCREASED_SYMPTOMS",
    severity: "MODERATE",
    description: "",
    is_urgent: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/health-worker/care/followups", { params: { filter } });
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

  async function openItem(scheduleId) {
    setError("");
    try {
      const response = await api.get(`/health-worker/care/followups/${scheduleId}`);
      setSelected(response.data);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!selected?.schedule) return;
    if (!window.confirm(t("care.confirmSubmitReport"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/health-worker/care/followups/${selected.schedule.id}/report`, {
        ...report,
        visit_at: report.visit_at ? new Date(report.visit_at).toISOString() : new Date().toISOString(),
        hospital_attended: report.hospital_attended === ""
          ? null
          : report.hospital_attended === "true",
      });
      setMessage(t("care.reportSubmitted"));
      setSelected(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function submitDiscomfort(event) {
    event.preventDefault();
    if (!selected?.plan) return;
    if (!window.confirm(t("care.confirmDiscomfort"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/health-worker/care/plans/${selected.plan.id}/discomfort`, discomfort);
      setMessage(
        response.data.urgent ? t("care.urgentDiscomfortSent") : t("care.discomfortSubmitted")
      );
      setSelected((current) => ({ ...current, plan: response.data.plan }));
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="care-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><CalendarDays size={22} /> {t("care.hwTitle")}</h1>
          <p className="page-subtitle">{t("care.hwSubtitle")}</p>
        </div>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      <Alert type="info">{t("care.hwNoPrescribe")}</Alert>

      <div className="navigator-filters" role="tablist">
        {["open", "completed"].map((key) => (
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
      {!loading && !items.length && <p className="care-muted">{t("care.emptyFollowups")}</p>}

      {!loading && items.length > 0 && (
        <section className="district-card">
          <table className="specialist-table">
            <thead>
              <tr>
                <th>{t("care.patient")}</th>
                <th>{t("care.dueDate")}</th>
                <th>{t("care.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.patient_name}</strong><small>{item.patient_code}</small></td>
                  <td>{item.due_at ? new Date(item.due_at).toLocaleString() : "—"}</td>
                  <td><Badge tone="info">{item.status}</Badge></td>
                  <td>
                    <Button size="sm" variant="secondary" onClick={() => openItem(item.id)}>
                      {t("care.open")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selected && (
        <section className="district-card">
          <h2 className="district-card-title">{selected.plan.patient_name}</h2>
          <p className="care-muted">{selected.plan.clinical_summary}</p>
          <p className="care-muted">
            {t("care.expectedEndDate")}: {selected.plan.expected_end_date || "—"}
            {" · "}
            {t("care.hospitalRevisitDate")}: {selected.plan.hospital_revisit_date || "—"}
          </p>
          <h3>{t("care.medicines")}</h3>
          <ul>
            {(selected.plan.medicines || []).map((medicine) => (
              <li key={medicine.id}>
                {medicine.medicine_name} — {medicine.dosage}, {medicine.frequency}
              </li>
            ))}
          </ul>

          {selected.schedule.status === "SCHEDULED" && (
            <form className="navigator-form" onSubmit={submitReport}>
              <h3>{t("care.submitReport")}</h3>
              <label>{t("care.visitAt")}
                <input
                  type="datetime-local"
                  value={report.visit_at}
                  onChange={(event) => setReport((current) => ({ ...current, visit_at: event.target.value }))}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={report.adhering_to_treatment}
                  onChange={(event) => setReport((current) => ({ ...current, adhering_to_treatment: event.target.checked }))}
                />{" "}
                {t("care.adhering")}
              </label>
              <label>{t("care.patientFeedback")}
                <textarea
                  rows={2}
                  value={report.patient_feedback}
                  onChange={(event) => setReport((current) => ({ ...current, patient_feedback: event.target.value }))}
                />
              </label>
              <label>{t("care.reportedSymptoms")}
                <textarea
                  rows={2}
                  value={report.reported_symptoms}
                  onChange={(event) => setReport((current) => ({ ...current, reported_symptoms: event.target.value }))}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={report.improvement_noted}
                  onChange={(event) => setReport((current) => ({ ...current, improvement_noted: event.target.checked }))}
                />{" "}
                {t("care.improvementNoted")}
              </label>
              <label>{t("care.sideEffects")}
                <textarea
                  rows={2}
                  value={report.side_effects}
                  onChange={(event) => setReport((current) => ({ ...current, side_effects: event.target.value }))}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={report.precautions_followed}
                  onChange={(event) => setReport((current) => ({ ...current, precautions_followed: event.target.checked }))}
                />{" "}
                {t("care.precautionsFollowed")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={report.hospital_revisit_reminded}
                  onChange={(event) => setReport((current) => ({ ...current, hospital_revisit_reminded: event.target.checked }))}
                />{" "}
                {t("care.hospitalRevisitReminded")}
              </label>
              <label>{t("care.revisitAttendance")}
                <select
                  value={report.hospital_attended}
                  onChange={(event) => setReport((current) => ({ ...current, hospital_attended: event.target.value }))}
                >
                  <option value="">{t("care.attendancePending")}</option>
                  <option value="true">{t("care.attendanceAttended")}</option>
                  <option value="false">{t("care.attendanceNotAttended")}</option>
                </select>
              </label>
              <Button type="submit" disabled={saving}>{t("care.submitReport")}</Button>
            </form>
          )}

          <form className="navigator-form" onSubmit={submitDiscomfort}>
            <h3>{t("care.reportDiscomfort")}</h3>
            <Alert type="warning">{t("care.urgentEscalationNote")}</Alert>
            <label>{t("care.issueType")}
              <select
                value={discomfort.issue_type}
                onChange={(event) => setDiscomfort((current) => ({ ...current, issue_type: event.target.value }))}
              >
                <option value="INCREASED_SYMPTOMS">{t("care.issue.increased")}</option>
                <option value="MEDICINE_DISCOMFORT">{t("care.issue.medicine")}</option>
                <option value="NO_IMPROVEMENT">{t("care.issue.noImprovement")}</option>
                <option value="NEW_COMPLAINT">{t("care.issue.newComplaint")}</option>
                <option value="DIFFICULTY_FOLLOWING">{t("care.issue.difficulty")}</option>
                <option value="OTHER">{t("care.issue.other")}</option>
              </select>
            </label>
            <label>{t("care.severity")}
              <select
                value={discomfort.severity}
                onChange={(event) => setDiscomfort((current) => ({ ...current, severity: event.target.value }))}
              >
                <option value="MILD">{t("care.severityMild")}</option>
                <option value="MODERATE">{t("care.severityModerate")}</option>
                <option value="SEVERE">{t("care.severitySevere")}</option>
                <option value="EMERGENCY">{t("care.severityEmergency")}</option>
              </select>
            </label>
            <label>{t("care.description")} *
              <textarea
                required
                rows={3}
                value={discomfort.description}
                onChange={(event) => setDiscomfort((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={discomfort.is_urgent}
                onChange={(event) => setDiscomfort((current) => ({ ...current, is_urgent: event.target.checked }))}
              />{" "}
              {t("care.markUrgent")}
            </label>
            <Button type="submit" disabled={saving}>{t("care.reportDiscomfort")}</Button>
          </form>
        </section>
      )}
    </div>
  );
}
