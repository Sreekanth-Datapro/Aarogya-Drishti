import React from "react";
import { Bot, CalendarClock, ClipboardCheck, ShieldCheck, User } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  getCaseStateLabel,
  getCodeLabel,
  getLocalizedField,
  getSexLabel,
} from "../../i18n/displayLabels";
import { Badge } from "../../components/ui";

// Read-only panels of a claimed patient's case (data from GET /medical-officer/patients/:id/case)
export default function CaseSummary({ data }) {
  const { t, language } = useLanguage();
  const { patient, consent, screening } = data;
  const yesNo = (value) => (value ? t("mo.yes") : t("mo.no"));
  const symptoms = data.findings.filter((finding) => finding.finding_kind === "SYMPTOM");
  const oralFindings = data.findings.filter((finding) => finding.finding_kind !== "SYMPTOM");

  return (
    <div className="mo-summary-grid">
      <section className="mo-card">
        <h2 className="mo-card-title"><User size={16} /> {t("mo.patientInfo")}</h2>
        {consent.screening ? (
          <dl className="mo-details">
              <dt>{t("mo.name")}</dt><dd>{patient.full_name}</dd>
              <dt>{t("mo.ageSex")}</dt><dd>{patient.age_years == null ? "-" : formatLocalizedNumber(patient.age_years, language)} · {getSexLabel(patient.sex, language)}</dd>
              <dt>{t("mo.village")}</dt><dd>{getLocalizedField(patient, "village_name", language)}</dd>
              <dt>{t("mo.mandal")}</dt><dd>{getLocalizedField(patient, "mandal_name", language)}</dd>
              <dt>{t("mo.facility")}</dt><dd>{getLocalizedField(patient, "facility_name", language)}</dd>
              <dt>{t("mo.registeredOn")}</dt><dd>{formatLocalizedDate(patient.registered_at, language)}</dd>
          </dl>
        ) : (
          <p className="mo-warning">{t("mo.patientInfoHidden")}</p>
        )}
      </section>

      <section className="mo-card">
        <h2 className="mo-card-title"><ShieldCheck size={16} /> {t("mo.consent")}</h2>
        <div className="mo-chip-row">
          <Badge tone={consent.screening ? "success" : "danger"}>{t("mo.screeningConsent")}: {yesNo(consent.screening)}</Badge>
          <Badge tone={consent.image_capture ? "success" : "danger"}>{t("mo.imageConsent")}: {yesNo(consent.image_capture)}</Badge>
        </div>
        <ul className="mo-list">
          {consent.history.map((item, index) => (
            <li key={`${item.purpose}-${index}`}>
              <span>{getLocalizedField(item, "purpose_name", language)} · {item.granted ? t("mo.granted") : t("mo.withdrawn")}</span>
              <small>{item.consent_version} · {formatLocalizedDateTime(item.captured_at, language)}</small>
            </li>
          ))}
          {!consent.history.length && <li className="mo-empty">{t("mo.noConsent")}</li>}
        </ul>
      </section>

      <section className="mo-card">
        <h2 className="mo-card-title"><ClipboardCheck size={16} /> {t("mo.screening")}</h2>
        {!consent.screening && <p className="mo-warning">{t("mo.screeningHidden")}</p>}
        {!screening && consent.screening && <p className="mo-empty">{t("mo.noScreenings")}</p>}
        {screening && consent.screening && (
          <>
            <dl className="mo-details">
              <dt>{t("mo.screeningDate")}</dt><dd>{formatLocalizedDate(screening.screening_date, language)}</dd>
              <dt>{t("mo.caseState")}</dt><dd>{getCaseStateLabel(screening.case_state, language)}</dd>
              <dt>{t("mo.chiefComplaint")}</dt><dd>{screening.chief_complaint || "-"}</dd>
              <dt>{t("mo.tobacco")}</dt><dd>{screening.tobacco_current == null ? "-" : yesNo(screening.tobacco_current)}</dd>
              <dt>{t("mo.examDone")}</dt><dd>{yesNo(screening.clinical_exam_done)}</dd>
              <dt>{t("mo.hwNotes")}</dt><dd>{screening.notes || "-"}</dd>
            </dl>
            <h3 className="mo-subtitle">{t("mo.symptoms")}</h3>
            <p className="mo-muted">{t("mo.symptomsSeparateNote")}</p>
            <ul className="mo-list">
              {symptoms.map((finding) => (
                <li key={finding.id}>
                  <span>{getLocalizedField(finding, "symptom_name", language) || finding.description || "-"}</span>
                  <small>{finding.duration_days != null ? t("mo.durationDays", { days: formatLocalizedNumber(finding.duration_days, language) }) : ""}</small>
                </li>
              ))}
              {!symptoms.length && <li className="mo-empty">{t("mo.noFindings")}</li>}
            </ul>
            <h3 className="mo-subtitle">{t("mo.oralExaminationFindings")}</h3>
            <ul className="mo-list">
              {oralFindings.map((finding) => (
                <li key={finding.id}>
                  <span>
                    {finding.oral_site && `${getCodeLabel("oralViews", finding.oral_site, language)} · `}
                    {finding.description || getLocalizedField(finding, "symptom_name", language) || "-"}
                  </span>
                  <small>{finding.duration_days != null ? t("mo.durationDays", { days: formatLocalizedNumber(finding.duration_days, language) }) : ""}</small>
                </li>
              ))}
              {!oralFindings.length && <li className="mo-empty">{t("mo.noFindings")}</li>}
            </ul>
            <h3 className="mo-subtitle">{t("mo.history")}</h3>
            <ul className="mo-list">
              {data.histories.map((item, index) => (
                <li key={index}>
                  <span>{getLocalizedField(item, "exposure_name", language) || item.condition_text}</span>
                  <small>
                    {item.is_current != null && `${item.is_current ? t("mo.currentHistory") : t("mo.pastHistory")} · `}
                    {item.frequency_per_day != null && `${t("mo.frequencyPerDay", { count: formatLocalizedNumber(item.frequency_per_day, language) })} · `}
                    {item.duration_years != null && `${t("mo.durationYears", { years: formatLocalizedNumber(item.duration_years, language) })} · `}
                    {item.event_date ? formatLocalizedDate(item.event_date, language) : ""}
                  </small>
                </li>
              ))}
              {!data.histories.length && <li className="mo-empty">{t("mo.noHistory")}</li>}
            </ul>
          </>
        )}
      </section>

      <section className="mo-card mo-ai-card">
        <h2 className="mo-card-title"><Bot size={16} /> {t("mo.aiTitle")}</h2>
        <p className="mo-warning">{t("mo.aiWarning")}</p>
        <ul className="mo-list">
          {consent.screening && consent.image_capture && data.ai_results.map((ai) => (
            <li key={ai.id}>
              <span>
                <strong>{t(`mo.aiReviewStatuses.${ai.status}`)}</strong>
                {ai.analysis_details?.view && ` · ${getCodeLabel("photoViews", ai.analysis_details.view, language)}`}
                {ai.analysis_details?.classification
                  ? ` · ${t(`mo.aiClassifications.${ai.analysis_details.classification}`)}`
                  : ai.result_label ? ` · ${getCodeLabel("aiResults", ai.result_label, language)}` : ""}
              </span>
              <small>
                {ai.image_quality_status && `${t("mo.imageQuality")}: ${getCodeLabel("qualityStatuses", ai.image_quality_status, language)} · `}
                {ai.score != null && `${t("mo.aiScore")}: ${formatLocalizedNumber(Number(ai.score) * 100, language)}/100 · `}
                {ai.completed_at ? formatLocalizedDateTime(ai.completed_at, language) : ""}
              </small>
              {ai.analysis_details && (
                <div className="mo-ai-result-details">
                  {ai.analysis_details.selected_category && (
                    <p><strong>{t("mo.aiCategory")}:</strong> {ai.analysis_details.selected_category}</p>
                  )}
                  {ai.analysis_details.model_status && (
                    <p><strong>{t("mo.aiModelStatus")}:</strong> {ai.analysis_details.model_status}</p>
                  )}
                  {Array.isArray(ai.analysis_details.possible_visual_findings)
                    && ai.analysis_details.possible_visual_findings.length > 0 && (
                    <ul>
                      {ai.analysis_details.possible_visual_findings.map((finding) => (
                        <li key={`${ai.id}-${finding.feature}`}>
                          {finding.feature}: {finding.scale}
                          {finding.note ? ` — ${finding.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {ai.analysis_details.not_assessable_reason && (
                    <p>{ai.analysis_details.not_assessable_reason}</p>
                  )}
                  {(!ai.analysis_details.possible_visual_findings
                    || ai.analysis_details.possible_visual_findings.length === 0)
                    && ai.analysis_details.observations?.length > 0 && (
                    <p><strong>{t("mo.aiObservations")}:</strong> {ai.analysis_details.observations.join(" · ")}</p>
                  )}
                  {ai.analysis_details.uncertainty_warnings?.map((warning) => (
                    <p className="mo-warning" key={warning}>{t(`mo.aiWarnings.${warning}`)}</p>
                  ))}
                  {ai.analysis_details.recommendation && (
                    <p><strong>{t("mo.aiRecommendation")}:</strong> {ai.analysis_details.recommendation}</p>
                  )}
                  {ai.model_provider && (
                    <small>{t("mo.aiModel")}: {ai.model_provider} · {ai.model_version}</small>
                  )}
                  {ai.analysis_details.screening_reference && (
                    <small>{t("mo.aiScreeningReference")}: {ai.analysis_details.screening_reference}</small>
                  )}
                  <small>{t("mo.clinicalReviewStatus")}: {t("mo.aiPendingReview")}</small>
                  <p className="mo-muted">{t("mo.aiOriginalEvidenceNote")}</p>
                </div>
              )}
            </li>
          ))}
          {(!screening || !consent.screening || !consent.image_capture) && (
            <li className="mo-empty">{t("mo.aiReviewUnavailable")}</li>
          )}
          {screening && consent.screening && consent.image_capture && !data.ai_results.length && (
            <li className="mo-empty">{t("mo.aiReviewNotPerformed")}</li>
          )}
        </ul>
      </section>

      <section className="mo-card mo-span-2">
        <h2 className="mo-card-title"><CalendarClock size={16} /> {t("mo.timeline")}</h2>
        <ol className="mo-timeline">
          {consent.screening && data.timeline.map((event, index) => (
            <li key={`${event.event_type}-${index}`}>
              <strong>{getCodeLabel("timelineEvents", event.event_type, language)}</strong>
              <small>{formatLocalizedDateTime(event.event_time, language)}</small>
            </li>
          ))}
          {(!consent.screening || !data.timeline.length) && <li className="mo-empty">{t("mo.noTimeline")}</li>}
        </ol>
      </section>
    </div>
  );
}
