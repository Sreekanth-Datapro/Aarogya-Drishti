import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, ImageOff, RotateCw, ScanEye, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import api from "../../services/api";
import { fetchPrivateImageObjectUrl } from "../../services/privateImageBlob";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate, formatLocalizedDateTime, formatLocalizedNumber, getCodeLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, EmptyState, Modal, PageLoader } from "../../components/ui";
import {
  getAnalysisStatus,
  getFindingState,
  getModelDisplayStatus,
} from "../../components/oralScreeningReportUtils";
import CasePicker from "./CasePicker";
import MoCaseSteps from "./MoCaseSteps";
import "./MedicalOfficer.css";

const STATUS_TONES = { ACCEPTED: "success", UPLOADED: "info", QUALITY_FAILED: "danger", SUPERSEDED: "neutral" };
const PHOTO_VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const IMAGE_TIMEOUT_MS = 180000;
const screeningKey = (image) => image.screening_id || "";
const revoke = (url) => { if (url) URL.revokeObjectURL?.(url); };

function ImageComparison({ patientId, photo, onViewImage }) {
  const { t } = useLanguage();
  const [originalUrl, setOriginalUrl] = useState("");
  const [enhancedUrl, setEnhancedUrl] = useState("");
  const [originalFailed, setOriginalFailed] = useState(false);
  const [enhancedState, setEnhancedState] = useState("loading");
  const [enhancedDimensions, setEnhancedDimensions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const urls = [];
    const enhancementStatus = photo.enhancement_status || "NOT_PERFORMED";
    const shouldLoadEnhanced = enhancementStatus === "AVAILABLE"
      || (retry > 0 && enhancementStatus === "UNAVAILABLE");
    setOriginalUrl("");
    setEnhancedUrl("");
    setOriginalFailed(false);
    setEnhancedDimensions(null);
    setLoading(true);
    setEnhancedState(shouldLoadEnhanced ? "loading" : enhancementStatus);

    const loadImage = async (url) => {
      const objectUrl = await fetchPrivateImageObjectUrl(url, { timeout: IMAGE_TIMEOUT_MS });
      if (!active) {
        URL.revokeObjectURL(objectUrl);
        return null;
      }
      urls.push(objectUrl);
      return objectUrl;
    };

    (async () => {
      const requests = [
        loadImage(`/medical-officer/patients/${patientId}/images/${photo.id}/file`),
        shouldLoadEnhanced
          ? loadImage(`/medical-officer/patients/${patientId}/images/${photo.id}/enhanced-file`)
          : Promise.resolve(null),
      ];
      const [original, enhanced] = await Promise.allSettled(requests);
      if (!active) return;
      if (original.status === "fulfilled") setOriginalUrl(original.value);
      else setOriginalFailed(true);
      if (!shouldLoadEnhanced) {
        setEnhancedState(enhancementStatus);
      } else if (enhanced.status === "fulfilled") {
        setEnhancedUrl(enhanced.value);
        setEnhancedState("loaded");
      } else {
        setEnhancedState(enhanced.reason?.response?.status === 404 ? "UNAVAILABLE" : "failed");
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      urls.forEach(revoke);
    };
  }, [patientId, photo.id, photo.enhancement_status, retry]);

  const dimensions = (width, height) => width && height
    ? t("mo.imageDimensions", { width, height })
    : t("mo.imageDimensionsUnavailable");

  return (
    <div className="mo-image-comparison" aria-label={t("mo.imageComparison")}>
      <section className="mo-image-version">
        <h3>{t("mo.originalImage")}</h3>
        <div className="mo-image-comparison-frame" aria-busy={loading}>
          {loading && <p role="status">{t("mo.imageLoading")}</p>}
          {originalUrl && (
            <button type="button" className="mo-comparison-image-button"
              onClick={() => onViewImage(photo, "ORIGINAL")}>
              <img src={originalUrl} alt={t("mo.originalImage")} />
            </button>
          )}
          {originalFailed && <p className="mo-warning">{t("mo.imageLoadFailed")}</p>}
        </div>
        {originalUrl && <p className="mo-image-dimensions">{dimensions(photo.width_px, photo.height_px)}</p>}
        {originalFailed && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t("mo.retryImage")}
          </Button>
        )}
      </section>

      <section className="mo-image-version">
        <h3>{t("mo.aiEnhancedImage")}</h3>
        <div className="mo-image-comparison-frame" aria-busy={loading || enhancedState === "loading"}>
          {(loading || enhancedState === "loading") && <p role="status">{t("mo.imageLoading")}</p>}
          {enhancedUrl && (
            <button type="button" className="mo-comparison-image-button"
              onClick={() => onViewImage(photo, "AI_ENHANCED")}>
              <img
                src={enhancedUrl}
                alt={t("mo.aiEnhancedImage")}
                onLoad={(event) => setEnhancedDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
              />
            </button>
          )}
          {enhancedState === "loaded" && <p className="mo-image-status">{t("mo.enhancedImageAvailable")}</p>}
          {enhancedState === "NOT_PERFORMED" && <p>{t("mo.enhancementNotPerformed")}</p>}
          {enhancedState === "UNAVAILABLE" && <p className="mo-warning">{t("mo.enhancedImageUnavailable")}</p>}
          {enhancedState === "failed" && <p className="mo-warning">{t("mo.enhancementFailed")}</p>}
        </div>
        {enhancedUrl && (
          <p className="mo-image-dimensions">
            {dimensions(enhancedDimensions?.width, enhancedDimensions?.height)}
          </p>
        )}
        {["failed", "UNAVAILABLE"].includes(enhancedState) && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t("mo.retryImage")}
          </Button>
        )}
        <p className="mo-enhanced-safety-notice">{t("mo.enhancedImageSafetyNotice")}</p>
      </section>
    </div>
  );
}

