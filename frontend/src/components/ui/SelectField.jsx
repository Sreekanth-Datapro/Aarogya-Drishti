import React from "react";
import { CircleAlert } from "lucide-react";

// A labelled dropdown. Put <option> elements inside it as children.
export default function SelectField({
  id,
  label,
  required = false,
  hint,
  error,
  children,
  className = "",
  ...selectProps
}) {
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label className={`field-label ${required ? "is-required" : ""}`} htmlFor={id}>
        {label}
      </label>

      <select
        id={id}
        className="select"
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...selectProps}
      >
        {children}
      </select>

      {error && (
        <p id={errorId} className="field-error">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && <p id={hintId} className="field-hint">{hint}</p>}
    </div>
  );
}
