import React from "react";
import { CircleAlert } from "lucide-react";

// A checkbox with a clickable label and an optional error message.
export default function Checkbox({ id, label, error, ...inputProps }) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label className="checkbox" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          {...inputProps}
        />
        <span>{label}</span>
      </label>

      {error && (
        <p id={errorId} className="field-error">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
