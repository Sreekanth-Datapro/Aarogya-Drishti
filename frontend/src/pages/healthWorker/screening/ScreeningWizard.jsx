import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const selectionRequestId = useRef(0);
  const selectedPatientId = useRef(null);
  const patientsRef = useRef(patients);

  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);

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

  const loadConsents = useCallback(async (patientId, requestId = selectionRequestId.current) => {
    const response = await api.get(`/screenings/patients/${patientId}/consents`);
    if (requestId !== selectionRequestId.current || selectedPatientId.current !== patientId) return null;
    setConsents(response.data.consents);
    return response.data.consents;
  }, []);

  const loadScreening = useCallback(async (screeningId, patientId, requestId = selectionRequestId.current) => {
    const response = await api.get(`/screenings/${screeningId}`);
    const current = response.data.screening;
    if (requestId !== selectionRequestId.current || selectedPatientId.current !== patientId) return null;
    if (!current || current.patient_id !== patientId || current.id !== screeningId) {
      setScreening(null);
      setError("screening.loadFailed");
      return null;
    }
    setScreening(current);
    setConsents(current.consents);
    setPatients((items) => items.map((item) => item.id === current.patient_id
      ? { ...item, screening_id: current.id, case_state: current.case_state, screening_date: current.screening_date }
      : item));
    setPatient((item) => item?.id === current.patient_id
      ? { ...item, screening_id: current.id, case_state: current.case_state, screening_date: current.screening_date }
      : item);
    return current;
  }, []);

  const requestedPatientId = searchParams.get("patientId");

  // Choosing a patient: continue an unfinished screening, otherwise start with consent
  const choosePatient = async (item) => {
    const requestId = selectionRequestId.current + 1;
    selectionRequestId.current = requestId;
    selectedPatientId.current = item.id;
    setError("");
    setStep(0);
    setConsents({ SCREENING: null, IMAGE_CAPTURE: null, TELECONSULT: null });
    setPatient(item);
    setScreening(null);
    try {
      if (item.screening_id && OPEN_STATES.includes(item.case_state)) {
        const current = await loadScreening(item.screening_id, item.id, requestId);
        if (!current) return;
        setStep(current.case_state === "SCREENED" && current.medical_officer_decision === "REQUEST_MORE_INFO"
          ? 2
          : OPEN_STATES.includes(current.case_state) ? 3 : 0);
      } else if (ACTIVE_SCREENING_STATES.includes(item.case_state)) {
        setStep(0);
      } else {
        const currentConsents = await loadConsents(item.id, requestId);
        if (!currentConsents) return;
        setStep(1);
      }
    } catch (requestError) {
      if (requestId === selectionRequestId.current) {
        setError(apiMessage(requestError, "screening.loadFailed"));
      }
    }
  };

  useEffect(() => {
    if (loading || !requestedPatientId) return;
    const requestId = selectionRequestId.current + 1;
    selectionRequestId.current = requestId;
    selectedPatientId.current = requestedPatientId;
    let active = true;
    (async () => {
      try {
        const registeredPatient = patientsRef.current.find((item) => item.id === requestedPatientId);
        const selected = registeredPatient || (await api.get(`/patients/${encodeURIComponent(requestedPatientId)}`)).data.patient;
        if (!active || requestId !== selectionRequestId.current) return;
        if (!selected || selected.id !== requestedPatientId) {
          setError("screening.loadFailed");
          return;
        }
        setPatient(selected);
        setScreening(null);
        if (registeredPatient?.screening_id
            && registeredPatient.case_state === "SCREENED"
            && registeredPatient.medical_officer_decision === "REQUEST_MORE_INFO") {
          const current = await loadScreening(registeredPatient.screening_id, requestedPatientId, requestId);
          if (!active || !current) return;
          setStep(2);
        } else if (registeredPatient?.screening_id && OPEN_STATES.includes(registeredPatient.case_state)) {
          const current = await loadScreening(registeredPatient.screening_id, requestedPatientId, requestId);
          if (!active || !current) return;
          setStep(OPEN_STATES.includes(current.case_state) ? 3 : 0);
        } else if (registeredPatient && ACTIVE_SCREENING_STATES.includes(registeredPatient.case_state)) {
          setStep(0);
        } else {
          const currentConsents = await loadConsents(requestedPatientId, requestId);
          if (!active || !currentConsents) return;
          setStep(1);
        }
      } catch (requestError) {
        if (active && requestId === selectionRequestId.current) {
          setError(apiMessage(requestError, "screening.loadFailed"));
        }
      } finally {
        if (active && requestId === selectionRequestId.current) setSearchParams({}, { replace: true });
      }
    })();
    return () => {
      active = false;
      if (selectionRequestId.current === requestId) selectionRequestId.current += 1;
    };
  }, [loadConsents, loadScreening, loading, requestedPatientId, setSearchParams]);

  const startOver = async () => {
    selectionRequestId.current += 1;
    selectedPatientId.current = null;
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
  const selectedScreening = screening?.patient_id === patient?.id ? screening : null;
  const activeSelectionRequestId = selectionRequestId.current;

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
            onSaved={() => loadConsents(patient.id, selectionRequestId.current)}
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
              const current = await loadScreening(created.id, patient.id, activeSelectionRequestId);
              if (!current) return;
              setStep(3);
            }}
            onUpdated={async (updated) => {
              if (selectionRequestId.current !== activeSelectionRequestId
                  || selectedPatientId.current !== patient.id) return;
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
        {step === 3 && selectedScreening && (
          <PhotoStep
            key={selectedScreening.id}
            screening={selectedScreening}
            maxBytes={options?.max_photo_bytes}
            photoConsent={consents.IMAGE_CAPTURE?.granted === true}
            onChanged={() => loadScreening(selectedScreening.id, patient.id, activeSelectionRequestId)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && selectedScreening && (
          <ReviewStep
            screening={selectedScreening}
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
