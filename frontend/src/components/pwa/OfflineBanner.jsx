import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Connectivity / offline-mode banner.
 * Hidden while online so it does not cover the sidebar logo.
 * Shown for network offline, offline auth mode, or pending draft sync.
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
  const hasSession = Boolean(auth?.user);
  const pendingDraftCount = auth?.pendingDraftCount || 0;
  const needsAttention = offline || isOfflineMode || pendingDraftCount > 0;

  // Guests: only when the network is down. Signed-in: only when attention is needed
  // (never a permanent "Online" strip that covers the logo).
  if (!needsAttention) return null;
  if (!hasSession && !offline) return null;

  const label = isOfflineMode
    ? t("offline.modeBanner")
    : offline
      ? t("pwa.offlineBanner")
      : t("offline.pendingBadge", { count: pendingDraftCount });

  const tone = isOfflineMode || offline ? "offline-banner" : "offline-banner online";

  return (
    <div className={tone} role="status" aria-live="polite">
      <span>{label}</span>
      {offline && !isOfflineMode && (
        <button type="button" onClick={() => window.location.reload()}>
          {t("pwa.retry")}
        </button>
      )}
    </div>
  );
}
