import React, { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Button, TextField } from "../ui";
import { apiMessage } from "../../i18n/translate";

// Second sign-in step for roles that need an authenticator app.
// stage "enroll": first time - show QR code, then ask for a code.
// stage "verify": already set up - just ask for a code.
export default function MfaStep({ mfa, onSuccess, onCancel }) {
  const { startMfaSetup, completeMfa } = useAuth();
  const { t, tm } = useLanguage();

  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isEnroll = mfa.stage === "enroll";

  // Ask the server for a QR code once, when enrolment starts
  useEffect(() => {
    if (!isEnroll) return;

    let cancelled = false;
    startMfaSetup(mfa.token)
      .then((data) => { if (!cancelled) setSetup(data); })
      .catch((err) => { if (!cancelled) setError(apiMessage(err, "mfa.setupFailed")); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnroll, mfa.token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await completeMfa(mfa.stage, mfa.token, code.trim());
      onSuccess(user);
    } catch (err) {
      setError(apiMessage(err, "mfa.failed"));
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="auth-card-icon" aria-hidden="true">
        <ShieldCheck size={26} />
      </div>
      <h1 className="auth-title">{isEnroll ? t("mfa.enrollTitle") : t("mfa.verifyTitle")}</h1>
      <p className="auth-subtitle">{isEnroll ? t("mfa.enrollText") : t("mfa.verifyText")}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isEnroll && (
          <>
            <ol className="mfa-steps">
              <li>{t("mfa.step1")}</li>
              <li>{t("mfa.step2")}</li>
              <li>{t("mfa.step3")}</li>
            </ol>

            <div className="mfa-qr-box">
              {setup ? (
                <>
                  <img className="mfa-qr" src={setup.qr_code} alt={t("mfa.qrAlt")} />
                  <p className="text-muted text-sm">{t("mfa.manualKey")}</p>
                  <code className="secret-box">{setup.secret}</code>
                </>
              ) : (
                !error && <p className="text-muted" role="status">{t("mfa.preparing")}</p>
              )}
            </div>
          </>
        )}

        <TextField
          id="mfa-code"
          label={t("mfa.codeLabel")}
          icon={KeyRound}
          className="code-field"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          placeholder="123456"
          required
          autoFocus
        />

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading} disabled={code.length !== 6}>
          {loading ? t("mfa.submitting") : t("mfa.submit")}
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
