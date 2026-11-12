import React from "react";

// A button with consistent styling.
// variant: "primary" | "secondary" | "ghost" | "danger" | "link"
// Example: <Button type="submit" loading={saving}>Save</Button>
export default function Button({
  variant = "primary",
  size,
  block = false,
  loading = false,
  icon: Icon,
  type = "button",
  className = "",
  disabled,
  children,
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ].join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon && <Icon size={18} aria-hidden="true" />}
      {children}
    </button>
  );
}
