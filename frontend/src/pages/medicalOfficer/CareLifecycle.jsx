import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPlus, Stethoscope } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { getCaseStateLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "./MedicalOfficer.css";

const EMPTY_MEDICINE = {
  medicine_name: "",
  dosage: "",
  frequency: "",
  duration_days: "7",
  precautions: "",
};

const FILTERS = ["active", "escalations", "final", "closed", "referred"];
const CASE_STATE_FILTERS = ["", "REVIEWED", "REFERRAL_PLANNED", "ASSESSED"];

function statusTone(status) {
  if (status === "CLOSED" || status === "RECOVERY_CONFIRMED") return "success";
  if (status === "PATIENT_UNCOMFORTABLE" || status === "MO_REASSESSMENT") return "danger";
  if (status === "FINAL_CHECKUP_PENDING" || status === "TREATMENT_COMPLETED") return "warning";
  return "info";
}

export default function CareLifecycle() {
  const { t, tm, language } = useLanguage();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("active");
  const [items, setItems] = useState([]);
  const [navigators, setNavigators] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [caseStateFilter, setCaseStateFilter] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [navigatorId, setNavigatorId] = useState("");
  const [summary, setSummary] = useState("");
  const [precautions, setPrecautions] = useState("");
  const [treatmentStartDate, setTreatmentStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hospitalRevisitDate, setHospitalRevisitDate] = useState("");
  const [medicines, setMedicines] = useState([{ ...EMPTY_MEDICINE }]);
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
    hospital_facility_id: "",
    specialty_id: "",
    priority_id: "",
    mode: "HOSPITAL_VISIT",
    medicines: [{ ...EMPTY_MEDICINE }],
  });
  const [referralOptions, setReferralOptions] = useState(null);
  const [saving, setSaving] = useState(false);

  const expectedEndDate = useMemo(() => {
    const maxDays = medicines.reduce((max, row) => {
      const days = Number(row.duration_days) || 0;
      return days > max ? days : max;
    }, 0);
    if (!treatmentStartDate || maxDays < 1) return "";
    const date = new Date(`${treatmentStartDate}T00:00:00`);
    date.setDate(date.getDate() + maxDays);
    return date.toISOString().slice(0, 10);
  }, [treatmentStartDate, medicines]);

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

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [plansRes, navRes] = await Promise.all([
        api.get("/medical-officer/care/plans", { params: { filter } }),
        api.get("/medical-officer/care/navigators"),
      ]);
      setItems(plansRes.data.items || []);
      setNavigators(navRes.data.navigators || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadEligiblePatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const response = await api.get("/medical-officer/care/eligible-patients", {
        params: {
          search: patientSearch || undefined,
          case_state: caseStateFilter || undefined,
          page_size: 50,
        },
      });
      setEligible(response.data.items || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    } finally {
      setPatientsLoading(false);
    }
  }, [patientSearch, caseStateFilter]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEligiblePatients();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadEligiblePatients]);

  const selectedPatientLabel = useMemo(() => {
    if (!selectedPatient) return "";
    return `${selectedPatient.patient_name} (${selectedPatient.patient_code})`;
  }, [selectedPatient]);

  async function openPlan(planId) {
    setError("");
    try {
      const response = await api.get(`/medical-officer/care/plans/${planId}`);
      setSelected(response.data.plan);
      setReferralOptions(null);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.loadFailed"));
    }
  }

  async function loadReferralOptions(patientId) {
    if (!patientId) return;
    try {
      const response = await api.get(`/medical-officer/patients/${patientId}/referral-options`);
      setReferralOptions(response.data.options || null);
    } catch (requestError) {
      setReferralOptions(null);
      setError(apiMessage(requestError, "care.loadFailed"));
    }
  }

  function updateMedicine(index, field, value) {
    setMedicines((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function createPlan(event) {
    event.preventDefault();
    if (!selectedPatient?.id) {
      setError(t("care.selectPatientRequired"));
      return;
    }
    if (!window.confirm(t("care.confirmCreatePlan"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/medical-officer/patients/${selectedPatient.id}/care-plans`, {
        navigator_id: navigatorId,
        clinical_summary: summary,
        precautions,
        treatment_start_date: treatmentStartDate,
        expected_end_date: expectedEndDate || undefined,
        hospital_revisit_date: hospitalRevisitDate,
        allow_with_referral: true,
        medicines: medicines.map((row) => ({
          ...row,
          duration_days: Number(row.duration_days),
        })),
      });
      setMessage(t("care.planCreated"));
      setSelectedPatient(null);
      setNavigatorId("");
      setSummary("");
      setPrecautions("");
      setTreatmentStartDate(new Date().toISOString().slice(0, 10));
      setHospitalRevisitDate("");
      setMedicines([{ ...EMPTY_MEDICINE }]);
      await Promise.all([loadPlans(), loadEligiblePatients()]);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function updateFinalMedicine(index, field, value) {
    setFinalForm((current) => ({
      ...current,
      medicines: current.medicines.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  }

  async function confirmReturnFromSpecialist() {
    if (!selected?.patient_id) return;
    if (!window.confirm(t("care.confirmReturnFromSpecialist"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(
        `/medical-officer/patients/${selected.patient_id}/care/return-from-specialist`,
        { notes: "MO confirmed return after specialist referral" }
      );
      setMessage(response.data.message || t("care.returnedFromSpecialist"));
      setSelected(null);
      setFilter("active");
      await Promise.all([loadEligiblePatients(), loadPlans()]);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
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
        Object.assign(payload, {
          referral_reason: finalForm.referral_reason || finalForm.clinical_assessment,
          hospital_facility_id: Number(finalForm.hospital_facility_id),
          specialty_id: Number(finalForm.specialty_id),
          priority_id: Number(finalForm.priority_id),
          mode: finalForm.mode || "HOSPITAL_VISIT",
        });
      } else if (finalForm.decision === "URGENT_ESCALATION") {
        payload.urgent_reason = finalForm.urgent_reason || finalForm.clinical_assessment;
      }

      const response = await api.post(`/medical-officer/care/plans/${selected.id}/final-review`, payload);
      setSelected(response.data.plan);
      if (response.data.plan?.screening_sync_status === "PENDING_SCREENING_CLOSE") {
        setMessage(t("care.closedWithPendingSync"));
      } else if (response.data.referral?.referral_code) {
        setMessage(t("care.referralParkedFromMo", { code: response.data.referral.referral_code }));
        setSelected(null);
      } else if (response.data.plan?.referral_workflow_required || response.data.referral_workflow_required) {
        setMessage(t("care.referralWorkflowRequired"));
        const patientId = response.data.plan?.patient_id || selected.patient_id;
        if (patientId && window.confirm(t("care.openReferralWorkflow"))) {
          navigate(`/medical-officer/referrals?patient=${encodeURIComponent(patientId)}`);
          return;
        }
      } else {
        setMessage(t("care.finalReviewSaved"));
      }
      await Promise.all([loadPlans(), loadEligiblePatients()]);
    } catch (requestError) {
      setError(apiMessage(requestError, "care.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("care.moTitle")}</h1>
          <p className="page-subtitle">{t("care.moSubtitle")}</p>
        </div>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <h2 className="mo-card-title"><ClipboardPlus size={16} /> {t("care.newPlan")}</h2>
        <form className="mo-form" onSubmit={createPlan}>
          <div className="mo-span-2">
            <label>{t("care.selectPatient")} *</label>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(180px,1fr) minmax(140px,0.6fr)" }}>
              <input
                type="search"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder={t("care.searchPatients")}
                aria-label={t("care.searchPatients")}
              />
              <select
                value={caseStateFilter}
                onChange={(event) => setCaseStateFilter(event.target.value)}
                aria-label={t("care.filterCaseState")}
              >
                {CASE_STATE_FILTERS.map((code) => (
                  <option key={code || "all"} value={code}>
                    {code ? getCaseStateLabel(code, language) : t("care.allCaseStates")}
                  </option>
                ))}
              </select>
            </div>
            {selectedPatient && (
              <p className="mo-muted" style={{ marginTop: "0.5rem" }}>
                {t("care.selectedPatient")}: <strong>{selectedPatientLabel}</strong>
                {" · "}
                {selectedPatient.village_name}
                {" · "}
                {getCaseStateLabel(selectedPatient.case_state, language)}
                {" "}
                <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedPatient(null)}>
                  {t("care.clearSelection")}
                </Button>
              </p>
            )}
            {patientsLoading && <p className="mo-muted">{t("common.loading")}</p>}
            {!patientsLoading && !eligible.length && (
              <p className="mo-muted">{t("care.noEligiblePatients")}</p>
            )}
            {!patientsLoading && eligible.length > 0 && (
              <div className="mo-table-wrap" style={{ marginTop: "0.75rem", maxHeight: "240px", overflow: "auto" }}>
                <table className="mo-table">
                  <thead>
                    <tr>
                      <th>{t("care.patient")}</th>
                      <th>{t("care.village")}</th>
                      <th>{t("care.caseStatus")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.map((patient) => (
                      <tr key={patient.id} className={selectedPatient?.id === patient.id ? "is-selected" : ""}>
                        <td>
                          <strong>{patient.patient_name}</strong>
                          <div className="mo-muted">{patient.patient_code}</div>
                        </td>
                        <td>{language === "te" ? (patient.village_name_te || patient.village_name) : patient.village_name}</td>
                        <td>
                          <Badge tone="info">{getCaseStateLabel(patient.case_state, language)}</Badge>
                        </td>
                        <td>
                          <Button
                            type="button"
                            size="sm"
                            variant={selectedPatient?.id === patient.id ? "primary" : "secondary"}
                            onClick={() => setSelectedPatient(patient)}
                          >
                            {selectedPatient?.id === patient.id ? t("care.selected") : t("care.select")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <label>{t("care.navigator")} *
            <select required value={navigatorId} onChange={(event) => setNavigatorId(event.target.value)}>
              <option value="">{t("mo.choose")}</option>
              {navigators.map((item) => (
                <option key={item.id} value={item.id}>{item.full_name}</option>
              ))}
            </select>
          </label>
          <label className="mo-span-2">{t("care.clinicalSummary")} *
            <textarea required rows={3} maxLength={4000} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label className="mo-span-2">{t("care.precautions")}
            <textarea rows={2} maxLength={2000} value={precautions} onChange={(event) => setPrecautions(event.target.value)} />
          </label>
          <label>{t("care.treatmentStartDate")} *
            <input
              required
              type="date"
              value={treatmentStartDate}
              onChange={(event) => setTreatmentStartDate(event.target.value)}
            />
          </label>
          <label>{t("care.expectedEndDate")}
            <input type="date" value={expectedEndDate} readOnly />
          </label>
          <label>{t("care.hospitalRevisitDate")} *
            <input
              required
              type="date"
              value={hospitalRevisitDate}
              min={treatmentStartDate || undefined}
              onChange={(event) => setHospitalRevisitDate(event.target.value)}
            />
          </label>
          {medicines.map((row, index) => (
            <div className="mo-span-2" key={`med-${index}`} style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
              <label>{t("care.medicineName")} *
                <input required value={row.medicine_name} onChange={(event) => updateMedicine(index, "medicine_name", event.target.value)} />
              </label>
              <label>{t("care.dosage")} *
                <input required value={row.dosage} onChange={(event) => updateMedicine(index, "dosage", event.target.value)} />
              </label>
              <label>{t("care.frequency")} *
                <input required value={row.frequency} onChange={(event) => updateMedicine(index, "frequency", event.target.value)} />
              </label>
              <label>{t("care.durationDays")} *
                <input required type="number" min="1" max="365" value={row.duration_days} onChange={(event) => updateMedicine(index, "duration_days", event.target.value)} />
              </label>
            </div>
          ))}
          <div className="mo-span-2" style={{ display: "flex", gap: "0.75rem" }}>
            <Button type="button" variant="secondary" onClick={() => setMedicines((current) => [...current, { ...EMPTY_MEDICINE }])}>
              {t("care.addMedicine")}
            </Button>
            <Button type="submit" disabled={saving || !selectedPatient}>{saving ? t("common.saving") : t("care.sendToNavigator")}</Button>
          </div>
        </form>
      </section>

      <section className="mo-card">
        <div className="mo-card-title" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <span><Stethoscope size={16} /> {t("care.planQueue")}</span>
          <div className="mo-tabs" role="tablist">
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
        </div>
        {loading && <PageLoader label={t("common.loading")} />}
        {!loading && !items.length && <p className="mo-muted">{t("care.emptyPlans")}</p>}
        {!loading && items.length > 0 && (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("care.patient")}</th>
                  <th>{t("care.source")}</th>
                  <th>{t("care.status")}</th>
                  <th>{t("care.navigator")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.patient_name}</strong><div className="mo-muted">{item.patient_code}</div></td>
                    <td>{t(`care.sourceLabel.${item.source}`)}</td>
                    <td><Badge tone={statusTone(item.status)}>{t(`care.statusLabel.${item.status}`, { defaultValue: item.status })}</Badge></td>
                    <td>{item.navigator_name || "—"}</td>
                    <td><Button size="sm" variant="secondary" onClick={() => openPlan(item.id)}>{t("care.open")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="mo-card">
          <h2 className="mo-card-title">{selected.patient_name} · {selected.patient_code}</h2>
          <p className="mo-muted">{selected.clinical_summary}</p>
          <p className="mo-muted">
            {t("care.treatmentStartDate")}: {selected.treatment_start_date || "—"}
            {" · "}
            {t("care.expectedEndDate")}: {selected.expected_end_date || "—"}
            {" · "}
            {t("care.hospitalRevisitDate")}: {selected.hospital_revisit_date || "—"}
          </p>
          <p>
            <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
            {" "}
            <Badge tone="neutral">{getCaseStateLabel(selected.case_state, language)}</Badge>
            {selected.mo_reassessment_outcome && (
              <>
                {" "}
                <Badge tone="info">
                  {t(`care.decisionOutcome.${selected.mo_reassessment_outcome}`, {
                    defaultValue: selected.mo_reassessment_outcome,
                  })}
                </Badge>
              </>
            )}
          </p>
          {selected.screening_sync_status === "PENDING_SCREENING_CLOSE" && (
            <Alert type="warning">
              {selected.screening_sync_message || t("care.pendingScreeningSync")}
            </Alert>
          )}
          {selected.screening_sync_status === "SYNCED" && selected.status === "CLOSED" && (
            <Alert type="success">{t("care.screeningSynced")}</Alert>
          )}
          {selected.status === "SUPERSEDED" && (
            <Alert type="info">{t("care.referredParkedNote")}</Alert>
          )}
          {selected.status === "SUPERSEDED" && selected.patient_id && (
            <div style={{ marginBottom: "0.75rem" }}>
              <Button type="button" variant="secondary" disabled={saving} onClick={confirmReturnFromSpecialist}>
                {t("care.returnFromSpecialist")}
              </Button>
            </div>
          )}
          <h3>{t("care.medicines")}</h3>
          <ul>
            {(selected.medicines || []).map((medicine) => (
              <li key={medicine.id}>
                {medicine.medicine_name} — {medicine.dosage}, {medicine.frequency}, {medicine.duration_days} {t("care.days")}
              </li>
            ))}
          </ul>
          {(selected.discomforts || []).length > 0 && (
            <>
              <h3>{t("care.discomforts")}</h3>
              <ul>
                {selected.discomforts.map((item) => (
                  <li key={item.id}>
                    <Badge tone={item.is_urgent ? "danger" : "warning"}>{item.severity}</Badge> {item.issue_type}: {item.description}
                  </li>
                ))}
              </ul>
            </>
          )}
          {[
            "FINAL_CHECKUP_PENDING",
            "TREATMENT_COMPLETED",
            "RECOVERY_CONFIRMED",
            "FOLLOWUP_ACTIVE",
            "MO_REASSESSMENT",
            "PATIENT_UNCOMFORTABLE",
          ].includes(selected.status) && (
            <form className="mo-form" onSubmit={submitFinalReview}>
              <h3>{t("care.finalReview")}</h3>
              <Alert type="info">{t("care.reassessmentNote")}</Alert>
              <label className="mo-span-2">{t("care.observations")} *
                <textarea
                  required
                  rows={3}
                  value={finalForm.observations}
                  onChange={(event) => setFinalForm((current) => ({ ...current, observations: event.target.value }))}
                />
              </label>
              <label className="mo-span-2">{t("care.clinicalAssessment")}
                <textarea
                  rows={2}
                  value={finalForm.clinical_assessment}
                  onChange={(event) => setFinalForm((current) => ({ ...current, clinical_assessment: event.target.value }))}
                />
              </label>
              <label>{t("care.finalDecision")} *
                <select
                  value={finalForm.decision}
                  onChange={(event) => {
                    const decision = event.target.value;
                    setFinalForm((current) => ({ ...current, decision }));
                    if (decision === "REFER_SPECIALIST" && selected?.patient_id) {
                      loadReferralOptions(selected.patient_id);
                    }
                  }}
                >
                  <option value="CLOSE_RECOVERED">{t("care.decision.closeRecovered")}</option>
                  <option value="CONTINUE_TREATMENT">{t("care.decision.continue")}</option>
                  <option value="REFER_SPECIALIST">{t("care.decision.referSpecialist")}</option>
                  <option value="URGENT_ESCALATION">{t("care.decision.urgentEscalation")}</option>
                </select>
              </label>
              {finalForm.decision === "CLOSE_RECOVERED" && (
                <label>
                  <input
                    type="checkbox"
                    checked={finalForm.recovery_confirmed}
                    onChange={(event) => setFinalForm((current) => ({ ...current, recovery_confirmed: event.target.checked }))}
                  />{" "}
                  {t("care.recoveryConfirmed")}
                </label>
              )}
              {finalForm.decision === "CONTINUE_TREATMENT" && (
                <>
                  <label className="mo-span-2">{t("care.clinicalSummary")} *
                    <textarea
                      required
                      rows={2}
                      value={finalForm.clinical_summary}
                      onChange={(event) => setFinalForm((current) => ({ ...current, clinical_summary: event.target.value }))}
                    />
                  </label>
                  <label>{t("care.treatmentStartDate")} *
                    <input
                      required
                      type="date"
                      value={finalForm.treatment_start_date}
                      onChange={(event) => setFinalForm((current) => ({ ...current, treatment_start_date: event.target.value }))}
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
                      onChange={(event) => setFinalForm((current) => ({ ...current, hospital_revisit_date: event.target.value }))}
                    />
                  </label>
                  {(finalForm.medicines || []).map((row, index) => (
                    <div className="mo-span-2" key={`final-med-${index}`} style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
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
                  <div className="mo-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFinalForm((current) => ({
                        ...current,
                        medicines: [...current.medicines, { ...EMPTY_MEDICINE }],
                      }))}
                    >
                      {t("care.addMedicine")}
                    </Button>
                  </div>
                </>
              )}
              {finalForm.decision === "REFER_SPECIALIST" && (
                <>
                  <label className="mo-span-2">{t("care.referralReason")} *
                    <textarea
                      required
                      rows={2}
                      value={finalForm.referral_reason}
                      onChange={(event) => setFinalForm((current) => ({ ...current, referral_reason: event.target.value }))}
                    />
                  </label>
                  <label>{t("mo.hospital")} *
                    <select
                      required
                      value={finalForm.hospital_facility_id}
                      onChange={(event) => setFinalForm((current) => ({ ...current, hospital_facility_id: event.target.value }))}
                    >
                      <option value="">{t("diagnostics.selectFacility")}</option>
                      {(referralOptions?.hospitals || []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {language === "te" && row.name_te ? row.name_te : row.name_en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>{t("mo.specialty") || "Specialty"} *
                    <select
                      required
                      value={finalForm.specialty_id}
                      onChange={(event) => setFinalForm((current) => ({ ...current, specialty_id: event.target.value }))}
                    >
                      <option value="">—</option>
                      {(referralOptions?.specialties || []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {language === "te" && row.name_te ? row.name_te : row.name_en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>{t("mo.priority") || "Priority"} *
                    <select
                      required
                      value={finalForm.priority_id}
                      onChange={(event) => setFinalForm((current) => ({ ...current, priority_id: event.target.value }))}
                    >
                      <option value="">—</option>
                      {(referralOptions?.priorities || []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {language === "te" && row.name_te ? row.name_te : row.name_en}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {finalForm.decision === "URGENT_ESCALATION" && (
                <label className="mo-span-2">{t("care.urgentReason")} *
                  <textarea
                    required
                    rows={2}
                    value={finalForm.urgent_reason}
                    onChange={(event) => setFinalForm((current) => ({ ...current, urgent_reason: event.target.value }))}
                  />
                </label>
              )}
              <Button type="submit" disabled={saving}>{t("care.saveFinalReview")}</Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
