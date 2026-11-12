import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AtSign, Hash, Hospital, MapPin, Phone, User } from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { getLocalizedMasterName, getMasterSearchText } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Card, SearchableSelect, SelectField, Spinner, TextField } from "../../components/ui";
import useLocationLists from "../../components/facilities/useLocationLists";
import { FACILITY_TYPES, editableTypes } from "../../components/facilities/facilityTypes";

const EMPTY_FORM = {
  name_en: "",
  name_te: "",
  code: "",
  category: "",
  district_id: "",
  mandal_id: "",
  village_id: "",
  address: "",
  pin_code: "",
  contact_phone: "",
  email: "",
  incharge_name: "",
  is_active: "true",
};

// Same rules as the server, so mistakes are shown before saving.
// The errors are translation keys, shown with tm() in the current language.
function validate(form) {
  const errors = {};
  const required = "facilities.required";

  if (form.name_en.trim().length < 2) errors.name_en = required;
  if (!form.category) errors.category = required;
  if (!form.district_id) errors.district_id = required;
  if (!form.mandal_id) errors.mandal_id = required;
  if (!form.village_id) errors.village_id = required;
  if (form.code && !/^[A-Za-z0-9][A-Za-z0-9_\-/]{1,39}$/.test(form.code.trim())) errors.code = "facilities.invalidCode";
  if (form.pin_code && !/^[1-9][0-9]{5}$/.test(form.pin_code)) errors.pin_code = "facilities.invalidPin";
  if (form.contact_phone && !/^[0-9]{10,11}$/.test(form.contact_phone)) errors.contact_phone = "facilities.invalidPhone";
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "facilities.invalidEmail";

  return errors;
}

// Numbered card for each part of the form (same look as the registration page)
function FormSection({ number, title, text, children }) {
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="form-section-number" aria-hidden="true">{number}</span>
        <div>
          <h2 className="form-section-title">{title}</h2>
          <p className="form-section-text">{text}</p>
        </div>
      </div>
      <div className="form-grid">{children}</div>
    </section>
  );
}

