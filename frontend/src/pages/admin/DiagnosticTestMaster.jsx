import React, { useCallback, useEffect, useState } from "react";
import { Microscope, Plus } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "../diagnostics/Diagnostics.css";
import "../medicalOfficer/MedicalOfficer.css";

const EMPTY_FORM = {
  category_id: "",
  code: "",
  name_en: "",
  name_te: "",
  default_fasting: false,
  is_active: true,
};

export default function DiagnosticTestMaster() {
  const { t, language } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catRes, testRes] = await Promise.all([
        api.get("/diagnostics/categories"),
        api.get("/diagnostics/admin/tests"),
      ]);
      setCategories(catRes.data.categories || []);
      setTests(testRes.data.tests || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(test) {
    setEditingId(test.id);
    setForm({
      category_id: String(test.category_id),
      code: test.code,
      name_en: test.name_en || "",
      name_te: test.name_te || "",
      default_fasting: Boolean(test.default_fasting),
      is_active: test.is_active !== false,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveTest(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        category_id: Number(form.category_id),
      };
      if (editingId) {
        await api.patch(`/diagnostics/admin/tests/${editingId}`, payload);
        setMessage(t("diagnostics.testUpdated"));
      } else {
        await api.post("/diagnostics/admin/tests", payload);
        setMessage(t("diagnostics.testCreated"));
      }
      resetForm();
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mo-page diagnostics-page">
      <div className="mo-hero">
        <p className="mo-hero-eyebrow">{t("diagnostics.adminEyebrow")}</p>
        <h1 className="mo-hero-title">{t("diagnostics.adminTitle")}</h1>
        <p className="mo-hero-text">{t("diagnostics.adminSubtitle")}</p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <div className="mo-card-head">
          <h2>
            <Plus size={18} aria-hidden="true" />{" "}
            {editingId ? t("diagnostics.editTest") : t("diagnostics.addTest")}
          </h2>
          {editingId && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
        <form className="diagnostics-admin-form" onSubmit={saveTest}>
          <label>
            <span>{t("diagnostics.category")}</span>
            <select
              value={form.category_id}
              onChange={(e) => setForm((current) => ({ ...current, category_id: e.target.value }))}
              required
            >
              <option value="">{t("diagnostics.selectCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {language === "te" && category.name_te ? category.name_te : category.name_en}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("diagnostics.testCode")}</span>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
              required
              maxLength={40}
            />
          </label>
          <label>
            <span>{t("diagnostics.nameEn")}</span>
            <input
              type="text"
              value={form.name_en}
              onChange={(e) => setForm((current) => ({ ...current, name_en: e.target.value }))}
              required
              maxLength={200}
            />
          </label>
          <label>
            <span>{t("diagnostics.nameTe")}</span>
            <input
              type="text"
              value={form.name_te}
              onChange={(e) => setForm((current) => ({ ...current, name_te: e.target.value }))}
              maxLength={200}
            />
          </label>
          <label className="diagnostics-check">
            <input
              type="checkbox"
              checked={form.default_fasting}
              onChange={(e) => setForm((current) => ({ ...current, default_fasting: e.target.checked }))}
            />
            <span>{t("diagnostics.defaultFasting")}</span>
          </label>
          <label className="diagnostics-check">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))}
            />
            <span>{t("diagnostics.active")}</span>
          </label>
          <div className="diagnostics-actions">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </section>

      <section className="mo-card">
        <div className="mo-card-head">
          <h2>
            <Microscope size={18} aria-hidden="true" /> {t("diagnostics.testMasterList")}
          </h2>
        </div>
        {loading ? (
          <PageLoader label={t("common.loading")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="diagnostics-admin-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.testCode")}</th>
                  <th>{t("diagnostics.nameEn")}</th>
                  <th>{t("diagnostics.category")}</th>
                  <th>{t("diagnostics.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id}>
                    <td>{test.code}</td>
                    <td>
                      {language === "te" && test.name_te ? test.name_te : test.name_en}
                      {test.default_fasting && (
                        <div><Badge tone="warning">{t("diagnostics.fastingRequired")}</Badge></div>
                      )}
                    </td>
                    <td>{test.category_name}</td>
                    <td>
                      <Badge tone={test.is_active ? "success" : "danger"}>
                        {test.is_active ? t("diagnostics.active") : t("diagnostics.inactive")}
                      </Badge>
                    </td>
                    <td>
                      <Button type="button" variant="secondary" onClick={() => startEdit(test)}>
                        {t("common.edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
