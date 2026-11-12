import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Hospital } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { Card, DonutChart } from "../ui";

// Facilities by type as a ring chart
export default function FacilitySummary({ facilities }) {
  const { t } = useLanguage();

  const segments = [
    { label: "PHC", value: facilities.phc, color: "var(--chart-2)" },
    { label: "CHC", value: facilities.chc, color: "var(--chart-1)" },
    { label: t("dashboard.hospitals"), value: facilities.hospital, color: "var(--chart-3)" },
    { label: t("dashboard.others"), value: facilities.other, color: "var(--chart-4)" },
  ];

  return (
    <Card className="panel" title={<><Hospital size={18} aria-hidden="true" /> {t("dashboard.facilitySummary")}</>}>
      <div className="facility-summary">
        <DonutChart segments={segments} centerValue={facilities.total} centerLabel={t("dashboard.facilitiesLabel")} />
        <ul className="legend">
          {segments.map((segment) => (
            <li key={segment.label}>
              <span className="legend-dot" style={{ background: segment.color }} aria-hidden="true" />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-footer">
        <Link className="btn btn-primary btn-sm" to="/admin/facilities">
          {t("dashboard.manageFacilities")} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
