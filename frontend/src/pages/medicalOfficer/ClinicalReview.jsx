import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, ClipboardList, Gavel, Save, Send, Stethoscope } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, getCaseStateLabel, getCodeLabel, getLabelCodes, getLocalizedField } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, EmptyState, PageLoader } from "../../components/ui";
import CasePicker from "./CasePicker";
import CaseSummary from "./CaseSummary";
import MoCaseSteps from "./MoCaseSteps";
import "./MedicalOfficer.css";

const EMPTY_REVIEW = {
  finding: "",
  impression: "",
  ai_assessment_id: "",
  ai_agreement: "NOT_AVAILABLE",
  ai_discrepancy_note: "",
  decision: "",
  followup_instructions: "",
  referral_reason: "",
  request_note: "",
};

function toForm(review) {
  if (!review) return EMPTY_REVIEW;
  const form = { ...EMPTY_REVIEW };
  Object.keys(EMPTY_REVIEW).forEach((key) => { form[key] = review[key] || EMPTY_REVIEW[key]; });
  return form;
}

// One line about the chosen case: who, where, which screening and the note status
function CaseHeader({ data }) {
  const { t, language } = useLanguage();
  const { patient, consent, screening, review } = data;
  let reviewBadge = <Badge tone="neutral">{t("mo.reviewNotStarted")}</Badge>;
  if (review?.signed_at) reviewBadge = <Badge tone="success">{t("mo.reviewSignedVersion", { version: review.version })}</Badge>;
  else if (review) reviewBadge = <Badge tone="warning">{t("mo.reviewDraftVersion", { version: review.version })}</Badge>;

  return (
    <section className="mo-case-header">
      <div className="mo-case-avatar" aria-hidden="true"><Stethoscope size={20} /></div>
      <div className="mo-case-identity">
        <strong className="mono">{patient.patient_code}</strong>
        {consent.screening && (
          <span>
            {patient.full_name}
            {getLocalizedField(patient, "village_name", language) ? ` · ${getLocalizedField(patient, "village_name", language)}` : ""}
          </span>
        )}
      </div>
      <div className="mo-case-badges">
        {consent.screening && screening && (
          <>
            <Badge tone="info">{t("mo.screeningDate")}: {formatLocalizedDate(screening.screening_date, language)}</Badge>
            <Badge tone="neutral">{getCaseStateLabel(screening.case_state, language)}</Badge>
          </>
        )}
        {reviewBadge}
      </div>
    </section>
  );
}

