export const ORAL_SCREENING_VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];

export const ORAL_SCREENING_FEATURES = {
  MOUTH: [
    "VISIBLE_REDNESS",
    "POSSIBLE_SWELLING",
    "WHITE_OR_RED_PATCHES",
    "VISIBLE_ULCERS",
    "GUM_APPEARANCE_CHANGES",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
  TONGUE: [
    "WHITE_COATING",
    "REDNESS",
    "VISIBLE_SORES",
    "SURFACE_CHANGES",
    "SWELLING",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
  SKIN: [
    "REDNESS",
    "VISIBLE_RASH",
    "PIGMENTATION_CHANGES",
    "SWELLING",
    "DRY_SCALY_APPEARANCE",
    "VISIBLE_SORES",
    "OTHER_VISIBLE_ABNORMALITIES",
  ],
};

function hasValidatedStructuredFindings(image) {
  const category = String(image.selected_category || "MOUTH").toUpperCase();
  const required = ORAL_SCREENING_FEATURES[category];
  const findings = image.possible_visual_findings;
  if (!required || !Array.isArray(findings) || findings.length !== required.length) return false;
  const seen = new Set();
  for (const finding of findings) {
    if (!finding || typeof finding.feature !== "string"
        || !["0", "1", "2", "3"].includes(String(finding.scale))
        || seen.has(finding.feature)) {
      return false;
    }
    seen.add(finding.feature);
  }
  return required.every((feature) => seen.has(feature));
}

export function getAnalysisStatus(image) {
  if (image.status === "FAILED" || image.status === "UNAVAILABLE") return "FAILED";
  if (image.analysis_status === "FAILED") return "FAILED";
  if (image.status === "NOT_ANALYZED") return "NOT_ANALYZED";
  if (image.analysis_status !== "COMPLETED") return "NOT_ASSESSED";
  const information = image.model_information;
  if (image.model_status !== "OK"
      || information?.provider_request_started !== true
      || information?.provider_request_success !== true
      || information?.provider_response_received !== true
      || information?.provider_response_validated !== true
      || information?.inference_performed !== true
      || information?.model_output_usable !== true
      || typeof information?.provider !== "string"
      || typeof information?.model_version !== "string"
      || !["NORMAL", "ABNORMAL"].includes(image.classification)
      || image.image_quality?.status !== "ACCEPTABLE"
      || !hasValidatedStructuredFindings(image)) {
    return "NOT_ASSESSED";
  }
  return "COMPLETED";
}

export function getModelDisplayStatus(image) {
  const analysisStatus = getAnalysisStatus(image);
  if (analysisStatus === "FAILED") return "ANALYSIS_FAILED";
  if (analysisStatus !== "COMPLETED") return "NOT_ASSESSABLE";
  return image.model_status;
}

export function hasUsableAiOutput(image) {
  return getAnalysisStatus(image) === "COMPLETED";
}

export function getFindingState(image, feature) {
  if (getAnalysisStatus(image) !== "COMPLETED") return "CANNOT_ASSESS";
  const finding = image.possible_visual_findings?.find((item) => item.feature === feature);
  if (!finding || getModelDisplayStatus(image) !== "OK" || image.image_quality?.status !== "ACCEPTABLE") {
    return "CANNOT_ASSESS";
  }
  if (["1", "2", "3"].includes(String(finding.scale))) return "OBSERVED";
  if (String(finding.scale) === "0") return "NOT_OBSERVED";
  return "CANNOT_ASSESS";
}

function isAdequatelyAssessed(image) {
  if (getAnalysisStatus(image) !== "COMPLETED"
      || getModelDisplayStatus(image) !== "OK"
      || image.image_quality?.status !== "ACCEPTABLE") {
    return false;
  }
  const category = String(image.selected_category || "MOUTH").toUpperCase();
  const required = ORAL_SCREENING_FEATURES[category];
  if (!required) return false;
  return required.every((feature) => {
    const finding = image.possible_visual_findings?.find((item) => item.feature === feature);
    return finding && ["0", "1", "2", "3"].includes(String(finding.scale));
  });
}

function hasPotentialFinding(image) {
  return hasUsableAiOutput(image)
    && getModelDisplayStatus(image) === "OK"
    && image.image_quality?.status === "ACCEPTABLE"
    && (image.possible_visual_findings || []).some((finding) => ["1", "2", "3"].includes(String(finding.scale)));
}

export function classifyOralScreening(images) {
  if (!images.length) return "INCONCLUSIVE";
  if (!images.every(isAdequatelyAssessed)) return "INCONCLUSIVE";
  if (images.some(hasPotentialFinding)) return "SUSPICIOUS";
  return "NO_SUSPICIOUS_FINDING";
}

export function getReportFindings(image) {
  return ORAL_SCREENING_FEATURES[String(image.selected_category || "MOUTH").toUpperCase()] || [];
}

export function getAnalyzedImageCount(images) {
  return images.filter((image) => (
    getAnalysisStatus(image) === "COMPLETED"
  )).length;
}

export function getPotentialFindings(images) {
  return images.flatMap((image) => {
    if (!hasPotentialFinding(image)) return [];
    return (image.possible_visual_findings || [])
      .filter((finding) => ["1", "2", "3"].includes(String(finding.scale)))
      .map((finding) => ({ ...finding, view: image.view }));
  });
}
