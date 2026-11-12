import React from "react";

// A small card showing one number, e.g. "Villages: 12".
// tone changes the icon colour: "green" | "blue" | "amber" | "violet" | "rose"
export default function StatCard({ icon: Icon, label, value, hint, tone = "green" }) {
  return (
    <article className="stat-card animate-in">
      {Icon && (
        <div className={`stat-icon tone-${tone}`} aria-hidden="true">
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {hint && <p className="stat-hint">{hint}</p>}
      </div>
    </article>
  );
}
