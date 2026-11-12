import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import AuthLayout from "../components/layout/AuthLayout";
import { Alert, Button, TextField } from "../components/ui";
import { apiMessage } from "../i18n/translate";

export default function ChangePassword() {
  const { user, updateUser } = useAuth();
  const { t, tm } = useLanguage();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("change.mismatch");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: password });
      updateUser({ must_change_password: false });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(apiMessage(err, "change.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card-icon" aria-hidden="true">
        <Lock size={26} />
      </div>
      <h1 className="auth-title">{t("change.title")}</h1>
      <p className="auth-subtitle">
        {user?.must_change_password ? t("change.mustChange") : t("change.subtitle")}
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="change-current"
          label={t("change.current")}
          icon={Lock}
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />

        <TextField
          id="change-new"
          label={t("change.newPassword")}
          icon={Lock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          hint={t("change.hint")}
          required
        />

        <TextField
          id="change-confirm"
          label={t("change.confirm")}
          icon={Lock}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("change.submitting") : t("change.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
