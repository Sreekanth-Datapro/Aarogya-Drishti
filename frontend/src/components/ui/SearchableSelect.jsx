import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Search } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

// Only this many matches are drawn at once, so long village lists stay fast
const MAX_SHOWN = 100;

// "G. Madugula" -> "gmadugula", so "g madugula", "G.Madugula" etc. all match
function simplify(text) {
  return String(text || "").toLowerCase().replace(/[\s.\-_/()]/g, "");
}

// A dropdown you can type into to search.
// options: [{ value: "2", label: "జి. మాడుగుల", searchText: "G. Madugula జి. మాడుగుల" }]
// searchText is optional: extra words that should also find the option (e.g. the English name).
// onChange receives the chosen value ("" when nothing is chosen).
export default function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  noMatchesText,
  moreText,
  required = false,
  disabled = false,
  hint,
  error,
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const listId = `${id}-list`;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const selected = options.find((option) => String(option.value) === String(value));

  // Options that match what the user typed
  const matches = useMemo(() => {
    const text = simplify(query);
    return text
      ? options.filter((option) => simplify(`${option.label} ${option.searchText || ""}`).includes(text))
      : options;
  }, [options, query]);

  const shown = matches.slice(0, MAX_SHOWN);

  // Keep the highlighted option visible while using the arrow keys
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeItem = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeItem?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  const choose = (option) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(0);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openList();
      setActiveIndex((index) => Math.min(index + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (shown[activeIndex]) choose(shown[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  // While the list is open the box shows what the user types,
  // otherwise it shows the chosen option
  const inputValue = open ? query : selected?.label || "";

  return (
    <div className={`field combo ${error ? "has-error" : ""}`}>
      <div className="field-label-row">
        <label className={`field-label ${required ? "is-required" : ""}`} htmlFor={id}>
          {label}
        </label>
      </div>

      <div className="field-control has-icon">
        <Search className="field-icon" size={18} aria-hidden="true" />
        <input
          id={id}
          className="input combo-input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && shown[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          aria-required={required || undefined}
          placeholder={selected && open ? selected.label : placeholder || t("common.typeToSearch")}
          value={inputValue}
          disabled={disabled}
          onFocus={openList}
          onClick={openList}
          onBlur={() => { setOpen(false); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown className="combo-chevron" size={18} aria-hidden="true" />

        {open && (
          <ul className="combo-list" id={listId} role="listbox" aria-label={label} ref={listRef}>
            {shown.map((option, index) => {
              const isSelected = String(option.value) === String(value);
              return (
                <li
                  key={option.value}
                  id={`${id}-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  className={`combo-option ${index === activeIndex ? "active" : ""}`}
                  // mousedown (not click) so the input does not lose focus first
                  onMouseDown={(e) => { e.preventDefault(); choose(option); }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={16} aria-hidden="true" />}
                </li>
              );
            })}

            {shown.length === 0 && <li className="combo-empty">{noMatchesText || t("common.noMatches")}</li>}
            {matches.length > MAX_SHOWN && <li className="combo-empty">{moreText || t("common.keepTyping")}</li>}
          </ul>
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
