import React, { useState } from "react";
import { Camera, ClipboardCheck, Video } from "lucide-react";
import api from "../../../services/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import { formatLocalizedDateTime, getLocalizedMasterName } from "../../../i18n/displayLabels";
import { apiMessage } from "../../../i18n/translate";
import { Alert, Badge, Button, SelectField, TextField } from "../../../components/ui";

const METHOD_KEYS = {
  CHECKBOX: "patientRegistration.methodCheckbox",
  VERBAL_WITNESSED: "patientRegistration.methodVerbal",
  SIGNATURE: "patientRegistration.methodSignature",
  THUMBPRINT: "patientRegistration.methodThumbprint",
};
const WITNESS_METHODS = ["VERBAL_WITNESSED", "THUMBPRINT"];
const LANGUAGE_KEYS = { te: "patientRegistration.languageTelugu", en: "patientRegistration.languageEnglish" };
const PURPOSE_ICONS = { SCREENING: ClipboardCheck, IMAGE_CAPTURE: Camera, TELECONSULT: Video };

// Step 2: screening consent and photograph consent, recorded separately.
// Each answer is a new consent record with date and time (older answers are kept).
export default function ConsentStep({ patient, consents, purposes, languages, onSaved, onBack, onNext }) {
  const { t, tm, language } = useLanguage();
  const telugu = languages.find((item) => item.code === "te");
  const [method, setMethod] = useState("CHECKBOX");
  const [witness, setWitness] = useState("");
  const [languageId, setLanguageId] = useState(String(patient.preferred_language_id || telugu?.id || ""));
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const needsWitness = WITNESS_METHODS.includes(method);

  const record = async (purpose, granted) => {
    setError("");
    if (!languageId) {
      setError(t("screening.languageMissing"));
      return;
    }
    if (needsWitness && !witness.trim()) {
      setError(t("patientRegistration.witnessMissing"));
      return;
    }
    setSaving(`${purpose}-${granted}`);
    try {
      await api.post(`/screenings/patients/${patient.id}/consents`, {
        purpose,
        granted,
        method,
        witness_name: needsWitness ? witness.trim() : null,
        language_id: Number(languageId),
      });
      await onSaved();
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.consentFailed"));
    } finally {
      setSaving("");
    }
  };

  const statusBadge = (consent, purpose) => {
    if (purpose === "TELECONSULT") {
      if (!consent) return <Badge tone="neutral">{t("screening.teleconsultNotGiven")}</Badge>;
      if (consent.granted) return <Badge tone="success">{t("screening.teleconsultActive")}</Badge>;
      return consent.previously_granted
        ? <Badge tone="danger">{t("screening.teleconsultWithdrawn")}</Badge>
        : <Badge tone="danger">{t("screening.teleconsultDeclined")}</Badge>;
    }
    if (!consent) return <Badge tone="neutral">{t("screening.consentNotRecorded")}</Badge>;
    return <Badge tone={consent.granted ? "success" : "danger"}>{t(consent.granted ? "screening.consentAgreed" : "screening.consentRefused")}</Badge>;
  };

  return (
    <div>
      <h2 className="scr-step-title">{t("screening.consentTitle")}</h2>
      <p className="scr-muted">{t("screening.consentHint")}</p>
      {error && <Alert type="error">{tm(error)}</Alert>}

      <div className="scr-form-grid">
        <SelectField id="consent-language" label={t("screening.consentLanguage")} value={languageId}
          onChange={(event) => setLanguageId(event.target.value)} required>
          <option value="">{t("patientRegistration.selectLanguage")}</option>
          {languages.map((item) => (
            <option key={item.id} value={String(item.id)}>{LANGUAGE_KEYS[item.code] ? t(LANGUAGE_KEYS[item.code]) : item.native_name}</option>
          ))}
        </SelectField>
        <SelectField id="consent-method" label={t("patientRegistration.consentMethod")} value={method}
          onChange={(event) => setMethod(event.target.value)} required>
          {Object.entries(METHOD_KEYS).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
        </SelectField>
        {needsWitness && (
          <TextField id="consent-witness" label={t("patientRegistration.witnessName")} value={witness}
            onChange={(event) => setWitness(event.target.value)} maxLength={150} required
            hint={t("patientRegistration.witnessHint")} />
        )}
      </div>

      <div className="scr-consent-grid">
        {purposes.map((purpose) => {
          const Icon = PURPOSE_ICONS[purpose.code] || ClipboardCheck;
          const consent = consents[purpose.code];
          return (
            <article key={purpose.code} className={`scr-consent-card ${consent?.granted ? "granted" : ""}`}>
              <header>
                <span className="scr-icon"><Icon size={18} /></span>
                <h3>{getLocalizedMasterName(purpose, language)}</h3>
                {statusBadge(consent, purpose.code)}
              </header>
              <p>{getLocalizedMasterName({ name_en: purpose.text_en, name_te: purpose.text_te }, language)}</p>
              {purpose.code === "TELECONSULT" && (
                <p className="scr-muted">{t("screening.teleconsultPurposeHint")}</p>
              )}
              {consent && (
                <small className="scr-muted">
                  {t("screening.recordedAt", { date: formatLocalizedDateTime(consent.captured_at, language) })}
                </small>
              )}
              <div className="scr-actions">
                <Button type="button" size="sm" loading={saving === `${purpose.code}-true`} onClick={() => record(purpose.code, true)}>
                  {t("screening.patientAgrees")}
                </Button>
                <Button type="button" size="sm" variant="secondary" loading={saving === `${purpose.code}-false`} onClick={() => record(purpose.code, false)}>
                  {t("screening.patientRefuses")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {consents.SCREENING?.granted !== true && <Alert type="info">{t("screening.needScreeningConsent")}</Alert>}
      {consents.SCREENING?.granted === true && consents.IMAGE_CAPTURE?.granted !== true && (
        <Alert type="info">{t("screening.noPhotoConsentNote")}</Alert>
      )}

      <div className="scr-nav">
        <Button type="button" variant="secondary" onClick={onBack}>{t("screening.back")}</Button>
        <Button type="button" onClick={onNext} disabled={consents.SCREENING?.granted !== true}>{t("screening.next")}</Button>
      </div>
    </div>
  );
}
