import React from "react";

// A white rounded box. Give it a title to show a header row.
// Example: <Card title="Users" subtitle="All active users">...</Card>
export default function Card({ title, subtitle, actions, padded = true, className = "", children }) {
  if (!title) {
    return <section className={`card ${padded ? "card-padded" : ""} ${className}`}>{children}</section>;
  }

  return (
    <section className={`card ${className}`}>
      <div className="card-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className={padded ? "card-body" : ""}>{children}</div>
    </section>
  );
}
