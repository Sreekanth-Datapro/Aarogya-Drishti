import React from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";

const ICONS = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

// A message box. type: "success" | "error" | "warning" | "info"
// Errors use role="alert" so screen readers announce them immediately.
export default function Alert({ type = "info", title, children }) {
  const Icon = ICONS[type];

  return (
    <div className={`alert alert-${type}`} role={type === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>
        {title && <p className="alert-title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
