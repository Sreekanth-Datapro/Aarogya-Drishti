import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { apiMessage } from "../i18n/translate";
import AuthLayout from "../components/layout/AuthLayout";
import { Alert, Button, TextField } from "../components/ui";

export default function RegistrationStatus() {
  const { t, tm, language } = useLanguage();
  const location = useLocation();
  const [token, setToken] = useState(location.state?.statusToken || "");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async (value) => {
    const statusToken = value.trim();
    if (!statusToken) return;
    setLoading(true);
    setError("");
    setStatus(null);
    try {
      const response = await api.post("/registrations/status", { status_token: statusToken });
      setStatus(response.data);
    } catch (requestError) {
      setError(apiMessage(requestError, "registrationWorkflow.statusLookupFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.state?.statusToken) checkStatus(location.state.statusToken);
  }, [checkStatus, location.state]);

  const statusLabel = (value) => {
    if (value === "APPROVED") return t("registrationWorkflow.statusApproved");
    if (value === "REJECTED") return t("registrationWorkflow.statusRejected");
    return t("registrationWorkflow.statusPending");
  };

  const formatDate = (value) => value
    ? new Date(value).toLocaleString(language === "te" ? "te-IN" : "en-US")
    : "";

  return (
    <AuthLayout>
      <h1 className="auth-title">{t("registrationWorkflow.statusTitle")}</h1>
      <p className="auth-subtitle">{t("registrationWorkflow.statusUnavailable")}</p>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        checkStatus(token);
      }}>
        <TextField
          id="registration-status-token"
          label={t("registrationWorkflow.statusToken")}
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setStatus(null);
            setError("");
          }}
          autoComplete="off"
          required
        />
        <Button type="submit" loading={loading}>
          {t("registrationWorkflow.checkStatus")}
        </Button>
      </form>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {status && (
        <section className="registration-status-result" aria-live="polite">
          <h2>{statusLabel(status.status)}</h2>
          <p>{t("registrationWorkflow.submittedAt")}: {formatDate(status.submitted_at)}</p>
          <p>
            {t("registrationWorkflow.recommendationProgress")}:{" "}
            {status.recommendation
              ? (status.recommendation === "RECOMMENDED"
                ? t("registrationWorkflow.recommendApprove")
                : t("registrationWorkflow.recommendReject"))
              : t("registrationWorkflow.noRecommendation")}
          </p>
          {status.recommendation_remarks && <p>{status.recommendation_remarks}</p>}
          {status.decided_at && (
            <p>
              {t("registrationWorkflow.finalDecisionProgress")}: {statusLabel(status.status)}
              {" · "}{formatDate(status.decided_at)}
            </p>
          )}
          {status.rejection_reason && <p>{status.rejection_reason}</p>}
        </section>
      )}
      <p className="text-sm"><Link to="/register">{t("registrationWorkflow.submitAnother")}</Link></p>
      <p className="text-sm"><Link to="/login">{t("register.signIn")}</Link></p>
    </AuthLayout>
  );
}
