import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Microscope, NotebookPen } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, EmptyState, PageLoader } from "../../components/ui";
import "../district/District.css";
import "./CareTeam.css";

function notePreview(text, max = 180) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Specialist Clinical Notes — uses diagnostic order clinical content
 * (report notes + signed advice) instead of the empty CareModule stub.
 */
export default function SpecialistClinicalNotes() {
  const { t, tm } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const listRes = await api.get("/diagnostics/orders", { params: { page_size: 30 } });
      const list = listRes.data?.orders || listRes.data?.items || [];
      const details = await Promise.all(
        list.slice(0, 12).map(async (order) => {
          try {
            const detail = await api.get(`/diagnostics/orders/${order.id}`);
            return detail.data?.order || order;
          } catch {
            return order;
          }
        })
      );
      setOrders(details);
    } catch (requestError) {
      setOrders([]);
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="care-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.spNotes.title")}</h1>
          <p className="page-subtitle">{t("care.spNotesFromDiagnostics")}</p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">
          <ArrowLeft size={16} aria-hidden="true" /> {t("care.backToDashboard")}
        </Link>
      </div>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {loading && <PageLoader label={t("common.loading")} />}

      {!loading && orders.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title={t("care.noClinicalNotesTitle")}
          text={t("care.noClinicalNotesText")}
        />
      )}

      {!loading && orders.length > 0 && (
        <ul className="care-list care-clinical-notes-list">
          {orders.map((order) => {
            const reports = order.reports || [];
            const notesReports = reports.filter((report) => report.clinical_notes);
            const advice = order.advice || null;
            const open = Boolean(expanded[order.id]);
            return (
              <li key={order.id} className="district-card care-clinical-note-card">
                <div className="care-clinical-note-head">
                  <div>
                    <strong>{order.order_code}</strong>
                    <span>{order.patient_name} ({order.patient_code})</span>
                    <div className="diagnostics-item-tags">
                      <Badge tone="info">{order.status_name || order.status_code}</Badge>
                      {order.workflow_status && <Badge tone="warning">{order.workflow_status}</Badge>}
                    </div>
                  </div>
                  <div className="diagnostics-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setExpanded((current) => ({
                        ...current,
                        [order.id]: !open,
                      }))}
                    >
                      {open ? t("care.hideNotes") : t("care.showNotes")}
                    </button>
                    <Link className="btn btn-primary" to={`/specialist/diagnostics/${order.id}`}>
                      <Microscope size={16} aria-hidden="true" /> {t("care.openDiagnosticOrder")}
                    </Link>
                  </div>
                </div>

                {!open && (
                  <p className="care-muted">
                    {advice?.findings
                      ? notePreview(advice.findings)
                      : notesReports[0]?.clinical_notes
                        ? notePreview(notesReports[0].clinical_notes)
                        : t("care.noNotesOnOrder")}
                  </p>
                )}

                {open && (
                  <div className="care-clinical-note-body">
                    {advice ? (
                      <section>
                        <h3><NotebookPen size={14} aria-hidden="true" /> {t("diagnostics.specialistAdvice")}</h3>
                        <dl className="diagnostics-dl">
                          {advice.findings && <div><dt>{t("diagnostics.findings")}</dt><dd>{advice.findings}</dd></div>}
                          {advice.precautions && <div><dt>{t("diagnostics.precautions")}</dt><dd>{advice.precautions}</dd></div>}
                          {advice.treatment_advice && <div><dt>{t("diagnostics.treatmentAdvice")}</dt><dd>{advice.treatment_advice}</dd></div>}
                          {advice.medicine_name && <div><dt>{t("diagnostics.medicineName")}</dt><dd>{advice.medicine_name}</dd></div>}
                          {advice.follow_up_instructions && (
                            <div><dt>{t("diagnostics.followUpInstructions")}</dt><dd>{advice.follow_up_instructions}</dd></div>
                          )}
                        </dl>
                      </section>
                    ) : (
                      <p className="care-muted">{t("care.noSignedAdvice")}</p>
                    )}

                    <section>
                      <h3><FileText size={14} aria-hidden="true" /> {t("diagnostics.reportsTitle")}</h3>
                      {notesReports.length === 0 ? (
                        <p className="care-muted">{t("care.noReportClinicalNotes")}</p>
                      ) : (
                        <ul className="care-list">
                          {notesReports.map((report) => (
                            <li key={report.id}>
                              <strong>{report.document_category || report.original_filename}</strong>
                              <span>{report.clinical_notes}</span>
                              <Badge tone={report.review_status === "REVIEWED" ? "success" : "warning"}>
                                {report.review_status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
