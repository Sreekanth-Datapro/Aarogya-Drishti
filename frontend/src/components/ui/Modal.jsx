import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

// A simple dialog box shown on top of the page.
// Closes with the Escape key, the X button or a click outside the box.
// Example: <Modal open={open} title="Confirm" onClose={close} footer={<Button>OK</Button>}>Text</Modal>
// className is added to the dialog box, e.g. to make it wider
export default function Modal({ open, title, onClose, footer, closeLabel, className = "", children }) {
  const { t } = useLanguage();
  const boxRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    boxRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={boxRef}>
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={closeLabel || t("common.close")}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
