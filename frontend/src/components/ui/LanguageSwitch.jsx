import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";

// Two-button switch between English and Telugu.
export default function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="lang-switch" role="group" aria-label={t("common.language")}>
      <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")} lang="en">
        EN
      </button>
      <button type="button" aria-pressed={language === "te"} onClick={() => setLanguage("te")} lang="te">
        తెలుగు
      </button>
    </div>
  );
}
