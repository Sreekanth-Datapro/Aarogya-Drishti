import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Stethoscope } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader, StatCard } from "../../components/ui";
import "../medicalOfficer/MedicalOfficer.css";
import "./CareTeam.css";

const EMPTY_MEDICINE = {
  medicine_name: "",
  dosage: "",
  frequency: "",
  duration_days: "7",
  precautions: "",
};

const FILTERS = [
  "active",
  "escalations",
  "reassessment",
  "revisit_due",
  "missed_revisit",
  "closed",
];

function statusTone(status) {
  if (status === "CLOSED" || status === "RECOVERY_CONFIRMED") return "success";
  if (status === "PATIENT_UNCOMFORTABLE" || status === "MO_REASSESSMENT") return "danger";
  if (status === "FINAL_CHECKUP_PENDING" || status === "TREATMENT_COMPLETED") return "warning";
  return "info";
}

export default function SpecialistCareLifecycle() {
  const { t, tm } = useLanguage();
  const [filter, setFilter] = useState("active");
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalForm, setFinalForm] = useState({
    observations: "",
    clinical_assessment: "",
    recovery_confirmed: false,
    decision: "CLOSE_RECOVERED",
    referral_reason: "",
    urgent_reason: "",
    clinical_summary: "",
    precautions: "",
    treatment_start_date: new Date().toISOString().slice(0, 10),
    hospital_revisit_date: "",
    medicines: [{ ...EMPTY_MEDICINE }],
  });

  const continueExpectedEnd = useMemo(() => {
    const maxDays = (finalForm.medicines || []).reduce((max, row) => {
      const days = Number(row.duration_days) || 0;
      return days > max ? days : max;
    }, 0);
    if (!finalForm.treatment_start_date || maxDays < 1) return "";
    const date = new Date(`${finalForm.treatment_start_date}T00:00:00`);
    date.setDate(date.getDate() + maxDays);
    return date.toISOString().slice(0, 10);
  }, [finalForm.treatment_start_date, finalForm.medicines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [plansRes, dashRes] = await Promise.all([
        api.get("/specialist/care/plans", { params: { filter } }),
        api.get("/specialist/care/dashboard"),
      ]);
      setItems(plansRes.data.items || []);
      setStats(dashRes.data.care || null);
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
      const response = await api.get(`/specialist/care/plans/${planId}`);
      setSelected(response.data.plan);
      setFinalForm((current) => ({
        ...current,
        clinical_summary: response.data.plan?.clinical_summary || "",
        precautions: response.data.plan?.precautions || "",
        treatment_start_date: new Date().toISOString().slice(0, 10),
        hospital_revisit_date: "",
        medicines: [{ ...EMPTY_MEDICINE }],
        observations: "",
        clinical_assessment: "",
        recovery_confirmed: false,
        decision: "CLOSE_RECOVERED",
      }));
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    }
  }

  function updateFinalMedicine(index, field, value) {
    setFinalForm((current) => ({
      ...current,
      medicines: current.medicines.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  }

  async function submitFinalReview(event) {
    event.preventDefault();
    if (!selected) return;
    if (!window.confirm(t("care.confirmFinalReview"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        observations: finalForm.observations,
        clinical_assessment: finalForm.clinical_assessment,
        recovery_confirmed: finalForm.recovery_confirmed,
        decision: finalForm.decision,
      };
      if (finalForm.decision === "CONTINUE_TREATMENT") {
        Object.assign(payload, {
          clinical_summary: finalForm.clinical_summary || finalForm.clinical_assessment,
          precautions: finalForm.precautions,
          treatment_start_date: finalForm.treatment_start_date,
          expected_end_date: continueExpectedEnd || undefined,
          hospital_revisit_date: finalForm.hospital_revisit_date,
          medicines: finalForm.medicines.map((row) => ({
            ...row,
            duration_days: Number(row.duration_days),
          })),
        });
      } else if (finalForm.decision === "REFER_SPECIALIST") {
        payload.referral_reason = finalForm.referral_reason || finalForm.clinical_assessment;
      } else if (finalForm.decision === "URGENT_ESCALATION") {
        payload.urgent_reason = finalForm.urgent_reason || finalForm.clinical_assessment;
      }

      const response = await api.post(`/specialist/care/plans/${selected.id}/final-review`, payload);
      setSelected(response.data.plan);
      setMessage(t("care.finalReviewSaved"));
      await load();
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
          <h1 className="page-title">{t("care.spTitle")}</h1>
          <p className="page-subtitle">{t("care.spSubtitle")}</p>
        </div>
        <Link className="btn btn-secondary" to="/specialist/referrals">
          <ArrowLeft size={16} aria-hidden="true" /> {t("care.backToReferrals")}
        </Link>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      {stats && (
        <div className="care-stats-grid" style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", marginBottom: "1rem" }}>
          <StatCard label={t("care.statActivePlans")} value={stats.active_care_plans} />
          <StatCard label={t("care.statReassessment")} value={stats.reassessment_queue} />
          <StatCard label={t("care.statRevisitDue")} value={stats.revisit_due} />
          <StatCard label={t("care.statMissedRevisit")} value={stats.missed_revisit} />
          <StatCard label={t("care.statDiagnostics")} value={stats.diagnostic_orders} />
          <StatCard label={t("care.statReportsPending")} value={stats.reports_pending_review} />
          <StatCard label={t("care.statClosed")} value={stats.closed_cases} />
        </div>
      )}

      <section className="district-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {FILTERS.map((code) => (
            <Button
              key={code}
              type="button"
              size="sm"
              variant={filter === code ? "primary" : "secondary"}
              onClick={() => { setFilter(code); setSelected(null); }}
            >
              {t(`care.filter.${code}`)}
            </Button>
          ))}
        </div>

        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("care.patient")}</th>
                  <th>{t("care.status")}</th>
                  <th>{t("care.hospitalRevisitDate")}</th>
                  <th>{t("care.navigator")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!items.length && (
                  <tr>
                    <td colSpan={5} className="mo-muted">{t("care.noPlans")}</td>
                  </tr>
                )}
                {items.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.patient_name}</strong>
                      <div className="mo-muted">{plan.patient_code}</div>
                    </td>
                    <td><Badge tone={statusTone(plan.status)}>{plan.status}</Badge></td>
                    <td>{plan.hospital_revisit_date ? String(plan.hospital_revisit_date).slice(0, 10) : "—"}</td>
                    <td>{plan.navigator_name || "—"}</td>
                    <td>
                      <Button type="button" size="sm" onClick={() => openPlan(plan.id)}>
                        {t("care.open")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="district-card" style={{ marginTop: "1rem" }}>
          <h2 className="district-card-title">
            <Stethoscope size={16} aria-hidden="true" /> {selected.patient_name}
          </h2>
          <p className="mo-muted">
            {selected.patient_code} · <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
            {" · "}
            {t("care.sourceSpecialist")}
          </p>
          <p>{selected.clinical_summary}</p>
          {selected.precautions && <p className="mo-muted">{t("care.precautions")}: {selected.precautions}</p>}

          {Array.isArray(selected.medicines) && selected.medicines.length > 0 && (
            <ul className="care-list">
              {selected.medicines.map((med) => (
                <li key={med.id || `${med.medicine_name}-${med.sort_order}`}>
                  {med.medicine_name} — {med.dosage}, {med.frequency}, {med.duration_days}d
                  {med.start_date ? ` (${String(med.start_date).slice(0, 10)} → ${String(med.expected_end_date || "").slice(0, 10)})` : ""}
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
            <Link className="btn btn-secondary" to={`/specialist/tracking/${selected.patient_id}`}>
              {t("care.viewTimeline")}
            </Link>
            <Link
              className="btn btn-secondary"
              to={`/specialist/diagnostics?patient_id=${encodeURIComponent(selected.patient_id)}`}
            >
              {t("care.diagnostics")}
            </Link>
            {selected.status !== "CLOSED" && selected.status !== "SUPERSEDED" && (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={async () => {
                  const notes = window.prompt(t("care.authorizeReturnNotesPrompt"));
                  if (!notes || !notes.trim()) return;
                  if (!window.confirm(t("care.confirmAuthorizeReturn"))) return;
                  setSaving(true);
                  setError("");
                  setMessage("");
                  try {
                    const response = await api.post(
                      `/specialist/patients/${selected.patient_id}/care/authorize-return-to-mo`,
                      { notes: notes.trim() }
                    );
                    setMessage(response.data.message || t("care.returnAuthorized"));
                  } catch (requestError) {
                    setError(apiMessage(requestError, "care.saveFailed"));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t("care.authorizeReturnToMo")}
              </Button>
            )}
          </div>

          <form className="mo-form" onSubmit={submitFinalReview}>
            <h3>{t("care.reassessment")}</h3>
            <label className="mo-span-2">{t("care.observations")} *
              <textarea
                required
                rows={3}
                maxLength={4000}
                value={finalForm.observations}
                onChange={(event) => setFinalForm((c) => ({ ...c, observations: event.target.value }))}
              />
            </label>
            <label className="mo-span-2">{t("care.clinicalAssessment")}
              <textarea
                rows={2}
                maxLength={4000}
                value={finalForm.clinical_assessment}
                onChange={(event) => setFinalForm((c) => ({ ...c, clinical_assessment: event.target.value }))}
              />
            </label>
            <label>{t("care.decisionLabel")} *
              <select
                value={finalForm.decision}
                onChange={(event) => setFinalForm((c) => ({ ...c, decision: event.target.value }))}
              >
                <option value="CLOSE_RECOVERED">{t("care.decisionClose")}</option>
                <option value="CONTINUE_TREATMENT">{t("care.decisionContinue")}</option>
                <option value="REFER_SPECIALIST">{t("care.decisionRefer")}</option>
                <option value="URGENT_ESCALATION">{t("care.decisionUrgent")}</option>
              </select>
            </label>
            {finalForm.decision === "CLOSE_RECOVERED" && (
              <label>
                <input
                  type="checkbox"
                  checked={finalForm.recovery_confirmed}
                  onChange={(event) => setFinalForm((c) => ({ ...c, recovery_confirmed: event.target.checked }))}
                />{" "}
                {t("care.confirmRecovery")}
              </label>
            )}
            {finalForm.decision === "CONTINUE_TREATMENT" && (
              <>
                <label className="mo-span-2">{t("care.clinicalSummary")} *
                  <textarea
                    required
                    rows={2}
                    value={finalForm.clinical_summary}
                    onChange={(event) => setFinalForm((c) => ({ ...c, clinical_summary: event.target.value }))}
                  />
                </label>
                <label>{t("care.treatmentStartDate")} *
                  <input
                    required
                    type="date"
                    value={finalForm.treatment_start_date}
                    onChange={(event) => setFinalForm((c) => ({ ...c, treatment_start_date: event.target.value }))}
                  />
                </label>
                <label>{t("care.expectedEndDate")}
                  <input type="date" value={continueExpectedEnd} readOnly />
                </label>
                <label>{t("care.hospitalRevisitDate")} *
                  <input
                    required
                    type="date"
                    value={finalForm.hospital_revisit_date}
                    min={finalForm.treatment_start_date || undefined}
                    onChange={(event) => setFinalForm((c) => ({ ...c, hospital_revisit_date: event.target.value }))}
                  />
                </label>
                {finalForm.medicines.map((row, index) => (
                  <div className="mo-span-2" key={`sp-med-${index}`} style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
                    <label>{t("care.medicineName")} *
                      <input required value={row.medicine_name} onChange={(event) => updateFinalMedicine(index, "medicine_name", event.target.value)} />
                    </label>
                    <label>{t("care.dosage")} *
                      <input required value={row.dosage} onChange={(event) => updateFinalMedicine(index, "dosage", event.target.value)} />
                    </label>
                    <label>{t("care.frequency")} *
                      <input required value={row.frequency} onChange={(event) => updateFinalMedicine(index, "frequency", event.target.value)} />
                    </label>
                    <label>{t("care.durationDays")} *
                      <input required type="number" min="1" max="365" value={row.duration_days} onChange={(event) => updateFinalMedicine(index, "duration_days", event.target.value)} />
                    </label>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setFinalForm((c) => ({ ...c, medicines: [...c.medicines, { ...EMPTY_MEDICINE }] }))}
                >
                  {t("care.addMedicine")}
                </Button>
              </>
            )}
            {finalForm.decision === "REFER_SPECIALIST" && (
              <label className="mo-span-2">{t("care.referralReason")} *
                <textarea
                  required
                  rows={2}
                  value={finalForm.referral_reason}
                  onChange={(event) => setFinalForm((c) => ({ ...c, referral_reason: event.target.value }))}
                />
              </label>
            )}
            {finalForm.decision === "URGENT_ESCALATION" && (
              <label className="mo-span-2">{t("care.urgentReason")} *
                <textarea
                  required
                  rows={2}
                  value={finalForm.urgent_reason}
                  onChange={(event) => setFinalForm((c) => ({ ...c, urgent_reason: event.target.value }))}
                />
              </label>
            )}
            <div className="mo-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("care.submitFinalReview")}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
