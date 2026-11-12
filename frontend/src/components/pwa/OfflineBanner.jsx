import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Network / offline-mode banner. Works outside AuthProvider for plain
 * connectivity, and upgrades to OFFLINE MODE when AuthContext is present.
 */
export default function OfflineBanner() {
  const { t } = useLanguage();
  const auth = useContext(AuthContext);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const isOfflineMode = Boolean(auth?.isOffline);
  const pendingDraftCount = auth?.pendingDraftCount || 0;

  if (!offline && !isOfflineMode) return null;

  const label = isOfflineMode
    ? t("offline.modeBanner")
    : t("pwa.offlineBanner");

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span>
        {label}
        {pendingDraftCount > 0 ? ` · ${t("offline.pendingBadge", { count: pendingDraftCount })}` : ""}
      </span>
      {!isOfflineMode && (
        <button type="button" onClick={() => window.location.reload()}>
          {t("pwa.retry")}
        </button>
      )}
    </div>
  );
}
