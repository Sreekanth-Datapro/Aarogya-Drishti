import React from "react";
import { Compass } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";
import "./FacilityDistributionCard.css";

/**
 * Facility Distribution Donut Chart Card
 * 100% Dynamic breakdown of healthcare facilities from PostgreSQL database:
 *  - PHC (Primary Health Centres)
 *  - CHC (Community Health Centres)
 *  - Hospital (District / Area Hospital, Medical College)
 *  - Others (Sub-centres, Screening sites, District office)
 */
export default function FacilityDistributionCard({ facilities = {} }) {
  const { language, t } = useLanguage();

  const phc = Number(facilities.phc || 0);
  const chc = Number(facilities.chc || 0);
  const hospital = Number(facilities.hospital || 0);
  const other = Number(facilities.other || 0);
  const total = Number(facilities.total || phc + chc + hospital + other || 0);

  const displayTotal = formatLocalizedNumber(total, language);
  const segments = [
    { label: "PHC", value: phc, color: "var(--chart-2)" },
    { label: "CHC", value: chc, color: "var(--chart-1)" },
    { label: t("dashboard.hospitals"), value: hospital, color: "var(--chart-3)" },
    { label: t("dashboard.others"), value: other, color: "var(--chart-4)" },
  ];

  // Calculate SVG stroke-dasharray for donut segments
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const sumValues = segments.reduce((acc, s) => acc + s.value, 0) || (total > 0 ? total : 1);

  let currentOffset = 0;
  const renderedSegments = segments.map((seg) => {
    const strokeLength = total > 0 ? (seg.value / sumValues) * circumference : 0;
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
          <Compass size={17} className="dist-icon" />
          <h3>{t("dashboard.facilityDistribution")}</h3>
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
            <span className="donut-center-label">{t("dashboard.facilitiesLabel")}</span>
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
              <strong className="legend-val">{seg.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
