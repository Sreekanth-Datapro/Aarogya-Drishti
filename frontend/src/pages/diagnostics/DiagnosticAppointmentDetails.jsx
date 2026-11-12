import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "../medicalOfficer/MedicalOfficer.css";
import "./Diagnostics.css";

function localDateTimeMin() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function toIsoFromLocal(value) {
  const date = new Date(value);
  return date.toISOString();
}

function statusTone(status) {
  if (status === "REQUESTED") return "warning";
  if (status === "CONFIRMED") return "info";
  if (status === "COMPLETED") return "success";
  if (status === "MISSED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export default function DiagnosticAppointmentDetails({ role }) {
  const { appointmentId } = useParams();
  const { t, language } = useLanguage();
  const backPath =
    role === "HOSPITAL_STAFF"
      ? "/hospital-staff/diagnostics"
      : role === "HEALTH_WORKER"
        ? "/health-worker/diagnostics"
        : "/navigator/diagnostics";

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmTime, setConfirmTime] = useState("");
  const [altTime, setAltTime] = useState("");
  const [altReason, setAltReason] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [contactStatus, setContactStatus] = useState("INFORMED");
  const [contactNotes, setContactNotes] = useState("");
  const [attendance, setAttendance] = useState("ATTENDED");
  const [missedReason, setMissedReason] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/diagnostics/appointments/${appointmentId}`);
      const row = response.data.appointment;
      setAppointment(row);
      setConfirmTime(row.requested_at ? new Date(row.requested_at).toISOString().slice(0, 16) : "");
      setContactStatus(row.contact_status || "INFORMED");
      setContactNotes(row.contact_notes || "");
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(path, body, successKey) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(path, body);
      setMessage(response.data.message || t(successKey));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadReport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !appointment?.order_id) return;
    if (!window.confirm(t("diagnostics.confirmUploadReport"))) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("report", file);
      await api.post(`/diagnostics/orders/${appointment.order_id}/reports`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage(t("diagnostics.reportUploaded"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <PageLoader label={t("common.loading")} />;
  if (error && !appointment) {
    return (
      <div className="mo-page">
        <Alert type="error">{error}</Alert>
        <Link className="btn btn-secondary" to={backPath}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("diagnostics.backToList")}
        </Link>
      </div>
    );
  }
  if (!appointment) return null;

  const facilityName =
    language === "te" && appointment.facility_name_te
      ? appointment.facility_name_te
      : appointment.facility_name;

  return (
    <div className="mo-page diagnostics-page">
      <div className="diagnostics-detail-head">
        <div>
          <h1 className="page-title">
            <CalendarClock size={20} aria-hidden="true" /> {appointment.order_code}
          </h1>
          <p className="page-subtitle">
            {appointment.patient_name} ({appointment.patient_code})
          </p>
        </div>
        <Link className="btn btn-secondary" to={backPath}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("diagnostics.backToList")}
        </Link>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <h2>{t("diagnostics.appointmentSummary")}</h2>
        <dl className="diagnostics-dl">
          <div>
            <dt>{t("diagnostics.status")}</dt>
            <dd><Badge tone={statusTone(appointment.status_code)}>{appointment.status_name}</Badge></dd>
          </div>
          <div>
            <dt>{t("diagnostics.requestedAt")}</dt>
            <dd>{formatLocalizedDateTime(appointment.requested_at, language)}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.confirmedAt")}</dt>
            <dd>
              {appointment.confirmed_at_time
                ? formatLocalizedDateTime(appointment.confirmed_at_time, language)
                : t("common.notAvailable")}
            </dd>
          </div>
          <div>
            <dt>{t("diagnostics.facility")}</dt>
            <dd>{facilityName} ({appointment.facility_type})</dd>
          </div>
          {appointment.coordination_notes && (
            <div>
              <dt>{t("diagnostics.coordinationNotes")}</dt>
              <dd>{appointment.coordination_notes}</dd>
            </div>
          )}
          <div>
            <dt>{t("diagnostics.contactStatus")}</dt>
            <dd>{appointment.contact_status}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.attendance")}</dt>
            <dd>{appointment.attendance}</dd>
          </div>
        </dl>
      </section>

      <section className="mo-card">
        <h2>{t("diagnostics.orderItems")}</h2>
        <ul className="diagnostics-order-list">
          {(appointment.items || []).map((item) => (
            <li key={item.id} className="diagnostics-order-item">
              <div>
                <strong>{language === "te" && item.test_name_te ? item.test_name_te : item.test_name}</strong>
                <span>{item.clinical_reason}</span>
                {item.instructions && <span>{item.instructions}</span>}
                <div className="diagnostics-item-tags">
                  <Badge tone="info">{item.priority}</Badge>
                  {item.fasting_required && <Badge tone="warning">{t("diagnostics.fastingRequired")}</Badge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {role === "HOSPITAL_STAFF" && ["REQUESTED", "RESCHEDULED"].includes(appointment.status_code) && (
        <section className="mo-card">
          <h2>{t("diagnostics.hospitalActions")}</h2>
          <div className="diagnostics-form">
            <label>
              <span>{t("diagnostics.confirmedAt")}</span>
              <input
                type="datetime-local"
                min={localDateTimeMin()}
                value={confirmTime}
                onChange={(e) => setConfirmTime(e.target.value)}
              />
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => runAction(
                  `/diagnostics/appointments/${appointment.id}/confirm`,
                  { confirmed_at_time: confirmTime ? toIsoFromLocal(confirmTime) : null },
                  "diagnostics.confirmed"
                )}
              >
                {t("diagnostics.confirmAppointment")}
              </Button>
            </div>
            <label>
              <span>{t("diagnostics.alternativeTime")}</span>
              <input
                type="datetime-local"
                min={localDateTimeMin()}
                value={altTime}
                onChange={(e) => setAltTime(e.target.value)}
              />
            </label>
            <label>
              <span>{t("diagnostics.reason")}</span>
              <textarea value={altReason} onChange={(e) => setAltReason(e.target.value)} rows={2} />
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !altTime || !altReason}
                onClick={() => runAction(
                  `/diagnostics/appointments/${appointment.id}/suggest-alternative`,
                  { suggested_at: toIsoFromLocal(altTime), reason: altReason },
                  "diagnostics.alternativeSuggested"
                )}
              >
                {t("diagnostics.suggestAlternative")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {role === "HOSPITAL_STAFF" && ["REQUESTED", "CONFIRMED"].includes(appointment.status_code) && (
        <section className="mo-card">
          <h2>{t("diagnostics.rescheduleOrCancel")}</h2>
          <div className="diagnostics-form">
            <label>
              <span>{t("diagnostics.newDateTime")}</span>
              <input
                type="datetime-local"
                min={localDateTimeMin()}
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </label>
            <label>
              <span>{t("diagnostics.reason")}</span>
              <textarea value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} rows={2} />
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !rescheduleTime || !rescheduleReason}
                onClick={() => runAction(
                  `/diagnostics/appointments/${appointment.id}/reschedule`,
                  { scheduled_at: toIsoFromLocal(rescheduleTime), reason: rescheduleReason },
                  "diagnostics.rescheduled"
                )}
              >
                {t("diagnostics.reschedule")}
              </Button>
            </div>
            <label>
              <span>{t("diagnostics.cancelReason")}</span>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} />
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                variant="danger"
                disabled={busy || !cancelReason}
                onClick={() => runAction(
                  `/diagnostics/appointments/${appointment.id}/cancel`,
                  { reason: cancelReason },
                  "diagnostics.cancelled"
                )}
              >
                {t("diagnostics.cancelAppointment")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {role === "HEALTH_WORKER" && (
        <section className="mo-card">
          <h2>{t("diagnostics.hwFollowup")}</h2>
          <div className="diagnostics-form">
            <label>
              <span>{t("diagnostics.contactStatus")}</span>
              <select value={contactStatus} onChange={(e) => setContactStatus(e.target.value)}>
                <option value="NOT_CONTACTED">{t("diagnostics.contactNotContacted")}</option>
                <option value="INFORMED">{t("diagnostics.contactInformed")}</option>
                <option value="REACHED">{t("diagnostics.contactReached")}</option>
                <option value="UNREACHABLE">{t("diagnostics.contactUnreachable")}</option>
              </select>
            </label>
            <label>
              <span>{t("diagnostics.contactNotes")}</span>
              <textarea value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} rows={2} />
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => runAction(
                  `/diagnostics/appointments/${appointment.id}/followup`,
                  {
                    contact_status: contactStatus,
                    contact_notes: contactNotes || null,
                    patient_informed: ["INFORMED", "REACHED"].includes(contactStatus),
                  },
                  "diagnostics.followupSaved"
                )}
              >
                {t("diagnostics.saveContact")}
              </Button>
            </div>
            {appointment.status_code === "CONFIRMED" && appointment.attendance === "PENDING" && (
              <>
                <label>
                  <span>{t("diagnostics.attendance")}</span>
                  <select value={attendance} onChange={(e) => setAttendance(e.target.value)}>
                    <option value="ATTENDED">{t("diagnostics.attended")}</option>
                    <option value="NO_SHOW">{t("diagnostics.noShow")}</option>
                  </select>
                </label>
                {attendance === "NO_SHOW" && (
                  <label>
                    <span>{t("diagnostics.missedReason")}</span>
                    <textarea value={missedReason} onChange={(e) => setMissedReason(e.target.value)} rows={2} />
                  </label>
                )}
                <div className="diagnostics-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || (attendance === "NO_SHOW" && !missedReason)}
                    onClick={() => runAction(
                      `/diagnostics/appointments/${appointment.id}/followup`,
                      {
                        attendance,
                        missed_reason_text: missedReason || null,
                      },
                      "diagnostics.attendanceSaved"
                    )}
                  >
                    {t("diagnostics.recordAttendance")}
                  </Button>
                </div>
              </>
            )}
            <label className="diagnostics-upload">
              <span>{t("diagnostics.uploadReportHint")}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={busy || uploading}
                onChange={uploadReport}
              />
            </label>
          </div>
        </section>
      )}

      {role === "HOSPITAL_STAFF" && (
        <section className="mo-card">
          <h2>{t("diagnostics.uploadReport")}</h2>
          <label className="diagnostics-upload">
            <span>{t("diagnostics.uploadReportHint")}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={busy || uploading}
              onChange={uploadReport}
            />
          </label>
        </section>
      )}

      <section className="mo-card">
        <h2>{t("diagnostics.statusHistory")}</h2>
        <ul className="diagnostics-history">
          {(appointment.history || []).map((entry) => (
            <li key={entry.id}>
              <strong>{entry.to_status_code}</strong>
              <span>{entry.changed_by_name}</span>
              <span>{entry.reason || "—"}</span>
              <span>{formatLocalizedDateTime(entry.changed_at, language)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
