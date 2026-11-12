import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, RefreshCw, Search, Users } from "lucide-react";
import { useLocation } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, BarChart, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import "./NavigatorDashboard.css";

const PAGE_SIZE = 10;

function phoneHref(phone) {
  if (typeof phone !== "string") return null;
  const value = phone.trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15
    ? `tel:${value.replace(/[\s().-]/g, "")}`
    : null;
}

function ContactNumber({ phone, missingLabel, callLabel }) {
  const href = phoneHref(phone);
  return (
    <>
      <span>{phone || missingLabel}</span>
      {href && <a className="navigator-call-link" href={href}>{callLabel}</a>}
    </>
  );
}

const FILTERS = [
  ["all", "navigator.filterAll"],
  ["pending", "navigator.filterPending"],
  ["contacted", "navigator.filterContacted"],
  ["scheduled", "navigator.filterScheduled"],
  ["completed", "navigator.filterCompleted"],
  ["unreachable", "navigator.filterUnreachable"],
];

const EMPTY_DASHBOARD = {
  assigned: 0,
  pending: 0,
  contacted: 0,
  scheduled: 0,
  completed: 0,
  unreachable: 0,
};

function readableDate(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDateTimeMin() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function NavigatorDashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const pageTitle = location.pathname === "/navigator/appointments"
    ? t("navigator.appointmentsTitle")
    : location.pathname === "/navigator/patients"
      ? t("navigator.patientsTitle")
      : location.pathname === "/navigator/referrals"
        ? t("navigator.referralsTitle")
        : t("navigator.title");
  const canRecordContact = user?.permissions?.includes("navigation.update") === true;
  const canBookAppointment = user?.permissions?.includes("appointment.book") === true;
  const initialFilter = location.pathname === "/navigator/appointments" ? "scheduled" : "all";

  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [referrals, setReferrals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 0, total: 0, page_size: PAGE_SIZE });
  const [filter, setFilter] = useState(initialFilter);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [booking, setBooking] = useState(false);
  const [submittingPreferredTime, setSubmittingPreferredTime] = useState(false);

  const loadPage = useCallback(async (isRefresh = false) => {
    setError("");
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [summaryResponse, listResponse] = await Promise.all([
        api.get("/navigator/dashboard"),
        api.get("/navigator/referrals", { params: { filter, page, page_size: PAGE_SIZE } }),
      ]);
      setDashboard(summaryResponse.data.dashboard || EMPTY_DASHBOARD);
      setReferrals(listResponse.data.referrals || []);
      setPagination(listResponse.data.pagination || { page: 1, total_pages: 0, total: 0, page_size: PAGE_SIZE });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("navigator.loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, page, t]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    setFilter(location.pathname === "/navigator/appointments" ? "scheduled" : "all");
    setPage(1);
    setSelected(null);
  }, [location.pathname]);

  const openReferral = async (referralId) => {
    setActionError("");
    setSuccess("");
    try {
      const response = await api.get(`/navigator/referrals/${referralId}`);
      setSelected(response.data);
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || t("navigator.detailFailed"));
    }
  };

  const refreshSelected = async () => {
    if (!selected?.referral?.id) return;
    const response = await api.get(`/navigator/referrals/${selected.referral.id}`);
    setSelected(response.data);
  };

  const submitContact = async (event) => {
    event.preventDefault();
    if (!selected?.referral?.id) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSavingContact(true);
    setActionError("");
    setSuccess("");
    try {
      await api.post(`/navigator/referrals/${selected.referral.id}/contacts`, {
        channel: values.get("channel"),
        outcome: values.get("outcome"),
        recipient: values.get("recipient"),
        notes: values.get("notes"),
      });
      form.reset();
      await refreshSelected();
      await loadPage(true);
      setSuccess(t("navigator.contactSaved"));
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || t("navigator.actionFailed"));
    } finally {
      setSavingContact(false);
    }
  };

  const submitAppointment = async (event) => {
    event.preventDefault();
    if (!selected?.referral?.id) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBooking(true);
    setActionError("");
    setSuccess("");
    try {
      const localDate = values.get("scheduled_at");
      await api.post(`/navigator/referrals/${selected.referral.id}/appointments`, {
        scheduled_at: new Date(localDate).toISOString(),
        assigned_service: values.get("assigned_service"),
        location_note: values.get("location_note"),
      });
      form.reset();
      await refreshSelected();
      await loadPage(true);
      setSuccess(t("navigator.appointmentRequested"));
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || t("navigator.actionFailed"));
    } finally {
      setBooking(false);
    }
  };

  const submitVideoPreferredTime = async (event) => {
    event.preventDefault();
    if (!selected?.referral?.id) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmittingPreferredTime(true);
    setActionError("");
    setSuccess("");
    try {
      await api.post(`/navigator/referrals/${selected.referral.id}/video-preferred-time`, {
        requested_start: new Date(values.get("requested_start")).toISOString(),
        requested_end: new Date(values.get("requested_end")).toISOString(),
      });
      form.reset();
      const wasCancelledReschedule = (selected?.video_consultations || []).some(
        (consultation) => consultation.status_code === "CANCELLED"
      );
      await refreshSelected();
      await loadPage(true);
      setSuccess(
        wasCancelledReschedule
          ? t("navigator.rescheduleAppointmentSubmitted")
          : t("navigator.videoPreferredTimeSubmitted")
      );
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || t("navigator.actionFailed"));
    } finally {
      setSubmittingPreferredTime(false);
    }
  };

  const isVideoReferral = selected?.referral?.mode === "VIDEO_CONSULT"
    || selected?.specialist_decision?.decision_type === "VIDEO_CONSULTATION";
  const hasActiveVideoRequest = (selected?.video_availability_requests || []).some((request) =>
    ["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED"].includes(request.status)
  );
  const hasCancelledVideoAppointment = (selected?.video_consultations || []).some(
    (consultation) => consultation.status_code === "CANCELLED"
  );
  const hasActiveVideoAppointment = (selected?.video_consultations || []).some(
    (consultation) => consultation.status_code !== "CANCELLED" && consultation.is_active !== false
  );
  const canRescheduleCancelledVideo = canBookAppointment
    && isVideoReferral
    && hasCancelledVideoAppointment
    && !hasActiveVideoAppointment
    && !hasActiveVideoRequest;
  const showVideoPreferredTimeForm = canBookAppointment
    && isVideoReferral
    && !hasActiveVideoRequest
    && !hasActiveVideoAppointment;

  const statCards = useMemo(() => [
    { key: "assigned", label: t("navigator.statAssigned"), icon: Users, tone: "green" },
    { key: "pending", label: t("navigator.statPending"), icon: ClipboardList, tone: "amber" },
    { key: "scheduled", label: t("navigator.statScheduled"), icon: CalendarClock, tone: "blue" },
    { key: "completed", label: t("navigator.statCompleted"), icon: CheckCircle2, tone: "violet" },
  ], [t]);

  const selectFilter = (nextFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="care-page navigator-page">
      <DashboardBanner className="care-hero navigator-hero">
        <div>
          <span className="care-eyebrow"><Users size={15} aria-hidden="true" /> {t("care.navEyebrow")}</span>
          <h1 className="care-hero-title">{pageTitle}</h1>
          <p className="care-hero-text">{t("navigator.intro")}</p>
        </div>
        <button className="btn btn-secondary navigator-refresh" type="button" onClick={() => loadPage(true)} disabled={refreshing}>
          <RefreshCw size={16} aria-hidden="true" className={refreshing ? "navigator-spin" : ""} />
          {refreshing ? t("navigator.refreshing") : t("navigator.refresh")}
        </button>
      </DashboardBanner>

      <section className="navigator-stats" aria-label={t("navigator.overview")}>
        {statCards.map((card) => (
          <StatCard key={card.key} icon={card.icon} tone={card.tone} label={card.label} value={dashboard[card.key] ?? 0} />
        ))}
      </section>

      {error && <Alert type="error">{error} <button type="button" className="navigator-inline-button" onClick={() => loadPage()}>{t("common.tryAgain")}</button></Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {actionError && <Alert type="error">{actionError}</Alert>}

      <section className="district-card navigator-status-chart">
        <h2 className="district-card-title">{t("navigator.statusDistribution")}</h2>
        {dashboard.assigned ? (
          <BarChart data={[
            { label: t("navigator.statPending"), value: dashboard.pending },
            { label: t("navigator.statContacted"), value: dashboard.contacted },
            { label: t("navigator.statScheduled"), value: dashboard.scheduled },
            { label: t("navigator.statCompleted"), value: dashboard.completed },
            { label: t("navigator.statUnreachable"), value: dashboard.unreachable },
          ]} />
        ) : <p className="district-empty">{t("navigator.emptyText")}</p>}
      </section>

      <section className="district-card navigator-queue" aria-labelledby="navigator-queue-heading">
        <div className="navigator-queue-heading">
          <div>
            <h2 id="navigator-queue-heading" className="district-card-title">{t("navigator.queueTitle")}</h2>
            <p className="care-muted">{t("navigator.queueHint")}</p>
          </div>
          <div className="navigator-count">{pagination.total} {t("navigator.referralsCount")}</div>
        </div>

        <div className="navigator-filters" role="group" aria-label={t("navigator.filterLabel")}>
          {FILTERS.map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              className={`navigator-filter${filter === value ? " active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => selectFilter(value)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="navigator-loading" role="status">{t("navigator.loading")}</div>
        ) : referrals.length === 0 ? (
          <div className="navigator-empty">
            <Search size={24} aria-hidden="true" />
            <strong>{t("navigator.emptyTitle")}</strong>
            <span>{t("navigator.emptyText")}</span>
          </div>
        ) : (
          <div className="navigator-referral-list">
            {referrals.map((referral) => (
              <article className="navigator-referral-card" key={referral.id}>
                <div className="navigator-referral-main">
                  <div className="navigator-referral-title">
                    <div>
                      <h3>{referral.patient_name}</h3>
                      <span className="navigator-patient-code">{referral.patient_code} · {referral.referral_code}</span>
                    </div>
                    <span className={`navigator-priority priority-${String(referral.priority_code || "").toLowerCase()}`}>
                      {referral.priority_name}
                    </span>
                  </div>
                  <div className="navigator-referral-meta">
                    <span><strong>{t("navigator.specialty")}:</strong> {referral.specialty_name}</span>
                    <span><strong>{t("navigator.hospital")}:</strong> {referral.hospital_name}</span>
                    <span><strong>{t("navigator.referralStatus")}:</strong> {referral.referral_status}</span>
                    {referral.specialist_name && <span><strong>{t("navigator.specialist")}:</strong> {referral.specialist_name}</span>}
                    {referral.appointment_at && <span><strong>{t("navigator.appointment")}:</strong> {readableDate(referral.appointment_at, language)} ({referral.appointment_status_name})</span>}
                  </div>
                </div>
                <button className="btn btn-secondary navigator-open" type="button" onClick={() => openReferral(referral.id)}>
                  {t("navigator.openDetails")}
                </button>
              </article>
            ))}
          </div>
        )}

        {!loading && pagination.total_pages > 0 && (
          <div className="navigator-pagination">
            <span>{t("navigator.pageInfo", { page: pagination.page, pages: pagination.total_pages, total: pagination.total })}</span>
            <div>
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("navigator.previous")}</button>
              <button type="button" className="btn btn-secondary" disabled={page >= pagination.total_pages} onClick={() => setPage((current) => current + 1)}>{t("navigator.next")}</button>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <section className="district-card navigator-detail" aria-labelledby="navigator-detail-title">
          <div className="navigator-detail-heading">
            <div>
              <h2 id="navigator-detail-title" className="district-card-title">{selected.referral.patient_name}</h2>
              <p className="care-muted">{selected.referral.patient_code} · {selected.referral.referral_code}</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>{t("common.close")}</button>
          </div>

          <div className="navigator-detail-grid">
            <div className="navigator-detail-summary">
              <h3>{t("navigator.referralDetails")}</h3>
              <dl>
                <div className="navigator-contact-number">
                  <dt>{t("navigator.patientContact")}</dt>
                  <dd>
                    <ContactNumber
                      phone={selected.referral.contact_phone}
                      missingLabel={t("common.notProvided")}
                      callLabel={t("navigator.call")}
                    />
                    {!selected.referral.contact_phone && (
                      <small>{t("navigator.contactHealthWorkerFallback")}</small>
                    )}
                  </dd>
                </div>
                <div className="navigator-contact-number">
                  <dt>{t("navigator.healthWorkerContact")}</dt>
                  <dd>
                    {selected.referral.health_worker_name && (
                      <strong>{selected.referral.health_worker_name}</strong>
                    )}
                    <ContactNumber
                      phone={selected.referral.health_worker_phone}
                      missingLabel={t("common.notProvided")}
                      callLabel={t("navigator.call")}
                    />
                  </dd>
                </div>
                <div><dt>{t("navigator.hospital")}</dt><dd>{selected.referral.hospital_name}</dd></div>
                <div><dt>{t("navigator.specialty")}</dt><dd>{selected.referral.specialty_name}</dd></div>
                <div><dt>{t("navigator.specialist")}</dt><dd>{selected.referral.specialist_name || t("common.notAssigned")}</dd></div>
                <div><dt>{t("navigator.priority")}</dt><dd>{selected.referral.priority_name}</dd></div>
                <div><dt>{t("navigator.referralReason")}</dt><dd>{selected.referral.reason}</dd></div>
              </dl>
            </div>

            <div className="navigator-history">
              <h3>{t("navigator.referralTimeline")}</h3>
              {selected.status_history?.length ? selected.status_history.map((item, index) => (
                <div className="navigator-history-row" key={`${item.changed_at}-${index}`}>
                  <strong>{item.from_status ? `${item.from_status} → ` : ""}{item.to_status}</strong>
                  <span>{readableDate(item.changed_at, language)}</span>
                </div>
              )) : <p className="care-muted">{t("navigator.noTimeline")}</p>}

              <h3>{t("navigator.appointmentHistory")}</h3>
              {selected.appointments.length ? selected.appointments.map((appointment) => (
                <div className="navigator-history-row" key={appointment.id}>
                  <strong>{readableDate(appointment.scheduled_at, language)}</strong>
                  <span>{appointment.status_name} · {appointment.attendance}</span>
                  {appointment.assigned_service && <small>{appointment.assigned_service}</small>}
                </div>
              )) : <p className="care-muted">{t("navigator.noAppointments")}</p>}

              <h3>{t("navigator.videoAvailabilityHistory")}</h3>
              {selected.video_availability_requests?.length
                ? selected.video_availability_requests.map((request) => (
                  <div className="navigator-history-row" key={request.id}>
                    <strong>{t(`navigator.availabilityRequestStatus.${request.status}`)}</strong>
                    <span>
                      {t("navigator.availabilityRequestedTime")}:{" "}
                      {readableDate(request.requested_start, language)} – {readableDate(request.requested_end, language)}
                    </span>
                    {request.proposed_start && (
                      <span>
                        {t("navigator.availabilityProposedTime")}:{" "}
                        {readableDate(request.proposed_start, language)} – {readableDate(request.proposed_end, language)}
                      </span>
                    )}
                    {request.response_reason && (
                      <small>{t("navigator.availabilityResponseReason")}: {request.response_reason}</small>
                    )}
                    {request.video_status && (
                      <small>
                        {t("navigator.availabilityConfirmation")}:{" "}
                        {t(`hospitalStaff.status.${request.video_status}`)}
                      </small>
                    )}
                  </div>
                ))
                : <p className="care-muted">{t("navigator.noVideoAvailabilityRequests")}</p>}
              {selected.video_consultations?.length > 0 && (
                <>
                  <h3>{t("navigator.directVideoAppointments")}</h3>
                  {selected.video_consultations.map((consultation) => (
                    <div className="navigator-history-row" key={consultation.id}>
                      <strong>{t(`hospitalStaff.status.${consultation.status_code}`)}</strong>
                      <span>
                        {readableDate(consultation.slot_start, language)} – {readableDate(consultation.slot_end, language)}
                      </span>
                      <small>{consultation.specialist_name} · {consultation.hospital_name}</small>
                      {consultation.status_code === "CANCELLED" && canRescheduleCancelledVideo && (
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => {
                            document.getElementById("navigator-video-preferred-time")?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                          }}
                        >
                          {t("navigator.rescheduleAppointment")}
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}

              <h3>{t("navigator.contactHistory")}</h3>
              {selected.contacts.length ? selected.contacts.map((contact) => (
                <div className="navigator-history-row" key={contact.id}>
                  <strong>{t(`navigator.contactRecipient.${contact.recipient || "UNKNOWN"}`)} · {contact.channel} · {contact.outcome}</strong>
                  <span>{readableDate(contact.contacted_at, language)}</span>
                  {contact.notes && <small>{contact.notes}</small>}
                </div>
              )) : <p className="care-muted">{t("navigator.noContacts")}</p>}
            </div>
          </div>

          <section className="navigator-specialist-decision">
            <h3>{t("navigator.specialistDecision")}</h3>
            {selected.decision_storage_unavailable ? (
              <Alert type="info">{t("navigator.decisionStorageUnavailable")}</Alert>
            ) : selected.specialist_decision ? (
              <>
                <p className="care-muted">{t("navigator.decisionCoordination")}</p>
                <dl>
                  <div><dt>{t("specialist.decisionType")}</dt><dd>{t(`navigator.specialistDecisionTypes.${selected.specialist_decision.decision_type}`)}</dd></div>
                  <div><dt>{t("specialist.decisionReason")}</dt><dd>{selected.specialist_decision.clinical_reason}</dd></div>
                  <div><dt>{t("specialist.clinicalRecommendation")}</dt><dd>{selected.specialist_decision.clinical_recommendation || "—"}</dd></div>
                  <div><dt>{t("specialist.decisionInstructions")}</dt><dd>{selected.specialist_decision.instructions || "—"}</dd></div>
                  {selected.specialist_decision.hospital_name && (
                    <div><dt>{t("navigator.hospital")}</dt><dd>{selected.specialist_decision.hospital_name}</dd></div>
                  )}
                  {selected.specialist_decision.investigation_name && (
                    <div><dt>{t("specialist.investigationType")}</dt><dd>{selected.specialist_decision.investigation_name}</dd></div>
                  )}
                  {selected.specialist_decision.follow_up_date && (
                    <div><dt>{t("specialist.followUpDate")}</dt><dd>{readableDate(selected.specialist_decision.follow_up_date, language)}</dd></div>
                  )}
                </dl>
                {selected.specialist_decision.decision_type === "EMERGENCY_HOSPITAL_REFERRAL"
                  && <Alert type="error">{t("specialist.emergencySubmitted")}</Alert>}
              </>
            ) : <p className="care-muted">{t("navigator.noSpecialistDecision")}</p>}
          </section>

          <div className="navigator-detail-grid navigator-actions">
            {canRecordContact && (
              <form className="navigator-form" onSubmit={submitContact}>
                <h3>{t("navigator.recordContact")}</h3>
                <label>{t("navigator.contactRecipientLabel")}
                  <select name="recipient" required defaultValue="PATIENT">
                    <option value="PATIENT">{t("navigator.contactRecipient.PATIENT")}</option>
                    <option value="HEALTH_WORKER" disabled={!selected.referral.health_worker_id}>
                      {t("navigator.contactRecipient.HEALTH_WORKER")}
                    </option>
                  </select>
                </label>
                <label>{t("navigator.channel")}
                  <select name="channel" required defaultValue="PHONE">
                    <option value="PHONE">{t("navigator.channelPhone")}</option>
                    <option value="HOME_VISIT">{t("navigator.channelHomeVisit")}</option>
                    <option value="SMS">{t("navigator.channelSms")}</option>
                    <option value="IN_PERSON">{t("navigator.channelInPerson")}</option>
                    <option value="OTHER">{t("navigator.channelOther")}</option>
                  </select>
                </label>
                <label>{t("navigator.contactOutcome")}
                  <select name="outcome" required defaultValue="REACHED">
                    <option value="REACHED">{t("navigator.outcomeReached")}</option>
                    <option value="NOT_REACHED">{t("navigator.outcomeNotReached")}</option>
                    <option value="WRONG_NUMBER">{t("navigator.outcomeWrongNumber")}</option>
                    <option value="REFUSED">{t("navigator.outcomeRefused")}</option>
                    <option value="RESCHEDULED">{t("navigator.outcomeRescheduled")}</option>
                  </select>
                </label>
                <label>{t("navigator.contactNotes")}
                  <textarea name="notes" rows="3" maxLength="1000" />
                </label>
                <button className="btn btn-primary" type="submit" disabled={savingContact}>
                  {savingContact ? t("navigator.saving") : t("navigator.saveContact")}
                </button>
              </form>
            )}

            {showVideoPreferredTimeForm && (
              <form
                className="navigator-form"
                id="navigator-video-preferred-time"
                onSubmit={submitVideoPreferredTime}
              >
                <h3>
                  {canRescheduleCancelledVideo
                    ? t("navigator.rescheduleAppointment")
                    : t("navigator.requestVideoPreferredTime")}
                </h3>
                <p className="navigator-safety-note">
                  {canRescheduleCancelledVideo
                    ? t("navigator.rescheduleAppointmentHint")
                    : t("navigator.requestVideoPreferredTimeHint")}
                </p>
                <label>{t("navigator.preferredStart")}
                  <input name="requested_start" type="datetime-local" required min={localDateTimeMin()} />
                </label>
                <label>{t("navigator.preferredEnd")}
                  <input name="requested_end" type="datetime-local" required min={localDateTimeMin()} />
                </label>
                <p className="navigator-safety-note">{t("navigator.videoPreferredTimeNote")}</p>
                <button className="btn btn-primary" type="submit" disabled={submittingPreferredTime}>
                  {submittingPreferredTime
                    ? t("navigator.saving")
                    : canRescheduleCancelledVideo
                      ? t("navigator.rescheduleAppointment")
                      : t("navigator.requestVideoPreferredTime")}
                </button>
              </form>
            )}

            {canBookAppointment && !isVideoReferral && (
              <form className="navigator-form" onSubmit={submitAppointment}>
                <h3>{t("navigator.requestAppointment")}</h3>
                <label>{t("navigator.scheduleDate")}
                  <input name="scheduled_at" type="datetime-local" required min={localDateTimeMin()} />
                </label>
                <label>{t("navigator.service")}
                  <input name="assigned_service" type="text" maxLength="200" />
                </label>
                <label>{t("navigator.locationNote")}
                  <textarea name="location_note" rows="2" maxLength="500" />
                </label>
                <p className="navigator-safety-note">{t("navigator.confirmationNote")}</p>
                <button className="btn btn-primary" type="submit" disabled={booking}>
                  {booking ? t("navigator.saving") : t("navigator.requestAppointmentButton")}
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
