import React, { useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { apiMessage } from "../i18n/translate";
import { Alert, Button, Card, TextField } from "../components/ui";
import AuthLayout from "../components/layout/AuthLayout";

export default function DistrictAdminSetup() {
  const navigate = useNavigate();
  const { t, tm } = useLanguage();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const setupToken = fragment.get("token") || "";
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    setToken(setupToken);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("accountSetup.incomplete");
      return;
    }
    if (password !== confirmation) {
      setError("accountSetup.mismatch");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/account-setup", { token, password });
      navigate("/login", {
        replace: true,
        state: { message: "accountSetup.saved" },
      });
    } catch (requestError) {
      setError(apiMessage(requestError, "accountSetup.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <Card title={t("accountSetup.title")} subtitle={t("accountSetup.subtitle")}>
          {error && <Alert type="error">{tm(error)}</Alert>}
          <form className="auth-form" onSubmit={submit}>
            <TextField
              id="setup-password"
              label={t("accountSetup.newPassword")}
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={t("accountSetup.hint")}
            />
            <TextField
              id="setup-password-confirm"
              label={t("accountSetup.confirm")}
              type="password"
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <div className="section">
              <Button type="submit" loading={saving} disabled={!token} block>{t("accountSetup.save")}</Button>
            </div>
          </form>
      </Card>
    </AuthLayout>
  );
}
