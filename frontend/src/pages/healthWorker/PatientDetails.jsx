import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ClipboardList, HeartPulse, MapPin, ShieldCheck, UserRound } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getCaseStateLabel,
  getLocalizedField,
  getSexLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Card, EmptyState, PageLoader } from "../../components/ui";
import MandatoryTrackingFields from "../tracking/MandatoryTrackingFields";
import "../tracking/Tracking.css";
import "./PatientExplorer.css";

const ACTIVE_SCREENING_STATES = ["DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN"];
const EDITABLE_SCREENING_STATES = ["CONSENTED", "SCREENED"];

function Field({ label, value }) {
  return (
    <div className="patient-details-field">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function displayCode(value) {
  return value ? value.replace(/_/g, " ") : "—";
}

const AI_STATUS_KEYS = {
  COMPLETED: "patientExplorer.aiCompleted",
  PARTIAL: "patientExplorer.aiPartial",
  UNAVAILABLE: "patientExplorer.aiUnavailable",
  PENDING: "patientExplorer.aiPending",
};

export default function PatientDetails() {
  const { patientId } = useParams();
  const { t, tm, language } = useLanguage();
  const [details, setDetails] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/patients/${encodeURIComponent(patientId)}`),
      api.get(`/tracking/patients/${encodeURIComponent(patientId)}/journey`).catch(() => null),
    ])
      .then(([response, journeyResponse]) => {
        if (!active) return;
        setDetails(response.data);
        setTracking(journeyResponse?.data?.journey || null);
      })
      .catch((requestError) => {
        if (active) setError(apiMessage(requestError, "patientExplorer.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [patientId]);

  if (loading) return <PageLoader label={t("common.loading")} />;

  if (error || !details?.patient) {
    return (
      <div className="patient-explorer-page">
        <Link className="patient-explorer-back" to="/health-worker/patient-search">
          <ArrowLeft size={16} /> {t("patientExplorer.backToSearch")}
        </Link>
        <Alert type="error">{error ? tm(error) : t("patientExplorer.notFound")}</Alert>
      </div>
    );
  }

  const patient = details.patient;
  const screeningLink = `/health-worker/screening?patientId=${encodeURIComponent(patient.id)}`;
  const activeScreening = details.screenings.find((screening) =>
    ACTIVE_SCREENING_STATES.includes(screening.case_state)
  );
  const hasScreeningConsent = details.consents.some((consent) =>
    consent.purpose === "SCREENING" && consent.granted === true
  );
  const isRecaptureRequested = (screening) =>
    hasScreeningConsent
    && Boolean(screening?.reviewed_at)
    && screening.case_state === "SCREENED"
    && screening.medical_officer_decision === "REQUEST_RECAPTURE";
  const isMoreInfoRequested = (screening) =>
    hasScreeningConsent
    && Boolean(screening?.reviewed_at)
    && screening.case_state === "SCREENED"
    && screening.medical_officer_decision === "REQUEST_MORE_INFO";
  const awaitingReview = activeScreening?.case_state === "AWAITING_CLINICIAN";
  const screeningIsReadOnly = activeScreening
    && !EDITABLE_SCREENING_STATES.includes(activeScreening.case_state);

  return (
    <div className="patient-explorer-page">
      <header className="patient-explorer-hero">
        <div>
          <Link className="patient-explorer-back" to="/health-worker/patient-search">
            <ArrowLeft size={16} /> {t("patientExplorer.backToSearch")}
          </Link>
          <span className="patient-explorer-eyebrow"><UserRound size={15} /> {patient.patient_code}</span>
          <h1 className="page-title">{patient.full_name}</h1>
          <p className="page-subtitle">{getLocalizedField(patient, "village_name", language)}</p>
        </div>
        {(isRecaptureRequested(activeScreening) || isMoreInfoRequested(activeScreening)) && hasScreeningConsent ? (
          <Link className="btn btn-primary" to={screeningLink}>
            <HeartPulse size={16} /> {t(isMoreInfoRequested(activeScreening)
              ? "patientExplorer.updateRequestedInformation"
              : "patientExplorer.continueRecapture")}
          </Link>
        ) : screeningIsReadOnly ? (
          <button type="button" className="btn btn-primary" disabled>
            <HeartPulse size={16} />
            {awaitingReview
              ? t("screening.awaitingMedicalOfficerReview")
              : t("screening.inProgress")}
          </button>
        ) : (
          <Link className="btn btn-primary" to={screeningLink}>
            <HeartPulse size={16} /> {t("patientExplorer.startScreening")}
          </Link>
        )}
        {details.screenings.length > 0 && (
          <a className="btn btn-secondary" href="#patient-screening-history">
            <ClipboardList size={16} /> {t("patientExplorer.viewPreviousScreening")}
          </a>
        )}
      </header>

      <div className="patient-details-grid">
        {tracking ? (
          <Card>
            <div className="patient-explorer-section-heading">
              <span className="patient-explorer-icon"><Activity size={18} /></span>
              <h2>{t("tracking.mandatory.heading")}</h2>
            </div>
            <MandatoryTrackingFields
              currentStageLabel={tracking.current_stage_label}
              responsibleDisplay={tracking.responsible?.display}
              nextActionLabel={tracking.next_action_label}
              dueAt={tracking.next_action_due_at}
              isOverdue={tracking.is_overdue}
            />
            <div style={{ marginTop: "0.85rem" }}>
              <Link className="tracking-link" to={`/health-worker/tracking/${patient.id}`}>
                {t("tracking.openJourney")}
              </Link>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><UserRound size={18} /></span>
            <h2>{t("patientExplorer.overview")}</h2>
          </div>
          <dl className="patient-details-fields">
            <Field label={t("patientExplorer.patientCode")} value={patient.patient_code} />
            <Field label={t("patientExplorer.patientName")} value={patient.full_name} />
            <Field label={t("patientExplorer.sex")} value={patient.sex ? getSexLabel(patient.sex, language) : null} />
            <Field label={t("patientExplorer.age")} value={patient.age_years == null ? null : t("patientExplorer.ageValue", { age: formatLocalizedNumber(patient.age_years, language) })} />
            <Field label={t("patientExplorer.dateOfBirth")} value={patient.date_of_birth ? formatLocalizedDate(patient.date_of_birth, language) : null} />
            <Field label={t("patientExplorer.registeredOn")} value={formatLocalizedDate(patient.created_at, language)} />
            <Field label={t("patientExplorer.registeredBy")} value={patient.registered_by} />
          </dl>
        </Card>

        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><MapPin size={18} /></span>
            <h2>{t("patientExplorer.locationDetails")}</h2>
          </div>
          <dl className="patient-details-fields">
            <Field label={t("patientExplorer.district")} value={getLocalizedField(patient, "district_name", language)} />
            <Field label={t("patientExplorer.mandal")} value={getLocalizedField(patient, "mandal_name", language)} />
            <Field label={t("patientExplorer.village")} value={getLocalizedField(patient, "village_name", language)} />
            <Field label={t("patientExplorer.facility")} value={getLocalizedField(patient, "facility_name", language)} />
          </dl>
        </Card>

        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><ShieldCheck size={18} /></span>
            <h2>{t("patientExplorer.consents")}</h2>
          </div>
          {details.consents.length ? (
            <div className="patient-explorer-table-wrap">
              <table className="patient-explorer-table">
                <thead>
                  <tr>
                    <th>{t("patientExplorer.purpose")}</th>
                    <th>{t("patientExplorer.status")}</th>
                    <th>{t("patientExplorer.consentDate")}</th>
                    <th>{t("patientExplorer.recorder")}</th>
                  </tr>
                </thead>
                <tbody>
                  {details.consents.map((consent) => (
                    <tr key={consent.purpose}>
                      <td data-label={t("patientExplorer.purpose")}>{displayCode(consent.purpose)}</td>
                      <td data-label={t("patientExplorer.status")}>
                        <Badge tone={consent.granted ? "success" : "neutral"}>
                          {t(consent.granted ? "patientExplorer.granted" : "patientExplorer.declined")}
                        </Badge>
                      </td>
                      <td data-label={t("patientExplorer.consentDate")}>{formatLocalizedDate(consent.captured_at, language)}</td>
                      <td data-label={t("patientExplorer.recorder")}>{consent.recorded_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={t("common.noRecords")} />}
        </Card>

        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><ClipboardList size={18} /></span>
            <h2>{t("patientExplorer.medicalHistory")}</h2>
          </div>
          {details.medical_history.length ? (
            <ul className="patient-record-list">
              {details.medical_history.map((item, index) => (
                <li key={`${item.recorded_at}-${index}`}>
                  <div className="patient-record-heading">
                    <strong>{item.exposure_name ? getLocalizedField(item, "exposure_name", language) : displayCode(item.history_kind)}</strong>
                    <small>{formatLocalizedDate(item.recorded_at, language)}</small>
                  </div>
                  <p>{item.condition_text || item.exposure_code || t("common.notProvided")}</p>
                  {item.is_current != null && <small>{t(item.is_current ? "patientExplorer.current" : "patientExplorer.notCurrent")}</small>}
                  <small>{t("patientExplorer.recorder")}: {item.recorded_by}</small>
                </li>
              ))}
            </ul>
          ) : !details.findings.length && <EmptyState title={t("patientExplorer.noHistory")} />}
          {details.findings.length > 0 && (
            <div className="patient-observation-list">
              <h3>{t("patientExplorer.screeningObservations")}</h3>
              {details.findings.map((finding, index) => (
                <article key={`${finding.screening_id}-${finding.recorded_at}-${index}`}>
                  <div className="patient-record-heading">
                    <strong>
                      {finding.symptom_name
                        ? getLocalizedField(finding, "symptom_name", language)
                        : displayCode(finding.oral_site || finding.finding_kind)}
                    </strong>
                    <small>{formatLocalizedDate(finding.recorded_at, language)}</small>
                  </div>
                  {finding.description && <p>{finding.description}</p>}
                  {finding.duration_days != null && <small>{t("patientExplorer.symptomDuration", { days: finding.duration_days })}</small>}
                  <small>{t("patientExplorer.recorder")}: {finding.recorded_by}</small>
                </article>
              ))}
            </div>
          )}
        </Card>

        <div id="patient-screening-history">
        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><HeartPulse size={18} /></span>
            <div>
              <h2>{t("patientExplorer.screeningHistory")}</h2>
              <p>{t("patientExplorer.aiAdvisory")}</p>
            </div>
          </div>
          {details.screenings.length ? (
            <div className="patient-explorer-table-wrap">
              <table className="patient-explorer-table">
                <thead>
                  <tr>
                    <th>{t("patientExplorer.screeningDate")}</th>
                    <th>{t("patientExplorer.screeningStatus")}</th>
                    <th>{t("patientExplorer.aiStatus")}</th>
                    <th>{t("patientExplorer.moStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {details.screenings.map((screening) => {
                    const recaptureRequested = isRecaptureRequested(screening);
                    const moreInfoRequested = isMoreInfoRequested(screening);
                    const canContinueReturnedScreening = (recaptureRequested || moreInfoRequested)
                      && screening.id === activeScreening?.id
                      && hasScreeningConsent;
                    return (
                    <tr key={screening.id}>
                      <td data-label={t("patientExplorer.screeningDate")}>
                        <span className="patient-explorer-code">{screening.id}</span>
                        <small>{formatLocalizedDate(screening.screening_date, language)}</small>
                      </td>
                      <td data-label={t("patientExplorer.screeningStatus")}>
                        <Badge tone={recaptureRequested || screening.case_state === "AWAITING_CLINICIAN" ? "warning" : "info"}>
                          {recaptureRequested
                            ? t("patientExplorer.recaptureRequired")
                            : moreInfoRequested
                            ? t("patientExplorer.moreInformationRequired")
                            : getCaseStateLabel(screening.case_state, language)}
                        </Badge>
                        {(recaptureRequested || moreInfoRequested) && screening.medical_officer_request_note && (
                          <small>{screening.medical_officer_request_note}</small>
                        )}
                        {canContinueReturnedScreening && (
                          <Link className="district-card-link" to={screeningLink}>
                            {t(moreInfoRequested
                              ? "patientExplorer.updateRequestedInformation"
                              : "patientExplorer.continueRecapture")}
                          </Link>
                        )}
                      </td>
                      <td data-label={t("patientExplorer.aiStatus")}>
                        {screening.ai_status
                          ? t(AI_STATUS_KEYS[screening.ai_status] || "common.notAvailable")
                          : t("common.notAvailable")}
                      </td>
                      <td data-label={t("patientExplorer.moStatus")}>
                        {screening.reviewed_at
                          ? `${t("patientExplorer.reviewed")}${screening.medical_officer_decision ? ` · ${displayCode(screening.medical_officer_decision)}` : ""}`
                          : screening.submitted_at ? t("patientExplorer.reviewPending") : t("common.notAvailable")}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={t("patientExplorer.noScreenings")} />}
        </Card>
        </div>

        <Card>
          <div className="patient-explorer-section-heading">
            <span className="patient-explorer-icon"><MapPin size={18} /></span>
            <h2>{t("patientExplorer.referrals")}</h2>
          </div>
          {details.referrals.length ? (
            <div className="patient-explorer-table-wrap">
              <table className="patient-explorer-table">
                <thead>
                  <tr>
                    <th>{t("patientExplorer.referralCode")}</th>
                    <th>{t("patientExplorer.hospital")}</th>
                    <th>{t("patientExplorer.specialty")}</th>
                    <th>{t("patientExplorer.referralStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {details.referrals.map((referral) => (
                    <tr key={referral.id}>
                      <td data-label={t("patientExplorer.referralCode")}>{referral.referral_code}</td>
                      <td data-label={t("patientExplorer.hospital")}>{getLocalizedField(referral, "hospital_name", language)}</td>
                      <td data-label={t("patientExplorer.specialty")}>{getLocalizedField(referral, "specialty_name", language)}</td>
                      <td data-label={t("patientExplorer.referralStatus")}><Badge tone="info">{displayCode(referral.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={t("patientExplorer.noReferrals")} />}
        </Card>
      </div>
    </div>
  );
}
