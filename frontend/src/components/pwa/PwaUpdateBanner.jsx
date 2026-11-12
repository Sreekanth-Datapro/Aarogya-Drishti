import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";

export default function PwaUpdateBanner({ applyUpdate, onDismiss }) {
  const { t } = useLanguage();
  if (!applyUpdate) return null;

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <span>{t("pwa.updateAvailable")}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={applyUpdate}>
          {t("pwa.refresh")}
        </button>
        {onDismiss ? (
          <button type="button" onClick={onDismiss}>
            {t("common.close")}
          </button>
        ) : null}
      </span>
    </div>
  );
}
