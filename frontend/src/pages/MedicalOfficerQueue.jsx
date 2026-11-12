import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Clock3, RefreshCw, Stethoscope } from "lucide-react";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getCaseStateLabel,
  getLocalizedField,
} from "../i18n/displayLabels";
import { apiMessage } from "../i18n/translate";
import { Alert, Badge, Button, Card, PageLoader, StatCard } from "../components/ui";
import "./MedicalOfficerQueue.css";

const PAGE_SIZE = 20;

export default function MedicalOfficerQueue() {
  const { t, tm, language } = useLanguage();
  const [availableCases, setAvailableCases] = useState([]);
  const [myCases, setMyCases] = useState([]);
  const [view, setView] = useState("available");
  const [pageByView, setPageByView] = useState({ available: 1, mine: 1 });
  const [pagination, setPagination] = useState({
    available: { total: 0, page: 1, page_size: PAGE_SIZE, total_pages: 0 },
    mine: { total: 0, page: 1, page_size: PAGE_SIZE, total_pages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [busyPatientId, setBusyPatientId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  const loadCases = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setLoading(true);
    setError("");
    try {
      const [availableResponse, mineResponse] = await Promise.all([
        api.get("/medical-officer/cases", { params: { view: "available", page: pageByView.available, limit: PAGE_SIZE } }),
        api.get("/medical-officer/cases", { params: { view: "mine", page: pageByView.mine, limit: PAGE_SIZE } }),
      ]);
      if (currentRequestId !== requestId.current) return;
      setAvailableCases(availableResponse.data.cases || []);
      setMyCases(mineResponse.data.cases || []);
      const availablePaging = availableResponse.data.pagination;
      const minePaging = mineResponse.data.pagination;
      if (availablePaging && minePaging) {
        setPagination({ available: availablePaging, mine: minePaging });
        setPageByView((current) => {
          if (current.available === availablePaging.page && current.mine === minePaging.page) return current;
          return { available: availablePaging.page, mine: minePaging.page };
        });
      } else {
        setPagination({
          available: { total: availableResponse.data.cases?.length || 0, page: 1, page_size: PAGE_SIZE, total_pages: 1 },
          mine: { total: mineResponse.data.cases?.length || 0, page: 1, page_size: PAGE_SIZE, total_pages: 1 },
        });
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) setError(apiMessage(requestError, "medicalOfficerWorkflow.loadFailed"));
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [pageByView]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const performAction = async (patient, action) => {
    setBusyPatientId(patient.id);
    setError("");
    setMessage("");
    try {
      if (action === "claim") {
        await api.post(`/medical-officer/patients/${patient.id}/claim`);
        setMessage(t("medicalOfficerWorkflow.claimed", { name: patient.patient_code }));
      } else {
        await api.post(`/medical-officer/patients/${patient.id}/release`);
        setMessage(t("medicalOfficerWorkflow.released", { name: patient.patient_code }));
      }
      await loadCases();
    } catch (requestError) {
      setError(apiMessage(requestError, "medicalOfficerWorkflow.actionFailed"));
    } finally {
      setBusyPatientId("");
    }
  };

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const cases = view === "available" ? availableCases : myCases;
  const currentPagination = pagination[view];

  const changePage = (page) => {
    setPageByView((current) => ({ ...current, [view]: page }));
  };

  if (loading && !availableCases.length && !myCases.length) {
    return <PageLoader label={t("common.loading")} />;
  }

  return (
    <div className="mo-workflow-page">
      <header className="mo-workflow-hero">
        <div>
          <span className="mo-workflow-eyebrow"><Stethoscope size={15} /> {t("medicalOfficerWorkflow.eyebrow")}</span>
          <h1 className="page-title">{t("modules.moScreeningQueue.title")}</h1>
          <p className="page-subtitle">{t("medicalOfficerWorkflow.subtitle")}</p>
        </div>
        <Button type="button" variant="secondary" icon={RefreshCw} onClick={loadCases} loading={loading}>
          {t("medicalOfficerWorkflow.refresh")}
        </Button>
      </header>

      <Alert type="info">{t("medicalOfficerWorkflow.assignmentNote")}</Alert>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <div className="mo-workflow-stats">
        <StatCard icon={Clock3} tone="amber" label={t("medicalOfficerWorkflow.available")} value={number(pagination.available.total)} />
        <StatCard icon={CheckCircle2} tone="green" label={t("medicalOfficerWorkflow.myCases")} value={number(pagination.mine.total)} />
      </div>

      <Card>
        <div className="mo-workflow-tabs" role="tablist" aria-label={t("medicalOfficerWorkflow.tabs")}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "available"}
            className={view === "available" ? "active" : ""}
            onClick={() => setView("available")}
          >
            <Clock3 size={16} /> {t("medicalOfficerWorkflow.available")}
            <span>{number(pagination.available.total)}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            className={view === "mine" ? "active" : ""}
            onClick={() => setView("mine")}
          >
            <CheckCircle2 size={16} /> {t("medicalOfficerWorkflow.myCases")}
            <span>{number(pagination.mine.total)}</span>
          </button>
        </div>

        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-workflow-table-wrap">
            <table className="mo-workflow-table">
              <thead>
                <tr>
                  <th>{t("medicalOfficerWorkflow.patient")}</th>
                  <th>{t("medicalOfficerWorkflow.location")}</th>
                  <th>{t("medicalOfficerWorkflow.screening")}</th>
                  <th>{t("medicalOfficerWorkflow.status")}</th>
                  <th>{t("medicalOfficerWorkflow.action")}</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((patient) => (
                  <tr key={patient.id}>
                    <td data-label={t("medicalOfficerWorkflow.patient")}>
                      <strong>{patient.patient_code}</strong>
                      {view === "mine" && patient.age_years != null && (
                        <span className="mo-workflow-secondary">
                          {t("medicalOfficerWorkflow.ageValue", { age: number(patient.age_years) })}
                        </span>
                      )}
                    </td>
                    <td data-label={t("medicalOfficerWorkflow.location")}>
                      <strong>{getLocalizedField(patient, "mandal_name", language)}</strong>
                      <span className="mo-workflow-secondary">
                        {getLocalizedField(patient, "village_name", language)} · {getLocalizedField(patient, "facility_name", language)}
                      </span>
                    </td>
                    <td data-label={t("medicalOfficerWorkflow.screening")}>
                      <span>{formatLocalizedDate(patient.screening_date, language)}</span>
                      {view === "mine" && patient.chief_complaint && (
                        <span className="mo-workflow-secondary">{patient.chief_complaint}</span>
                      )}
                    </td>
                    <td data-label={t("medicalOfficerWorkflow.status")}>
                      <Badge tone={view === "mine" ? "green" : "warning"}>
                        {view === "mine"
                          ? t("medicalOfficerWorkflow.claimedAt", { date: formatLocalizedDateTime(patient.claimed_at, language) })
                          : getCaseStateLabel(patient.case_state, language)}
                      </Badge>
                    </td>
                    <td data-label={t("medicalOfficerWorkflow.action")}>
                      {view === "available" ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={busyPatientId === patient.id}
                          disabled={Boolean(busyPatientId)}
                          onClick={() => performAction(patient, "claim")}
                        >
                          <Activity size={15} /> {t("medicalOfficerWorkflow.claim")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busyPatientId === patient.id}
                          disabled={Boolean(busyPatientId)}
                          onClick={() => performAction(patient, "release")}
                        >
                          {t("medicalOfficerWorkflow.release")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!cases.length && (
                  <tr><td colSpan="5" className="mo-workflow-empty">{t(view === "available" ? "medicalOfficerWorkflow.noAvailableCases" : "medicalOfficerWorkflow.noOwnedCases")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <div className="mo-workflow-pager">
            <span>
              {t("mo.totalRecords", { count: number(currentPagination.total) })}
            </span>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || currentPagination.page <= 1}
                onClick={() => changePage(currentPagination.page - 1)}
              >
                {t("auditLogs.previous")}
              </button>
              <span>
                {t("auditLogs.pageOf", {
                  page: number(currentPagination.page),
                  total: number(Math.max(currentPagination.total_pages, 1)),
                })}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || currentPagination.page >= currentPagination.total_pages}
                onClick={() => changePage(currentPagination.page + 1)}
              >
                {t("auditLogs.next")}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
