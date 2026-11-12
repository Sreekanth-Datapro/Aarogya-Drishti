import React, { useState } from "react";
import { Hash, MapPin } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Card, TextField } from "../ui";

const emptyForm = { name_en: "", name_te: "", lgd_code: "" };

// Fallback when LGD is down or a place is missing there.
// level: "district" | "mandal" | "village"; parentId: district id (mandal) or mandal id (village)
export default function ManualEntryForm({ level, parentId, parentName, stateName, onSaved, onClose }) {
  const { t, tm } = useLanguage();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const needsParent = level !== "district";
  const levelLabel = { district: t("locations.district"), mandal: t("locations.mandal"), village: t("register.village") }[level];

  const update = (e) => setForm((previous) => ({ ...previous, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (needsParent && !parentId) {
      setError(level === "mandal" ? "locations.selectDistrict" : "locations.selectMandal");
      return;
    }

    setSaving(true);
    try {
      await api.post("/locations/manual", {
        level,
        parent_id: needsParent ? Number(parentId) : undefined,
        state_name: needsParent ? undefined : stateName,
        name_en: form.name_en,
        name_te: form.name_te || undefined,
        lgd_code: form.lgd_code ? Number(form.lgd_code) : undefined,
      });
      setMessage("locations.manualSaved");
      setForm(emptyForm);
      onSaved();
    } catch (err) {
      setError(apiMessage(err, "register.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={`${t("locations.manualTitle")} · ${levelLabel}`}
      subtitle={t("locations.manualText")}
      actions={<Button variant="ghost" size="sm" onClick={onClose}>{t("common.close")}</Button>}
    >
      <form className="auth-form auth-form-compact" onSubmit={handleSubmit}>
        {needsParent && (
          <p className="text-sm text-muted">
            {level === "mandal" ? t("locations.district") : t("locations.mandal")}:{" "}
            <strong>{parentName || "-"}</strong>
          </p>
        )}

        <div className="form-grid">
          <TextField id="manual-name-en" name="name_en" label={t("locations.nameEn")} icon={MapPin} value={form.name_en} onChange={update} required />
          <TextField id="manual-name-te" name="name_te" label={t("locations.nameTe")} optionalText={t("common.optional")} value={form.name_te} onChange={update} />
          <TextField
            id="manual-lgd"
            name="lgd_code"
            label={t("locations.lgdCode")}
            optionalText={t("common.optional")}
            icon={Hash}
            inputMode="numeric"
            value={form.lgd_code}
            onChange={(e) => setForm((previous) => ({ ...previous, lgd_code: e.target.value.replace(/\D/g, "") }))}
          />
        </div>

        {error && <Alert type="error">{tm(error)}</Alert>}
        {message && <Alert type="success">{tm(message)}</Alert>}

        <div>
          <Button type="submit" loading={saving}>{saving ? t("locations.saving") : t("locations.save")}</Button>
        </div>
      </form>
    </Card>
  );
}
