import React, { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getLocalizedMasterName } from "../../i18n/displayLabels";
import { Badge, Button, DataTable, TextField } from "../ui";
import { IMPORTABLE, STATUS_ORDER, STATUS_TONES } from "./status";

// Table of records fetched from LGD. The admin ticks the rows to import.
// The English and Telugu names are both shown, because this page compares LGD data.
export default function PreviewTable({ preview, selected, onChangeSelected }) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Rows that match the search box and the status chip
  const shownRows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return preview.rows.filter((row) => {
      const statusOk = statusFilter === "all" || row.action === statusFilter;
      const textOk = !text
        || row.name_en.toLowerCase().includes(text)
        || String(row.name_te || "").includes(text)
        || String(row.lgd_code).includes(text);
      return statusOk && textOk;
    });
  }, [preview.rows, search, statusFilter]);

  const shownImportable = shownRows.filter((row) => IMPORTABLE.includes(row.action));
  const allShownSelected = shownImportable.length > 0 && shownImportable.every((row) => selected.has(row.lgd_code));

  const toggleRow = (code) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChangeSelected(next);
  };

  const toggleAllShown = () => {
    const next = new Set(selected);
    shownImportable.forEach((row) => (allShownSelected ? next.delete(row.lgd_code) : next.add(row.lgd_code)));
    onChangeSelected(next);
  };

  const selectImportable = () => {
    onChangeSelected(new Set(preview.rows.filter((row) => IMPORTABLE.includes(row.action)).map((row) => row.lgd_code)));
  };

  const columns = [
    {
      key: "check",
      header: (
        <input
          type="checkbox"
          checked={allShownSelected}
          onChange={toggleAllShown}
          disabled={!shownImportable.length}
          aria-label={t("locations.selectAllShown")}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.lgd_code)}
          onChange={() => toggleRow(row.lgd_code)}
          disabled={!IMPORTABLE.includes(row.action)}
          aria-label={`${t("locations.selectRow")} ${getLocalizedMasterName(row, language)}`}
        />
      ),
    },
    { key: "lgd_code", header: t("locations.colLgdCode"), render: (row) => <span className="mono">{row.lgd_code}</span> },
    { key: "name_en", header: t("locations.colName"), render: (row) => <strong>{row.name_en}</strong> },
    { key: "name_te", header: t("locations.colTelugu"), render: (row) => row.name_te || <span className="muted-cell">-</span> },
    {
      key: "action",
      header: t("locations.colStatus"),
      render: (row) => <Badge tone={STATUS_TONES[row.action]}>{t(`locations.status.${row.action}`)}</Badge>,
    },
    {
      key: "existing",
      header: t("locations.colExisting"),
      render: (row) =>
        row.existing ? (
          <span>
            {getLocalizedMasterName(row.existing, language)} <span className="muted-cell mono">({row.existing.code})</span>{" "}
            {row.existing.is_verified && <Badge tone="brand" icon={ShieldCheck}>{t("locations.verified")}</Badge>}
          </span>
        ) : (
          <span className="muted-cell">-</span>
        ),
    },
  ];

  return (
    <>
      <div className="toolbar">
        <div className="status-chips" role="group" aria-label={t("locations.colStatus")}>
          <button type="button" className="status-chip" aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            {t("locations.allStatuses")} <strong>{preview.rows.length}</strong>
          </button>
          {STATUS_ORDER.filter((status) => preview.counts[status] > 0).map((status) => (
            <button
              key={status}
              type="button"
              className="status-chip"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {t(`locations.status.${status}`)} <strong>{preview.counts[status]}</strong>
            </button>
          ))}
        </div>

        <TextField
          id="preview-search"
          label={t("locations.search")}
          icon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("locations.search")}
        />
      </div>

      <div className="toolbar">
        <div className="toolbar-actions">
          <Button size="sm" variant="secondary" onClick={selectImportable}>{t("locations.selectImportable")}</Button>
          <Button size="sm" variant="ghost" onClick={() => onChangeSelected(new Set())} disabled={!selected.size}>
            {t("locations.clearSelection")}
          </Button>
        </div>
      </div>

      <DataTable columns={columns} rows={shownRows} rowKey="lgd_code" emptyTitle={t("locations.noRowsMatch")} />
    </>
  );
}
