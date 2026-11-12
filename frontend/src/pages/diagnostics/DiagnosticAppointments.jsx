import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import "../medicalOfficer/MedicalOfficer.css";
import "./Diagnostics.css";

function statusTone(status) {
  if (status === "REQUESTED") return "warning";
  if (status === "CONFIRMED") return "info";
  if (status === "COMPLETED") return "success";
  if (status === "MISSED" || status === "CANCELLED") return "danger";
  return "neutral";
}

/**
 * Role-specific diagnostic appointment lists.
 * Navigator also keeps the existing order list for scheduling entry.
 */
export default function DiagnosticAppointments({ role }) {
  const { t, language } = useLanguage();
  const detailPrefix =
    role === "HOSPITAL_STAFF"
      ? "/hospital-staff/diagnostics"
      : role === "HEALTH_WORKER"
        ? "/health-worker/diagnostics"
        : "/navigator/diagnostics/appointments";

  const [status, setStatus] = useState(
    role === "HOSPITAL_STAFF" ? "REQUESTED" : role === "HEALTH_WORKER" ? "CONFIRMED" : ""
  );
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page_size: 50 };
      if (status) params.status = status;
      if (role === "NAVIGATOR" && !status) params.pending_only = "true";
      if (role === "HEALTH_WORKER" && status === "MISSED") {
        params.missed_only = "true";
        delete params.status;
      }
      const response = await api.get("/diagnostics/appointments", { params });
      setAppointments(response.data.appointments || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [role, status]);

  useEffect(() => {
    load();
  }, [load]);

  const title =
    role === "HOSPITAL_STAFF"
      ? t("diagnostics.hsTitle")
      : role === "HEALTH_WORKER"
        ? t("diagnostics.hwTitle")
        : t("diagnostics.navScheduleTitle");

  const subtitle =
    role === "HOSPITAL_STAFF"
      ? t("diagnostics.hsSubtitle")
      : role === "HEALTH_WORKER"
        ? t("diagnostics.hwSubtitle")
        : t("diagnostics.navScheduleSubtitle");

  const stats = useMemo(() => {
    const requested = appointments.filter((row) => row.status_code === "REQUESTED").length;
    const confirmed = appointments.filter((row) => row.status_code === "CONFIRMED").length;
    return {
      total: appointments.length,
      requested,
      confirmed,
    };
  }, [appointments]);

  return (
    <div className="mo-page diagnostics-page">
      <DashboardBanner variant="diagnostics" className="diagnostics-hero">
        <div>
          <p className="mo-hero-eyebrow">
            <CalendarClock size={15} aria-hidden="true" /> {t("diagnostics.eyebrow")}
          </p>
          <h1 className="mo-hero-title">{title}</h1>
          <p className="mo-hero-text">{subtitle}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm diagnostics-hero-refresh" onClick={load}>
          <RefreshCw size={15} aria-hidden="true" /> {t("common.refresh")}
        </button>
      </DashboardBanner>

      {error && <Alert type="error">{error}</Alert>}

      <div className="diagnostics-stat-grid">
        <StatCard icon={ClipboardList} label={t("diagnostics.statAppointments")} value={String(stats.total)} />
        <StatCard icon={CalendarClock} tone="amber" label={t("diagnostics.statRequested")} value={String(stats.requested)} />
        <StatCard icon={CheckCircle2} tone="blue" label={t("diagnostics.statConfirmed")} value={String(stats.confirmed)} />
      </div>

      <section className="mo-card diagnostics-panel diagnostics-panel-list">
        <div className="mo-card-head">
          <h2>
            <CalendarClock size={18} aria-hidden="true" /> {t("diagnostics.appointments")}
          </h2>
          <div className="diagnostics-row diagnostics-toolbar">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("diagnostics.allStatuses")}</option>
              <option value="REQUESTED">REQUESTED</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="RESCHEDULED">RESCHEDULED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="MISSED">MISSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <Button type="button" variant="secondary" onClick={load}>
              <RefreshCw size={14} aria-hidden="true" /> {t("common.refresh")}
            </Button>
          </div>
        </div>

        {loading ? (
          <PageLoader label={t("common.loading")} />
        ) : appointments.length === 0 ? (
          <p className="diagnostics-empty">{t("diagnostics.noAppointments")}</p>
        ) : (
          <ul className="diagnostics-order-list">
            {appointments.map((appointment) => (
              <li key={appointment.id} className="diagnostics-order-item">
                <div>
                  <strong>{appointment.order_code}</strong>
                  <span>
                    {appointment.patient_name} ({appointment.patient_code})
                  </span>
                  <span>
                    {formatLocalizedDateTime(
                      appointment.confirmed_at_time || appointment.requested_at,
                      language
                    )}
                  </span>
                  <span>
                    {language === "te" && appointment.facility_name_te
                      ? appointment.facility_name_te
                      : appointment.facility_name}
                  </span>
                  <div className="diagnostics-item-tags">
                    <Badge tone={statusTone(appointment.status_code)}>{appointment.status_code}</Badge>
                    {(appointment.items || []).slice(0, 2).map((item) => (
                      <Badge key={item.id} tone="info">
                        {language === "te" && item.test_name_te ? item.test_name_te : item.test_name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Link className="btn btn-secondary" to={`${detailPrefix}/${appointment.id}`}>
                  {t("diagnostics.viewDetails")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
