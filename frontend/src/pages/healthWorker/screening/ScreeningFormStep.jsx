import React, { useState } from "react";
import api from "../../../services/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import { getCodeLabel, getLocalizedMasterName } from "../../../i18n/displayLabels";
import { apiMessage } from "../../../i18n/translate";
import { Alert, Button } from "../../../components/ui";

const EMPTY_PAIN = { has_pain: false, severity: "", location: "", duration_days: "", notes: "" };

function initialValues(screening) {
  if (!screening) {
    return {
      chiefComplaint: "",
      symptoms: {},
      observations: {},
      pain: EMPTY_PAIN,
      notes: "",
    };
  }
  const findings = screening.findings || [];
  const symptoms = {};
  const observations = {};
  let pain = EMPTY_PAIN;
  findings.forEach((finding) => {
    if (finding.finding_kind === "EXAM" && finding.oral_site) {
      observations[finding.oral_site] = { description: finding.description || "" };
    } else if (finding.finding_kind === "SYMPTOM" && finding.symptom_code === "PAIN") {
      const match = String(finding.description || "").match(/^Pain score (\d+)\/10(?:\. Location: ([^.]+))?(?:\. (.*))?$/);
      pain = {
        has_pain: true,
        severity: match ? Number(match[1]) : "",
        location: match?.[2] || "",
        duration_days: finding.duration_days ?? "",
        notes: match?.[3] || "",
      };
    } else if (finding.finding_kind === "SYMPTOM" && finding.symptom_code) {
      symptoms[finding.symptom_code] = { duration_days: finding.duration_days ?? "" };
    }
  });
  return {
    chiefComplaint: screening.chief_complaint || "",
    symptoms,
    observations,
    pain,
    notes: screening.notes || "",
  };
}

