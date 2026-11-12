import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Microscope } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import "../medicalOfficer/MedicalOfficer.css";
import "./Diagnostics.css";

function localizeName(row, language, enKey = "name_en", teKey = "name_te") {
  if (!row) return "";
  if (language === "te" && row[teKey]) return row[teKey];
  return row[enKey] || row[teKey] || "";
}

function priorityTone(priority) {
  if (priority === "EMERGENCY") return "danger";
  if (priority === "URGENT") return "warning";
  return "info";
}

function localDateTimeMin() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function DiagnosticOrderDetails({ role }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const backPath =
    role === "NAVIGATOR"
      ? "/navigator/diagnostics"
      : role === "SPECIALIST"
        ? "/specialist/diagnostics"
        : "/medical-officer/diagnostics";

  const [order, setOrder] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [coordinationNotes, setCoordinationNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState({});
  const [uploading, setUploading] = useState(false);

  async function reloadOrder() {
    const orderRes = await api.get(`/diagnostics/orders/${orderId}`);
    setOrder(orderRes.data.order);
    setFacilityId(orderRes.data.order?.facility_id ? String(orderRes.data.order.facility_id) : "");
    return orderRes.data.order;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const orderRes = await api.get(`/diagnostics/orders/${orderId}`);
        if (cancelled) return;
        setOrder(orderRes.data.order);
        setFacilityId(orderRes.data.order?.facility_id ? String(orderRes.data.order.facility_id) : "");
        if (role === "NAVIGATOR") {
          const [facilityRes, apptRes] = await Promise.all([
            api.get("/diagnostics/schedule-facilities"),
            api.get("/diagnostics/appointments", { params: { order_id: orderId, page_size: 20 } }),
          ]);
          if (cancelled) return;
          setFacilities(facilityRes.data.facilities || []);
          setAppointments(apptRes.data.appointments || []);
        }
      } catch (requestError) {
        if (!cancelled) setError(apiMessage(requestError, "diagnostics.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, role]);

  async function uploadReport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm(t("diagnostics.confirmUploadReport"))) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("report", file);
      await api.post(`/diagnostics/orders/${orderId}/reports`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage(t("diagnostics.reportUploaded"));
      await reloadOrder();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function openReportFile(reportId) {
    try {
      const response = await api.get(`/diagnostics/orders/${orderId}/reports/${reportId}/file`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    }
  }

  async function submitReview(reportId) {
    const notes = (reviewNotes[reportId] || "").trim();
    if (!notes) {
      setError(t("diagnostics.reviewNotesRequired"));
      return;
    }
    if (!window.confirm(t("diagnostics.confirmReviewReport"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/diagnostics/orders/${orderId}/reports/${reportId}/review`, {
        clinical_notes: notes,
      });
      setMessage(t("diagnostics.reportReviewed"));
      await reloadOrder();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/diagnostics/orders/${orderId}/schedule`, {
        facility_id: Number(facilityId),
        requested_at: new Date(requestedAt).toISOString(),
        coordination_notes: coordinationNotes || null,
        idempotency_key: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `sched-${Date.now()}`,
      });
      setMessage(response.data.message || t("diagnostics.scheduleSubmitted"));
      const appointmentId = response.data.appointment?.id;
      if (appointmentId) {
        navigate(`/navigator/diagnostics/appointments/${appointmentId}`);
        return;
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label={t("common.loading")} />;
  if (!order) {
    return (
      <div className="mo-page">
        {error && <Alert type="error">{error}</Alert>}
        <Link className="btn btn-secondary" to={backPath}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("diagnostics.backToList")}
        </Link>
      </div>
    );
  }

  const hasActiveAppointment = appointments.some((row) => !row.is_terminal);

  return (
    <div className="mo-page diagnostics-page">
      <div className="diagnostics-detail-head">
        <div>
          <h1 className="page-title">
            <Microscope size={20} aria-hidden="true" /> {order.order_code}
          </h1>
          <p className="page-subtitle">
            {order.patient_name} ({order.patient_code})
          </p>
        </div>
        <Link className="btn btn-secondary" to={backPath}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("diagnostics.backToList")}
        </Link>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <section className="mo-card">
        <h2>{t("diagnostics.orderSummary")}</h2>
        <dl className="diagnostics-dl">
          <div><dt>{t("diagnostics.status")}</dt><dd>{order.status_name}</dd></div>
          <div><dt>{t("diagnostics.facility")}</dt><dd>{localizeName(order, language, "facility_name", "facility_name_te")}</dd></div>
          <div><dt>{t("diagnostics.prescribedBy")}</dt><dd>{order.prescribed_by_name} ({order.prescribed_by_role})</dd></div>
          {order.referral_code && (
            <div><dt>{t("diagnostics.linkedReferral")}</dt><dd>{order.referral_code}</dd></div>
          )}
          {order.notes && <div><dt>{t("diagnostics.notes")}</dt><dd>{order.notes}</dd></div>}
        </dl>
      </section>

      <section className="mo-card">
        <h2>{t("diagnostics.orderItems")}</h2>
        <ul className="diagnostics-order-list">
          {(order.items || []).map((item) => (
            <li key={item.id} className="diagnostics-order-item">
              <div>
                <strong>{localizeName(item, language, "test_name", "test_name_te")}</strong>
                <span>{item.category_name}</span>
                <span>{item.clinical_reason}</span>
                {item.instructions && <span>{item.instructions}</span>}
                <div className="diagnostics-item-tags">
                  <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
                  <Badge tone="info">{item.status_name}</Badge>
                  {item.fasting_required && <Badge tone="warning">{t("diagnostics.fastingRequired")}</Badge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {role === "NAVIGATOR" && (
        <section className="mo-card">
          <h2>{t("diagnostics.scheduleTitle")}</h2>
          {appointments.length > 0 && (
            <ul className="diagnostics-order-list">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="diagnostics-order-item">
                  <div>
                    <strong>{appointment.status_code}</strong>
                    <span>{new Date(appointment.confirmed_at_time || appointment.requested_at).toLocaleString()}</span>
                  </div>
                  <Link className="btn btn-secondary" to={`/navigator/diagnostics/appointments/${appointment.id}`}>
                    {t("diagnostics.viewDetails")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!hasActiveAppointment && (
            <form className="diagnostics-form" onSubmit={submitSchedule}>
              <label>
                <span>{t("diagnostics.facility")}</span>
                <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} required>
                  <option value="">{t("diagnostics.selectFacility")}</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {localizeName(facility, language)} ({facility.facility_type})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("diagnostics.preferredDateTime")}</span>
                <input
                  type="datetime-local"
                  min={localDateTimeMin()}
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>{t("diagnostics.coordinationNotes")}</span>
                <textarea
                  value={coordinationNotes}
                  onChange={(e) => setCoordinationNotes(e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </label>
              <div className="diagnostics-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? t("common.saving") : t("diagnostics.submitSchedule")}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="mo-card">
        <h2>{t("diagnostics.reportsTitle")}</h2>
        {(role === "HEALTH_WORKER" || role === "HOSPITAL_STAFF") && (
          <label className="diagnostics-upload">
            <span>{t("diagnostics.uploadReport")}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={uploading || saving}
              onChange={uploadReport}
            />
          </label>
        )}
        {(order.reports || []).length === 0 ? (
          <p className="mo-muted">{t("diagnostics.noReports")}</p>
        ) : (
          <ul className="diagnostics-order-list">
            {(order.reports || []).map((report) => (
              <li key={report.id} className="diagnostics-order-item">
                <div>
                  <strong>{report.original_filename || report.mime_type}</strong>
                  <span>{report.uploaded_by_name}</span>
                  <span>{new Date(report.created_at).toLocaleString()}</span>
                  <div className="diagnostics-item-tags">
                    <Badge tone={report.review_status === "REVIEWED" ? "success" : "warning"}>
                      {report.review_status}
                    </Badge>
                  </div>
                  {report.clinical_notes && <span>{report.clinical_notes}</span>}
                </div>
                <div className="diagnostics-actions">
                  <Button type="button" variant="secondary" onClick={() => openReportFile(report.id)}>
                    {t("diagnostics.viewReport")}
                  </Button>
                </div>
                {(role === "MEDICAL_OFFICER" || role === "SPECIALIST") && report.review_status === "PENDING" && (
                  <div className="diagnostics-form">
                    <label>
                      <span>{t("diagnostics.clinicalReviewNotes")}</span>
                      <textarea
                        rows={3}
                        value={reviewNotes[report.id] || ""}
                        onChange={(event) => setReviewNotes((current) => ({
                          ...current,
                          [report.id]: event.target.value,
                        }))}
                        maxLength={4000}
                      />
                    </label>
                    <div className="diagnostics-actions">
                      <Button type="button" disabled={saving} onClick={() => submitReview(report.id)}>
                        {t("diagnostics.markReviewed")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mo-card">
        <h2>{t("diagnostics.statusHistory")}</h2>
        <ul className="diagnostics-history">
          {(order.history || []).map((entry) => (
            <li key={entry.id}>
              <strong>{entry.to_status_code}</strong>
              <span>{entry.changed_by_name}</span>
              <span>{entry.reason || "—"}</span>
              <span>{new Date(entry.changed_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
