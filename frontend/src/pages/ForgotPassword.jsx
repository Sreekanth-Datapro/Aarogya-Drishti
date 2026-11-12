import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, KeyRound, User } from "lucide-react";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import AuthLayout from "../components/layout/AuthLayout";
import { Alert, Button, TextField } from "../components/ui";
import { apiMessage } from "../i18n/translate";

export default function ForgotPassword() {
  const { t, tm } = useLanguage();

  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      // The server always answers the same way, so nobody can guess which usernames exist
      const response = await api.post("/auth/password-reset/request", { username });
      setMessage(response.data.message);
    } catch (err) {
      setError(apiMessage(err, "forgot.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card-icon" aria-hidden="true">
        <KeyRound size={26} />
      </div>
      <h1 className="auth-title">{t("forgot.title")}</h1>
      <p className="auth-subtitle">{t("forgot.subtitle")}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="forgot-username"
          label={t("login.username")}
          icon={User}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        {error && <Alert type="error">{tm(error)}</Alert>}
        {message && <Alert type="success">{tm(message)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("forgot.submitting") : t("forgot.submit")}
        </Button>
      </form>

      <p className="auth-footer">
        <Link to="/login">
          <ArrowLeft size={14} aria-hidden="true" className="inline-icon-middle" /> {t("common.backToSignIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
