import React from "react";
import { CircleCheck, Clock, CloudDownload, Database, Info, Package } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime, formatLocalizedUptime } from "../../i18n/displayLabels";
import { Card } from "../ui";

// Version, database, last LGD import and uptime of the running system (admins only)
export default function SystemInfo({ system }) {
  const { t, language } = useLanguage();

  const rows = [
    { icon: Package, label: t("dashboard.appVersion"), value: `v${system.app_version}` },
    { icon: Database, label: t("dashboard.database"), value: system.database },
    {
      icon: CloudDownload,
      label: t("dashboard.lastImport"),
      value: system.last_lgd_import_at
        ? formatLocalizedDateTime(system.last_lgd_import_at, language, { dateStyle: "medium", timeStyle: "short" })
        : t("dashboard.never"),
    },
    { icon: Clock, label: t("dashboard.uptime"), value: formatLocalizedUptime(system.uptime_seconds, language) },
  ];

  return (
    <Card className="panel" title={<><Info size={18} aria-hidden="true" /> {t("dashboard.systemInfo")}</>}>
      <div className="system-info">
        <dl className="system-rows">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <dt><Icon size={16} aria-hidden="true" /> {label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="system-status" role="status">
          <CircleCheck size={40} aria-hidden="true" />
          <strong>{t("dashboard.systemHealthy")}</strong>
          <svg viewBox="0 0 80 20" aria-hidden="true">
            <polyline points="0,10 18,10 24,3 30,17 36,10 80,10" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </Card>
  );
}
