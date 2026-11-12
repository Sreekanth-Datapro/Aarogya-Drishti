import React from "react";
import { Users } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";
import "./UserDistributionCard.css";

/**
 * User Distribution Donut Chart Card
 * 100% Dynamic data from PostgreSQL database:
 *  - Registered Patients (from tbl_patients)
 *  - Active Health Workers (from tbl_users with role HEALTH_WORKER)
 *  - Other Staff & Administrators (SUPER_ADMIN, SYSTEM_ADMIN, etc.)
 */
export default function UserDistributionCard({ summary = {} }) {
  const { language, t } = useLanguage();

  const patients = Number(summary.patients_registered || 0);
  const healthWorkers = Number(summary.active_health_workers || 0);
  const totalUsers = Number(summary.total_users || 0);

  // Derive counts dynamically from PostgreSQL summary
  const totalAccounts =
    totalUsers ||
    (summary.users_by_role
      ? summary.users_by_role.reduce((acc, r) => acc + Number(r.total || 0), 0)
      : 1);

  const otherUsers = Math.max(0, totalAccounts - healthWorkers);
  const grandTotal = patients + totalAccounts;

  const displayTotal = formatLocalizedNumber(totalAccounts, language);

  // Dynamic segments calculated directly from real database metrics
  const segments = [
    {
      label: t("dashboard.patients"),
      color: "var(--chart-2)",
      value: patients,
      share: grandTotal > 0 ? patients / grandTotal : 0,
      percent: grandTotal > 0 ? `${Math.round((patients / grandTotal) * 100)}%` : "0%",
    },
    {
      label: t("dashboard.activeHealthWorkers"),
      color: "var(--chart-1)",
      value: healthWorkers,
      share: grandTotal > 0 ? healthWorkers / grandTotal : 0,
      percent: grandTotal > 0 ? `${Math.round((healthWorkers / grandTotal) * 100)}%` : "0%",
    },
    {
      label: t("dashboard.others"),
      color: "var(--chart-3)",
      value: otherUsers,
      share: grandTotal > 0 ? otherUsers / grandTotal : (totalAccounts > 0 ? 1 : 0),
      percent: grandTotal > 0 ? `${Math.round((otherUsers / grandTotal) * 100)}%` : (totalAccounts > 0 ? "100%" : "0%"),
    },
  ];

  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;
  const renderedSegments = segments.map((seg) => {
    const strokeLength = Math.max(0, seg.share * circumference);
    const strokeDasharray = `${strokeLength} ${circumference - strokeLength}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += strokeLength;

    return {
      ...seg,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  return (
    <div className="distribution-card">
      <div className="distribution-header">
        <div className="distribution-title">
          <Users size={17} className="dist-icon" />
          <h3>{t("dashboard.userDistribution")}</h3>
        </div>
      </div>

      <div className="donut-chart-row">
        {/* SVG Donut Ring */}
        <div className="donut-wrapper">
          <svg viewBox="0 0 100 100" className="donut-svg">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth="11"
            />
            {renderedSegments.map((seg, idx) => (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth="11"
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                transform="rotate(-90 50 50)"
                strokeLinecap="round"
              />
            ))}
          </svg>
          <div className="donut-center-text">
            <span className="donut-center-value">{displayTotal}</span>
            <span className="donut-center-label">{t("dashboard.users")}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="donut-legend">
          {segments.map((seg, idx) => (
            <div key={idx} className="legend-row">
              <div className="legend-label-col">
                <span className="legend-dot" style={{ backgroundColor: seg.color }} />
                <span className="legend-name">{seg.label}</span>
              </div>
              <strong className="legend-val">{seg.percent}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