export default function FacilityForm() {
  const { id } = useParams();            // present when editing
  const isEdit = Boolean(id);
  const { t, tm, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [originalCategory, setOriginalCategory] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const { districts, mandals, villages } = useLocationLists(form.district_id, form.mandal_id);

  useEffect(() => {
    if (!isEdit && user?.role === "DISTRICT_ADMIN" && districts.length === 1 && !form.district_id) {
      setForm((previous) => ({
        ...previous,
        district_id: String(districts[0].id),
      }));
    }
  }, [districts, form.district_id, isEdit, user?.role]);

  // Editing: load the facility into the form
  useEffect(() => {
    if (!isEdit) return;
    api.get(`/facilities/${id}`)
      .then(({ data }) => {
        const f = data.facility;
        setOriginalCategory(f.category);
        setForm({
          name_en: f.name_en || "",
          name_te: f.name_te || "",
          code: f.code || "",
          category: f.category,
          district_id: String(f.district_id),
          mandal_id: f.mandal_id ? String(f.mandal_id) : "",
          village_id: f.village_id ? String(f.village_id) : "",
          address: f.address || "",
          pin_code: f.pin_code || "",
          contact_phone: f.contact_phone || "",
          email: f.email || "",
          incharge_name: f.incharge_name || "",
          is_active: String(f.is_active),
        });
      })
      .catch((err) => setError(apiMessage(err, "facilities.notFound")))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // A new district clears mandal and village; a new mandal clears the village
  const setField = (name, value) => {
    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "district_id" ? { mandal_id: "", village_id: "" } : {}),
      ...(name === "mandal_id" ? { village_id: "" } : {}),
    }));
    if (errors[name]) setErrors((previous) => ({ ...previous, [name]: undefined }));
  };

  const onInput = (e) => setField(e.target.name, e.target.value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setError("facilities.fixErrors");
      return;
    }

    const payload = {
      ...form,
      district_id: Number(form.district_id),
      mandal_id: Number(form.mandal_id),
      village_id: Number(form.village_id),
      is_active: form.is_active === "true",
    };
    if (isEdit) delete payload.is_active;   // status is changed with Activate / Deactivate
    if (isEdit && user?.role === "DISTRICT_ADMIN") delete payload.district_id;

    setSaving(true);
    try {
      const { data } = isEdit
        ? await api.put(`/facilities/${id}`, payload)
        : await api.post("/facilities", payload);

      navigate(`/admin/facilities/${data.facility.id}`, {
        state: { message: isEdit ? "facilities.updated" : "facilities.created" },
      });
    } catch (err) {
      const res = err.response?.data;
      if (res?.code === "DUPLICATE_CODE") setErrors((previous) => ({ ...previous, code: res.message }));
      setError(apiMessage(err, "facilities.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <p className="loading-line" aria-busy="true"><Spinner /> {t("common.loading")}</p>
      </Card>
    );
  }

  const typeOptions = isEdit ? editableTypes(originalCategory) : FACILITY_TYPES;
  const toOption = (item) => ({
    value: String(item.id),
    label: getLocalizedMasterName(item, language),
    searchText: getMasterSearchText(item),
  });
  const mandalOptions = mandals.map(toOption);
  const villageOptions = villages.map(toOption);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEdit ? t("facilities.editTitle") : t("facilities.newTitle")}</h1>
          <p className="page-subtitle">{t("facilities.subtitle")}</p>
        </div>
        <Link className="btn btn-secondary" to={isEdit ? `/admin/facilities/${id}` : "/admin/facilities"}>
          {t("facilities.cancel")}
        </Link>
      </div>

      <form className="auth-form auth-form-compact" onSubmit={handleSubmit} noValidate>
        <FormSection number="1" title={t("facilities.basic")} text={t("facilities.basicText")}>
          <TextField id="fac-name" name="name_en" label={t("facilities.name")} icon={Hospital} value={form.name_en} onChange={onInput} error={tm(errors.name_en)} required />
          <TextField id="fac-name-te" name="name_te" label={t("facilities.nameTe")} optionalText={t("common.optional")} value={form.name_te} onChange={onInput} />
          <SelectField
            id="fac-type"
            name="category"
            label={t("facilities.type")}
            value={form.category}
            onChange={onInput}
            error={tm(errors.category)}
            hint={isEdit ? t("facilities.typeLocked") : undefined}
            disabled={isEdit && typeOptions.length === 1}
            required
          >
            <option value="">{t("facilities.selectType")}</option>
            {typeOptions.map((type) => <option key={type} value={type}>{t(`facilities.types.${type}`)}</option>)}
          </SelectField>
          <TextField id="fac-code" name="code" label={t("facilities.code")} optionalText={t("common.optional")} icon={Hash} value={form.code} onChange={onInput} hint={t("facilities.codeHint")} error={tm(errors.code)} />
          {!isEdit && (
            <SelectField id="fac-status" name="is_active" label={t("facilities.status")} value={form.is_active} onChange={onInput}>
              <option value="true">{t("facilities.statusActive")}</option>
              <option value="false">{t("facilities.statusInactive")}</option>
            </SelectField>
          )}
        </FormSection>

        <FormSection number="2" title={t("facilities.location")} text={t("facilities.locationText")}>
          {user?.role !== "DISTRICT_ADMIN" && (
            <SelectField id="fac-district" label={t("facilities.district")} value={form.district_id} onChange={(e) => setField("district_id", e.target.value)} error={tm(errors.district_id)} required>
              <option value="">{t("facilities.selectDistrict")}</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{getLocalizedMasterName(d, language)}</option>)}
            </SelectField>
          )}
          <SearchableSelect
            id="fac-mandal"
            label={t("facilities.mandal")}
            value={form.mandal_id}
            onChange={(value) => setField("mandal_id", value)}
            options={mandalOptions}
            placeholder={form.district_id ? t("facilities.searchMandal") : t("facilities.selectDistrictFirst")}
            noMatchesText={t("common.noMatches")}
            moreText={t("common.keepTyping")}
            disabled={!form.district_id}
            error={tm(errors.mandal_id)}
            required
          />
          <SearchableSelect
            id="fac-village"
            label={t("facilities.village")}
            value={form.village_id}
            onChange={(value) => setField("village_id", value)}
            options={villageOptions}
            placeholder={form.mandal_id ? t("facilities.searchVillage") : t("facilities.selectMandalFirst")}
            noMatchesText={t("common.noMatches")}
            moreText={t("common.keepTyping")}
            disabled={!form.mandal_id}
            error={tm(errors.village_id)}
            required
          />
          <TextField id="fac-address" name="address" label={t("facilities.address")} optionalText={t("common.optional")} icon={MapPin} value={form.address} onChange={onInput} />
          <TextField
            id="fac-pin"
            name="pin_code"
            label={t("facilities.pin")}
            optionalText={t("common.optional")}
            inputMode="numeric"
            maxLength={6}
            value={form.pin_code}
            onChange={(e) => setField("pin_code", e.target.value.replace(/\D/g, ""))}
            error={tm(errors.pin_code)}
          />
        </FormSection>

        <FormSection number="3" title={t("facilities.contact")} text={t("facilities.contactText")}>
          <TextField
            id="fac-phone"
            name="contact_phone"
            type="tel"
            label={t("facilities.phone")}
            optionalText={t("common.optional")}
            icon={Phone}
            inputMode="numeric"
            maxLength={11}
            value={form.contact_phone}
            onChange={(e) => setField("contact_phone", e.target.value.replace(/\D/g, ""))}
            error={tm(errors.contact_phone)}
          />
          <TextField id="fac-email" name="email" type="email" label={t("facilities.email")} optionalText={t("common.optional")} icon={AtSign} value={form.email} onChange={onInput} error={tm(errors.email)} />
          <TextField id="fac-incharge" name="incharge_name" label={t("facilities.incharge")} optionalText={t("common.optional")} icon={User} value={form.incharge_name} onChange={onInput} />
        </FormSection>

        {error && <Alert type="error">{tm(error)}</Alert>}

        <div className="toolbar-actions">
          <Button type="submit" loading={saving}>{saving ? t("facilities.saving") : t("facilities.save")}</Button>
          <Link className="btn btn-ghost" to={isEdit ? `/admin/facilities/${id}` : "/admin/facilities"}>{t("facilities.cancel")}</Link>
        </div>
      </form>
    </>
  );
}
