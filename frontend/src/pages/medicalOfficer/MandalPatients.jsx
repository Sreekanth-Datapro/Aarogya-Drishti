import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Stethoscope } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getCaseStateLabel,
  getLabelCodes,
  getLocalizedField,
  getLocalizedMasterName,
  getSexLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import Pager from "./Pager";
import "./MedicalOfficer.css";

const EMPTY_FILTERS = { search: "", village_id: "", status: "", claim: "" };
const CLAIM_TONES = { MINE: "success", OTHER: "warning", NONE: "neutral" };
const CLAIM_KEYS = { MINE: "mo.claimMINE", OTHER: "mo.claimOTHER", NONE: "mo.claimNONE" };

// Patients of my Mandals. Clinical details open only after I claim the patient.
export default function MandalPatients() {
  const { t, tm, language } = useLanguage();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [patients, setPatients] = useState([]);
  const [paging, setPaging] = useState({ page: 1, total: 0, total_pages: 0 });
  const [villages, setVillages] = useState([]);
  const [villageError, setVillageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadVillages = async () => {
      try {
        const response = await api.get("/medical-officer/patients/villages");
        if (active) setVillages(response.data.villages || []);
      } catch (requestError) {
        if (active) setVillageError(apiMessage(requestError, "mo.villagesFailed"));
      }
    };
    loadVillages();
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: 20 };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const response = await api.get("/medical-officer/patients", { params });
      setPatients(response.data.patients || []);
      setPaging(response.data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  };

  const claim = async (patient) => {
    if (!window.confirm(t("mo.confirmClaim", { code: patient.patient_code }))) return;
    setBusyId(patient.id);
    setError("");
    setMessage("");
    try {
      await api.post(`/medical-officer/patients/${patient.id}/claim`);
      setMessage(t("medicalOfficerWorkflow.claimed", { name: patient.patient_code }));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "medicalOfficerWorkflow.actionFailed"));
    } finally {
      setBusyId("");
    }
  };

  const number = (value) => formatLocalizedNumber(value ?? 0, language);

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moMandalPatients.title")}</h1>
          <p className="page-subtitle">{t("mo.patientsSubtitle")}</p>
        </div>
      </div>

      <Alert type="info">{t("mo.patientsPrivacy")}</Alert>
      {villageError && <Alert type="error">{tm(villageError)}</Alert>}
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card mo-filters">
        <label>{t("mo.patientCode")}
          <input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder={t("mo.searchCode")} />
        </label>
        <label>{t("mo.village")}
          <select value={filters.village_id} onChange={(event) => update("village_id", event.target.value)}>
            <option value="">{t("mo.allVillages")}</option>
            {villages.map((village) => (
              <option key={village.id} value={village.id}>
                {getLocalizedMasterName(village, language)} ({getLocalizedField(village, "mandal_name", language)})
              </option>
            ))}
          </select>
        </label>
        <label>{t("mo.caseState")}
          <select value={filters.status} onChange={(event) => update("status", event.target.value)}>
            <option value="">{t("mo.allStates")}</option>
            <option value="NOT_SCREENED">{t("mo.notScreened")}</option>
            {getLabelCodes("caseStates").map((code) => <option key={code} value={code}>{getCaseStateLabel(code, language)}</option>)}
          </select>
        </label>
        <label>{t("mo.claimStatus")}
          <select value={filters.claim} onChange={(event) => update("claim", event.target.value)}>
            <option value="">{t("mo.allClaims")}</option>
            <option value="none">{t("mo.claimNONE")}</option>
            <option value="mine">{t("mo.claimMINE")}</option>
            <option value="others">{t("mo.claimOTHER")}</option>
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>{t("mo.clearFilters")}</Button>
      </section>

      <section className="mo-card">
        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("mo.patient")}</th>
                  <th>{t("mo.ageSex")}</th>
                  <th>{t("mo.location")}</th>
                  <th>{t("mo.registeredOn")}</th>
                  <th>{t("mo.caseState")}</th>
                  <th>{t("mo.claimStatus")}</th>
                  <th>{t("mo.action")}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td data-label={t("mo.patient")}>
                      <span className="mono">{patient.patient_code}</span>
                      {!patient.screening_consent_active
                        ? <small className="mo-secondary"><Lock size={12} /> {t("mo.consentUnavailable")}</small>
                        : patient.full_name
                          ? <small className="mo-secondary">{patient.full_name}</small>
                          : <small className="mo-secondary"><Lock size={12} /> {t("mo.nameHidden")}</small>}
                    </td>
                    <td data-label={t("mo.ageSex")}>
                      {patient.screening_consent_active
                        ? `${patient.age_years == null ? "-" : number(patient.age_years)} · ${patient.sex ? getSexLabel(patient.sex, language) : "-"}`
                        : "-"}
                    </td>
                    <td data-label={t("mo.location")}>
                      {getLocalizedField(patient, "village_name", language)}
                      <small className="mo-secondary">{getLocalizedField(patient, "mandal_name", language)} · {getLocalizedField(patient, "facility_name", language)}</small>
                    </td>
                    <td data-label={t("mo.registeredOn")}>{formatLocalizedDate(patient.registered_at, language)}</td>
                    <td data-label={t("mo.caseState")}>
                      {!patient.screening_consent_active
                        ? t("mo.consentUnavailable")
                        : patient.case_state
                          ? getCaseStateLabel(patient.case_state, language)
                          : t("mo.notScreened")}
                    </td>
                    <td data-label={t("mo.claimStatus")}><Badge tone={CLAIM_TONES[patient.claim_status]}>{t(CLAIM_KEYS[patient.claim_status])}</Badge></td>
                    <td data-label={t("mo.action")}>
                      {patient.claim_status === "MINE" && (
                        <Link className="btn btn-primary btn-sm" to={`/medical-officer/review?patient=${patient.id}`}><Stethoscope size={14} /> {t("mo.openReview")}</Link>
                      )}
                      {patient.claim_status === "NONE" && patient.case_state === "AWAITING_CLINICIAN" && (
                        <Button type="button" size="sm" loading={busyId === patient.id} disabled={Boolean(busyId)} onClick={() => claim(patient)}>
                          {t("medicalOfficerWorkflow.claim")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!patients.length && <tr><td colSpan="7" className="mo-empty">{t("mo.noPatients")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pager paging={paging} onPage={setPage} disabled={loading} />
      </section>
    </div>
  );
}
