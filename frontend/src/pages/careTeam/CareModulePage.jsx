import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ListChecks, PlugZap } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { NAVIGATOR_MODULES, SPECIALIST_MODULES } from "../../config/navigation";
import { Alert, EmptyState } from "../../components/ui";
import VideoNotConfigured from "./VideoNotConfigured";
import SpecialistAppointments from "./SpecialistAppointments";
import { CARE_PAGES } from "./careModules";
import "../district/District.css";
import "./CareTeam.css";

// One page of the Navigator or Specialist menu (moduleKey = "navReferrals", "spNotes", ...).
// Until its server service is built it explains what the module will do and shows
// no records, so nothing on the page is sample data.
export default function CareModulePage({ moduleKey }) {
  const { t } = useLanguage();
  const page = CARE_PAGES[moduleKey];
  const menuItem = NAVIGATOR_MODULES[moduleKey] || SPECIALIST_MODULES[moduleKey];

  if (moduleKey === "spConsultations") {
    return <SpecialistAppointments />;
  }

  return (
    <div className="care-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t(`modules.${moduleKey}.title`)}</h1>
          <p className="page-subtitle">{t(`modules.${moduleKey}.text`)}</p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard"><ArrowLeft size={16} aria-hidden="true" /> {t("care.backToDashboard")}</Link>
      </div>

      {page.ruleKey && <Alert type="info">{t(page.ruleKey)}</Alert>}

      <div className="care-grid care-grid-page">
        <section className="district-card">
          <EmptyState icon={page.video ? menuItem.icon : PlugZap} title={t("care.pageEmptyTitle")} text={t("care.pageEmptyText")} />
        </section>

        <section className="district-card">
          <h2 className="district-card-title"><ListChecks size={16} aria-hidden="true" /> {t("care.plannedTitle")}</h2>
          <ul className="care-list care-list-check">
            {page.features.map((featureKey) => <li key={featureKey}>{t(featureKey)}</li>)}
          </ul>
        </section>
      </div>

      {page.video && <VideoNotConfigured />}
    </div>
  );
}
