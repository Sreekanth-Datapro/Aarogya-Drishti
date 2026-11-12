import React from "react";
import { ShieldCheck, User, UserCog } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getRoleLabel } from "../../i18n/displayLabels";

const ADMIN_ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN", "DISTRICT_ADMIN"];

// "Welcome, name!" card at the top of the dashboard, with the user's access level
export default function WelcomeBanner({ user }) {
  const { t, language } = useLanguage();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const Icon = isAdmin ? UserCog : User;
  const roleName = getRoleLabel(user?.role, language);

  return (
    <section className="welcome-banner animate-in">
      <span className="welcome-avatar" aria-hidden="true">
        <Icon size={34} />
      </span>

      <div className="welcome-body">
        <h1 className="welcome-title">{t("dashboard.welcome")}, {user?.full_name}!</h1>
        <p className="welcome-role">{roleName} · {t("dashboard.title")}</p>
        <p className="welcome-text">{t("dashboard.welcomeText")}</p>
      </div>

      <div className="access-badge">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <strong>{roleName}</strong>
          <span>{user?.role === "SUPER_ADMIN" ? t("dashboard.accessFull") : t("dashboard.accessRole")}</span>
        </div>
      </div>
    </section>
  );
}
