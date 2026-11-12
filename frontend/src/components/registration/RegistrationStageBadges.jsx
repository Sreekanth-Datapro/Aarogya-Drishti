import React from "react";
import { CheckCircle2, Clock, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { Badge } from "../ui";

// Labels for the two decision stages of a Health Worker registration.
// Stage 1: the Medical Officer recommends or does not recommend (never final).
// Stage 2: the District Admin finally approves or rejects.
const RECOMMENDATION = {
  RECOMMENDED: { key: "regStage.recommendedByMo", tone: "success", icon: ThumbsUp },
  NOT_RECOMMENDED: { key: "regStage.notRecommendedByMo", tone: "warning", icon: ThumbsDown },
};

const FINAL_STATUS = {
  PENDING: { key: "regStage.awaitingFinal", tone: "info", icon: Clock },
  APPROVED: { key: "regStage.finallyApproved", tone: "success", icon: CheckCircle2 },
  REJECTED: { key: "regStage.finallyRejected", tone: "danger", icon: XCircle },
};

export function RecommendationBadge({ value }) {
  const { t } = useLanguage();
  const stage = RECOMMENDATION[value];
  if (!stage) return <Badge tone="neutral" icon={Clock}>{t("regStage.awaitingMo")}</Badge>;
  return <Badge tone={stage.tone} icon={stage.icon}>{t(stage.key)}</Badge>;
}

export function FinalStatusBadge({ status }) {
  const { t } = useLanguage();
  const stage = FINAL_STATUS[status] || FINAL_STATUS.PENDING;
  return <Badge tone={stage.tone} icon={stage.icon}>{t(stage.key)}</Badge>;
}
