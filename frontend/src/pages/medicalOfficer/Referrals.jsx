import React, { useCallback, useEffect, useState } from "react";
import { History, Send } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime, getCodeLabel, getLabelCodes, getLocalizedField, getLocalizedMasterName } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Modal, PageLoader } from "../../components/ui";
import CasePicker from "./CasePicker";
import Pager from "./Pager";
import "./MedicalOfficer.css";

const EMPTY_FORM = { hospital_facility_id: "", specialty_id: "", priority_id: "", mode: "HOSPITAL_VISIT", specialist_id: "", navigator_id: "", reason: "" };
const STATUS_TONES = { PLANNED: "info", SENT: "info", ACCEPTED: "warning", COMPLETED: "success", DECLINED: "danger", CANCELLED: "neutral" };

export default function Referrals() {
  const { t, tm, language } = useLanguage();
  const [patientId, setPatientId] = useState("");
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pickerReload, setPickerReload] = useState(0);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/medical-officer/referrals", { params: { status: status || undefined, page } });
      setList(response.data.referrals || []);
      setPaging(response.data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setOptions(null);
    setForm(EMPTY_FORM);
    if (!patientId) return;
    api.get(`/medical-officer/patients/${patientId}/referral-options`)
      .then((response) => {
        setOptions(response.data.options);
        const urgent = response.data.options.review?.decision === "URGENT_REFERRAL";
        const urgentPriority = urgent
          ? response.data.options.priorities.find((item) => item.code === "URGENT")
          : null;
        setForm({
          ...EMPTY_FORM,
          reason: response.data.options.review?.referral_reason || "",
          priority_id: urgentPriority ? String(urgentPriority.id) : "",
        });
      })
      .catch((requestError) => setError(apiMessage(requestError, "mo.loadFailed")));
  }, [patientId]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!window.confirm(t("mo.confirmReferral"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = { ...form };
      Object.keys(body).forEach((key) => { if (body[key] === "") body[key] = null; });
      const response = await api.post(`/medical-officer/patients/${patientId}/referrals`, body);
      setMessage(t("mo.referralCreated", { code: response.data.referral.referral_code }));
      setOptions((current) => ({ ...current, eligible: false }));
      setPatientId("");
      setPickerReload((token) => token + 1);
      await loadList();
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (referral) => {
    try {
      const response = await api.get(`/medical-officer/referrals/${referral.id}/history`);
      setHistory({
        referral,
        items: response.data.history || [],
        specialistDecision: response.data.specialist_decision || null,
        decisionStorageUnavailable: response.data.decision_storage_unavailable === true,
      });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    }
  };

  const specialists = options?.specialists.filter((item) => String(item.facility_id) === String(form.hospital_facility_id)) || [];

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moReferrals.title")}</h1>
          <p className="page-subtitle">{t("mo.referralsSubtitle")}</p>
        </div>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <h2 className="mo-card-title"><Send size={16} /> {t("mo.newReferral")}</h2>
        <CasePicker purpose="referral" onChange={setPatientId} reloadToken={pickerReload} />
        {options && !options.eligible && <Alert type="warning">{t("mo.referralNotEligible")}</Alert>}
        {options?.eligible && (
          <form className="mo-form" onSubmit={submit}>
            {options.review?.decision === "URGENT_REFERRAL" && (
              <div className="mo-span-2">
                <Alert type="error">{t("specialist.emergencyWarning")}</Alert>
                <Alert type="info">{t("mo.emergencyNavigatorOptional")}</Alert>
              </div>
            )}
            <label>{t("mo.hospital")} *
              <select required value={form.hospital_facility_id} onChange={(event) => { update("hospital_facility_id", event.target.value); update("specialist_id", ""); }}>
                <option value="">{t("mo.choose")}</option>
                {options.hospitals.map((item) => <option key={item.id} value={item.id}>{getLocalizedMasterName(item, language)}</option>)}
              </select>
            </label>
            <label>{t("mo.specialty")} *
              <select required value={form.specialty_id} onChange={(event) => update("specialty_id", event.target.value)}>
                <option value="">{t("mo.choose")}</option>
                {options.specialties.map((item) => <option key={item.id} value={item.id}>{getLocalizedMasterName(item, language)}</option>)}
              </select>
            </label>
            <label>{t("mo.priority")} *
              <select required value={form.priority_id} onChange={(event) => update("priority_id", event.target.value)}>
                <option value="">{t("mo.choose")}</option>
                {options.priorities.map((item) => <option key={item.id} value={item.id}>{getLocalizedMasterName(item, language)}</option>)}
              </select>
            </label>
            <label>{t("mo.mode")}
              <select value={form.mode} onChange={(event) => update("mode", event.target.value)}>
                {options.modes.map((code) => <option key={code} value={code}>{getCodeLabel("referralModes", code, language)}</option>)}
              </select>
            </label>
            <label>{t("mo.specialist")}
              <select value={form.specialist_id} onChange={(event) => update("specialist_id", event.target.value)} disabled={!form.hospital_facility_id}>
                <option value="">{t("mo.notAssigned")}</option>
                {specialists.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
              </select>
            </label>
            <label>{t("mo.navigator")}
              <select value={form.navigator_id} onChange={(event) => update("navigator_id", event.target.value)}>
                <option value="">{t("mo.notAssigned")}</option>
                {options.navigators.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
              </select>
            </label>
            <label className="mo-span-2">{t("mo.referralReason")} *
              <textarea required rows={3} value={form.reason} onChange={(event) => update("reason", event.target.value)} />
            </label>
            <div className="mo-actions mo-span-2">
              <Button type="submit" loading={saving}><Send size={15} /> {t("mo.createReferral")}</Button>
            </div>
          </form>
        )}
      </section>

      <div className="mo-tabs" role="tablist">
        {["", ...getLabelCodes("referralStatuses")].map((value) => (
          <button key={value || "all"} type="button" role="tab" aria-selected={status === value}
            className={status === value ? "active" : ""} onClick={() => { setStatus(value); setPage(1); }}>
            {value ? getCodeLabel("referralStatuses", value, language) : t("mo.allReferrals")}
          </button>
        ))}
      </div>

      <section className="mo-card">
        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("mo.referral")}</th>
                  <th>{t("mo.hospital")}</th>
                  <th>{t("mo.priority")}</th>
                  <th>{t("mo.assignedTo")}</th>
                  <th>{t("mo.status")}</th>
                  <th>{t("mo.action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id}>
                    <td data-label={t("mo.referral")}>
                      <span className="mono">{item.referral_code}</span>
                      <small className="mo-secondary">{item.patient_code} · {formatLocalizedDateTime(item.created_at, language)}</small>
                    </td>
                    <td data-label={t("mo.hospital")}>
                      {getLocalizedField(item, "hospital_name", language)}
                      <small className="mo-secondary">{getLocalizedField(item, "specialty_name", language)}</small>
                    </td>
                    <td data-label={t("mo.priority")}>{getLocalizedField(item, "priority_name", language)}</td>
                    <td data-label={t("mo.assignedTo")}>
                      {item.specialist_name || t("mo.notAssigned")}
                      <small className="mo-secondary">{item.navigator_name || "-"}</small>
                    </td>
                    <td data-label={t("mo.status")}><Badge tone={STATUS_TONES[item.status]}>{getCodeLabel("referralStatuses", item.status, language)}</Badge></td>
                    <td data-label={t("mo.action")}>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openHistory(item)}><History size={14} /> {t("mo.history")}</Button>
                    </td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="6" className="mo-empty">{t("mo.noReferrals")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pager paging={paging} onPage={setPage} disabled={loading} />
      </section>

      <Modal open={Boolean(history)} title={t("mo.referralHistory")} onClose={() => setHistory(null)}>
        {history && (
          <>
            {history.decisionStorageUnavailable ? (
              <p className="care-muted">{t("mo.decisionStorageUnavailable")}</p>
            ) : history.specialistDecision && (
              <section className="mo-specialist-decision">
                <h3>{t("mo.specialistDecision")}</h3>
                <p><strong>{t("mo.decisionType")}:</strong> {t(`mo.decision.${history.specialistDecision.decision_type}`)}</p>
                <p><strong>{t("mo.decisionReason")}:</strong> {history.specialistDecision.clinical_reason}</p>
                <p><strong>{t("mo.recommendation")}:</strong> {history.specialistDecision.clinical_recommendation || "—"}</p>
                <p><strong>{t("mo.instructions")}:</strong> {history.specialistDecision.instructions || "—"}</p>
                {history.specialistDecision.hospital_name && (
                  <p><strong>{t("mo.hospital")}:</strong> {history.specialistDecision.hospital_name}</p>
                )}
                {history.specialistDecision.investigation_name && (
                  <p><strong>{t("mo.investigationType")}:</strong> {history.specialistDecision.investigation_name}</p>
                )}
                <small>{history.specialistDecision.specialist_name} · {formatLocalizedDateTime(history.specialistDecision.signed_at, language)}</small>
              </section>
            )}
            <ol className="mo-timeline">
              {history.items.map((item, index) => (
                <li key={index}>
                  <strong>{getCodeLabel("referralStatuses", item.to_status, language)}</strong>
                  <small>{formatLocalizedDateTime(item.changed_at, language)} · {item.changed_by_name || "-"}</small>
                </li>
              ))}
            </ol>
          </>
        )}
      </Modal>
    </div>
  );
}
