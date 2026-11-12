import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Button } from "../../components/ui";
import "./SpecialistDashboard.css";

function formattedDate(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formattedTime(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateTimeMin(date = new Date()) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

export default function SpecialistAvailabilityRequests() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const canManageAvailability = user?.permissions?.includes("appointment.slot_manage");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback(async () => {
    if (!canManageAvailability) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/specialist/availability/requests");
      setRequests(Array.isArray(response.data.requests) ? response.data.requests : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("specialist.availabilityRequestsFailed"));
    } finally {
      setLoading(false);
    }
  }, [canManageAvailability, t]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!location.hash || loading) return;
    const requestId = location.hash.replace("#availability-request-", "");
    if (!requests.some((request) => request.id === requestId)) return;
    document.getElementById(`availability-request-${requestId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [location.hash, loading, requests]);

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
      await loadRequests();
      setSuccess(t("specialist.availabilityResponseSaved"));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("specialist.availabilityResponseFailed"));
    } finally {
      setBusy("");
    }
  };

  if (!canManageAvailability) return null;

  return (
    <section className="district-card specialist-availability-requests" aria-labelledby="specialist-availability-requests-title">
      <div className="specialist-section-heading">
        <div>
          <h2 id="specialist-availability-requests-title" className="district-card-title">
            {t("specialist.availabilityRequestsTitle")}
          </h2>
          <p className="care-muted">{t("specialist.availabilityRequestsHint")}</p>
        </div>
        <Button variant="secondary" loading={loading} onClick={loadRequests}>
          {t("specialist.refreshAvailability")}
        </Button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {loading ? (
        <p className="care-muted" role="status">{t("specialist.availabilityRequestsLoading")}</p>
      ) : requests.length ? (
        <div className="specialist-availability-request-list">
          {requests.map((request) => (
            <article
              className="specialist-availability-request"
              id={`availability-request-${request.id}`}
              key={request.id}
            >
              <div>
                <h3>{request.patient_code || t("common.notAvailable")}</h3>
                <p>
                  <strong>{t("specialist.availabilityReferral")}</strong>{" "}
                  {request.referral_code || t("common.notAvailable")}
                  {request.referral_id && <small> · {request.referral_id}</small>}
                </p>
                <p className="care-muted">
                  {request.hospital_name || t("common.notAvailable")} ·{" "}
                  {request.specialty_name || t("common.notAvailable")}
                </p>
                <p>
                  <strong>{t("specialist.availabilityRequestedTime")}</strong>{" "}
                  {formattedDate(request.requested_start, language)}{" "}
                  {formattedTime(request.requested_start, language)} –{" "}
                  {formattedTime(request.requested_end, language)}
                </p>
                <p>
                  <strong>{t("specialist.availabilityRequestStatusLabel")}</strong>{" "}
                  {t(`specialist.availabilityRequestStatus.${request.status}`)}
                </p>
                <p>
                  <strong>{t("specialist.teleconsultConsent")}</strong>{" "}
                  {t(`specialist.teleconsultConsentStatus.${request.teleconsult_consent_status || "NOT_GIVEN"}`)}
                </p>
                <p className="care-muted">{t("specialist.availabilityResponseHint")}</p>
                {request.teleconsult_consent_status !== "ACTIVE" && (
                  <Alert type="error">{t("specialist.availabilityConsentRequired")}</Alert>
                )}
              </div>
              <div className="specialist-availability-request-actions">
                <Button
                  size="sm"
                  loading={busy === request.id}
                  disabled={Boolean(busy) || request.teleconsult_consent_status !== "ACTIVE"}
                  onClick={() => respond(request.id, "ACCEPT")}
                >
                  {t("specialist.acceptRequestedTime")}
                </Button>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  respond(request.id, "SUGGEST", event.currentTarget);
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
                  <Button
                    type="submit"
                    size="sm"
                    loading={busy === request.id}
                    disabled={Boolean(busy) || request.teleconsult_consent_status !== "ACTIVE"}
                  >
                    {t("specialist.suggestAlternativeTime")}
                  </Button>
                </form>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  respond(request.id, "DECLINE", event.currentTarget);
                }}>
                  <label>
                    {t("specialist.declineReason")}
                    <textarea name="reason" rows="2" maxLength="1000" required />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    loading={busy === request.id}
                    disabled={Boolean(busy)}
                  >
                    {t("specialist.declineAvailabilityRequest")}
                  </Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="care-muted">{t("specialist.noAvailabilityRequests")}</p>
      )}
    </section>
  );
}
