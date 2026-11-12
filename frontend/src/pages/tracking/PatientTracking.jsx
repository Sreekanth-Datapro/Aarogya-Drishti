import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import MandatoryTrackingFields from "./MandatoryTrackingFields";
import CareTrackingFields from "./CareTrackingFields";
import "../medicalOfficer/MedicalOfficer.css";
import "./Tracking.css";

const FILTERS = ["all", "active", "overdue", "escalations", "diagnostics"];

const STAT_KEYS = [
  ["total_patients", "tracking.stats.total"],
  ["active_patients", "tracking.stats.active"],
  ["pending_tasks", "tracking.stats.pendingTasks"],
  ["overdue_followups", "tracking.stats.overdue"],
  ["upcoming_appointments", "tracking.stats.upcoming"],
  ["pending_diagnostic_reports", "tracking.stats.pendingDiagnostics"],
  ["reports_awaiting_review", "tracking.stats.awaitingReview"],
  ["escalations", "tracking.stats.escalations"],
  ["recovered_closed", "tracking.stats.recovered"],
];

/**
 * Role-shared patient tracking dashboard.
 * District Admin sees aggregate counts only (no patient identities).
 */
export default function PatientTracking({ role }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState("all");
  const [dashboard, setDashboard] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDistrict = role === "DISTRICT_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashRes, listRes] = await Promise.all([
        api.get("/tracking/dashboard"),
        isDistrict
          ? Promise.resolve({ data: { patients: [] } })
          : api.get("/tracking/patients", { params: { filter, page_size: 50 } }),
      ]);
      setDashboard(dashRes.data.dashboard || null);
      setPatients(listRes.data.patients || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "tracking.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filter, isDistrict]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mo-page tracking-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("tracking.title")}</h1>
          <p className="page-subtitle">{t("tracking.subtitle")}</p>
        </div>
        <Button type="button" variant="secondary" onClick={load}>
          <RefreshCw size={16} />
          {t("common.refresh")}
        </Button>
      </div>

      {error ? <Alert type="danger">{error}</Alert> : null}
      {isDistrict ? <Alert type="info">{t("tracking.districtPrivacy")}</Alert> : null}

      {loading && !dashboard ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <>
          <section className="tracking-stats" aria-label={t("tracking.statsHeading")}>
            {STAT_KEYS.map(([field, key]) => (
              <div key={field} className="tracking-stat">
                <span className="tracking-stat-label">{t(key)}</span>
                <strong className="tracking-stat-value">{dashboard?.[field] ?? 0}</strong>
              </div>
            ))}
          </section>

          {!isDistrict ? (
            <>
              <div className="tracking-filters" role="tablist">
                {FILTERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`tracking-filter${filter === item ? " is-active" : ""}`}
                    onClick={() => setFilter(item)}
                  >
                    {t(`tracking.filters.${item}`)}
                  </button>
                ))}
              </div>

              {loading ? (
                <PageLoader label={t("common.loading")} />
              ) : patients.length === 0 ? (
                <Alert type="info">{t("tracking.empty")}</Alert>
              ) : (
                <div className="tracking-card-list">
                  {patients.map((row) => (
                    <article
                      key={row.id}
                      className={`tracking-patient-card${row.is_overdue ? " is-overdue" : ""}`}
                    >
                      <header className="tracking-patient-card-header">
                        <div className="tracking-patient">
                          <Activity size={16} aria-hidden />
                          <div>
                            <strong>{row.full_name || row.patient_code}</strong>
                            <span>
                              {row.patient_code}
                              {row.facility_name ? ` · ${row.facility_name}` : ""}
                            </span>
                          </div>
                        </div>
                        {row.has_escalation ? (
                          <Badge tone="danger">{t("tracking.escalation")}</Badge>
                        ) : null}
                      </header>

                      <MandatoryTrackingFields
                        compact
                        currentStageLabel={row.current_stage_label}
                        responsibleDisplay={row.responsible?.display}
                        nextActionLabel={row.next_action_label}
                        dueAt={row.next_action_due_at}
                        isOverdue={row.is_overdue}
                      />
                      <CareTrackingFields compact treatment={row.treatment_tracking} />

                      <footer className="tracking-patient-card-footer">
                        <Link className="tracking-link" to={row.target_path || `/tracking/${row.id}`}>
                          {t("tracking.openJourney")}
                        </Link>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
