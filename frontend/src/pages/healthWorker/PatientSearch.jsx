import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, Search, UserPlus, Users } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, getLocalizedField, getSexLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Card, EmptyState, PageLoader } from "../../components/ui";
import "./PatientExplorer.css";

export default function PatientSearch() {
  const { t, tm, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const search = async (page = 1, term = query) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setError(t("patientExplorer.searchMinimum"));
      setResult(null);
      return;
    }
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/patients/search", { params: { q: trimmed, page, limit: 20 } });
      if (requestId.current === currentRequest) setResult(response.data);
    } catch (requestError) {
      if (requestId.current === currentRequest) {
        setError(apiMessage(requestError, "patientExplorer.searchFailed"));
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  };

  const reset = () => {
    requestId.current += 1;
    setQuery("");
    setResult(null);
    setError("");
    setLoading(false);
  };

  const submit = (event) => {
    event.preventDefault();
    search(1);
  };

  if (loading && !result) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="patient-explorer-page">
      <header className="patient-explorer-hero">
        <div>
          <span className="patient-explorer-eyebrow"><Search size={15} /> {t("patientExplorer.searchTitle")}</span>
          <h1 className="page-title">{t("patientExplorer.searchTitle")}</h1>
          <p className="page-subtitle">{t("patientExplorer.searchSubtitle")}</p>
        </div>
        <Link className="btn btn-primary" to="/health-worker/patients">
          <UserPlus size={16} /> {t("patientExplorer.registerNew")}
        </Link>
      </header>

      <Card>
        <form className="patient-search-form" onSubmit={submit}>
          <label htmlFor="patient-search-query">{t("patientExplorer.searchLabel")}</label>
          <div className="patient-search-controls">
            <input
              id="patient-search-query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("patientExplorer.searchPlaceholder")}
              minLength={2}
              maxLength={100}
              autoComplete="off"
            />
            <Button type="submit" loading={loading} disabled={loading || query.trim().length < 2}>
              <Search size={16} /> {t("patientExplorer.searchButton")}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} disabled={loading && !result}>
              {t("patientExplorer.reset")}
            </Button>
          </div>
          <p className="patient-search-help">{t("patientExplorer.searchHelp")}</p>
        </form>
      </Card>

      {error && (
        <Alert type="error">
          {tm(error)}
          {result && <Button type="button" variant="secondary" onClick={() => search(result.page)}>{t("patientExplorer.retry")}</Button>}
        </Alert>
      )}

      {result && (
        <Card>
          <div className="patient-explorer-section-heading">
            <div>
              <h2>{t("patientExplorer.results")}</h2>
              <p>{t("patientExplorer.resultsCount", { count: result.total })}</p>
            </div>
          </div>
          {loading && <div className="patient-search-loading" role="status">{t("common.loading")}</div>}
          {!loading && result.patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("patientExplorer.noResults")}
              text={t("patientExplorer.noResultsHelp")}
              action={<Link className="btn btn-primary" to="/health-worker/patients">{t("patientExplorer.registerNew")}</Link>}
            />
          ) : (
            <div className="patient-explorer-table-wrap">
              <table className="patient-explorer-table">
                <thead>
                  <tr>
                    <th>{t("patientExplorer.patientName")}</th>
                    <th>{t("patientExplorer.patientCode")}</th>
                    <th>{t("patientExplorer.location")}</th>
                    <th>{t("patientExplorer.registeredOn")}</th>
                    <th>{t("patientExplorer.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.patients.map((patient) => (
                    <tr key={patient.id}>
                      <td data-label={t("patientExplorer.patientName")}>
                        <strong>{patient.full_name}</strong>
                        <small>{patient.sex ? getSexLabel(patient.sex, language) : ""}</small>
                      </td>
                      <td data-label={t("patientExplorer.patientCode")}><span className="patient-explorer-code">{patient.patient_code}</span></td>
                      <td data-label={t("patientExplorer.location")}>
                        {getLocalizedField(patient, "village_name", language) || "—"}
                        {" · "}
                        {getLocalizedField(patient, "facility_name", language) || "—"}
                      </td>
                      <td data-label={t("patientExplorer.registeredOn")}>{formatLocalizedDate(patient.created_at, language)}</td>
                      <td data-label={t("patientExplorer.details")}>
                        <Link className="patient-explorer-view" to={`/health-worker/patients/${patient.id}`}>
                          <Eye size={15} /> {t("patientExplorer.details")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.pages > 1 && (
            <nav className="patient-search-pagination" aria-label={t("patientExplorer.results")}>
              <Button type="button" variant="secondary" disabled={loading || result.page <= 1} onClick={() => search(result.page - 1)}>
                <ChevronLeft size={16} /> {t("patientExplorer.previous")}
              </Button>
              <span>{t("patientExplorer.page", { page: result.page, pages: result.pages })}</span>
              <Button type="button" variant="secondary" disabled={loading || result.page >= result.pages} onClick={() => search(result.page + 1)}>
                {t("patientExplorer.next")} <ChevronRight size={16} />
              </Button>
            </nav>
          )}
        </Card>
      )}
    </div>
  );
}
