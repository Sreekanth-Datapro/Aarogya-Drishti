import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Badge, Button } from "../../components/ui";
import "./SpecialistDashboard.css";

const EMPTY_APPOINTMENTS = {
  pending_requests: [],
  accepted_requests: [],
  confirmed_appointments: [],
  completed_consultations: [],
};

function formatDate(value, language) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatTime(value, language) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRange(start, end, language) {
  return `${formatDate(start, language)} · ${formatTime(start, language)} – ${formatTime(end, language)}`;
}

function localDateTimeMin() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function SpecialistAppointments() {
  const { updateUser, user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const canJoin = user?.permissions?.includes("video.join") === true;
  const [appointments, setAppointments] = useState(EMPTY_APPOINTMENTS);
  const [authorized, setAuthorized] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const profileResponse = await api.get("/auth/me");
      const currentUser = profileResponse.data.user;
      updateUser(currentUser);
      const hasPermission = currentUser.permissions?.includes("appointment.slot_manage") === true;
      setAuthorized(hasPermission);
      if (!hasPermission) {
        setAppointments(EMPTY_APPOINTMENTS);
        return;
      }

      const response = await api.get("/specialist/appointments");
      const data = response.data || {};
      setAppointments({
        pending_requests: Array.isArray(data.pending_requests) ? data.pending_requests : [],
        accepted_requests: Array.isArray(data.accepted_requests) ? data.accepted_requests : [],
        confirmed_appointments: Array.isArray(data.confirmed_appointments) ? data.confirmed_appointments : [],
        completed_consultations: Array.isArray(data.completed_consultations) ? data.completed_consultations : [],
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("specialist.appointmentsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, updateUser]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const visibleRecords = useCallback((records) => {
    const availableRecords = Array.isArray(records) ? records : [];
    const query = search.trim().toLocaleLowerCase();
    if (!query) return availableRecords;
    return availableRecords.filter((record) => [
      record.patient_name,
      record.patient_code,
      record.referral_id,
      record.referral_code,
      record.hospital_name,
      record.hospital_staff_name,
      record.status,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  }, [search]);

  const respond = async (requestId, responseType, form) => {
    setBusy(requestId);
    setError("");
    setSuccess("");
    try {
      const body = { response: responseType };
      if (form) {
        const values = new FormData(form);
        body.reason = values.get("reason");
        if (responseType === "SUGGEST") {
          body.proposed_start = new Date(values.get("proposed_start")).toISOString();
          body.proposed_end = new Date(values.get("proposed_end")).toISOString();
        }
      }
      await api.post(`/specialist/availability/requests/${requestId}/respond`, body);
      await loadAppointments();
      setSuccess(t("specialist.availabilityResponseSaved"));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("specialist.availabilityResponseFailed"));
    } finally {
      setBusy("");
    }
  };

  const renderRecordDetails = (record, start, end) => (
    <>
      <div className="specialist-appointment-person">
        <strong>{record.patient_name || record.patient_code || t("common.notAvailable")}</strong>
        {record.patient_code && <small>{record.patient_code}</small>}
      </div>
      <p><strong>{t("specialist.availabilityReferral")}</strong> {record.referral_code || t("common.notAvailable")}</p>
      <p>{record.referral_id || t("common.notAvailable")}</p>
      <p>{record.hospital_name || t("common.notAvailable")} · {record.specialty_name || t("common.notAvailable")}</p>
      <p><strong>{t("specialist.appointmentRequestedBy")}</strong> {record.hospital_staff_name || t("common.notAvailable")}</p>
      <p><strong>{t("specialist.availabilityRequestedTime")}</strong> {formatRange(start, end, language)}</p>
      <p><strong>{t("specialist.appointmentType")}</strong> {t("specialist.videoConsultation")}</p>
    </>
  );

  const renderSection = (title, records, kind) => {
    const filteredRecords = visibleRecords(records);
    const emptyText = search.trim()
      ? t("specialist.noAppointmentsMatch")
      : t(`specialist.${kind}Empty`);

    return (
      <section className="district-card specialist-appointments-section" aria-label={title} key={kind}>
        <div className="specialist-section-heading">
          <h2 className="district-card-title">{title}</h2>
          <Badge tone={kind === "pendingRequests" ? "warning" : kind === "completedConsultations" ? "success" : "info"}>
            {filteredRecords.length}
          </Badge>
        </div>
        {filteredRecords.length ? (
          <div className="specialist-availability-request-list">
            {filteredRecords.map((record) => {
              const isRequest = kind === "pendingRequests" || kind === "acceptedRequests";
              const start = isRequest
                ? (record.status === "SUGGESTED" ? record.proposed_start : record.requested_start)
                : record.scheduled_start;
              const end = isRequest
                ? (record.status === "SUGGESTED" ? record.proposed_end : record.requested_end)
                : record.scheduled_end;

              return (
                <article className="specialist-availability-request" key={record.id}>
                  <div>
                    {renderRecordDetails(record, start, end)}
                    <p className="specialist-appointment-status">
                      <strong>{t("specialist.availabilityRequestStatusLabel")}</strong>{" "}
                      <Badge tone={record.status === "COMPLETED" ? "success" : record.status === "PENDING" ? "warning" : "info"}>
                        {t(`specialist.availabilityRequestStatus.${record.status}`)}
                      </Badge>
                    </p>
                    {record.response_reason && <p><strong>{t("specialist.appointmentResponse")}</strong> {record.response_reason}</p>}
                    {kind === "acceptedRequests" && (
                      <p className="care-muted">{t("specialist.appointmentAwaitingHospitalConfirmation")}</p>
                    )}
                    {kind === "confirmedAppointments" && record.attendance && (
                      <p><strong>{t("specialist.appointmentAttendance")}</strong> {record.attendance}</p>
                    )}
                  </div>
                  {kind === "confirmedAppointments" && canJoin && (
                    <div className="specialist-availability-request-actions">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/video-consultations/${record.id}/meeting`)}
                      >
                        {t("myAppointments.join")}
                      </Button>
                    </div>
                  )}
                  {kind === "pendingRequests" && (
                    <div className="specialist-availability-request-actions">
                      <Button
                        size="sm"
                        loading={busy === record.id}
                        disabled={Boolean(busy) || record.teleconsult_consent_status !== "ACTIVE"}
                        onClick={() => respond(record.id, "ACCEPT")}
                      >
                        {t("specialist.acceptRequestedTime")}
                      </Button>
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        respond(record.id, "SUGGEST", event.currentTarget);
                      }}>
                        <label>
                          {t("specialist.suggestedStart")}
                          <input name="proposed_start" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <label>
                          {t("specialist.suggestedEnd")}
                          <input name="proposed_end" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <label>
                          {t("specialist.responseReasonOptional")}
                          <textarea name="reason" rows="2" maxLength="1000" />
                        </label>
                        <Button type="submit" size="sm" disabled={Boolean(busy) || record.teleconsult_consent_status !== "ACTIVE"}>
                          {t("specialist.suggestAlternativeTime")}
                        </Button>
                      </form>
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        respond(record.id, "DECLINE", event.currentTarget);
                      }}>
                        <label>
                          {t("specialist.declineReason")}
                          <textarea name="reason" rows="2" maxLength="1000" required />
                        </label>
                        <Button type="submit" size="sm" variant="secondary" disabled={Boolean(busy)}>
                          {t("specialist.declineAvailabilityRequest")}
                        </Button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="care-muted" role="status">{emptyText}</p>
        )}
      </section>
    );
  };

  const hasRecords = useMemo(
    () => Object.values(appointments).some((records) => Array.isArray(records) && records.length > 0),
    [appointments]
  );

  return (
    <div className="care-page specialist-appointments-page">
      <header className="page-header">
        <div>
          <p className="care-eyebrow">{t("specialist.appointmentsEyebrow")}</p>
          <h1 className="page-title"><Video size={22} aria-hidden="true" /> {t("specialist.appointmentsDashboardTitle")}</h1>
          <p className="page-subtitle">{t("specialist.appointmentsDashboardHint")}</p>
        </div>
        <Button variant="secondary" loading={loading} onClick={loadAppointments}>
          {t("specialist.refreshAvailability")}
        </Button>
      </header>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {authorized === false && !loading && (
        <Alert type="error">{t("specialist.appointmentsPermissionRequired")}</Alert>
      )}
      {loading && <p className="care-muted" role="status">{t("specialist.appointmentsLoading")}</p>}
      {!loading && authorized && (
        <>
          <div className="specialist-appointments-controls">
            <label className="specialist-appointments-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">{t("specialist.appointmentsSearchLabel")}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("specialist.appointmentsSearchPlaceholder")}
              />
            </label>
            <label className="specialist-appointments-filter">
              <span>{t("specialist.appointmentsFilterLabel")}</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">{t("specialist.appointmentsFilterAll")}</option>
                <option value="pending">{t("specialist.appointmentsFilterPending")}</option>
                <option value="accepted">{t("specialist.appointmentsFilterAccepted")}</option>
                <option value="confirmed">{t("specialist.appointmentsFilterConfirmed")}</option>
                <option value="completed">{t("specialist.appointmentsFilterCompleted")}</option>
              </select>
            </label>
          </div>
          <div className="specialist-appointments-sections">
            {[
              ["pending", t("specialist.pendingRequestsSection"), appointments.pending_requests, "pendingRequests"],
              ["accepted", t("specialist.acceptedRequestsSection"), appointments.accepted_requests, "acceptedRequests"],
              ["confirmed", t("specialist.confirmedAppointmentsSection"), appointments.confirmed_appointments, "confirmedAppointments"],
              ["completed", t("specialist.completedConsultationsSection"), appointments.completed_consultations, "completedConsultations"],
            ]
              .filter(([key]) => statusFilter === "all" || statusFilter === key)
              .map(([, title, records, kind]) => renderSection(title, records, kind))}
          </div>
          {!hasRecords && <p className="sr-only">{t("specialist.noAppointmentsYet")}</p>}
        </>
      )}
    </div>
  );
}
