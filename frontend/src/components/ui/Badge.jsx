import React from "react";

// A small coloured label, e.g. a status.
// tone: "neutral" | "success" | "warning" | "danger" | "info" | "brand"
export default function Badge({ tone = "neutral", icon: Icon, children }) {
  return (
    <span className={`badge badge-${tone}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
