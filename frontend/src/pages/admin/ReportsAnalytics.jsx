import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { Alert, BarChart, Button, Card, PageLoader } from "../../components/ui";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  getLocalizedField,
  getLocalizedMasterName,
  getDesignationLabel,
  getRoleLabel,
  getRegistrationStatusLabel,
  getAccountStatusLabel,
  formatLocalizedMonth,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import "./AdminPages.css";

const emptyFilters = { date_from: "", date_to: "", district_id: "", facility_id: "" };

/**
 * Reports & Analytics page — fully bilingual (English / Telugu).
 * All UI strings come from t("reports.*").
 * District and facility names come from the API with name_en / name_te
 * (district_name / district_name_te in the table) and use the chosen language.
 * Role codes use getRoleLabel; designation codes use getDesignationLabel.
 * API field values, IDs and calculations are preserved unchanged.
 */
export default function ReportsAnalytics() {
  const { language, t, tm } = useLanguage();
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState({ districts: [], facilities: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const response = await api.get("/reports/analytics", { params });
      setData(response.data);
      setOptions({
        districts: response.data.filters?.districts || [],
        facilities: response.data.filters?.facilities || [],
      });
    } catch (requestError) {
      setError(apiMessage(requestError, "reports.loadError"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) =>
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "district_id" ? { facility_id: "" } : {}),
    }));

  const visibleFacilities = options.facilities.filter(
    (facility) =>
      !filters.district_id ||
      Number(facility.district_id) === Number(filters.district_id)
  );

  return (
    <div className="admin-page">
      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{t("reports.title")}</h1>
          <p className="admin-page-subtitle">{t("reports.subtitle")}</p>
        </div>
      </div>

      {/* Filters card */}
      <Card>
        <form
          className="filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
        >
          <label>
            {t("reports.dateFrom")}
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => update("date_from", event.target.value)}
            />
          </label>

          <label>
            {t("reports.dateTo")}
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => update("date_to", event.target.value)}
            />
          </label>

          <label>
            {t("reports.district")}
            <select
              value={filters.district_id}
              onChange={(event) => update("district_id", event.target.value)}
            >
              <option value="">{t("reports.allDistricts")}</option>
              {options.districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {getLocalizedMasterName(district, language)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("reports.facility")}
            <select
              value={filters.facility_id}
              onChange={(event) => update("facility_id", event.target.value)}
            >
              <option value="">{t("reports.allFacilities")}</option>
              {visibleFacilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {getLocalizedMasterName(facility, language)}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit">{t("reports.applyFilters")}</Button>
        </form>
      </Card>

      {error && <Alert type="error">{tm(error)}</Alert>}
      {loading && <PageLoader label={t("reports.loading")} />}

      {!loading && data && (
        <>
          {/* Row 1: Summary metric cards */}
          <div className="admin-card-grid">
            <div className="metric-card">
              <span>{t("reports.totalUsers")}</span>
              <strong>{data.total_users}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.activeUsers")}</span>
              <strong>{data.active_users}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.pendingRegistrations")}</span>
              <strong>{data.registration.pending}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.pendingSetup")}</span>
              <strong>{data.account_setup.pending_setup}</strong>
            </div>
          </div>

          {/* Row 2: Three bar charts */}
          <div className="admin-card-grid three">
            <section className="admin-panel">
              <div className="admin-panel-header">
                <h2>{t("reports.usersByRole")}</h2>
              </div>
              <BarChart
                data={data.users_by_role.map((item) => ({
                  label: getRoleLabel(item.role, language),
                  value: item.total,
                }))}
              />
            </section>

            <section className="admin-panel">
              <div className="admin-panel-header">
                <h2>{t("reports.registrationStatus")}</h2>
              </div>
              <BarChart
                data={[
                  { label: getRegistrationStatusLabel("PENDING", language), value: data.registration.pending },
                  { label: getRegistrationStatusLabel("APPROVED", language), value: data.registration.approved },
                  { label: getRegistrationStatusLabel("REJECTED", language), value: data.registration.rejected },
                ]}
              />
            </section>

            <section className="admin-panel">
              <div className="admin-panel-header">
                <h2>{t("reports.setupCompletion")}</h2>
              </div>
              <BarChart
                data={[
                  { label: getAccountStatusLabel("ACTIVE", language), value: data.account_setup.completed },
                  { label: getAccountStatusLabel("PENDING_SETUP", language), value: data.account_setup.pending_setup },
                ]}
              />
            </section>
          </div>

          {/* Row 3: District-wise facilities table */}
          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2>{t("reports.districtFacilities")}</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("reports.colDistrict")}</th>
                    <th>{t("reports.colTotal")}</th>
                    <th>{t("reports.colActive")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.district_facilities.map((row) => (
                    <tr key={row.district_id}>
                      <td>{getLocalizedField(row, "district_name", language)}</td>
                      <td>{row.total}</td>
                      <td>{row.active}</td>
                    </tr>
                  ))}
                  {!data.district_facilities.length && (
                    <tr>
                      <td colSpan="3">{t("reports.noDistrictFacilities")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Row 4: Health Worker registration stats table */}
          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2>{t("reports.hwRegistrations")}</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("reports.colDesignation")}</th>
                    <th>{t("reports.colRegistrations")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.registration.designation.map((row) => (
                    <tr key={row.designation || "unspecified"}>
                      <td>
                        {row.designation
                          ? getDesignationLabel(row.designation, language)
                          : t("reports.notSpecified")}
                      </td>
                      <td>{row.total}</td>
                    </tr>
                  ))}
                  {!data.registration.designation.length && (
                    <tr>
                      <td colSpan="2">{t("reports.noHwRegistrations")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Row 5: Delivery metric cards */}
          <div className="admin-card-grid">
            <div className="metric-card">
              <span>{t("reports.emailSent")}</span>
              <strong>{data.delivery.email_sent}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.emailFailed")}</span>
              <strong>{data.delivery.email_failed}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.smsSent")}</span>
              <strong>{data.delivery.sms_sent}</strong>
            </div>
            <div className="metric-card">
              <span>{t("reports.smsFailed")}</span>
              <strong>{data.delivery.sms_failed}</strong>
            </div>
          </div>

          {/* Row 6: Monthly activity table */}
          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2>{t("reports.monthlyActivity")}</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("reports.colMonth")}</th>
                    <th>{t("reports.colMonthlyRegistrations")}</th>
                    <th>{t("reports.colUsersCreated")}</th>
                    <th>{t("reports.colFacilitiesCreated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly_activity.map((row) => (
                    <tr key={row.month_key}>
                      <td>{formatLocalizedMonth(row.month, language)}</td>
                      <td>{row.registrations}</td>
                      <td>{row.users}</td>
                      <td>{row.facilities}</td>
                    </tr>
                  ))}
                  {!data.monthly_activity.length && (
                    <tr>
                      <td colSpan="4">{t("reports.noMonthlyActivity")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
