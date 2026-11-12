import React, { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import api from "../../../services/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import {
  formatLocalizedDateTime,
  getCaseStateLabel,
  getCodeLabel,
  getLocalizedField,
} from "../../../i18n/displayLabels";
import { apiMessage } from "../../../i18n/translate";
import { Alert, Badge, Button } from "../../../components/ui";

// Step 5: check everything, then send the case to the Medical Officer queue
export default function ReviewStep({ screening, photoConsent, onBack, onSubmitted, onFinish }) {
  const { t, tm, language } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitted = screening.case_state === "AWAITING_CLINICIAN";
  const symptoms = screening.findings.filter((item) => item.finding_kind === "SYMPTOM");
  const exam = screening.findings.filter((item) => item.finding_kind === "EXAM");

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const response = await api.post(`/screenings/${screening.id}/submit`);
      onSubmitted(response.data.screening);
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.submitFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="scr-done" role="status">
        <CheckCircle2 size={44} />
        <h2>{t("screening.submittedTitle")}</h2>
        <p>{t("screening.submittedText", { code: screening.patient_code })}</p>
        {screening.submitted_at && <small>{formatLocalizedDateTime(screening.submitted_at, language)}</small>}
        <Button type="button" onClick={onFinish}>{t("screening.screenAnother")}</Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="scr-step-title">{t("screening.reviewTitle")}</h2>
      <p className="scr-muted">{t("screening.reviewHint")}</p>
      {error && <Alert type="error">{tm(error)}</Alert>}

      <dl className="scr-summary">
        <div><dt>{t("screening.patient")}</dt><dd>{screening.full_name} · <span className="mono">{screening.patient_code}</span></dd></div>
        <div><dt>{t("screening.status")}</dt><dd><Badge tone="warning">{getCaseStateLabel(screening.case_state, language)}</Badge></dd></div>
        <div><dt>{t("screening.chiefComplaint")}</dt><dd>{screening.chief_complaint}</dd></div>
        <div>
          <dt>{t("screening.symptoms")}</dt>
          <dd>{symptoms.length
            ? symptoms.map((item, index) => (
              <span key={index} className="scr-tag">
                {getLocalizedField(item, "symptom_name", language) || item.description}
                {item.duration_days != null ? ` · ${t("screening.daysValue", { count: item.duration_days })}` : ""}
              </span>
            ))
            : t("screening.none")}</dd>
        </div>
        <div>
          <dt>{t("screening.oralObservations")}</dt>
          <dd>{exam.length
            ? exam.map((item, index) => <p key={index}><strong>{getCodeLabel("oralViews", item.oral_site, language)}:</strong> {item.description}</p>)
            : t("screening.none")}</dd>
        </div>
        <div><dt>{t("screening.notes")}</dt><dd>{screening.notes || t("screening.none")}</dd></div>
        <div>
          <dt>{t("screening.stepPhotos")}</dt>
          <dd>{photoConsent
            ? t("screening.photoCount", { count: screening.photos.length })
            : t("screening.photosNotTaken")}</dd>
        </div>
      </dl>

      <Alert type="info">{t("screening.submitNote")}</Alert>

      <div className="scr-nav">
        <Button type="button" variant="secondary" onClick={onBack}>{t("screening.back")}</Button>
        <Button type="button" onClick={submit} loading={saving}><Send size={16} /> {t("screening.submit")}</Button>
      </div>
    </div>
  );
}
