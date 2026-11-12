import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";

// The Aarogya Drishti eye-and-cross mark (same drawing as public/icons/icon.svg).
function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M6 33c6-10 15-15.5 26-15.5S52 23 58 33c-6 10-15 15.5-26 15.5S12 43 6 33Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="33" r="9.5" fill="currentColor" />
    </svg>
  );
}

// Logo with name. Use onDark on coloured backgrounds.
export default function Logo({ to = "/", onDark = false, showTagline = true }) {
  const { t } = useLanguage();

  return (
    <Link to={to} className={`logo ${onDark ? "on-dark" : ""}`} aria-label={t("common.appName")}>
      <span className="logo-mark">
        <LogoMark />
      </span>
      <span className="logo-text">
        <span className="logo-name">{t("common.appName")}</span>
        {showTagline && <span className="logo-tag">{t("common.tagline")}</span>}
      </span>
    </Link>
  );
}
