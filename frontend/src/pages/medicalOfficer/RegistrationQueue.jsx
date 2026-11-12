import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Eye, ThumbsDown, ThumbsUp } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  getAuditActionLabel,
  getDesignationLabel,
  getLocalizedField,
  getRoleLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Modal, PageLoader } from "../../components/ui";
import { FinalStatusBadge, RecommendationBadge } from "../../components/registration/RegistrationStageBadges";
import "./MedicalOfficer.css";

const VIEW_KEYS = {
  pending: "moRegistrations.viewPending",
  all: "moRegistrations.viewAll",
  history: "moRegistrations.viewHistory",
};
const CONFIRM_TITLE_KEYS = {
  RECOMMENDED: "moRegistrations.confirmRecommendTitle",
  NOT_RECOMMENDED: "moRegistrations.confirmNotRecommendTitle",
};

// Health Worker applications of the Medical Officer's assigned Mandals.
// The MO can only RECOMMEND or NOT RECOMMEND; the District Admin makes the final decision.
// compact: short list for the dashboard with a link to the full page.
export default function RegistrationQueue({ compact = false }) {
  const { t, tm, language } = useLanguage();
  const [view, setView] = useState("pending");
  const [items, setItems] = useState([]);
  const [workflow, setWorkflow] = useState({ two_stage: false, can_recommend: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [details, setDetails] = useState(null);
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);
  const showingHistory = view === "history";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = showingHistory
        ? await api.get("/registrations/medical-officer/history")
        : await api.get("/registrations/medical-officer", { params: view === "all" ? { view } : {} });
      setItems(response.data.registrations || []);
      if (response.data.workflow) setWorkflow(response.data.workflow);
    } catch (requestError) {
      setError(apiMessage(requestError, "moRegistrations.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [view, showingHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetails = async (item) => {
    setError("");
    try {
      const response = await api.get(`/registrations/medical-officer/requests/${item.id}`);
      setDetails(response.data);
    } catch (requestError) {
      setError(apiMessage(requestError, "moRegistrations.loadFailed"));
    }
  };

  // action is RECOMMENDED or NOT_RECOMMENDED; the form asks for remarks before saving
  const openReview = (item, action) => setReview({ item, action, remarks: "" });

  const submitReview = async () => {
    const remarks = review.remarks.trim();
    if (!remarks) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.post(`/registrations/${review.item.id}/recommendation`, {
        action: review.action,
        remarks,
      });
      setSaved({ name: review.item.full_name, ...(response.data.recommendation || { mo_recommendation: review.action, mo_recommendation_note: remarks }) });
      setReview(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "moRegistrations.submitFailed"));
    } finally {
      setSaving(false);
    }
  };

  const shown = compact ? items.slice(0, 5) : items;
  const date = (value) => formatLocalizedDate(value, language);
  const dateTime = (value) => formatLocalizedDateTime(value, language);
  const canReview = (item) => workflow.can_recommend && !item.mo_recommended_by;

  return (
    <section className="mo-card">
      <div className="mo-queue-header">
        <h2 className="mo-card-title"><ClipboardCheck size={16} /> {t("moRegistrations.queueTitle")}</h2>
        {compact
          ? <Link className="mo-card-link" to="/medical-officer/registrations">{t("moRegistrations.openAll")}</Link>
          : (
            <div className="mo-tabs" role="tablist">
              {Object.entries(VIEW_KEYS).map(([value, key]) => (
                <button key={value} type="button" role="tab" aria-selected={view === value}
                  className={view === value ? "active" : ""} onClick={() => setView(value)}>
                  {t(key)}
                </button>
              ))}
            </div>
          )}
      </div>

      {!workflow.can_recommend && !showingHistory && !loading && !error && (
        <Alert type="info">{t("moRegistrations.recommendUnavailable")}</Alert>
      )}
      {error && <Alert type="error">{tm(error)}</Alert>}

      {saved && (
        <div className="mo-saved-recommendation" role="status">
          <strong>{t("moRegistrations.savedTitle", { name: saved.name })}</strong>
          <div className="mo-saved-badges">
            <RecommendationBadge value={saved.mo_recommendation} />
            <FinalStatusBadge status="PENDING" />
          </div>
          <p className="mo-pre">{saved.mo_recommendation_note}</p>
          {saved.mo_recommended_at && <small>{dateTime(saved.mo_recommended_at)}</small>}
        </div>
      )}

      {loading ? <PageLoader label={t("common.loading")} /> : (
        <div className="mo-table-wrap">
          <table className="mo-table">
            <thead>
              <tr>
                <th>{t("moRegistrations.applicant")}</th>
                <th>{t("moRegistrations.designation")}</th>
                <th>{t("moRegistrations.phone")}</th>
                <th>{t("moRegistrations.location")}</th>
                <th>{t("moRegistrations.facility")}</th>
                <th>{t("moRegistrations.appliedOn")}</th>
                <th>{t("moRegistrations.status")}</th>
                <th>{t(showingHistory ? "moRegistrations.remarks" : "moRegistrations.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td data-label={t("moRegistrations.applicant")}>
                    <strong>{item.full_name}</strong>
                    <small className="mo-secondary mono">{item.username}</small>
                  </td>
                  <td data-label={t("moRegistrations.designation")}>{getDesignationLabel(item.designation, language)}</td>
                  <td data-label={t("moRegistrations.phone")}>{item.phone || "-"}</td>
                  <td data-label={t("moRegistrations.location")}>
                    {getLocalizedField(item, "village_name", language)}
                    <small className="mo-secondary">
                      {[getLocalizedField(item, "mandal_name", language), getLocalizedField(item, "district_name", language)].filter(Boolean).join(" · ")}
                    </small>
                  </td>
                  <td data-label={t("moRegistrations.facility")}>{getLocalizedField(item, "facility_name", language)}</td>
                  <td data-label={t("moRegistrations.appliedOn")}>{date(item.created_at)}</td>
                  <td data-label={t("moRegistrations.status")}>
                    <div className="mo-badge-stack">
                      <RecommendationBadge value={item.mo_recommendation} />
                      {(item.mo_recommendation || showingHistory) && <FinalStatusBadge status={item.status} />}
                    </div>
                  </td>
                  {showingHistory ? (
                    <td data-label={t("moRegistrations.remarks")}>
                      <span className="mo-pre">{item.mo_recommendation_note}</span>
                      {item.mo_recommended_at && <small className="mo-secondary">{dateTime(item.mo_recommended_at)}</small>}
                      {item.rejection_reason && (
                        <small className="mo-secondary">{t("moRegistrations.finalReason")}: {item.rejection_reason}</small>
                      )}
                    </td>
                  ) : (
                    <td data-label={t("moRegistrations.actions")}>
                      <div className="mo-actions">
                        <Button type="button" size="sm" variant="secondary" onClick={() => openDetails(item)}>
                          <Eye size={14} /> {t("moRegistrations.viewDetails")}
                        </Button>
                        <Button type="button" size="sm" disabled={!canReview(item)} onClick={() => openReview(item, "RECOMMENDED")}>
                          <ThumbsUp size={14} /> {t("moRegistrations.recommendAction")}
                        </Button>
                        <Button type="button" size="sm" variant="danger" disabled={!canReview(item)} onClick={() => openReview(item, "NOT_RECOMMENDED")}>
                          <ThumbsDown size={14} /> {t("moRegistrations.notRecommendAction")}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan="8" className="mo-empty">{t(showingHistory ? "moRegistrations.noRecommendations" : "moRegistrations.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {compact && items.length > shown.length && (
        <p className="mo-muted">{t("moRegistrations.moreWaiting", { count: items.length - shown.length })}</p>
      )}

      <Modal open={Boolean(details)} title={t("moRegistrations.detailsTitle")} onClose={() => setDetails(null)} className="mo-wide-modal">
        {details && (
          <>
            <dl className="mo-details">
              <dt>{t("moRegistrations.applicant")}</dt><dd>{details.registration.full_name}</dd>
              <dt>{t("moRegistrations.username")}</dt><dd className="mono">{details.registration.username}</dd>
              <dt>{t("moRegistrations.designation")}</dt><dd>{getDesignationLabel(details.registration.designation, language)}</dd>
              <dt>{t("moRegistrations.employeeRef")}</dt><dd>{details.registration.employee_ref || "-"}</dd>
              <dt>{t("moRegistrations.phone")}</dt><dd>{details.registration.phone}</dd>
              <dt>{t("moRegistrations.email")}</dt><dd>{details.registration.email || "-"}</dd>
              <dt>{t("moRegistrations.district")}</dt><dd>{getLocalizedField(details.registration, "district_name", language)}</dd>
              <dt>{t("moRegistrations.mandal")}</dt><dd>{getLocalizedField(details.registration, "mandal_name", language)}</dd>
              <dt>{t("moRegistrations.village")}</dt><dd>{getLocalizedField(details.registration, "village_name", language)}</dd>
              <dt>{t("moRegistrations.facility")}</dt><dd>{getLocalizedField(details.registration, "facility_name", language)}</dd>
              <dt>{t("moRegistrations.appliedOn")}</dt><dd>{dateTime(details.registration.created_at)}</dd>
              <dt>{t("moRegistrations.status")}</dt><dd><RecommendationBadge value={details.registration.mo_recommendation} /></dd>
              {details.registration.mo_recommendation_note && (
                <><dt>{t("moRegistrations.remarks")}</dt><dd className="mo-pre">{details.registration.mo_recommendation_note}</dd></>
              )}
            </dl>
            <h3 className="mo-subtitle">{t("moRegistrations.history")}</h3>
            <ol className="mo-timeline">
              {details.history.map((event, index) => (
                <li key={`${event.event}-${index}`}>
                  <strong>{getAuditActionLabel(event.event, language)}</strong>
                  <small>
                    {dateTime(event.occurred_at)}
                    {event.actor_role ? ` · ${getRoleLabel(event.actor_role, language)}` : ""}
                  </small>
                </li>
              ))}
              {!details.history.length && <li className="mo-empty">{t("moRegistrations.noHistory")}</li>}
            </ol>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(review)}
        title={review ? t(CONFIRM_TITLE_KEYS[review.action]) : ""}
        onClose={() => setReview(null)}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setReview(null)}>{t("common.cancel")}</Button>
          <Button
            type="button"
            variant={review?.action === "NOT_RECOMMENDED" ? "danger" : "primary"}
            onClick={submitReview}
            loading={saving}
            disabled={!review?.remarks.trim()}
          >
            {t("moRegistrations.confirmSubmit")}
          </Button>
        </>}
      >
        {review && (
          <div className="mo-form-simple">
            <p>{t("moRegistrations.reviewHint", { name: review.item.full_name })}</p>
            <RecommendationBadge value={review.action} />
            <label className="mo-full-label">{t("moRegistrations.remarks")} *
              <textarea rows={4} maxLength={1000} value={review.remarks} required
                onChange={(event) => setReview((current) => ({ ...current, remarks: event.target.value }))} />
            </label>
            <Alert type="info">{t("moRegistrations.finalDecisionNote")}</Alert>
          </div>
        )}
      </Modal>
    </section>
  );
}
