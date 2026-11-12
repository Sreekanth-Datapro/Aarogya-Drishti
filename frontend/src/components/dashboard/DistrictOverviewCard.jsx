import React from "react";
import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Landmark, Home, Users } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber, getLocalizedMasterName } from "../../i18n/displayLabels";
import "./DistrictOverviewCard.css";

/**
 * District Overview Card Component
 * Highlights the focal public health region:
 * Paderu / Alluri Sitharama Raju (ASR District)
 * Shows Mandals, Villages and Population Coverage.
 */
export default function DistrictOverviewCard({ districtInfo, masters }) {
  const { language, t } = useLanguage();

  const districtName = getLocalizedMasterName(districtInfo, language);
  const mandals = masters?.mandals ?? districtInfo?.mandals ?? 11;
  const villages = masters?.villages ?? districtInfo?.villages ?? 2479;
  const population = districtInfo?.population_text || t("dashboard.populationText");

  return (
    <div className="bottom-card district-overview-card">
      <div className="bottom-card-header">
        <div className="bottom-card-title">
          <MapPin size={16} className="title-icon green" />
          <h4>{t("dashboard.districtOverview")}</h4>
        </div>
        <Link to="/admin/locations" className="card-header-link" aria-label={t("dashboard.manageLocations")}>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="district-content-row">
        {/* District Silhouette Map SVG */}
        <div className="district-map-wrap">
          <svg viewBox="0 0 100 80" className="district-map-svg" aria-hidden="true">
            {/* Stylized vector map shape of Eastern Ghats tribal agency area */}
            <path
              d="M25,18 C35,12 50,15 62,22 C72,28 85,32 82,45 C79,56 65,68 52,72 C38,76 22,65 18,52 C15,40 18,24 25,18 Z"
              fill="var(--brand-300)"
              opacity="0.88"
            />
            <path
              d="M32,25 C40,22 55,24 64,30 C72,35 75,44 70,52 C64,60 52,65 40,64 C30,62 25,52 26,42 C27,34 28,28 32,25 Z"
              fill="var(--brand-600)"
              opacity="0.95"
            />
          </svg>
        </div>

        {/* District Demographic Details */}
        <div className="district-details-col">
          <div className="district-name-wrap">
            <h5 className="district-name">{districtName}</h5>
            <span className="district-sub">{t("dashboard.asrDistrictSuffix")}</span>
          </div>

          <div className="district-meta-list">
            <div className="district-meta-item">
              <Landmark size={13} className="meta-icon" />
              <span>{mandals} {t("dashboard.mandals")}</span>
            </div>
            <div className="district-meta-item">
              <Home size={13} className="meta-icon" />
              <span>{formatLocalizedNumber(villages, language)} {t("dashboard.villages")}</span>
            </div>
            <div className="district-meta-item">
              <Users size={13} className="meta-icon" />
              <span>{population}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