// Clinical review of a claimed case: read the permitted history and record
// independent observations. Signing happens on the Clinical Notes & Sign-off page.
export default function ClinicalReview() {
  const { t, tm, language } = useLanguage();
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState("");
  const [caseCount, setCaseCount] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY_REVIEW);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const requestId = loadId.current + 1;
    loadId.current = requestId;
    setData(null);
    setForm(EMPTY_REVIEW);
    if (!patientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/medical-officer/patients/${patientId}/case`);
      if (requestId !== loadId.current) return;
      const caseData = response.data.case;
      const nextForm = toForm(caseData.review);
      if (caseData.review?.signed_at
          && ["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(caseData.review.decision)
          && caseData.screening?.case_state === "AWAITING_CLINICIAN") {
        nextForm.ai_assessment_id = "";
        nextForm.ai_agreement = "NOT_AVAILABLE";
        nextForm.ai_discrepancy_note = "";
      }
      setData(caseData);
      setForm(nextForm);
      setAmendmentReason("");
    } catch (requestError) {
      if (requestId !== loadId.current) return;
      setData(null);
      setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      if (requestId === loadId.current) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
    return () => { loadId.current += 1; };
  }, [load]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (goToSignOff) => {
    const returnedRereview = data?.review?.signed_at
      && ["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(data.review.decision)
      && data.screening?.case_state === "AWAITING_CLINICIAN";
    const moreInfoRereview = data?.review?.decision === "REQUEST_MORE_INFO";
    if (returnedRereview && !window.confirm(t(
      moreInfoRereview ? "mo.confirmMoreInfoRereview" : "mo.confirmRecaptureRereview"
    ))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (returnedRereview) {
        const body = { ...form, amendment_reason: amendmentReason, version: data.review.version };
        Object.keys(body).forEach((key) => { if (body[key] === "") body[key] = null; });
        await api.post(`/medical-officer/reviews/${data.review.id}/amend`, body);
        setMessage(t(moreInfoRereview ? "mo.moreInfoRereviewSigned" : "mo.recaptureRereviewSigned"));
        await load();
        return;
      }
      const body = { ...form, version: data.review?.version };
      Object.keys(body).forEach((key) => { if (body[key] === "") body[key] = null; });
      await api.put(`/medical-officer/patients/${patientId}/review`, body);
      if (goToSignOff) {
        navigate(`/medical-officer/notes?patient=${patientId}`);
        return;
      }
      setMessage(t("mo.draftSaved"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, "mo.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const review = data?.review;
  const signed = Boolean(review?.signed_at);
  const hasScreeningConsent = data?.consent?.screening === true;
  const returnedRereview = signed && ["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(review.decision)
    && data?.screening?.case_state === "AWAITING_CLINICIAN";
  const moreInfoRereview = returnedRereview && review.decision === "REQUEST_MORE_INFO";
  const canEdit = hasScreeningConsent && data?.screening?.case_state === "AWAITING_CLINICIAN"
    && (!signed || returnedRereview);
  const canSignRecaptureRereview = Boolean(
    amendmentReason.trim()
    && form.finding.trim()
    && form.decision
    && (form.decision !== "ROUTINE_FOLLOW_UP" || form.followup_instructions.trim())
    && (!["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(form.decision) || form.referral_reason.trim())
    && (!["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(form.decision) || form.request_note.trim())
    && (form.ai_agreement !== "DISAGREE" || form.ai_discrepancy_note.trim())
    && (form.ai_agreement === "NOT_AVAILABLE" || form.ai_assessment_id)
  );
  const decisionOptions = getLabelCodes("reviewDecisions");
  // Each AI result belongs to one photo; name the view so the options can be told apart
  const aiOptionLabel = (ai) => {
    const view = ai.analysis_details?.view ? `${getCodeLabel("photoViews", ai.analysis_details.view, language)} · ` : "";
    const result = ai.analysis_details?.classification
      ? t(`mo.aiClassifications.${ai.analysis_details.classification}`)
      : getCodeLabel("aiResults", ai.result_label, language);
    return `${view}${result}`;
  };
  const selectedAi = data?.ai_results?.find((ai) => ai.id === form.ai_assessment_id) || null;
  const selectedAiDetails = selectedAi?.analysis_details || null;

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moClinicalReview.title")}</h1>
          <p className="page-subtitle">{t("mo.reviewSubtitle")}</p>
        </div>
      </div>

      <MoCaseSteps />
      <section className="mo-card mo-toolbar"><CasePicker onChange={setPatientId} onLoaded={setCaseCount} /></section>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      {loading && <PageLoader label={t("common.loading")} />}

      {!patientId && !loading && caseCount > 0 && (
        <EmptyState icon={ClipboardList} title={t("mo.chooseCaseToStart")} text={t("mo.chooseCaseToStartText")} />
      )}

      {data && !loading && (
        <>
          <CaseHeader data={data} />

          <div className="mo-review-layout">
            <div className="mo-review-main">
              <CaseSummary data={data} />
            </div>

            <aside className="mo-review-side">
              <section className="mo-card mo-assessment-card">
                <h2 className="mo-card-title">{t("mo.observations")}</h2>
                {!hasScreeningConsent ? (
                  <Alert type="warning">{t("mo.reviewConsentRequired")}</Alert>
                ) : (
                  <>
                    {signed && (
                      <Alert type="info">
                        {t(
                          returnedRereview
                            ? moreInfoRereview
                              ? "mo.reviewReturnedMoreInfoNote"
                              : "mo.reviewReturnedRecaptureNote"
                            : "mo.reviewSignedNote"
                        )}{" "}
                        <Link to={`/medical-officer/notes?patient=${patientId}`}>{t("mo.openSignOff")}</Link>
                      </Alert>
                    )}
                    {!canEdit && !signed && <Alert type="warning">{t("mo.notAwaitingReview")}</Alert>}

                    <fieldset className="mo-form mo-form-stack" disabled={!canEdit || saving}>
                      {returnedRereview && (
                        <label>{t("mo.amendmentReason")} *
                          <textarea rows={2} value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} />
                        </label>
                      )}
                      <h3 className="mo-form-section"><Stethoscope size={15} aria-hidden="true" /> {t("mo.sectionFindings")}</h3>
                      <label>{t("mo.finding")} *
                        <textarea rows={4} value={form.finding} onChange={(event) => update("finding", event.target.value)} />
                      </label>
                      <label>{t("mo.impression")}
                        <textarea rows={3} value={form.impression} onChange={(event) => update("impression", event.target.value)} />
                      </label>

                      <h3 className="mo-form-section"><Bot size={15} aria-hidden="true" /> {t("mo.sectionAi")}</h3>
                      <p className="mo-muted mo-span-2">{t("mo.symptomsSeparateNote")}</p>
                      <label>{t("mo.aiCompared")}
                        <select value={form.ai_assessment_id} onChange={(event) => update("ai_assessment_id", event.target.value)}>
                          <option value="">{t("mo.noAiSelected")}</option>
                          {data.ai_results.filter((ai) => ai.status === "COMPLETED").map((ai) => (
                            <option key={ai.id} value={ai.id}>{aiOptionLabel(ai)}</option>
                          ))}
                        </select>
                      </label>
                      {selectedAiDetails && (
                        <div className="mo-ai-result-details mo-span-2">
                          {selectedAiDetails.selected_category && (
                            <p><strong>{t("mo.aiCategory")}:</strong> {selectedAiDetails.selected_category}</p>
                          )}
                          {selectedAiDetails.model_status && (
                            <p><strong>{t("mo.aiModelStatus")}:</strong> {selectedAiDetails.model_status}</p>
                          )}
                          {Array.isArray(selectedAiDetails.possible_visual_findings)
                            && selectedAiDetails.possible_visual_findings.length > 0 && (
                            <ul>
                              {selectedAiDetails.possible_visual_findings.map((finding) => (
                                <li key={`${selectedAi.id}-${finding.feature}`}>
                                  {finding.feature}: {finding.scale}
                                  {finding.note ? ` — ${finding.note}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                          {selectedAiDetails.not_assessable_reason && <p>{selectedAiDetails.not_assessable_reason}</p>}
                          <p className="mo-muted">{t("mo.aiOriginalEvidenceNote")}</p>
                        </div>
                      )}
                      <p className="mo-muted mo-span-2">{t("mo.aiOptionalSupport")}</p>
                      <label>{t("mo.aiAgreement")}
                        <select value={form.ai_agreement} onChange={(event) => update("ai_agreement", event.target.value)}>
                          {getLabelCodes("aiAgreements").map((code) => <option key={code} value={code}>{getCodeLabel("aiAgreements", code, language)}</option>)}
                        </select>
                      </label>
                      {form.ai_agreement === "DISAGREE" && (
                        <label>{t("mo.aiDiscrepancy")} *
                          <textarea rows={2} value={form.ai_discrepancy_note} onChange={(event) => update("ai_discrepancy_note", event.target.value)} />
                        </label>
                      )}

                      <h3 className="mo-form-section"><Gavel size={15} aria-hidden="true" /> {t("mo.sectionDecision")}</h3>
                      <label>{t("mo.decision")}
                        <select value={form.decision} onChange={(event) => update("decision", event.target.value)}>
                          <option value="">{t("mo.chooseDecision")}</option>
                          {decisionOptions.map((code) => <option key={code} value={code}>{getCodeLabel("reviewDecisions", code, language)}</option>)}
                        </select>
                      </label>
                      {form.decision === "URGENT_REFERRAL" && (
                        <div className="mo-span-2">
                          <Alert type="error">{t("specialist.emergencyWarning")}</Alert>
                        </div>
                      )}
                      {form.decision === "ROUTINE_FOLLOW_UP" && (
                        <label>{t("mo.followupInstructions")} *
                          <textarea rows={2} value={form.followup_instructions} onChange={(event) => update("followup_instructions", event.target.value)} />
                        </label>
                      )}
                      {["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(form.decision) && (
                        <label>{t("mo.referralReason")} *
                          <textarea rows={2} value={form.referral_reason} onChange={(event) => update("referral_reason", event.target.value)} />
                        </label>
                      )}
                      {["REQUEST_RECAPTURE", "REQUEST_MORE_INFO"].includes(form.decision) && (
                        <label>{t("mo.requestNote")} *
                          <textarea rows={2} value={form.request_note} onChange={(event) => update("request_note", event.target.value)} />
                        </label>
                      )}
                    </fieldset>

                    {canEdit && returnedRereview && (
                      <div className="mo-actions mo-sticky-actions">
                        <Button type="button" loading={saving} onClick={() => save(false)} disabled={!canSignRecaptureRereview}>
                          <Send size={15} /> {t("mo.signRecaptureRereview")}
                        </Button>
                      </div>
                    )}
                    {canEdit && !returnedRereview && (
                      <div className="mo-actions mo-sticky-actions">
                        <Button type="button" variant="secondary" loading={saving} onClick={() => save(false)} disabled={!form.finding.trim()}>
                          <Save size={15} /> {t("mo.saveDraft")}
                        </Button>
                        <Button type="button" loading={saving} onClick={() => save(true)} disabled={!form.finding.trim() || !form.decision}>
                          <Send size={15} /> {t("mo.submitForSignOff")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
