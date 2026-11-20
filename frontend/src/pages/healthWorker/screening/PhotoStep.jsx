import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Eye, ImageOff, Sparkles, Trash2, Upload, X } from "lucide-react";
import api from "../../../services/api";
import { fetchPrivateImageObjectUrl } from "../../../services/privateImageBlob";
import { useLanguage } from "../../../i18n/LanguageContext";
import { formatLocalizedNumber, getCodeLabel } from "../../../i18n/displayLabels";
import { apiMessage } from "../../../i18n/translate";
import { Alert, Badge, Button } from "../../../components/ui";
import OralScreeningReport from "../../../components/OralScreeningReport";
import { captureVideoFrame, inspectImage, validateImageFile } from "./imageTools";

const VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];
const IMAGE_CATEGORIES = ["MOUTH", "TONGUE", "SKIN"];
const BLOCKING_VALIDATION = new Set(["INVALID_CATEGORY", "POOR_QUALITY", "CORRUPTED_IMAGE"]);
const QUALITY_LABELS = {
  dimensions: "screening.qualityDimensions",
  dark: "screening.qualityDark",
  bright: "screening.qualityBright",
  blur: "screening.qualityBlur",
};
const VALIDATION_STATUS_KEYS = {
  VALID: "screening.validationValid",
  INVALID_CATEGORY: "screening.validationInvalidCategory",
  POOR_QUALITY: "screening.validationPoorQuality",
  CORRUPTED_IMAGE: "screening.validationCorrupted",
  NEEDS_REVIEW: "screening.validationNeedsReview",
};
// Real-ESRGAN runs on the server CPU and can take much longer than a normal request
const ENHANCE_TIMEOUT_MS = 180000;
const ANALYSIS_TIMEOUT_MS = 600000;
const VALIDATE_TIMEOUT_MS = 180000;

function canSaveStaged(staged) {
  return staged?.validation?.status === "VALID" && staged?.validation?.upload_allowed === true;
}

