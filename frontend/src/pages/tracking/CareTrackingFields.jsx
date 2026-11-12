import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { Badge } from "../../components/ui";

/**
 * Expanded care lifecycle tracking fields for list cards and journey pages.
 * Role-shared; shows only supplied treatment_tracking values.
 */
export default function CareTrackingFields({ treatment, compact = false }) {
  const { t } = useLanguage();
  if (!treatment) return null;

  const items = [
    {
      key: "plan",
      label: t("tracking.treatment.plan"),
      value: treatment.clinical_summary || treatment.current_treatment_status || "—",
    },
    {
      key: "mo",
      label: t("tracking.treatment.responsibleMo"),
      value: treatment.responsible_mo_name || "—",
    },
    {
      key: "nav",
      label: t("tracking.treatment.navigator"),
      value: treatment.assigned_navigator_name || "—",
    },
    {
      key: "hw",
      label: t("tracking.treatment.healthWorker"),
      value: treatment.health_worker_name || "—",
    },
    {
      key: "medicine",
      label: t("tracking.treatment.medicineWindow"),
      value: [
        treatment.treatment_start_date || "—",
        treatment.medicine_end_date || "—",
      ].join(" → "),
    },
    {
      key: "precautions",
      label: t("tracking.treatment.precautions"),
      value: treatment.precautions || "—",
    },
    {
      key: "precautionDuration",
      label: t("tracking.treatment.precautionDuration"),
      value: treatment.medicine_end_date || "—",
    },
    {
      key: "revisit",
      label: t("tracking.treatment.revisitDate"),
      value: treatment.hospital_revisit_date || t("tracking.notScheduled"),
      badge: treatment.hospital_revisit_status,
    },
    {
      key: "dx",
      label: t("tracking.treatment.diagnosticStatus"),
      value: treatment.diagnostic_status || t("tracking.none"),
    },
    {
      key: "referral",
      label: t("tracking.treatment.referralStatus"),
      value: treatment.referral_code
        ? `${treatment.referral_code} · ${treatment.referral_status || ""}`
        : (treatment.referral_status || t("tracking.none")),
    },
    {
      key: "followup",
      label: t("tracking.treatment.latestFollowup"),
      value: treatment.latest_followup_due_at
        || treatment.latest_followup?.due_at
        || t("tracking.notScheduled"),
    },
  ];

  return (
    <dl className={`tracking-mandatory tracking-care-fields${compact ? " is-compact" : ""}`}>
      {items.map((item) => (
        <div key={item.key} className="tracking-mandatory-item">
          <dt>{item.label}</dt>
          <dd>
            {item.badge ? (
              <Badge
                tone={
                  item.badge === "MISSED"
                    ? "danger"
                    : item.badge === "ATTENDED"
                      ? "success"
                      : "info"
                }
              >
                {item.badge}
              </Badge>
            ) : null}
            {" "}
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
