import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, MapPin, MapPinned } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";
import { Card } from "../ui";

// Counts of districts, mandals and villages with a link to the location module
export default function LocationSummary({ masters, canManage }) {
  const { t, language } = useLanguage();

  const rows = [
    { label: t("dashboard.districts"), value: masters.districts },
    { label: t("dashboard.mandals"), value: masters.mandals },
    { label: t("dashboard.villages"), value: masters.villages },
  ];

  return (
    <Card className="panel" title={<><MapPin size={18} aria-hidden="true" /> {t("dashboard.locationSummary")}</>}>
      <div className="location-summary">
        <span className="location-art" aria-hidden="true"><MapPinned size={56} /></span>
        <ul className="check-list">
          {rows.map((row) => (
            <li key={row.label}>
              <CircleCheck size={16} aria-hidden="true" />
              <span>{row.label}</span>
              <strong>{formatLocalizedNumber(row.value, language)}</strong>
            </li>
          ))}
        </ul>
      </div>
      {canManage && (
        <div className="panel-footer">
          <Link className="btn btn-primary btn-sm" to="/admin/locations">
            {t("dashboard.manageLocations")} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </Card>
  );
}
