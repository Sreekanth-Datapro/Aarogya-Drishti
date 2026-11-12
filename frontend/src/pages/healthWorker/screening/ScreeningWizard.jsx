import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, HeartPulse, ShieldAlert } from "lucide-react";
import api from "../../../services/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import { apiMessage } from "../../../i18n/translate";
import { Alert, PageLoader } from "../../../components/ui";
import PatientStep from "./PatientStep";
import ConsentStep from "./ConsentStep";
import ScreeningFormStep from "./ScreeningFormStep";
import PhotoStep from "./PhotoStep";
import ReviewStep from "./ReviewStep";
import "./Screening.css";

const STEP_KEYS = [
  "screening.stepPatient",
  "screening.stepConsent",
  "screening.stepScreening",
  "screening.stepPhotos",
  "screening.stepReview",
];
const OPEN_STATES = ["CONSENTED", "SCREENED"];
const ACTIVE_SCREENING_STATES = ["DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN"];

// Step-by-step oral screening for a Health Worker:
// 1 choose patient, 2 consent, 3 screening details, 4 photos, 5 review and submit.
// Every rule (consent, ownership, photo checks) is enforced again by the server.
export default function ScreeningWizard() {
  const { t, tm } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [options, setOptions] = useState(null);
  const [patients, setPatients] = useState([]);
  const [patient, setPatient] = useState(null);
  const [consents, setConsents] = useState({ SCREENING: null, IMAGE_CAPTURE: null, TELECONSULT: null });
  const [screening, setScreening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPatients = useCallback(async () => {
    const response = await api.get("/screenings/patients");
    setPatients(response.data.patients || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get("/screenings/options");
        setOptions(response.data.options);
        await loadPatients();
      } catch (requestError) {
        setError(apiMessage(requestError, "screening.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPatients]);

  const loadConsents = async (patientId) => {
    const response = await api.get(`/screenings/patients/${patientId}/consents`);
    setConsents(response.data.consents);
  };

  const loadScreening = async (screeningId) => {
    const response = await api.get(`/screenings/${screeningId}`);
    const current = response.data.screening;
    setScreening(current);
    setConsents(current.consents);
    setPatients((items) => items.map((item) => item.id === current.patient_id
      ? { ...item, screening_id: current.id, case_state: current.case_state, screening_date: current.screening_date }
      : item));
    setPatient((item) => item?.id === current.patient_id
      ? { ...item, screening_id: current.id, case_state: current.case_state, screening_date: current.screening_date }
      : item);
    return current;
  };

  const requestedPatientId = searchParams.get("patientId");

  // Choosing a patient: continue an unfinished screening, otherwise start with consent
  const choosePatient = async (item) => {
    setError("");
    try {
      setPatient(item);
      setScreening(null);
      if (item.screening_id && OPEN_STATES.includes(item.case_state)) {
        const current = await loadScreening(item.screening_id);
        setStep(current.case_state === "SCREENED" && current.medical_officer_decision === "REQUEST_MORE_INFO"
          ? 2
          : OPEN_STATES.includes(current.case_state) ? 3 : 0);
      } else if (ACTIVE_SCREENING_STATES.includes(item.case_state)) {
        setStep(0);
      } else {
        await loadConsents(item.id);
        setStep(1);
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.loadFailed"));
    }
  };

  useEffect(() => {
    if (loading || !requestedPatientId) return;
    let active = true;
    (async () => {
      try {
        const registeredPatient = patients.find((item) => item.id === requestedPatientId);
        const patient = registeredPatient || (await api.get(`/patients/${encodeURIComponent(requestedPatientId)}`)).data.patient;
        if (!active) return;
        setPatient(patient);
        if (registeredPatient?.screening_id
            && registeredPatient.case_state === "SCREENED"
            && registeredPatient.medical_officer_decision === "REQUEST_MORE_INFO") {
          const current = await api.get(`/screenings/${registeredPatient.screening_id}`);
          if (!active) return;
          setScreening(current.data.screening);
          setConsents(current.data.screening.consents);
          setStep(2);
        } else if (registeredPatient?.screening_id && OPEN_STATES.includes(registeredPatient.case_state)) {
          const current = await api.get(`/screenings/${registeredPatient.screening_id}`);
          if (!active) return;
          setScreening(current.data.screening);
          setConsents(current.data.screening.consents);
          setStep(OPEN_STATES.includes(current.data.screening.case_state) ? 3 : 0);
        } else if (registeredPatient && ACTIVE_SCREENING_STATES.includes(registeredPatient.case_state)) {
          setScreening(null);
          setStep(0);
        } else {
          setScreening(null);
          const response = await api.get(`/screenings/patients/${requestedPatientId}/consents`);
          if (!active) return;
          setConsents(response.data.consents);
          setStep(1);
        }
      } catch (requestError) {
        if (active) setError(apiMessage(requestError, "screening.loadFailed"));
      } finally {
        if (active) setSearchParams({}, { replace: true });
      }
    })();
    return () => { active = false; };
  }, [loading, patients, requestedPatientId, setSearchParams]);

  const startOver = async () => {
    setPatient(null);
    setScreening(null);
    setStep(0);
    try {
      await loadPatients();
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.loadFailed"));
    }
  };

  if (loading) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="scr-page">
      <header className="scr-hero">
        <div>
          <span className="scr-eyebrow"><HeartPulse size={15} /> {t("screening.eyebrow")}</span>
          <h1>{t("modules.screening.title")}</h1>
          <p>{t("screening.subtitle")}</p>
        </div>
        {patient && (
          <div className="scr-hero-patient">
            <span>{t("screening.patient")}</span>
            <strong>{patient.full_name}</strong>
            <small className="mono">{patient.patient_code}</small>
          </div>
        )}
      </header>

      <Alert type="warning">
        <ShieldAlert size={16} /> {t("screening.safetyNote")}
      </Alert>
      {error && <Alert type="error">{tm(error)}</Alert>}

      <ol className="scr-steps" aria-label={t("screening.stepsLabel")}>
        {STEP_KEYS.map((key, index) => (
          <li key={key} className={index === step ? "active" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined}>
            <span className="scr-step-number">{index + 1}</span>
            <span className="scr-step-label">{t(key)}</span>
          </li>
        ))}
      </ol>

      <section className="scr-card">
        {step === 0 && <PatientStep patients={patients} onChoose={choosePatient} />}
        {step === 1 && patient && (
          <ConsentStep
            patient={patient}
            consents={consents}
            purposes={options?.consent_purposes || []}
            languages={options?.languages || []}
            onSaved={() => loadConsents(patient.id)}
            onBack={startOver}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && patient && (
          <ScreeningFormStep
            patient={patient}
            options={options}
            screening={screening}
            onBack={() => setStep(1)}
            onCreated={async (created) => {
              await loadScreening(created.id);
              setStep(3);
            }}
            onUpdated={async (updated) => {
              setScreening((current) => ({ ...current, ...updated }));
              setPatient((current) => ({
                ...current,
                case_state: updated.case_state,
                screening_id: updated.id,
                medical_officer_decision: "REQUEST_MORE_INFO",
              }));
              setStep(4);
              loadPatients().catch((requestError) => setError(apiMessage(requestError, "screening.loadFailed")));
            }}
          />
        )}
        {step === 3 && screening && (
          <PhotoStep
            screening={screening}
            maxBytes={options?.max_photo_bytes}
            photoConsent={consents.IMAGE_CAPTURE?.granted === true}
            onChanged={() => loadScreening(screening.id)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && screening && (
          <ReviewStep
            screening={screening}
            options={options}
            photoConsent={consents.IMAGE_CAPTURE?.granted === true}
            onBack={() => setStep(3)}
            onSubmitted={(submitted) => setScreening((current) => ({ ...current, ...submitted }))}
            onFinish={startOver}
          />
        )}
      </section>

      <p className="scr-footnote"><ClipboardList size={14} /> {t("screening.footnote")}</p>
    </div>
  );
}
