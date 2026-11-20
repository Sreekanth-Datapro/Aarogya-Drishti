import React from "react";
import { NavLink } from "react-router-dom";
import { Home } from "lucide-react";
import { getModulesForUser } from "../../config/navigation";
import { useLanguage } from "../../i18n/LanguageContext";

export default function MobileBottomNavigation({ user }) {
  const { t } = useLanguage();
  const primaryModules = getModulesForUser(user)
    .filter((module) => (
      module.path
      && (user?.role !== "SYSTEM_ADMIN" || ["facilities", "roleManagement"].includes(module.key))
    ))
    .slice(0, 3);

  return (
    <nav className="mobile-bottom-nav" aria-label={t("nav.mobileNavigation")}>
      <NavLink to="/dashboard" end className={({ isActive }) => `mobile-bottom-nav-item${isActive ? " active" : ""}`}>
        <Home size={20} aria-hidden="true" />
        <span>{t("nav.dashboard")}</span>
      </NavLink>
      {primaryModules.map((module) => {
        const Icon = module.icon;
        return (
          <NavLink
            key={module.key}
            to={module.path}
            end
            className={({ isActive }) => `mobile-bottom-nav-item${isActive ? " active" : ""}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{t(`modules.${module.key}.title`)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
