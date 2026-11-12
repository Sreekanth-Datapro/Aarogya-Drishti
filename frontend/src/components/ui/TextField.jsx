import React, { useState } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

// A labelled text input with optional icon, hint text and error message.
// Password fields get a show/hide button automatically.
// Example: <TextField id="email" label="Email" value={email} onChange={...} />
export default function TextField({
  id,
  label,
  required = false,
  optionalText,
  hint,
  error,
  icon: Icon,
  type = "text",
  className = "",
  ...inputProps
}) {
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const controlClasses = [
    "field-control",
    Icon ? "has-icon" : "",
    isPassword ? "has-toggle" : "",
  ].join(" ");

  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      {/* The "*" for required fields is drawn by CSS (.is-required) */}
      <div className="field-label-row">
        <label className={`field-label ${required ? "is-required" : ""}`} htmlFor={id}>
          {label}
        </label>
        {optionalText && <span className="field-optional">{optionalText}</span>}
      </div>

      <div className={controlClasses}>
        {Icon && <Icon className="field-icon" size={18} aria-hidden="true" />}

        <input
          id={id}
          className="input"
          type={isPassword && showPassword ? "text" : type}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          {...inputProps}
        />

        {isPassword && (
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

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
