import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinned, Plus, Save, Trash2, Users } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedNumber,
  getAccountStatusLabel,
  getLocalizedField,
  getLocalizedMasterName,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Card, Modal, PageLoader, SelectField, StatCard } from "../../components/ui";
import "./HealthWorkerAssignments.css";

export default function HealthWorkerAssignments() {
  const { t, tm, language } = useLanguage();
  const [workers, setWorkers] = useState([]);
  const [options, setOptions] = useState({ districts: [], mandals: [], villages: [], facilities: [] });
  const [selected, setSelected] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [workerResponse, optionResponse] = await Promise.all([
        api.get("/admin/health-workers"),
        api.get("/admin/staff/options"),
      ]);
      setWorkers(workerResponse.data.health_workers || []);
      setOptions({
        districts: [],
        mandals: [],
        villages: [],
        facilities: [],
        ...(optionResponse.data.options || {}),
      });
    } catch (requestError) {
      setError(apiMessage(requestError, "healthWorkerAssignments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAssignments = async (worker) => {
    setError("");
    setMessage("");
    try {
      const response = await api.get(`/admin/health-workers/${worker.id}/assignments`);
      const healthWorker = response.data.health_worker;
      setSelected(healthWorker);
      setAssignments((healthWorker.assignments || []).map((assignment) => ({
        mandal_id: String(assignment.mandal_id),
        village_id: String(assignment.village_id),
        facility_id: String(assignment.facility_id),
      })));
    } catch (requestError) {
      setError(apiMessage(requestError, "healthWorkerAssignments.loadFailed"));
    }
  };

  const updateAssignment = (index, field, value) => {
    setAssignments((current) => current.map((assignment, currentIndex) => (
      currentIndex === index
        ? {
          ...assignment,
          [field]: value,
          ...(field === "mandal_id" ? { village_id: "", facility_id: "" } : {}),
        }
        : assignment
    )));
  };

  const addAssignment = () => {
    setAssignments((current) => [...current, { mandal_id: "", village_id: "", facility_id: "" }]);
  };

  const removeAssignment = (index) => {
    setAssignments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const saveAssignments = async () => {
    if (!selected) return;
    if (!assignments.length || assignments.some((assignment) =>
      !assignment.mandal_id || !assignment.village_id || !assignment.facility_id
    )) {
      setError(t("healthWorkerAssignments.completeAssignments"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/admin/health-workers/${selected.id}/assignments`, {
        assignments: assignments.map((assignment) => ({
          mandal_id: Number(assignment.mandal_id),
          village_id: Number(assignment.village_id),
          facility_id: Number(assignment.facility_id),
        })),
      });
      setMessage(t("healthWorkerAssignments.saved", { name: selected.full_name }));
      setSelected(null);
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "healthWorkerAssignments.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const districtId = selected?.district_id;
  const mandals = useMemo(
    () => options.mandals.filter((mandal) => String(mandal.district_id) === String(districtId)),
    [districtId, options.mandals]
  );
  const locationName = (worker) => {
    const count = Number(worker.assignment_count || 0);
    return count
      ? t("healthWorkerAssignments.locationCount", { count: formatLocalizedNumber(count, language) })
      : t("healthWorkerAssignments.unassigned");
  };

  if (loading) return <PageLoader label={t("common.loading")} />;

  return (
    <div className="health-worker-assignments-page">
      <header className="health-worker-assignments-hero">
        <div>
          <span className="health-worker-assignments-eyebrow"><MapPinned size={15} /> {t("healthWorkerAssignments.eyebrow")}</span>
          <h1 className="page-title">{t("modules.healthWorkerAssignments.title")}</h1>
          <p className="page-subtitle">{t("healthWorkerAssignments.subtitle")}</p>
        </div>
        <StatCard icon={Users} label={t("healthWorkerAssignments.workers")} value={formatLocalizedNumber(workers.length, language)} />
      </header>

      <Alert type="info">{t("healthWorkerAssignments.assignmentNote")}</Alert>
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <Card>
        <div className="health-worker-assignments-table-wrap">
          <table className="health-worker-assignments-table">
            <thead>
              <tr>
                <th>{t("healthWorkerAssignments.worker")}</th>
                <th>{t("healthWorkerAssignments.district")}</th>
                <th>{t("healthWorkerAssignments.locations")}</th>
                <th>{t("healthWorkerAssignments.status")}</th>
                <th>{t("healthWorkerAssignments.action")}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td>
                    <strong>{worker.full_name}</strong>
                    <span className="health-worker-assignments-secondary">{worker.username}</span>
                  </td>
                  <td>{getLocalizedField(worker, "district_name", language) || "-"}</td>
                  <td>{locationName(worker)}</td>
                  <td><Badge tone={worker.status === "ACTIVE" ? "success" : "neutral"}>{getAccountStatusLabel(worker.status, language)}</Badge></td>
                  <td>
                    <Button type="button" size="sm" variant="secondary" onClick={() => openAssignments(worker)}>
                      {t("healthWorkerAssignments.manage")}
                    </Button>
                  </td>
                </tr>
              ))}
              {!workers.length && (
                <tr><td colSpan="5" className="health-worker-assignments-empty">{t("healthWorkerAssignments.noWorkers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(selected)}
        className="health-worker-assignments-modal"
        onClose={() => setSelected(null)}
        title={t("healthWorkerAssignments.modalTitle")}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setSelected(null)}>{t("common.cancel")}</Button>
          <Button type="button" icon={Save} loading={saving} onClick={saveAssignments}>{t("healthWorkerAssignments.save")}</Button>
        </>}
      >
        {selected && (
          <>
            <div className="health-worker-assignments-worker">
              <strong>{selected.full_name}</strong>
              <span>{getLocalizedField(selected, "district_name", language) || "-"}</span>
            </div>
            <div className="health-worker-assignment-list">
              {assignments.map((assignment, index) => {
                const villages = options.villages.filter(
                  (village) => String(village.mandal_id) === assignment.mandal_id
                );
                const facilities = options.facilities.filter(
                  (facility) => String(facility.district_id) === String(districtId)
                    && String(facility.mandal_id) === assignment.mandal_id
                );
                return (
                  <div className="health-worker-assignment-row" key={`assignment-${index}`}>
                    <SelectField
                      id={`hwa-mandal-${index}`}
                      label={t("healthWorkerAssignments.mandal")}
                      value={assignment.mandal_id}
                      onChange={(event) => updateAssignment(index, "mandal_id", event.target.value)}
                      required
                    >
                      <option value="">{t("healthWorkerAssignments.selectMandal")}</option>
                      {mandals.map((mandal) => (
                        <option key={mandal.id} value={String(mandal.id)}>{getLocalizedMasterName(mandal, language)}</option>
                      ))}
                    </SelectField>
                    <SelectField
                      id={`hwa-village-${index}`}
                      label={t("healthWorkerAssignments.village")}
                      value={assignment.village_id}
                      onChange={(event) => updateAssignment(index, "village_id", event.target.value)}
                      disabled={!assignment.mandal_id}
                      required
                    >
                      <option value="">{t("healthWorkerAssignments.selectVillage")}</option>
                      {villages.map((village) => (
                        <option key={village.id} value={String(village.id)}>{getLocalizedMasterName(village, language)}</option>
                      ))}
                    </SelectField>
                    <SelectField
                      id={`hwa-facility-${index}`}
                      label={t("healthWorkerAssignments.facility")}
                      value={assignment.facility_id}
                      onChange={(event) => updateAssignment(index, "facility_id", event.target.value)}
                      disabled={!assignment.mandal_id}
                      required
                    >
                      <option value="">{t("healthWorkerAssignments.selectFacility")}</option>
                      {facilities.map((facility) => (
                        <option key={facility.id} value={String(facility.id)}>{getLocalizedMasterName(facility, language)}</option>
                      ))}
                    </SelectField>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      icon={Trash2}
                      aria-label={t("healthWorkerAssignments.removeLocation")}
                      onClick={() => removeAssignment(index)}
                    />
                  </div>
                );
              })}
              {!assignments.length && <p className="health-worker-assignments-empty">{t("healthWorkerAssignments.noAssignments")}</p>}
            </div>
            <Button type="button" variant="secondary" icon={Plus} onClick={addAssignment}>
              {t("healthWorkerAssignments.addLocation")}
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
