import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";

const LOGO_SRC = `${process.env.PUBLIC_URL || ""}/icons/icon-512.png`;

// Logo with name. Use onDark on coloured backgrounds.
export default function Logo({ to = "/", onDark = false, showTagline = true }) {
  const { t } = useLanguage();

  return (
    <Link to={to} className={`logo ${onDark ? "on-dark" : ""}`} aria-label={t("common.appName")}>
      <span className="logo-mark">
        <img src={LOGO_SRC} alt="" width={40} height={40} decoding="async" />
      </span>
      <span className="logo-text">
        <span className="logo-name">{t("common.appName")}</span>
        {showTagline && <span className="logo-tag">{t("common.tagline")}</span>}
      </span>
    </Link>
  );
}
