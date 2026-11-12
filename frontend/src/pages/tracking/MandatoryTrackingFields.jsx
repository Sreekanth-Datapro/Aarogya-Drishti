import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatLocalizedDate } from "../../i18n/displayLabels";
import { Badge } from "../../components/ui";

function dueLabel(dueAt, isOverdue, language, t) {
  if (!dueAt) return t("tracking.notScheduled");
  const formatted = formatLocalizedDate(dueAt, language);
  return isOverdue ? t("tracking.overdueDue", { when: formatted }) : formatted;
}

/**
 * Four mandatory patient tracking fields shown on dashboards and detail pages.
 */
export default function MandatoryTrackingFields({
  currentStageLabel,
  responsibleDisplay,
  nextActionLabel,
  dueAt,
  isOverdue = false,
  compact = false,
}) {
  const { t, language } = useLanguage();

  const items = [
    {
      key: "stage",
      label: t("tracking.mandatory.currentStage"),
      value: currentStageLabel || t("tracking.unknownStage"),
    },
    {
      key: "responsible",
      label: t("tracking.mandatory.responsiblePerson"),
      value: responsibleDisplay || t("tracking.notAssigned"),
    },
    {
      key: "next",
      label: t("tracking.mandatory.nextAction"),
      value: nextActionLabel || t("tracking.none"),
    },
    {
      key: "due",
      label: t("tracking.mandatory.dueDate"),
      value: dueLabel(dueAt, isOverdue, language, t),
      overdue: Boolean(isOverdue && dueAt),
    },
  ];

  return (
    <dl className={`tracking-mandatory${compact ? " is-compact" : ""}`}>
      {items.map((item) => (
        <div key={item.key} className={`tracking-mandatory-item${item.overdue ? " is-overdue" : ""}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.overdue ? <Badge tone="danger">{item.value}</Badge> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
