import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";

// Vertical columns for a trend over time, made with plain HTML and CSS.
// data: [{ label: "Jan 26", value: 12 }]
export default function ColumnChart({ data }) {
  const { language } = useLanguage();
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <div
      className="column-chart"
      role="img"
      aria-label={data.map((item) => `${item.label}: ${item.value}`).join(", ")}
    >
      {data.map((item) => (
        <div key={item.label} className="column-item">
          <span className="column-value">{formatLocalizedNumber(item.value, language)}</span>
          <span className="column-track">
            <span className="column-fill" style={{ height: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="column-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
