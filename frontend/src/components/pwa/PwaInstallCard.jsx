import React from "react";
import { Download, Smartphone } from "lucide-react";
import { Card } from "../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import usePwaInstall from "../../pwa/usePwaInstall";
import { isStandaloneDisplay } from "../../pwa/registerServiceWorker";

export default function PwaInstallCard() {
  const { t } = useLanguage();
  const { installed, canPrompt, showIosHelp, install, dismiss } = usePwaInstall();
  const standalone = installed || isStandaloneDisplay();

  return (
    <Card
      className="pwa-install-card"
      title={
        <>
          <Smartphone size={18} aria-hidden="true" /> {t("pwa.installTitle")}
        </>
      }
    >
      {standalone ? (
        <p className="text-muted">{t("pwa.alreadyInstalled")}</p>
      ) : (
        <>
          <p className="text-muted">{t("pwa.installText")}</p>
          {canPrompt ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={install}>
                <Download size={16} aria-hidden="true" /> {t("pwa.installButton")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={dismiss}>
                {t("pwa.notNow")}
              </button>
            </div>
          ) : null}
          {showIosHelp ? (
            <div style={{ marginTop: canPrompt ? 12 : 0 }}>
              <p className="text-muted">{t("pwa.iosHelpTitle")}</p>
              <ol>
                <li>{t("pwa.iosStep1")}</li>
                <li>{t("pwa.iosStep2")}</li>
                <li>{t("pwa.iosStep3")}</li>
              </ol>
            </div>
          ) : null}
          {!canPrompt && !showIosHelp ? (
            <p className="text-muted">{t("pwa.installUnavailable")}</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
