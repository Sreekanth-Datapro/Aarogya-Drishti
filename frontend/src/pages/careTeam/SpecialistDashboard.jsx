import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Building2,
  CalendarClock,
  Image as ImageIcon,
  Microscope,
  RefreshCw,
  Search,
  Siren,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { Alert, Button, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import SpecialistAvailabilityRequests from "./SpecialistAvailabilityRequests";
import "./SpecialistDashboard.css";

const PAGE_SIZE = 10;
const FILTERS = ["all", "pending", "urgent", "completed"];
const DECISION_OPTIONS = [
  { value: "VIDEO_CONSULTATION", icon: Video },
  { value: "DIRECT_HOSPITAL_VISIT", icon: Building2 },
  { value: "ADDITIONAL_INVESTIGATIONS", icon: Microscope },
  { value: "CLINICAL_FOLLOW_UP", icon: CalendarClock },
  { value: "EMERGENCY_HOSPITAL_REFERRAL", icon: Siren },
];
const CARE_PLAN_DECISIONS = ["VIDEO_CONSULTATION", "DIRECT_HOSPITAL_VISIT", "CLINICAL_FOLLOW_UP"];
const EMPTY_MEDICINE = {
  medicine_name: "",
  dosage: "",
  frequency: "",
  duration_days: "7",
  precautions: "",
};
const EMPTY_DASHBOARD = { assigned: 0, pending: 0, urgent: 0, completed: 0 };

function formattedDate(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formattedTime(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readableCode(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
}

function translatedCode(group, value, t) {
  if (!value) return "—";
  const key = `labels.${group}.${value}`;
  const translated = t(key);
  return translated === key ? readableCode(value) : translated;
}

function translatedSpecialistCode(code, t) {
  const key = `specialist.${code}`;
  const translated = t(key);
  return translated === key ? readableCode(code) : translated;
}

function enhancementErrorMessage(code, fallback, t) {
  const stageCodes = {
    PHOTO_ENHANCEMENT_STORAGE_CHECK_FAILED: "STORAGE_CHECK",
    PHOTO_ENHANCEMENT_EXISTING_IMAGE_READ_FAILED: "EXISTING_IMAGE_READ",
    PHOTO_ENHANCEMENT_ORIGINAL_IMAGE_READ_FAILED: "ORIGINAL_IMAGE_READ",
    PHOTO_ENHANCEMENT_MODEL_FAILED: "MODEL",
    PHOTO_ENHANCEMENT_OUTPUT_INVALID: "OUTPUT_VALIDATION",
    PHOTO_ENHANCEMENT_UPLOAD_FAILED: "STORAGE_UPLOAD",
    PHOTO_ENHANCEMENT_VERIFY_FAILED: "STORAGE_VERIFY",
    IMAGE_STORAGE_ACCESS_DENIED: "STORAGE_ACCESS",
    IMAGE_STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
    IMAGE_STORAGE_CHECK_FAILED: "STORAGE_CHECK",
    IMAGE_STORAGE_DOWNLOAD_FAILED: "STORAGE_DOWNLOAD",
    IMAGE_STORAGE_UPLOAD_FAILED: "STORAGE_UPLOAD",
  };
  const stage = stageCodes[code];
  if (stage) return t(`specialist.enhancementFailure${stage}`);
  return fallback || t("specialist.enhancementRetryFailed");
}

function PhotoComparison({ referralId, image, t }) {
  const [original, setOriginal] = useState({ url: "", loading: true, error: false });
  const [enhanced, setEnhanced] = useState({
    url: "",
    loading: true,
    error: false,
    message: "",
  });
  const [retry, setRetry] = useState(0);
  const [enhancementStatus, setEnhancementStatus] = useState(image.enhancement_status);
  const [enhancing, setEnhancing] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    let active = true;
    const objectUrls = [];

    async function loadImage(url, setter) {
      setter({ url: "", loading: true, error: false, message: "" });
      try {
        const response = await api.get(url, { responseType: "blob" });
        const objectUrl = URL.createObjectURL(response.data);
        objectUrls.push(objectUrl);
        if (active) setter({ url: objectUrl, loading: false, error: false, message: "" });
        if (setter === setEnhanced) setRetryError("");
      } catch (requestError) {
        const code = requestError?.response?.data?.code;
        const message = setter === setEnhanced
          ? enhancementErrorMessage(
            code,
            requestError?.response?.data?.message,
            t
          )
          : "";
        if (active) setter({ url: "", loading: false, error: true, message });
      }
    }

    loadImage(
      `/specialist/referrals/${referralId}/images/${image.id}/file`,
      setOriginal
    );
    loadImage(
      `/specialist/referrals/${referralId}/images/${image.id}/enhanced-file`,
      setEnhanced
    );

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [referralId, image.id, retry, t]);

  useEffect(() => {
    setEnhancementStatus(image.enhancement_status);
  }, [image.enhancement_status]);

  const imageLabel = image.annotation_site
    || translatedCode("photoViews", image.view_type, t)
    || t("specialist.oralImage");
  const retryEnhancement = async () => {
    setEnhancing(true);
    setRetryError("");
    try {
      await api.post(`/specialist/referrals/${referralId}/images/${image.id}/enhance`);
      setEnhancementStatus("AVAILABLE");
      setRetry((value) => value + 1);
    } catch (requestError) {
      setEnhancementStatus("FAILED");
      setRetryError(enhancementErrorMessage(
        requestError?.response?.data?.code,
        requestError?.response?.data?.message,
        t
      ));
      setRetry((value) => value + 1);
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <article className="specialist-photo-card">
      <h4><ImageIcon size={16} aria-hidden="true" /> {imageLabel}</h4>
      <div className="specialist-photo-pair">
        <div className="specialist-photo-panel">
          <strong>{t("specialist.originalImage")}</strong>
          {original.loading ? <div className="specialist-photo-state" role="status">{t("specialist.imageLoading")}</div>
            : original.error ? <div className="specialist-photo-state">{t("specialist.imageUnavailable")}</div>
              : <a href={original.url} target="_blank" rel="noreferrer">
                <img src={original.url} alt={`${imageLabel} - ${t("specialist.originalImage")}`} />
              </a>}
          {image.width_px && image.height_px && (
            <small>{image.width_px} × {image.height_px} px</small>
          )}
        </div>
        <div className="specialist-photo-panel">
          <strong>{t("specialist.enhancedImage")}</strong>
          {enhanced.loading ? <div className="specialist-photo-state" role="status">{t("specialist.imageLoading")}</div>
            : enhanced.error ? <div className="specialist-photo-state specialist-photo-error">
              <span>{enhancementStatus === "NOT_PERFORMED"
                ? t("specialist.enhancementNotPerformedDetails")
                : enhancementStatus === "PROCESSING"
                  ? t("specialist.enhancementProcessing")
                  : enhancementStatus === "UNAVAILABLE"
                  ? t("specialist.enhancementUnavailableDetails")
                  : image.enhancement_failure_stage
                    ? t(`specialist.enhancementFailure${image.enhancement_failure_stage}`)
                    : t("specialist.enhancementFailed")}</span>
              {enhanced.message && <span role="alert">{enhanced.message}</span>}
              <button type="button" className="specialist-link-button"
                disabled={enhancing || enhancementStatus === "PROCESSING"} onClick={retryEnhancement}>
                {enhancing || enhancementStatus === "PROCESSING"
                  ? t("specialist.enhancementRunning")
                  : t("specialist.retryEnhancement")}
              </button>
              {retryError && <span role="alert">{retryError}</span>}
            </div>
              : <a href={enhanced.url} target="_blank" rel="noreferrer">
                <img src={enhanced.url} alt={`${imageLabel} - ${t("specialist.enhancedImage")}`} />
              </a>}
          {enhanced.url && <small>{t("specialist.enhancementAvailable")}</small>}
        </div>
      </div>
      <p className="specialist-image-safety">{t("specialist.imageSafety")}</p>
    </article>
  );
}

function InvestigationReportFile({ referralId, reportId, t }) {
  const [file, setFile] = useState({ url: "", loading: true, error: false });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    api.get(`/specialist/referrals/${referralId}/reports/${reportId}/file`, {
      responseType: "blob",
    }).then((response) => {
      objectUrl = URL.createObjectURL(response.data);
      if (active) setFile({ url: objectUrl, loading: false, error: false });
    }).catch(() => {
      if (active) setFile({ url: "", loading: false, error: true });
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [referralId, reportId]);

  if (file.loading) return <span className="specialist-report-state" role="status">{t("specialist.reportLoading")}</span>;
  if (file.error) return <span className="specialist-report-state" role="alert">{t("specialist.reportUnavailable")}</span>;
  return <a className="specialist-report-link" href={file.url} target="_blank" rel="noreferrer">{t("specialist.openReport")}</a>;
}

export default function SpecialistDashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [careStats, setCareStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 0, total: 0 });
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [decisionForm, setDecisionForm] = useState({
    decision_type: "",
    clinical_reason: "",
    clinical_recommendation: "",
    instructions: "",
    additional_notes: "",
    priority_id: "",
    follow_up_date: "",
    hospital_id: "",
    investigation_type_id: "",
  });
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [availabilityHospitals, setAvailabilityHospitals] = useState([]);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [availabilityHospital, setAvailabilityHospital] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [cancellingSlotId, setCancellingSlotId] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilitySuccess, setAvailabilitySuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionFieldErrors, setDecisionFieldErrors] = useState({});
  const [decisionSuccess, setDecisionSuccess] = useState("");
  const [sendingToNavigator, setSendingToNavigator] = useState(false);
  const [carePlanForm, setCarePlanForm] = useState({
    clinical_summary: "",
    precautions: "",
    follow_up_instructions: "",
    treatment_start_date: localDateInputValue(),
    hospital_revisit_date: "",
    precautions_duration_days: "",
    medicines: [{ ...EMPTY_MEDICINE }],
  });
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [success, setSuccess] = useState("");

  const carePlanExpectedEnd = useMemo(() => {
    const maxDays = carePlanForm.medicines.reduce((max, row) => {
      const days = Number(row.duration_days) || 0;
      return days > max ? days : max;
    }, 0);
    if (!carePlanForm.treatment_start_date || maxDays < 1) return "";
    const date = new Date(`${carePlanForm.treatment_start_date}T00:00:00`);
    date.setDate(date.getDate() + maxDays);
    return date.toISOString().slice(0, 10);
  }, [carePlanForm.treatment_start_date, carePlanForm.medicines]);

  const loadQueue = useCallback(async (refresh = false) => {
    setError("");
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [dashboardResponse, referralResponse, careResponse] = await Promise.all([
        api.get("/specialist/dashboard"),
        api.get("/specialist/referrals", {
          params: { filter, search, page, page_size: PAGE_SIZE },
        }),
        api.get("/specialist/care/dashboard").catch(() => ({ data: { care: null } })),
      ]);
      setDashboard(dashboardResponse.data.dashboard || EMPTY_DASHBOARD);
      setCareStats(careResponse.data.care || null);
      setReferrals(referralResponse.data.referrals || []);
      setPagination(referralResponse.data.pagination || { page: 1, total_pages: 0, total: 0 });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || t("specialist.loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, page, search, t]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const canManageAvailability = user?.permissions?.includes("appointment.slot_manage");
  const loadAvailability = useCallback(async () => {
    if (!canManageAvailability) return;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      const [slotsResponse, hospitalsResponse] = await Promise.all([
        api.get("/specialist/availability/slots"),
        api.get("/specialist/availability/hospitals"),
      ]);
      setAvailabilitySlots(slotsResponse.data.slots || []);
      setAvailabilityHospitals(hospitalsResponse.data.hospitals || []);
    } catch (requestError) {
      setAvailabilityError(requestError?.response?.data?.message || t("specialist.availabilityLoadFailed"));
    } finally {
      setAvailabilityLoading(false);
    }
  }, [canManageAvailability, t]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const createAvailabilitySlot = async (event) => {
    event.preventDefault();
    const start = new Date(`${availabilityDate}T${availabilityStart}`);
    const end = new Date(`${availabilityDate}T${availabilityEnd}`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setAvailabilityError(t("specialist.availabilityInvalidTime"));
      return;
    }

    setAvailabilitySaving(true);
    setAvailabilityError("");
    setAvailabilitySuccess("");
    try {
      await api.post("/specialist/availability/slots", {
        slot_start: start.toISOString(),
        slot_end: end.toISOString(),
        hospital_id: availabilityHospital || null,
      });
      setAvailabilityStart("");
      setAvailabilityEnd("");
      await loadAvailability();
      setAvailabilitySuccess(t("specialist.availabilityCreated"));
    } catch (requestError) {
      setAvailabilityError(requestError?.response?.data?.message || t("specialist.availabilityCreateFailed"));
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const cancelAvailabilitySlot = async (slotId) => {
    setCancellingSlotId(slotId);
    setAvailabilityError("");
    setAvailabilitySuccess("");
    try {
      await api.delete(`/specialist/availability/slots/${slotId}`);
      await loadAvailability();
      setAvailabilitySuccess(t("specialist.availabilityCancelled"));
    } catch (requestError) {
      setAvailabilityError(requestError?.response?.data?.message || t("specialist.availabilityCancelFailed"));
    } finally {
      setCancellingSlotId("");
    }
  };

  const openReferral = async (referralId) => {
    setDetailError("");
    setSuccess("");
    setSelected(null);
    setDetailLoading(true);
    try {
      const response = await api.get(`/specialist/referrals/${referralId}`);
      const details = response.data;
      setSelected(details);
      setDecisionError("");
      setDecisionFieldErrors({});
      setDecisionSuccess("");
      const decision = details.specialist_decision;
      setDecisionForm({
        decision_type: decision?.decision_type || "",
        clinical_reason: decision?.clinical_reason || "",
        clinical_recommendation: decision?.clinical_recommendation || "",
        instructions: decision?.instructions || "",
        additional_notes: decision?.additional_notes || "",
        priority_id: decision?.priority_id ? String(decision.priority_id) : String(details.referral.priority_id || ""),
        follow_up_date: decision?.follow_up_date
          ? String(decision.follow_up_date).slice(0, 10)
          : "",
        hospital_id: decision?.hospital_id ? String(decision.hospital_id) : "",
        investigation_type_id: decision?.investigation_type_id
          ? String(decision.investigation_type_id)
          : "",
      });
    } catch (requestError) {
      setDetailError(requestError?.response?.data?.message || t("specialist.detailFailed"));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitAssessment = async (event, sign) => {
    event.preventDefault();
    if (!selected?.referral?.id) return;
    setDecisionError("");
    if (sign) {
      const fieldErrors = {};
      if (!decisionForm.decision_type) fieldErrors.decision_type = t("specialist.decisionTypeRequired");
      if (!decisionForm.clinical_reason.trim()) fieldErrors.clinical_reason = t("specialist.decisionReasonRequired");
      if (decisionForm.decision_type === "DIRECT_HOSPITAL_VISIT" && !decisionForm.hospital_id) {
        fieldErrors.hospital_id = t("specialist.decisionHospitalRequired");
      }
      if (decisionForm.decision_type === "ADDITIONAL_INVESTIGATIONS" && !decisionForm.investigation_type_id) {
        fieldErrors.investigation_type_id = t("specialist.investigationTypeRequired");
      }
      if (decisionForm.decision_type === "CLINICAL_FOLLOW_UP") {
        if (!decisionForm.follow_up_date) fieldErrors.follow_up_date = t("specialist.followUpDateRequired");
        else if (decisionForm.follow_up_date < localDateInputValue()) {
          fieldErrors.follow_up_date = t("specialist.followUpDatePast");
        }
      }
      if (decisionForm.decision_type === "VIDEO_CONSULTATION") {
        if (selected.teleconsult_consent?.status !== "ACTIVE") {
          fieldErrors.teleconsult_consent = t("specialist.teleconsultConsentRequired");
        }
      }
      setDecisionFieldErrors(fieldErrors);
      if (Object.keys(fieldErrors).length) return;
      if (event.currentTarget.form && !event.currentTarget.form.reportValidity()) return;
    } else {
      setDecisionFieldErrors({});
      if (!decisionForm.clinical_reason.trim()) {
        setDecisionError(t("specialist.decisionReasonRequired"));
        return;
      }
    }
    if (sign && !window.confirm(t("specialist.decisionConfirm"))) return;
    setSaving(true);
    setDecisionError("");
    setDecisionSuccess("");
    try {
      const body = {
        ...decisionForm,
        priority_id: decisionForm.priority_id || null,
        follow_up_date: decisionForm.follow_up_date || null,
        hospital_id: decisionForm.hospital_id || null,
        investigation_type_id: decisionForm.investigation_type_id || null,
      };
      if (sign) {
        await api.post(`/specialist/referrals/${selected.referral.id}/assessment/sign`, body);
      } else {
        await api.put(`/specialist/referrals/${selected.referral.id}/assessment/draft`, body);
      }
      await openReferral(selected.referral.id);
      await loadQueue(true);
      setDecisionSuccess(sign ? t("specialist.decisionSubmitted") : t("specialist.decisionDraftSaved"));
    } catch (requestError) {
      setDecisionError(requestError?.response?.data?.message || t("specialist.decisionSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const chooseDecision = (event) => {
    const decisionType = event.currentTarget.dataset.decision;
    setDecisionForm((current) => ({ ...current, decision_type: decisionType }));
    setDecisionError("");
    setDecisionFieldErrors({});
  };

  const statCards = useMemo(() => [
    { key: "assigned", label: t("specialist.statAssigned"), icon: Users, tone: "green" },
    { key: "pending", label: t("specialist.statPending"), icon: ClipboardList, tone: "amber" },
    { key: "urgent", label: t("specialist.statUrgent"), icon: AlertCircle, tone: "rose" },
    { key: "completed", label: t("specialist.statCompleted"), icon: CheckCircle2, tone: "violet" },
  ], [t]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchText.trim());
  };

  const updateDecisionField = (field, value) => {
    setDecisionForm((current) => ({ ...current, [field]: value }));
    setDecisionFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  return (
    <div className="care-page specialist-page">
      <DashboardBanner className="care-hero specialist-hero">
        <div>
          <span className="care-eyebrow"><Stethoscope size={15} aria-hidden="true" /> {t("specialist.eyebrow")}</span>
          <h1 className="care-hero-title">{t("specialist.title")}</h1>
          <p className="care-hero-text">{t("specialist.intro")}</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => loadQueue(true)}>
          {t("specialist.refresh")}
        </Button>
      </DashboardBanner>

      <section className="specialist-stats" aria-label={t("specialist.overview")}>
        {statCards.map((card) => (
          <StatCard key={card.key} icon={card.icon} tone={card.tone} label={card.label} value={dashboard[card.key] ?? 0} />
        ))}
      </section>

      {careStats && (
        <section className="specialist-stats" aria-label={t("care.spTitle")}>
          <StatCard label={t("care.statActivePlans")} value={careStats.active_care_plans} />
          <StatCard label={t("care.statReassessment")} value={careStats.reassessment_queue} />
          <StatCard label={t("care.statRevisitDue")} value={careStats.revisit_due} />
          <StatCard label={t("care.statMissedRevisit")} value={careStats.missed_revisit} />
          <StatCard label={t("care.statReportsPending")} value={careStats.reports_pending_review} />
          <StatCard label={t("care.statClosed")} value={careStats.closed_cases} />
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link className="btn btn-secondary" to="/specialist/care">{t("modules.spFollowUps.title")}</Link>
          </div>
        </section>
      )}

      {canManageAvailability && (
        <section className="district-card specialist-availability" aria-labelledby="specialist-availability-title">
          <div className="specialist-section-heading">
            <div>
              <h2 id="specialist-availability-title" className="district-card-title">{t("specialist.availabilityTitle")}</h2>
              <p className="care-muted">{t("specialist.availabilityHint")}</p>
            </div>
            <Button variant="secondary" loading={availabilityLoading} onClick={loadAvailability}>
              {t("specialist.refreshAvailability")}
            </Button>
          </div>
          {availabilityError && <Alert type="error">{availabilityError}</Alert>}
          {availabilitySuccess && <Alert type="success">{availabilitySuccess}</Alert>}
          <form className="specialist-availability-form" onSubmit={createAvailabilitySlot}>
            <label>
              {t("specialist.availabilityDate")}
              <input
                type="date"
                required
                min={localDateInputValue()}
                value={availabilityDate}
                onChange={(event) => setAvailabilityDate(event.target.value)}
              />
            </label>
            <label>
              {t("specialist.availabilityStart")}
              <input
                type="time"
                required
                value={availabilityStart}
                onChange={(event) => setAvailabilityStart(event.target.value)}
              />
            </label>
            <label>
              {t("specialist.availabilityEnd")}
              <input
                type="time"
                required
                value={availabilityEnd}
                onChange={(event) => setAvailabilityEnd(event.target.value)}
              />
            </label>
            <label>
              {t("specialist.availabilityHospital")}
              <select
                value={availabilityHospital}
                onChange={(event) => setAvailabilityHospital(event.target.value)}
              >
                <option value="">{t("specialist.availabilityAnyHospital")}</option>
                {availabilityHospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {language === "te" ? hospital.name_te || hospital.name_en : hospital.name_en}
                  </option>
                ))}
              </select>
            </label>
            <div className="specialist-availability-mode">
              <span>{t("specialist.availabilityMode")}</span>
              <strong>VIDEO</strong>
            </div>
            <Button type="submit" loading={availabilitySaving}>
              {t("specialist.availabilityCreate")}
            </Button>
          </form>

          <h3 className="specialist-availability-list-title">{t("specialist.availabilitySlotsTitle")}</h3>
          {availabilityLoading ? (
            <p className="care-muted" role="status">{t("specialist.availabilityLoading")}</p>
          ) : availabilitySlots.length ? (
            <div className="specialist-table-wrap">
              <table className="specialist-table">
                <thead>
                  <tr>
                    <th>{t("specialist.availabilityDate")}</th>
                    <th>{t("specialist.availabilityTime")}</th>
                    <th>{t("specialist.availabilityMode")}</th>
                    <th>{t("specialist.availabilityBookingStatus")}</th>
                    <th><span className="sr-only">{t("specialist.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {availabilitySlots.map((slot) => (
                    <tr key={slot.id}>
                      <td data-label={t("specialist.availabilityDate")}>{formattedDate(slot.slot_start, language)}</td>
                      <td data-label={t("specialist.availabilityTime")}>
                        {formattedTime(slot.slot_start, language)} – {formattedTime(slot.slot_end, language)}
                      </td>
                      <td data-label={t("specialist.availabilityMode")}>{slot.mode}</td>
                      <td data-label={t("specialist.availabilityBookingStatus")}>
                        {t(slot.booking_status === "BOOKED"
                          ? "specialist.availabilityBooked"
                          : "specialist.availabilityAvailable")}
                      </td>
                      <td data-label={t("specialist.actions")}>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!slot.can_cancel || Boolean(cancellingSlotId)}
                          loading={cancellingSlotId === slot.id}
                          onClick={() => cancelAvailabilitySlot(slot.id)}
                        >
                          {t("specialist.availabilityCancel")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="care-muted">{t("specialist.availabilityEmpty")}</p>
          )}
        </section>
      )}

      <SpecialistAvailabilityRequests />

      {error && <Alert type="error">{error} <button type="button" className="specialist-link-button" onClick={() => loadQueue()}>{t("common.tryAgain")}</button></Alert>}
      {detailError && <Alert type="error">{detailError}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <section className="district-card specialist-queue" aria-labelledby="specialist-queue-title">
        <div className="specialist-section-heading">
          <div>
            <h2 id="specialist-queue-title" className="district-card-title">{t("specialist.queueTitle")}</h2>
            <p className="care-muted">{t("specialist.queueHint")}</p>
          </div>
          <span className="specialist-count">{pagination.total} {t("specialist.referralCount")}</span>
        </div>

        <form className="specialist-search" onSubmit={handleSearch}>
          <label className="sr-only" htmlFor="specialist-search-input">{t("specialist.searchLabel")}</label>
          <input
            id="specialist-search-input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("specialist.searchPlaceholder")}
          />
          <Button type="submit" icon={Search}>{t("specialist.search")}</Button>
        </form>

        <div className="navigator-filters" role="group" aria-label={t("specialist.filterLabel")}>
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`navigator-filter${filter === value ? " active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => { setFilter(value); setPage(1); }}
            >
              {t(`specialist.filter${value[0].toUpperCase()}${value.slice(1)}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="navigator-loading" role="status">{t("specialist.loading")}</div>
        ) : referrals.length === 0 ? (
          <div className="navigator-empty">
            <Search size={24} aria-hidden="true" />
            <strong>{t("specialist.emptyTitle")}</strong>
            <span>{t("specialist.emptyText")}</span>
          </div>
        ) : (
          <div className="specialist-table-wrap">
            <table className="specialist-table">
              <thead>
                <tr>
                  <th>{t("specialist.patient")}</th>
                  <th>{t("specialist.referral")}</th>
                  <th>{t("specialist.priority")}</th>
                  <th>{t("specialist.hospital")}</th>
                  <th>{t("specialist.status")}</th>
                  <th><span className="sr-only">{t("specialist.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td data-label={t("specialist.patient")}>
                      <strong>{referral.patient_name}</strong>
                      <small>{referral.patient_code}</small>
                    </td>
                    <td data-label={t("specialist.referral")}>
                      <strong>{referral.referral_code}</strong>
                      <small>{referral.specialty_name}</small>
                    </td>
                    <td data-label={t("specialist.priority")}>
                      <span className={`navigator-priority priority-${String(referral.priority_code || "").toLowerCase()}`}>
                        {referral.priority_name}
                      </span>
                    </td>
                    <td data-label={t("specialist.hospital")}>{referral.hospital_name}</td>
                    <td data-label={t("specialist.status")}>
                      {referral.assessment_completed_at ? t("specialist.completed") : t("specialist.pending")}
                    </td>
                    <td data-label={t("specialist.actions")}>
                      <Button variant="secondary" size="sm" onClick={() => openReferral(referral.id)}>
                        {t("specialist.openDetails")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailLoading && <div className="navigator-loading" role="status">{t("specialist.detailLoading")}</div>}

        {!loading && pagination.total_pages > 0 && (
          <div className="navigator-pagination">
            <span>{t("specialist.pageInfo", { page: pagination.page, pages: pagination.total_pages, total: pagination.total })}</span>
            <div>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("specialist.previous")}</Button>
              <Button variant="secondary" disabled={page >= pagination.total_pages} onClick={() => setPage((value) => value + 1)}>{t("specialist.next")}</Button>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <section className="district-card specialist-detail" aria-labelledby="specialist-detail-title">
          <div className="specialist-section-heading">
            <div>
              <h2 id="specialist-detail-title" className="district-card-title">{selected.referral.patient_name}</h2>
              <p className="care-muted">{selected.referral.patient_code} · {selected.referral.referral_code}</p>
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>{t("specialist.closeDetails")}</Button>
          </div>

          <div className="specialist-detail-grid">
            <article>
              <h3>{t("specialist.patientDetails")}</h3>
              <dl className="specialist-facts">
                <div><dt>{t("specialist.patientId")}</dt><dd>{selected.referral.patient_code || "—"}</dd></div>
                <div><dt>{t("specialist.patientName")}</dt><dd>{selected.referral.patient_name || "—"}</dd></div>
                <div><dt>{t("specialist.age")}</dt><dd>{selected.referral.age_years ?? "—"}</dd></div>
                <div><dt>{t("specialist.sex")}</dt><dd>{translatedCode("sexes", selected.referral.patient_sex, t)}</dd></div>
                <div><dt>{t("specialist.hospital")}</dt><dd>{selected.referral.hospital_name || "—"}</dd></div>
                <div><dt>{t("specialist.facility")}</dt><dd>{selected.referral.screening_facility_name || selected.referral.source_facility_name || "—"}</dd></div>
                <div><dt>{t("specialist.specialty")}</dt><dd>{selected.referral.specialty_name || "—"}</dd></div>
              </dl>
            </article>

            <article>
              <h3>{t("specialist.medicalHistory")}</h3>
              {selected.section_errors?.medical_history
                ? <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
                : selected.medical_history?.length ? selected.medical_history.map((history, index) => (
                <div className="specialist-text-row" key={`${history.history_kind}-${history.recorded_at}-${index}`}>
                  <strong>{t(`specialist.historyKind${history.history_kind}`) || readableCode(history.history_kind)}</strong>
                  <span>
                    {history.condition_text || (language === "te"
                      ? history.exposure_name_te || history.exposure_name
                      : history.exposure_name || history.exposure_name_te) || t("specialist.historyDetailsUnavailable")}
                    {history.is_current === true ? ` · ${t("specialist.current")}` : ""}
                    {history.duration_years != null ? ` · ${t("specialist.durationYears", { count: history.duration_years })}` : ""}
                    {history.frequency_per_day != null ? ` · ${t("specialist.frequencyPerDay", { count: history.frequency_per_day })}` : ""}
                    {history.event_date ? ` · ${formattedDate(history.event_date, language)}` : ""}
                  </span>
                </div>
                )) : <p className="care-muted">{t("specialist.noMedicalHistory")}</p>}
              <p className="care-muted">{t("specialist.medicationsAllergiesUnavailable")}</p>
            </article>

            <article>
              <h3>{t("specialist.screeningDetails")}</h3>
              <dl className="specialist-facts">
                <div><dt>{t("specialist.screeningDate")}</dt><dd>{formattedDate(selected.referral.screening_date, language)}</dd></div>
                <div><dt>{t("specialist.screeningStatus")}</dt><dd>{translatedCode("caseStates", selected.referral.screening_case_state, t)}</dd></div>
                <div><dt>{t("specialist.symptoms")}</dt><dd>{selected.referral.chief_complaint || t("specialist.notRecorded")}</dd></div>
                <div><dt>{t("specialist.painScore")}</dt><dd>{t("specialist.painScoreUnavailable")}</dd></div>
                <div><dt>{t("specialist.clinicalExam")}</dt><dd>{selected.referral.clinical_exam_done ? t("specialist.yes") : t("specialist.no")}</dd></div>
                <div><dt>{t("specialist.tobaccoHistory")}</dt><dd>{selected.referral.tobacco_current == null ? t("specialist.notRecorded") : selected.referral.tobacco_current ? t("specialist.yes") : t("specialist.no")}</dd></div>
                <div><dt>{t("specialist.screeningObservations")}</dt><dd>{selected.referral.screening_notes || t("specialist.notRecorded")}</dd></div>
                <div><dt>{t("specialist.submittedAt")}</dt><dd>{formattedDate(selected.referral.screening_submitted_at, language)}</dd></div>
              </dl>
              <h4>{t("specialist.screeningFindings")}</h4>
              {selected.section_errors?.screening_findings
                ? <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
                : selected.findings?.length ? selected.findings.map((finding) => (
                <div className="specialist-text-row" key={finding.id}>
                  <strong>{(language === "te"
                    ? finding.symptom_name_te || finding.symptom_name
                    : finding.symptom_name || finding.symptom_name_te)
                    || translatedSpecialistCode(`findingKind${finding.finding_kind}`, t)}</strong>
                  <span>
                    {finding.oral_site ? translatedCode("oralViews", finding.oral_site, t) : "—"}
                    {finding.description ? ` · ${finding.description}` : ""}
                    {finding.duration_days != null ? ` · ${t("specialist.durationDays", { count: finding.duration_days })}` : ""}
                    {finding.symptom_name_te ? ` · ${finding.symptom_name_te}` : ""}
                  </span>
                </div>
                )) : <p className="care-muted">{t("specialist.noFindings")}</p>}
            </article>

            <article>
              <h3>{t("specialist.medicalOfficerReferral")}</h3>
              <dl className="specialist-facts">
                <div><dt>{t("specialist.referralNumber")}</dt><dd>{selected.referral.referral_code}</dd></div>
                <div><dt>{t("specialist.priority")}</dt><dd>{selected.referral.priority_name || "—"}</dd></div>
                <div><dt>{t("specialist.referralReason")}</dt><dd>{selected.referral.referral_reason || selected.referral.medical_officer_referral_reason || "—"}</dd></div>
                <div><dt>{t("specialist.medicalOfficerFinding")}</dt><dd>{selected.referral.medical_officer_finding || "—"}</dd></div>
                <div><dt>{t("specialist.medicalOfficerImpression")}</dt><dd>{selected.referral.medical_officer_impression || "—"}</dd></div>
                <div><dt>{t("specialist.medicalOfficerRecommendations")}</dt><dd>{selected.referral.medical_officer_recommendations || "—"}</dd></div>
                <div><dt>{t("specialist.medicalOfficerDecision")}</dt><dd>{translatedCode("reviewDecisions", selected.referral.medical_officer_decision, t)}</dd></div>
                <div><dt>{t("specialist.signedBy")}</dt><dd>{selected.referral.medical_officer_name || "—"}</dd></div>
                <div><dt>{t("specialist.signedAt")}</dt><dd>{formattedDate(selected.referral.medical_officer_signed_at, language)}</dd></div>
                <div><dt>{t("specialist.reviewVersion")}</dt><dd>{selected.referral.medical_officer_review_version ?? "—"}</dd></div>
              </dl>
            </article>
          </div>

          <section className="specialist-clinical-section">
            <h3>{t("specialist.aiReportTitle")}</h3>
            <Alert type="info">
              <strong>{t("specialist.aiAdvisoryTitle")}</strong> {t("specialist.aiAdvisory")}
            </Alert>
            {selected.section_errors?.ai_analysis
              ? <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
              : selected.ai_observations?.length ? selected.ai_observations.map((observation) => {
              const details = observation.analysis_details || {};
              const observations = Array.isArray(details.observations) ? details.observations : [];
              const abnormalities = Array.isArray(details.abnormalities) ? details.abnormalities : [];
              const qualityWarnings = Array.isArray(details.image_quality?.warnings)
                ? details.image_quality.warnings
                : [];
              return (
                <article className="specialist-clinical-card" key={observation.id}>
                  <h4>{translatedCode("photoViews", observation.image_view, t)} · {translatedCode("aiStatuses", observation.status, t)}</h4>
                  <dl className="specialist-facts">
                    <div><dt>{t("specialist.aiModel")}</dt><dd>{observation.model_provider} · {observation.model_version}{observation.model_name ? ` · ${observation.model_name}` : ""}</dd></div>
                    <div><dt>{t("specialist.analysisDate")}</dt><dd>{formattedDate(observation.completed_at || observation.requested_at, language)}</dd></div>
                    <div><dt>{t("specialist.aiFinding")}</dt><dd>{details.classification
                      ? translatedCode("aiClassifications", details.classification, t)
                      : translatedCode("aiResults", observation.result_label, t)}</dd></div>
                    <div><dt>{t("specialist.modelConfidence")}</dt><dd>{details.model_confidence != null
                      ? `${details.model_confidence}/100`
                      : observation.score == null
                        ? t("specialist.notRecorded")
                        : `${Math.round(Number(observation.score) * 100)}/100`}</dd></div>
                    <div><dt>{t("specialist.imageQuality")}</dt><dd>{translatedCode("qualityStatuses", observation.image_quality_status, t)}</dd></div>
                    <div><dt>{t("specialist.aiUse")}</dt><dd>{observation.is_research_only && !observation.clinical_use
                      ? `${t("specialist.aiResearchOnly")}${observation.permitted_use ? ` · ${observation.permitted_use}` : ""}`
                      : t("specialist.aiAdvisory")}</dd></div>
                  </dl>
                  {observations.length > 0 && <div className="specialist-text-row"><strong>{t("specialist.aiObservations")}</strong>{observations.map((item, index) => <span key={index}>{item}</span>)}</div>}
                  {abnormalities.length > 0 && <div className="specialist-text-row"><strong>{t("specialist.aiReportedFindings")}</strong>{abnormalities.map((item, index) => <span key={index}>{item}</span>)}</div>}
                  {qualityWarnings.length > 0 && <div className="specialist-text-row"><strong>{t("specialist.imageQualityWarnings")}</strong>{qualityWarnings.map((item, index) => <span key={index}>{item}</span>)}</div>}
                  {details.recommendation && <div className="specialist-text-row"><strong>{t("specialist.aiRecommendation")}</strong><span>{details.recommendation}</span></div>}
                  {observation.warning && <p className="care-muted">{observation.warning}</p>}
                </article>
              );
              }) : <p className="care-muted">{t("specialist.noAiResults")}</p>}
            <p className="specialist-image-safety">{t("specialist.aiDisclaimer")}</p>
          </section>

          <section className="specialist-clinical-section">
            <h3>{t("specialist.investigationOrders")}</h3>
            {selected.section_errors?.investigations
              ? <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
              : selected.investigation_orders?.length ? selected.investigation_orders.map((order) => (
              <div className="specialist-clinical-card" key={order.id}>
                <h4>{order.investigation_name_te || order.investigation_name} · {order.status_te || order.status}</h4>
                <p>{order.indication || t("specialist.noInvestigationIndication")}</p>
                <dl className="specialist-facts">
                  <div><dt>{t("specialist.orderedAt")}</dt><dd>{formattedDate(order.ordered_at, language)}</dd></div>
                  <div><dt>{t("specialist.scheduledAt")}</dt><dd>{formattedDate(order.scheduled_at, language)}</dd></div>
                  <div><dt>{t("specialist.performedAt")}</dt><dd>{formattedDate(order.performed_at, language)}</dd></div>
                  <div><dt>{t("specialist.reportReceivedAt")}</dt><dd>{formattedDate(order.report_received_at, language)}</dd></div>
                  <div><dt>{t("specialist.dueDate")}</dt><dd>{formattedDate(order.due_date, language)}</dd></div>
                </dl>
              </div>
                )) : <p className="care-muted">{t("specialist.noInvestigationOrders")}</p>}
            <h4>{t("specialist.reports")}</h4>
            {selected.section_errors?.investigations
              ? <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
              : selected.reports?.length ? selected.reports.map((report) => (
              <article className="specialist-clinical-card" key={report.id}>
                <h4>{report.investigation_name_te || report.investigation_name} · {translatedSpecialistCode(`reportKind${report.doc_kind}`, t)}</h4>
                <p>{report.summary || t("specialist.reportNoSummary")}</p>
                {report.clinician_review && <div className="specialist-text-row"><strong>{t("specialist.clinicianReportReview")}</strong><span>{report.clinician_review}</span></div>}
                <dl className="specialist-facts">
                  <div><dt>{t("specialist.reportDate")}</dt><dd>{formattedDate(report.reported_at || report.created_at, language)}</dd></div>
                  <div><dt>{t("specialist.reportCategory")}</dt><dd>{readableCode(report.clinician_category)}</dd></div>
                  <div><dt>{t("specialist.reportNextAction")}</dt><dd>{report.next_action || "—"}</dd></div>
                  <div><dt>{t("specialist.reportReviewedBy")}</dt><dd>{report.reviewer_name || "—"}</dd></div>
                  <div><dt>{t("specialist.reportReviewDate")}</dt><dd>{formattedDate(report.review_signed_at, language)}</dd></div>
                </dl>
                <InvestigationReportFile
                  referralId={selected.referral.id}
                  reportId={report.id}
                  t={t}
                />
              </article>
                )) : <p className="care-muted">{t("specialist.noReports")}</p>}
          </section>

          <section className="specialist-images">
            <h3>{t("specialist.imagesTitle")}</h3>
            {!selected.image_capture_consent
              ? <Alert type="info">{t("specialist.imageConsentMissing")}</Alert>
              : <>
                {selected.section_errors?.images && (
                  <Alert type="error">{t("specialist.sectionLoadFailed")}</Alert>
                )}
                {selected.image_storage_warning && (
                  <Alert type="error">{t("specialist.imageStorageUnavailable")}</Alert>
                )}
                {selected.section_errors?.images
                  ? null
                  : selected.images?.length
                  ? selected.images.map((image) => (
                  <PhotoComparison key={image.id} referralId={selected.referral.id} image={image} t={t} />
                ))
                  : <p className="care-muted">{t("specialist.noImages")}</p>}
              </>}
          </section>

          <section className="specialist-assessment">
            <h3>{t("specialist.decisionTitle")}</h3>
            <div className="specialist-decision-summary">
              <h4>{t("specialist.decisionCaseDetails")}</h4>
              <dl className="specialist-facts">
                <div><dt>{t("specialist.patientName")}</dt><dd>{selected.referral.patient_name}</dd></div>
                <div><dt>{t("specialist.patientId")}</dt><dd>{selected.referral.patient_code}</dd></div>
                <div><dt>{t("specialist.referralNumber")}</dt><dd>{selected.referral.referral_code}</dd></div>
                <div><dt>{t("specialist.specialty")}</dt><dd>{selected.referral.specialty_name || "—"}</dd></div>
                <div><dt>{t("specialist.priority")}</dt><dd>{selected.referral.priority_name || "—"}</dd></div>
                <div><dt>{t("specialist.consultationStatus")}</dt><dd>
                  {selected.consultations?.[0]?.consultation_status || t("specialist.noConsultation")}
                </dd></div>
                <div><dt>{t("specialist.teleconsultConsent")}</dt><dd>
                  {t(`specialist.teleconsultConsentStatus.${selected.teleconsult_consent?.status || "NOT_GIVEN"}`)}
                </dd></div>
              </dl>
              <div className="specialist-text-row">
                <strong>{t("specialist.referralReason")}</strong>
                <span>{selected.referral.medical_officer_referral_reason || selected.referral.referral_reason || t("specialist.notRecorded")}</span>
              </div>
              <div className="specialist-text-row">
                <strong>{t("specialist.screeningFindings")}</strong>
                {selected.section_errors?.screening_findings
                  ? <span>{t("specialist.sectionLoadFailed")}</span>
                  : selected.findings?.length
                    ? selected.findings.map((finding) => (
                      <span key={finding.id}>
                        {finding.symptom_name || finding.finding_kind}: {finding.description || t("specialist.notRecorded")}
                      </span>
                    ))
                    : <span>{t("specialist.noFindings")}</span>}
              </div>
            </div>

            {selected.specialist_decision?.status === "SIGNED" ? (
              <div className="specialist-decision-signed">
                <Alert type="success">
                  {t("specialist.decisionSignedAt", {
                    date: formattedDate(selected.specialist_decision.signed_at, language),
                  })}
                </Alert>
                <dl className="specialist-facts">
                  <div><dt>{t("specialist.decisionType")}</dt><dd>{t(`specialist.consultationDecisionTypes.${selected.specialist_decision.decision_type}`)}</dd></div>
                  <div><dt>{t("specialist.decisionReason")}</dt><dd>{selected.specialist_decision.clinical_reason}</dd></div>
                  <div><dt>{t("specialist.clinicalRecommendation")}</dt><dd>{selected.specialist_decision.clinical_recommendation || "—"}</dd></div>
                  <div><dt>{t("specialist.decisionInstructions")}</dt><dd>{selected.specialist_decision.instructions || "—"}</dd></div>
                  {selected.specialist_decision.hospital_name && (
                    <div><dt>{t("specialist.hospital")}</dt><dd>{selected.specialist_decision.hospital_name}</dd></div>
                  )}
                  {selected.specialist_decision.investigation_name && (
                    <div><dt>{t("specialist.investigationType")}</dt><dd>{selected.specialist_decision.investigation_name}</dd></div>
                  )}
                  {selected.specialist_decision.follow_up_date && (
                    <div><dt>{t("specialist.followUpDate")}</dt><dd>{formattedDate(selected.specialist_decision.follow_up_date, language)}</dd></div>
                  )}
                </dl>
                {selected.specialist_decision.decision_type === "EMERGENCY_HOSPITAL_REFERRAL"
                  && <Alert type="error">{t("specialist.emergencySubmitted")}</Alert>}
                {!selected.referral.assessment_completed_at
                  && CARE_PLAN_DECISIONS.includes(selected.specialist_decision.decision_type)
                  && user?.permissions?.includes("care.plan_manage") && (
                  <form
                    className="mo-form"
                    style={{ marginTop: "1rem" }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!window.confirm(t("specialist.confirmSendToNavigator"))) return;
                      setSendingToNavigator(true);
                      setDecisionError("");
                      setDecisionSuccess("");
                      try {
                        const payload = {
                          clinical_summary: carePlanForm.clinical_summary,
                          precautions: carePlanForm.precautions || null,
                          follow_up_instructions: carePlanForm.follow_up_instructions || null,
                          treatment_start_date: carePlanForm.treatment_start_date,
                          expected_end_date: carePlanExpectedEnd || undefined,
                          hospital_revisit_date: carePlanForm.hospital_revisit_date,
                          precautions_duration_days: carePlanForm.precautions_duration_days
                            ? Number(carePlanForm.precautions_duration_days)
                            : undefined,
                          medicines: carePlanForm.medicines.map((row) => ({
                            medicine_name: row.medicine_name,
                            dosage: row.dosage,
                            frequency: row.frequency,
                            duration_days: Number(row.duration_days),
                            precautions: row.precautions || null,
                          })),
                        };
                        await api.post(
                          `/specialist/referrals/${selected.referral.id}/send-to-navigator`,
                          payload
                        );
                        setDecisionSuccess(t("specialist.sentToNavigator"));
                        await openReferral(selected.referral.id);
                        await loadQueue(true);
                      } catch (requestError) {
                        setDecisionError(
                          requestError?.response?.data?.message || t("specialist.sendToNavigatorFailed")
                        );
                      } finally {
                        setSendingToNavigator(false);
                      }
                    }}
                  >
                    <Alert type="info">{t("specialist.sendToNavigatorHint")}</Alert>
                    <label className="mo-span-2">{t("care.clinicalSummary")} *
                      <textarea
                        required
                        rows={3}
                        maxLength={4000}
                        value={carePlanForm.clinical_summary}
                        onChange={(event) => setCarePlanForm((c) => ({ ...c, clinical_summary: event.target.value }))}
                      />
                    </label>
                    <label className="mo-span-2">{t("care.precautions")}
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={carePlanForm.precautions}
                        onChange={(event) => setCarePlanForm((c) => ({ ...c, precautions: event.target.value }))}
                      />
                    </label>
                    <label>{t("care.precautionsDurationDays")}
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={carePlanForm.precautions_duration_days}
                        onChange={(event) => setCarePlanForm((c) => ({
                          ...c,
                          precautions_duration_days: event.target.value,
                        }))}
                      />
                    </label>
                    <label className="mo-span-2">{t("care.followUpInstructions")}
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={carePlanForm.follow_up_instructions}
                        onChange={(event) => setCarePlanForm((c) => ({
                          ...c,
                          follow_up_instructions: event.target.value,
                        }))}
                      />
                    </label>
                    <label>{t("care.treatmentStartDate")} *
                      <input
                        required
                        type="date"
                        value={carePlanForm.treatment_start_date}
                        onChange={(event) => setCarePlanForm((c) => ({
                          ...c,
                          treatment_start_date: event.target.value,
                        }))}
                      />
                    </label>
                    <label>{t("care.expectedEndDate")}
                      <input type="date" value={carePlanExpectedEnd} readOnly />
                    </label>
                    <label>{t("care.hospitalRevisitDate")} *
                      <input
                        required
                        type="date"
                        min={carePlanForm.treatment_start_date || undefined}
                        value={carePlanForm.hospital_revisit_date}
                        onChange={(event) => setCarePlanForm((c) => ({
                          ...c,
                          hospital_revisit_date: event.target.value,
                        }))}
                      />
                    </label>
                    {carePlanForm.medicines.map((row, index) => (
                      <div
                        className="mo-span-2"
                        key={`sp-care-med-${index}`}
                        style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}
                      >
                        <label>{t("care.medicineName")} *
                          <input
                            required
                            value={row.medicine_name}
                            onChange={(event) => setCarePlanForm((c) => ({
                              ...c,
                              medicines: c.medicines.map((item, i) => (
                                i === index ? { ...item, medicine_name: event.target.value } : item
                              )),
                            }))}
                          />
                        </label>
                        <label>{t("care.dosage")} *
                          <input
                            required
                            value={row.dosage}
                            onChange={(event) => setCarePlanForm((c) => ({
                              ...c,
                              medicines: c.medicines.map((item, i) => (
                                i === index ? { ...item, dosage: event.target.value } : item
                              )),
                            }))}
                          />
                        </label>
                        <label>{t("care.frequency")} *
                          <input
                            required
                            value={row.frequency}
                            onChange={(event) => setCarePlanForm((c) => ({
                              ...c,
                              medicines: c.medicines.map((item, i) => (
                                i === index ? { ...item, frequency: event.target.value } : item
                              )),
                            }))}
                          />
                        </label>
                        <label>{t("care.durationDays")} *
                          <input
                            required
                            type="number"
                            min="1"
                            max="365"
                            value={row.duration_days}
                            onChange={(event) => setCarePlanForm((c) => ({
                              ...c,
                              medicines: c.medicines.map((item, i) => (
                                i === index ? { ...item, duration_days: event.target.value } : item
                              )),
                            }))}
                          />
                        </label>
                      </div>
                    ))}
                    <div className="mo-span-2" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setCarePlanForm((c) => ({
                          ...c,
                          medicines: [...c.medicines, { ...EMPTY_MEDICINE }],
                        }))}
                      >
                        {t("care.addMedicine")}
                      </Button>
                      <Button type="submit" disabled={sendingToNavigator}>
                        {sendingToNavigator ? t("common.saving") : t("specialist.sendToNavigator")}
                      </Button>
                      <Link className="btn btn-secondary" to="/specialist/diagnostics">
                        {t("care.diagnostics")}
                      </Link>
                    </div>
                  </form>
                )}
                {selected.referral.assessment_completed_at && (
                  <Alert type="success">{t("specialist.alreadySentToNavigator")}</Alert>
                )}
              </div>
            ) : selected.referral.assessment_completed_at ? (
              <Alert type="success">{t("specialist.assessmentAlreadySigned")}</Alert>
            ) : user?.permissions?.includes("consultation.note") ? (
              <form className="specialist-decision-form" onSubmit={(event) => submitAssessment(event, false)}>
                {selected.section_errors?.specialist_decision && (
                  <Alert type="error">{t("specialist.decisionUnavailableUntilMigration")}</Alert>
                )}
                {decisionError && <Alert type="error">{decisionError}</Alert>}
                {decisionSuccess && <Alert type="success">{decisionSuccess}</Alert>}
                <h4>{t("specialist.selectDecision")}</h4>
                <div className="specialist-decision-cards" role="group" aria-label={t("specialist.selectDecision")}>
                  {DECISION_OPTIONS.map(({ value, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      className={`specialist-decision-card${decisionForm.decision_type === value ? " active" : ""}`}
                      aria-pressed={decisionForm.decision_type === value}
                      data-decision={value}
                      onClick={chooseDecision}
                    >
                      <Icon size={22} aria-hidden="true" />
                      <span>{t(`specialist.consultationDecisionTypes.${value}`)}</span>
                    </button>
                  ))}
                </div>

                {decisionForm.decision_type === "EMERGENCY_HOSPITAL_REFERRAL"
                  && <Alert type="error">{t("specialist.emergencyWarning")}</Alert>}

                <label htmlFor="specialist-decision-reason">{t("specialist.decisionReason")}</label>
                <textarea id="specialist-decision-reason" maxLength={4000} required
                  aria-invalid={Boolean(decisionFieldErrors.clinical_reason)}
                  value={decisionForm.clinical_reason}
                  onChange={(event) => updateDecisionField("clinical_reason", event.target.value)} />
                {decisionFieldErrors.clinical_reason && (
                  <p className="specialist-field-error" role="alert">{decisionFieldErrors.clinical_reason}</p>
                )}

                <label htmlFor="specialist-decision-recommendation">{t("specialist.clinicalRecommendation")}</label>
                <textarea id="specialist-decision-recommendation" maxLength={4000}
                  value={decisionForm.clinical_recommendation}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, clinical_recommendation: event.target.value }))} />

                <label htmlFor="specialist-decision-instructions">{t("specialist.decisionInstructions")}</label>
                <textarea id="specialist-decision-instructions" maxLength={4000}
                  value={decisionForm.instructions}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, instructions: event.target.value }))} />

                <label htmlFor="specialist-decision-priority">{t("specialist.decisionPriority")}</label>
                <select id="specialist-decision-priority" value={decisionForm.priority_id}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, priority_id: event.target.value }))}>
                  <option value="">{t("specialist.keepReferralPriority")}</option>
                  {selected.decision_options?.priorities?.map((priority) => (
                    <option key={priority.id} value={priority.id}>
                      {language === "te" ? priority.name_te || priority.name_en : priority.name_en}
                    </option>
                  ))}
                </select>

                {["DIRECT_HOSPITAL_VISIT", "EMERGENCY_HOSPITAL_REFERRAL"].includes(decisionForm.decision_type)
                  && <>
                    <label htmlFor="specialist-decision-hospital">{t("specialist.decisionHospital")}</label>
                    <select id="specialist-decision-hospital"
                      required={decisionForm.decision_type === "DIRECT_HOSPITAL_VISIT"}
                      aria-invalid={Boolean(decisionFieldErrors.hospital_id)}
                      value={decisionForm.hospital_id}
                      onChange={(event) => updateDecisionField("hospital_id", event.target.value)}>
                      <option value="">{t("specialist.selectHospital")}</option>
                      {selected.decision_options?.hospitals?.map((hospital) => (
                        <option key={hospital.id} value={hospital.id}>
                          {language === "te" ? hospital.name_te || hospital.name_en : hospital.name_en}
                        </option>
                      ))}
                    </select>
                    {decisionFieldErrors.hospital_id && (
                      <p className="specialist-field-error" role="alert">{decisionFieldErrors.hospital_id}</p>
                    )}
                  </>}

                {decisionForm.decision_type === "VIDEO_CONSULTATION" && (
                  <div className="specialist-decision-dependent">
                    <p className="care-muted">{t("specialist.teleconsultConsentRequired")}</p>
                    <p className="care-muted">{t("specialist.videoBookingAfterSignoff")}</p>
                    {decisionFieldErrors.teleconsult_consent && (
                      <p className="specialist-field-error" role="alert">{decisionFieldErrors.teleconsult_consent}</p>
                    )}
                  </div>
                )}

                {decisionForm.decision_type === "ADDITIONAL_INVESTIGATIONS" && (
                  <>
                    <label htmlFor="specialist-investigation-type">{t("specialist.investigationType")}</label>
                    <select id="specialist-investigation-type" required
                      aria-invalid={Boolean(decisionFieldErrors.investigation_type_id)}
                      value={decisionForm.investigation_type_id}
                      onChange={(event) => updateDecisionField("investigation_type_id", event.target.value)}>
                      <option value="">{t("specialist.selectInvestigationType")}</option>
                      {selected.decision_options?.investigation_types?.map((type) => (
                        <option key={type.id} value={type.id}>
                          {language === "te" ? type.name_te || type.name_en : type.name_en}
                        </option>
                      ))}
                    </select>
                    {decisionFieldErrors.investigation_type_id && (
                      <p className="specialist-field-error" role="alert">{decisionFieldErrors.investigation_type_id}</p>
                    )}
                  </>
                )}

                {decisionForm.decision_type === "CLINICAL_FOLLOW_UP" && (
                  <>
                    <label htmlFor="specialist-follow-up-date">{t("specialist.followUpDate")}</label>
                    <input id="specialist-follow-up-date" type="date" required min={localDateInputValue()}
                      aria-invalid={Boolean(decisionFieldErrors.follow_up_date)}
                      value={decisionForm.follow_up_date}
                      onChange={(event) => updateDecisionField("follow_up_date", event.target.value)} />
                    {decisionFieldErrors.follow_up_date && (
                      <p className="specialist-field-error" role="alert">{decisionFieldErrors.follow_up_date}</p>
                    )}
                  </>
                )}

                <p className="care-muted">{t("specialist.decisionSignoffHint")}</p>
                <div className="specialist-assessment-actions">
                  <Button type="submit" variant="secondary" loading={saving} disabled={!decisionForm.decision_type}>
                    {t("specialist.saveDraft")}
                  </Button>
                  <Button type="button" loading={saving} disabled={!decisionForm.decision_type}
                    onClick={(event) => submitAssessment(event, true)}>
                    {t("specialist.submitDecision")}
                  </Button>
                </div>
              </form>
            ) : (
              <Alert type="error">{t("specialist.decisionPermissionRequired")}</Alert>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
