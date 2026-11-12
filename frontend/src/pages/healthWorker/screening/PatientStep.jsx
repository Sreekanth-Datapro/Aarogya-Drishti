import React, { useState } from "react";
import { Search, UserRound } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { getCaseStateLabel, getLocalizedField, getSexLabel, formatLocalizedNumber } from "../../../i18n/displayLabels";
import { Badge, EmptyState } from "../../../components/ui";

const OPEN_STATES = ["CONSENTED", "SCREENED"];
const ACTIVE_SCREENING_STATES = ["DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN"];

// Step 1: the Health Worker picks one of the patients they registered
export default function PatientStep({ patients, onChoose }) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const words = search.trim().toLowerCase();
  const shown = patients.filter((patient) => !words
    || patient.full_name.toLowerCase().includes(words)
    || patient.patient_code.toLowerCase().includes(words));

  return (
    <div>
      <h2 className="scr-step-title">{t("screening.choosePatient")}</h2>
      <p className="scr-muted">{t("screening.choosePatientHint")}</p>
      <label className="scr-search">
        <Search size={16} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("screening.searchPatient")}
          aria-label={t("screening.searchPatient")}
        />
      </label>

      {!patients.length ? <EmptyState icon={UserRound} title={t("screening.noPatients")} /> : (
        <ul className="scr-patient-list">
          {shown.map((patient) => {
            const open = patient.screening_id && OPEN_STATES.includes(patient.case_state);
            const awaitingReview = patient.case_state === "AWAITING_CLINICIAN";
            const recaptureRequested = patient.case_state === "SCREENED"
              && patient.medical_officer_decision === "REQUEST_RECAPTURE";
            const moreInfoRequested = patient.case_state === "SCREENED"
              && patient.medical_officer_decision === "REQUEST_MORE_INFO";
            const activeButNotEditable = ACTIVE_SCREENING_STATES.includes(patient.case_state)
              && !open && !moreInfoRequested;
            return (
              <li key={patient.id}>
                <button
                  type="button"
                  className="scr-patient"
                  onClick={() => onChoose(patient)}
                  disabled={Boolean(activeButNotEditable)}
                >
                  <span className="scr-patient-main">
                    <strong>{patient.full_name}</strong>
                    <small>
                      <span className="mono">{patient.patient_code}</span>
                      {" · "}{patient.age_years == null ? "-" : formatLocalizedNumber(patient.age_years, language)}
                      {" · "}{patient.sex ? getSexLabel(patient.sex, language) : "-"}
                      {" · "}{getLocalizedField(patient, "village_name", language)}
                    </small>
                  </span>
                  <span className="scr-patient-badges">
                    <Badge tone={patient.screening_consent ? "success" : "neutral"}>
                      {t(patient.screening_consent ? "screening.screeningConsentGiven" : "screening.screeningConsentMissing")}
                    </Badge>
                    {patient.case_state && (
                      <Badge tone={open || awaitingReview || moreInfoRequested ? "warning" : "info"}>
                        {recaptureRequested
                          ? t("screening.recaptureRequired")
                          : moreInfoRequested
                          ? t("screening.moreInformationRequired")
                          : awaitingReview
                          ? t("screening.awaitingMedicalOfficerReview")
                          : getCaseStateLabel(patient.case_state, language)}
                      </Badge>
                    )}
                    {(recaptureRequested || moreInfoRequested) && patient.medical_officer_request_note && (
                      <small className="scr-muted">{patient.medical_officer_request_note}</small>
                    )}
                    <span className="scr-patient-action">
                      {recaptureRequested
                        ? t("screening.continueRecapture")
                        : moreInfoRequested
                        ? t("screening.updateRequestedInformation")
                        : awaitingReview
                        ? t("screening.awaitingMedicalOfficerReview")
                        : activeButNotEditable
                          ? t("screening.inProgress")
                          : t(open ? "screening.continue" : "screening.start")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="scr-muted">{t("screening.noMatch")}</li>}
        </ul>
      )}
    </div>
  );
}
