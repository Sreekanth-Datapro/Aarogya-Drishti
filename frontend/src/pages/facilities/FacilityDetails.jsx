import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, PencilLine } from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDateTime, getLocalizedField, getLocalizedMasterName, getRoleLabel } from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button, Card, EmptyState, Spinner } from "../../components/ui";
import StatusDialog from "../../components/facilities/StatusDialog";
import { canManageFacilities } from "../../components/facilities/facilityTypes";

// One label + value row of the details list
function Detail({ label, children }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function FacilityDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, tm, language } = useLanguage();
  const location = useLocation();
  const canManage = canManageFacilities(user);

  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(location.state?.message || "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/facilities/${id}`)
      .then(({ data }) => setFacility(data.facility))
      .catch((err) => setError(apiMessage(err, "facilities.notFound")))
      .finally(() => setLoading(false));
  }, [id]);

  const changeStatus = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/facilities/${id}/status`, { is_active: !facility.is_active });
      setFacility(data.facility);
      setMessage(data.message);
    } catch (err) {
      setError(apiMessage(err, "facilities.statusFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const formatDate = (value) => formatLocalizedDateTime(value, language, { dateStyle: "medium", timeStyle: "short" });
  const show = (value) => value || <span className="muted-cell">{t("facilities.noValue")}</span>;

  const backLink = (
    <Link className="btn btn-ghost btn-sm" to="/admin/facilities">
      <ArrowLeft size={16} aria-hidden="true" /> {t("facilities.back")}
    </Link>
  );

  if (loading) {
    return (
      <Card>
        <p className="loading-line" aria-busy="true"><Spinner /> {t("common.loading")}</p>
      </Card>
    );
  }

  if (!facility) {
    return (
      <Card>
        <EmptyState title={t("facilities.notFound")} text={tm(error)} action={backLink} />
      </Card>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          {backLink}
          <h1 className="page-title">{getLocalizedMasterName(facility, language)}</h1>
          <p className="page-subtitle">
            {t(`facilities.types.${facility.category}`)}{" "}
            <Badge tone={facility.is_active ? "success" : "neutral"}>
              {facility.is_active ? t("facilities.statusActive") : t("facilities.statusInactive")}
            </Badge>
          </p>
        </div>
        {canManage && (
          <div className="toolbar-actions">
            <Link className="btn btn-secondary" to={`/admin/facilities/${facility.id}/edit`}>
              <PencilLine size={18} aria-hidden="true" /> {t("facilities.edit")}
            </Link>
            <Button variant={facility.is_active ? "danger" : "primary"} onClick={() => setConfirming(true)}>
              {facility.is_active ? t("facilities.deactivate") : t("facilities.activate")}
            </Button>
          </div>
        )}
      </div>

      {message && <div className="section facility-details-message"><Alert type="success">{tm(message)}</Alert></div>}
      {error && <div className="section facility-details-message"><Alert type="error">{tm(error)}</Alert></div>}

      <div className="grid grid-2">
        <Card title={t("facilities.basic")}>
          <dl className="detail-list">
            <Detail label={t("facilities.name")}>{facility.name_en}</Detail>
            <Detail label={t("facilities.nameTe")}>{show(facility.name_te)}</Detail>
            <Detail label={t("facilities.type")}>{t(`facilities.types.${facility.category}`)}</Detail>
            <Detail label={t("facilities.code")}>{facility.code ? <span className="mono">{facility.code}</span> : show(null)}</Detail>
            <Detail label={t("facilities.createdAt")}>{formatDate(facility.created_at)}</Detail>
            <Detail label={t("facilities.updatedAt")}>{formatDate(facility.updated_at)}</Detail>
          </dl>
        </Card>

        <Card title={t("facilities.location")}>
          <dl className="detail-list">
            <Detail label={t("facilities.district")}>{getLocalizedField(facility, "district_name", language)}</Detail>
            <Detail label={t("facilities.mandal")}>{show(getLocalizedField(facility, "mandal_name", language))}</Detail>
            <Detail label={t("facilities.village")}>{show(getLocalizedField(facility, "village_name", language))}</Detail>
            <Detail label={t("facilities.address")}>{show(facility.address)}</Detail>
            <Detail label={t("facilities.pin")}>{show(facility.pin_code)}</Detail>
          </dl>
        </Card>

        <Card title={t("facilities.contact")}>
          <dl className="detail-list">
            <Detail label={t("facilities.phone")}>{show(facility.contact_phone)}</Detail>
            <Detail label={t("facilities.email")}>{show(facility.email)}</Detail>
            <Detail label={t("facilities.incharge")}>{show(facility.incharge_name)}</Detail>
          </dl>
        </Card>

        <Card title={t("facilities.assignedStaff")}>
          {!facility.assigned_staff?.length ? (
            <EmptyState title={t("facilities.noAssignedStaff")} />
          ) : (
            <div className="detail-list">
              {facility.assigned_staff.map((staff) => (
                <Detail key={staff.id} label={staff.full_name || staff.username}>
                  {getRoleLabel(staff.role_name, language)}{staff.is_primary ? ` · ${t("facilities.primaryAssignment")}` : ""}
                </Detail>
              ))}
            </div>
          )}
        </Card>
      </div>

      <StatusDialog facility={confirming ? facility : null} busy={busy} onCancel={() => setConfirming(false)} onConfirm={changeStatus} />
    </>
  );
}
