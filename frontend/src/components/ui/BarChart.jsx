import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedNumber } from "../../i18n/displayLabels";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

// A horizontal bar chart made with plain HTML and CSS (no chart library).
// data: [{ label: "Health worker", value: 12 }]
export default function BarChart({ data }) {
  const { language } = useLanguage();
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <ul className="bar-chart">
      {data.map((item, index) => (
        <li key={item.label} className="bar-row">
          <span className="bar-label" title={item.label}>{item.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span
              className="bar-fill"
              style={{
                display: "block",
                width: `${(item.value / max) * 100}%`,
                background: item.color || COLORS[index % COLORS.length],
              }}
            />
          </span>
          <span className="bar-value">
            {formatLocalizedNumber(item.value || 0, language)}
          </span>
        </li>
      ))}
    </ul>
  );
}
