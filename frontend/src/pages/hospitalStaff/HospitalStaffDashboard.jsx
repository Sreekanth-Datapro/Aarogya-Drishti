import React, { useCallback, useEffect, useState } from "react";
import { Building, CalendarClock, History, RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime, formatLocalizedNumber } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, BarChart, Button, EmptyState, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import "./HospitalStaffDashboard.css";

const FILTERS = ["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "MISSED", "CANCELLED"];
const DASHBOARD_STATUSES = ["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "MISSED", "CANCELLED"];

function localDateTimeMin() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function dateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function statusTone(status) {
  if (status === "REQUESTED") return "warning";
  if (status === "CONFIRMED") return "info";
  if (status === "COMPLETED") return "success";
  if (status === "MISSED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export default function HospitalStaffDashboard() {
  const { t, tm, language } = useLanguage();
  const location = useLocation();
  const attendancePage = location.pathname.endsWith("/attendance");
  const [status, setStatus] = useState(attendancePage ? "CONFIRMED" : "REQUESTED");
  const [appointments, setAppointments] = useState([]);
  const [videoConsultations, setVideoConsultations] = useState([]);
  const [videoAvailabilityRequests, setVideoAvailabilityRequests] = useState([]);
  const [eligibleVideoReferrals, setEligibleVideoReferrals] = useState([]);
  const [availabilityRequestError, setAvailabilityRequestError] = useState("");
  const [dashboardAppointments, setDashboardAppointments] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [videoConsultationError, setVideoConsultationError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        listResult,
        dashboardResult,
        videoConsultationResult,
        availabilityRequestsResult,
        eligibleReferralsResult,
      ] = await Promise.allSettled([
        api.get("/hospital-staff/appointments", { params: { status: status || undefined } }),
        api.get("/hospital-staff/appointments"),
        api.get("/hospital-staff/video-consultations"),
        api.get("/hospital-staff/video-availability-requests"),
        api.get("/hospital-staff/video-availability-requests/eligible-referrals"),
      ]);
      if (listResult.status === "rejected") throw listResult.reason;
      setAppointments(listResult.value.data.appointments || []);
      if (dashboardResult.status === "fulfilled") {
        setDashboardAppointments(dashboardResult.value.data.appointments || []);
        setDashboardError("");
      } else {
        setDashboardError(apiMessage(dashboardResult.reason, "hospitalStaff.summaryLoadFailed"));
      }
      if (videoConsultationResult.status === "fulfilled") {
        setVideoConsultations(videoConsultationResult.value.data.consultations || []);
        setVideoConsultationError("");
      } else {
        setVideoConsultationError(apiMessage(
          videoConsultationResult.reason,
          "hospitalStaff.videoConsultationsLoadFailed"
        ));
      }
      if (availabilityRequestsResult.status === "fulfilled" && eligibleReferralsResult.status === "fulfilled") {
        setVideoAvailabilityRequests(
          (availabilityRequestsResult.value.data.requests || [])
            .filter((request) => request.status !== "CONFIRMED")
        );
        setEligibleVideoReferrals(eligibleReferralsResult.value.data.referrals || []);
        setAvailabilityRequestError("");
      } else {
        const failed = availabilityRequestsResult.status === "rejected"
          ? availabilityRequestsResult.reason
          : eligibleReferralsResult.reason;
        setAvailabilityRequestError(apiMessage(failed, "hospitalStaff.availabilityRequestsLoadFailed"));
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "hospitalStaff.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setStatus(location.pathname.endsWith("/attendance") ? "CONFIRMED" : "REQUESTED");
  }, [location.pathname]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || !location.hash) return;
    const requestId = location.hash.replace("#video-availability-request-", "");
    if (!videoAvailabilityRequests.some((request) => request.id === requestId)) return;
    document.getElementById(`video-availability-request-${requestId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [location.hash, loading, videoAvailabilityRequests]);

  const submitAction = async (appointmentId, type, body = {}) => {
    setBusy(appointmentId);
    setError("");
    setMessage("");
    try {
      await api.post(`/hospital-staff/appointments/${appointmentId}/${type}`, body);
      setAction(null);
      setHistory(null);
      setMessage(t(`hospitalStaff.${type}Success`));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    } finally {
      setBusy("");
    }
  };

  const submitVideoAction = async (consultationId, type, body = {}) => {
    const busyId = `video-${consultationId}`;
    setBusy(busyId);
    setError("");
    setMessage("");
    try {
      await api.post(`/hospital-staff/video-consultations/${consultationId}/${type}`, body);
      setMessage(t(`hospitalStaff.video${type === "confirm" ? "Confirm" : "Reschedule"}Success`));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    } finally {
      setBusy("");
    }
  };

  const submitAvailabilityRequest = async (event, referralId, rescheduleConsultationId = null) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(`availability-create-${referralId}`);
    setError("");
    setMessage("");
    setAvailabilityRequestError("");
    try {
      await api.post("/hospital-staff/video-availability-requests", {
        referral_id: referralId,
        requested_start: new Date(formData.get("requested_start")).toISOString(),
        requested_end: new Date(formData.get("requested_end")).toISOString(),
        ...(rescheduleConsultationId
          ? { reschedule_consultation_id: rescheduleConsultationId }
          : {}),
      });
      setMessage(t("hospitalStaff.availabilityRequestSent"));
      await load();
    } catch (requestError) {
      setAvailabilityRequestError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    } finally {
      setBusy("");
    }
  };

  const submitDirectVideoSlot = async (event, referralId) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(`video-slot-${referralId}`);
    setError("");
    setMessage("");
    setAvailabilityRequestError("");
    try {
      await api.post("/hospital-staff/video-availability-requests/direct-confirm", {
        referral_id: referralId,
        slot_id: formData.get("slot_id"),
      });
      setMessage(t("hospitalStaff.directSlotConfirmSuccess"));
      await load();
    } catch (requestError) {
      setAvailabilityRequestError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    } finally {
      setBusy("");
    }
  };

  const submitAvailabilityAction = async (requestId, type, body = {}) => {
    setBusy(`availability-${requestId}`);
    setError("");
    setMessage("");
    setAvailabilityRequestError("");
    try {
      const response = await api.post(`/hospital-staff/video-availability-requests/${requestId}/${type}`, body);
      const confirmed = response.data?.appointment || response.data || {};
      if (type === "confirm" && confirmed.meeting_provisioned === false) {
        setMessage(t("hospitalStaff.availabilityConfirmMeetingPending"));
        setAvailabilityRequestError(confirmed.meeting_error || t("hospitalStaff.meetingProvisionRetryHint"));
      } else {
        setMessage(t(
        type === "confirm"
          ? "hospitalStaff.availabilityConfirmSuccess"
          : type === "reschedule"
            ? "hospitalStaff.availabilityRescheduleSuccess"
            : type === "forward"
              ? "hospitalStaff.forwardToSpecialistSuccess"
              : "hospitalStaff.availabilityDeclineSuccess"
      ));
      }
      await load();
    } catch (requestError) {
      setAvailabilityRequestError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    } finally {
      setBusy("");
    }
  };

  const retryMeetingProvision = async (consultationId) => {
    setBusy(`provision-${consultationId}`);
    setError("");
    setAvailabilityRequestError("");
    try {
      await api.post(`/video-consultations/${consultationId}/provision`);
      setMessage(t("hospitalStaff.meetingProvisionSuccess"));
      await load();
    } catch (requestError) {
      setAvailabilityRequestError(apiMessage(requestError, "hospitalStaff.meetingProvisionFailed"));
    } finally {
      setBusy("");
    }
  };

  const isVideoConsultationAppointment = (appointment) =>
    appointment.has_active_video_consultation
    || appointment.referral_mode === "VIDEO_CONSULT"
    || String(appointment.assigned_service || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_")
      .includes("VIDEO_CONSULT");

  const openHistory = async (appointmentId) => {
    setHistory({ id: appointmentId, loading: true, items: [] });
    setError("");
    try {
      const response = await api.get(`/hospital-staff/appointments/${appointmentId}`);
      setHistory({ id: appointmentId, loading: false, items: response.data.history || [] });
    } catch (requestError) {
      setHistory(null);
      setError(apiMessage(requestError, "hospitalStaff.actionFailed"));
    }
  };

  const title = attendancePage ? t("hospitalStaff.attendanceTitle") : t("hospitalStaff.title");
  const appointmentCounts = DASHBOARD_STATUSES.map((appointmentStatus) => ({
    status: appointmentStatus,
    count: (dashboardAppointments || []).filter((appointment) => appointment.status_code === appointmentStatus).length,
  }));
  const appointmentBars = appointmentCounts.map(({ status: appointmentStatus, count }) => ({
    label: t(`hospitalStaff.status.${appointmentStatus}`),
    value: count,
  }));
  const recentAppointmentTotal = dashboardAppointments?.length || 0;

  return (
    <div className="hospital-staff-page">
      <DashboardBanner className="hospital-staff-hero">
        <div className="page-header">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{t("hospitalStaff.subtitle")}</p>
          </div>
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {t("common.refresh")}
          </Button>
        </div>
      </DashboardBanner>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      {dashboardError && <Alert type="warning">{tm(dashboardError)}</Alert>}

      {dashboardAppointments && (
        <>
          <section className="hospital-staff-overview" aria-label={t("hospitalStaff.overview")}>
            <StatCard label={t("hospitalStaff.recentRequests")} value={formatLocalizedNumber(appointmentCounts[0].count, language)} tone="amber" />
            <StatCard label={t("hospitalStaff.recentConfirmed")} value={formatLocalizedNumber(appointmentCounts[1].count, language)} tone="blue" />
            <StatCard label={t("hospitalStaff.recentCompleted")} value={formatLocalizedNumber(appointmentCounts[3].count, language)} tone="green" />
            <StatCard label={t("hospitalStaff.recentNoShows")} value={formatLocalizedNumber(appointmentCounts[4].count, language)} tone="rose" />
          </section>

          <section className="hospital-staff-card">
            <h2 className="hospital-staff-chart-title">{t("hospitalStaff.recentStatusDistribution")}</h2>
            {recentAppointmentTotal
              ? <BarChart data={appointmentBars} />
              : <p className="hospital-staff-chart-empty">{t("hospitalStaff.emptyText")}</p>}
            <p className="hospital-staff-chart-note">{t("hospitalStaff.latestAppointmentsNote", { count: formatLocalizedNumber(recentAppointmentTotal, language) })}</p>
          </section>
        </>
      )}

      {!attendancePage && (
        <div className="hospital-staff-filters" role="tablist" aria-label={t("hospitalStaff.filterLabel")}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={status === filter}
              className={status === filter ? "active" : ""}
              onClick={() => setStatus(filter)}
            >
              {t(`hospitalStaff.status.${filter}`)}
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <section className="hospital-staff-card" aria-labelledby="hospital-staff-availability-title">
          <h2 id="hospital-staff-availability-title" className="hospital-staff-chart-title">
            {t("hospitalStaff.availabilityCoordinationTitle")}
          </h2>
          {availabilityRequestError && <Alert type="error">{tm(availabilityRequestError)}</Alert>}
          {loading ? (
            <p role="status">{t("hospitalStaff.loading")}</p>
          ) : eligibleVideoReferrals.length ? (
            <div className="hospital-staff-list">
              <h3>{t("hospitalStaff.sendAvailabilityRequestTitle")}</h3>
              {eligibleVideoReferrals.map((referral) => (
                <article className="hospital-staff-card hospital-staff-video-card" key={referral.referral_id}>
                  <div className="hospital-staff-card-heading">
                    <div>
                      <h3>{referral.patient_code}</h3>
                      <p>{referral.referral_code} · {referral.specialty_name}</p>
                    </div>
                  </div>
                  <dl className="hospital-staff-details">
                    <div><dt>{t("hospitalStaff.specialist")}</dt><dd>{referral.specialist_name}</dd></div>
                    <div><dt>{t("hospitalStaff.specialty")}</dt><dd>{referral.specialty_name}</dd></div>
                    <div><dt>{t("hospitalStaff.hospital")}</dt><dd>{referral.hospital_name}</dd></div>
                    <div><dt>{t("hospitalStaff.teleconsultConsent")}</dt>
                      <dd>{t(`specialist.teleconsultConsentStatus.${referral.teleconsult_consent_status}`)}</dd>
                    </div>
                  </dl>
                  {referral.signed_video_decision === true ? (
                    <>
                      {referral.available_slots?.length > 0 && (
                        <>
                          <h4>{t("hospitalStaff.existingSpecialistSlots")}</h4>
                          <form
                            className="hospital-staff-action-form"
                            onSubmit={(event) => submitDirectVideoSlot(event, referral.referral_id)}
                          >
                            <label>{t("hospitalStaff.alternativeSpecialistSlot")}
                              <select name="slot_id" required defaultValue="">
                                <option value="" disabled>{t("hospitalStaff.selectAlternativeSlot")}</option>
                                {referral.available_slots.map((slot) => (
                                  <option key={slot.id} value={slot.id}>
                                    {formatLocalizedDateTime(slot.slot_start, language)} – {formatLocalizedDateTime(slot.slot_end, language)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="hospital-staff-actions">
                              <Button
                                type="submit"
                                size="sm"
                                loading={busy === `video-slot-${referral.referral_id}`}
                                disabled={Boolean(busy)}
                              >
                                {t("hospitalStaff.confirmExistingSlot")}
                              </Button>
                            </div>
                          </form>
                        </>
                      )}
                      <form
                        className="hospital-staff-action-form"
                        onSubmit={(event) => submitAvailabilityRequest(event, referral.referral_id)}
                      >
                        <label>{t("hospitalStaff.requestedDateTime")}
                          <input name="requested_start" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <label>{t("hospitalStaff.requestedEndTime")}
                          <input name="requested_end" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <div className="hospital-staff-actions">
                          <Button
                            type="submit"
                            size="sm"
                            loading={busy === `availability-create-${referral.referral_id}`}
                            disabled={Boolean(busy)}
                          >
                            {t("hospitalStaff.sendAvailabilityRequest")}
                          </Button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <p role="note">{t("hospitalStaff.videoDecisionRequired")}</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="hospital-staff-chart-empty">{t("hospitalStaff.noEligibleVideoReferrals")}</p>
          )}

          <h3 className="hospital-staff-chart-title">{t("hospitalStaff.availabilityRequestsTitle")}</h3>
          {videoAvailabilityRequests.length ? (
            <div className="hospital-staff-list">
              {videoAvailabilityRequests.map((request) => {
                const canConfirmRequest = ["ACCEPTED", "SUGGESTED"].includes(request.status)
                  && request.teleconsult_consent_status === "ACTIVE"
                  && request.signed_video_decision === true
                  && (request.slot_id
                    ? request.slot_is_booked === false
                    : request.availability_status === "AVAILABLE");
                const canManageRequest = ["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED", "DECLINED"].includes(request.status);
                return (
                  <article
                    className="hospital-staff-card hospital-staff-video-card"
                    id={`video-availability-request-${request.id}`}
                    key={request.id}
                  >
                    <div className="hospital-staff-card-heading">
                      <div>
                        <h3>{request.patient_code}</h3>
                        <p>{request.referral_code} · {request.specialty_name}</p>
                      </div>
                      <Badge tone={statusTone(request.status === "CONFIRMED" ? "CONFIRMED" : "REQUESTED")}>
                        {t(`hospitalStaff.availabilityRequestStatus.${request.status}`)}
                      </Badge>
                    </div>
                    <dl className="hospital-staff-details">
                      <div><dt>{t("hospitalStaff.specialist")}</dt><dd>{request.specialist_name}</dd></div>
                      <div><dt>{t("hospitalStaff.specialty")}</dt><dd>{request.specialty_name}</dd></div>
                      <div><dt>{t("hospitalStaff.hospital")}</dt><dd>{request.hospital_name}</dd></div>
                      <div><dt>{t("hospitalStaff.requestedDateTime")}</dt>
                        <dd>{formatLocalizedDateTime(request.requested_start, language)} – {formatLocalizedDateTime(request.requested_end, language)}</dd>
                      </div>
                      <div><dt>{t("hospitalStaff.teleconsultConsent")}</dt>
                        <dd>{t(`specialist.teleconsultConsentStatus.${request.teleconsult_consent_status}`)}</dd>
                      </div>
                      <div><dt>{t("hospitalStaff.specialistAvailability")}</dt>
                        <dd>{t(`hospitalStaff.availability.${request.availability_status}`)}</dd>
                      </div>
                      {request.proposed_start && (
                        <div><dt>{t("hospitalStaff.specialistResponseTime")}</dt>
                          <dd>{formatLocalizedDateTime(request.proposed_start, language)} – {formatLocalizedDateTime(request.proposed_end, language)}</dd>
                        </div>
                      )}
                      {request.video_status && (
                        <div><dt>{t("hospitalStaff.confirmationStatus")}</dt>
                          <dd>{t(`hospitalStaff.status.${request.video_status}`)}</dd>
                        </div>
                      )}
                    </dl>
                    {request.response_reason && <p>{request.response_reason}</p>}
                    {request.alternative_slots?.length > 0 && (
                      <div className="hospital-staff-video-alternatives">
                        <p>{t("hospitalStaff.alternativeSpecialistSlot")}</p>
                        <ul>
                          {request.alternative_slots.map((slot) => (
                            <li key={slot.id}>
                              {formatLocalizedDateTime(slot.slot_start, language)} – {formatLocalizedDateTime(slot.slot_end, language)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {request.teleconsult_consent_status !== "ACTIVE"
                      && request.status !== "CONFIRMED"
                      && <Alert type="error">{t("hospitalStaff.videoConsentRequired")}</Alert>}
                    {request.status === "STAFF_REVIEW" && <p role="status">{t("hospitalStaff.waitingForStaffReview")}</p>}
                    {request.status === "PENDING" && <p role="status">{t("hospitalStaff.waitingForSpecialistResponse")}</p>}
                    {request.status === "DECLINED" && <p role="status">{t("hospitalStaff.specialistDeclinedAvailability")}</p>}
                    <div className="hospital-staff-actions">
                      {request.status === "STAFF_REVIEW" && (
                        <Button
                          type="button"
                          size="sm"
                          loading={busy === `availability-${request.id}`}
                          disabled={Boolean(busy)}
                          onClick={() => submitAvailabilityAction(request.id, "forward")}
                        >
                          {t("hospitalStaff.forwardToSpecialist")}
                        </Button>
                      )}
                      {["ACCEPTED", "SUGGESTED"].includes(request.status) && (
                        <Button
                          type="button"
                          size="sm"
                          loading={busy === `availability-${request.id}`}
                          disabled={Boolean(busy) || !canConfirmRequest}
                          onClick={() => submitAvailabilityAction(request.id, "confirm")}
                        >
                          {t("hospitalStaff.confirmAppointment")}
                        </Button>
                      )}
                      {request.status === "CONFIRMED" && request.video_consultation_id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busy === `provision-${request.video_consultation_id}`}
                          disabled={Boolean(busy)}
                          onClick={() => retryMeetingProvision(request.video_consultation_id)}
                        >
                          {t("hospitalStaff.retryMeetingSetup")}
                        </Button>
                      )}
                      {canManageRequest && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busy === `availability-${request.id}`}
                          disabled={Boolean(busy)}
                          onClick={() => setAction((current) => current?.id === request.id
                            ? null
                            : { id: request.id, type: "availability-reschedule" })}
                        >
                          {t("hospitalStaff.reschedule")}
                        </Button>
                      )}
                      {["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED"].includes(request.status) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() => setAction((current) => current?.id === request.id
                            ? null
                            : { id: request.id, type: "availability-decline" })}
                        >
                          {t("hospitalStaff.declineAvailabilityRequest")}
                        </Button>
                      )}
                    </div>
                    {action?.id === request.id && action.type === "availability-reschedule" && (
                      <form className="hospital-staff-action-form" onSubmit={(event) => {
                        event.preventDefault();
                        const values = new FormData(event.currentTarget);
                        submitAvailabilityAction(request.id, "reschedule", {
                          requested_start: new Date(values.get("requested_start")).toISOString(),
                          requested_end: new Date(values.get("requested_end")).toISOString(),
                          reason: values.get("reason"),
                        });
                      }}>
                        {request.alternative_slots?.length > 0 && (
                          <label>{t("hospitalStaff.alternativeSpecialistSlot")}
                            <select
                              name="alternative_slot"
                              defaultValue=""
                              onChange={(event) => {
                                const slot = request.alternative_slots.find(
                                  (candidate) => candidate.id === event.target.value
                                );
                                if (!slot) return;
                                const form = event.currentTarget.form;
                                form.elements.namedItem("requested_start").value = dateTimeLocalValue(slot.slot_start);
                                form.elements.namedItem("requested_end").value = dateTimeLocalValue(slot.slot_end);
                              }}
                            >
                              <option value="">{t("hospitalStaff.selectAlternativeSlot")}</option>
                              {request.alternative_slots.map((slot) => (
                                <option key={slot.id} value={slot.id}>
                                  {formatLocalizedDateTime(slot.slot_start, language)} – {formatLocalizedDateTime(slot.slot_end, language)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>{t("hospitalStaff.requestedDateTime")}
                          <input name="requested_start" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <label>{t("hospitalStaff.requestedEndTime")}
                          <input name="requested_end" type="datetime-local" required min={localDateTimeMin()} />
                        </label>
                        <label>{t("hospitalStaff.rescheduleReason")}
                          <textarea name="reason" rows="2" maxLength="1000" required />
                        </label>
                        <div className="hospital-staff-actions">
                          <Button type="submit" size="sm" loading={busy === `availability-${request.id}`} disabled={Boolean(busy)}>
                            {t("hospitalStaff.saveAction")}
                          </Button>
                        </div>
                      </form>
                    )}
                    {action?.id === request.id && action.type === "availability-decline" && (
                      <form className="hospital-staff-action-form" onSubmit={(event) => {
                        event.preventDefault();
                        const values = new FormData(event.currentTarget);
                        submitAvailabilityAction(request.id, "decline", { reason: values.get("reason") });
                      }}>
                        <label>{t("hospitalStaff.declineReason")}
                          <textarea name="reason" rows="2" maxLength="1000" required />
                        </label>
                        <div className="hospital-staff-actions">
                          <Button type="submit" size="sm" loading={busy === `availability-${request.id}`} disabled={Boolean(busy)}>
                            {t("hospitalStaff.declineAvailabilityRequest")}
                          </Button>
                        </div>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="hospital-staff-chart-empty">{t("hospitalStaff.noAvailabilityRequests")}</p>
          )}
        </section>
      )}

      {!loading && (
        <section className="hospital-staff-card" aria-labelledby="hospital-staff-video-title">
          <h2 id="hospital-staff-video-title" className="hospital-staff-chart-title">
            {t("hospitalStaff.videoConsultationRequests")}
          </h2>
          {videoConsultationError ? (
            <p role="alert">{tm(videoConsultationError)}</p>
          ) : videoConsultations.length ? (
            <div className="hospital-staff-list">
              {videoConsultations.map((consultation) => {
                const canConfirm = ["REQUESTED", "RESCHEDULED"].includes(consultation.status_code)
                  && consultation.availability_status === "RESERVED"
                  && consultation.teleconsult_consent_status === "ACTIVE";
                const alternatives = consultation.alternative_slots || [];
                return (
                  <article className="hospital-staff-card hospital-staff-video-card" key={consultation.id}>
                    <div className="hospital-staff-card-heading">
                      <div>
                        <h3>{consultation.patient_code}</h3>
                        <p>{consultation.referral_code} · {consultation.specialty_name}</p>
                      </div>
                      <Badge tone={statusTone(consultation.status_code)}>
                        {t(`hospitalStaff.status.${consultation.status_code}`)}
                      </Badge>
                    </div>

                    <dl className="hospital-staff-details">
                      <div><dt>{t("hospitalStaff.specialist")}</dt><dd>{consultation.specialist_name}</dd></div>
                      <div><dt>{t("hospitalStaff.specialty")}</dt><dd>{consultation.specialty_name}</dd></div>
                      <div><dt>{t("hospitalStaff.requestedDateTime")}</dt><dd>
                        {formatLocalizedDateTime(consultation.scheduled_at, language)} – {formatLocalizedDateTime(consultation.slot_end, language)}
                      </dd></div>
                      <div><dt>{t("hospitalStaff.hospital")}</dt><dd>{consultation.hospital_name}</dd></div>
                      <div>
                        <dt>{t("hospitalStaff.teleconsultConsent")}</dt>
                        <dd>{t(`specialist.teleconsultConsentStatus.${consultation.teleconsult_consent_status}`)}</dd>
                      </div>
                      <div>
                        <dt>{t("hospitalStaff.specialistAvailability")}</dt>
                        <dd>{t(`hospitalStaff.availability.${consultation.availability_status}`)}</dd>
                      </div>
                    </dl>

                    <div className="hospital-staff-actions">
                      {["REQUESTED", "RESCHEDULED"].includes(consultation.status_code) && (
                        <Button
                          type="button"
                          size="sm"
                          loading={busy === `video-${consultation.id}`}
                          disabled={Boolean(busy) || !canConfirm}
                          onClick={() => submitVideoAction(consultation.id, "confirm")}
                        >
                          {t("hospitalStaff.confirmAppointment")}
                        </Button>
                      )}
                      {consultation.status_code === "CANCELLED"
                        && consultation.signed_video_decision === true
                        && consultation.teleconsult_consent_status === "ACTIVE"
                        && !videoAvailabilityRequests.some((request) =>
                          request.referral_id === consultation.referral_id
                          && ["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED"].includes(request.status)
                        )
                        && !videoConsultations.some((other) =>
                          other.referral_id === consultation.referral_id
                          && other.id !== consultation.id
                          && other.status_code !== "CANCELLED"
                          && other.is_active !== false
                        ) && (
                        <Button
                          type="button"
                          size="sm"
                          loading={busy === `video-${consultation.id}`}
                          disabled={Boolean(busy)}
                          onClick={() => setAction((current) => current?.id === consultation.id
                            ? null
                            : { id: consultation.id, type: "cancelled-video-reschedule" })}
                        >
                          {t("hospitalStaff.rescheduleAppointment")}
                        </Button>
                      )}
                    </div>

                    {action?.id === consultation.id && action.type === "cancelled-video-reschedule" && (() => {
                      const eligible = eligibleVideoReferrals.find(
                        (referral) => referral.referral_id === consultation.referral_id
                      );
                      const publishedSlots = eligible?.available_slots || [];
                      return (
                        <div className="hospital-staff-video-alternatives">
                          <p role="status">{t("hospitalStaff.rescheduleCancelledVideoHint")}</p>
                          {publishedSlots.length ? (
                            <form
                              className="hospital-staff-action-form"
                              onSubmit={(event) => submitDirectVideoSlot(event, consultation.referral_id)}
                            >
                              <label>{t("hospitalStaff.alternativeSpecialistSlot")}
                                <select name="slot_id" required defaultValue="">
                                  <option value="" disabled>{t("hospitalStaff.selectAlternativeSlot")}</option>
                                  {publishedSlots.map((slot) => (
                                    <option key={slot.id} value={slot.id}>
                                      {formatLocalizedDateTime(slot.slot_start, language)} – {formatLocalizedDateTime(slot.slot_end, language)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="hospital-staff-actions">
                                <Button
                                  type="submit"
                                  size="sm"
                                  loading={busy === `video-slot-${consultation.referral_id}`}
                                  disabled={Boolean(busy)}
                                >
                                  {t("hospitalStaff.confirmExistingSlot")}
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <form
                              className="hospital-staff-action-form"
                              onSubmit={(event) => submitAvailabilityRequest(
                                event,
                                consultation.referral_id,
                                consultation.id
                              )}
                            >
                              <p>{t("hospitalStaff.noPublishedSlotsForReschedule")}</p>
                              <label>{t("hospitalStaff.requestedDateTime")}
                                <input name="requested_start" type="datetime-local" required min={localDateTimeMin()} />
                              </label>
                              <label>{t("hospitalStaff.requestedEndTime")}
                                <input name="requested_end" type="datetime-local" required min={localDateTimeMin()} />
                              </label>
                              <div className="hospital-staff-actions">
                                <Button
                                  type="submit"
                                  size="sm"
                                  loading={busy === `availability-create-${consultation.referral_id}`}
                                  disabled={Boolean(busy)}
                                >
                                  {t("hospitalStaff.requestNewSpecialistTime")}
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })()}

                    {consultation.availability_status !== "RESERVED"
                      && ["REQUESTED", "RESCHEDULED", "CONFIRMED"].includes(consultation.status_code) && (
                        <div className="hospital-staff-video-alternatives">
                          <p role="status">
                            {t(consultation.availability_status === "EXPIRED"
                              ? "hospitalStaff.slotExpired"
                              : "hospitalStaff.slotUnavailable")}
                          </p>
                          {consultation.teleconsult_consent_status !== "ACTIVE" && (
                            <p role="alert">{t("hospitalStaff.videoConsentRequired")}</p>
                          )}
                          {alternatives.length ? (
                            <form className="hospital-staff-action-form" onSubmit={(event) => {
                              event.preventDefault();
                              const formData = new FormData(event.currentTarget);
                              submitVideoAction(consultation.id, "reschedule", {
                                slot_id: formData.get("slot_id"),
                                reason: formData.get("reason"),
                              });
                            }}>
                              <label>{t("hospitalStaff.alternativeSpecialistSlot")}
                                <select name="slot_id" required defaultValue="">
                                  <option value="" disabled>{t("hospitalStaff.selectAlternativeSlot")}</option>
                                  {alternatives.map((slot) => (
                                    <option key={slot.id} value={slot.id}>
                                      {formatLocalizedDateTime(slot.slot_start, language)} – {formatLocalizedDateTime(slot.slot_end, language)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>{t("hospitalStaff.rescheduleReason")}
                                <textarea name="reason" rows="2" maxLength="1000" required />
                              </label>
                              <div className="hospital-staff-actions">
                                <Button
                                  type="submit"
                                  size="sm"
                                  loading={busy === `video-${consultation.id}`}
                                  disabled={Boolean(busy) || consultation.teleconsult_consent_status !== "ACTIVE"}
                                >
                                  {t("hospitalStaff.rescheduleVideoRequest")}
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p>{t("hospitalStaff.noAlternativeSlots")}</p>
                              {["REQUESTED", "RESCHEDULED"].includes(consultation.status_code)
                                && consultation.teleconsult_consent_status === "ACTIVE"
                                && consultation.signed_video_decision === true && (
                                  <form
                                    className="hospital-staff-action-form"
                                    onSubmit={(event) => submitAvailabilityRequest(
                                      event,
                                      consultation.referral_id,
                                      consultation.id
                                    )}
                                  >
                                    <label>{t("hospitalStaff.requestedDateTime")}
                                      <input name="requested_start" type="datetime-local" required min={localDateTimeMin()} />
                                    </label>
                                    <label>{t("hospitalStaff.requestedEndTime")}
                                      <input name="requested_end" type="datetime-local" required min={localDateTimeMin()} />
                                    </label>
                                    <div className="hospital-staff-actions">
                                      <Button
                                        type="submit"
                                        size="sm"
                                        loading={busy === `availability-create-${consultation.referral_id}`}
                                        disabled={Boolean(busy)}
                                      >
                                        {t("hospitalStaff.requestNewSpecialistTime")}
                                      </Button>
                                    </div>
                                  </form>
                                )}
                            </>
                          )}
                        </div>
                      )}
                    <p className="hospital-staff-chart-note">{t("hospitalStaff.specialistRecordsOutcome")}</p>
                  </article>
                );
              })}
            </div>
          ) : <p className="hospital-staff-chart-empty">{t("hospitalStaff.noVideoConsultationRequests")}</p>}
        </section>
      )}

      {loading ? <PageLoader label={t("hospitalStaff.loading")} /> : appointments.length === 0 ? (
        <section className="hospital-staff-card">
          <EmptyState
            icon={attendancePage ? CalendarClock : Building}
            title={t("hospitalStaff.emptyTitle")}
            text={t("hospitalStaff.emptyText")}
          />
        </section>
      ) : (
        <div className="hospital-staff-list">
          {appointments.map((appointment) => (
            <article className="hospital-staff-card" key={appointment.id}>
              <div className="hospital-staff-card-heading">
                <div>
                  <h2>{appointment.patient_code}</h2>
                  <p>{appointment.referral_code} · {appointment.specialty_name}</p>
                </div>
                <Badge tone={statusTone(appointment.status_code)}>
                  {t(`hospitalStaff.status.${appointment.status_code}`)}
                </Badge>
              </div>

              <dl className="hospital-staff-details">
                <div><dt>{t("hospitalStaff.patientId")}</dt><dd>{appointment.patient_code}</dd></div>
                <div><dt>{t("hospitalStaff.referralId")}</dt><dd>{appointment.referral_code}</dd></div>
                <div><dt>{t("hospitalStaff.specialty")}</dt><dd>{appointment.specialty_name}</dd></div>
                <div><dt>{t("hospitalStaff.requestingClinician")}</dt><dd>{appointment.requesting_clinician}</dd></div>
                {appointment.specialist_name && (
                  <div><dt>{t("hospitalStaff.specialist")}</dt><dd>{appointment.specialist_name}</dd></div>
                )}
                <div><dt>{t("hospitalStaff.dateTime")}</dt><dd>{formatLocalizedDateTime(appointment.scheduled_at, language)}</dd></div>
                <div><dt>{t("hospitalStaff.coordinationNotes")}</dt><dd>{appointment.location_note || appointment.assigned_service || t("common.notProvided")}</dd></div>
              </dl>

              <div className="hospital-staff-actions">
                {appointment.status_code === "REQUESTED" && (
                  <>
                    {!isVideoConsultationAppointment(appointment) ? (
                      <>
                        <Button type="button" size="sm" loading={busy === appointment.id}
                          disabled={Boolean(busy)} onClick={() => submitAction(appointment.id, "confirm")}>
                          {t("hospitalStaff.confirm")}
                        </Button>
                        <Button type="button" size="sm" variant="secondary"
                          onClick={() => setAction({ id: appointment.id, type: "reschedule" })}>
                          {t("hospitalStaff.reschedule")}
                        </Button>
                      </>
                    ) : <p role="status">{t("hospitalStaff.videoRequestUseQueue")}</p>}
                    <Button type="button" size="sm" variant="secondary"
                      onClick={() => setAction({ id: appointment.id, type: "cancel" })}>
                      {t("hospitalStaff.cancel")}
                    </Button>
                  </>
                )}
                {appointment.status_code === "CONFIRMED" && (
                  <>
                    {!isVideoConsultationAppointment(appointment) && (
                      <>
                        <Button type="button" size="sm" variant="secondary"
                          onClick={() => setAction({ id: appointment.id, type: "attendance" })}>
                          {t("hospitalStaff.recordAttendance")}
                        </Button>
                        <Button type="button" size="sm" variant="secondary"
                          onClick={() => setAction({ id: appointment.id, type: "reschedule" })}>
                          {t("hospitalStaff.reschedule")}
                        </Button>
                      </>
                    )}
                  </>
                )}
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => openHistory(appointment.id)}>
                  <History size={15} /> {t("hospitalStaff.viewHistory")}
                </Button>
              </div>

              {action?.id === appointment.id && (
                <form className="hospital-staff-action-form" onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  if (action.type === "reschedule") {
                    submitAction(appointment.id, "reschedule", {
                      scheduled_at: new Date(formData.get("scheduled_at")).toISOString(),
                      reason: formData.get("reason"),
                    });
                  } else if (action.type === "cancel") {
                    submitAction(appointment.id, "cancel", { reason: formData.get("reason") });
                  } else {
                    if (formData.get("attendance") === "NO_SHOW" && !String(formData.get("reason") || "").trim()) {
                      setError(t("hospitalStaff.noShowReasonRequired"));
                      return;
                    }
                    submitAction(appointment.id, "attendance", {
                      attendance: formData.get("attendance"),
                      reason: formData.get("reason"),
                    });
                  }
                }}>
                  {action.type === "reschedule" && (
                    <label>{t("hospitalStaff.newDateTime")}
                      <input name="scheduled_at" type="datetime-local" required min={localDateTimeMin()} />
                    </label>
                  )}
                  {action.type === "attendance" && (
                    <label>{t("hospitalStaff.attendance")}
                      <select name="attendance" defaultValue="ATTENDED">
                        <option value="ATTENDED">{t("hospitalStaff.attended")}</option>
                        <option value="NO_SHOW">{t("hospitalStaff.noShow")}</option>
                      </select>
                    </label>
                  )}
                  <label>
                    {action.type === "reschedule" ? t("hospitalStaff.rescheduleReason")
                      : action.type === "cancel" ? t("hospitalStaff.cancelReason")
                        : t("hospitalStaff.attendanceReason")}
                    <textarea name="reason" rows="2" maxLength="1000"
                      required={action.type !== "attendance" || undefined} />
                  </label>
                  <div className="hospital-staff-actions">
                    <Button type="submit" size="sm" loading={busy === appointment.id} disabled={Boolean(busy)}>
                      {t("hospitalStaff.saveAction")}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setAction(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                  {action.type === "attendance" && (
                    <small>{t("hospitalStaff.noShowReasonHint")}</small>
                  )}
                </form>
              )}

              {history?.id === appointment.id && (
                <div className="hospital-staff-history">
                  <h3>{t("hospitalStaff.historyTitle")}</h3>
                  {history.loading ? <p>{t("hospitalStaff.loading")}</p> : history.items.length ? history.items.map((item, index) => (
                    <div className="hospital-staff-history-row" key={`${item.changed_at}-${index}`}>
                      <strong>{item.from_status ? `${t(`hospitalStaff.status.${item.from_status}`)} → ` : ""}
                        {t(`hospitalStaff.status.${item.to_status}`)}</strong>
                      <span>{formatLocalizedDateTime(item.changed_at, language)} · {item.changed_by}</span>
                      {item.reason && <small>{item.reason}</small>}
                    </div>
                  )) : <p>{t("hospitalStaff.noHistory")}</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
