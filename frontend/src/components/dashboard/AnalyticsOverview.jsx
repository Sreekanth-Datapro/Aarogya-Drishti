import React, { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedMonth, formatLocalizedNumber } from "../../i18n/displayLabels";
import "./AnalyticsOverview.css";

/**
 * Analytics Overview Component
 * Renders an interactive, responsive line and area chart for monthly healthcare trends.
 * Features:
 *  - Metric tab pills: Registrations, Appointments, Facilities, Patients
 *  - Date range filter: Last 6 Months
 *  - Responsive SVG Chart with interactive tooltips and smooth curves
 *  - 100% Student-understandable standard React code.
 */
export default function AnalyticsOverview({ trends = [] }) {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState("registrations");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const months = trends.map((item) => item.month);
  const localizedMonths = months.map((month) => formatLocalizedMonth(month, language));

  // Extract series based on active tab directly from PostgreSQL trends
  const getSeriesData = () => {
    const seriesA = trends.map((item) => {
      switch (activeTab) {
        case "appointments":
          return Number(item.appointments || 0);
        case "facilities":
          return Number(item.facilities || 0);
        case "patients":
          return Number(item.patients || 0);
        case "registrations":
        default:
          return Number(item.registrations || 0);
      }
    });

    const seriesB = trends.map((item) => Number(item.appointments || 0));
    return { seriesA, seriesB };
  };

  const { seriesA, seriesB } = getSeriesData();

  // SVG Chart Dimensions
  const width = 640;
  const height = 210;
  const paddingX = 45;
  const paddingY = 25;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Dynamic Y scaling according to actual PostgreSQL values
  const allValues = [...seriesA, ...seriesB];
  const highest = Math.max(...allValues, 0);
  const maxVal = highest === 0 ? 10 : highest <= 10 ? 10 : highest <= 50 ? 50 : highest <= 200 ? 200 : Math.ceil((highest * 1.2) / 100) * 100;

  // Helper to convert data point to SVG coordinate
  const getPoint = (val, index, total) => {
    const x = total > 1
      ? paddingX + (index / (total - 1)) * chartWidth
      : paddingX + chartWidth / 2;
    const y = height - paddingY - (val / maxVal) * chartHeight;
    return { x, y };
  };

  // Build smooth SVG Bezier curve path
  const buildSmoothPath = (data) => {
    if (!data.length) return "";
    const points = data.map((val, idx) => getPoint(val, idx, data.length));
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const cpX = (current.x + next.x) / 2;
      path += ` C ${cpX} ${current.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const pathA = buildSmoothPath(seriesA);
  const pathB = buildSmoothPath(seriesB);

  // Area path with bottom closure
  const areaA = `${pathA} L ${paddingX + chartWidth} ${height - paddingY} L ${paddingX} ${
    height - paddingY
  } Z`;
  const areaB = `${pathB} L ${paddingX + chartWidth} ${height - paddingY} L ${paddingX} ${
    height - paddingY
  } Z`;

  const yLabels = [0, Math.round(maxVal / 3), Math.round((maxVal * 2) / 3), maxVal];

  if (!trends.length) {
    return (
      <section className="analytics-card analytics-empty" aria-live="polite">
        <div className="analytics-header">
          <div className="analytics-title">
            <Activity size={18} className="title-icon" />
            <h3>{t("dashboard.analyticsOverview")}</h3>
          </div>
        </div>
        <p>{t("dashboard.noTrendData")}</p>
      </section>
    );
  }

  return (
    <div className="analytics-card">
      {/* Header with Title and Range Picker */}
      <div className="analytics-header">
        <div className="analytics-title">
          <Activity size={18} className="title-icon" />
          <h3>{t("dashboard.analyticsOverview")}</h3>
        </div>
        <div className="analytics-filter-dropdown">
          <span>{t("dashboard.last6Months")}</span>
          <ChevronDown size={14} />
        </div>
      </div>

      {/* Tabs Row & Legend */}
      <div className="analytics-controls">
        <div className="analytics-tabs">
          {[
            { id: "registrations", label: t("dashboard.registrations") },
            { id: "appointments", label: t("dashboard.appointments") },
            { id: "facilities", label: t("dashboard.facilities") },
            { id: "patients", label: t("dashboard.patients") },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`analytics-tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="analytics-legend">
          <span className="legend-item">
            <span className="legend-pill pill-green" />
            <span className="legend-text">{t("dashboard.registrations")}</span>
          </span>
          <span className="legend-item">
            <span className="legend-pill pill-blue" />
            <span className="legend-text">{t("dashboard.appointments")}</span>
          </span>
        </div>
      </div>

      {/* SVG Interactive Line Chart */}
      <div className="analytics-chart-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="analytics-svg"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Soft Translucent Green Area Gradient */}
            <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.0" />
            </linearGradient>

            {/* Soft Translucent Blue Area Gradient */}
            <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines & Y-Axis Labels */}
          {yLabels.map((val, idx) => {
            const y = height - paddingY - (val / maxVal) * chartHeight;
            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#94a3b8"
                  fontWeight="500"
                >
                  {formatLocalizedNumber(val, language)}
                </text>
              </g>
            );
          })}

          {/* Area Fills */}
          <path d={areaB} fill="url(#blueGradient)" />
          <path d={areaA} fill="url(#greenGradient)" />

          {/* Crisp Lines */}
          <path
            d={pathB}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={pathA}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Interactive Data Points */}
          {seriesA.map((val, idx) => {
            const ptA = getPoint(val, idx, seriesA.length);
            const ptB = getPoint(seriesB[idx] || 0, idx, seriesB.length);
            const isHovered = hoveredIndex === idx;

            return (
              <g key={idx} onMouseEnter={() => setHoveredIndex(idx)} onMouseLeave={() => setHoveredIndex(null)}>
                {/* Vertical guide on hover */}
                {isHovered && (
                  <line
                    x1={ptA.x}
                    y1={paddingY}
                    x2={ptA.x}
                    y2={height - paddingY}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Point B (Blue) */}
                <circle
                  cx={ptB.x}
                  cy={ptB.y}
                  r={isHovered ? 5 : 3.5}
                  fill="#ffffff"
                  stroke="var(--chart-2)"
                  strokeWidth="2.5"
                  className="chart-dot"
                />

                {/* Point A (Green) */}
                <circle
                  cx={ptA.x}
                  cy={ptA.y}
                  r={isHovered ? 5 : 3.5}
                  fill="#ffffff"
                  stroke="var(--chart-1)"
                  strokeWidth="2.5"
                  className="chart-dot"
                />

                {/* X-Axis Month Labels */}
                <text
                  x={ptA.x}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isHovered ? "#0f172a" : "#64748b"}
                  fontWeight={isHovered ? "700" : "500"}
                >
                  {localizedMonths[idx]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(
                months.length > 1
                  ? paddingX + (hoveredIndex / (months.length - 1)) * chartWidth
                  : paddingX + chartWidth / 2
              ) / (width / 100)}%`,
            }}
          >
            <div className="tooltip-title">{localizedMonths[hoveredIndex]}</div>
            <div className="tooltip-row green">
              <span>{t("dashboard.registrations")}:</span>
              <strong>{formatLocalizedNumber(seriesA[hoveredIndex] || 0, language)}</strong>
            </div>
            <div className="tooltip-row blue">
              <span>{t("dashboard.appointments")}:</span>
              <strong>{formatLocalizedNumber(seriesB[hoveredIndex] || 0, language)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
