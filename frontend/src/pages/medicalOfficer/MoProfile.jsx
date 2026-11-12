import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedDateTime, getAccountStatusLabel, getLocalizedField, getLocalizedMasterName, getRoleLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader, TextField } from "../../components/ui";
import "./MedicalOfficer.css";

// My Profile: view my account and assignments, change my phone number.
// The password is changed on the existing secure Change password page.
export default function MoProfile() {
  const { t, tm, language } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/medical-officer/profile")
      .then((response) => {
        setProfile(response.data.profile);
        setPhone(response.data.profile.phone || "");
      })
      .catch((requestError) => setError(apiMessage(requestError, "mo.loadFailed")));
  }, []);

  const savePhone = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.patch("/medical-officer/profile", { phone });
      setProfile(response.data.profile);
      setMessage(t("mo.profileSaved"));
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!profile && !error) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moProfile.title")}</h1>
          <p className="page-subtitle">{t("mo.profileSubtitle")}</p>
        </div>
      </div>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      {profile && (
        <div className="mo-summary-grid">
          <section className="mo-card">
            <h2 className="mo-card-title"><UserRound size={16} /> {t("mo.account")}</h2>
            <dl className="mo-details">
              <dt>{t("mo.name")}</dt><dd>{profile.full_name}</dd>
              <dt>{t("mo.username")}</dt><dd className="mono">{profile.username}</dd>
              <dt>{t("mo.email")}</dt><dd>{profile.email || "-"}</dd>
              <dt>{t("mo.role")}</dt><dd>{getRoleLabel(profile.role_code, language)}</dd>
              <dt>{t("mo.district")}</dt><dd>{getLocalizedField(profile, "district_name", language) || "-"}</dd>
              <dt>{t("mo.status")}</dt><dd><Badge tone="success">{getAccountStatusLabel(profile.status, language)}</Badge></dd>
              <dt>{t("mo.memberSince")}</dt><dd>{formatLocalizedDate(profile.created_at, language)}</dd>
            </dl>
          </section>

          <section className="mo-card">
            <h2 className="mo-card-title"><MapPin size={16} /> {t("mo.assignments")}</h2>
            <h3 className="mo-subtitle">{t("mo.assignedMandals")}</h3>
            <div className="mo-chip-row">
              {profile.mandals.map((mandal) => <span key={mandal.id} className="mo-chip">{getLocalizedMasterName(mandal, language)}</span>)}
              {!profile.mandals.length && <span className="mo-muted">{t("mo.noMandals")}</span>}
            </div>
            <h3 className="mo-subtitle">{t("mo.facilities")}</h3>
            <ul className="mo-list">
              {profile.facilities.map((facility) => (
                <li key={facility.id}>
                  <span>{getLocalizedMasterName(facility, language)}</span>
                  {facility.is_primary && <Badge tone="info">{t("mo.primary")}</Badge>}
                </li>
              ))}
              {!profile.facilities.length && <li className="mo-empty">{t("mo.noFacilities")}</li>}
            </ul>
            <p className="mo-muted">{t("mo.assignmentsManaged")}</p>
          </section>

          <section className="mo-card">
            <h2 className="mo-card-title"><Phone size={16} /> {t("mo.contact")}</h2>
            <form onSubmit={savePhone} className="mo-form-simple">
              <TextField id="mo-phone" label={t("mo.phone")} inputMode="numeric" maxLength={11} value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} hint={t("mo.phoneHint")} />
              <Button type="submit" loading={saving} disabled={phone === (profile.phone || "")}>{t("mo.savePhone")}</Button>
            </form>
          </section>

          <section className="mo-card">
            <h2 className="mo-card-title"><ShieldCheck size={16} /> {t("mo.security")}</h2>
            <dl className="mo-details">
              <dt>{t("dashboard.twoStep")}</dt>
              <dd><Badge tone={profile.mfa_enabled ? "success" : "neutral"}>{profile.mfa_enabled ? t("dashboard.enabled") : t("dashboard.notEnabled")}</Badge></dd>
              <dt>{t("mo.passwordChanged")}</dt><dd>{profile.password_changed_at ? formatLocalizedDateTime(profile.password_changed_at, language) : "-"}</dd>
            </dl>
            <Link className="btn btn-primary" to="/change-password"><KeyRound size={15} /> {t("nav.changePassword")}</Link>
          </section>
        </div>
      )}
    </div>
  );
}
