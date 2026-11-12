import React, { useCallback, useEffect, useState } from "react";
import { CloudDownload, Hospital, Info, PencilLine, ShieldCheck } from "lucide-react";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { getLocalizedMasterName } from "../i18n/displayLabels";
import { apiMessage } from "../i18n/translate";
import { Alert, Badge, Button, Card, SelectField } from "../components/ui";
import PreviewTable from "../components/locations/PreviewTable";
import ImportConfirmDialog from "../components/locations/ImportConfirmDialog";
import ImportHistory from "../components/locations/ImportHistory";
import SavedRecords from "../components/locations/SavedRecords";
import ManualEntryForm from "../components/locations/ManualEntryForm";

const LEVELS = [
  { key: "district", label: "locations.levelDistrict" },
  { key: "mandal", label: "locations.levelMandal" },
  { key: "village", label: "locations.levelVillage" },
];

// Used when the LGD state list cannot be loaded
const FALLBACK_STATES = [{ lgd_code: 28, name_en: "Andhra Pradesh", name_te: "ఆంధ్రప్రదేశ్" }];

// message is a server message or a translation key (shown with tm)
const errorFrom = (err, fallbackKey) => ({
  message: apiMessage(err, fallbackKey),
  code: err.response?.data?.code,
});

export default function LocationImport() {
  const { t, tm, language } = useLanguage();
  const nameOf = (item) => getLocalizedMasterName(item, language);

  // What to import: level + its parent (state, district or mandal)
  const [level, setLevel] = useState("district");
  const [states, setStates] = useState(FALLBACK_STATES);
  const [stateCode, setStateCode] = useState("28");
  const [districts, setDistricts] = useState([]);
  const [districtId, setDistrictId] = useState("");
  const [mandals, setMandals] = useState([]);
  const [mandalId, setMandalId] = useState("");

  // Preview from LGD and the rows the admin ticked
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const [saved, setSaved] = useState([]);
  const [history, setHistory] = useState([]);
  const [verifyBusyId, setVerifyBusyId] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const linkedDistricts = districts.filter((d) => d.lgd_code);
  const linkedMandals = mandals.filter((m) => m.lgd_code);

  // ----- loading lists -----
  const loadDistricts = useCallback(async () => {
    const { data } = await api.get("/locations/records", { params: { level: "district" } });
    setDistricts(data.records);
  }, []);

  const loadMandals = useCallback(async (id) => {
    if (!id) return setMandals([]);
    const { data } = await api.get("/locations/records", { params: { level: "mandal", parent_id: id } });
    setMandals(data.records);
  }, []);

  const loadHistory = useCallback(async () => {
    const { data } = await api.get("/locations/imports");
    setHistory(data.imports);
  }, []);

  // Saved records for the current selection (bottom table)
  const loadSaved = useCallback(async () => {
    if (level === "district") return setSaved(districts);
    if (level === "mandal") return setSaved(districtId ? mandals : []);
    if (!mandalId) return setSaved([]);
    const { data } = await api.get("/locations/records", { params: { level: "village", parent_id: mandalId } });
    setSaved(data.records);
  }, [level, districts, districtId, mandals, mandalId]);

  useEffect(() => {
    api.get("/locations/lgd/states")
      .then(({ data }) => setStates(data.states))
      .catch(() => setStates(FALLBACK_STATES));
    loadDistricts().catch(() => {});
    loadHistory().catch(() => {});
  }, [loadDistricts, loadHistory]);

  useEffect(() => {
    loadMandals(districtId).catch(() => {});
  }, [districtId, loadMandals]);

  useEffect(() => {
    loadSaved().catch(() => {});
  }, [loadSaved]);

  // A new level or parent means the old preview no longer applies
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    setSelected(new Set());
  }, [level, stateCode, districtId, mandalId]);

  // ----- actions -----
  const scopeParams = () => {
    if (level === "district") return { state_code: Number(stateCode) };
    if (level === "mandal") return { parent_id: Number(districtId) };
    return { parent_id: Number(mandalId) };
  };

  const scopeReady = level === "district" ? Boolean(stateCode) : level === "mandal" ? Boolean(districtId) : Boolean(mandalId);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { data } = await api.get("/locations/preview", { params: { level, ...scopeParams() } });
      setPreview(data);
      setSelected(new Set());
    } catch (err) {
      setPreview(null);
      setPreviewError(errorFrom(err, "locations.lgdErrorText"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/locations/import", {
        level,
        ...scopeParams(),
        lgd_codes: [...selected],
        confirm: true,
      });
      setResult(data);
      setConfirmOpen(false);
      await Promise.all([loadDistricts(), loadMandals(districtId), loadHistory()]);
      await fetchPreview();
    } catch (err) {
      setConfirmOpen(false);
      setPreviewError(errorFrom(err, "register.failed"));
    } finally {
      setImporting(false);
    }
  };

  const toggleVerified = async (record, isVerified) => {
    setVerifyBusyId(record.id);
    try {
      await api.patch(`/locations/records/${level}/${record.id}`, { is_verified: isVerified });
      await Promise.all([loadDistricts(), loadMandals(districtId)]);
      await loadSaved();
    } finally {
      setVerifyBusyId(null);
    }
  };

  const afterManualSave = async () => {
    await Promise.all([loadDistricts(), loadMandals(districtId), loadSaved()]);
  };

  const selectedRows = preview ? preview.rows.filter((row) => selected.has(row.lgd_code)) : [];
  const stateName = states.find((s) => String(s.lgd_code) === String(stateCode))?.name_en || "Andhra Pradesh";
  const manualParentRecord = level === "mandal"
    ? districts.find((d) => String(d.id) === String(districtId))
    : mandals.find((m) => String(m.id) === String(mandalId));
  const manualParent = {
    id: level === "mandal" ? districtId : mandalId,
    name: manualParentRecord ? nameOf(manualParentRecord) : "",
  };
  const isLgdError = previewError?.code?.startsWith("LGD_");

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("locations.title")}</h1>
          <p className="page-subtitle">{t("locations.subtitle")}</p>
        </div>
        <div className="toolbar-actions">
          <Badge tone="info" icon={ShieldCheck}>{t("locations.sourceBadge")}</Badge>
          <Button variant="secondary" icon={PencilLine} onClick={() => setShowManual(true)}>{t("locations.manualOpen")}</Button>
        </div>
      </div>

      {/* Step 1: choose what to import */}
      <Card title={t("locations.chooseScope")}>
        <div className="tabs" role="tablist" aria-label={t("locations.level")}>
          {LEVELS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={level === item.key}
              onClick={() => setLevel(item.key)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className="scope-row location-import-section">
          {level === "district" && (
            <SelectField id="scope-state" label={t("locations.state")} value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {states.map((s) => (
                <option key={s.lgd_code} value={s.lgd_code}>{nameOf(s)}</option>
              ))}
            </SelectField>
          )}

          {level !== "district" && (
            <SelectField
              id="scope-district"
              label={t("locations.district")}
              value={districtId}
              onChange={(e) => { setDistrictId(e.target.value); setMandalId(""); }}
              hint={linkedDistricts.length ? t("locations.onlyLinkedDistricts") : t("locations.noLinkedDistricts")}
            >
              <option value="">{t("locations.selectDistrict")}</option>
              {linkedDistricts.map((d) => (
                <option key={d.id} value={d.id}>{nameOf(d)}</option>
              ))}
            </SelectField>
          )}

          {level === "village" && (
            <SelectField
              id="scope-mandal"
              label={t("locations.mandal")}
              value={mandalId}
              onChange={(e) => setMandalId(e.target.value)}
              disabled={!districtId}
              hint={districtId && !linkedMandals.length ? t("locations.noLinkedMandals") : t("locations.onlyLinkedMandals")}
            >
              <option value="">{t("locations.selectMandal")}</option>
              {linkedMandals.map((m) => (
                <option key={m.id} value={m.id}>{nameOf(m)}</option>
              ))}
            </SelectField>
          )}

          <div className="field">
            <Button
              icon={CloudDownload}
              onClick={() => { setResult(null); fetchPreview(); }}
              loading={previewLoading}
              disabled={!scopeReady}
            >
              {previewLoading ? t("locations.fetching") : t("locations.fetch")}
            </Button>
          </div>
        </div>

        <ul className="notice-list">
          {level !== "district" && <li><Info size={14} aria-hidden="true" />{t("locations.mandalNote")}</li>}
          <li><ShieldCheck size={14} aria-hidden="true" />{t("locations.safetyNote")}</li>
          <li><Hospital size={14} aria-hidden="true" />{t("locations.facilityNote")}</li>
        </ul>
      </Card>

      {result && (
        <div className="section">
          <Alert type="success" title={t("locations.importDone")}>
            {result.inserted} {t("locations.added")} · {result.updated} {t("locations.updated")} · {result.linked}{" "}
            {t("locations.linked")} · {result.skipped} {t("locations.skipped")}
          </Alert>
        </div>
      )}

      {previewError && (
        <div className="section">
          <Alert type="error" title={isLgdError ? t("locations.lgdErrorTitle") : undefined}>
            {tm(previewError.message)}
            {isLgdError && <> {t("locations.lgdErrorText")}</>}
            <div className="toolbar-actions location-import-actions-spaced">
              <Button size="sm" variant="secondary" onClick={fetchPreview}>{t("common.tryAgain")}</Button>
              <Button size="sm" variant="ghost" icon={PencilLine} onClick={() => setShowManual(true)}>{t("locations.manualOpen")}</Button>
            </div>
          </Alert>
        </div>
      )}

      {showManual && (
        <div className="section">
          <ManualEntryForm
            level={level}
            parentId={manualParent.id}
            parentName={manualParent.name}
            stateName={stateName}
            onSaved={afterManualSave}
            onClose={() => setShowManual(false)}
          />
        </div>
      )}

      {/* Step 2: review and select */}
      {preview && (
        <div className="section">
          <Card
            title={t("locations.previewTitle")}
            subtitle={`${preview.rows.length} ${t("locations.recordsFetchedFor")} ${nameOf(preview.parent)}. ${t("locations.notSavedYet")}`}
            padded={false}
          >
            <PreviewTable preview={preview} selected={selected} onChangeSelected={setSelected} />

            <div className="sticky-actions">
              <span className="text-sm">
                <strong>{selected.size}</strong> {t("locations.selected")}
              </span>
              <Button icon={CloudDownload} onClick={() => setConfirmOpen(true)} disabled={!selected.size}>
                {t("locations.importSelected")}
              </Button>
            </div>
          </Card>

          {preview.onlyInAarogya.length > 0 && (
            <div className="section">
              <Alert type="info" title={t("locations.onlyInAarogya")}>
                {t("locations.onlyInAarogyaText")} {preview.onlyInAarogya.map(nameOf).join(", ")}
              </Alert>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <SavedRecords records={saved} onToggleVerified={toggleVerified} busyId={verifyBusyId} />
      </div>

      <div className="section">
        <ImportHistory imports={history} />
      </div>

      <ImportConfirmDialog
        open={confirmOpen}
        rows={selectedRows}
        parentName={preview ? nameOf(preview.parent) : ""}
        importing={importing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runImport}
      />
    </>
  );
}
