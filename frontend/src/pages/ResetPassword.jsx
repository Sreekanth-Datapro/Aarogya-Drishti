import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import AuthLayout from "../components/layout/AuthLayout";
import { Alert, Button, TextField } from "../components/ui";
import { apiMessage } from "../i18n/translate";

export default function ResetPassword() {
  const { t, tm } = useLanguage();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("reset.mismatch");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/auth/password-reset/confirm", { token, new_password: password });
      setMessage(response.data.message);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(apiMessage(err, "reset.failed"));
    } finally {
      setLoading(false);
    }
  };

  // Decide what to show: missing token, success message, or the form
  let content;

  if (!token) {
    content = <Alert type="error">{t("reset.incomplete")}</Alert>;
  } else if (message) {
    content = <Alert type="success">{tm(message)}</Alert>;
  } else {
    content = (
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="reset-password"
          label={t("reset.newPassword")}
          icon={Lock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          hint={t("reset.hint")}
          required
        />

        <TextField
          id="reset-confirm"
          label={t("reset.confirm")}
          icon={Lock}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("reset.submitting") : t("reset.submit")}
        </Button>
      </form>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card-icon" aria-hidden="true">
        <Lock size={26} />
      </div>
      <h1 className="auth-title">{t("reset.title")}</h1>
      <p className="auth-subtitle">{t("reset.subtitle")}</p>

      <div className="auth-content-spaced">{content}</div>

      <p className="auth-footer">
        <Link to="/login">
          <ArrowLeft size={14} aria-hidden="true" className="inline-icon-middle" /> {t("common.backToSignIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
