import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";

// Previous / next buttons under a list. paging = { page, total, total_pages }
export default function Pager({ paging, onPage, disabled }) {
  const { t, language } = useLanguage();
  return (
    <div className="mo-pager">
      <span>{t("mo.totalRecords", { count: formatLocalizedNumber(paging.total || 0, language) })}</span>
      <div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || paging.page <= 1} onClick={() => onPage(paging.page - 1)}>
          {t("auditLogs.previous")}
        </button>
        <span>{t("auditLogs.pageOf", { page: paging.page, total: Math.max(paging.total_pages || 0, 1) })}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || paging.page >= paging.total_pages} onClick={() => onPage(paging.page + 1)}>
          {t("auditLogs.next")}
        </button>
      </div>
    </div>
  );
}
