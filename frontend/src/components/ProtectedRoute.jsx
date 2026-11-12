
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { OFFLINE_ALLOWED_PATH_PREFIXES } from "../offline/constants";
import { Card, EmptyState, PageLoader } from "./ui";

function isOfflinePathAllowed(pathname) {
  return OFFLINE_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading, authMode, isOffline } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return <PageLoader label={t("common.loading")} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Offline unlock: only registration, settings, and a read-only dashboard CTA
  if (isOffline || authMode === "offline") {
    if (!isOfflinePathAllowed(location.pathname)) {
      return (
        <Card>
          <EmptyState
            icon={WifiOff}
            title={t("offline.routeBlockedTitle")}
            text={t("offline.routeBlockedText")}
          />
        </Card>
      );
    }
  }

  return <Outlet />;
}
