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
import OralScreeningReport from "../../components/OralScreeningReport";

// Read-only panels of a claimed patient's case (data from GET /medical-officer/patients/:id/case)
export default function CaseSummary({ data }) {
  const { t, language } = useLanguage();
  const { patient, consent, screening } = data;
  const yesNo = (value) => (value ? t("mo.yes") : t("mo.no"));
  const symptoms = data.findings.filter((finding) => finding.finding_kind === "SYMPTOM");
  const oralFindings = data.findings.filter((finding) => finding.finding_kind !== "SYMPTOM");
  const assessmentsByPhoto = new Map((data.ai_results || []).map((assessment) => [assessment.photo_id, assessment]));
  const reportPhotos = (data.photos || []).map((photo) => {
    const assessment = assessmentsByPhoto.get(photo.id);
    const details = assessment?.analysis_details || {};
    const failed = assessment && assessment.status !== "COMPLETED";
    return {
      ...details,
      ...photo,
      photo_id: photo.id,
      analysis_status: failed || details.analysis_status === "FAILED"
        ? "FAILED"
        : details.analysis_status || (assessment ? "COMPLETED" : "NOT_ANALYZED"),
      possible_visual_findings: failed ? [] : details.possible_visual_findings,
      observations: failed ? [] : details.observations,
      abnormalities: failed ? [] : details.abnormalities,
      status: assessment?.status || "NOT_ANALYZED",
      image_quality: details.image_quality || (
        photo.image_quality_status ? { status: photo.image_quality_status } : null
      ),
    };
  });

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
        {consent.screening && consent.image_capture && reportPhotos.length > 0 && (
          <OralScreeningReport
            photos={reportPhotos}
            screeningDate={screening?.screening_date}
            imagePathPrefix={`/medical-officer/patients/${patient.id}/images`}
            reviewComplete={Boolean(data.review?.signed_at)}
          />
        )}
        {consent.screening && consent.image_capture && !reportPhotos.length && (
          <p className="mo-empty">{t("mo.aiReviewNotPerformed")}</p>
        )}
        {!screening || !consent.screening || !consent.image_capture ? (
          <p className="mo-empty">{t("mo.aiReviewUnavailable")}</p>
        ) : null}
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
