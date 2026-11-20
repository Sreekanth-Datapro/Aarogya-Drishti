import React, { useEffect, useState } from "react";
import { AlertCircle, ImageOff, ShieldCheck } from "lucide-react";
import { fetchPrivateImageObjectUrl } from "../services/privateImageBlob";
import { useLanguage } from "../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedNumber, getCodeLabel } from "../i18n/displayLabels";
import {
  classifyOralScreening,
  getAnalyzedImageCount,
  getAnalysisStatus,
  hasUsableAiOutput,
  getPotentialFindings,
  getReportFindings,
  getFindingState,
  ORAL_SCREENING_VIEWS,
} from "./oralScreeningReportUtils";
import "./OralScreeningReport.css";

function ReportImage({ image, loadedImage }) {
  const { t, language } = useLanguage();
  const src = image.previewUrl || loadedImage;
  if (!src) {
    return (
      <div className="oral-report-image-empty" role="img" aria-label={t("screening.report.previewUnavailable")}>
        <ImageOff size={26} />
        <span>{t("screening.report.previewUnavailable")}</span>
      </div>
    );
  }
  return (
    <figure className="oral-report-preview">
      <img src={src} alt={t("screening.report.previewAlt", {
        view: getCodeLabel("photoViews", image.view, language),
      })} />
      <figcaption>{t("screening.report.originalImage")}</figcaption>
    </figure>
  );
}

