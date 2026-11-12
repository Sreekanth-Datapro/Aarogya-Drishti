import React, { useState } from "react";
import { FileText, Clock, CheckCircle2, XCircle, ChevronRight, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import api from "../../services/api";
import {
  formatLocalizedNumber,
  getDesignationLabel,
  getLocalizedMasterName,
  getRegistrationStatusLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { getPatientDisplayName } from "../../utils/patientName";
import "./RegistrationRequestsCard.css";

/**
 * Registration Requests Card with "Review Requests" Action Modal
 * Shows:
 *  - Pending Requests (with Clock icon + count)
 *  - Approved Requests (with Check icon + count)
 *  - Rejected Requests (with Cross icon + count)
 *  - Read-only modal for monitoring registration applications
 */
export default function RegistrationRequestsCard({ summary = {} }) {
  const { language, t, tm } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [loadError, setLoadError] = useState("");

  const reg = summary.registrations_summary || {};
  const countOrZero = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  };
  const pendingCount = countOrZero(reg.pending ?? summary.pending_registrations);
  const approvedCount = countOrZero(reg.approved);
  const rejectedCount = countOrZero(reg.rejected);

  // Open modal and fetch live registration requests
  const handleOpenReview = async () => {
    setModalOpen(true);
    setLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/dashboard/registrations?status=PENDING");
      if (res.data?.success) {
        setRegistrations(res.data.registrations || []);
      } else {
        setLoadError("dashboard.registrationLoadFailed");
      }
    } catch (error) {
      setRegistrations([]);
      setLoadError(apiMessage(error, "dashboard.registrationLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const getMasterLabel = (englishName, teluguName) =>
    getLocalizedMasterName({
      name_en: englishName || "",
      name_te: teluguName || "",
    }, language);

  return (
    <>
      <div className="bottom-card reg-requests-card">
        <div className="bottom-card-header">
          <div className="bottom-card-title">
            <FileText size={16} className="title-icon green" />
            <h4>{t("dashboard.registrationRequests")}</h4>
          </div>
          <button type="button" className="card-header-link" onClick={handleOpenReview}>
            <span>{t("dashboard.viewAll")}</span>
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="reg-status-list">
          {/* Pending */}
          <div className="reg-status-row" onClick={handleOpenReview} role="button" tabIndex={0}>
            <div className="reg-status-label-col">
              <Clock size={16} className="status-icon amber" />
              <span>{getRegistrationStatusLabel("PENDING", language)}</span>
            </div>
            <div className="reg-status-val-col">
              <strong className="status-count">{pendingCount}</strong>
              <ChevronRight size={14} className="chevron" />
            </div>
          </div>

          {/* Approved */}
          <div className="reg-status-row">
            <div className="reg-status-label-col">
              <CheckCircle2 size={16} className="status-icon green" />
              <span>{getRegistrationStatusLabel("APPROVED", language)}</span>
            </div>
            <div className="reg-status-val-col">
              <strong className="status-count">{formatLocalizedNumber(approvedCount, language)}</strong>
              <ChevronRight size={14} className="chevron" />
            </div>
          </div>

          {/* Rejected */}
          <div className="reg-status-row">
            <div className="reg-status-label-col">
              <XCircle size={16} className="status-icon red" />
              <span>{getRegistrationStatusLabel("REJECTED", language)}</span>
            </div>
            <div className="reg-status-val-col">
              <strong className="status-count">{rejectedCount}</strong>
              <ChevronRight size={14} className="chevron" />
            </div>
          </div>
        </div>
      </div>

      {/* Review Requests Modal */}
      {modalOpen && (
        <div className="review-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="review-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="review-modal-header">
              <div className="modal-title-wrap">
                <FileText size={20} className="title-icon green" />
                <h3>{t("dashboard.reviewTitle")}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label={t("dashboard.closeModal")}
              >
                <X size={18} />
              </button>
            </div>

            {loadError && (
              <div className="modal-action-banner">{tm(loadError)}</div>
            )}
            <div className="modal-action-banner">{t("dashboard.registrationReadOnly")}</div>

            <div className="review-modal-body">
              {loading ? (
                <div className="modal-loading-state">
                  <p>{t("common.loading")}</p>
                </div>
              ) : loadError ? (
                <div className="modal-empty-state">
                  <p>{tm(loadError)}</p>
                </div>
              ) : registrations.length === 0 ? (
                <div className="modal-empty-state">
                  <CheckCircle2 size={36} className="empty-icon green" />
                  <h4>{t("dashboard.noPendingRegistrations")}</h4>
                  <p>{t("dashboard.noPendingRegistrationsText")}</p>
                </div>
              ) : (
                <div className="review-table-wrapper">
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th>{t("dashboard.applicant")}</th>
                        <th>{t("dashboard.designation")}</th>
                        <th>{t("dashboard.facility")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{getPatientDisplayName({
                              name: item.full_name,
                              language,
                              patientId: item.id,
                            })}</strong>
                            <div className="applicant-sub">
                              <span>@{item.username}</span>
                              {item.phone && <span>· {item.phone}</span>}
                            </div>
                          </td>
                          <td>
                            <span className="designation-badge">{getDesignationLabel(item.designation, language)}</span>
                          </td>
                          <td>
                            <span>
                              {getMasterLabel(
                                item.facility_name || item.facility?.name_en,
                                item.facility_name_te || item.facility?.name_te
                              )}
                            </span>
                            <small className="location-sub">
                              {(() => {
                                const village = getMasterLabel(
                                  item.village_name || item.village?.name_en,
                                  item.village_name_te || item.village?.name_te
                                );
                                const mandal = getMasterLabel(
                                  item.mandal_name || item.mandal?.name_en,
                                  item.mandal_name_te || item.mandal?.name_te
                                );
                                return [village, mandal].filter(Boolean).join(", ");
                              })()}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="review-modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setModalOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