// Oral photos of a claimed case. Every image (thumbnail or full view) is downloaded
// through the authorised API (claim + IMAGE_CAPTURE consent checked on the server)
// and shown from memory; there is no public image address.
export default function ImageReview() {
  const { t, tm, language } = useLanguage();
  const [patientId, setPatientId] = useState("");
  const [images, setImages] = useState([]);
  const [selectedScreeningId, setSelectedScreeningId] = useState("");
  const [selectedView, setSelectedView] = useState(PHOTO_VIEWS[0]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [opening, setOpening] = useState("");
  const listRequestId = useRef(0);
  const imageRequestId = useRef(0);
  const thumbnailUrls = useRef({});
  const thumbnailsRequested = useRef(new Set());

  const clearThumbnails = () => {
    Object.values(thumbnailUrls.current).forEach(revoke);
    thumbnailUrls.current = {};
    thumbnailsRequested.current = new Set();
    setThumbnails({});
  };

  const load = useCallback(async () => {
    const requestId = listRequestId.current + 1;
    listRequestId.current = requestId;
    setImages([]);
    setSelectedScreeningId("");
    setShowPrevious(false);
    setShowOther(false);
    setViewer(null);
    setOpening("");
    clearThumbnails();
    if (!patientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/medical-officer/patients/${patientId}/images`);
      if (requestId === listRequestId.current) {
        const nextImages = response.data.images || [];
        setImages(nextImages);
        setSelectedScreeningId(nextImages[0] ? screeningKey(nextImages[0]) : "");
      }
    } catch (requestError) {
      if (requestId === listRequestId.current) setError(apiMessage(requestError, "mo.loadFailed"));
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
    return () => {
      listRequestId.current += 1;
      imageRequestId.current += 1;
    };
  }, [load]);

  // Free every in-memory thumbnail when the page closes
  useEffect(() => () => Object.values(thumbnailUrls.current).forEach(revoke), []);

  // Free the in-memory image when the viewer closes or changes
  useEffect(() => () => revoke(viewer?.url), [viewer]);

  const size = (bytes) => t("mo.sizeKb", { size: formatLocalizedNumber(Math.round(bytes / 1024), language) });
  // Health Worker front/left/right photos keep their view in annotation_site
  const viewLabel = (image) => (PHOTO_VIEWS.includes(image.annotation_site)
    ? getCodeLabel("photoViews", image.annotation_site, language)
    : getCodeLabel("oralViews", image.view_type, language));

  const screenings = [...new Map(images.map((image) => [
    screeningKey(image),
    { id: screeningKey(image), date: image.screening_date, count: images.filter((item) => screeningKey(item) === screeningKey(image)).length },
  ])).values()];
  const selectedScreeningIndex = screenings.findIndex((screening) => screening.id === selectedScreeningId);
  const previousScreeningIds = new Set(screenings.slice(selectedScreeningIndex + 1).map((screening) => screening.id));
  const otherScreeningIds = new Set(screenings.slice(0, Math.max(selectedScreeningIndex, 0)).map((screening) => screening.id));
  const selectedImages = images.filter((image) => screeningKey(image) === selectedScreeningId);
  const selectedPhoto = selectedImages.find((image) =>
    image.annotation_site === selectedView && image.status !== "SUPERSEDED"
  ) || selectedImages.find((image) => image.annotation_site === selectedView);
  const previousImages = images.filter((image) => previousScreeningIds.has(screeningKey(image)));
  const otherImages = images.filter((image) => otherScreeningIds.has(screeningKey(image)));
  const visibleIds = [
    ...selectedImages,
    ...(showPrevious ? previousImages : []),
    ...(showOther ? otherImages : []),
  ].map((image) => image.id).join(",");

  // Small previews of the photos on screen, through the same protected file route
  useEffect(() => {
    if (!patientId || !visibleIds) return;
    const requestId = listRequestId.current;
    visibleIds.split(",").forEach(async (photoId) => {
      if (thumbnailsRequested.current.has(photoId)) return;
      thumbnailsRequested.current.add(photoId);
      try {
        const url = await fetchPrivateImageObjectUrl(
          `/medical-officer/patients/${patientId}/images/${photoId}/file`,
          { timeout: IMAGE_TIMEOUT_MS }
        );
        if (requestId !== listRequestId.current) {
          URL.revokeObjectURL(url);
          return;
        }
        thumbnailUrls.current[photoId] = url;
        setThumbnails((current) => ({ ...current, [photoId]: url }));
      } catch {
        // The card keeps its placeholder; "View image" still reports errors
      }
    });
  }, [patientId, visibleIds]);

  const openImage = async (image, list, version = "ORIGINAL") => {
    const requestId = imageRequestId.current + 1;
    imageRequestId.current = requestId;
    const requestedPatientId = patientId;
    setOpening(image.id);
    setError("");
    try {
      const suffix = version === "AI_ENHANCED" ? "/enhanced-file" : "/file";
      const url = await fetchPrivateImageObjectUrl(
        `/medical-officer/patients/${requestedPatientId}/images/${image.id}${suffix}`,
        { timeout: IMAGE_TIMEOUT_MS }
      );
      if (requestId !== imageRequestId.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setZoom(1);
      setRotation(0);
      setViewer({ image, list, url, version });
    } catch (requestError) {
      if (requestId === imageRequestId.current) setError(apiMessage(requestError, "mo.imageFailed"));
    } finally {
      if (requestId === imageRequestId.current) setOpening("");
    }
  };

  const viewerIndex = viewer ? viewer.list.findIndex((item) => item.id === viewer.image.id) : -1;
  const step = (offset) => {
    const next = viewer?.list[viewerIndex + offset];
    if (next) openImage(next, viewer.list, viewer.version);
  };

  const qualityStatus = (image) => image.ai_analysis_details?.image_quality?.status || image.quality_status;

  const renderImages = (items) => items.map((image) => {
    const quality = qualityStatus(image);
    const details = image.ai_analysis_details;
    const reviewDetails = { ...details, status: image.ai_status };
    const analysisStatus = details ? getAnalysisStatus(reviewDetails) : "NOT_ANALYZED";
    const modelStatus = details ? getModelDisplayStatus(reviewDetails) : null;
    return (
      <article key={image.id} className="mo-card mo-image-card">
        <button type="button" className="mo-image-thumb" onClick={() => openImage(image, items)} disabled={Boolean(opening)}
          aria-label={t("mo.openPhoto", { view: viewLabel(image) })}>
          {thumbnails[image.id]
            ? <img src={thumbnails[image.id]} alt={t("mo.thumbnailAlt", { view: viewLabel(image) })} />
            : <span className="mo-image-placeholder"><ScanEye size={34} /></span>}
          <span className="mo-image-view-tag">{viewLabel(image)}</span>
        </button>

        <div className="mo-chip-row">
          <Badge tone={STATUS_TONES[image.status] || "neutral"}>{getCodeLabel("photoStatuses", image.status, language)}</Badge>
          {quality && (
            <Badge tone={quality === "ACCEPTABLE" ? "success" : "warning"}>
              {t("mo.imageQuality")}: {getCodeLabel("qualityStatuses", quality, language)}
            </Badge>
          )}
        </div>

        <dl className="mo-details">
          <dt>{t("mo.screeningDate")}</dt><dd>{formatLocalizedDate(image.screening_date, language)}</dd>
          <dt>{t("mo.capturedAt")}</dt><dd>{formatLocalizedDateTime(image.captured_at, language)}</dd>
          <dt>{t("mo.fileDetails")}</dt>
          <dd>{size(image.size_bytes)}{image.width_px ? ` · ${image.width_px}×${image.height_px}` : ""}</dd>
          <dt>{t("mo.metadataRemoved")}</dt><dd>{image.metadata_stripped ? t("mo.yes") : t("mo.no")}</dd>
        </dl>

        <div className="mo-image-ai">
          <h3 className="mo-image-ai-title">{t("mo.aiTitle")}</h3>
          {!details && <p className="mo-muted">{image.ai_result_label ? getCodeLabel("aiResults", image.ai_result_label, language) : "-"}</p>}
          {details && (
            <div className="mo-ai-result-details">
              {details.classification && <strong>{t(`mo.aiClassifications.${details.classification}`)}</strong>}
              {details.selected_category && (
                <p><strong>{t("mo.aiCategory")}:</strong> {details.selected_category}</p>
              )}
              {modelStatus && (
                <p><strong>{t("mo.aiModelStatus")}:</strong> {t(`screening.aiModelStatuses.${modelStatus}`)}</p>
              )}
              {details.image_quality?.model_assessment && (
                <p><strong>{t("mo.imageModelAssessment")}:</strong> {details.image_quality.model_assessment}</p>
              )}
              {details.image_quality?.warnings?.map((warning) => (
                <p className="mo-warning" key={warning}>{t(`mo.aiQualityWarnings.${warning}`)}</p>
              ))}
              {analysisStatus !== "FAILED"
                && Array.isArray(details.possible_visual_findings)
                && details.possible_visual_findings.length > 0 && (
                <ul>
                  {details.possible_visual_findings.map((finding) => (
                    <li key={`${image.id}-${finding.feature}`}>
                      {t(`screening.aiFeatures.${finding.feature}`)}:{" "}
                      {t(`screening.report.findingStates.${getFindingState({
                        ...reviewDetails,
                      }, finding.feature)}`)}
                      {finding.note ? ` — ${finding.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {details.not_assessable_reason && <p>{details.not_assessable_reason}</p>}
              {analysisStatus !== "FAILED"
                && (!details.possible_visual_findings || details.possible_visual_findings.length === 0)
                && details.observations?.map((observation, index) => (
                  <p key={`observation-${index}`}>{observation}</p>
                ))}
              {details.uncertainty_warnings?.map((warning) => (
                <p className="mo-warning" key={warning}>{t(`mo.aiWarnings.${warning}`)}</p>
              ))}
              {details.recommendation && (
                <p><strong>{t("mo.aiRecommendation")}:</strong> {details.recommendation}</p>
              )}
              {analysisStatus === "FAILED"
                && (
                <p className="mo-warning">{t("mo.analysisUnavailable")}</p>
              )}
              {image.ai_model_provider && (
                <p>{t("mo.aiModel")}: {image.ai_model_provider} · {image.ai_model_version}</p>
              )}
              <p>{t("mo.aiReviewStatus")}: {t("mo.aiPendingReview")}</p>
              <p className="mo-muted">{t("mo.aiOriginalEvidenceNote")}</p>
            </div>
          )}
        </div>

        <Button type="button" size="sm" loading={opening === image.id} disabled={Boolean(opening)} onClick={() => openImage(image, items)}>
          <Eye size={14} /> {t("mo.viewImage")}
        </Button>
      </article>
    );
  });

  const collapsibleGroup = (titleKey, items, open, setOpen) => items.length > 0 && (
    <section className="mo-image-group">
      <div className="mo-image-group-header">
        <h2 className="mo-card-title">{t(titleKey)}</h2>
        <Badge tone="neutral">{t("mo.photoCount", { count: formatLocalizedNumber(items.length, language) })}</Badge>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
          {t(open ? "mo.hidePhotos" : "mo.showPhotos")}
        </Button>
      </div>
      {open && <div className="mo-image-grid">{renderImages(items)}</div>}
    </section>
  );

  return (
    <div className="mo-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("modules.moImageReview.title")}</h1>
          <p className="page-subtitle">{t("mo.imagesSubtitle")}</p>
        </div>
      </div>

      <MoCaseSteps />
      <section className="mo-card mo-toolbar">
        <CasePicker onChange={setPatientId} />
        {screenings.length > 1 && (
          <label className="mo-case-picker">
            <span>{t("mo.selectedScreening")}</span>
            <select value={selectedScreeningId} onChange={(event) => setSelectedScreeningId(event.target.value)}>
              {screenings.map((screening) => (
                <option key={screening.id} value={screening.id}>
                  {formatLocalizedDate(screening.date, language)} · {t("mo.photoCount", { count: formatLocalizedNumber(screening.count, language) })}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <Alert type="info">{t("mo.imagesPrivacy")}</Alert>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {loading && <PageLoader label={t("common.loading")} />}

      {patientId && !loading && !error && images.length === 0 && (
        <EmptyState icon={ImageOff} title={t("mo.noImages")} text={t("mo.noImagesText")} />
      )}

      {screenings.length > 0 && (
        <>
          <section className="mo-card mo-comparison-card">
            <div className="mo-image-group-header">
              <h2 className="mo-card-title">{t("mo.imageComparison")}</h2>
            </div>
            <div className="mo-image-view-controls" role="group" aria-label={t("mo.selectImageView")}>
              {PHOTO_VIEWS.map((view) => (
                <Button key={view} type="button" size="sm" variant={selectedView === view ? "primary" : "secondary"}
                  aria-pressed={selectedView === view} onClick={() => setSelectedView(view)}>
                  {getCodeLabel("photoViews", view, language)}
                </Button>
              ))}
            </div>
            {selectedPhoto ? (
              <ImageComparison
                key={`${selectedScreeningId}-${selectedPhoto.id}`}
                patientId={patientId}
                photo={selectedPhoto}
                onViewImage={(photo, version) => openImage(photo, [photo], version)}
              />
            ) : (
              <p className="mo-muted">{t("mo.imageViewUnavailable")}</p>
            )}
          </section>
          <section className="mo-image-group">
            <div className="mo-image-group-header">
              <h2 className="mo-card-title">{t("mo.selectedScreeningImages")}</h2>
              <Badge tone="info">{t("mo.photoCount", { count: formatLocalizedNumber(selectedImages.length, language) })}</Badge>
            </div>
            <div className="mo-image-grid">{renderImages(selectedImages)}</div>
          </section>
          {collapsibleGroup("mo.previousScreeningImages", previousImages, showPrevious, setShowPrevious)}
          {collapsibleGroup("mo.otherScreeningImages", otherImages, showOther, setShowOther)}
        </>
      )}

      <Modal open={Boolean(viewer)} title={t("mo.imageViewer")} onClose={() => setViewer(null)} className="mo-image-modal">
        {viewer && (
          <>
            <div className="mo-viewer-toolbar">
              <strong>
                {viewer.version === "AI_ENHANCED" ? t("mo.aiEnhancedImage") : t("mo.originalImage")}
                {" · "}{viewLabel(viewer.image)}
              </strong>
              <div className="mo-viewer-buttons">
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.previousImage")} disabled={viewerIndex <= 0 || Boolean(opening)} onClick={() => step(-1)}>
                  <ChevronLeft size={16} />
                </Button>
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.zoomOut")} disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 0.25))}>
                  <ZoomOut size={16} />
                </Button>
                <span className="mo-zoom-value">{Math.round(zoom * 100)}%</span>
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.zoomIn")} disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 0.25))}>
                  <ZoomIn size={16} />
                </Button>
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.rotate")} onClick={() => setRotation((value) => (value + 90) % 360)}>
                  <RotateCw size={16} />
                </Button>
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.zoomReset")} onClick={() => { setZoom(1); setRotation(0); }}>
                  <Maximize2 size={16} />
                </Button>
                <Button type="button" size="sm" variant="secondary" aria-label={t("mo.nextImage")} disabled={viewerIndex < 0 || viewerIndex >= viewer.list.length - 1 || Boolean(opening)} onClick={() => step(1)}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
            {viewer.version === "AI_ENHANCED" && (
              <p className="mo-enhanced-safety-notice">{t("mo.enhancedImageSafetyNotice")}</p>
            )}
            <div className="mo-viewer-stage">
              <img
                src={viewer.url}
                alt={viewLabel(viewer.image)}
                className="mo-image-full"
                style={{
                  width: zoom > 1 ? `${zoom * 100}%` : "auto",
                  maxWidth: zoom > 1 ? "none" : `${zoom * 100}%`,
                  maxHeight: zoom > 1 ? "none" : `${zoom * 100}%`,
                  transform: `rotate(${rotation}deg)`,
                }}
              />
            </div>
            <p className="mo-warning">{t("mo.aiWarning")}</p>
          </>
        )}
      </Modal>
    </div>
  );
}
