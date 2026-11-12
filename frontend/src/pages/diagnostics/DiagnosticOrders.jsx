import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardPlus, Microscope, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, BarChart, Button, DonutChart, PageLoader, StatCard } from "../../components/ui";
import DashboardBanner from "../../components/dashboard/DashboardBanner";
import "../medicalOfficer/MedicalOfficer.css";
import "./Diagnostics.css";

function localizeName(row, language, enKey = "name_en", teKey = "name_te") {
  if (!row) return "";
  if (language === "te" && row[teKey]) return row[teKey];
  return row[enKey] || row[teKey] || "";
}

function priorityTone(priority) {
  if (priority === "EMERGENCY") return "danger";
  if (priority === "URGENT") return "warning";
  return "info";
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `dx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Shared diagnostics page for Medical Officer, Specialist and Navigator.
 * Doctors can prescribe; Navigators see pending orders for their patients.
 */
export default function DiagnosticOrders({ role }) {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const canPrescribe = role === "MEDICAL_OFFICER" || role === "SPECIALIST";
  const detailPathPrefix =
    role === "NAVIGATOR"
      ? "/navigator/diagnostics"
      : role === "SPECIALIST"
        ? "/specialist/diagnostics"
        : "/medical-officer/diagnostics";

  const [orders, setOrders] = useState([]);
  const [patients, setPatients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [patientId, setPatientId] = useState(searchParams.get("patient_id") || "");
  const [referralId, setReferralId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [clinicalReason, setClinicalReason] = useState("");
  const [priority, setPriority] = useState("ROUTINE");
  const [fastingRequired, setFastingRequired] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());

  const selectedPatient = useMemo(
    () => patients.find((row) => row.id === patientId) || null,
    [patients, patientId]
  );

  const filteredTests = useMemo(() => {
    if (!categoryId) return tests;
    return tests.filter((test) => String(test.category_id) === String(categoryId));
  }, [tests, categoryId]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page_size: 50 };
      if (role === "NAVIGATOR") params.pending_only = "true";
      if (patientId) params.patient_id = patientId;
      const response = await api.get("/diagnostics/orders", { params });
      setOrders(response.data.orders || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [role, patientId]);

  const loadMasters = useCallback(async () => {
    if (!canPrescribe) return;
    try {
      const [catRes, testRes, facilityRes, patientRes] = await Promise.all([
        api.get("/diagnostics/categories"),
        api.get("/diagnostics/tests"),
        api.get("/diagnostics/facilities"),
        api.get("/diagnostics/eligible-patients", { params: { page_size: 50 } }),
      ]);
      setCategories(catRes.data.categories || []);
      setTests(testRes.data.tests || []);
      setFacilities(facilityRes.data.facilities || []);
      setPatients(patientRes.data.patients || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.loadFailed"));
    }
  }, [canPrescribe]);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (selectedPatient?.referral_id) {
      setReferralId(selectedPatient.referral_id);
    } else {
      setReferralId("");
    }
  }, [selectedPatient]);

  function toggleTest(testId) {
    setSelectedTestIds((current) => {
      if (current.includes(testId)) return current.filter((id) => id !== testId);
      return [...current, testId];
    });
    const test = tests.find((row) => row.id === testId);
    if (test?.default_fasting) setFastingRequired(true);
  }

  function onPatientChange(nextId) {
    setPatientId(nextId);
    const next = new URLSearchParams(searchParams);
    if (nextId) next.set("patient_id", nextId);
    else next.delete("patient_id");
    setSearchParams(next, { replace: true });
  }

  async function submitOrder(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post("/diagnostics/orders", {
        patient_id: patientId,
        referral_id: referralId || null,
        facility_id: Number(facilityId),
        notes: notes || null,
        idempotency_key: idempotencyKey,
        items: selectedTestIds.map((testId) => ({
          test_id: Number(testId),
          clinical_reason: clinicalReason,
          priority,
          fasting_required: fastingRequired,
          instructions: instructions || null,
        })),
      });
      setMessage(response.data.message || t("diagnostics.orderCreated"));
      setSelectedTestIds([]);
      setClinicalReason("");
      setPriority("ROUTINE");
      setFastingRequired(false);
      setInstructions("");
      setNotes("");
      setIdempotencyKey(newIdempotencyKey());
      await loadOrders();
    } catch (requestError) {
      setError(apiMessage(requestError, "diagnostics.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const openCount = orders.filter((order) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(String(order.status_code || order.status || "").toUpperCase())).length;
  const urgentCount = orders.reduce((total, order) => {
    const items = order.items || [];
    return total + items.filter((item) => item.priority === "URGENT" || item.priority === "EMERGENCY").length;
  }, 0);

  const statusSegments = useMemo(() => {
    const counts = {};
    orders.forEach((order) => {
      const key = order.status_name || order.status_code || order.status || t("common.notAvailable");
      counts[key] = (counts[key] || 0) + 1;
    });
    const palette = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#e11d48", "#64748b"];
    return Object.entries(counts).map(([label, value], index) => ({
      label,
      value,
      color: palette[index % palette.length],
    }));
  }, [orders, t]);

  const priorityBars = useMemo(() => {
    const counts = { ROUTINE: 0, URGENT: 0, EMERGENCY: 0 };
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (counts[item.priority] != null) counts[item.priority] += 1;
      });
    });
    return [
      { label: t("diagnostics.priorityRoutine"), value: counts.ROUTINE },
      { label: t("diagnostics.priorityUrgent"), value: counts.URGENT },
      { label: t("diagnostics.priorityEmergency"), value: counts.EMERGENCY },
    ];
  }, [orders, t]);

  return (
    <div className="mo-page diagnostics-page">
      <DashboardBanner variant="diagnostics" className="diagnostics-hero">
        <div>
          <p className="mo-hero-eyebrow"><Microscope size={15} aria-hidden="true" /> {t("diagnostics.eyebrow")}</p>
          <h1 className="mo-hero-title">{t("diagnostics.title")}</h1>
          <p className="mo-hero-text">{t("diagnostics.subtitle")}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm diagnostics-hero-refresh" onClick={loadOrders}>
          <RefreshCw size={15} aria-hidden="true" /> {t("common.refresh")}
        </button>
      </DashboardBanner>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <div className="diagnostics-stat-grid">
        <StatCard icon={Microscope} label={t("diagnostics.statOrders")} value={String(orders.length)} />
        <StatCard icon={ClipboardPlus} tone="amber" label={t("diagnostics.statOpen")} value={String(openCount)} />
        <StatCard icon={RefreshCw} tone="rose" label={t("diagnostics.statUrgent")} value={String(urgentCount)} />
      </div>

      <div className="diagnostics-chart-grid">
        <section className="mo-card diagnostics-panel diagnostics-panel-chart">
          <h2>{t("diagnostics.status")}</h2>
          {statusSegments.length === 0 ? (
            <p className="diagnostics-empty">{t("diagnostics.noOrders")}</p>
          ) : (
            <div className="diagnostics-donut-row">
              <DonutChart
                segments={statusSegments}
                centerValue={String(orders.length)}
                centerLabel={t("diagnostics.statOrders")}
              />
              <ul className="diagnostics-legend">
                {statusSegments.map((segment) => (
                  <li key={segment.label}>
                    <span style={{ background: segment.color }} />
                    {segment.label}: {segment.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="mo-card diagnostics-panel diagnostics-panel-chart">
          <h2>{t("diagnostics.priority")}</h2>
          {orders.length === 0 ? (
            <p className="diagnostics-empty">{t("diagnostics.noOrders")}</p>
          ) : (
            <BarChart data={priorityBars} />
          )}
        </section>
      </div>

      <div className={`diagnostics-layout${canPrescribe ? " diagnostics-layout-split" : ""}`}>
      {canPrescribe && (
        <section className="mo-card diagnostics-panel diagnostics-panel-form">
          <div className="mo-card-head">
            <h2><ClipboardPlus size={18} aria-hidden="true" /> {t("diagnostics.prescribeTitle")}</h2>
          </div>
          <form className="diagnostics-form" onSubmit={submitOrder}>
            <label>
              <span>{t("diagnostics.patient")}</span>
              <select value={patientId} onChange={(e) => onPatientChange(e.target.value)} required>
                <option value="">{t("diagnostics.selectPatient")}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} ({patient.patient_code})
                  </option>
                ))}
              </select>
            </label>

            {selectedPatient?.referral_code && (
              <p className="diagnostics-hint">
                {t("diagnostics.linkedReferral")}: {selectedPatient.referral_code}
              </p>
            )}

            <label>
              <span>{t("diagnostics.category")}</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t("diagnostics.allCategories")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {localizeName(category, language)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="diagnostics-tests">
              <legend>{t("diagnostics.selectTests")}</legend>
              <div className="diagnostics-test-grid">
                {filteredTests.map((test) => (
                  <label key={test.id} className="diagnostics-test-option">
                    <input
                      type="checkbox"
                      checked={selectedTestIds.includes(test.id)}
                      onChange={() => toggleTest(test.id)}
                    />
                    <span>
                      {localizeName(test, language)}
                      <small>{test.category_name}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              <span>{t("diagnostics.clinicalReason")}</span>
              <textarea
                value={clinicalReason}
                onChange={(e) => setClinicalReason(e.target.value)}
                rows={3}
                required
                maxLength={2000}
              />
            </label>

            <div className="diagnostics-row">
              <label>
                <span>{t("diagnostics.priority")}</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="ROUTINE">{t("diagnostics.priorityRoutine")}</option>
                  <option value="URGENT">{t("diagnostics.priorityUrgent")}</option>
                  <option value="EMERGENCY">{t("diagnostics.priorityEmergency")}</option>
                </select>
              </label>
              <label className="diagnostics-check">
                <input
                  type="checkbox"
                  checked={fastingRequired}
                  onChange={(e) => setFastingRequired(e.target.checked)}
                />
                <span>{t("diagnostics.fastingRequired")}</span>
              </label>
            </div>

            <label>
              <span>{t("diagnostics.instructions")}</span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </label>

            <label>
              <span>{t("diagnostics.facility")}</span>
              <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} required>
                <option value="">{t("diagnostics.selectFacility")}</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {localizeName(facility, language)} ({facility.facility_type})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{t("diagnostics.notes")}</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
            </label>

            <div className="diagnostics-actions">
              <Button type="submit" disabled={saving || !selectedTestIds.length}>
                {saving ? t("common.saving") : t("diagnostics.submitOrder")}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="mo-card diagnostics-panel diagnostics-panel-list">
        <div className="mo-card-head">
          <h2>
            <Microscope size={18} aria-hidden="true" />{" "}
            {role === "NAVIGATOR" ? t("diagnostics.pendingTitle") : t("diagnostics.historyTitle")}
          </h2>
          <Button type="button" variant="secondary" onClick={loadOrders}>
            <RefreshCw size={14} aria-hidden="true" /> {t("common.refresh")}
          </Button>
        </div>

        {loading ? (
          <PageLoader label={t("common.loading")} />
        ) : orders.length === 0 ? (
          <p className="diagnostics-empty">{t("diagnostics.noOrders")}</p>
        ) : (
          <ul className="diagnostics-order-list">
            {orders.map((order) => (
              <li key={order.id} className="diagnostics-order-item">
                <div>
                  <strong>{order.order_code}</strong>
                  <span>{order.patient_name} ({order.patient_code})</span>
                  <span>{order.facility_name}</span>
                  <div className="diagnostics-item-tags">
                    <Badge tone="info">{order.status_name}</Badge>
                    {(order.items || []).slice(0, 3).map((item) => (
                      <Badge key={item.id} tone={priorityTone(item.priority)}>
                        {localizeName(item, language, "test_name", "test_name_te")}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Link className="btn btn-secondary" to={`${detailPathPrefix}/${order.id}`}>
                  {t("diagnostics.viewDetails")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
