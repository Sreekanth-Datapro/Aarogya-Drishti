import React, { useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, TextField } from "../ui";

// First sign-in with the temporary password from the email:
// the user must choose a new password before two-step verification is set up.
// passwordChangeToken: short-lived token from the login step.
// onSuccess receives { mfaStage, mfaToken } for the MFA enrollment step.
export default function TemporaryPasswordStep({ passwordChangeToken, onSuccess, onCancel }) {
  const { changeTemporaryPassword } = useAuth();
  const { t, tm } = useLanguage();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("temporaryPassword.mismatch");
      return;
    }

    setLoading(true);
    try {
      onSuccess(await changeTemporaryPassword(passwordChangeToken, password));
    } catch (err) {
      setError(apiMessage(err, "temporaryPassword.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="auth-card-icon" aria-hidden="true">
        <Lock size={26} />
      </div>
      <h1 className="auth-title">{t("temporaryPassword.title")}</h1>
      <p className="auth-subtitle">{t("temporaryPassword.subtitle")}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="temporary-new-password"
          label={t("temporaryPassword.newPassword")}
          icon={Lock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          hint={t("temporaryPassword.hint")}
          required
          autoFocus
        />

        <TextField
          id="temporary-confirm-password"
          label={t("temporaryPassword.confirm")}
          icon={Lock}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("temporaryPassword.submitting") : t("temporaryPassword.submit")}
        </Button>
      </form>

      <p className="auth-footer">
        <Button variant="link" icon={ArrowLeft} onClick={onCancel}>
          {t("common.backToSignIn")}
        </Button>
      </p>
    </>
  );
}
