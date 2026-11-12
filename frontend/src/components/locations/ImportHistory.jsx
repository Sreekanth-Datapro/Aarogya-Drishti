import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime } from "../../i18n/displayLabels";
import { Card, DataTable } from "../ui";

const LEVEL_KEYS = { DISTRICT: "locations.levelDistrict", MANDAL: "locations.levelMandal", VILLAGE: "locations.levelVillage" };

// Recent imports: when, what, from where, by whom and the result.
// parent_name is saved as English text at import time (the table has no Telugu column).
export default function ImportHistory({ imports }) {
  const { t, language } = useLanguage();

  const columns = [
    {
      key: "imported_at",
      header: t("locations.colDate"),
      render: (row) => formatLocalizedDateTime(row.imported_at, language, { dateStyle: "medium", timeStyle: "short" }),
    },
    { key: "level", header: t("locations.colLevel"), render: (row) => t(LEVEL_KEYS[row.level]) },
    { key: "parent_name", header: t("locations.colParent") },
    {
      key: "result",
      header: t("locations.colResult"),
      render: (row) =>
        `${row.inserted_count} ${t("locations.added")} · ${row.updated_count} ${t("locations.updated")} · ` +
        `${row.linked_count} ${t("locations.linked")} · ${row.skipped_count} ${t("locations.skipped")}`,
    },
    { key: "imported_by_name", header: t("locations.colBy") },
  ];

  return (
    <Card title={t("locations.historyTitle")} subtitle={t("locations.historyText")} padded={false}>
      <DataTable columns={columns} rows={imports} emptyTitle={t("locations.historyEmpty")} emptyText={t("locations.sourceBadge")} />
    </Card>
  );
}
