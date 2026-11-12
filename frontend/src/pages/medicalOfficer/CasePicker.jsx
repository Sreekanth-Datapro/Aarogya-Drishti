import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { getLocalizedField } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, EmptyState } from "../../components/ui";

// Lets the MO choose one of the patients they have claimed.
// The chosen patient id is kept in the address (?patient=...) so pages can link to each other.
// purpose="referral" asks the backend for only patients eligible for a new specialist referral.
export default function CasePicker({ onChange, onLoaded, purpose = "", reloadToken = 0 }) {
  const { t, tm, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = searchParams.get("patient") || "";

  const loadCases = useCallback(() => {
    setLoading(true);
    setError("");
    const params = { view: "mine" };
    if (purpose) params.purpose = purpose;
    return api.get("/medical-officer/cases", { params })
      .then((response) => setCases(response.data.cases || []))
      .catch((requestError) => setError(apiMessage(requestError, "mo.loadFailed")))
      .finally(() => setLoading(false));
  }, [purpose]);

  useEffect(() => {
    loadCases();
  }, [loadCases, reloadToken]);

  useEffect(() => {
    if (!loading) onChange(cases.some((item) => item.id === selected) ? selected : "");
  }, [selected, cases, loading, onChange]);

  useEffect(() => {
    if (!loading && onLoaded) onLoaded(cases.length);
  }, [loading, cases.length, onLoaded]);

  if (loading) return <p className="mo-muted">{t("common.loading")}</p>;
  if (error) return <Alert type="error">{tm(error)}</Alert>;
  if (!cases.length) {
    return (
      <EmptyState
        title={purpose === "referral" ? t("mo.noReferralEligibleCases") : t("mo.noClaimedCases")}
        text={purpose === "referral" ? t("mo.noReferralEligibleCasesText") : t("mo.noClaimedCasesText")}
        action={<Link className="btn btn-primary btn-sm" to="/medical-officer/queue">{t("mo.openQueue")}</Link>}
      />
    );
  }

  return (
    <label className="mo-case-picker">
      <span>{purpose === "referral" ? t("mo.selectReferralCase") : t("mo.selectCase")}</span>
      <select value={selected} onChange={(event) => setSearchParams(event.target.value ? { patient: event.target.value } : {})}>
        <option value="">{t("mo.chooseCase")}</option>
        {cases.map((item) => (
          <option key={item.id} value={item.id}>
            {item.patient_code} · {getLocalizedField(item, "village_name", language)}
          </option>
        ))}
      </select>
    </label>
  );
}
