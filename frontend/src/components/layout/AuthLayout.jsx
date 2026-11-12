import React from "react";
import { ShieldCheck, Stethoscope, Users } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { LanguageSwitch, Logo } from "../ui";

const FEATURES = [
  { icon: Users, title: "brand.feature1Title", text: "brand.feature1Text" },
  { icon: Stethoscope, title: "brand.feature2Title", text: "brand.feature2Text" },
  { icon: ShieldCheck, title: "brand.feature3Title", text: "brand.feature3Text" },
];

// Split-screen layout for sign-in, registration and password pages.
// Left: brand story (hidden on tablets/phones). Right: the page content.
export default function AuthLayout({ wide = false, scrollable = false, children }) {
  const { t } = useLanguage();

  return (
    <div className={`auth-layout ${wide ? "wide" : ""} ${scrollable ? "auth-layout-scrollable" : ""}`}>
      <aside className="auth-brand">
        <Logo onDark showTagline />

        <div>
          <p className="auth-hero-title">{t("brand.heroTitle")}</p>
          <p className="auth-hero-text">{t("brand.heroText")}</p>

          <ul className="auth-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="auth-feature">
                <span className="auth-feature-icon">
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{t(title)}</strong>
                  <span>{t(text)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-footer">{t("common.demoNotice")}</p>
      </aside>

      <main className={`auth-main ${scrollable ? "auth-main-scrollable" : ""}`}>
        <div className="auth-topbar">
          <Logo showTagline={false} />
          <LanguageSwitch />
        </div>

        <div className={`auth-content ${scrollable ? "auth-content-scrollable" : ""}`}>
          <div className={`auth-card ${wide ? "wide" : ""}`}>{children}</div>
        </div>

        <p className="auth-demo-note">{t("common.demoNotice")}</p>
      </main>
    </div>
  );
}