// Step 4: front, left and right photos (only with photograph consent).
// Images are downloaded through the authorised API; there is no public image link.
// Selecting a photo auto-starts AI enhancement, then validation. Save stores the
// original only when VALID; the enhanced copy is persisted separately by the server.
export default function PhotoStep({ screening, maxBytes, photoConsent, onChanged, onNext }) {
  const { t, tm, language } = useLanguage();
  const [previews, setPreviews] = useState({});
  const [enhancedPreviews, setEnhancedPreviews] = useState({});
  const [selected, setSelected] = useState({});
  const [uploading, setUploading] = useState("");
  const [enhancing, setEnhancing] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [cameraView, setCameraView] = useState("");
  const [cameraStream, setCameraStream] = useState(null);
  const [previewView, setPreviewView] = useState("");
  const [imageCategory, setImageCategory] = useState("MOUTH");
  const [validating, setValidating] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewRetry, setPreviewRetry] = useState(0);
  const videoRef = useRef(null);
  const cameraRequest = useRef(0);
  const objectUrls = useRef(new Set());
  const stageToken = useRef({});
  const limit = maxBytes || 10 * 1024 * 1024;
  const photoFor = (view) => screening.photos.find((photo) => photo.view === view);
  const photoSignature = useMemo(
    () => JSON.stringify((screening.photos || []).map((photo) => ({
      id: photo.id,
      view: photo.view,
      hasAiEnhanced: Boolean(photo.has_ai_enhanced),
    }))),
    [screening.photos]
  );

  const createPreviewUrl = (file) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  };
  const releasePreviewUrl = (url) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  };
  const releaseStaged = (staged) => {
    if (!staged) return;
    releasePreviewUrl(staged.url);
    releasePreviewUrl(staged.enhancedUrl);
  };

  const patchSelected = (view, patch) => {
    setSelected((current) => {
      const existing = current[view];
      if (!existing) return current;
      return { ...current, [view]: { ...existing, ...patch } };
    });
  };

  // Saved originals and their AI copies, loaded as private authenticated blobs
  useEffect(() => {
    if (!photoConsent) return undefined;
    const photos = JSON.parse(photoSignature);
    let active = true;
    const urls = [];
    const load = async (path) => {
      const url = await fetchPrivateImageObjectUrl(path, { timeout: ENHANCE_TIMEOUT_MS });
      urls.push(url);
      return url;
    };
    setPreviewLoading(photos.length > 0);
    setPreviewError("");
    (async () => {
      const originals = {};
      const enhanced = {};
      const failedViews = [];
      for (const photo of photos) {
        const base = `/screenings/${screening.id}/photos/${photo.id}`;
        try {
          originals[photo.view] = await load(`${base}/file`);
          if (photo.hasAiEnhanced) enhanced[photo.view] = await load(`${base}/enhanced/file`);
        } catch {
          failedViews.push(photo.view);
        }
      }
      if (!active) return;
      setPreviews(originals);
      setEnhancedPreviews(enhanced);
      setPreviewLoading(false);
      if (failedViews.length) {
        setPreviewError(t("screening.imageLoadFailed"));
      }
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoConsent, screening.id, photoSignature, previewRetry, t]);

  useEffect(() => () => {
    cameraRequest.current += 1;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const stopCamera = () => {
    cameraRequest.current += 1;
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraView("");
  };

  const openCamera = async (view) => {
    setError("");
    if (!photoConsent) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("screening.cameraUnavailable"));
      return;
    }
    stopCamera();
    const requestId = cameraRequest.current;
    setCameraView(view);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (cameraRequest.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setCameraStream(stream);
    } catch (cameraError) {
      setCameraView("");
      setError(cameraError.name === "NotAllowedError" || cameraError.name === "PermissionDeniedError"
        ? t("screening.cameraDenied")
        : t("screening.cameraFailed"));
    }
  };

  const runCategoryValidation = async (file, category) => {
    const form = new FormData();
    form.append("category", category);
    form.append("photo", file);
    const response = await api.post(
      `/screenings/${screening.id}/photos/validate`,
      form,
      { timeout: VALIDATE_TIMEOUT_MS }
    );
    const validation = { ...(response.data.validation || {}) };
    if (!validation.status) {
      throw new Error("missing validation status");
    }
    if (typeof response.data.can_upload === "boolean") {
      validation.upload_allowed = response.data.can_upload && validation.status === "VALID";
    } else if (typeof validation.upload_allowed !== "boolean") {
      validation.upload_allowed = validation.status === "VALID";
    } else if (validation.status !== "VALID") {
      validation.upload_allowed = false;
    }
    return validation;
  };

  const enhancePreview = async (file) => {
    const form = new FormData();
    form.append("photo", file);
    const response = await api.post(
      `/screenings/${screening.id}/photos/enhance-preview`,
      form,
      { responseType: "blob", timeout: ENHANCE_TIMEOUT_MS }
    );
    const blob = response.data;
    if (!(blob instanceof Blob) || !blob.size) {
      throw new Error("empty enhancement");
    }
    const contentType = response.headers?.["content-type"] || blob.type || "image/jpeg";
    if (String(contentType).includes("application/json")) {
      const text = await blob.text();
      let message = t("screening.enhancementFailed");
      try {
        message = JSON.parse(text)?.message || message;
      } catch {
        // keep default message
      }
      throw Object.assign(new Error(message), { response: { data: { message } } });
    }
    return new File([blob], `enhanced-${file.name || "photo"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  };

  const stageFile = async (view, file) => {
    setError("");
    setAnalysisResult(null);
    if (!file) return;
    const invalid = validateImageFile(file, limit);
    if (invalid === "type") {
      setError(t("screening.photoTypeError"));
      return;
    }
    if (invalid === "size") {
      setError(t("screening.photoSizeError"));
      return;
    }

    const token = Symbol(view);
    stageToken.current[view] = token;
    releaseStaged(selected[view]);

    const originalUrl = createPreviewUrl(file);
    const category = imageCategory;
    setSelected((current) => ({
      ...current,
      [view]: {
        file,
        url: originalUrl,
        enhancedFile: null,
        enhancedUrl: null,
        enhancementStatus: "enhancing",
        quality: null,
        enhancedQuality: null,
        validation: null,
        category,
      },
    }));
    setEnhancing((current) => ({ ...current, [view]: true }));
    setValidating((current) => {
      const next = { ...current };
      delete next[view];
      return next;
    });

    let enhancedFile = null;
    let enhancedUrl = null;
    let enhancementStatus = "failed";
    let enhancedQuality = null;

    try {
      enhancedFile = await enhancePreview(file);
      if (stageToken.current[view] !== token) return;
      enhancedUrl = createPreviewUrl(enhancedFile);
      enhancementStatus = "enhanced";
      try {
        enhancedQuality = await inspectImage(enhancedFile);
      } catch {
        enhancedQuality = null;
      }
      patchSelected(view, {
        enhancedFile,
        enhancedUrl,
        enhancementStatus,
        enhancedQuality,
      });
    } catch (requestError) {
      if (stageToken.current[view] !== token) return;
      enhancementStatus = "failed";
      patchSelected(view, { enhancementStatus: "failed" });
      setError(apiMessage(requestError, "screening.enhancementFailed"));
    } finally {
      if (stageToken.current[view] === token) {
        setEnhancing((current) => {
          const next = { ...current };
          delete next[view];
          return next;
        });
      }
    }

    if (stageToken.current[view] !== token) return;

    setValidating((current) => ({ ...current, [view]: true }));
    try {
      const quality = await inspectImage(file);
      if (stageToken.current[view] !== token) return;
      patchSelected(view, { quality });

      let validation = null;
      try {
        validation = await runCategoryValidation(file, category);
      } catch (requestError) {
        if (stageToken.current[view] !== token) return;
        const status = requestError.response?.status;
        const code = requestError.response?.data?.code;
        if (BLOCKING_VALIDATION.has(code)) {
          validation = {
            status: code,
            reason: apiMessage(requestError, "screening.validationFailed"),
            expected_category: category,
            upload_allowed: false,
          };
        } else if (status === 404) {
          setError(t("screening.validationEndpointMissing"));
          patchSelected(view, {
            validation: {
              status: "NEEDS_REVIEW",
              reason: t("screening.validationEndpointMissing"),
              upload_allowed: false,
            },
          });
          return;
        } else {
          setError(apiMessage(requestError, "screening.validationFailed"));
          patchSelected(view, {
            validation: {
              status: "NEEDS_REVIEW",
              reason: apiMessage(requestError, "screening.validationFailed"),
              upload_allowed: false,
            },
          });
          return;
        }
      }

      if (stageToken.current[view] !== token) return;
      patchSelected(view, { validation, quality, enhancedQuality, enhancementStatus });

      const qualityForDecision = enhancementStatus === "enhanced" && enhancedQuality
        ? enhancedQuality
        : quality;
      const stillInsufficient = validation
        && (BLOCKING_VALIDATION.has(validation.status) || validation.upload_allowed !== true);
      if (stillInsufficient) {
        const dimensionIssue = (qualityForDecision?.warnings || []).includes("dimensions")
          || (quality?.warnings || []).includes("dimensions")
          || validation.status === "POOR_QUALITY";
        setError(
          dimensionIssue && enhancementStatus === "enhanced"
            ? (validation.reason || t("screening.retakeAfterEnhancement"))
            : (validation.reason || t("screening.validationBlocked"))
        );
      }
    } catch {
      if (stageToken.current[view] === token) {
        setError(t("screening.imageReadFailed"));
      }
    } finally {
      if (stageToken.current[view] === token) {
        setValidating((current) => {
          const next = { ...current };
          delete next[view];
          return next;
        });
      }
    }
  };

  const capture = async () => {
    try {
      const file = await captureVideoFrame(videoRef.current, cameraView);
      stopCamera();
      await stageFile(cameraView, file);
    } catch {
      setError(t("screening.cameraFailed"));
    }
  };

  const chooseFile = (view, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    stageFile(view, file);
  };

  const clearSelected = (view) => {
    stageToken.current[view] = Symbol("cleared");
    releaseStaged(selected[view]);
    setSelected((current) => {
      const next = { ...current };
      delete next[view];
      return next;
    });
    setEnhancing((current) => {
      const next = { ...current };
      delete next[view];
      return next;
    });
    setValidating((current) => {
      const next = { ...current };
      delete next[view];
      return next;
    });
  };

  const reload = async () => {
    try {
      await onChanged();
    } catch {
      setError(t("screening.loadFailed"));
    }
  };

  const persistEnhancedCopy = async (view, photoId) => {
    try {
      await api.post(
        `/screenings/${screening.id}/photos/${photoId}/enhance`,
        null,
        { timeout: ENHANCE_TIMEOUT_MS }
      );
    } catch {
      // Original save already succeeded; enhanced persistence can be retried later.
    }
  };

  const uploadOriginal = async (view) => {
    const staged = selected[view];
    if (!staged?.file) return;
    if (!canSaveStaged(staged)) {
      throw Object.assign(
        new Error(staged.validation?.reason || t("screening.validationBlocked")),
        {
          response: {
            data: {
              message: staged.validation?.reason || t("screening.validationBlocked"),
              code: staged.validation?.status || "NEEDS_REVIEW",
            },
          },
        }
      );
    }
    const form = new FormData();
    form.append("view", view);
    form.append("category", staged.category || imageCategory);
    form.append("photo", staged.file);
    const response = await api.post(`/screenings/${screening.id}/photos`, form);
    const photoId = response.data?.photo?.id;
    // Keep local staged previews visible until reload finishes and private blobs load.
    if (photoId) {
      setEnhancing((current) => ({ ...current, [view]: true }));
      try {
        await persistEnhancedCopy(view, photoId);
      } finally {
        setEnhancing((current) => {
          const next = { ...current };
          delete next[view];
          return next;
        });
      }
    }
    return view;
  };

  // Uploads VALID photos one after another; stops at the first failure
  const savePhotos = async (views) => {
    setError("");
    setPreviewError("");
    setAnalysisResult(null);
    const uploaded = [];
    for (const view of views) {
      setUploading(view);
      try {
        const savedView = await uploadOriginal(view);
        if (savedView) uploaded.push(savedView);
      } catch (requestError) {
        setError(apiMessage(requestError, "screening.photoFailed"));
        break;
      }
    }
    await reload();
    uploaded.forEach((view) => clearSelected(view));
    setUploading("");
  };

  const analyzeScreening = async () => {
    setError("");
    setAnalysisResult(null);
    setAnalyzing(true);
    try {
      const response = await api.post(
        `/screenings/${screening.id}/analyze`,
        null,
        { timeout: ANALYSIS_TIMEOUT_MS }
      );
      setAnalysisResult(response.data.analysis);
      await reload();
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.aiAnalysisFailed"));
      setAnalysisResult({
        screening_date: screening.screening_date,
        views: (screening.photos || []).map((photo) => ({
          photo_id: photo.id,
          view: photo.view,
          analysis_status: "FAILED",
          model_status: "ANALYSIS_FAILED",
          classification: "UNCERTAIN",
          possible_visual_findings: [],
          observations: [],
          abnormalities: [],
        })),
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Real-ESRGAN on a saved original: keeps the original unchanged
  const aiEnhanceSaved = async (view) => {
    const photo = photoFor(view);
    if (!photo) return;
    setError("");
    setEnhancing((current) => ({ ...current, [view]: true }));
    try {
      await api.post(`/screenings/${screening.id}/photos/${photo.id}/enhance`, null, { timeout: ENHANCE_TIMEOUT_MS });
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.enhancementFailed"));
      setEnhancing((current) => {
        const next = { ...current };
        delete next[view];
        return next;
      });
      return;
    }
    await reload();
    setEnhancing((current) => {
      const next = { ...current };
      delete next[view];
      return next;
    });
  };

  const removePhoto = async (view) => {
    setAnalysisResult(null);
    if (selected[view]) {
      clearSelected(view);
      return;
    }
    const photo = photoFor(view);
    if (!photo) return;
    setError("");
    setUploading(view);
    try {
      await api.delete(`/screenings/${screening.id}/photos/${photo.id}`);
    } catch (requestError) {
      setError(apiMessage(requestError, "screening.photoRemoveFailed"));
      setUploading("");
      return;
    }
    await reload();
    setUploading("");
  };

  const missing = VIEWS.filter((view) => !photoFor(view));
  const unsaved = VIEWS.filter((view) => selected[view]);
  const uploadable = unsaved.filter((view) => canSaveStaged(selected[view]));
  const allStagedReadyToSave = uploadable.length === unsaved.length;
  const anyBusy = Boolean(uploading)
    || Object.keys(enhancing).length > 0
    || Object.keys(validating).length > 0;
  const canAnalyze = photoConsent && screening.photos.length > 0 && unsaved.length === 0;
  const canContinue = !photoConsent
    || (screening.photos.length > 0 && unsaved.length === 0 && !anyBusy);
  const reportImages = (analysisResult?.views || []).map((result) => ({
    ...result,
    photo_id: result.photo_id || photoFor(result.view)?.id,
    previewUrl: previews[result.view],
  }));
  const qualityWarnings = (quality) => (quality?.warnings || [])
    .map((warning) => QUALITY_LABELS[warning])
    .filter(Boolean)
    .map((key) => t(key));
  const previewStaged = previewView ? selected[previewView] : null;
  const previewOriginal = previewStaged?.url || previews[previewView];
  const previewEnhanced = previewStaged?.enhancedUrl || enhancedPreviews[previewView];

  const stagedStatusBadge = (staged) => {
    if (!staged) return null;
    if (staged.enhancementStatus === "enhancing" || enhancing[staged.view]) {
      return <Badge tone="info">{t("screening.enhancementInProgress")}</Badge>;
    }
    if (validating[staged.view]) {
      return <Badge tone="info">{t("screening.validatingImage")}</Badge>;
    }
    if (staged.validation && (BLOCKING_VALIDATION.has(staged.validation.status) || staged.validation.upload_allowed !== true)) {
      return <Badge tone="warning">{t("screening.validationFailedBadge")}</Badge>;
    }
    if (staged.enhancementStatus === "enhanced") {
      return <Badge tone="info">{t("screening.enhancedReady")}</Badge>;
    }
    if (staged.enhancementStatus === "failed") {
      return <Badge tone="warning">{t("screening.enhancementFailedBadge")}</Badge>;
    }
    return <Badge tone="neutral">{t("screening.photoPreviewReady")}</Badge>;
  };

  return (
    <div>
      <h2 className="scr-step-title">{t("screening.photosTitle")}</h2>
      {screening.case_state === "SCREENED" && (
        <Alert type="info">
          {t("screening.returnedNote")}
          {screening.medical_officer_request_note && (
            <p><strong>{t("screening.requestNoteLabel")}:</strong> {screening.medical_officer_request_note}</p>
          )}
        </Alert>
      )}
      {error && <Alert type="error">{tm(error)}</Alert>}
      {previewError && (
        <Alert type="error">
          {previewError}
          <div className="scr-actions" style={{ marginTop: 8 }}>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPreviewRetry((value) => value + 1)}>
              {t("screening.retryImage")}
            </Button>
          </div>
        </Alert>
      )}
      {previewLoading && !previewError && (
        <p className="scr-muted" role="status">{t("screening.imageLoading")}</p>
      )}
      {!photoConsent ? (
        <>
          <Alert type="warning"><ImageOff size={16} /> {t("screening.photosNoConsent")}</Alert>
          {screening.photos.map((photo) => (
            <div className="scr-actions" key={photo.id}>
              <span>{getCodeLabel("photoViews", photo.view, language)} · {t("screening.photoSavedWithoutConsent")}</span>
              <Button type="button" className="btn-secondary btn-sm" onClick={() => removePhoto(photo.view)} disabled={uploading === photo.view}>
                <Trash2 size={14} /> {t("screening.removePhoto")}
              </Button>
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="scr-muted">{t("screening.photosHint")}</p>
          <p className="scr-quality-disclaimer">{t("screening.qualityDisclaimer")}</p>
          <p className="scr-quality-disclaimer">{t("screening.categoryValidationDisclaimer")}</p>
          <div className="scr-actions" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <label htmlFor="screening-image-category"><strong>{t("screening.imageCategoryLabel")}</strong></label>
            <select
              id="screening-image-category"
              value={imageCategory}
              onChange={(event) => setImageCategory(event.target.value)}
              disabled={anyBusy}
            >
              {IMAGE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{t(`screening.imageCategories.${category}`)}</option>
              ))}
            </select>
            <Badge tone="info">{t("screening.selectedCategory", { category: t(`screening.imageCategories.${imageCategory}`) })}</Badge>
          </div>
          <p className="scr-ai-note"><Sparkles size={14} aria-hidden="true" /> {t("screening.aiEnhanceNote")}</p>
          <div className="scr-photo-grid">
            {VIEWS.map((view) => {
              const photo = photoFor(view);
              const staged = selected[view];
              const label = getCodeLabel("photoViews", view, language);
              const originalUrl = staged?.url || previews[view];
              const enhancedUrl = staged?.enhancedUrl || enhancedPreviews[view];
              const isBusy = uploading === view || Boolean(enhancing[view]) || Boolean(validating[view]);
              const blocked = staged ? !canSaveStaged(staged) : false;
              const displayQuality = staged?.enhancedQuality || staged?.quality;
              return (
                <article key={view} className={`scr-photo-card ${photo ? "saved" : ""}`}>
                  {enhancedUrl ? (
                    <div className="scr-photo-pair">
                      <figure>
                        <img src={originalUrl} alt={`${label} · ${t("screening.originalLabel")}`} />
                        <figcaption>{t("screening.originalLabel")}</figcaption>
                      </figure>
                      <figure>
                        <img src={enhancedUrl} alt={`${label} · ${t("screening.aiEnhancedLabel")}`} />
                        <figcaption>{t("screening.aiEnhancedLabel")}</figcaption>
                      </figure>
                    </div>
                  ) : (
                    <div className="scr-photo-frame">
                      {originalUrl
                        ? <img src={originalUrl} alt={label} />
                        : <span className="scr-photo-empty"><Camera size={28} /></span>}
                    </div>
                  )}
                  <div className="scr-photo-body">
                    <strong>{label}</strong>
                    <Badge tone="neutral">{t(`screening.imageCategories.${staged?.category || imageCategory}`)}</Badge>
                    {photo && !staged
                      ? <Badge tone="success">{t(photo.is_enhanced ? "screening.enhancedSaved" : "screening.photoSaved", { size: formatLocalizedNumber(Math.round(photo.size_bytes / 1024), language) })}</Badge>
                      : staged
                        ? stagedStatusBadge({ ...staged, view })
                        : <Badge tone="neutral">{t("screening.photoMissing")}</Badge>}
                    {photo?.has_ai_enhanced && !staged && <Badge tone="info">{t("screening.aiEnhancedBadge")}</Badge>}
                    {staged && displayQuality && (
                      <div className={`scr-quality-result ${displayQuality.status || "check"}`}>
                        <strong>{t(displayQuality.status === "good" ? "screening.qualityLooksGood" : "screening.qualityReview")}</strong>
                        {qualityWarnings(displayQuality).map((warning) => <span key={warning}>{warning}</span>)}
                      </div>
                    )}
                    {staged?.validation && (
                      <div className={`scr-quality-result ${blocked ? "check" : "good"}`}>
                        <strong>{t(VALIDATION_STATUS_KEYS[staged.validation.status] || "screening.validationNeedsReview")}</strong>
                        {staged.validation.reason && <span>{staged.validation.reason}</span>}
                        {staged.validation.detected_category && (
                          <span>{t("screening.detectedCategory", { category: staged.validation.detected_category })}</span>
                        )}
                      </div>
                    )}
                    <div className="scr-photo-actions">
                      <Button type="button" variant="secondary" size="sm" onClick={() => openCamera(view)} disabled={isBusy}>
                        <Camera size={14} /> {staged ? t("screening.retakePhoto") : t(photo ? "screening.replacePhoto" : "screening.useCamera")}
                      </Button>
                      <label className={`btn btn-secondary btn-sm scr-upload ${isBusy ? "disabled" : ""}`}>
                        <Upload size={14} /> {t("screening.choosePhoto")}
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t("screening.photoInput", { view: label })}
                          disabled={isBusy} onChange={(event) => chooseFile(view, event)} />
                      </label>
                      {(staged || photo) && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewView(view)} disabled={isBusy}>
                          <Eye size={14} /> {t("screening.previewPhoto")}
                        </Button>
                      )}
                      {photo && !staged && !photo.has_ai_enhanced && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => aiEnhanceSaved(view)} disabled={isBusy || Boolean(enhancing[view])}>
                          <Sparkles size={14} /> {t("screening.aiEnhance")}
                        </Button>
                      )}
                      {staged && (
                        <Button
                          type="button"
                          onClick={() => savePhotos([view])}
                          disabled={isBusy || Boolean(uploading) || blocked || Boolean(enhancing[view]) || Boolean(validating[view])}
                        >
                          {t("screening.savePhoto")}
                        </Button>
                      )}
                      {(photo || staged) && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => removePhoto(view)} disabled={isBusy}>
                          <Trash2 size={14} /> {t("screening.removePhoto")}
                        </Button>
                      )}
                    </div>
                    {isBusy && (
                      <small className="scr-muted" role="status">
                        {enhancing[view]
                          ? t("screening.aiEnhancing")
                          : validating[view]
                            ? t("screening.validatingImage")
                            : t("screening.uploading")}
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {unsaved.length > 0 && (
            <div className="scr-unsaved">
              <Alert type="warning">{t("screening.photosNotSaved", { count: formatLocalizedNumber(unsaved.length, language) })}</Alert>
              <Button
                type="button"
                onClick={() => savePhotos(uploadable)}
                disabled={anyBusy || !allStagedReadyToSave || uploadable.length === 0}
              >
                <Upload size={16} /> {t("screening.saveAllPhotos")}
              </Button>
            </div>
          )}
          {missing.length > 0 && <Alert type="info">{t("screening.photosStillNeeded", { count: formatLocalizedNumber(missing.length, language) })}</Alert>}
          <div className="scr-unsaved">
            <Button type="button" onClick={analyzeScreening} loading={analyzing}
              disabled={!canAnalyze || anyBusy || analyzing}>
              <Sparkles size={16} /> {t(analysisResult ? "screening.retryAnalysis" : "screening.analyzeImages")}
            </Button>
            <p className="scr-quality-disclaimer">{t("screening.aiAnalysisDisclaimer")}</p>
          </div>
          {analysisResult && (
            <OralScreeningReport
              photos={reportImages}
              screeningDate={analysisResult.screening_date || screening.screening_date}
            />
          )}
        </>
      )}

      {cameraView && (
        <div className="scr-modal-backdrop">
          <section className="scr-camera-dialog" role="dialog" aria-modal="true" aria-label={t("screening.cameraTitle")}>
            <header><h3>{t("screening.cameraTitle")}</h3><Button type="button" variant="secondary" size="sm" onClick={stopCamera} aria-label={t("screening.closeCamera")}><X size={18} /></Button></header>
            <video ref={videoRef} autoPlay playsInline muted aria-label={t("screening.cameraPreview")} />
            <div className="scr-actions">
              <Button type="button" onClick={capture} disabled={!cameraStream}>{t("screening.capturePhoto")}</Button>
              <Button type="button" variant="secondary" onClick={stopCamera}>{t("screening.closeCamera")}</Button>
            </div>
          </section>
        </div>
      )}

      {previewView && (
        <div className="scr-modal-backdrop">
          <section className="scr-preview-dialog" role="dialog" aria-modal="true" aria-label={t("screening.previewPhoto")}>
            <header><h3>{getCodeLabel("photoViews", previewView, language)}</h3><Button type="button" variant="secondary" size="sm" onClick={() => setPreviewView("")} aria-label={t("screening.closePreview")}><X size={18} /></Button></header>
            <div className={previewEnhanced ? "scr-image-comparison" : ""}>
              <figure><img src={previewOriginal} alt={t("screening.originalLabel")} /><figcaption>{t("screening.originalLabel")}</figcaption></figure>
              {previewEnhanced && <figure><img src={previewEnhanced} alt={t("screening.aiEnhancedLabel")} /><figcaption>{t("screening.aiEnhancedLabel")}</figcaption></figure>}
            </div>
            {previewEnhanced && <p className="scr-ai-note">{t("screening.aiEnhanceNote")}</p>}
            <Button type="button" variant="secondary" onClick={() => setPreviewView("")}>{t("screening.closePreview")}</Button>
          </section>
        </div>
      )}

      <div className="scr-nav">
        <span />
        <Button type="button" onClick={onNext} disabled={!canContinue}>{t("screening.next")}</Button>
      </div>
    </div>
  );
}
