import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardPlus, FileCheck2, MapPin, ShieldCheck, UserRound, Users } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getLocalizedField,
  getLocalizedMasterName,
  getSexLabel,
} from "../i18n/displayLabels";
import { apiMessage } from "../i18n/translate";
import {
  listRegistrationDrafts,
  loadDraftPayload,
  removeDraft,
  saveRegistrationDraft,
} from "../offline/drafts";
import { DRAFT_STATUS } from "../offline/constants";
import { Alert, Badge, Button, Card, PageLoader, SelectField, StatCard, TextField } from "../components/ui";
import "./PatientRegistration.css";

const CONSENT_METHODS = ["CHECKBOX", "VERBAL_WITNESSED", "SIGNATURE", "THUMBPRINT"];
const METHOD_KEYS = {
  CHECKBOX: "patientRegistration.methodCheckbox",
  VERBAL_WITNESSED: "patientRegistration.methodVerbal",
  SIGNATURE: "patientRegistration.methodSignature",
  THUMBPRINT: "patientRegistration.methodThumbprint",
};
const WITNESS_METHODS = ["VERBAL_WITNESSED", "THUMBPRINT"];
const LANGUAGE_KEYS = { te: "patientRegistration.languageTelugu", en: "patientRegistration.languageEnglish" };

// A random id for one filled-in form, so pressing "Register" twice saves the patient only once
function newFormId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const part = (length) => Array.from({ length }, hex).join("");
  return `${part(8)}-${part(4)}-4${part(3)}-a${part(3)}-${part(12)}`;
}

function emptyForm(languageId = "") {
  return {
    full_name: "",
    sex: "",
    age_years: "",
    date_of_birth: "",
    preferred_language_id: languageId,
    mandal_id: "",
    village_id: "",
    facility_id: "",
    habitation: "",
    address_line: "",
    consents: { DATA_PROCESSING: false, SCREENING: null, IMAGE_CAPTURE: null },
    consent_method: "CHECKBOX",
    witness_name: "",
    form_id: newFormId(),
  };
}