// Step 3: what the Health Worker hears and sees. Observations only, no diagnosis.
export default function ScreeningFormStep({ patient, options, screening, onBack, onCreated, onUpdated }) {
  const { t, tm, language } = useLanguage();
  const requestedInfoUpdate = screening?.case_state === "SCREENED"
    && screening.medical_officer_decision === "REQUEST_MORE_INFO";
  const initial = initialValues(screening);
  const [chiefComplaint, setChiefComplaint] = useState(initial.chiefComplaint);
  const [symptoms, setSymptoms] = useState(initial.symptoms);        // { CODE: { duration_days } }
  const [exposures, setExposures] = useState({});      // { CODE: { is_current, duration_years, frequency_per_day } }
  const [conditions, setConditions] = useState("");
  const [observations, setObservations] = useState(initial.observations); // { SITE: { description } }
  const [pain, setPain] = useState(initial.pain);
  const [notes, setNotes] = useState(initial.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Tick / untick an item of a checklist
  const toggle = (setter, code, empty) => setter((current) => {
    const next = { ...current };
    if (next[code]) delete next[code];
    else next[code] = empty;
    return next;
  });
  const change = (setter, code, field, value) => setter((current) => ({ ...current, [code]: { ...current[code], [field]: value } }));

  const validate = () => {
    if (!chiefComplaint.trim()) return t("screening.chiefComplaintMissing");
    if (Object.values(observations).some((item) => !item.description?.trim())) return t("screening.observationMissing");
    if (pain.has_pain && pain.severity === "") return t("screening.painScoreMissing");
    const invalidDuration = Object.values(exposures).some((item) => {
      if (item.duration_years === "") return false;
      const years = Number(item.duration_years);
      return !Number.isFinite(years) || years < 0 || years > 120 || !Number.isInteger(years * 2);
    });
    if (invalidDuration) return t("screening.durationYearsInvalid");
    return "";
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;

    const exposureList = Object.entries(exposures).map(([code, item]) => ({ code, ...item }));
    const tobaccoCodes = new Set(options.exposures.filter((item) => item.category === "TOBACCO").map((item) => item.code));
    const payload = {
      patient_id: patient.id,
      chief_complaint: chiefComplaint.trim(),
      symptoms: Object.entries(symptoms).map(([code, item]) => ({ code, duration_days: item.duration_days })),
      medical_history: requestedInfoUpdate
        ? { exposures: [], conditions: null }
        : { exposures: exposureList, conditions: conditions.trim() || null },
      tobacco_current: requestedInfoUpdate
        ? screening.tobacco_current === true
        : exposureList.some((item) => tobaccoCodes.has(item.code) && item.is_current),
      oral_observations: Object.entries(observations).map(([site, item]) => ({ site, description: item.description.trim() })),
      pain,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (requestedInfoUpdate) {
        const response = await api.put(`/screenings/${screening.id}/requested-information`, payload);
        await onUpdated(response.data.screening);
      } else {
        const response = await api.post("/screenings", payload);
        await onCreated(response.data.screening);
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="scr-step-title">{t(requestedInfoUpdate ? "screening.requestedInformationTitle" : "screening.formTitle")}</h2>
      <p className="scr-muted">{t("screening.formHint")}</p>
      {requestedInfoUpdate && (
        <Alert type="info">
          <strong>{t("screening.requestNoteLabel")}:</strong> {screening.medical_officer_request_note}
        </Alert>
      )}
      {error && <Alert type="error">{tm(error)}</Alert>}

      <fieldset className="scr-section">
        <legend>{t("screening.chiefComplaint")} *</legend>
        <textarea id="chief-complaint" aria-label={t("screening.chiefComplaint")} rows={3} maxLength={1000}
          value={chiefComplaint} onChange={(event) => setChiefComplaint(event.target.value)}
          placeholder={t("screening.chiefComplaintPlaceholder")} />
      </fieldset>

      <fieldset className="scr-section">
        <legend>{t("screening.patientReportedSymptoms")}</legend>
        <p className="scr-muted">{t("screening.patientReportedSymptomsHint")}</p>
        <div className="scr-check-grid">
          {options.symptoms.map((symptom) => (
            <div key={symptom.code} className={`scr-check ${symptoms[symptom.code] ? "checked" : ""}`}>
              <label>
                <input type="checkbox" checked={Boolean(symptoms[symptom.code])}
                  onChange={() => toggle(setSymptoms, symptom.code, { duration_days: "" })} />
                {getLocalizedMasterName(symptom, language)}
              </label>
              {symptoms[symptom.code] && (
                <input type="number" min="0" max="3650" className="scr-small-input"
                  aria-label={t("screening.daysFor", { name: getLocalizedMasterName(symptom, language) })}
                  placeholder={t("screening.days")} value={symptoms[symptom.code].duration_days}
                  onChange={(event) => change(setSymptoms, symptom.code, "duration_days", event.target.value)} />
              )}
            </div>
          ))}
        </div>
      </fieldset>

      {requestedInfoUpdate ? (
        <Alert type="info">{t("screening.patientHistoryUnchanged")}</Alert>
      ) : (
        <fieldset className="scr-section">
          <legend>{t("screening.medicalHistory")}</legend>
          <p className="scr-muted">{t("screening.habitsHint")}</p>
          <div className="scr-check-grid">
            {options.exposures.map((exposure) => (
            <div key={exposure.code} className={`scr-check ${exposures[exposure.code] ? "checked" : ""}`}>
              <label>
                <input type="checkbox" checked={Boolean(exposures[exposure.code])}
                  onChange={() => toggle(setExposures, exposure.code, { is_current: true, duration_years: "", frequency_per_day: "" })} />
                {getLocalizedMasterName(exposure, language)}
              </label>
              {exposures[exposure.code] && (
                <div className="scr-inline">
                  <label className="scr-inline-check">
                    <input type="checkbox" checked={exposures[exposure.code].is_current}
                      onChange={(event) => change(setExposures, exposure.code, "is_current", event.target.checked)} />
                    {t("screening.current")}
                  </label>
                  <input type="number" min="0" max="120" step="0.5" className="scr-small-input"
                    aria-label={t("screening.yearsFor", { name: getLocalizedMasterName(exposure, language) })}
                    placeholder={t("screening.years")} value={exposures[exposure.code].duration_years}
                    onChange={(event) => change(setExposures, exposure.code, "duration_years", event.target.value)} />
                  <input type="number" min="0" max="200" className="scr-small-input"
                    aria-label={t("screening.perDayFor", { name: getLocalizedMasterName(exposure, language) })}
                    placeholder={t("screening.perDay")} value={exposures[exposure.code].frequency_per_day}
                    onChange={(event) => change(setExposures, exposure.code, "frequency_per_day", event.target.value)} />
                </div>
              )}
            </div>
            ))}
          </div>
          <label className="scr-label" htmlFor="conditions">{t("screening.otherHistory")}</label>
          <textarea id="conditions" rows={2} maxLength={1000} value={conditions}
            onChange={(event) => setConditions(event.target.value)} placeholder={t("screening.otherHistoryPlaceholder")} />
        </fieldset>
      )}

      <fieldset className="scr-section">
        <legend>{t("screening.oralObservations")}</legend>
        <p className="scr-muted">{t("screening.oralObservationsHint")}</p>
        <div className="scr-check-grid">
          {options.oral_sites.map((site) => (
            <div key={site} className={`scr-check ${observations[site] ? "checked" : ""}`}>
              <label>
                <input type="checkbox" checked={Boolean(observations[site])}
                  onChange={() => toggle(setObservations, site, { description: "" })} />
                {getCodeLabel("oralViews", site, language)}
              </label>
              {observations[site] && (
                <textarea rows={2} maxLength={500}
                  aria-label={t("screening.observationFor", { name: getCodeLabel("oralViews", site, language) })}
                  placeholder={t("screening.observationPlaceholder")} value={observations[site].description}
                  onChange={(event) => change(setObservations, site, "description", event.target.value)} />
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="scr-section">
        <legend>{t("screening.pain")}</legend>
        <div className="scr-choice" role="radiogroup" aria-label={t("screening.pain")}>
          {[true, false].map((value) => (
            <label key={String(value)} className={pain.has_pain === value ? "selected" : ""}>
              <input type="radio" name="has-pain" checked={pain.has_pain === value}
                onChange={() => setPain(value ? { ...pain, has_pain: true } : EMPTY_PAIN)} />
              {t(value ? "screening.painYes" : "screening.painNo")}
            </label>
          ))}
        </div>
        {pain.has_pain && (
          <div className="scr-form-grid">
            <label className="scr-label">{t("screening.painScore")} *
              <input type="range" min="0" max="10" value={pain.severity === "" ? 0 : pain.severity}
                onChange={(event) => setPain({ ...pain, severity: Number(event.target.value) })} />
              <span className="scr-score">{pain.severity === "" ? t("screening.painScoreChoose") : `${pain.severity} / 10`}</span>
            </label>
            <label className="scr-label">{t("screening.painLocation")}
              <input value={pain.location} maxLength={300} onChange={(event) => setPain({ ...pain, location: event.target.value })} />
            </label>
            <label className="scr-label">{t("screening.painDuration")}
              <input type="number" min="0" max="3650" value={pain.duration_days}
                onChange={(event) => setPain({ ...pain, duration_days: event.target.value })} />
            </label>
            <label className="scr-label">{t("screening.painNotes")}
              <input value={pain.notes} maxLength={500} onChange={(event) => setPain({ ...pain, notes: event.target.value })} />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="scr-section">
        <legend>{t("screening.notes")}</legend>
        <textarea id="screening-notes" aria-label={t("screening.notes")} rows={3} maxLength={2000}
          value={notes} onChange={(event) => setNotes(event.target.value)} />
      </fieldset>

      <div className="scr-nav">
        <Button type="button" variant="secondary" onClick={onBack}>{t("screening.back")}</Button>
        <Button type="submit" loading={saving}>
          {t(requestedInfoUpdate ? "screening.updateAndResubmit" : "screening.saveAndContinue")}
        </Button>
      </div>
    </form>
  );
}
