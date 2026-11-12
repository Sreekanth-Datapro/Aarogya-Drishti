import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Clock, RefreshCw, ThumbsDown, ThumbsUp, UserCheck, XCircle } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getDesignationLabel,
  getLocalizedField,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Modal, PageLoader, StatCard } from "../../components/ui";
import { FinalStatusBadge, RecommendationBadge } from "../../components/registration/RegistrationStageBadges";
import "./District.css";

const FILTER_KEYS = {
  ALL: "finalApprovals.filterAll",
  RECOMMENDED: "finalApprovals.filterRecommended",
  NOT_RECOMMENDED: "finalApprovals.filterNotRecommended",
};
const CONFIRM_TITLE_KEYS = {
  APPROVE: "finalApprovals.confirmApproveTitle",
  REJECT: "finalApprovals.confirmRejectTitle",
};

// Stage 2 of Health Worker registration: the District Admin makes the FINAL decision.
// Applications are shown with BOTH Medical Officer outcomes (recommended and not recommended).
// The District Admin may approve or reject regardless of the recommendation.
export default function FinalApprovals() {
  const { t, tm, language } = useLanguage();
  const [view, setView] = useState("pending");
  const [filter, setFilter] = useState("ALL");
  const [items, setItems] = useState([]);
  const [workflow, setWorkflow] = useState({ two_stage: true, can_finalize: false });
  const [awaitingMo, setAwaitingMo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [decision, setDecision] = useState(null);
  const [saving, setSaving] = useState(false);
  const showingHistory = view === "history";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(showingHistory ? "/registrations/district-admin/history" : "/registrations/district-admin");
      setItems(response.data.registrations || []);
      if (!showingHistory) {
        setWorkflow(response.data.workflow || { two_stage: false, can_finalize: false });
        setAwaitingMo(response.data.awaiting_mo_review || 0);
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "finalApprovals.loadFailed"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showingHistory]);

  useEffect(() => {
    load();
  }, [load]);

  // action is APPROVE or REJECT; both open a confirmation form first
  const openDecision = (item, action) => setDecision({ item, action, reason: "" });

  const submitDecision = async () => {
    const reason = decision.reason.trim();
    if (decision.action === "REJECT" && !reason) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.patch(`/registrations/${decision.item.id}/decision`, {
        action: decision.action,
        rejection_reason: decision.action === "REJECT" ? reason : undefined,
      });
      setResult({ name: decision.item.full_name, ...(response.data.decision || {}) });
      setDecision(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "finalApprovals.decisionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const dateTime = (value) => (value ? formatLocalizedDateTime(value, language) : "-");
  const recommendedCount = items.filter((item) => item.mo_recommendation === "RECOMMENDED").length;
  const notRecommendedCount = items.filter((item) => item.mo_recommendation === "NOT_RECOMMENDED").length;
  const shown = showingHistory || filter === "ALL" ? items : items.filter((item) => item.mo_recommendation === filter);

  return (
    <div className="district-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("finalApprovals.title")}</h1>
          <p className="page-subtitle">{t("finalApprovals.subtitle")}</p>
        </div>
        <Button type="button" variant="secondary" onClick={load} loading={loading}>
          <RefreshCw size={16} /> {t("finalApprovals.refresh")}
        </Button>
      </div>

      {!workflow.two_stage && (
        <Alert type="info">{t("finalApprovals.unavailable", { count: number(awaitingMo) })}</Alert>
      )}
      {workflow.two_stage && !workflow.can_finalize && <Alert type="warning">{t("finalApprovals.noFinalizePermission")}</Alert>}
      {error && <Alert type="error">{tm(error)}</Alert>}

      {result && (
        <div className={`fa-result ${result.status === "APPROVED" ? "approved" : "rejected"}`} role="status">
          {result.status === "APPROVED" ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
          <div>
            <strong>{t(result.status === "APPROVED" ? "finalApprovals.resultApproved" : "finalApprovals.resultRejected", { name: result.name })}</strong>
            {result.account && (
              <p>
                {t("finalApprovals.accountActive")} · {t("finalApprovals.username")}:{" "}
                <span className="mono">{result.account.username}</span> · {t("finalApprovals.userReference")}:{" "}
                <span className="mono">{String(result.account.user_id).slice(0, 8)}</span>
              </p>
            )}
            {result.rejection_reason && <p>{t("finalApprovals.rejectionReason")}: {result.rejection_reason}</p>}
          </div>
        </div>
      )}

      <div className="district-stat-grid">
        <StatCard icon={ClipboardList} tone="blue" label={t("regStage.awaitingFinal")} value={number(showingHistory ? 0 : items.length)} />
        <StatCard icon={ThumbsUp} label={t("regStage.recommendedByMo")} value={number(showingHistory ? 0 : recommendedCount)} />
        <StatCard icon={ThumbsDown} tone="amber" label={t("regStage.notRecommendedByMo")} value={number(showingHistory ? 0 : notRecommendedCount)} />
        <StatCard icon={Clock} tone="violet" label={t("regStage.awaitingMo")} value={number(awaitingMo)} />
      </div>

      <div className="fa-toolbar">
        <div className="district-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!showingHistory} className={!showingHistory ? "active" : ""} onClick={() => setView("pending")}>
            {t("finalApprovals.tabPending")}
          </button>
          <button type="button" role="tab" aria-selected={showingHistory} className={showingHistory ? "active" : ""} onClick={() => setView("history")}>
            {t("finalApprovals.tabHistory")}
          </button>
        </div>
        {!showingHistory && (
          <div className="fa-filters" role="group" aria-label={t("finalApprovals.filterLabel")}>
            {Object.entries(FILTER_KEYS).map(([value, key]) => (
              <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {t(key)}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <PageLoader label={t("finalApprovals.loading")} /> : (
        <section className="fa-grid" aria-live="polite">
          {!shown.length && <p className="district-empty district-card">{t(showingHistory ? "finalApprovals.emptyHistory" : "finalApprovals.empty")}</p>}
          {shown.map((item) => (
            <article className="fa-card" key={item.id}>
              <header className="fa-card-header">
                <div>
                  <h2>{item.full_name}</h2>
                  <p><span className="mono">{item.username}</span> · {getDesignationLabel(item.designation, language)}</p>
                </div>
                <FinalStatusBadge status={item.status} />
              </header>

              <dl className="fa-details">
                <div><dt>{t("finalApprovals.phone")}</dt><dd>{item.phone || "-"}</dd></div>
                <div><dt>{t("finalApprovals.district")}</dt><dd>{getLocalizedField(item, "district_name", language) || "-"}</dd></div>
                <div><dt>{t("finalApprovals.mandal")}</dt><dd>{getLocalizedField(item, "mandal_name", language)}</dd></div>
                <div><dt>{t("finalApprovals.village")}</dt><dd>{getLocalizedField(item, "village_name", language)}</dd></div>
                <div><dt>{t("finalApprovals.facility")}</dt><dd>{getLocalizedField(item, "facility_name", language)}</dd></div>
                <div><dt>{t("finalApprovals.submittedOn")}</dt><dd>{formatLocalizedDate(item.created_at, language)}</dd></div>
              </dl>

              <div className={`fa-mo-box ${item.mo_recommendation === "RECOMMENDED" ? "recommended" : "not-recommended"}`}>
                <div className="fa-mo-head">
                  <RecommendationBadge value={item.mo_recommendation} />
                  <small>{item.mo_reviewer_name || "-"} · {dateTime(item.mo_recommended_at)}</small>
                </div>
                <p className="fa-remarks"><strong>{t("finalApprovals.moRemarks")}:</strong> {item.mo_recommendation_note}</p>
              </div>

              {showingHistory ? (
                <div className="fa-outcome">
                  <p>{t("finalApprovals.decidedBy")}: {item.decision_maker_name || "-"} · {dateTime(item.reviewed_at)}</p>
                  {item.status === "APPROVED" && (
                    <p>
                      <UserCheck size={14} /> {item.account_status === "ACTIVE" ? t("finalApprovals.accountActive") : t("finalApprovals.accountInactive")}
                      {item.created_username && <> · <span className="mono">{item.created_username}</span></>}
                    </p>
                  )}
                  {item.rejection_reason && <p>{t("finalApprovals.rejectionReason")}: {item.rejection_reason}</p>}
                </div>
              ) : (
                <div className="fa-actions">
                  <Button type="button" disabled={!workflow.can_finalize} onClick={() => openDecision(item, "APPROVE")}>
                    <CheckCircle2 size={16} /> {t("finalApprovals.finalApprove")}
                  </Button>
                  <Button type="button" variant="danger" disabled={!workflow.can_finalize} onClick={() => openDecision(item, "REJECT")}>
                    <XCircle size={16} /> {t("finalApprovals.finalReject")}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <Modal
        open={Boolean(decision)}
        title={decision ? t(CONFIRM_TITLE_KEYS[decision.action]) : ""}
        onClose={() => setDecision(null)}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setDecision(null)}>{t("common.cancel")}</Button>
          <Button
            type="button"
            variant={decision?.action === "REJECT" ? "danger" : "primary"}
            onClick={submitDecision}
            loading={saving}
            disabled={decision?.action === "REJECT" && !decision.reason.trim()}
          >
            {t(decision?.action === "REJECT" ? "finalApprovals.confirmReject" : "finalApprovals.confirmApprove")}
          </Button>
        </>}
      >
        {decision && (
          <div className="fa-confirm">
            <p>
              {t(decision.action === "APPROVE" ? "finalApprovals.approveHint" : "finalApprovals.rejectHint", {
                name: decision.item.full_name,
                username: decision.item.username,
              })}
            </p>
            <div className="fa-mo-head">
              <RecommendationBadge value={decision.item.mo_recommendation} />
            </div>
            <p className="fa-remarks">{decision.item.mo_recommendation_note}</p>
            {decision.action === "REJECT" && (
              <label className="fa-reason">{t("finalApprovals.rejectionReason")} *
                <textarea rows={4} maxLength={1000} required value={decision.reason}
                  onChange={(event) => setDecision((current) => ({ ...current, reason: event.target.value }))} />
              </label>
            )}
            <Alert type="info">{t("finalApprovals.authorityNote")}</Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}
