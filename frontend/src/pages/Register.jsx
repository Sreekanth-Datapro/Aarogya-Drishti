import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AtSign, CircleCheck, IdCard, Lock, Phone, User } from "lucide-react";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { getDesignationLabel, getLocalizedMasterName, getMasterSearchText } from "../i18n/displayLabels";
import { apiMessage } from "../i18n/translate";
import AuthLayout from "../components/layout/AuthLayout";
import { Alert, Button, Checkbox, SearchableSelect, SelectField, TextField } from "../components/ui";

const initialForm = {
  full_name: "",
  username: "",
  password: "",
  phone: "",
  email: "",
  designation: "ASHA",
  employee_ref: "",
  district_id: "",
  facility_id: "",
  mandal_id: "",
  village_id: "",
  language_id: "",
  terms_accepted: false,
};

const emptyOptions = {
  districts: [],
  facilities: [],
  mandals: [],
  villages: [],
  languages: [],
};

const DESIGNATIONS = ["ASHA", "ANM", "CHO", "OTHER"];

// Same rules the server checks, so mistakes are shown before submitting.
// Returns an object like { phone: "register.invalidPhone" } (translation keys). Empty object = valid.
function validate(form) {
  const errors = {};
  const required = "common.required";

  if (!form.full_name.trim()) errors.full_name = required;

  if (!/^\d{10}$/.test(form.phone)) errors.phone = "register.invalidPhone";

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "register.invalidEmail";
  }

  if (!form.district_id) errors.district_id = required;
  if (!form.facility_id) errors.facility_id = required;
  if (!form.mandal_id) errors.mandal_id = required;
  if (!form.village_id) errors.village_id = required;
  if (!form.language_id) errors.language_id = required;

  if (!/^[a-z0-9_.-]{3,40}$/i.test(form.username.trim())) {
    errors.username = "register.invalidUsername";
  }

  const password = form.password;
  const passwordOk = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  if (!passwordOk) errors.password = "register.invalidPassword";

  if (!form.terms_accepted) errors.terms_accepted = "register.acceptTerms";

  return errors;
}

// Numbered heading for each part of the form
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

