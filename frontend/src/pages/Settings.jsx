import React from "react";
import { Link } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { Badge, Card } from "../components/ui";
import PwaInstallCard from "../components/pwa/PwaInstallCard";
import OfflineAccessCard from "../components/offline/OfflineAccessCard";

// Account settings for every signed-in user.
// Changing the password uses the existing Change password page (/change-password).
export default function Settings() {
  const { user, isOffline } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="page-subtitle">{t("settings.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-2">
        {!isOffline && (
          <Card title={<><KeyRound size={18} aria-hidden="true" /> {t("settings.passwordTitle")}</>}>
            <p className="text-muted">{t("settings.passwordText")}</p>
            <Link className="btn btn-primary" to="/change-password">{t("nav.changePassword")}</Link>
          </Card>
        )}

        <Card title={<><ShieldCheck size={18} aria-hidden="true" /> {t("dashboard.twoStep")}</>}>
          <p>
            <Badge tone={user?.mfa_enabled ? "success" : "neutral"}>
              {user?.mfa_enabled ? t("dashboard.enabled") : t("dashboard.notEnabled")}
            </Badge>
          </p>
          <p className="text-muted">{t("settings.mfaText")}</p>
        </Card>

        <OfflineAccessCard />
        {!isOffline && <PwaInstallCard />}
      </div>
    </>
  );
}
