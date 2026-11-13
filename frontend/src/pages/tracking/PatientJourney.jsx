import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { formatLocalizedDateTime } from "../../i18n/displayLabels";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import MandatoryTrackingFields from "./MandatoryTrackingFields";
import CareTrackingFields from "./CareTrackingFields";
import "../medicalOfficer/MedicalOfficer.css";
import "./Tracking.css";

function humanizeCode(value) {
  if (!value) return "—";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dash(value, fallback = "—") {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

export default function PatientJourney({ role, listPath }) {
  const { patientId } = useParams();
  const { t, language } = useLanguage();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const backPath = listPath
    || (role === "HEALTH_WORKER"
      ? "/health-worker/tracking"
      : role === "NAVIGATOR"
        ? "/navigator/tracking"
        : role === "SPECIALIST"
          ? "/specialist/tracking"
          : role === "MEDICAL_OFFICER"
            ? "/medical-officer/tracking"
            : role === "HOSPITAL_STAFF"
              ? "/hospital-staff/tracking"
              : role === "DISTRICT_ADMIN"
                ? "/district/tracking"
                : "/dashboard");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/tracking/patients/${patientId}/journey`);
      setJourney(response.data.journey || null);
    } catch (requestError) {
      setError(apiMessage(requestError, "tracking.loadFailed"));
      setJourney(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !journey) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="mo-page tracking-page">
      <div className="page-header">
        <div>
          <Link className="tracking-back" to={backPath}>
            <ArrowLeft size={16} />
            {t("tracking.backToList")}
          </Link>
          <h1 className="page-title">
            {journey?.patient?.full_name || journey?.patient?.patient_code || t("tracking.journeyTitle")}
          </h1>
          <p className="page-subtitle">
            {journey?.patient?.patient_code}
            {journey?.patient?.facility_name
              ? ` · ${language === "te" && journey.patient.facility_name_te
                ? journey.patient.facility_name_te
                : journey.patient.facility_name}`
              : ""}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={load}>
          <RefreshCw size={16} />
          {t("common.refresh")}
        </Button>
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}

      {journey ? (
        <div className="tracking-journey-layout">
          <section className="tracking-summary-block" aria-label={t("tracking.mandatory.heading")}>
            <h2 className="tracking-section-title">{t("tracking.mandatory.heading")}</h2>
            <MandatoryTrackingFields
              currentStageLabel={journey.current_stage_label}
              responsibleDisplay={journey.responsible?.display}
              nextActionLabel={journey.next_action_label}
              dueAt={journey.next_action_due_at}
              isOverdue={journey.is_overdue}
            />
          </section>

          {journey.treatment_tracking ? (
            <section className="tracking-summary-block" aria-label={t("tracking.treatment.heading")}>
              <h2 className="tracking-section-title">{t("tracking.treatment.heading")}</h2>
              <dl className="tracking-mandatory">
                <div className="tracking-mandatory-item">
                  <dt>{t("tracking.treatment.status")}</dt>
                  <dd>{humanizeCode(journey.treatment_tracking.current_treatment_status)}</dd>
                </div>
                <div className="tracking-mandatory-item">
                  <dt>{t("tracking.treatment.attendance")}</dt>
                  <dd>{humanizeCode(journey.treatment_tracking.revisit_attendance_status || "PENDING")}</dd>
                </div>
                <div className="tracking-mandatory-item">
                  <dt>{t("tracking.treatment.moOutcome")}</dt>
                  <dd>
                    {journey.treatment_tracking.mo_reassessment_outcome
                      ? humanizeCode(journey.treatment_tracking.mo_reassessment_outcome)
                      : t("tracking.none")}
                  </dd>
                </div>
              </dl>
              <CareTrackingFields treatment={journey.treatment_tracking} />
              {(journey.treatment_tracking.medicines || []).length > 0 ? (
                <ul className="tracking-medicine-list">
                  {journey.treatment_tracking.medicines.map((medicine, index) => (
                    <li key={`${medicine.medicine_name}-${index}`}>
                      <strong>{medicine.medicine_name}</strong>
                      {" — "}
                      {medicine.dosage}, {medicine.frequency}, {medicine.duration_days}d
                      {medicine.start_date || medicine.expected_end_date
                        ? ` (${medicine.start_date || "—"} → ${medicine.expected_end_date || "—"})`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="tracking-panel tracking-timeline-panel" aria-label={t("tracking.timeline")}>
            <div className="tracking-panel-head">
              <h2>{t("tracking.timeline")}</h2>
              <span className="tracking-panel-count">{(journey.timeline || []).length}</span>
            </div>

            {(journey.timeline || []).length === 0 ? (
              <p className="tracking-empty">{t("tracking.noTimeline")}</p>
            ) : (
              <ol className="journey-timeline">
                {journey.timeline.map((event, index) => (
                  <li
                    key={`${event.activity}-${event.event_time}-${index}`}
                    className="journey-timeline-item"
                  >
                    <div className="journey-timeline-rail" aria-hidden="true">
                      <span className="journey-timeline-dot" />
                    </div>
                    <article className="journey-timeline-card">
                      <header className="journey-timeline-card-head">
                        <time dateTime={event.event_time || undefined}>
                          {formatLocalizedDateTime(event.event_time, language)}
                        </time>
                        <Badge tone="info">{humanizeCode(event.activity)}</Badge>
                      </header>

                      <div className="journey-status-row">
                        <div>
                          <span className="journey-field-label">
                            {t("tracking.timelineColumns.previousStatus")}
                          </span>
                          <strong>{humanizeCode(event.previous_status)}</strong>
                        </div>
                        <span className="journey-status-arrow" aria-hidden="true">→</span>
                        <div>
                          <span className="journey-field-label">
                            {t("tracking.timelineColumns.newStatus")}
                          </span>
                          <strong>{humanizeCode(event.new_status)}</strong>
                        </div>
                      </div>

                      <dl className="journey-meta-grid">
                        <div>
                          <dt>{t("tracking.timelineColumns.performedBy")}</dt>
                          <dd>{dash(event.performed_by, t("tracking.notAssigned"))}</dd>
                        </div>
                        <div>
                          <dt>{t("tracking.timelineColumns.responsible")}</dt>
                          <dd>{dash(event.responsible_person, t("tracking.notAssigned"))}</dd>
                        </div>
                        <div>
                          <dt>{t("tracking.timelineColumns.nextAction")}</dt>
                          <dd>{dash(event.next_action ? humanizeCode(event.next_action) : "")}</dd>
                        </div>
                        <div>
                          <dt>{t("tracking.timelineColumns.dueDate")}</dt>
                          <dd>
                            {event.due_at
                              ? formatLocalizedDateTime(event.due_at, language)
                              : t("tracking.notScheduled")}
                          </dd>
                        </div>
                      </dl>

                      {event.notes ? (
                        <p className="journey-notes">
                          <span className="journey-field-label">
                            {t("tracking.timelineColumns.notes")}
                          </span>
                          {event.notes}
                        </p>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="tracking-side-panels">
            <section className="tracking-panel">
              <h2>{t("tracking.appointments")}</h2>
              {(journey.appointments || []).length === 0 ? (
                <p className="tracking-empty">{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.appointments.map((row) => (
                    <li key={`${row.kind}-${row.id}`}>
                      <strong>{humanizeCode(row.kind)}</strong>
                      <span>{humanizeCode(row.status_code)}</span>
                      <span>{formatLocalizedDateTime(row.when_at, language)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.diagnostics")}</h2>
              {(journey.diagnostics || []).length === 0 ? (
                <p className="tracking-empty">{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.diagnostics.map((row) => (
                    <li key={row.id}>
                      <strong>{row.order_code}</strong>
                      <span>{humanizeCode(row.status_code)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.followups")}</h2>
              {(journey.followups || []).length === 0 ? (
                <p className="tracking-empty">{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.followups.map((row) => (
                    <li key={row.id}>
                      <strong>{humanizeCode(row.status)}</strong>
                      <span>
                        {row.due_at
                          ? formatLocalizedDateTime(row.due_at, language)
                          : t("tracking.notScheduled")}
                      </span>
                      {row.health_worker_name ? <span>{row.health_worker_name}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.escalations")}</h2>
              {(journey.escalations || []).length === 0 ? (
                <p className="tracking-empty">{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.escalations.map((row) => (
                    <li key={row.id}>
                      <Badge tone={row.status === "RESOLVED" ? "success" : "danger"}>
                        {row.status}
                      </Badge>
                      <span>{formatLocalizedDateTime(row.created_at, language)}</span>
                      {row.opportunity ? <em>{row.opportunity}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
