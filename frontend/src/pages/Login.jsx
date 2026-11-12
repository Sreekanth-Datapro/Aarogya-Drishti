
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Fingerprint, Lock, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import AuthLayout from "../components/layout/AuthLayout";
import MfaStep from "../components/auth/MfaStep";
import TemporaryPasswordStep from "../components/auth/TemporaryPasswordStep";
import { Alert, Button, TextField } from "../components/ui";
import { apiMessage } from "../i18n/translate";

export default function Login() {
  const { login, unlockOfflineAccess, hasOfflineVault, getVaultPublic, isVaultExpired } = useAuth();
  const { t, tm } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // When the role needs two-step verification: { stage: "verify" | "enroll", token }
  const [mfa, setMfa] = useState(null);
  // First sign-in with a temporary password: token for the password-change step
  const [passwordChangeToken, setPasswordChangeToken] = useState(null);

  const [offlineAvailable, setOfflineAvailable] = useState(false);
  const [offlineExpired, setOfflineExpired] = useState(false);
  const [showOfflineUnlock, setShowOfflineUnlock] = useState(false);
  const [offlinePin, setOfflinePin] = useState("");
  const [vaultLabel, setVaultLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const exists = await hasOfflineVault();
        if (cancelled) return;
        if (!exists) {
          setOfflineAvailable(false);
          return;
        }
        const pub = await getVaultPublic();
        const expired = isVaultExpired(pub);
        setOfflineAvailable(!expired);
        setOfflineExpired(expired);
        setVaultLabel(pub?.full_name || pub?.username || "");
        // Offer unlock automatically when the device is offline
        if (!navigator.onLine && !expired) setShowOfflineUnlock(true);
      } catch {
        if (!cancelled) setOfflineAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOfflineVault, getVaultPublic, isVaultExpired]);

  const goToApp = (user) => {
    navigate(user.must_change_password ? "/change-password" : "/dashboard", { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(username, password);

      if (result.passwordChangeToken) {
        setPasswordChangeToken(result.passwordChangeToken);
        setPassword("");
      } else if (result.mfaStage) {
        setMfa({ stage: result.mfaStage, token: result.mfaToken });
        setPassword("");
      } else {
        goToApp(result.user);
      }
    } catch (err) {
      setError(apiMessage(err, "login.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineUnlock = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = await unlockOfflineAccess(offlinePin);
      navigate("/health-worker/patients", { replace: true });
      return payload;
    } catch (err) {
      const code = err?.message || err?.code;
      if (code === "OFFLINE_VAULT_EXPIRED") setError(t("offline.vaultExpired"));
      else if (code === "OFFLINE_PIN_LOCKED") {
        const seconds = Math.max(1, Math.ceil((err.remainingMs || 0) / 1000));
        setError(t("offline.pinLocked", { seconds }));
      } else if (code === "OFFLINE_PIN_WRONG") {
        if (typeof err.attemptsRemaining === "number") {
          setError(t("offline.pinWrongRemaining", { remaining: err.attemptsRemaining }));
        } else {
          setError(t("offline.pinWrong"));
        }
      } else if (code === "OFFLINE_VAULT_MISSING") setError(t("offline.vaultMissing"));
      else setError(t("offline.unlockFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Step 2a: new password instead of the temporary one, then MFA enrollment
  if (passwordChangeToken) {
    return (
      <AuthLayout>
        <TemporaryPasswordStep
          passwordChangeToken={passwordChangeToken}
          onSuccess={(next) => {
            setPasswordChangeToken(null);
            setMfa({ stage: next.mfaStage, token: next.mfaToken });
          }}
          onCancel={() => setPasswordChangeToken(null)}
        />
      </AuthLayout>
    );
  }

  // Step 2: authenticator code
  if (mfa) {
    return (
      <AuthLayout>
        <MfaStep mfa={mfa} onSuccess={goToApp} onCancel={() => setMfa(null)} />
      </AuthLayout>
    );
  }

  if (showOfflineUnlock) {
    return (
      <AuthLayout>
        <h1 className="auth-title">{t("offline.unlockTitle")}</h1>
        <p className="auth-subtitle">
          {vaultLabel
            ? t("offline.unlockSubtitleNamed", { name: vaultLabel })
            : t("offline.unlockSubtitle")}
        </p>
        <Alert type="info">{t("offline.unlockHint")}</Alert>
        <form className="auth-form" onSubmit={handleOfflineUnlock}>
          <TextField
            id="offline-unlock-pin"
            label={t("offline.pinLabel")}
            icon={Fingerprint}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={offlinePin}
            onChange={(e) => setOfflinePin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder={t("offline.pinPlaceholder")}
            required
          />
          {error && <Alert type="error">{tm(error)}</Alert>}
          <Button type="submit" block loading={loading}>
            {t("offline.unlockButton")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            block
            onClick={() => {
              setShowOfflineUnlock(false);
              setError("");
              setOfflinePin("");
            }}
          >
            {t("offline.backToOnlineLogin")}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // Step 1: username and password
  return (
    <AuthLayout>
      <h1 className="auth-title">{t("login.title")}</h1>
      <p className="auth-subtitle">{t("login.subtitle")}</p>
      {location.state?.message && <Alert type="info">{tm(location.state.message)}</Alert>}
      {offlineExpired && <Alert type="warning">{t("offline.vaultExpired")}</Alert>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="login-username"
          label={t("login.username")}
          icon={User}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("login.usernamePlaceholder")}
          autoComplete="username"
          required
        />

        <TextField
          id="login-password"
          label={t("login.password")}
          icon={Lock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("login.passwordPlaceholder")}
          autoComplete="current-password"
          required
        />

        <div className="auth-row-end">
          <Link to="/forgot-password">{t("login.forgot")}</Link>
        </div>

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>

      {offlineAvailable && (
        <p className="auth-footer">
          <button
            type="button"
            className="btn btn-link"
            onClick={() => {
              setError("");
              setShowOfflineUnlock(true);
            }}
          >
            {t("offline.unlockLink")}
          </button>
        </p>
      )}

      <p className="auth-footer">
        {t("login.newWorker")} <Link to="/register">{t("login.register")}</Link>
      </p>
    </AuthLayout>
  );
}
