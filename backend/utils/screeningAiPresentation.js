const SCORE_FIELDS = [
  "confidence",
  "confidence_meaning",
  "criterion_scores",
  "image_quality_score",
  "model_confidence",
  "observation_confidence",
  "overall_clinical_score",
  "overall_clinical_score_message",
  "raw_model_confidence",
  "score",
  "visual_health_assessment_score",
  "visual_health_assessment_score_message",
  "visual_health_assessment_score_reasons",
  "visual_health_assessment_unassessable",
];

function stripScoreFields(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details;
  const sanitized = { ...details };
  for (const field of SCORE_FIELDS) delete sanitized[field];
  if (sanitized.image_quality && typeof sanitized.image_quality === "object") {
    sanitized.image_quality = { ...sanitized.image_quality };
    delete sanitized.image_quality.score;
    delete sanitized.image_quality.score_report;
  }
  return sanitized;
}

module.exports = { stripScoreFields };
