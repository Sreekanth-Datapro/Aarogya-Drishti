import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import RegistrationQueue from "./RegistrationQueue";
import "./MedicalOfficer.css";

// Health Worker Registrations page of the Medical Officer menu
export default function MoRegistrations() {
  const { t } = useLanguage();
  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moRegistrations.title")}</h1>
          <p className="page-subtitle">{t("moRegistrations.subtitle")}</p>
        </div>
      </div>
      <RegistrationQueue />
    </div>
  );
}