export default function Register() {
  const { t, tm, language } = useLanguage();

  const [form, setForm] = useState(initialForm);
  const [options, setOptions] = useState(emptyOptions);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [statusToken, setStatusToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/masters/registration-options")
      .then((response) => setOptions(response.data))
      .catch(() => setError("register.loadFailed"));
  }, []);

  const mandalsForDistrict = options.mandals.filter(
    (mandal) => String(mandal.district_id) === String(form.district_id)
  );
  const facilitiesForLocation = options.facilities
    .filter((facility) => String(facility.district_id) === String(form.district_id))
    .filter((facility) => form.mandal_id && String(facility.mandal_id) === String(form.mandal_id));
  const villagesForMandal = options.villages.filter(
    (village) => String(village.mandal_id) === String(form.mandal_id)
  );

  const setField = (name, value) => {
    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "district_id" ? { mandal_id: "", village_id: "", facility_id: "" } : {}),
      ...(name === "mandal_id" ? { village_id: "", facility_id: "" } : {}),
    }));

    // Hide the error of a field as soon as the user edits it
    if (errors[name]) {
      setErrors((previous) => ({ ...previous, [name]: undefined }));
    }
  };

  const updateField = (e) => {
    const { name, value, type, checked } = e.target;
    setField(name, type === "checkbox" ? checked : value);
  };

  // Options for the searchable mandal / village lists: the name in the chosen
  // language, but typing the English or the Telugu name both find it
  const mandalOptions = mandalsForDistrict.map((m) => ({
    value: String(m.id),
    label: getLocalizedMasterName(m, language),
    searchText: getMasterSearchText(m),
  }));

  // Some different villages share a name (e.g. two "Boddagondi"); show the LGD code to tell them apart
  const nameCount = {};
  villagesForMandal.forEach((v) => { nameCount[v.name_en] = (nameCount[v.name_en] || 0) + 1; });
  const villageOptions = villagesForMandal.map((v) => {
    const name = getLocalizedMasterName(v, language);
    return {
      value: String(v.id),
      label: nameCount[v.name_en] > 1 && v.lgd_code ? `${name} (LGD ${v.lgd_code})` : name,
      searchText: getMasterSearchText(v),
    };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const foundErrors = validate(form);
    setErrors(foundErrors);
    if (Object.keys(foundErrors).length > 0) {
      setError("register.fixErrors");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        district_id: Number(form.district_id),
        facility_id: Number(form.facility_id),
        mandal_id: Number(form.mandal_id),
        village_id: Number(form.village_id),
        language_id: Number(form.language_id),
      };

      const response = await api.post("/auth/register", payload);

      setMessage(response.data.message);
      setStatusToken(response.data.status_token || "");
      setForm(initialForm);
    } catch (err) {
      setError(apiMessage(err, "register.failed"));
    } finally {
      setLoading(false);
    }
  };

  // After a successful submission, show a confirmation instead of the form
  if (message) {
    return (
      <AuthLayout wide scrollable>
        <div className="success-panel" role="status">
          <span className="success-icon" aria-hidden="true">
            <CircleCheck size={32} />
          </span>
          <h1 className="auth-title">{t("register.successTitle")}</h1>
          <p className="auth-subtitle">{tm(message)}</p>
          <p className="text-muted text-sm">
            {statusToken
              ? t("registrationWorkflow.saveStatusToken")
              : t("registrationWorkflow.legacyTrackingUnavailable")}
          </p>
          {statusToken && (
            <>
              <div className="registration-status-token">
                <strong>{t("registrationWorkflow.statusToken")}: </strong>
                <code>{statusToken}</code>
              </div>
              <Link
                className="btn btn-secondary"
                to="/registration-status"
                state={{ statusToken }}
              >
                {t("registrationWorkflow.checkProgress")}
              </Link>
            </>
          )}

          <div className="form-actions">
            <Button variant="secondary" onClick={() => {
              setMessage("");
              setStatusToken("");
            }}>
              {t("register.another")}
            </Button>
            <Link className="btn btn-primary" to="/login">{t("register.signIn")}</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout wide scrollable>
      <h1 className="auth-title">{t("register.title")}</h1>
      <p className="auth-subtitle">{t("register.subtitle")}</p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormSection number="1" title={t("register.personal")} text={t("register.personalText")}>
          <TextField
            id="reg-full-name"
            name="full_name"
            label={t("register.fullName")}
            icon={User}
            value={form.full_name}
            onChange={updateField}
            error={tm(errors.full_name)}
            autoComplete="name"
            required
          />

          <TextField
            id="reg-phone"
            name="phone"
            type="tel"
            label={t("register.phone")}
            icon={Phone}
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            onChange={updateField}
            hint={t("register.phoneHint")}
            error={tm(errors.phone)}
            autoComplete="tel"
            required
          />

          <TextField
            id="reg-email"
            name="email"
            type="email"
            label={t("register.email")}
            optionalText={t("common.optional")}
            icon={AtSign}
            value={form.email}
            onChange={updateField}
            error={tm(errors.email)}
            autoComplete="email"
          />

          <SelectField
            id="reg-designation"
            name="designation"
            label={t("register.designation")}
            value={form.designation}
            onChange={updateField}
            required
          >
            {DESIGNATIONS.map((item) => (
              <option key={item} value={item}>{getDesignationLabel(item, language)}</option>
            ))}
          </SelectField>

          <TextField
            id="reg-employee-ref"
            name="employee_ref"
            label={t("register.employeeRef")}
            optionalText={t("common.optional")}
            icon={IdCard}
            value={form.employee_ref}
            onChange={updateField}
          />
        </FormSection>

        <FormSection number="2" title={t("register.work")} text={t("register.workText")}>
          <SelectField
            id="reg-district"
            name="district_id"
            label={t("register.district")}
            value={form.district_id}
            onChange={updateField}
            error={tm(errors.district_id)}
            required
          >
            <option value="">{t("register.selectDistrict")}</option>
            {options.districts.map((district) => (
              <option key={district.id} value={district.id}>{getLocalizedMasterName(district, language)}</option>
            ))}
          </SelectField>

          <SearchableSelect
            id="reg-mandal"
            label={t("register.mandal")}
            value={form.mandal_id}
            onChange={(value) => setField("mandal_id", value)}
            options={mandalOptions}
            placeholder={form.district_id ? t("register.searchMandal") : t("register.selectDistrictFirst")}
            noMatchesText={t("common.noMatches")}
            moreText={t("common.keepTyping")}
            disabled={!form.district_id}
            error={tm(errors.mandal_id)}
            required
          />

          <SelectField
            id="reg-facility"
            name="facility_id"
            label={t("register.facility")}
            value={form.facility_id}
            onChange={updateField}
            disabled={!form.district_id || !form.mandal_id}
            error={tm(errors.facility_id)}
            required
          >
            <option value="">
              {form.mandal_id ? t("register.selectFacility") : t("register.selectMandalFirst")}
            </option>
            {facilitiesForLocation.map((facility) => (
              <option key={facility.id} value={facility.id}>{getLocalizedMasterName(facility, language)}</option>
            ))}
          </SelectField>

          <SearchableSelect
            id="reg-village"
            label={t("register.village")}
            value={form.village_id}
            onChange={(value) => setField("village_id", value)}
            options={villageOptions}
            placeholder={form.mandal_id ? t("register.searchVillage") : t("register.selectMandalFirst")}
            noMatchesText={t("common.noMatches")}
            moreText={t("common.keepTyping")}
            disabled={!form.mandal_id}
            hint={
              form.mandal_id
                ? villageOptions.length
                  ? `${villageOptions.length} ${t("register.villagesAvailable")}`
                  : t("register.noVillages")
                : undefined
            }
            error={tm(errors.village_id)}
            required
          />

          <SelectField
            id="reg-language"
            name="language_id"
            label={t("register.language")}
            value={form.language_id}
            onChange={updateField}
            error={tm(errors.language_id)}
            required
          >
            <option value="">{t("register.selectLanguage")}</option>
            {options.languages.map((item) => (
              <option key={item.id} value={item.id}>{item.native_name}</option>
            ))}
          </SelectField>
        </FormSection>

        <FormSection number="3" title={t("register.account")} text={t("register.accountText")}>
          <TextField
            id="reg-username"
            name="username"
            label={t("register.username")}
            icon={User}
            value={form.username}
            onChange={updateField}
            maxLength={40}
            hint={t("register.usernameHint")}
            error={tm(errors.username)}
            autoComplete="username"
            required
          />

          <TextField
            id="reg-password"
            name="password"
            type="password"
            label={t("register.password")}
            icon={Lock}
            value={form.password}
            onChange={updateField}
            hint={t("register.passwordHint")}
            error={tm(errors.password)}
            autoComplete="new-password"
            required
          />
        </FormSection>

        <Checkbox
          id="reg-terms"
          name="terms_accepted"
          label={t("register.terms")}
          checked={form.terms_accepted}
          onChange={updateField}
          error={tm(errors.terms_accepted)}
        />

        {error && <Alert type="error">{tm(error)}</Alert>}

        <Button type="submit" block loading={loading}>
          {loading ? t("register.submitting") : t("register.submit")}
        </Button>
      </form>

      <p className="auth-footer">
        {t("register.already")} <Link to="/login">{t("register.signIn")}</Link>
      </p>
    </AuthLayout>
  );
}
