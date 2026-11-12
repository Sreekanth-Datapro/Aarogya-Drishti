import React, { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { apiMessage } from "../i18n/translate";
import { Alert, Button, PageLoader } from "../components/ui";
import "./RegistrationWorkflow.css";

export default function RegistrationWorkflow({ role }) {
  const { user } = useAuth();
  const { t, tm, language } = useLanguage();
  const isMedicalOfficer = role === "MEDICAL_OFFICER";
  const isDistrictAdmin = role === "DISTRICT_ADMIN";
  const hasWorkflowPermission = isMedicalOfficer
    ? user?.role === role && user.permissions?.includes("registration.recommend")
    : isDistrictAdmin
      ? user?.role === role
        && user.permissions?.includes("registration.monitor")
        && user.permissions?.includes("registration.finalize")
      : false;
  const [registrations, setRegistrations] = useState([]);
  const [remarks, setRemarks] = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [view, setView] = useState("pending");
  const showingHistory = view === "history";
  const mandalGroups = isMedicalOfficer
    ? Object.values(registrations.reduce((groups, item) => {
      const key = String(item.mandal_id);
      if (!groups[key]) {
        groups[key] = {
          id: key,
          name: item.mandal_name || item.mandal_name_te || key,
          items: [],
        };
      }
      groups[key].items.push(item);
      return groups;
    }, {}))
    : [{ name: null, items: registrations }];

  const load = useCallback(async () => {
    if (!hasWorkflowPermission) return;
    setLoading(true);
    setError("");
    try {
      const path = isMedicalOfficer
        ? `/registrations/medical-officer${showingHistory ? "/history" : ""}`
        : `/registrations/district-admin${showingHistory ? "/history" : ""}`;
      const response = await api.get(path);
      setRegistrations(response.data.registrations || []);
    } catch (requestError) {
      setError(apiMessage(
        requestError,
        isMedicalOfficer ? "registrationWorkflow.moLoadFailed" : "registrationWorkflow.daLoadFailed"
      ));
    } finally {
      setLoading(false);
    }
  }, [hasWorkflowPermission, isMedicalOfficer, showingHistory]);

  useEffect(() => { load(); }, [load]);

  const submit = async (item, action) => {
    if (!hasWorkflowPermission) return;
    const text = isMedicalOfficer
      ? (remarks[item.id] || "").trim()
      : (rejectionReasons[item.id] || "").trim();
    if (!text && (isMedicalOfficer || action === "REJECT")) {
      setNotice(isMedicalOfficer
        ? "registrationWorkflow.remarksRequired"
        : "registrationWorkflow.rejectionRequired");
      return;
    }

    setProcessingId(item.id);
    setNotice("");
    setError("");
    try {
      const response = isMedicalOfficer
        ? await api.post(`/registrations/${item.id}/recommendation`, { action, remarks: text })
        : await api.patch(`/registrations/${item.id}/decision`, {
          action,
          rejection_reason: action === "REJECT" ? text : undefined,
        });
      setNotice(response.data.message);
      setRegistrations((current) => current.filter((registration) => registration.id !== item.id));
    } catch (requestError) {
      setError(apiMessage(requestError, "registrationWorkflow.actionFailed"));
    } finally {
      setProcessingId(null);
    }
  };

  if (!hasWorkflowPermission) {
    return (
      <div className="registration-workflow-page">
        <h1 className="admin-page-title">{t("registrationWorkflow.unavailableTitle")}</h1>
        <Alert type="info">{t("registrationWorkflow.unavailableText")}</Alert>
      </div>
    );
  }

  return (
    <div className="registration-workflow-page">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            {t(isMedicalOfficer ? "registrationWorkflow.moTitle" : "registrationWorkflow.daTitle")}
          </h1>
          <p className="admin-page-subtitle">
            {t(isMedicalOfficer ? "registrationWorkflow.moSubtitle" : "registrationWorkflow.daSubtitle")}
          </p>
        </div>
        <Button variant="secondary" onClick={load} loading={loading}>
          {t("registrationWorkflow.refresh")}
        </Button>
      </header>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {notice && <Alert type="success">{tm(notice)}</Alert>}
      <div className="registration-workflow-buttons">
        <Button
          variant={showingHistory ? "secondary" : "primary"}
          onClick={() => setView("pending")}
        >
          {t("registrationWorkflow.pendingView")}
        </Button>
        <Button
          variant={showingHistory ? "primary" : "secondary"}
          onClick={() => setView("history")}
        >
          {t(isMedicalOfficer
            ? "registrationWorkflow.recommendationHistory"
            : "registrationWorkflow.decisionHistory")}
        </Button>
      </div>
      {loading ? <PageLoader label={t("registrationWorkflow.loading")} /> : (
        <section className="registration-workflow-list" aria-live="polite">
          {!registrations.length ? (
            <p className="registration-workflow-empty">{t("registrationWorkflow.empty")}</p>
          ) : mandalGroups.map((group) => (
            <div className="registration-workflow-mandal-group" key={group.id || "district"}>
              {isMedicalOfficer && <h2>{group.name}</h2>}
              {group.items.map((item) => {
            const recommendationRecorded = Boolean(item.mo_recommended_by);
            return (
              <article className="registration-workflow-card" key={item.id}>
                <div className="registration-workflow-details">
                  <h2>{item.full_name}</h2>
                  <p>{item.username} · {item.designation}</p>
                  <p>{[item.facility_name, item.mandal_name, item.village_name].filter(Boolean).join(" · ")}</p>
                  {isMedicalOfficer && recommendationRecorded && (
                    <div className="registration-workflow-recommendation">
                      <strong>{t("registrationWorkflow.recommendation")}: </strong>
                      {item.mo_recommendation === "RECOMMENDED"
                        ? t("registrationWorkflow.recommendApprove")
                        : t("registrationWorkflow.recommendReject")}
                      {item.mo_reviewer_name && <span> · {item.mo_reviewer_name}</span>}
                      <p>{item.mo_recommendation_note}</p>
                      {item.mo_recommended_at && (
                        <p>{t("registrationWorkflow.recommendedAt")}: {new Date(item.mo_recommended_at)
                          .toLocaleString(language === "te" ? "te-IN" : "en-US")}</p>
                      )}
                      <p>{t("registrationWorkflow.alreadyRecommended")}</p>
                    </div>
                  )}
                  {!isMedicalOfficer && (
                    <div className="registration-workflow-recommendation">
                      <strong>{t("registrationWorkflow.recommendation")}: </strong>
                      {item.mo_recommendation === "RECOMMENDED"
                        ? t("registrationWorkflow.recommendApprove")
                        : t("registrationWorkflow.recommendReject")}
                      {item.mo_reviewer_name && <span> · {item.mo_reviewer_name}</span>}
                      <p>{item.mo_recommendation_note}</p>
                      {item.mo_recommended_at && (
                        <p>{t("registrationWorkflow.recommendedAt")}: {new Date(item.mo_recommended_at)
                          .toLocaleString(language === "te" ? "te-IN" : "en-US")}</p>
                      )}
                      {showingHistory && (
                        <>
                          <p>
                            {t("registrationWorkflow.finalDecision")}:{" "}
                            {item.status === "APPROVED"
                              ? t("registrationWorkflow.statusApproved")
                              : t("registrationWorkflow.statusRejected")}
                            {item.decision_maker_name && <span> · {item.decision_maker_name}</span>}
                          </p>
                          {item.reviewed_at && <p>{new Date(item.reviewed_at)
                            .toLocaleString(language === "te" ? "te-IN" : "en-US")}</p>}
                          {item.rejection_reason && <p>{item.rejection_reason}</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {showingHistory ? null : isMedicalOfficer ? (
                  recommendationRecorded ? null : (
                    <div className="registration-workflow-actions">
                      <label>
                        {t("registrationWorkflow.remarks")}
                        <textarea
                          value={remarks[item.id] || ""}
                          onChange={(event) => setRemarks((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                          required
                          rows={3}
                        />
                      </label>
                      <div className="registration-workflow-buttons">
                        <Button
                          disabled={processingId === item.id}
                          onClick={() => submit(item, "RECOMMENDED")}
                        >
                          {t("registrationWorkflow.recommendApprove")}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={processingId === item.id}
                          onClick={() => submit(item, "NOT_RECOMMENDED")}
                        >
                          {t("registrationWorkflow.recommendReject")}
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="registration-workflow-actions">
                    <label>
                      {t("registrationWorkflow.rejectionReason")}
                      <textarea
                        value={rejectionReasons[item.id] || ""}
                        onChange={(event) => setRejectionReasons((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))}
                        rows={3}
                        required
                      />
                    </label>
                    <div className="registration-workflow-buttons">
                      <Button
                        disabled={processingId === item.id}
                        onClick={() => submit(item, "APPROVE")}
                      >
                        {t("registrationWorkflow.finalApprove")}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={processingId === item.id}
                        onClick={() => submit(item, "REJECT")}
                      >
                        {t("registrationWorkflow.finalReject")}
                      </Button>
                    </div>
                  </div>
                )}
              </article>
              );
            })}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
