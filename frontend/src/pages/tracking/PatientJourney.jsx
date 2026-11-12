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

      {error ? <Alert type="danger">{error}</Alert> : null}

      {journey ? (
        <>
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
                  <dd>{journey.treatment_tracking.current_treatment_status || "—"}</dd>
                </div>
                <div className="tracking-mandatory-item">
                  <dt>{t("tracking.treatment.attendance")}</dt>
                  <dd>{journey.treatment_tracking.revisit_attendance_status || "PENDING"}</dd>
                </div>
                <div className="tracking-mandatory-item">
                  <dt>{t("tracking.treatment.moOutcome")}</dt>
                  <dd>{journey.treatment_tracking.mo_reassessment_outcome || t("tracking.none")}</dd>
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

          <div className="tracking-panels">
            <section className="tracking-panel tracking-panel-wide">
              <h2>{t("tracking.timeline")}</h2>
              {(journey.timeline || []).length === 0 ? (
                <p>{t("tracking.noTimeline")}</p>
              ) : (
                <div className="tracking-table-wrap">
                  <table className="tracking-table">
                    <thead>
                      <tr>
                        <th>{t("tracking.timelineColumns.when")}</th>
                        <th>{t("tracking.timelineColumns.activity")}</th>
                        <th>{t("tracking.timelineColumns.previousStatus")}</th>
                        <th>{t("tracking.timelineColumns.newStatus")}</th>
                        <th>{t("tracking.timelineColumns.performedBy")}</th>
                        <th>{t("tracking.timelineColumns.responsible")}</th>
                        <th>{t("tracking.timelineColumns.notes")}</th>
                        <th>{t("tracking.timelineColumns.nextAction")}</th>
                        <th>{t("tracking.timelineColumns.dueDate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journey.timeline.map((event, index) => (
                        <tr key={`${event.activity}-${event.event_time}-${index}`}>
                          <td>{formatLocalizedDateTime(event.event_time, language)}</td>
                          <td>{event.activity || "—"}</td>
                          <td>{event.previous_status || "—"}</td>
                          <td>{event.new_status || "—"}</td>
                          <td>{event.performed_by || t("tracking.notAssigned")}</td>
                          <td>{event.responsible_person || t("tracking.notAssigned")}</td>
                          <td>{event.notes || "—"}</td>
                          <td>{event.next_action || "—"}</td>
                          <td>
                            {event.due_at
                              ? formatLocalizedDateTime(event.due_at, language)
                              : t("tracking.notScheduled")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.appointments")}</h2>
              {(journey.appointments || []).length === 0 ? (
                <p>{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.appointments.map((row) => (
                    <li key={`${row.kind}-${row.id}`}>
                      <strong>{row.kind}</strong> · {row.status_code}
                      <span>{formatLocalizedDateTime(row.when_at, language)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.diagnostics")}</h2>
              {(journey.diagnostics || []).length === 0 ? (
                <p>{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.diagnostics.map((row) => (
                    <li key={row.id}>
                      <strong>{row.order_code}</strong> · {row.status_code}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.followups")}</h2>
              {(journey.followups || []).length === 0 ? (
                <p>{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.followups.map((row) => (
                    <li key={row.id}>
                      <strong>{row.status}</strong>
                      <span>
                        {row.due_at
                          ? formatLocalizedDateTime(row.due_at, language)
                          : t("tracking.notScheduled")}
                        {row.health_worker_name ? ` · ${row.health_worker_name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tracking-panel">
              <h2>{t("tracking.escalations")}</h2>
              {(journey.escalations || []).length === 0 ? (
                <p>{t("tracking.none")}</p>
              ) : (
                <ul>
                  {journey.escalations.map((row) => (
                    <li key={row.id}>
                      <Badge tone={row.status === "RESOLVED" ? "success" : "danger"}>{row.status}</Badge>
                      <span>{formatLocalizedDateTime(row.created_at, language)}</span>
                      {row.severity ? <em>{row.severity}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
