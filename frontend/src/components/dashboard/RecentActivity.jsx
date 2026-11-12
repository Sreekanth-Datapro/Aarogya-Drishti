import React from "react";
import { Clock, ArrowRight } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedRelativeTime, getAuditActionLabel } from "../../i18n/displayLabels";
import "./RecentActivity.css";

// Colour of the dot in front of an event (the text comes from getAuditActionLabel)
function getDotColor(item) {
  const event = item.event || "";

  let dotColor = "var(--chart-1)";
  if (event.includes("FAIL") || event.includes("DENIED")) {
    dotColor = "var(--danger)";
  } else if (event.includes("REGISTRATION") || event.includes("PATIENT")) {
    dotColor = "var(--chart-2)";
  } else if (event.includes("LOCATION") || event.includes("IMPORT")) {
    dotColor = "var(--chart-3)";
  } else if (event.includes("FACILITY")) {
    dotColor = "var(--chart-4)";
  }

  return dotColor;
}

/**
 * Recent Activities Card
 * 100% Dynamic audit entries directly from PostgreSQL tbl_audit_logs.
 */
export default function RecentActivity({ items = [] }) {
  const { language, t } = useLanguage();

  const displayItems = items && items.length > 0 ? items.slice(0, 4) : [];

  return (
    <div className="bottom-card recent-activity-card">
      <div className="bottom-card-header">
        <div className="bottom-card-title">
          <Clock size={16} className="title-icon green" />
          <h4>{t("dashboard.recentActivity")}</h4>
        </div>
        <button type="button" className="card-header-link">
          <span>{t("dashboard.viewAll")}</span>
          <ArrowRight size={13} />
        </button>
      </div>

      <div className="activity-list">
        {displayItems.length === 0 ? (
          <div className="activity-empty-state">
            <span>{t("dashboard.noActivity")}</span>
          </div>
        ) : (
          displayItems.map((item) => {
            const dotColor = getDotColor(item);
            const label = item.customText || getAuditActionLabel(item.event, language);
            const time = formatLocalizedRelativeTime(item.occurred_at, language);

            return (
              <div key={item.id} className="activity-row">
                <span className="activity-dot" style={{ backgroundColor: dotColor }} />
                <div className="activity-text">
                  <span className="activity-desc">{label}</span>
                  <span className="activity-time">{time}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
