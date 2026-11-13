import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, FileText, Microscope, X } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, PageLoader } from "../../components/ui";
import DiagnosticReportUploadPanel from "./DiagnosticReportUploadPanel";
import "../medicalOfficer/MedicalOfficer.css";
import "./Diagnostics.css";

function reportCategoryLabel(order, report) {
  if (!report?.document_category) return null;
  return (order?.required_documents || []).find((doc) => doc.code === report.document_category)?.label
    || report.document_category;
}

function reviewStatusTone(status) {
  const code = String(status || "").toUpperCase();
  if (code === "REVIEWED" || code === "VERIFIED") return "success";
  if (code === "RETURNED") return "danger";
  return "warning";
}

function canClinicianReview(status) {
  return ["PENDING", "VERIFIED", "RETURNED"].includes(String(status || "").toUpperCase());
}

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
  const { t, tm, language } = useLanguage();
  const backPath =
    role === "NAVIGATOR"
      ? "/navigator/diagnostics"
      : role === "SPECIALIST"
        ? "/specialist/diagnostics"
        : role === "HOSPITAL_STAFF"
          ? "/hospital-staff/diagnostics"
          : role === "HEALTH_WORKER"
            ? "/health-worker/diagnostics"
            : "/medical-officer/diagnostics";

  const [order, setOrder] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [healthWorkers, setHealthWorkers] = useState([]);
  const [selectedHwId, setSelectedHwId] = useState("");
  const [hwLoading, setHwLoading] = useState(false);
  const [hwError, setHwError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [coordinationNotes, setCoordinationNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [viewer, setViewer] = useState({
    reportId: null,
    url: null,
    mime: null,
    name: null,
    loading: false,
  });
  const [adviceForm, setAdviceForm] = useState({
    findings: "",
    precautions: "",
    treatment_advice: "",
    medicine_name: "",
    dosage: "",
    duration_text: "",
    follow_up_instructions: "",
    reassessment_instructions: "",
    follow_up_required: true,
    follow_up_due_date: "",
    additional_diagnostics_needed: false,
    additional_diagnostics_notes: "",
  });
  const [followupForm, setFollowupForm] = useState({
    patient_contacted: true,
    patient_acknowledged: true,
    contacted_at: "",
    followup_date: "",
    symptoms_status: "",
    improvement_status: "",
    advice_followed: true,
    medicine_adherence: "",
    new_problems: "",
    specialist_review_needed: false,
    outcome_notes: "",
    followup_notes: "",
    idempotency_key: "",
  });
  const [reassessForm, setReassessForm] = useState({
    decision: "CONTINUE",
    follow_up_due_date: "",
    follow_up_instructions: "",
    reassessment_instructions: "",
    findings: "",
    precautions: "",
    treatment_advice: "",
    medicine_name: "",
    dosage: "",
    duration_text: "",
    follow_up_required: true,
    additional_diagnostics_notes: "",
    selected_test_ids: [],
    clinical_reason: "",
    slot_id: "",
    requested_start: "",
    requested_end: "",
    closure_reason: "",
    final_assessment: "",
    recovery_confirmed: false,
    notes: "",
  });
  const [diagnosticTests, setDiagnosticTests] = useState([]);
  const [videoSlots, setVideoSlots] = useState([]);
  const [followupReturnReason, setFollowupReturnReason] = useState("");
  const [createdLinks, setCreatedLinks] = useState([]);

  async function reloadOrder() {
    const orderRes = await api.get(`/diagnostics/orders/${orderId}`);
    setOrder(orderRes.data.order);
    setFacilityId(orderRes.data.order?.facility_id ? String(orderRes.data.order.facility_id) : "");
    return orderRes.data.order;
  }

  async function loadEligibleHealthWorkers() {
    setHwLoading(true);
    setHwError("");
    try {
      const hwRes = await api.get(`/diagnostics/orders/${orderId}/eligible-health-workers`);
      setHealthWorkers(hwRes.data.health_workers || []);
      if (!(hwRes.data.health_workers || []).length) {
        setHwError("diagnostics.noEligibleHealthWorkers");
      }
    } catch (requestError) {
      setHealthWorkers([]);
      setHwError(apiMessage(requestError, "diagnostics.healthWorkersLoadFailed"));
    } finally {
      setHwLoading(false);
    }
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
          await loadEligibleHealthWorkers();
        }
      } catch (requestError) {
        if (!cancelled) setError(apiMessage(requestError, "diagnostics.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, role]);

  function closeReportViewer() {
    setViewer((current) => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { reportId: null, url: null, mime: null, name: null, loading: false };
    });
  }

  async function openReportFile(report) {
    const reportId = typeof report === "string" ? report : report?.id;
    if (!reportId || viewer.loading) return;
    setError("");
    setViewer((current) => {
      if (current.url) URL.revokeObjectURL(current.url);
      return {
        reportId,
        url: null,
        mime: null,
        name: report?.original_filename || t("diagnostics.viewReport"),
        loading: true,
      };
    });
    try {
      const response = await api.get(`/diagnostics/orders/${orderId}/reports/${reportId}/file`, {
        responseType: "blob",
      });
      const blob = response.data;
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("empty");
      }
      // API errors can arrive as JSON blobs when responseType is blob.
      if (String(blob.type || "").includes("application/json")) {
        const payload = JSON.parse(await blob.text());
        throw Object.assign(new Error(payload?.message || "loadFailed"), { response: { data: payload } });
      }
      const mime = blob.type
        || response.headers?.["content-type"]
        || report?.mime_type
        || "application/octet-stream";
      const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
      const url = URL.createObjectURL(typed);
      setViewer({
        reportId,
        url,
        mime,
        name: report?.original_filename || t("diagnostics.viewReport"),
        loading: false,
      });
    } catch (requestError) {
      closeReportViewer();
      setError(apiMessage(requestError, "diagnostics.reportViewFailed"));
    }
  }

  useEffect(() => () => {
    if (viewer.url) URL.revokeObjectURL(viewer.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

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

  async function runWorkflow(path, body = {}, successKey = "diagnostics.saveSuccess") {
    setSaving(true);
    setError("");
    setMessage("");
    setCreatedLinks([]);
    try {
      const response = await api.post(`/diagnostics/orders/${orderId}/${path}`, body);
      const data = response.data || {};
      const links = [];
      if (data.created_order_id) {
        links.push({
          label: t("diagnostics.openCreatedOrder"),
          to: `/specialist/diagnostics/${data.created_order_id}`,
        });
        setMessage(
          data.message
          || t("diagnostics.createdOrderSuccess", {
            code: data.created_order_code || data.created_order_id,
          })
        );
      } else if (data.video_decision_id || data.video_consultation_id || data.availability_request_id) {
        if (data.video_consultation_id) {
          links.push({
            label: t("diagnostics.openVideoConsultation"),
            to: `/specialist/referrals#consultation-${data.video_consultation_id}`,
          });
        }
        if (data.availability_request_id) {
          links.push({
            label: t("diagnostics.openAvailabilityRequest"),
            to: `/specialist/referrals#availability-request-${data.availability_request_id}`,
          });
        }
        setMessage(data.message || t("diagnostics.videoRequestSuccess"));
      } else if (data.create_diagnostic_order || data.create_video_consultation) {
        setError(t("diagnostics.reassessFlagOnlyError"));
        await reloadOrder();
        return;
      } else {
        setMessage(data.message || t(successKey));
      }
      setCreatedLinks(links);
      await reloadOrder();
      if (role === "NAVIGATOR") {
        await loadEligibleHealthWorkers();
        if (path === "assign-health-worker") setSelectedHwId("");
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (role !== "SPECIALIST" || order?.workflow_status !== "REASSESSMENT_PENDING") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [testsRes, slotsRes] = await Promise.all([
          api.get("/diagnostics/tests"),
          order?.referral_id
            ? api.get(`/specialist/referrals/${order.referral_id}/consultation-slots`).catch(() => ({ data: { slots: [] } }))
            : Promise.resolve({ data: { slots: [] } }),
        ]);
        if (cancelled) return;
        setDiagnosticTests(testsRes.data.tests || testsRes.data || []);
        setVideoSlots(slotsRes.data.slots || slotsRes.data || []);
      } catch (_error) {
        if (!cancelled) {
          setDiagnosticTests([]);
          setVideoSlots([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [role, order?.workflow_status, order?.referral_id]);

  async function updateReportCategory(reportId, documentCategory) {
    if (!documentCategory || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.patch(
        `/diagnostics/orders/${orderId}/reports/${reportId}/category`,
        { document_category: documentCategory }
      );
      const data = response.data || {};
      if (data.requirements_met === false) {
        setMessage(data.message || t("diagnostics.categoryUpdatedPartial"));
      } else {
        setMessage(data.message || t("diagnostics.categoryUpdated"));
      }
      await reloadOrder();
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
        {error && <Alert type="error">{tm(error)}</Alert>}
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

      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{tm(message)}</Alert>}
      {createdLinks.length > 0 && (
        <div className="diagnostics-actions">
          {createdLinks.map((link) => (
            <Link key={link.to} className="btn btn-secondary" to={link.to}>
              {link.label}
            </Link>
          ))}
        </div>
      )}

      <section className="mo-card">
        <h2>{t("diagnostics.orderSummary")}</h2>
        <dl className="diagnostics-dl">
          <div><dt>{t("diagnostics.status")}</dt><dd>{order.status_name}</dd></div>
          <div><dt>{t("diagnostics.workflowStatus")}</dt><dd>{order.workflow_status || "—"}</dd></div>
          <div><dt>{t("diagnostics.facility")}</dt><dd>{localizeName(order, language, "facility_name", "facility_name_te")}</dd></div>
          <div><dt>{t("diagnostics.prescribedBy")}</dt><dd>{order.prescribed_by_name} ({order.prescribed_by_role})</dd></div>
          {order.assigned_health_worker_name && (
            <div><dt>{t("diagnostics.assignedHealthWorker")}</dt><dd>{order.assigned_health_worker_name}</dd></div>
          )}
          {order.referral_code && (
            <div><dt>{t("diagnostics.linkedReferral")}</dt><dd>{order.referral_code}</dd></div>
          )}
          {order.returned_reason && (
            <div><dt>{t("diagnostics.returnedReason")}</dt><dd>{order.returned_reason}</dd></div>
          )}
          {order.notes && <div><dt>{t("diagnostics.notes")}</dt><dd>{order.notes}</dd></div>}
        </dl>
      </section>

      {role === "NAVIGATOR" && (
        <section className="mo-card">
          <h2>{t("diagnostics.navigatorCoordination")}</h2>
          <div className="diagnostics-form">
            <label>
              <span>{t("diagnostics.assignHealthWorker")}</span>
              <select
                value={selectedHwId}
                disabled={hwLoading || saving}
                onChange={(e) => setSelectedHwId(e.target.value)}
              >
                <option value="">
                  {hwLoading
                    ? t("diagnostics.loadingHealthWorkers")
                    : t("diagnostics.selectHealthWorker")}
                </option>
                {healthWorkers.map((hw) => (
                  <option key={hw.id} value={hw.id}>
                    {hw.full_name}
                    {hw.facility_name ? ` · ${hw.facility_name}` : ""}
                    {hw.mandal_name ? ` · ${hw.mandal_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {hwError && (
              <Alert type="error">
                {tm(hwError)}{" "}
                <button type="button" className="linkish" onClick={loadEligibleHealthWorkers}>
                  {t("common.tryAgain")}
                </button>
              </Alert>
            )}
            {!hwLoading && !hwError && healthWorkers.length === 0 && (
              <p className="mo-muted">{t("diagnostics.noEligibleHealthWorkers")}</p>
            )}
            <div className="diagnostics-actions">
              <Button
                type="button"
                disabled={saving || hwLoading || !selectedHwId}
                onClick={() => runWorkflow("assign-health-worker", { health_worker_id: selectedHwId }, "diagnostics.assignHealthWorkerSuccess")}
              >
                {t("diagnostics.assignHealthWorker")}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => runWorkflow("verify", { action: "verify" })}
              >
                {t("diagnostics.verifyReports")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || !returnReason.trim()}
                onClick={() => runWorkflow("verify", { action: "return", reason: returnReason })}
              >
                {t("diagnostics.returnForCorrection")}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => runWorkflow("forward-hospital-staff", {})}
              >
                {t("diagnostics.forwardHospitalStaff")}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => runWorkflow("forward-advice", {})}
              >
                {t("diagnostics.forwardAdviceToHw")}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => runWorkflow("followup/verify", { action: "forward" })}
              >
                {t("diagnostics.forwardFollowupToSpecialist")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || !followupReturnReason.trim()}
                onClick={() => runWorkflow("followup/verify", {
                  action: "return",
                  reason: followupReturnReason,
                })}
              >
                {t("diagnostics.returnFollowup")}
              </Button>
            </div>
            <label>
              <span>{t("diagnostics.returnReason")}</span>
              <textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} rows={2} maxLength={2000} />
            </label>
            <label>
              <span>{t("diagnostics.followupReturnReason")}</span>
              <textarea
                value={followupReturnReason}
                onChange={(e) => setFollowupReturnReason(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </label>
          </div>
        </section>
      )}

      {role === "HEALTH_WORKER" && (
        <section className="mo-card">
          <h2>{t("diagnostics.hwCollection")}</h2>
          {(order.follow_up_due || order.follow_up_overdue) && (
            <Alert type={order.follow_up_overdue ? "error" : "warning"}>
              {order.follow_up_overdue
                ? t("diagnostics.followupOverdueBanner")
                : t("diagnostics.followupDueBanner")}
              {order.follow_up_due_date ? ` (${order.follow_up_due_date})` : ""}
            </Alert>
          )}
          <div className="diagnostics-actions">
            <Button type="button" disabled={saving} onClick={() => runWorkflow("start-collection", {})}>
              {t("diagnostics.startCollection")}
            </Button>
          </div>
          {order.advice && (
            <div className="diagnostics-advice-readonly">
              <h3>{t("diagnostics.signedAdviceReadonly")}</h3>
              <p><strong>{t("diagnostics.findings")}:</strong> {order.advice.findings}</p>
              {order.advice.precautions && <p><strong>{t("diagnostics.precautions")}:</strong> {order.advice.precautions}</p>}
              {order.advice.medicine_name && (
                <p>
                  <strong>{t("diagnostics.medicineName")}:</strong> {order.advice.medicine_name}
                  {order.advice.dosage ? ` — ${order.advice.dosage}` : ""}
                </p>
              )}
              {order.advice.follow_up_due_date && (
                <p><strong>{t("diagnostics.followUpDueDate")}:</strong> {order.advice.follow_up_due_date}</p>
              )}
              {order.advice.reassessment_instructions && (
                <p><strong>{t("diagnostics.reassessmentInstructions")}:</strong> {order.advice.reassessment_instructions}</p>
              )}
            </div>
          )}
          <form
            className="diagnostics-form"
            onSubmit={(event) => {
              event.preventDefault();
              const key = followupForm.idempotency_key
                || (typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `fu-${Date.now()}`);
              setFollowupForm((current) => ({ ...current, idempotency_key: key }));
              runWorkflow("patient-followup", {
                ...followupForm,
                action: "submit",
                save_as_draft: false,
                patient_acknowledged: Boolean(followupForm.patient_acknowledged),
                patient_contacted: Boolean(followupForm.patient_contacted),
                advice_followed: Boolean(followupForm.advice_followed),
                specialist_review_needed: Boolean(followupForm.specialist_review_needed),
                followup_date: followupForm.followup_date || null,
                contacted_at: followupForm.contacted_at || null,
                idempotency_key: key,
              });
            }}
          >
            <h3>{t("diagnostics.patientFollowup")}</h3>
            <label>
              <span>{t("diagnostics.contactedAt")}</span>
              <input
                type="datetime-local"
                value={followupForm.contacted_at}
                onChange={(e) => setFollowupForm((current) => ({ ...current, contacted_at: e.target.value }))}
              />
            </label>
            <label>
              <span>{t("diagnostics.followupDate")}</span>
              <input
                type="date"
                value={followupForm.followup_date}
                onChange={(e) => setFollowupForm((current) => ({ ...current, followup_date: e.target.value }))}
              />
            </label>
            <label>
              <span>{t("diagnostics.symptomsStatus")}</span>
              <textarea
                rows={2}
                value={followupForm.symptoms_status}
                onChange={(e) => setFollowupForm((current) => ({ ...current, symptoms_status: e.target.value }))}
              />
            </label>
            <label>
              <span>{t("diagnostics.improvementStatus")}</span>
              <select
                value={followupForm.improvement_status}
                onChange={(e) => setFollowupForm((current) => ({ ...current, improvement_status: e.target.value }))}
              >
                <option value="">{t("diagnostics.selectImprovement")}</option>
                <option value="Improved">{t("diagnostics.improved")}</option>
                <option value="No Change">{t("diagnostics.noChange")}</option>
                <option value="Worsened">{t("diagnostics.worsened")}</option>
              </select>
            </label>
            <label>
              <span>{t("diagnostics.medicineAdherence")}</span>
              <input
                value={followupForm.medicine_adherence}
                onChange={(e) => setFollowupForm((current) => ({ ...current, medicine_adherence: e.target.value }))}
              />
            </label>
            <label>
              <span>{t("diagnostics.newProblems")}</span>
              <textarea
                rows={2}
                value={followupForm.new_problems}
                onChange={(e) => setFollowupForm((current) => ({ ...current, new_problems: e.target.value }))}
              />
            </label>
            <label>
              <span>{t("diagnostics.followupNotes")}</span>
              <textarea
                rows={3}
                value={followupForm.followup_notes || followupForm.outcome_notes}
                onChange={(e) => setFollowupForm((current) => ({
                  ...current,
                  followup_notes: e.target.value,
                  outcome_notes: e.target.value,
                }))}
              />
            </label>
            <label className="diagnostics-check">
              <input
                type="checkbox"
                checked={Boolean(followupForm.patient_contacted)}
                onChange={(e) => setFollowupForm((current) => ({
                  ...current,
                  patient_contacted: e.target.checked,
                  patient_acknowledged: e.target.checked,
                }))}
              />
              <span>{t("diagnostics.patientContacted")}</span>
            </label>
            <label className="diagnostics-check">
              <input
                type="checkbox"
                checked={Boolean(followupForm.advice_followed)}
                onChange={(e) => setFollowupForm((current) => ({ ...current, advice_followed: e.target.checked }))}
              />
              <span>{t("diagnostics.adviceFollowed")}</span>
            </label>
            <label className="diagnostics-check">
              <input
                type="checkbox"
                checked={Boolean(followupForm.specialist_review_needed)}
                onChange={(e) => setFollowupForm((current) => ({
                  ...current,
                  specialist_review_needed: e.target.checked,
                }))}
              />
              <span>{t("diagnostics.specialistReviewNeeded")}</span>
            </label>
            <div className="diagnostics-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => runWorkflow("patient-followup", {
                  ...followupForm,
                  action: "draft",
                  save_as_draft: true,
                  patient_acknowledged: Boolean(followupForm.patient_acknowledged),
                  patient_contacted: Boolean(followupForm.patient_contacted),
                  advice_followed: Boolean(followupForm.advice_followed),
                  specialist_review_needed: Boolean(followupForm.specialist_review_needed),
                  followup_date: followupForm.followup_date || null,
                  contacted_at: followupForm.contacted_at || null,
                })}
              >
                {t("diagnostics.saveFollowupDraft")}
              </Button>
              <Button type="submit" disabled={saving}>{t("diagnostics.submitFollowup")}</Button>
            </div>
          </form>
        </section>
      )}

      {role === "HOSPITAL_STAFF" && (
        <section className="mo-card">
          <h2>{t("diagnostics.hsRouting")}</h2>
          <p className="mo-muted">{t("diagnostics.hsNoInterpret")}</p>
          <div className="diagnostics-actions">
            <Button type="button" disabled={saving} onClick={() => runWorkflow("route-specialist", {})}>
              {t("diagnostics.routeToSpecialist")}
            </Button>
          </div>
        </section>
      )}

      {role === "SPECIALIST" && (
        <section className="mo-card">
          <h2>{t("diagnostics.specialistAdvice")}</h2>
          {order.workflow_status === "REASSESSMENT_PENDING" ? (
            <form
              className="diagnostics-form"
              onSubmit={(event) => {
                event.preventDefault();
                const payload = {
                  decision: reassessForm.decision,
                  follow_up_required: Boolean(reassessForm.follow_up_required),
                  follow_up_due_date: reassessForm.follow_up_due_date || null,
                  follow_up_instructions: reassessForm.follow_up_instructions || null,
                  reassessment_instructions: reassessForm.reassessment_instructions || null,
                  findings: reassessForm.findings || null,
                  precautions: reassessForm.precautions || null,
                  treatment_advice: reassessForm.treatment_advice || null,
                  medicine_name: reassessForm.medicine_name || null,
                  dosage: reassessForm.dosage || null,
                  duration_text: reassessForm.duration_text || null,
                  additional_diagnostics_notes: reassessForm.additional_diagnostics_notes || null,
                  notes: reassessForm.notes || null,
                  closure_reason: reassessForm.closure_reason || null,
                  final_assessment: reassessForm.final_assessment || null,
                  recovery_confirmed: Boolean(reassessForm.recovery_confirmed),
                  facility_id: order.facility_id || null,
                  slot_id: reassessForm.slot_id || null,
                  requested_start: reassessForm.requested_start
                    ? new Date(reassessForm.requested_start).toISOString()
                    : null,
                  requested_end: reassessForm.requested_end
                    ? new Date(reassessForm.requested_end).toISOString()
                    : null,
                };
                if (reassessForm.decision === "REQUEST_DIAGNOSTICS") {
                  payload.items = (reassessForm.selected_test_ids || []).map((testId) => ({
                    test_id: Number(testId),
                    clinical_reason: reassessForm.clinical_reason
                      || reassessForm.additional_diagnostics_notes
                      || "Additional diagnostics after follow-up reassessment",
                    priority: "ROUTINE",
                  }));
                }
                runWorkflow("reassess", payload);
              }}
            >
              <h3>{t("diagnostics.reassessmentPanel")}</h3>
              {(order.followups || []).slice(0, 1).map((row) => (
                <div key={row.id} className="diagnostics-followup-summary">
                  <p><strong>{t("diagnostics.latestFollowup")}:</strong> {row.improvement_status || row.outcome_notes}</p>
                  {row.symptoms_status && <p>{row.symptoms_status}</p>}
                  {row.followup_notes && <p>{row.followup_notes}</p>}
                </div>
              ))}
              <label>
                <span>{t("diagnostics.reassessDecision")}</span>
                <select
                  value={reassessForm.decision}
                  onChange={(e) => setReassessForm((current) => ({ ...current, decision: e.target.value }))}
                >
                  <option value="CONTINUE">{t("diagnostics.decisionContinue")}</option>
                  <option value="UPDATE">{t("diagnostics.decisionUpdate")}</option>
                  <option value="REQUEST_DIAGNOSTICS">{t("diagnostics.decisionDiagnostics")}</option>
                  <option value="REQUEST_VIDEO">{t("diagnostics.decisionVideo")}</option>
                  <option value="CLOSE">{t("diagnostics.decisionClose")}</option>
                </select>
              </label>
              {(reassessForm.decision === "CONTINUE" || reassessForm.decision === "UPDATE") && (
                <>
                  <label>
                    <span>{t("diagnostics.followUpDueDate")}</span>
                    <input
                      type="date"
                      required
                      value={reassessForm.follow_up_due_date}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        follow_up_due_date: e.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    <span>{t("diagnostics.reassessmentInstructions")}</span>
                    <textarea
                      rows={2}
                      value={reassessForm.reassessment_instructions}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        reassessment_instructions: e.target.value,
                      }))}
                    />
                  </label>
                </>
              )}
              {reassessForm.decision === "UPDATE" && (
                <>
                  <label>
                    <span>{t("diagnostics.findings")}</span>
                    <textarea
                      required
                      rows={3}
                      value={reassessForm.findings}
                      onChange={(e) => setReassessForm((current) => ({ ...current, findings: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>{t("diagnostics.precautions")}</span>
                    <textarea
                      rows={2}
                      value={reassessForm.precautions}
                      onChange={(e) => setReassessForm((current) => ({ ...current, precautions: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>{t("diagnostics.medicineName")}</span>
                    <input
                      value={reassessForm.medicine_name}
                      onChange={(e) => setReassessForm((current) => ({ ...current, medicine_name: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>{t("diagnostics.dosage")}</span>
                    <input
                      value={reassessForm.dosage}
                      onChange={(e) => setReassessForm((current) => ({ ...current, dosage: e.target.value }))}
                    />
                  </label>
                </>
              )}
              {reassessForm.decision === "REQUEST_DIAGNOSTICS" && (
                <>
                  <label>
                    <span>{t("diagnostics.selectDiagnosticTests")}</span>
                    <select
                      multiple
                      required
                      value={reassessForm.selected_test_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                        setReassessForm((current) => ({ ...current, selected_test_ids: selected }));
                      }}
                    >
                      {(Array.isArray(diagnosticTests) ? diagnosticTests : []).map((test) => (
                        <option key={test.id} value={String(test.id)}>
                          {localizeName(test, language) || test.code || test.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("diagnostics.clinicalReason")}</span>
                    <textarea
                      required
                      rows={2}
                      value={reassessForm.clinical_reason}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        clinical_reason: e.target.value,
                        additional_diagnostics_notes: e.target.value,
                      }))}
                    />
                  </label>
                </>
              )}
              {reassessForm.decision === "REQUEST_VIDEO" && (
                <>
                  <p className="mo-muted">{t("diagnostics.videoBookingHint")}</p>
                  <label>
                    <span>{t("diagnostics.publishedVideoSlot")}</span>
                    <select
                      value={reassessForm.slot_id}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        slot_id: e.target.value,
                        requested_start: e.target.value ? "" : current.requested_start,
                        requested_end: e.target.value ? "" : current.requested_end,
                      }))}
                    >
                      <option value="">{t("diagnostics.noPublishedSlot")}</option>
                      {videoSlots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.slot_start ? new Date(slot.slot_start).toLocaleString() : slot.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!reassessForm.slot_id && (
                    <>
                      <label>
                        <span>{t("diagnostics.requestedStart")}</span>
                        <input
                          type="datetime-local"
                          required
                          min={localDateTimeMin()}
                          value={reassessForm.requested_start}
                          onChange={(e) => setReassessForm((current) => ({
                            ...current,
                            requested_start: e.target.value,
                          }))}
                        />
                      </label>
                      <label>
                        <span>{t("diagnostics.requestedEnd")}</span>
                        <input
                          type="datetime-local"
                          required
                          min={reassessForm.requested_start || localDateTimeMin()}
                          value={reassessForm.requested_end}
                          onChange={(e) => setReassessForm((current) => ({
                            ...current,
                            requested_end: e.target.value,
                          }))}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    <span>{t("diagnostics.videoNotes")}</span>
                    <textarea
                      rows={2}
                      value={reassessForm.notes}
                      onChange={(e) => setReassessForm((current) => ({ ...current, notes: e.target.value }))}
                    />
                  </label>
                </>
              )}
              {reassessForm.decision === "CLOSE" && (
                <>
                  <label>
                    <span>{t("diagnostics.finalAssessment")}</span>
                    <textarea
                      required
                      rows={3}
                      value={reassessForm.final_assessment}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        final_assessment: e.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    <span>{t("diagnostics.closureReason")}</span>
                    <textarea
                      required
                      rows={2}
                      value={reassessForm.closure_reason}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        closure_reason: e.target.value,
                      }))}
                    />
                  </label>
                  <label className="diagnostics-check">
                    <input
                      type="checkbox"
                      checked={Boolean(reassessForm.recovery_confirmed)}
                      onChange={(e) => setReassessForm((current) => ({
                        ...current,
                        recovery_confirmed: e.target.checked,
                      }))}
                    />
                    <span>{t("diagnostics.recoveryConfirmed")}</span>
                  </label>
                </>
              )}
              <Button type="submit" disabled={saving}>{t("diagnostics.submitReassessment")}</Button>
            </form>
          ) : (
            <form
              className="diagnostics-form"
              onSubmit={(event) => {
                event.preventDefault();
                runWorkflow("advice", {
                  ...adviceForm,
                  follow_up_required: Boolean(adviceForm.follow_up_required),
                  follow_up_due_date: adviceForm.follow_up_due_date || null,
                });
              }}
            >
              <label>
                <span>{t("diagnostics.findings")}</span>
                <textarea
                  required
                  rows={3}
                  value={adviceForm.findings}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, findings: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.precautions")}</span>
                <textarea
                  rows={2}
                  value={adviceForm.precautions}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, precautions: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.treatmentAdvice")}</span>
                <textarea
                  rows={2}
                  value={adviceForm.treatment_advice}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, treatment_advice: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.medicineName")}</span>
                <input
                  value={adviceForm.medicine_name}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, medicine_name: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.dosage")}</span>
                <input
                  value={adviceForm.dosage}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, dosage: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.durationText")}</span>
                <input
                  value={adviceForm.duration_text}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, duration_text: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.followUpInstructions")}</span>
                <textarea
                  rows={2}
                  value={adviceForm.follow_up_instructions}
                  onChange={(e) => setAdviceForm((current) => ({ ...current, follow_up_instructions: e.target.value }))}
                />
              </label>
              <label>
                <span>{t("diagnostics.reassessmentInstructions")}</span>
                <textarea
                  rows={2}
                  value={adviceForm.reassessment_instructions}
                  onChange={(e) => setAdviceForm((current) => ({
                    ...current,
                    reassessment_instructions: e.target.value,
                  }))}
                />
              </label>
              <label className="diagnostics-check">
                <input
                  type="checkbox"
                  checked={Boolean(adviceForm.follow_up_required)}
                  onChange={(e) => setAdviceForm((current) => ({
                    ...current,
                    follow_up_required: e.target.checked,
                  }))}
                />
                <span>{t("diagnostics.followUpRequired")}</span>
              </label>
              {adviceForm.follow_up_required && (
                <label>
                  <span>{t("diagnostics.followUpDueDate")}</span>
                  <input
                    type="date"
                    required
                    value={adviceForm.follow_up_due_date}
                    onChange={(e) => setAdviceForm((current) => ({
                      ...current,
                      follow_up_due_date: e.target.value,
                    }))}
                  />
                </label>
              )}
              <label className="diagnostics-check">
                <input
                  type="checkbox"
                  checked={Boolean(adviceForm.additional_diagnostics_needed)}
                  onChange={(e) => setAdviceForm((current) => ({
                    ...current,
                    additional_diagnostics_needed: e.target.checked,
                  }))}
                />
                <span>{t("diagnostics.additionalDiagnosticsNeeded")}</span>
              </label>
              {adviceForm.additional_diagnostics_needed && (
                <label>
                  <span>{t("diagnostics.additionalDiagnosticsNotes")}</span>
                  <textarea
                    required
                    rows={2}
                    value={adviceForm.additional_diagnostics_notes}
                    onChange={(e) => setAdviceForm((current) => ({
                      ...current,
                      additional_diagnostics_notes: e.target.value,
                    }))}
                  />
                </label>
              )}
              <div className="diagnostics-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => runWorkflow("advice/draft", {
                    ...adviceForm,
                    follow_up_required: Boolean(adviceForm.follow_up_required),
                    follow_up_due_date: adviceForm.follow_up_due_date || null,
                  })}
                >
                  {t("diagnostics.saveAdviceDraft")}
                </Button>
                <Button type="submit" disabled={saving}>{t("diagnostics.signAdvice")}</Button>
              </div>
            </form>
          )}
          {(order.advice_history || []).length > 0 && (
            <div className="diagnostics-advice-history">
              <h3>{t("diagnostics.adviceHistory")}</h3>
              <ul className="diagnostics-order-list">
                {(order.advice_history || []).map((row) => (
                  <li key={row.id}>
                    <strong>v{row.version_no || 1}</strong>
                    {" · "}
                    <Badge tone={row.status === "SIGNED" ? "success" : "neutral"}>{row.status}</Badge>
                    {row.is_current && <Badge tone="info">{t("diagnostics.currentAdvice")}</Badge>}
                    <div>{row.findings}</div>
                    {row.signed_at && <span className="mo-muted">{new Date(row.signed_at).toLocaleString()}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {((order.followups || []).length > 0) && (
        <section className="mo-card">
          <h2>{t("diagnostics.followupHistory")}</h2>
          <ul className="diagnostics-order-list">
            {(order.followups || []).map((row) => (
              <li key={row.id}>
                <Badge tone="info">{row.status || "SUBMITTED"}</Badge>
                {row.improvement_status && <Badge tone="neutral">{row.improvement_status}</Badge>}
                <div>{row.followup_notes || row.outcome_notes}</div>
                <span className="mo-muted">
                  {row.health_worker_name || ""}
                  {row.submitted_at || row.created_at
                    ? ` · ${new Date(row.submitted_at || row.created_at).toLocaleString()}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <section className="mo-card diagnostics-reports-panel">
        <div className="diagnostics-reports-head">
          <div>
            <h2>{t("diagnostics.reportsTitle")}</h2>
            <p className="mo-muted">{t("diagnostics.reportsViewHint")}</p>
          </div>
          {(order.reports || []).length > 0 && (
            <span className="diagnostics-report-count">
              {(order.reports || []).length} {t("diagnostics.reportsCountLabel")}
            </span>
          )}
        </div>

        {(role === "HEALTH_WORKER" || role === "HOSPITAL_STAFF") && (
          <DiagnosticReportUploadPanel
            orderId={orderId}
            requiredDocuments={order.required_documents || []}
            existingReports={order.reports || []}
            disabled={saving}
            onUploaded={async (data) => {
              if (data?.requirements_met === false) {
                setMessage(data.message || t("diagnostics.reportsPartialRequirements"));
              } else {
                setMessage(data?.message || t("diagnostics.reportUploaded"));
              }
              await reloadOrder();
            }}
          />
        )}

        {(order.reports || []).length === 0 ? (
          <p className="diagnostics-empty">{t("diagnostics.noReports")}</p>
        ) : (
          <div className="diagnostics-reports-layout">
            <ul className="diagnostics-report-rail" aria-label={t("diagnostics.reportsTitle")}>
              {(order.reports || []).map((report) => {
                const active = viewer.reportId === report.id;
                const category = reportCategoryLabel(order, report);
                return (
                  <li key={report.id}>
                    <button
                      type="button"
                      className={`diagnostics-report-card${active ? " is-active" : ""}`}
                      onClick={() => openReportFile(report)}
                      disabled={viewer.loading && viewer.reportId === report.id}
                    >
                      <span className="diagnostics-report-card-icon" aria-hidden="true">
                        <FileText size={18} />
                      </span>
                      <span className="diagnostics-report-card-body">
                        <strong>{category || report.original_filename || t("diagnostics.viewReport")}</strong>
                        <span>{report.original_filename || report.mime_type}</span>
                        <span>{new Date(report.created_at).toLocaleString()}</span>
                        <span className="diagnostics-item-tags">
                          {category && <Badge tone="info">{category}</Badge>}
                          <Badge tone={reviewStatusTone(report.review_status)}>
                            {report.review_status}
                          </Badge>
                        </span>
                      </span>
                      <span className="diagnostics-report-card-action">
                        <Eye size={16} aria-hidden="true" />
                        {t("diagnostics.viewReport")}
                      </span>
                    </button>

                    {(role === "HEALTH_WORKER" || role === "HOSPITAL_STAFF")
                      && ["PENDING", "RETURNED"].includes(String(report.review_status || "").toUpperCase())
                      && (order.required_documents || []).length > 0 && (
                      <label className="diagnostics-category-select">
                        <span>{t("diagnostics.documentCategory")}</span>
                        <select
                          value={report.document_category || ""}
                          disabled={saving}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (!next || next === report.document_category) return;
                            updateReportCategory(report.id, next);
                          }}
                        >
                          <option value="" disabled>{t("diagnostics.chooseRequiredCategory")}</option>
                          {(order.required_documents || []).map((doc) => (
                            <option key={doc.code} value={doc.code}>{doc.label}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    {(role === "MEDICAL_OFFICER" || role === "SPECIALIST")
                      && canClinicianReview(report.review_status)
                      && String(report.review_status || "").toUpperCase() !== "REVIEWED" && (
                      <div className="diagnostics-form diagnostics-review-inline">
                        <label>
                          <span>{t("diagnostics.clinicalReviewNotes")}</span>
                          <textarea
                            rows={2}
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
                );
              })}
            </ul>

            <div className="diagnostics-report-stage" aria-live="polite">
              {viewer.loading && (
                <div className="diagnostics-report-stage-empty">
                  <PageLoader label={t("diagnostics.loadingReport")} />
                </div>
              )}
              {!viewer.loading && !viewer.url && (
                <div className="diagnostics-report-stage-empty">
                  <Eye size={28} aria-hidden="true" />
                  <p>{t("diagnostics.selectReportToView")}</p>
                </div>
              )}
              {!viewer.loading && viewer.url && (
                <>
                  <div className="diagnostics-report-stage-bar">
                    <div>
                      <strong>{viewer.name}</strong>
                      <span>{viewer.mime}</span>
                    </div>
                    <div className="diagnostics-actions">
                      <a
                        className="btn btn-secondary"
                        href={viewer.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("diagnostics.openInNewTab")}
                      </a>
                      <Button type="button" variant="secondary" onClick={closeReportViewer}>
                        <X size={16} aria-hidden="true" /> {t("diagnostics.closePreview")}
                      </Button>
                    </div>
                  </div>
                  {String(viewer.mime || "").startsWith("image/") ? (
                    <img
                      className="diagnostics-report-image"
                      src={viewer.url}
                      alt={viewer.name || t("diagnostics.viewReport")}
                    />
                  ) : (
                    <iframe
                      className="diagnostics-report-frame"
                      title={viewer.name || t("diagnostics.viewReport")}
                      src={viewer.url}
                    />
                  )}
                </>
              )}
            </div>
          </div>
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
