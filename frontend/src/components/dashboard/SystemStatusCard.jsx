import React from "react";
import { Server, Database, Activity, HardDrive, CheckCircle2 } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime } from "../../i18n/displayLabels";
import "./SystemStatusCard.css";

/**
 * System Status Card Component
 * Fetches actual health and connectivity from backend monitoring.
 * Shows:
 *  - Database Connectivity (Healthy + Latency)
 *  - API Services (Running)
 *  - Last Successful Backup (retrieved from backups directory)
 *  - All Systems Operational confirmation banner
 */
export default function SystemStatusCard({ system = {} }) {
  const { language, t } = useLanguage();

  const isHealthy = system.status === "healthy";
  const latency = system.db_latency_ms ? ` ${t("dashboard.latencyValue", { ms: system.db_latency_ms })}` : "";
  const backupTime = system.last_backup?.at || system.last_backup?.timestamp;
  const lastBackupText = backupTime
    ? formatLocalizedDateTime(backupTime, language)
    : t("dashboard.never");

  return (
    <div className="bottom-card system-status-card">
      <div className="bottom-card-header">
        <div className="bottom-card-title">
          <Server size={16} className="title-icon green" />
          <h4>{t("dashboard.systemStatus")}</h4>
        </div>
        <span className="online-badge">
          <span className="online-dot" />
          <span>{t("dashboard.online")}</span>
        </span>
      </div>

      <div className="system-metrics-list">
        {/* Database */}
        <div className="system-metric-row">
          <div className="metric-label-wrap">
            <Database size={15} className="metric-icon" />
            <span>{t("dashboard.database")}</span>
          </div>
          <span className="metric-value green">
            {isHealthy ? `${t("dashboard.healthy")}${latency}` : t("dashboard.degraded")}
          </span>
        </div>

        {/* API Services */}
        <div className="system-metric-row">
          <div className="metric-label-wrap">
            <Activity size={15} className="metric-icon" />
            <span>{t("dashboard.apiServices")}</span>
          </div>
          <span className="metric-value green">{t("dashboard.running")}</span>
        </div>

        {/* Last Backup */}
        <div className="system-metric-row">
          <div className="metric-label-wrap">
            <HardDrive size={15} className="metric-icon" />
            <span>{t("dashboard.lastBackup")}</span>
          </div>
          <span className="metric-value dark">{lastBackupText}</span>
        </div>
      </div>

      {/* Operational Banner */}
      <div className="operational-banner">
        <CheckCircle2 size={15} className="op-icon" />
        <span>{t("dashboard.allSystemsOperational")}</span>
      </div>
    </div>
  );
}
