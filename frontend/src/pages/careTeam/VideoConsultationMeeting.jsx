import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, Microscope, NotebookPen } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Badge, Button } from "../../components/ui";
import VideoMeeting from "../../components/video/VideoMeeting";
import "./CareTeam.css";

export default function VideoConsultationMeeting() {
  const { consultationId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [join, setJoin] = useState(null);
  const [clinical, setClinical] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState("");
  const [notesError, setNotesError] = useState("");

  const loadJoin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post(`/video-consultations/${consultationId}/join`);
      setJoin(response.data?.join || null);
    } catch (requestError) {
      setJoin(null);
      setError(requestError?.response?.data?.message || t("videoMeeting.joinFailed"));
    } finally {
      setLoading(false);
    }
  }, [consultationId, t]);

  const loadClinical = useCallback(async () => {
    if (!consultationId) return;
    setNotesLoading(true);
    setNotesError("");
    try {
      const response = await api.get(`/video-consultations/${consultationId}/clinical-context`);
      setClinical(response.data?.clinical || null);
    } catch (requestError) {
      setClinical(null);
      setNotesError(requestError?.response?.data?.message || t("care.clinicalContextFailed"));
    } finally {
      setNotesLoading(false);
    }
  }, [consultationId, t]);

  const reportPresence = useCallback(async (event) => {
    if (!consultationId) return;
    await api.post(`/video-consultations/${consultationId}/presence`, { event });
  }, [consultationId]);

  useEffect(() => {
    loadJoin();
  }, [loadJoin]);

  useEffect(() => {
    if (!loading && !error && join?.room_ref) {
      loadClinical();
    }
  }, [loading, error, join, loadClinical]);

  const orders = clinical?.diagnostic_orders || [];

  return (
    <div className="care-page video-meeting-with-notes">
      <header className="care-hero">
        <p className="care-eyebrow">{t("videoMeeting.eyebrow")}</p>
        <h1 className="page-title">{t("videoMeeting.title")}</h1>
        <p className="page-subtitle">
          {clinical?.patient_name
            ? `${clinical.patient_name} (${clinical.patient_code})`
            : t("videoMeeting.subtitle")}
        </p>
      </header>

      {loading && <p className="care-muted" role="status">{t("videoMeeting.authorizing")}</p>}
      {error && (
        <Alert type="error">
          {error}
          <div style={{ marginTop: "0.75rem" }}>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              {t("videoMeeting.back")}
            </Button>
            <Button type="button" onClick={loadJoin} style={{ marginLeft: "0.5rem" }}>
              {t("videoMeeting.retry")}
            </Button>
          </div>
        </Alert>
      )}

      {!loading && !error && join?.room_ref && join?.domain && (
        <div className="video-meeting-layout">
          <div className="video-meeting-stage">
            <VideoMeeting
              domain={join.domain}
              roomName={join.room_ref}
              displayName={join.display_name}
              onPresence={reportPresence}
              onLeft={() => navigate(-1)}
            />
          </div>

          <aside className="video-clinical-notes" aria-label={t("modules.spNotes.title")}>
            <div className="video-clinical-notes-head">
              <h2><NotebookPen size={16} aria-hidden="true" /> {t("modules.spNotes.title")}</h2>
              <Button type="button" variant="secondary" onClick={loadClinical} disabled={notesLoading}>
                {t("common.refresh")}
              </Button>
            </div>
            <p className="care-muted">{t("care.spNotesFromDiagnostics")}</p>

            {notesLoading && <p className="care-muted">{t("common.loading")}</p>}
            {notesError && <Alert type="error">{notesError}</Alert>}

            {!notesLoading && !notesError && orders.length === 0 && (
              <p className="care-muted">{t("care.noClinicalNotesText")}</p>
            )}

            {!notesLoading && orders.map((order) => {
              const advice = order.advice;
              const noteReports = (order.reports || []).filter((report) => report.clinical_notes);
              return (
                <section key={order.id} className="video-clinical-order">
                  <div className="video-clinical-order-head">
                    <strong>{order.order_code}</strong>
                    <Badge tone="info">{order.status_name || order.status_code}</Badge>
                  </div>

                  {advice ? (
                    <div className="video-clinical-block">
                      <h3>{t("diagnostics.specialistAdvice")}</h3>
                      {advice.findings && <p><strong>{t("diagnostics.findings")}:</strong> {advice.findings}</p>}
                      {advice.treatment_advice && (
                        <p><strong>{t("diagnostics.treatmentAdvice")}:</strong> {advice.treatment_advice}</p>
                      )}
                      {advice.medicine_name && (
                        <p><strong>{t("diagnostics.medicineName")}:</strong> {advice.medicine_name}</p>
                      )}
                      {advice.precautions && (
                        <p><strong>{t("diagnostics.precautions")}:</strong> {advice.precautions}</p>
                      )}
                    </div>
                  ) : (
                    <p className="care-muted">{t("care.noSignedAdvice")}</p>
                  )}

                  <div className="video-clinical-block">
                    <h3><FileText size={14} aria-hidden="true" /> {t("diagnostics.reportsTitle")}</h3>
                    {noteReports.length === 0 ? (
                      <p className="care-muted">{t("care.noReportClinicalNotes")}</p>
                    ) : (
                      <ul>
                        {noteReports.map((report) => (
                          <li key={report.id}>
                            <strong>{report.document_category || report.original_filename}</strong>
                            <span>{report.clinical_notes}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Link className="btn btn-secondary" to={`/specialist/diagnostics/${order.id}`}>
                    <Microscope size={14} aria-hidden="true" /> {t("care.openDiagnosticOrder")}
                  </Link>
                </section>
              );
            })}
          </aside>
        </div>
      )}
    </div>
  );
}