export default function PatientRegistration() {
  const { t, tm, language } = useLanguage();
  const {
    user,
    isOffline,
    isOnlineAuth,
    getOfflinePin,
    refreshPendingCount,
    runOfflineSync,
  } = useAuth();
  const [form, setForm] = useState(() => emptyForm());
  const [mandals, setMandals] = useState([]);
  const [mandalWide, setMandalWide] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [potentialMatches, setPotentialMatches] = useState([]);

  const applyOptions = useCallback((options) => {
    const assignedMandals = options?.mandals || [];
    setMandals(assignedMandals);
    setMandalWide(options?.mandal_wide === true);
    setLanguages(options?.languages || []);
    setPurposes(options?.consent_purposes || []);
    const telugu = (options?.languages || []).find((item) => item.code === "te");
    setForm((current) => ({
      ...current,
      preferred_language_id: current.preferred_language_id || (telugu ? String(telugu.id) : ""),
      mandal_id: current.mandal_id || (assignedMandals.length === 1 ? String(assignedMandals[0].mandal_id) : ""),
    }));
  }, []);

  const refreshDrafts = useCallback(async () => {
    if (!user?.id) {
      setPendingDrafts([]);
      return;
    }
    try {
      const rows = await listRegistrationDrafts(user.id);
      setPendingDrafts(Array.isArray(rows) ? rows : []);
      await refreshPendingCount(user.id);
    } catch {
      setPendingDrafts([]);
    }
  }, [user?.id, refreshPendingCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isOffline) {
        const { unlockVault } = await import("../offline/vault");
        const pin = getOfflinePin();
        if (!pin) throw new Error("OFFLINE_PIN_REQUIRED");
        const vault = await unlockVault(pin);
        applyOptions(vault.registrationOptions);
        setPatients([]);
        await refreshDrafts();
        return;
      }

      const [optionResponse, patientResponse] = await Promise.all([
        api.get("/patients/registration-options"),
        api.get("/patients/mine"),
      ]);
      applyOptions(optionResponse.data);
      setPatients(patientResponse.data.patients || []);
      await refreshDrafts();
    } catch (requestError) {
      if (requestError?.code === "OFFLINE_MODE_NO_API" || requestError?.message === "OFFLINE_PIN_REQUIRED") {
        setError("offline.pinRequiredForDrafts");
      } else {
        setError(apiMessage(requestError, "patientRegistration.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline, getOfflinePin, applyOptions, refreshDrafts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedMandal = useMemo(
    () => mandals.find((mandal) => String(mandal.mandal_id) === form.mandal_id),
    [form.mandal_id, mandals]
  );
  // Facilities of the Mandal. Without the Mandal-wide rule, only the facilities
  // assigned together with the chosen village can be used.
  const facilityChoices = useMemo(() => {
    if (!selectedMandal) return [];
    if (mandalWide) return selectedMandal.facilities;
    const allowed = new Set(selectedMandal.pairs
      .filter((pair) => String(pair.village_id) === form.village_id)
      .map((pair) => String(pair.facility_id)));
    return selectedMandal.facilities.filter((facility) => allowed.has(String(facility.id)));
  }, [selectedMandal, mandalWide, form.village_id]);

  // Choosing a village (or Mandal) clears a facility that no longer fits;
  // a single possible facility is selected automatically.
  useEffect(() => {
    setForm((current) => {
      const ids = facilityChoices.map((facility) => String(facility.id));
      if (ids.includes(current.facility_id)) return current;
      return { ...current, facility_id: ids.length === 1 ? ids[0] : "" };
    });
  }, [facilityChoices]);

  const update = (field, value) => {
    setPotentialMatches([]);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const chooseMandal = (value) => {
    setPotentialMatches([]);
    setForm((current) => ({ ...current, mandal_id: value, village_id: "", facility_id: "" }));
  };
  const answer = (code, value) => setForm((current) => ({ ...current, consents: { ...current.consents, [code]: value } }));
  const needsWitness = WITNESS_METHODS.includes(form.consent_method);

  const registrationPayload = (confirmPossibleDuplicate = false) => ({
    full_name: form.full_name.trim(),
    sex: form.sex,
    age_years: form.age_years === "" ? null : Number(form.age_years),
    date_of_birth: form.date_of_birth || null,
    preferred_language_id: Number(form.preferred_language_id),
    village_id: Number(form.village_id),
    facility_id: Number(form.facility_id),
    habitation: form.habitation.trim() || null,
    address_line: form.address_line.trim() || null,
    consents: form.consents,
    consent_method: form.consent_method,
    witness_name: needsWitness ? form.witness_name.trim() : null,
    idempotency_key: form.form_id,
    confirm_possible_duplicate: confirmPossibleDuplicate,
    confirmed_duplicate_ids: confirmPossibleDuplicate ? potentialMatches.map((match) => match.id) : [],
  });

  const shouldSaveOffline = () => {
    if (isOffline) return true;
    if (!navigator.onLine && getOfflinePin()) return true;
    return false;
  };

  const saveAsOfflineDraft = async () => {
    const pin = getOfflinePin();
    if (!pin || !user?.id) {
      setError(t("offline.pinRequiredForDrafts"));
      return;
    }
    const payload = {
      ...registrationPayload(false),
      full_name: form.full_name.trim(),
      preferred_language_id: Number(form.preferred_language_id),
      client_created_at: new Date().toISOString(),
      consent_captured_at: new Date().toISOString(),
    };
    await saveRegistrationDraft({
      pin,
      userId: user.id,
      payload,
      status: DRAFT_STATUS.PENDING,
    });
    setSuccess(t("offline.draftSaved"));
    setPotentialMatches([]);
    setForm((current) => ({
      ...emptyForm(current.preferred_language_id),
      mandal_id: current.mandal_id,
      village_id: current.village_id,
      facility_id: current.facility_id,
    }));
    await refreshDrafts();
  };

  const registerPatient = async (confirmPossibleDuplicate = false) => {
    setSaving(true);
    setError("");
    let checkingDuplicates = !confirmPossibleDuplicate;
    try {
      if (shouldSaveOffline()) {
        await saveAsOfflineDraft();
        return;
      }

      if (!confirmPossibleDuplicate) {
        const duplicateResponse = await api.post("/patients/duplicate-check", registrationPayload());
        if (duplicateResponse.data.matches?.length) {
          setPotentialMatches(duplicateResponse.data.matches);
          return;
        }
      }
      checkingDuplicates = false;
      const response = await api.post("/patients", registrationPayload(confirmPossibleDuplicate));
      const { patient } = response.data;
      setSuccess(t(patient.already_registered ? "patientRegistration.alreadyRegistered" : "patientRegistration.created", { code: patient.patient_code }));
      setPotentialMatches([]);
      // Keep the location and language for the next patient of the same village
      setForm((current) => ({
        ...emptyForm(current.preferred_language_id),
        mandal_id: current.mandal_id,
        village_id: current.village_id,
        facility_id: current.facility_id,
      }));
      try {
        const patientResponse = await api.get("/patients/mine");
        setPatients(patientResponse.data.patients || []);
      } catch (requestError) {
        setError(apiMessage(requestError, "patientRegistration.loadFailed"));
      }
    } catch (requestError) {
      // Network drop mid-submit → queue encrypted draft when PIN is available
      if (
        !requestError.response
        && getOfflinePin()
        && (requestError.code === "ERR_NETWORK" || requestError.message === "Network Error" || !navigator.onLine)
      ) {
        try {
          await saveAsOfflineDraft();
          return;
        } catch (draftError) {
          setError(draftError.message || t("offline.draftSaveFailed"));
          return;
        }
      }
      if (requestError.response?.data?.code === "POSSIBLE_DUPLICATES"
          && Array.isArray(requestError.response.data.matches)) {
        setPotentialMatches((current) => {
          const byId = new Map(current.map((match) => [match.id, match]));
          requestError.response.data.matches.forEach((match) => byId.set(match.id, match));
          return [...byId.values()];
        });
      } else {
        setError(apiMessage(
          requestError,
          checkingDuplicates ? "patientExplorer.duplicateCheckFailed" : "patientRegistration.createFailed"
        ));
      }
    } finally {
      setSaving(false);
    }
  };

  const editDraft = async (idempotencyKey) => {
    setError("");
    const pin = getOfflinePin();
    if (!pin) {
      setError(t("offline.pinRequiredForDrafts"));
      return;
    }
    try {
      const loaded = await loadDraftPayload(pin, idempotencyKey);
      if (!loaded) return;
      const p = loaded.payload;
      setForm((current) => ({
        ...current,
        full_name: p.full_name || "",
        sex: p.sex || "",
        age_years: p.age_years == null ? "" : String(p.age_years),
        date_of_birth: p.date_of_birth || "",
        preferred_language_id: p.preferred_language_id != null ? String(p.preferred_language_id) : current.preferred_language_id,
        village_id: p.village_id != null ? String(p.village_id) : "",
        facility_id: p.facility_id != null ? String(p.facility_id) : "",
        habitation: p.habitation || "",
        address_line: p.address_line || "",
        consents: p.consents || current.consents,
        consent_method: p.consent_method || "CHECKBOX",
        witness_name: p.witness_name || "",
        form_id: p.idempotency_key || idempotencyKey,
      }));
      setSuccess(t("offline.draftLoaded"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(t("offline.draftLoadFailed"));
    }
  };

  const discardDraft = async (idempotencyKey) => {
    if (!window.confirm(t("offline.discardDraftConfirm"))) return;
    await removeDraft(idempotencyKey);
    await refreshDrafts();
  };

  const syncDraftsNow = async () => {
    if (!isOnlineAuth) {
      setError(t("offline.syncRequiresOnline"));
      return;
    }
    setSyncing(true);
    setError("");
    try {
      const summary = await runOfflineSync();
      if (summary.skipped) {
        setError(t("offline.syncSkipped"));
      } else {
        setSuccess(
          t("offline.syncResult", {
            synced: summary.synced,
            failed: summary.failed,
            needs: summary.needsConfirmation,
          })
        );
      }
      await refreshDrafts();
      if (isOnlineAuth) {
        try {
          const patientResponse = await api.get("/patients/mine");
          setPatients(patientResponse.data.patients || []);
        } catch {
          // ignore refresh failure after sync
        }
      }
    } catch (err) {
      setError(err?.message || t("offline.syncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setPotentialMatches([]);
    if (!selectedMandal || !form.village_id || !form.facility_id) {
      setError(t("patientRegistration.selectLocationError"));
      return;
    }
    if (!form.age_years && !form.date_of_birth) {
      setError(t("patientRegistration.ageOrDateRequired"));
      return;
    }
    if (!form.consents.DATA_PROCESSING) {
      setError(t("patientRegistration.dataConsentMissing"));
      return;
    }
    if (form.consents.SCREENING === null || form.consents.IMAGE_CAPTURE === null) {
      setError(t("patientRegistration.consentMissing"));
      return;
    }
    if (needsWitness && !form.witness_name.trim()) {
      setError(t("patientRegistration.witnessMissing"));
      return;
    }
    await registerPatient(false);
  };

  const number = (value) => formatLocalizedNumber(value ?? 0, language);
  const consentText = (purpose) => getLocalizedMasterName({ name_en: purpose.text_en, name_te: purpose.text_te }, language);
  const consentName = (purpose) => getLocalizedMasterName(purpose, language);

  if (loading) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="patient-workflow-page">
      <header className="patient-workflow-hero">
        <div>
          <span className="patient-workflow-eyebrow"><MapPin size={15} /> {t("patientRegistration.eyebrow")}</span>
          <h1 className="page-title">{t("modules.healthWorkerPatients.title")}</h1>
          <p className="page-subtitle">{t("patientRegistration.subtitle")}</p>
        </div>
        <div className="patient-registration-header-actions">
          {!isOffline && (
            <Link className="btn btn-secondary" to="/health-worker/patient-search">{t("patientExplorer.searchTitle")}</Link>
          )}
          <StatCard
            icon={Users}
            label={isOffline ? t("offline.pendingBadge", { count: pendingDrafts.length }) : t("patientRegistration.myPatients")}
            value={number(isOffline ? pendingDrafts.length : patients.length)}
          />
        </div>
      </header>

      {isOffline ? (
        <Alert type="warning">{t("offline.registrationOfflineNote")}</Alert>
      ) : (
        <Alert type="info">{t("patientRegistration.assignmentNote")}</Alert>
      )}
      {error && <Alert type="error">{tm(error)}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {pendingDrafts.length > 0 && (
        <Card>
          <div className="patient-workflow-section-heading">
            <span className="patient-workflow-icon"><FileCheck2 size={19} /></span>
            <div>
              <h2>{t("offline.pendingTitle")}</h2>
              <p>{t("offline.pendingDescription")}</p>
            </div>
          </div>
          {isOnlineAuth && (
            <div className="patient-registration-actions" style={{ marginBottom: "1rem" }}>
              <Button type="button" loading={syncing} disabled={syncing} onClick={syncDraftsNow}>
                {t("offline.syncNow")}
              </Button>
            </div>
          )}
          <ul className="patient-duplicate-panel" style={{ listStyle: "none", padding: 0 }}>
            {pendingDrafts.map((draft) => (
              <li key={draft.idempotency_key} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
                <div>
                  <strong>{draft.display_name || t("offline.unnamedDraft")}</strong>
                  <small style={{ display: "block" }}>
                    <Badge tone={draft.status === DRAFT_STATUS.FAILED ? "danger" : draft.status === DRAFT_STATUS.NEEDS_CONFIRMATION ? "warning" : "neutral"}>
                      {t(`offline.status.${draft.status}`)}
                    </Badge>
                    {" · "}
                    {formatLocalizedDate(draft.client_created_at || draft.updated_at, language)}
                  </small>
                  {draft.error_message && <small style={{ display: "block" }}>{draft.error_message}</small>}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button type="button" variant="secondary" onClick={() => editDraft(draft.idempotency_key)}>
                    {t("offline.editDraft")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => discardDraft(draft.idempotency_key)}>
                    {t("offline.discardDraft")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="patient-workflow-section-heading">
          <span className="patient-workflow-icon"><ClipboardPlus size={19} /></span>
          <div>
            <h2>{t("patientRegistration.formTitle")}</h2>
            <p>{t("patientRegistration.formDescription")}</p>
          </div>
        </div>

        <form className="patient-registration-form" onSubmit={submit}>
          {potentialMatches.length > 0 && (
            <div className="patient-duplicate-panel">
              <Alert type="warning">{t("patientExplorer.duplicateHint")}</Alert>
              <h3>{t("patientExplorer.possibleDuplicates")}</h3>
              <ul>
                {potentialMatches.map((match) => (
                  <li key={match.id}>
                    <div>
                      <strong>{match.full_name}</strong>
                      <small>
                        <span className="patient-workflow-code">{match.patient_code}</span>
                        {" · "}{match.sex ? getSexLabel(match.sex, language) : "—"}
                        {" · "}{match.age_years == null ? "—" : number(match.age_years)}
                        {" · "}{match.date_of_birth ? formatLocalizedDate(match.date_of_birth, language) : "—"}
                        {" · "}{getLocalizedField(match, "village_name", language) || "—"}
                        {" · "}{getLocalizedField(match, "facility_name", language) || "—"}
                        {" · "}{formatLocalizedDate(match.created_at, language)}
                      </small>
                      <small>{t(match.match_type === "NAME_SEX_DATE_OF_BIRTH"
                        ? "patientExplorer.matchDateOfBirth"
                        : "patientExplorer.matchAgeVillage")}</small>
                    </div>
                    <Link className="patient-explorer-view" to={`/health-worker/patients/${match.id}`}>
                      {t("patientExplorer.openExisting")}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="patient-registration-actions">
                <Button type="button" variant="secondary" onClick={() => {
                  setPotentialMatches([]);
                  setForm((current) => ({
                    ...emptyForm(current.preferred_language_id),
                    mandal_id: current.mandal_id,
                    village_id: current.village_id,
                    facility_id: current.facility_id,
                  }));
                }}>
                  {t("patientExplorer.cancelRegistration")}
                </Button>
                <Button type="button" loading={saving} disabled={saving} onClick={() => registerPatient(true)}>
                  {t("patientExplorer.continueRegistration")}
                </Button>
              </div>
            </div>
          )}
          <h3 className="patient-form-section"><UserRound size={16} /> {t("patientRegistration.sectionPatient")}</h3>
          <TextField
            id="patient-full-name"
            label={t("patientRegistration.fullName")}
            value={form.full_name}
            onChange={(event) => update("full_name", event.target.value)}
            maxLength={150}
            required
          />
          <SelectField
            id="patient-sex"
            label={t("patientRegistration.sex")}
            value={form.sex}
            onChange={(event) => update("sex", event.target.value)}
            required
          >
            <option value="">{t("patientRegistration.selectSex")}</option>
            {["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].map((sex) => (
              <option key={sex} value={sex}>{getSexLabel(sex, language)}</option>
            ))}
          </SelectField>
          <TextField
            id="patient-age"
            label={t("patientRegistration.age")}
            type="number"
            min="0"
            max="120"
            value={form.age_years}
            onChange={(event) => update("age_years", event.target.value)}
            optionalText={t("patientRegistration.ageOptional")}
          />
          <TextField
            id="patient-date-of-birth"
            label={t("patientRegistration.dateOfBirth")}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={form.date_of_birth}
            onChange={(event) => update("date_of_birth", event.target.value)}
            optionalText={t("patientRegistration.dateOptional")}
          />
          <SelectField
            id="patient-language"
            label={t("patientRegistration.preferredLanguage")}
            value={form.preferred_language_id}
            onChange={(event) => update("preferred_language_id", event.target.value)}
            required
            hint={t("patientRegistration.languageHint")}
          >
            <option value="">{t("patientRegistration.selectLanguage")}</option>
            {languages.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {LANGUAGE_KEYS[item.code] ? t(LANGUAGE_KEYS[item.code]) : item.native_name}
              </option>
            ))}
          </SelectField>

          <h3 className="patient-form-section"><MapPin size={16} /> {t("patientRegistration.sectionLocation")}</h3>
          {!mandals.length && <div className="patient-form-full"><Alert type="warning">{t("patientRegistration.noLocations")}</Alert></div>}
          {mandals.length > 0 && <>
          <TextField
            id="patient-district"
            label={t("patientRegistration.district")}
            value={selectedMandal ? getLocalizedField(selectedMandal, "district_name", language) : ""}
            readOnly
            hint={t("patientRegistration.fixedByAssignment")}
          />
          {mandals.length > 1 ? (
            <SelectField
              id="patient-mandal"
              label={t("patientRegistration.mandal")}
              value={form.mandal_id}
              onChange={(event) => chooseMandal(event.target.value)}
              required
              hint={t("patientRegistration.fixedByAssignment")}
            >
              <option value="">{t("patientRegistration.selectMandal")}</option>
              {mandals.map((mandal) => (
                <option key={mandal.mandal_id} value={String(mandal.mandal_id)}>{getLocalizedField(mandal, "mandal_name", language)}</option>
              ))}
            </SelectField>
          ) : (
            <TextField
              id="patient-mandal"
              label={t("patientRegistration.mandal")}
              value={selectedMandal ? getLocalizedField(selectedMandal, "mandal_name", language) : ""}
              readOnly
              hint={t("patientRegistration.fixedByAssignment")}
            />
          )}
          <SelectField
            id="patient-village"
            label={t("patientRegistration.village")}
            value={form.village_id}
            onChange={(event) => update("village_id", event.target.value)}
            required
            disabled={!selectedMandal}
            hint={t(mandalWide ? "patientRegistration.villageHintMandal" : "patientRegistration.villageHintAssigned")}
          >
            <option value="">{t("patientRegistration.selectVillage")}</option>
            {(selectedMandal?.villages || []).map((village) => (
              <option key={village.id} value={String(village.id)}>{getLocalizedMasterName(village, language)}</option>
            ))}
          </SelectField>
          <SelectField
            id="patient-facility"
            label={t("patientRegistration.facility")}
            value={form.facility_id}
            onChange={(event) => update("facility_id", event.target.value)}
            required
            disabled={!form.village_id}
            hint={t("patientRegistration.facilityHint")}
          >
            <option value="">{t("patientRegistration.selectFacility")}</option>
            {facilityChoices.map((facility) => (
              <option key={facility.id} value={String(facility.id)}>{getLocalizedMasterName(facility, language)}</option>
            ))}
          </SelectField>
          </>}
          <TextField
            id="patient-habitation"
            label={t("patientRegistration.habitation")}
            value={form.habitation}
            onChange={(event) => update("habitation", event.target.value)}
            maxLength={150}
            optionalText={t("patientRegistration.optional")}
          />
          <TextField
            id="patient-address"
            label={t("patientRegistration.address")}
            value={form.address_line}
            onChange={(event) => update("address_line", event.target.value)}
            maxLength={500}
            optionalText={t("patientRegistration.optional")}
          />

          <h3 className="patient-form-section"><ShieldCheck size={16} /> {t("patientRegistration.sectionConsent")}</h3>
          <p className="patient-consent-intro">{t("patientRegistration.consentIntro")}</p>
          <div className="patient-consent-list">
            {purposes.map((purpose) => (
              <fieldset key={purpose.code} className="patient-consent-item">
                <legend>{consentName(purpose)}</legend>
                <p>{consentText(purpose)}</p>
                {purpose.code === "DATA_PROCESSING" ? (
                  <label className="patient-consent-check">
                    <input
                      type="checkbox"
                      checked={form.consents.DATA_PROCESSING}
                      onChange={(event) => answer("DATA_PROCESSING", event.target.checked)}
                    />
                    <span>{t("patientRegistration.dataConsentAgree")}</span>
                    <Badge tone="warning">{t("patientRegistration.requiredToSave")}</Badge>
                  </label>
                ) : (
                  <div className="patient-consent-choice" role="radiogroup" aria-label={consentName(purpose)}>
                    {[true, false].map((value) => (
                      <label key={String(value)} className={form.consents[purpose.code] === value ? "selected" : ""}>
                        <input
                          type="radio"
                          name={`consent-${purpose.code}`}
                          checked={form.consents[purpose.code] === value}
                          onChange={() => answer(purpose.code, value)}
                        />
                        {t(value ? "patientRegistration.consentYes" : "patientRegistration.consentNo")}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            ))}
          </div>
          <SelectField
            id="patient-consent-method"
            label={t("patientRegistration.consentMethod")}
            value={form.consent_method}
            onChange={(event) => update("consent_method", event.target.value)}
            required
          >
            {CONSENT_METHODS.map((method) => <option key={method} value={method}>{t(METHOD_KEYS[method])}</option>)}
          </SelectField>
          {needsWitness ? (
            <TextField
              id="patient-witness"
              label={t("patientRegistration.witnessName")}
              value={form.witness_name}
              onChange={(event) => update("witness_name", event.target.value)}
              maxLength={150}
              required
              hint={t("patientRegistration.witnessHint")}
            />
          ) : <div aria-hidden="true" />}

          <div className="patient-registration-actions">
            <Button type="button" variant="secondary" onClick={() => {
              setPotentialMatches([]);
              setForm(emptyForm(form.preferred_language_id));
            }}>
              {t("patientRegistration.clear")}
            </Button>
            <Button type="submit" loading={saving} disabled={!mandals.length}>
              {shouldSaveOffline() ? t("offline.saveDraft") : t("patientRegistration.submit")}
            </Button>
          </div>
        </form>
      </Card>

      {!isOffline && (
      <Card>
        <div className="patient-workflow-section-heading">
          <span className="patient-workflow-icon"><FileCheck2 size={19} /></span>
          <div>
            <h2>{t("patientRegistration.recentTitle")}</h2>
            <p>{t("patientRegistration.recentDescription")}</p>
          </div>
        </div>
        <div className="patient-workflow-table-wrap">
          <table className="patient-workflow-table">
            <thead>
              <tr>
                <th>{t("patientRegistration.patientCode")}</th>
                <th>{t("patientRegistration.fullName")}</th>
                <th>{t("patientRegistration.ageSex")}</th>
                <th>{t("patientRegistration.village")}</th>
                <th>{t("patientRegistration.mandal")}</th>
                <th>{t("patientRegistration.screeningConsent")}</th>
                <th>{t("patientRegistration.registeredOn")}</th>
                <th>{t("patientExplorer.details")}</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td data-label={t("patientRegistration.patientCode")}><span className="patient-workflow-code">{patient.patient_code}</span></td>
                  <td data-label={t("patientRegistration.fullName")}>{patient.full_name}</td>
                  <td data-label={t("patientRegistration.ageSex")}>
                    {patient.age_years == null ? "-" : number(patient.age_years)} · {patient.sex ? getSexLabel(patient.sex, language) : "-"}
                  </td>
                  <td data-label={t("patientRegistration.village")}>{getLocalizedField(patient, "village_name", language) || "-"}</td>
                  <td data-label={t("patientRegistration.mandal")}>{getLocalizedField(patient, "mandal_name", language) || "-"}</td>
                  <td data-label={t("patientRegistration.screeningConsent")}>
                    <Badge tone={patient.screening_consent ? "success" : "neutral"}>
                      {t(patient.screening_consent ? "patientRegistration.consentGiven" : "patientRegistration.consentNotGiven")}
                    </Badge>
                  </td>
                  <td data-label={t("patientRegistration.registeredOn")}>{formatLocalizedDate(patient.created_at, language)}</td>
                  <td data-label={t("patientExplorer.details")}>
                    <Link className="patient-explorer-view" to={`/health-worker/patients/${patient.id}`}>
                      {t("patientExplorer.details")}
                    </Link>
                  </td>
                </tr>
              ))}
              {!patients.length && (
                <tr><td colSpan="8" className="patient-workflow-empty">{t("patientRegistration.noPatients")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}
