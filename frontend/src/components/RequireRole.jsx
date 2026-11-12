import React from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { hasAnyPermission } from "../config/pageAccess";
import { Card, EmptyState } from "./ui";

// Shows the page when the user has one of the listed roles OR one of the listed
// permissions. The server still checks API authorization separately.
export default function RequireRole({ roles, permissions, children }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const roleList = Array.isArray(roles) ? roles : [];
  const permissionList = Array.isArray(permissions) ? permissions : [];
  const roleOk = roleList.length > 0 && roleList.includes(user?.role);
  const permissionOk = permissionList.length > 0 && hasAnyPermission(user?.permissions, permissionList);
  const allowed = roleOk || permissionOk;

  if (!allowed) {
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title={t("common.noAccessTitle")} text={t("common.noAccessText")} />
      </Card>
    );
  }

  return children;
}
