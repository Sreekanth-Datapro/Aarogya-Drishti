import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, ExternalLink, RefreshCw, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Button } from "../../components/ui";
import "./MyAppointments.css";

const FILTERS = ["upcoming", "today", "pending_attendance", "completed", "missed", "rescheduled", "cancelled"];

function badgeClass(status) {
  return `my-appointment-badge ${(status || "unavailable").toLowerCase()}`;
}

function joinBlockedMessage(t, reason) {
  if (!reason) return "";
  const key = `myAppointments.joinBlocked.${reason}`;
  const translated = t(key);
  return translated === key ? t("myAppointments.joinUnavailable") : translated;
}

export default function MyAppointments({ role }) {
  const { updateUser, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("upcoming");
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const listPath = role === "HEALTH_WORKER"
    ? "/health-worker/appointments"
    : "/navigator/appointments";
  const canJoin = user?.permissions?.includes("video.join") === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Refresh permissions from the server so video.join granted after login
      // (e.g. migration 025) is visible — same pattern as Specialist appointments.
      const profileResponse = await api.get("/auth/me");
      if (profileResponse.data?.user) {
        updateUser(profileResponse.data.user);
      }
      const response = await api.get(listPath, { params: { filter } });
      setAppointments(Array.isArray(response.data?.appointments) ? response.data.appointments : []);
    } catch (requestError) {
      setAppointments([]);
      setError(requestError?.response?.data?.message || t("myAppointments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filter, listPath, t, updateUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyMeetingHint(appointment) {
    const text = appointment.meeting_ready
      ? `${appointment.referral_code} · ${appointment.scheduled_at_display || ""}`
      : t("myAppointments.meetingNotReady");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t("myAppointments.copied"));
    } catch (_error) {
      setError(t("myAppointments.copyFailed"));
    }
  }

  function joinConsultation(appointment) {
    if (!canJoin) {
      setError(t("myAppointments.joinPermissionMissing"));
      return;
    }
    if (!appointment.can_join) {
      setError(joinBlockedMessage(t, appointment.join_blocked_reason));
      return;
    }
    setJoiningId(appointment.video_consultation_id);
    setError("");
    setMessage("");
    navigate(`/video-consultations/${appointment.video_consultation_id}/meeting`);
  }

  return (
    <div className="care-page my-appointments-page">
      <header className="care-hero">
        <p className="care-eyebrow">{t("myAppointments.eyebrow")}</p>
        <h1 className="page-title">
          <CalendarDays size={22} aria-hidden="true" /> {t("myAppointments.title")}
        </h1>
        <p className="page-subtitle">{t(`myAppointments.hint.${role}`)}</p>
      </header>

      <div className="my-appointments-filters" role="tablist" aria-label={t("myAppointments.filtersLabel")}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            className={filter === item ? "is-active" : ""}
            onClick={() => setFilter(item)}
          >
            {t(`myAppointments.filter.${item}`)}
          </button>
        ))}
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> {t("myAppointments.refresh")}
        </Button>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      {loading && <p className="care-muted" role="status">{t("myAppointments.loading")}</p>}

      {!loading && appointments.length === 0 && (
        <div className="my-appointments-empty">{t("myAppointments.empty")}</div>
      )}

      <div className="my-appointments-grid">
        {appointments.map((appointment) => {
          const open = selectedId === appointment.video_consultation_id;
          return (
            <article key={appointment.video_consultation_id} className="my-appointment-card">
              <header>
                <div>
                  <h2>{appointment.patient_name}</h2>
                  <p className="care-muted">{appointment.patient_code} · {appointment.referral_code}</p>
                </div>
                <span className={badgeClass(appointment.video_status)}>
                  {t(`myAppointments.status.${appointment.video_status}`)}
                </span>
              </header>

              <div className="my-appointment-meta">
                <p><strong>{t("myAppointments.specialist")}</strong> {appointment.specialist_name}</p>
                <p><strong>{t("myAppointments.department")}</strong> {appointment.specialty_name}</p>
                <p><strong>{t("myAppointments.facility")}</strong> {appointment.hospital_name}</p>
                <p><strong>{t("myAppointments.when")}</strong> {appointment.scheduled_at_display} – {appointment.slot_end_display}</p>
                <p><strong>{t("myAppointments.duration")}</strong> {appointment.duration_minutes} {t("myAppointments.minutes")}</p>
                <p><strong>{t("myAppointments.appointmentStatus")}</strong> {appointment.appointment_status}</p>
                {role === "NAVIGATOR" && (
                  <>
                    <p><strong>{t("myAppointments.healthWorker")}</strong> {appointment.health_worker_name || t("common.notAvailable")}</p>
                    <p><strong>{t("myAppointments.contactStatus")}</strong> {appointment.patient_contact_status}</p>
                    <p><strong>{t("myAppointments.reminderStatus")}</strong> {appointment.reminder_status}</p>
                    <p><strong>{t("myAppointments.attendance")}</strong> {appointment.attendance}</p>
                  </>
                )}
              </div>

              {open && (
                <div className="my-appointment-meta" id={`appointment-details-${appointment.video_consultation_id}`}>
                  <p><strong>{t("myAppointments.meetingReady")}</strong> {appointment.meeting_ready ? t("myAppointments.yes") : t("myAppointments.no")}</p>
                  <p><strong>{t("myAppointments.signedReport")}</strong> {appointment.has_signed_report ? t("myAppointments.yes") : t("myAppointments.no")}</p>
                  <p className="care-muted">{t("myAppointments.notesGuard")}</p>
                </div>
              )}

              <div className="my-appointment-actions">
                <Button
                  type="button"
                  variant="secondary"
                  aria-expanded={open}
                  aria-controls={`appointment-details-${appointment.video_consultation_id}`}
                  onClick={() => setSelectedId(open ? "" : appointment.video_consultation_id)}
                >
                  {t("myAppointments.viewDetails")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => copyMeetingHint(appointment)}>
                  <Copy size={16} aria-hidden="true" /> {t("myAppointments.copyLink")}
                </Button>
                {canJoin && appointment.can_join && (
                  <Button
                    type="button"
                    disabled={joiningId === appointment.video_consultation_id}
                    loading={joiningId === appointment.video_consultation_id}
                    onClick={() => joinConsultation(appointment)}
                  >
                    <Video size={16} aria-hidden="true" />
                    {joiningId === appointment.video_consultation_id
                      ? t("myAppointments.joining")
                      : t("myAppointments.join")}
                    <ExternalLink size={14} aria-hidden="true" />
                  </Button>
                )}
              </div>
              {canJoin && !appointment.can_join && (
                <p className="care-muted" role="status">
                  {joinBlockedMessage(t, appointment.join_blocked_reason)}
                </p>
              )}
              {appointment.appointment_status === "MISSED" && role === "NAVIGATOR" && (
                <div className="my-appointment-actions">
                  <p className="care-muted" role="status">{t("myAppointments.missedRescheduleHint")}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate(`/navigator/referrals`, {
                      state: { openReferralId: appointment.referral_id },
                    })}
                  >
                    {t("navigator.rescheduleAppointment")}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
