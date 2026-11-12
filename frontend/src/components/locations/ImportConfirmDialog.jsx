import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Button, Checkbox, Modal } from "../ui";

// Last step before anything is saved: shows what will change and asks the admin to confirm.
export default function ImportConfirmDialog({ open, rows, parentName, importing, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const [reviewed, setReviewed] = useState(false);

  // Ask again every time the dialog opens
  useEffect(() => {
    if (open) setReviewed(false);
  }, [open]);

  const count = (action) => rows.filter((row) => row.action === action).length;

  return (
    <Modal
      open={open}
      title={t("locations.confirmTitle")}
      onClose={importing ? () => {} : onCancel}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={importing}>{t("locations.cancel")}</Button>
          <Button onClick={onConfirm} loading={importing} disabled={!reviewed}>
            {importing ? t("locations.importing") : t("locations.confirmButton")}
          </Button>
        </>
      }
    >
      <p>
        {t("locations.confirmText")} <strong>{parentName}</strong>
      </p>

      <ul className="summary-list">
        <li>{t("locations.willInsert")} <strong>{count("new")}</strong></li>
        <li>{t("locations.willUpdate")} <strong>{count("update")}</strong></li>
        <li>{t("locations.willLink")} <strong>{count("link")}</strong></li>
      </ul>

      <Alert type="info">{t("locations.safetyNote")}</Alert>

      <Checkbox
        id="confirm-reviewed"
        label={t("locations.confirmCheck")}
        checked={reviewed}
        onChange={(e) => setReviewed(e.target.checked)}
      />
    </Modal>
  );
}
