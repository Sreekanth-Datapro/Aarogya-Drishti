import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, Mail, MapPin, Plus, Search, ShieldOff, UserCheck, UserPlus, Users, X } from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedNumber,
  getAccountStatusLabel,
  getLocalizedField,
  getLocalizedMasterName,
  getRoleLabel,
} from "../../i18n/displayLabels";
import { DISTRICT_STAFF_PAGES } from "../../config/navigation";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Card, Modal, SelectField, StatCard, TextField } from "../../components/ui";
import { initials } from "../../components/layout/Sidebar";
import "./StaffManagement.css";

const EMPTY_FORM = {
  role_code: "",
  full_name: "",
  email: "",
  phone: "",
  district_id: "",
  facility_id: "",
  mandal_ids: [],
  specialty_ids: [],
};

const STAFF_ROLE_CODES = ["MEDICAL_OFFICER", "SPECIALIST", "NAVIGATOR", "HOSPITAL_STAFF"];

// Menu key of each District Admin staff page (used for the page title)
const PAGE_TITLE_KEYS = {
  MEDICAL_OFFICER: "modules.districtMedicalOfficers.title",
  SPECIALIST: "modules.districtSpecialists.title",
  NAVIGATOR: "modules.districtNavigators.title",
};

const STATUS_TONES = { ACTIVE: "success", PENDING_SETUP: "warning", SUSPENDED: "danger", DISABLED: "neutral" };

