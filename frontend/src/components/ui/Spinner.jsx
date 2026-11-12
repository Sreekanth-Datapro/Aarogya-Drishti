import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";

// A small spinning circle shown while something loads.
export function Spinner({ large = false, label }) {
  const { t } = useLanguage();
  return <span className={`spinner ${large ? "spinner-lg" : ""}`} role="status" aria-label={label || t("common.loading")} />;
}

// A full-screen loading screen.
export function PageLoader({ label }) {
  const { t } = useLanguage();
  return (
    <div className="page-loader">
      <span className="spinner spinner-lg" aria-hidden="true" />
      <span>{label || t("common.loading")}</span>
    </div>
  );
}

export default Spinner;
