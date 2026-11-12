import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { Alert, PageLoader } from "../../components/ui";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDateTime,
  getDesignationLabel,
  getLocalizedMasterName,
  getRegistrationStatusLabel,
} from "../../i18n/displayLabels";
import { getPatientDisplayName } from "../../utils/patientName";
import "./AdminPages.css";

export default function RegistrationMonitoring() {
  const { language, t, tm } = useLanguage();
  const [status, setStatus] = useState("ALL");
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/dashboard/registrations", { params: { status } });
      setRegistrations(response.data.registrations || []);
    } catch {
      setError("registrationMonitoring.loadError");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const tone = (value) => value === "APPROVED" ? "success" : value === "REJECTED" ? "danger" : "warning";

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{t("registrationMonitoring.title")}</h1>
          <p className="admin-page-subtitle">{t("registrationMonitoring.subtitle")}</p>
        </div>
        <label>{t("registrationMonitoring.show")}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">{getRegistrationStatusLabel("ALL", language)}</option>
            <option value="PENDING">{getRegistrationStatusLabel("PENDING", language)}</option>
            <option value="APPROVED">{getRegistrationStatusLabel("APPROVED", language)}</option>
            <option value="REJECTED">{getRegistrationStatusLabel("REJECTED", language)}</option>
          </select>
        </label>
      </div>
      {error && <Alert type="error">{tm(error)}</Alert>}
      <section className="admin-panel">
        {loading ? <PageLoader label={t("registrationMonitoring.loading")} /> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>{t("registrationMonitoring.name")}</th><th>{t("registrationMonitoring.username")}</th><th>{t("registrationMonitoring.designation")}</th><th>{t("registrationMonitoring.facility")}</th><th>{t("registrationMonitoring.mandal")}</th><th>{t("registrationMonitoring.status")}</th><th>{t("registrationMonitoring.submitted")}</th></tr></thead>
              <tbody>
                {registrations.map((item) => {
                  const facility = item.facility && typeof item.facility === "object"
                    ? item.facility
                    : { name_en: item.facility_name, name_te: item.facility_name_te };
                  const mandal = item.mandal && typeof item.mandal === "object"
                    ? item.mandal
                    : { name_en: item.mandal_name, name_te: item.mandal_name_te };

                  return (
                    <tr key={item.id}>
                      <td>{getPatientDisplayName({ name: item.full_name, language, patientId: item.id })}</td>
                      <td>{item.username}</td>
                      <td>{getDesignationLabel(item.designation, language)}</td>
                      <td>{getLocalizedMasterName(facility, language) || "-"}</td>
                      <td>{getLocalizedMasterName(mandal, language) || "-"}</td>
                      <td><span className={`status-badge ${tone(item.status)}`}>{getRegistrationStatusLabel(item.status, language)}</span></td>
                      <td>{formatLocalizedDateTime(item.created_at, language) || "-"}</td>
                    </tr>
                  );
                })}
                {!registrations.length && <tr><td colSpan="7" className="empty-state-box">{t("registrationMonitoring.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