export default function StaffManagement() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const canChooseDistrict = ["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  // /district/staff/:staffPage shows one role only (e.g. medical-officers)
  const { staffPage } = useParams();
  const pageRole = DISTRICT_STAFF_PAGES[staffPage] || "";

  const [staff, setStaff] = useState([]);
  const [options, setOptions] = useState({ districts: [], facilities: [], specialties: [], mandals: [] });
  const [form, setForm] = useState({ ...EMPTY_FORM, role_code: pageRole });
  const [filters, setFilters] = useState({ search: "", role_code: pageRole, district_id: "" });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setForm({ ...EMPTY_FORM, role_code: pageRole });
    setFilters((current) => ({ ...current, role_code: pageRole }));
  }, [pageRole]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [staffResponse, optionsResponse] = await Promise.all([
        api.get("/admin/staff", { params: filters }),
        api.get("/admin/staff/options"),
      ]);
      setStaff(staffResponse.data.staff || []);
      setOptions({
        districts: [],
        facilities: [],
        specialties: [],
        mandals: [],
        ...(optionsResponse.data.options || {}),
      });
    } catch (requestError) {
      setError(apiMessage(requestError, "staff.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // A District Admin's own district (the server sends only that one)
  const ownDistrict = !canChooseDistrict ? options.districts[0] : null;

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, role_code: pageRole });
    setError("");
    setCreateOpen(true);
  };

  const createStaff = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!form.role_code || !form.full_name.trim() || !form.email.trim() || !form.phone.trim() || !form.facility_id) {
        throw new Error("staff.requiredFields");
      }
      if (form.role_code === "MEDICAL_OFFICER" && form.mandal_ids.length === 0) {
        throw new Error("staff.selectMandals");
      }
      if (!formDistrictId) {
        throw new Error("staff.selectDistrict");
      }
      if (!/^\d{10,11}$/.test(form.phone.trim())) {
        throw new Error("staff.invalidPhone");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        throw new Error("staff.invalidEmail");
      }
      if (form.role_code === "SPECIALIST" && form.specialty_ids.length === 0) {
        throw new Error("staff.specialtyRequired");
      }
      const response = await api.post(`/admin/staff/${form.role_code}`, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        // District Admins: the server always uses their own district
        district_id: Number(formDistrictId),
        facility_id: Number(form.facility_id),
        mandal_ids: form.mandal_ids.map(Number),
        specialty_ids: form.specialty_ids.map(Number),
      });
      setMessage({
        key: "staff.created",
        values: { username: response.data.staff?.username || "" },
        deliveryStatus: response.data.delivery_status?.email?.status || "FAILED",
      });
      setForm({ ...EMPTY_FORM, role_code: pageRole });
      setCreateOpen(false);
      await loadData();
    } catch (requestError) {
      setError(requestError.message?.startsWith("staff.") ? requestError.message : apiMessage(requestError, "staff.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (item) => {
    try {
      const response = await api.get(`/admin/staff/${item.id}`);
      setSelected({
        ...response.data.staff,
        mandal_ids: (response.data.staff.mandal_assignments || []).map((assignment) => String(assignment.mandal_id)),
      });
      setError("");
    } catch (requestError) {
      setError(apiMessage(requestError, "staff.loadFailed"));
    }
  };

  const saveStaff = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/admin/staff/${selected.id}`, {
        full_name: selected.full_name,
        email: selected.email,
        phone: selected.phone,
        facility_id: Number(selected.assignments?.[0]?.facility_id),
        mandal_ids: (selected.mandal_ids || []).map(Number),
      });
      setMessage({ key: "staff.updated", values: { name: selected.full_name } });
      setSelected(null);
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "staff.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item, status) => {
    if (!window.confirm(t(status === "SUSPENDED" ? "staff.confirmSuspend" : "staff.confirmActivate"))) return;
    try {
      await api.patch(`/admin/staff/${item.id}/status`, { status });
      setMessage({ key: status === "SUSPENDED" ? "staff.suspended" : "staff.activated", values: { name: item.full_name } });
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "staff.statusFailed"));
    }
  };

  const resend = async (item) => {
    if (!window.confirm(t("staff.confirmResend"))) return;
    try {
      await api.post(`/admin/staff/${item.id}/resend`);
      setMessage({ key: "staff.resendSent", values: { name: item.full_name } });
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "staff.resendFailed"));
    }
  };

  const districtOptions = options.districts.map((district) => (
    <option key={district.id} value={district.id}>{getLocalizedMasterName(district, language)}</option>
  ));

  // Facilities of the chosen district; Specialists may only work in hospitals (checked by the server too)
  const facilityOptionsFor = (roleCode, districtId, mandalId) => options.facilities
    .filter((facility) => !districtId || String(facility.district_id) === String(districtId))
    .filter((facility) => !mandalId || String(facility.mandal_id) === String(mandalId))
    .filter((facility) => !["SPECIALIST", "HOSPITAL_STAFF"].includes(roleCode)
      || String(facility.facility_type) === "HOSPITAL")
    .map((facility) => (
      <option key={facility.id} value={facility.id}>{getLocalizedMasterName(facility, language)}</option>
    ));
  const medicalOfficerForm = form.role_code === "MEDICAL_OFFICER";
  const formDistrictId = canChooseDistrict ? form.district_id : ownDistrict?.id;
  // A Medical Officer's facility must be in the chosen Mandal
  const facilityLocked = !formDistrictId || (medicalOfficerForm && !form.mandal_ids[0]);
  const mandalOptions = options.mandals.filter(
    (mandal) => !formDistrictId || String(mandal.district_id) === String(formDistrictId)
  );

  const roleOptions = STAFF_ROLE_CODES.map((code) => (
    <option key={code} value={code}>{getRoleLabel(code, language)}</option>
  ));
  const specialtyName = (id) => {
    const specialty = options.specialties.find((item) => Number(item.id) === Number(id));
    return specialty ? getLocalizedMasterName(specialty, language) : id;
  };

  // Names (in the chosen language) of a Medical Officer's current Mandals
  const mandalNames = (item) => (item.mandal_ids || [])
    .map((mandalId) => options.mandals.find((mandal) => String(mandal.id) === String(mandalId)))
    .filter(Boolean)
    .map((mandal) => getLocalizedMasterName(mandal, language));

  const count = (status) => staff.filter((item) => item.status === status).length;
  const number = (value) => formatLocalizedNumber(value, language);
  const errorText = typeof error === "string" && error.startsWith("staff.") ? t(error) : error;

  return (
    <div className="staff-page">
      <div className="staff-hero">
        <div>
          <h1 className="page-title">{t(PAGE_TITLE_KEYS[pageRole] || "staff.title")}</h1>
          <p className="page-subtitle">{pageRole ? t("staff.districtSubtitle") : t("staff.subtitle")}</p>
          {ownDistrict && (
            <span className="staff-district-chip"><MapPin size={14} /> {getLocalizedMasterName(ownDistrict, language)}</span>
          )}
        </div>
        <Button type="button" onClick={openCreate}><Plus size={16} /> {t("staff.addStaff")}</Button>
      </div>

      {error && !createOpen && <Alert type="error">{errorText}</Alert>}
      {message && (
        <Alert type={typeof message === "object" && message.deliveryStatus !== "SENT" ? "warning" : "success"}>
          {typeof message === "object" ? t(message.key, message.values) : message}
          {typeof message === "object" && message.deliveryStatus && message.deliveryStatus !== "SENT"
            && <p>{t("staff.deliveryNotSent")}</p>}
        </Alert>
      )}

      <div className="staff-stat-grid">
        <StatCard icon={Users} label={t("staff.totalStaff")} value={number(staff.length)} />
        <StatCard icon={UserCheck} tone="green" label={getAccountStatusLabel("ACTIVE", language)} value={number(count("ACTIVE"))} />
        <StatCard icon={Clock} tone="amber" label={getAccountStatusLabel("PENDING_SETUP", language)} value={number(count("PENDING_SETUP"))} />
        <StatCard icon={ShieldOff} tone="rose" label={getAccountStatusLabel("SUSPENDED", language)} value={number(count("SUSPENDED"))} />
      </div>

      <Card>
        <div className="staff-search-grid">
          <TextField id="staff-search" icon={Search} label={t("staff.search")} value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
          {!pageRole && (
            <SelectField id="staff-role-filter" label={t("staff.role")} value={filters.role_code} onChange={(event) => setFilters((current) => ({ ...current, role_code: event.target.value }))}>
              <option value="">{t("staff.allRoles")}</option>{roleOptions}
            </SelectField>
          )}
          {canChooseDistrict && (
            <SelectField id="staff-district-filter" label={t("staff.district")} value={filters.district_id} onChange={(event) => setFilters((current) => ({ ...current, district_id: event.target.value }))}>
              <option value="">{t("staff.allDistricts")}</option>{districtOptions}
            </SelectField>
          )}
        </div>
      </Card>

      <Card>
        <div className="staff-list-heading">
          <h2>{t("staff.staffList")}</h2>
          <p>{pageRole ? getRoleLabel(pageRole, language) : t("staff.subtitle")}</p>
        </div>
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t("staff.fullName")}</th>
                <th>{t("staff.role")}</th>
                <th>{t("staff.district")}</th>
                <th>{t("staff.facility")}</th>
                <th>{t("staff.status")}</th>
                <th>{t("staff.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" className="staff-empty">{t("common.loading")}</td></tr>}
              {!loading && staff.map((item) => (
                <tr key={item.id}>
                  <td data-label={t("staff.fullName")}>
                    <div className="staff-person">
                      <span className="staff-avatar" aria-hidden="true" data-initials={initials(item.full_name)} />
                      <div>
                        <strong>{item.full_name}</strong>
                        <small>{item.username}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label={t("staff.role")}>{getRoleLabel(item.role_code, language)}</td>
                  <td data-label={t("staff.district")}>{getLocalizedField(item, "district_name", language) || "-"}</td>
                  <td data-label={t("staff.facility")}>
                    {getLocalizedField(item, "facility_name", language) || "-"}
                    {item.role_code === "MEDICAL_OFFICER" && (
                      <div className="staff-mandal-line">
                        {mandalNames(item).length
                          ? <small>{t("staff.mandalsLabel")}: {mandalNames(item).join(", ")}</small>
                          : <Badge tone="danger">{t("staff.noMandalAssigned")}</Badge>}
                      </div>
                    )}
                  </td>
                  <td data-label={t("staff.status")}>
                    <Badge tone={STATUS_TONES[item.status] || "neutral"}>{getAccountStatusLabel(item.status, language)}</Badge>
                  </td>
                  <td data-label={t("staff.actions")}>
                    <div className="staff-actions">
                      <Button type="button" size="sm" variant="secondary" onClick={() => openDetails(item)}>{t("staff.view")}</Button>
                      {item.status === "PENDING_SETUP" && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => resend(item)}><Mail size={14} /> {t("staff.resend")}</Button>
                      )}
                      {item.status !== "SUSPENDED"
                        ? <Button type="button" size="sm" variant="danger" onClick={() => changeStatus(item, "SUSPENDED")}>{t("staff.suspend")}</Button>
                        : <Button type="button" size="sm" onClick={() => changeStatus(item, "ACTIVE")}>{t("staff.activate")}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && staff.length === 0 && <tr><td colSpan="6" className="staff-empty">{t("staff.noStaff")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={createOpen}
        className="staff-modal"
        onClose={() => setCreateOpen(false)}
        title={pageRole ? `${t("staff.addStaff")} - ${getRoleLabel(pageRole, language)}` : t("staff.addStaff")}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="staff-create-form" loading={saving}>{t("staff.create")}</Button>
        </>}
      >
        <div className="staff-create-intro">
          <span className="staff-create-icon" aria-hidden="true"><UserPlus size={22} /></span>
          <div>
            <strong>{form.role_code ? getRoleLabel(form.role_code, language) : t("staff.selectRole")}</strong>
            <p>{t("staff.createSubtitle")}</p>
          </div>
        </div>
        {error && <Alert type="error">{errorText}</Alert>}
        <form id="staff-create-form" onSubmit={createStaff} className="staff-create-form" noValidate>
          <div className="staff-create-grid">
            {!pageRole && (
              <SelectField id="staff-role" label={t("staff.role")} value={form.role_code} onChange={(event) => {
                setForm((current) => ({ ...current, role_code: event.target.value, facility_id: "", specialty_ids: [], mandal_ids: [] }));
              }} required>
                <option value="">{t("staff.selectRole")}</option>{roleOptions}
              </SelectField>
            )}
            <TextField id="staff-name" label={t("staff.fullName")} value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} required />
            <TextField id="staff-email" label={t("staff.email")} type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} required />
            <TextField id="staff-phone" label={t("staff.phone")} inputMode="numeric" maxLength={11} value={form.phone} onChange={(event) => updateForm("phone", event.target.value.replace(/\D/g, ""))} required />

            {/* System Administrators choose a district; District Admins use their own. */}
            <SelectField
              id="staff-district"
              label={t("staff.district")}
              value={canChooseDistrict ? form.district_id : String(ownDistrict?.id || "")}
              onChange={(event) => setForm((current) => ({ ...current, district_id: event.target.value, mandal_ids: [], facility_id: "" }))}
              disabled={!canChooseDistrict}
              hint={canChooseDistrict ? undefined : t("staff.districtLocked")}
              required
            >
              <option value="">{t("staff.selectDistrict")}</option>{districtOptions}
            </SelectField>

            {/* Mandal: one Mandal per Medical Officer */}
            {medicalOfficerForm && (
              <SelectField
                id="staff-mandal"
                label={t("staff.mandal")}
                value={form.mandal_ids[0] || ""}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  mandal_ids: event.target.value ? [event.target.value] : [],
                  facility_id: "",
                }))}
                disabled={!formDistrictId}
                hint={t("staff.mandalAssignmentHint")}
                required
              >
                <option value="">{formDistrictId ? t("staff.selectMandal") : t("staff.chooseDistrictFirst")}</option>
                {mandalOptions.map((mandal) => (
                  <option key={mandal.id} value={String(mandal.id)}>{getLocalizedMasterName(mandal, language)}</option>
                ))}
              </SelectField>
            )}

            <SelectField id="staff-facility" label={t("staff.facility")} value={form.facility_id} onChange={(event) => updateForm("facility_id", event.target.value)} disabled={facilityLocked} required>
              <option value="">{facilityLocked ? t(medicalOfficerForm ? "staff.chooseMandalFirst" : "staff.chooseDistrictFirst") : t("staff.selectFacility")}</option>
              {facilityOptionsFor(form.role_code, formDistrictId, medicalOfficerForm ? form.mandal_ids[0] : "")}
            </SelectField>

            {["SPECIALIST", "HOSPITAL_STAFF"].includes(form.role_code)
              && <p className="staff-hint">{t("staff.hospitalOnly")}</p>}
            {form.role_code === "SPECIALIST" && (
              <SelectField id="staff-specialties" label={t("staff.specialties")} value="" onChange={(event) => {
                const id = Number(event.target.value);
                if (id && !form.specialty_ids.includes(id)) updateForm("specialty_ids", [...form.specialty_ids, id]);
              }}>
                <option value="">{t("staff.addSpecialty")}</option>
                {options.specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{getLocalizedMasterName(specialty, language)}</option>)}
              </SelectField>
            )}
            {form.specialty_ids.length > 0 && (
              <div className="staff-specialty-list">
                {form.specialty_ids.map((id) => (
                  <span key={id} className="staff-specialty-chip">
                    {specialtyName(id)}
                    <button
                      type="button"
                      aria-label={t("staff.removeSpecialty", { name: specialtyName(id) })}
                      onClick={() => updateForm("specialty_ids", form.specialty_ids.filter((item) => item !== id))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="staff-hint">{t("staff.credentialsHint")}</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        className="staff-modal"
        onClose={() => setSelected(null)}
        title={t("staff.details")}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setSelected(null)}>{t("common.cancel")}</Button>
          <Button type="button" onClick={saveStaff} loading={saving}>{t("staff.save")}</Button>
        </>}
      >
        {selected && (
          <div className="staff-create-grid">
            <TextField id="edit-staff-name" label={t("staff.fullName")} value={selected.full_name || ""} onChange={(event) => setSelected((current) => ({ ...current, full_name: event.target.value }))} />
            <TextField id="edit-staff-email" label={t("staff.email")} type="email" value={selected.email || ""} onChange={(event) => setSelected((current) => ({ ...current, email: event.target.value }))} />
            <TextField id="edit-staff-phone" label={t("staff.phone")} inputMode="numeric" maxLength={11} value={selected.phone || ""} onChange={(event) => setSelected((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "") }))} />
            <TextField id="edit-staff-district" label={t("staff.district")} value={getLocalizedField(selected, "district_name", language) || "-"} readOnly />
            <TextField id="edit-staff-role" label={t("staff.role")} value={getRoleLabel(selected.role_code, language)} readOnly />
            <SelectField id="edit-staff-facility" label={t("staff.facility")} value={String(selected.assignments?.[0]?.facility_id || "")} onChange={(event) => setSelected((current) => ({ ...current, assignments: [{ ...(current.assignments?.[0] || {}), facility_id: Number(event.target.value) }] }))}>
              <option value="">{t("staff.selectFacility")}</option>{facilityOptionsFor(selected.role_code, selected.district_id)}
            </SelectField>
            {selected.role_code === "MEDICAL_OFFICER" && (
              <div className="staff-span-2">
                {!(selected.mandal_ids || []).length && <Alert type="warning">{t("staff.noMandalWarning")}</Alert>}
                {(selected.mandal_ids || []).length > 1 && <Alert type="info">{t("staff.singleMandalNote")}</Alert>}
                <SelectField
                  id="edit-staff-mandal"
                  label={t("staff.mandal")}
                  value={(selected.mandal_ids || [])[0] || ""}
                  onChange={(event) => setSelected((current) => ({
                    ...current,
                    mandal_ids: event.target.value ? [event.target.value] : [],
                  }))}
                  hint={t("staff.mandalAssignmentHint")}
                  required
                >
                  <option value="">{t("staff.selectMandal")}</option>
                  {options.mandals
                    .filter((mandal) => String(mandal.district_id) === String(selected.district_id))
                    .map((mandal) => (
                      <option key={mandal.id} value={String(mandal.id)}>{getLocalizedMasterName(mandal, language)}</option>
                    ))}
                </SelectField>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
