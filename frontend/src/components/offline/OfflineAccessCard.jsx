import React, { useEffect, useState } from "react";
import { Fingerprint, ShieldOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { isOfflineRoleAllowed } from "../../offline/vault";
import api from "../../services/api";
import { Alert, Badge, Button, Card, TextField } from "../ui";

/**
 * Settings card: Health Workers enable offline PIN unlock while online.
 */
export default function OfflineAccessCard() {
  const {
    user,
    authMode,
    enableOfflineAccess,
    hasOfflineVault,
    getVaultPublic,
    getOfflinePin,
    setOfflinePin,
    runOfflineSync,
    pendingDraftCount,
    refreshPendingCount,
  } = useAuth();
  const { t, tm } = useLanguage();

  const [enabled, setEnabled] = useState(false);
  const [publicMeta, setPublicMeta] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [syncPin, setSyncPin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const canUse = isOfflineRoleAllowed(user?.role) && authMode === "online";

  const refresh = async () => {
    const exists = await hasOfflineVault();
    setEnabled(exists);
    setPublicMeta(exists ? await getVaultPublic() : null);
    if (user?.id) await refreshPendingCount(user.id);
  };

  useEffect(() => {
    if (canUse) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse, user?.id]);

  if (!isOfflineRoleAllowed(user?.role)) return null;

  if (authMode !== "online") {
    return (
      <Card title={<><Fingerprint size={18} aria-hidden="true" /> {t("offline.settingsTitle")}</>}>
        <Alert type="info">{t("offline.settingsOnlineOnly")}</Alert>
      </Card>
    );
  }

  const handleEnable = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (pin.length < 4 || pin.length > 12) {
      setError(t("offline.pinLength"));
      return;
    }
    if (pin !== confirmPin) {
      setError(t("offline.pinMismatch"));
      return;
    }
    setBusy(true);
    try {
      const optionsResponse = await api.get("/patients/registration-options");
      await enableOfflineAccess(pin, optionsResponse.data);
      setPin("");
      setConfirmPin("");
      setMessage(t("offline.enabled"));
      await refresh();
    } catch (err) {
      setError(tm(err?.message === "OFFLINE_ROLE_DENIED" ? "offline.roleDenied" : "offline.enableFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError("");
    setMessage("");
    let unsynced = pendingDraftCount;
    try {
      const { countUnsyncedDrafts } = await import("../../offline/drafts");
      unsynced = await countUnsyncedDrafts(user.id);
    } catch {
      // fall back to pending sync count
    }
    if (unsynced > 0) {
      const ok = window.confirm(t("offline.disableWarnDrafts", { count: unsynced }));
      if (!ok) return;
    } else {
      const ok = window.confirm(t("offline.disableConfirm"));
      if (!ok) return;
    }
    setDisabling(true);
    try {
      const { disableOfflineVault } = await import("../../offline/vault");
      await disableOfflineVault(user.id);
      setOfflinePin(null);
      setMessage(t("offline.disabled"));
      await refresh();
    } catch {
      setError(t("offline.disableFailed"));
    } finally {
      setDisabling(false);
    }
  };

  const handleSync = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const activePin = syncPin || getOfflinePin();
    if (!activePin) {
      setError(t("offline.pinRequiredForSync"));
      return;
    }
    setBusy(true);
    try {
      const summary = await runOfflineSync(activePin);
      setSyncPin("");
      if (summary.skipped) {
        setError(t("offline.syncSkipped"));
      } else {
        setMessage(
          t("offline.syncResult", {
            synced: summary.synced,
            failed: summary.failed,
            needs: summary.needsConfirmation,
          })
        );
      }
      await refresh();
    } catch (err) {
      setError(err?.message || t("offline.syncFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<><Fingerprint size={18} aria-hidden="true" /> {t("offline.settingsTitle")}</>}>
      <p className="text-muted">{t("offline.settingsText")}</p>
      <p>
        <Badge tone={enabled ? "success" : "neutral"}>
          {enabled ? t("offline.statusOn") : t("offline.statusOff")}
        </Badge>
        {pendingDraftCount > 0 && (
          <Badge tone="warning">
            {t("offline.pendingBadge", { count: pendingDraftCount })}
          </Badge>
        )}
      </p>
      {publicMeta?.lastOnlineAuthAt && (
        <p className="text-muted">
          {t("offline.lastOnlineAuth", {
            when: new Date(publicMeta.lastOnlineAuthAt).toLocaleString(),
          })}
        </p>
      )}

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      {!enabled ? (
        <form className="auth-form" onSubmit={handleEnable}>
          <TextField
            id="offline-pin"
            label={t("offline.pinLabel")}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder={t("offline.pinPlaceholder")}
            required
          />
          <TextField
            id="offline-pin-confirm"
            label={t("offline.pinConfirm")}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            required
          />
          <Button type="submit" loading={busy} disabled={busy}>
            {t("offline.enableButton")}
          </Button>
        </form>
      ) : (
        <>
          <div className="auth-form" style={{ marginBottom: "1rem" }}>
            <Button type="button" variant="secondary" loading={disabling} onClick={handleDisable}>
              <ShieldOff size={16} aria-hidden="true" /> {t("offline.disableButton")}
            </Button>
          </div>
          {pendingDraftCount > 0 && (
            <form className="auth-form" onSubmit={handleSync}>
              <p className="text-muted">{t("offline.syncPrompt")}</p>
              {!getOfflinePin() && (
                <TextField
                  id="offline-sync-pin"
                  label={t("offline.pinLabel")}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={syncPin}
                  onChange={(e) => setSyncPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  required
                />
              )}
              <Button type="submit" loading={busy} disabled={busy}>
                {t("offline.syncNow")}
              </Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
