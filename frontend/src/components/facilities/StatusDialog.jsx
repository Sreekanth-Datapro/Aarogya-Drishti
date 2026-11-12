import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getLocalizedMasterName } from "../../i18n/displayLabels";
import { Button, Modal } from "../ui";

// Asks before a facility is activated or deactivated.
// facility: the facility to change (null = dialog closed)
export default function StatusDialog({ facility, busy, onCancel, onConfirm }) {
  const { t, language } = useLanguage();
  const deactivating = facility?.is_active;

  return (
    <Modal
      open={Boolean(facility)}
      title={deactivating ? t("facilities.confirmDeactivateTitle") : t("facilities.confirmActivateTitle")}
      onClose={busy ? () => {} : onCancel}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{t("facilities.cancel")}</Button>
          <Button variant={deactivating ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {deactivating ? t("facilities.deactivate") : t("facilities.activate")}
          </Button>
        </>
      }
    >
      <p><strong>{getLocalizedMasterName(facility, language)}</strong></p>
      <p className="text-muted">
        {deactivating ? t("facilities.confirmDeactivateText") : t("facilities.confirmActivateText")}
      </p>
    </Modal>
  );
}
