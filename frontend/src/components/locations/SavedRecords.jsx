import React from "react";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getLocalizedMasterName } from "../../i18n/displayLabels";
import { Badge, Button, Card, DataTable } from "../ui";

// Locations already in Aarogya Drishti for the current selection.
// "Verified" records are protected: LGD imports never change them.
export default function SavedRecords({ records, onToggleVerified, busyId }) {
  const { t, language } = useLanguage();

  const columns = [
    {
      key: "name_en",
      header: t("locations.colName"),
      render: (row) => (
        <div>
          <strong>{getLocalizedMasterName(row, language)}</strong>
          {language === "en" && row.name_te && <p className="cell-sub">{row.name_te}</p>}
        </div>
      ),
    },
    { key: "code", header: t("locations.colCode"), render: (row) => <span className="mono">{row.code}</span> },
    {
      key: "lgd_code",
      header: t("locations.colLgdCode"),
      render: (row) => (row.lgd_code ? <span className="mono">{row.lgd_code}</span> : <span className="muted-cell">-</span>),
    },
    {
      key: "data_source",
      header: t("locations.colSource"),
      render: (row) => (
        <Badge tone={row.data_source === "LGD" ? "info" : "neutral"}>
          {row.data_source === "LGD" ? t("locations.sourceLgd") : t("locations.sourceManual")}
        </Badge>
      ),
    },
    {
      key: "is_verified",
      header: t("locations.colVerified"),
      render: (row) =>
        row.is_verified ? (
          <span>
            <Badge tone="brand" icon={ShieldCheck}>{t("locations.verified")}</Badge>{" "}
            <Button size="sm" variant="link" onClick={() => onToggleVerified(row, false)} disabled={busyId === row.id}>
              {t("locations.removeVerified")}
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onToggleVerified(row, true)} loading={busyId === row.id}>
            {t("locations.markVerified")}
          </Button>
        ),
    },
  ];

  return (
    <Card title={t("locations.savedTitle")} subtitle={t("locations.savedText")} padded={false}>
      <DataTable columns={columns} rows={records} emptyTitle={t("locations.savedEmpty")} />
    </Card>
  );
}
