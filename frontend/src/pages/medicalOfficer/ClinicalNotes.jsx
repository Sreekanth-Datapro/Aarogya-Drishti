import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilePenLine, History, PenLine, ShieldCheck } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedDateTime, getCaseStateLabel, getCodeLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Modal, PageLoader } from "../../components/ui";
import Pager from "./Pager";
import MoCaseSteps from "./MoCaseSteps";
import "./MedicalOfficer.css";

const AMEND_FIELDS = ["finding", "impression", "followup_instructions", "referral_reason", "request_note"];
const TAB_KEYS = { "": "mo.allNotes", draft: "mo.status_draft", signed: "mo.status_signed" };

// My clinical notes: drafts can be signed; signed notes are only changed by a
// signed amendment with a reason (the database keeps every version).
export default function ClinicalNotes() {
  const { t, tm, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPatient = searchParams.get("patient") || "";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [paging, setPaging] = useState({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [amend, setAmend] = useState(null);
  const [versions, setVersions] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/medical-officer/reviews", { params: { status: status || undefined, page } });
      setReviews(response.data.reviews || []);
      setPaging(response.data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const sign = async (review) => {
    if (!window.confirm(t("mo.confirmSign", { code: review.patient_code }))) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/medical-officer/patients/${review.patient_id}/review/sign`, { version: review.version });
      setMessage(t("mo.signed", { code: review.patient_code }));
      setPreview(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.signFailed"));
    } finally {
      setBusy(false);
    }
  };

  const openAmend = (review) => {
    const form = { amendment_reason: "" };
    AMEND_FIELDS.forEach((field) => { form[field] = review[field] || ""; });
    setAmend({ review, form });
  };

  const submitAmend = async () => {
    if (!window.confirm(t("mo.confirmAmend"))) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/medical-officer/reviews/${amend.review.id}/amend`, { ...amend.form, version: amend.review.version });
      setMessage(t("mo.amended", { code: amend.review.patient_code }));
      setAmend(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.signFailed"));
    } finally {
      setBusy(false);
    }
  };

  const openVersions = async (review) => {
    try {
      const response = await api.get(`/medical-officer/reviews/${review.id}/versions`);
      setVersions({ review, items: response.data.versions || [] });
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.loadFailed"));
    }
  };

  const updateAmend = (field, value) => setAmend((current) => ({ ...current, form: { ...current.form, [field]: value } }));

  // The case opened from Clinical review is listed first and highlighted
  const focused = reviews.filter((review) => review.patient_id === focusPatient);
  const ordered = focusPatient ? [...focused, ...reviews.filter((review) => review.patient_id !== focusPatient)] : reviews;
  const clearFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("patient");
    setSearchParams(next);
  };
  const canSign = (review) => !review.signed_at && review.case_state === "AWAITING_CLINICIAN";

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moClinicalNotes.title")}</h1>
          <p className="page-subtitle">{t("mo.notesSubtitle")}</p>
        </div>
        <Link className="btn btn-secondary" to={focusPatient ? `/medical-officer/review?patient=${encodeURIComponent(focusPatient)}` : "/medical-officer/review"}>
          <FilePenLine size={16} /> {t("mo.newNote")}
        </Link>
      </div>

      <MoCaseSteps />
      <Alert type="info">{t("mo.signedRecordsNote")}</Alert>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      {focused.length > 0 && (
        <div className="mo-focus-banner">
          <span>{t("mo.focusedCaseNotes", { code: focused[0].patient_code })}</span>
          <Button type="button" size="sm" variant="ghost" onClick={clearFocus}>{t("mo.showAllNotes")}</Button>
        </div>
      )}

      <div className="mo-tabs" role="tablist">
        {["", "draft", "signed"].map((value) => (
          <button key={value || "all"} type="button" role="tab" aria-selected={status === value}
            className={status === value ? "active" : ""} onClick={() => { setStatus(value); setPage(1); }}>
            {t(TAB_KEYS[value])}
          </button>
        ))}
      </div>

      <section className="mo-card">
        {loading ? <PageLoader label={t("common.loading")} /> : (
          <div className="mo-table-wrap">
            <table className="mo-table">
              <thead>
                <tr>
                  <th>{t("mo.patient")}</th>
                  <th>{t("mo.decision")}</th>
                  <th>{t("mo.noteStatus")}</th>
                  <th>{t("mo.version")}</th>
                  <th>{t("mo.updated")}</th>
                  <th>{t("mo.action")}</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((review) => (
                  <tr key={review.id} className={[
                    review.signed_at ? "mo-row-signed" : "mo-row-draft",
                    review.patient_id === focusPatient ? "mo-row-focus" : "",
                  ].join(" ").trim()}>
                    <td data-label={t("mo.patient")}>
                      <span className="mono">{review.patient_code}</span>
                      <small className="mo-secondary">{formatLocalizedDate(review.screening_date, language)} · {getCaseStateLabel(review.case_state, language)}</small>
                      {review.finding && <small className="mo-note-snippet">{review.finding}</small>}
                    </td>
                    <td data-label={t("mo.decision")}>{review.decision ? getCodeLabel("reviewDecisions", review.decision, language) : "-"}</td>
                    <td data-label={t("mo.noteStatus")}>
                      <Badge tone={review.signed_at ? "success" : "warning"}>{t(review.signed_at ? "mo.status_signed" : "mo.status_draft")}</Badge>
                      {review.amendment_reason && <small className="mo-secondary">{t("mo.amendedBadge")}</small>}
                    </td>
                    <td data-label={t("mo.version")}>{review.version}</td>
                    <td data-label={t("mo.updated")}>{formatLocalizedDateTime(review.updated_at, language)}</td>
                    <td data-label={t("mo.action")}>
                      <div className="mo-actions">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setPreview(review)}>{t("mo.preview")}</Button>
                        {canSign(review) && (
                          <Button type="button" size="sm" onClick={() => sign(review)} disabled={busy}><ShieldCheck size={14} /> {t("mo.sign")}</Button>
                        )}
                        {review.signed_at && (
                          review.decision === "REQUEST_RECAPTURE" && review.case_state === "AWAITING_CLINICIAN" ? (
                            <Link className="btn btn-sm btn-secondary" to={`/medical-officer/review?patient=${encodeURIComponent(review.patient_id)}`}>
                              <PenLine size={14} /> {t("mo.reviewRecaptureSubmission")}
                            </Link>
                          ) : (
                            <Button type="button" size="sm" variant="secondary" onClick={() => openAmend(review)}>
                              <PenLine size={14} /> {t("mo.amend")}
                            </Button>
                          )
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => openVersions(review)}><History size={14} /> {t("mo.versions")}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!reviews.length && <tr><td colSpan="6" className="mo-empty">{t("mo.noNotes")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pager paging={paging} onPage={setPage} disabled={loading} />
      </section>

      <Modal open={Boolean(preview)} title={t("mo.preview")} onClose={() => setPreview(null)} className="mo-wide-modal"
        footer={preview && canSign(preview) && (
          <Button type="button" onClick={() => sign(preview)} loading={busy}><ShieldCheck size={15} /> {t("mo.sign")}</Button>
        )}>
        {preview && (
          <>
            <div className="mo-chip-row mo-preview-chips">
              <Badge tone={preview.signed_at ? "success" : "warning"}>{t(preview.signed_at ? "mo.status_signed" : "mo.status_draft")}</Badge>
              <Badge tone="neutral">{t("mo.versionValue", { version: preview.version })}</Badge>
              {preview.case_state && <Badge tone="info">{getCaseStateLabel(preview.case_state, language)}</Badge>}
            </div>
            <dl className="mo-details">
              <dt>{t("mo.patientCode")}</dt><dd className="mono">{preview.patient_code}</dd>
              <dt>{t("mo.finding")}</dt><dd className="mo-pre">{preview.finding}</dd>
              <dt>{t("mo.impression")}</dt><dd className="mo-pre">{preview.impression || "-"}</dd>
              <dt>{t("mo.aiAgreement")}</dt><dd>{getCodeLabel("aiAgreements", preview.ai_agreement, language)}</dd>
              <dt>{t("mo.decision")}</dt><dd>{preview.decision ? getCodeLabel("reviewDecisions", preview.decision, language) : "-"}</dd>
              {preview.followup_instructions && <><dt>{t("mo.followupInstructions")}</dt><dd className="mo-pre">{preview.followup_instructions}</dd></>}
              {preview.referral_reason && <><dt>{t("mo.referralReason")}</dt><dd className="mo-pre">{preview.referral_reason}</dd></>}
              {preview.request_note && <><dt>{t("mo.requestNote")}</dt><dd className="mo-pre">{preview.request_note}</dd></>}
              <dt>{t("mo.signedAt")}</dt><dd>{preview.signed_at ? formatLocalizedDateTime(preview.signed_at, language) : t("mo.status_draft")}</dd>
            </dl>
          </>
        )}
      </Modal>

      <Modal open={Boolean(amend)} title={t("mo.amendTitle")} onClose={() => setAmend(null)} className="mo-wide-modal"
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setAmend(null)}>{t("common.cancel")}</Button>
          <Button type="button" onClick={submitAmend} loading={busy} disabled={!amend?.form.amendment_reason.trim() || !amend?.form.finding.trim()}>{t("mo.signAmendment")}</Button>
        </>}>
        {amend && (
          <div className="mo-form">
            <label className="mo-span-2">{t("mo.amendmentReason")} *
              <textarea rows={2} value={amend.form.amendment_reason} onChange={(event) => updateAmend("amendment_reason", event.target.value)} />
            </label>
            <label className="mo-span-2">{t("mo.finding")} *
              <textarea rows={4} value={amend.form.finding} onChange={(event) => updateAmend("finding", event.target.value)} />
            </label>
            <label className="mo-span-2">{t("mo.impression")}
              <textarea rows={2} value={amend.form.impression} onChange={(event) => updateAmend("impression", event.target.value)} />
            </label>
            {amend.review.decision === "ROUTINE_FOLLOW_UP" && (
              <label className="mo-span-2">{t("mo.followupInstructions")}
                <textarea rows={2} value={amend.form.followup_instructions} onChange={(event) => updateAmend("followup_instructions", event.target.value)} />
              </label>
            )}
            {["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(amend.review.decision) && (
              <label className="mo-span-2">{t("mo.referralReason")}
                <textarea rows={2} value={amend.form.referral_reason} onChange={(event) => updateAmend("referral_reason", event.target.value)} />
              </label>
            )}
            {["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(amend.review.decision) && (
              <label className="mo-span-2">{t("mo.requestNote")}
                <textarea rows={2} value={amend.form.request_note} onChange={(event) => updateAmend("request_note", event.target.value)} />
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(versions)} title={t("mo.versions")} onClose={() => setVersions(null)}>
        {versions && (
          <ol className="mo-timeline">
            {versions.items.map((item) => (
              <li key={item.version_no}>
                <strong>{t("mo.versionValue", { version: item.version_no })} · {item.signed_at ? t("mo.status_signed") : t("mo.status_draft")}</strong>
                <small>{formatLocalizedDateTime(item.edited_at, language)}{item.amendment_reason ? ` · ${item.amendment_reason}` : ""}</small>
              </li>
            ))}
            {!versions.items.length && <li className="mo-empty">{t("mo.noVersions")}</li>}
          </ol>
        )}
      </Modal>
    </div>
  );
}
