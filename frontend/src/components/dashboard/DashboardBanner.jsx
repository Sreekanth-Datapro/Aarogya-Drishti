import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import "./DashboardBanner.css";

const VARIANT_ASSETS = {
  healthWorker: {
    src: "/assets/hw_dashboard_banner.jpg?v=2",
    altKey: "dashboard.hwBannerAlt",
    labelKey: "dashboard.hwBannerLabel",
  },
  medicalOfficer: {
    src: "/assets/mo_dashboard_banner.jpg?v=2",
    altKey: "dashboard.moBannerAlt",
    labelKey: "dashboard.moBannerLabel",
  },
  diagnostics: {
    src: "/assets/diagnostics_dashboard_banner.jpg?v=2",
    altKey: "dashboard.diagnosticsBannerAlt",
    labelKey: "dashboard.diagnosticsBannerLabel",
  },
  default: {
    src: "/assets/hero_banner.jpg?v=2",
    altKey: "dashboard.bannerAlt",
    labelKey: "dashboard.healthcareBanner",
  },
};

/**
 * Role-aware panoramic dashboard banner.
 * Variants keep Health Worker (field outreach), Medical Officer (clinical),
 * and Diagnostics visually distinct while sharing one layout shell.
 */
export default function DashboardBanner({
  children,
  className = "",
  variant = "default",
  imageSrc,
  alt,
}) {
  const { t } = useLanguage();
  const preset = VARIANT_ASSETS[variant] || VARIANT_ASSETS.default;
  const src = imageSrc || preset.src;
  const imageAlt = alt || t(preset.altKey);
  const label = t(preset.labelKey);

  return (
    <section
      className={[
        "dashboard-hero-banner",
        children ? "dashboard-role-banner" : "",
        `dashboard-banner-${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      <div className="banner-image-wrapper">
        <img src={src} alt={imageAlt} className="banner-image" />
        <div className="banner-overlay" />
        <div className="banner-shimmer" aria-hidden="true" />
      </div>
      {children && <div className="dashboard-banner-content">{children}</div>}
    </section>
  );
}