export default function OralScreeningReport({
  photos = [],
  screeningDate,
  imagePathPrefix = "",
  reviewComplete = false,
}) {
  const { t, language } = useLanguage();
  const [privateImages, setPrivateImages] = useState({});
  const photoSignature = JSON.stringify(photos.map((photo) => ({
    photoId: photo.photo_id || photo.id || "",
    hasPreview: Boolean(photo.previewUrl),
  })));

  useEffect(() => {
    if (!imagePathPrefix || !photoSignature) return undefined;
    let active = true;
    const urls = [];
    setPrivateImages({});
    (async () => {
      const entries = await Promise.all(JSON.parse(photoSignature).map(async ({ photoId, hasPreview }) => {
        if (!photoId || hasPreview) return [photoId, null];
        try {
          const url = await fetchPrivateImageObjectUrl(
            `${imagePathPrefix}/${photoId}/file`,
            { timeout: 180000 }
          );
          if (!active) {
            URL.revokeObjectURL(url);
            return [photoId, null];
          }
          urls.push(url);
          return [photoId, url];
        } catch {
          return [photoId, null];
        }
      }));
      if (active) setPrivateImages(Object.fromEntries(entries.filter(([, url]) => url)));
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePathPrefix, photoSignature]);

  if (!photos.length) return null;

  const byView = new Map(photos.map((photo) => [photo.view, photo]));
  const missingViews = ORAL_SCREENING_VIEWS.filter((view) => !byView.has(view));
  const overallStatus = classifyOralScreening(photos);
  const potentialFindings = getPotentialFindings(photos);
  const categories = [...new Set(photos.map((photo) => photo.selected_category).filter(Boolean))];
  const analyzedCount = getAnalyzedImageCount(photos);
  const unassessedImages = photos.filter((photo) => getAnalysisStatus(photo) !== "COMPLETED");
  const findingStateLabel = (state) => t(`screening.report.findingStates.${state}`);
  const viewLabel = (view) => getCodeLabel("photoViews", view, language);
  const featureLabel = (feature) => {
    const key = `screening.aiFeatures.${feature}`;
    return t(key) === key ? feature : t(key);
  };
  const qualityLabel = (image) => {
    const status = image.image_quality?.status;
    if (status === "ACCEPTABLE") return t("screening.report.qualityAcceptable");
    if (status === "RECAPTURE") return t("screening.report.qualityRetake");
    return t("screening.report.qualityUnavailable");
  };
  const missingViewNames = missingViews.map(viewLabel).join(", ");
  const statusTone = overallStatus.toLowerCase().replace(/_/g, "-");

  return (
    <section className="oral-report" aria-label={t("screening.report.title")}>
      <header className="oral-report-header">
        <div>
          <p className="oral-report-kicker"><ShieldCheck size={16} /> {t("screening.report.title")}</p>
          <h2>{t("screening.report.finalStatus")}</h2>
        </div>
        <strong className={`oral-report-status ${statusTone}`}>
          {t(`screening.report.status.${overallStatus}`)}
        </strong>
      </header>

      <section className="oral-report-section">
        <h3>{t("screening.report.summaryHeading")}</h3>
        <dl className="oral-report-summary">
          <dt>{t("screening.report.screeningDate")}</dt>
          <dd>{screeningDate ? formatLocalizedDate(screeningDate, language) : t("screening.report.notAvailable")}</dd>
          <dt>{t("screening.report.selectedCategory")}</dt>
          <dd>{categories.length
            ? categories.map((category) => t(`screening.imageCategories.${category}`)).join(", ")
            : t("screening.report.notAvailable")}</dd>
          <dt>{t("screening.report.imagesUploaded")}</dt>
          <dd>{formatLocalizedNumber(photos.length, language)}</dd>
          <dt>{t("screening.report.imagesAnalyzed")}</dt>
          <dd>{formatLocalizedNumber(analyzedCount, language)}</dd>
          <dt>{t("screening.report.missingViews")}</dt>
          <dd>{missingViewNames || t("screening.report.none")}</dd>
        </dl>
      </section>

      <section className="oral-report-section">
        <h3>{t("screening.report.overallSummaryHeading")}</h3>
        <p>{t(`screening.report.overallSummary.${overallStatus}`)}</p>
        <p className="oral-report-muted">{t("screening.report.experimentalNotice")}</p>
        {potentialFindings.length > 0 && (
          <ul className="oral-report-list">
            {potentialFindings.map((finding, index) => (
              <li key={`${finding.view}-${finding.feature}-${index}`}>
                <strong>{viewLabel(finding.view)} · {featureLabel(finding.feature)}</strong>
                {finding.note ? ` — ${finding.note}` : ""}
              </li>
            ))}
          </ul>
        )}
        {missingViews.length > 0 && (
          <p className="oral-report-muted">{t("screening.report.missingViewsNotAssessed")}</p>
        )}
      </section>

      <section className="oral-report-section">
        <h3>{t("screening.report.individualHeading")}</h3>
        <div className="oral-report-image-grid">
          {ORAL_SCREENING_VIEWS.map((view) => {
            const image = byView.get(view);
            if (!image) {
              return (
                <article className="oral-report-image-card missing" key={view}>
                  <h4>{viewLabel(view)}</h4>
                  <p>{t("screening.report.imageNotProvided")}</p>
                </article>
              );
            }
            const analysisStatus = getAnalysisStatus(image);
            const findings = getReportFindings(image);
            const usableAiOutput = hasUsableAiOutput(image);
            const structuredFindings = usableAiOutput ? image.possible_visual_findings || [] : [];
            const issue = structuredFindings.length === 0;
            const explanation = analysisStatus === "FAILED"
              ? t("screening.report.analysisFailed")
              : analysisStatus === "NOT_ANALYZED"
                ? t("screening.report.analysisNotPerformed")
                : analysisStatus === "NOT_ASSESSED"
                  ? t("screening.report.analysisNotPerformed")
                : image.not_assessable_reason;
            return (
              <article className="oral-report-image-card" key={view}>
                <h4>{viewLabel(view)}</h4>
                <ReportImage
                  image={image}
                  loadedImage={privateImages[image.photo_id || image.id]}
                />
                <p className="oral-report-quality">
                  <strong>{t("screening.report.imageQuality")}:</strong> {qualityLabel(image)}
                </p>
                <details open>
                  <summary>{t("screening.report.expandFindings")}</summary>
                  {analysisStatus !== "COMPLETED" && (
                    <p className="oral-report-inline-alert">
                      <AlertCircle size={16} /> {explanation}
                    </p>
                  )}
                  {findings.length > 0 && (
                    <ul className="oral-report-findings">
                      {findings.map((feature) => {
                        const state = getFindingState(image, feature);
                        const finding = structuredFindings.find((item) => item.feature === feature);
                        return (
                          <li key={`${view}-${feature}`}>
                            <span>{featureLabel(feature)}</span>
                            <strong className={`oral-report-finding-state ${state.toLowerCase().replace(/_/g, "-")}`}>
                              {findingStateLabel(state)}
                            </strong>
                            {finding?.note && <small>{finding.note}</small>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {issue && analysisStatus === "COMPLETED" && (
                    <p className="oral-report-muted">{image.not_assessable_reason || t("screening.report.noStructuredAssessment")}</p>
                  )}
                  {usableAiOutput && image.observations?.length > 0 && (
                    <p>{image.observations.join(" · ")}</p>
                  )}
                  {image.uncertainty_warnings?.length > 0 && (
                    <p className="oral-report-muted">{t("screening.report.uncertaintyNote")}</p>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      </section>

      <section className="oral-report-section">
        <h3>{t("screening.report.importantHeading")}</h3>
        {potentialFindings.length > 0 ? (
          <>
            <ul className="oral-report-list">
              {potentialFindings.map((finding, index) => (
                <li key={`important-${finding.view}-${finding.feature}-${index}`}>
                  <strong>{viewLabel(finding.view)} · {featureLabel(finding.feature)}</strong>
                  {finding.note ? ` — ${finding.note}` : ""}
                  <p>{t("screening.report.clinicalReviewReason")}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{overallStatus === "INCONCLUSIVE"
            ? t("screening.report.importantInconclusive")
            : t("screening.report.noImportantFindings")}</p>
        )}
      </section>

      <section className="oral-report-section">
        <h3>{t("screening.report.interpretationHeading")}</h3>
        <p>{t(`screening.report.interpretation.${overallStatus}`)}</p>
        {unassessedImages.length > 0 && (
          <ul className="oral-report-list">
            {unassessedImages.map((image) => (
              <li key={`unassessed-${image.photo_id || image.id || image.view}`}>
                {viewLabel(image.view)}: {["FAILED", "NOT_ASSESSED"].includes(getAnalysisStatus(image))
                  ? t("screening.report.analysisFailed")
                  : t("screening.report.notFullyAssessed")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="oral-report-section">
        <h3>{t("screening.report.nextStepsHeading")}</h3>
        <ul className="oral-report-list">
          {overallStatus === "SUSPICIOUS" && [
            "medicalOfficerReview",
            "clinicalOralExam",
            "specialistReferral",
            "furtherInvestigation",
          ].map((key) => <li key={key}>{t(`screening.report.nextSteps.${key}`)}</li>)}
          {overallStatus === "NO_SUSPICIOUS_FINDING" && [
            "routineFollowUp",
            "persistentSymptoms",
          ].map((key) => <li key={key}>{t(`screening.report.nextSteps.${key}`)}</li>)}
          {overallStatus === "INCONCLUSIVE" && [
            "retakePoorQuality",
            "clinicianExamination",
          ].map((key) => <li key={key}>{t(`screening.report.nextSteps.${key}`)}</li>)}
        </ul>
      </section>

      <footer className="oral-report-final">
        <div>
          <strong>{t("screening.report.finalStatus")}</strong>
          <span className={`oral-report-status ${statusTone}`}>{t(`screening.report.status.${overallStatus}`)}</span>
        </div>
        <p>
          {t("screening.report.medicalOfficerReview")}:{" "}
          {t(reviewComplete ? "screening.report.reviewComplete" : "screening.report.reviewPending")}
        </p>
        <p className="oral-report-disclaimer">{t("screening.report.disclaimer")}</p>
      </footer>
    </section>
  );
}
