import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import EmptyState from "./EmptyState";

// A simple table.
// columns: [{ key: "name", header: "Name", render: (row) => <b>{row.name}</b> }]
// rows:    [{ id: 1, name: "Paderu" }]
export default function DataTable({ columns, rows, rowKey = "id", emptyTitle, emptyText }) {
  const { t } = useLanguage();

  if (!rows.length) {
    return <EmptyState title={emptyTitle || t("common.noRecords")} text={emptyText} />;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
