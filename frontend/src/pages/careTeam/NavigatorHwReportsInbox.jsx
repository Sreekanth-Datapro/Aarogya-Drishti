import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, FileSearch, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Badge, Button } from "../../components/ui";

function readableDate(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(order) {
  const workflow = String(order.workflow_status || "").toUpperCase();
  if (workflow === "RETURNED_FOR_CORRECTION") return "warning";
  if (workflow === "NAVIGATOR_VERIFICATION" || workflow === "SENT_TO_HOSPITAL_STAFF") return "success";
  if (workflow === "REPORT_UPLOADED" || order.report_count > 0) return "info";
  return "neutral";
}

function statusLabel(order, t) {
  const workflow = String(order.workflow_status || "").toUpperCase();
  if (workflow === "RETURNED_FOR_CORRECTION") return t("navigator.hwReportsReturned");
  if (workflow === "NAVIGATOR_VERIFICATION") return t("navigator.hwReportsVerified");
  if (workflow === "SENT_TO_HOSPITAL_STAFF") return t("navigator.hwReportsForwarded");
  if (workflow === "REPORT_UPLOADED" || order.status_code === "REPORT_RECEIVED") {
    return t("navigator.hwReportsPendingVerification");
  }
  return order.workflow_status || order.status_name || t("navigator.hwReportsNew");
}

export default function NavigatorHwReportsInbox() {
  const { t, tm, language } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    setError("");
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get("/diagnostics/orders", {
        params: { awaiting_navigator: "true", page_size: 20 },
      });
      setOrders(response.data.orders || []);
    } catch (requestError) {
      setError(apiMessage(requestError, "navigator.hwReportsLoadFailed"));
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="navigator-hw-reports mo-card" aria-labelledby="navigator-hw-reports-title">
      <div className="navigator-hw-reports-head">
        <div>
          <h2 id="navigator-hw-reports-title">
            <ClipboardList size={18} aria-hidden="true" /> {t("navigator.hwReportsTitle")}
          </h2>
          <p className="mo-muted">{t("navigator.hwReportsSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || refreshing}
          onClick={() => load(true)}
        >
          <RefreshCw size={14} aria-hidden="true" /> {t("common.refresh")}
        </Button>
      </div>

      {error && (
        <Alert type="error">
          {tm(error)}{" "}
          <button type="button" className="linkish" onClick={() => load(true)}>
            {t("common.tryAgain")}
          </button>
        </Alert>
      )}

      {loading ? (
        <p className="mo-muted">{t("common.loading")}</p>
      ) : orders.length === 0 ? (
        <p className="mo-muted">{t("navigator.hwReportsEmpty")}</p>
      ) : (
        <ul className="navigator-hw-report-list">
          {orders.map((order) => (
            <li key={order.id} className="navigator-hw-report-card">
              <div>
                <strong>{order.patient_name}</strong>
                <span>{order.patient_code}</span>
                <span>{order.order_code}</span>
                <span>
                  {(order.investigation_names || order.items?.map((item) => item.test_name) || []).join(", ") || "—"}
                </span>
                <span>
                  {t("diagnostics.assignedHealthWorker")}: {order.assigned_health_worker_name || "—"}
                </span>
                <span>
                  {t("navigator.hwReportsUploadedAt")}: {readableDate(order.latest_upload_at || order.updated_at, language)}
                </span>
                <span>
                  {t("navigator.hwReportsFileCount")}: {order.report_count || 0}
                </span>
                <div className="diagnostics-item-tags">
                  <Badge tone={statusTone(order)}>{statusLabel(order, t)}</Badge>
                </div>
              </div>
              <div className="diagnostics-actions">
                <Link className="btn btn-secondary" to={`/navigator/diagnostics/${order.id}`}>
                  <FileSearch size={14} aria-hidden="true" /> {t("navigator.hwReportsView")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
