import React from "react";
import { Link } from "react-router-dom";
import { CloudDownload, Plus, Zap } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getModulesForRole } from "../../config/navigation";
import { Card } from "../ui";

const TONES = ["blue", "green", "violet", "orange", "teal"];

// Big buttons for common tasks. Modules that are not built yet show "Coming soon".
export default function QuickActions({ user }) {
  const { t } = useLanguage();
  const canManageFacilities = user?.permissions?.includes("master.manage");

  const actions = [];

  if (user?.role === "SUPER_ADMIN") {
    actions.push({ key: "import", label: t("dashboard.actionImport"), icon: CloudDownload, path: "/admin/locations" });
  }
  if (canManageFacilities) {
    actions.push({ key: "addFacility", label: t("dashboard.actionAddFacility"), icon: Plus, path: "/admin/facilities/new" });
  }

  // The rest of the user's modules (the location import already has its own button)
  getModulesForRole(user?.role)
    .filter((module) => module.key !== "locationImport")
    .forEach((module) => {
      actions.push({ key: module.key, label: t(`modules.${module.key}.title`), icon: module.icon, path: module.path });
    });

  return (
    <Card className="panel" title={<><Zap size={18} aria-hidden="true" /> {t("dashboard.quickActions")}</>}>
      <div className="quick-actions">
        {actions.map(({ key, label, icon: Icon, path }, index) => {
          const content = (
            <>
              <Icon size={28} aria-hidden="true" />
              <span>{label}</span>
              {!path && <small className="quick-action-soon">{t("dashboard.moduleSoon")}</small>}
            </>
          );
          const className = `quick-action tone-${TONES[index % TONES.length]}`;

          return path ? (
            <Link key={key} className={className} to={path}>{content}</Link>
          ) : (
            <div key={key} className={`${className} is-soon`} aria-disabled="true">{content}</div>
          );
        })}
      </div>
    </Card>
  );
}
