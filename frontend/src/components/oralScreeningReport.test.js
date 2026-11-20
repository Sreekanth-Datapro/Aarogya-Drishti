import React from "react";
import { render, screen } from "@testing-library/react";
import OralScreeningReport from "./OralScreeningReport";
import {
  classifyOralScreening,
  getAnalyzedImageCount,
  getAnalysisStatus,
  getFindingState,
  getModelDisplayStatus,
  hasUsableAiOutput,
  ORAL_SCREENING_FEATURES,
} from "./oralScreeningReportUtils";

jest.mock("../i18n/LanguageContext", () => ({
  useLanguage: () => ({ t: (key) => key, language: "en" }),
}));

jest.mock("../i18n/displayLabels", () => ({
  formatLocalizedDate: () => "date",
  formatLocalizedNumber: (value) => String(value),
  getCodeLabel: (_namespace, code) => code,
}));

const assessableMouthImage = (view, scale = "0") => ({
  view,
  analysis_status: "COMPLETED",
  model_status: "OK",
  classification: scale === "0" ? "NORMAL" : "ABNORMAL",
  model_information: {
    provider: "cloudflare-workers-ai",
    model_version: "@cf/meta/llama-3.2-11b-vision-instruct",
    provider_request_started: true,
    provider_request_success: true,
    provider_response_received: true,
    provider_http_status: 200,
    provider_response_validated: true,
    inference_performed: true,
    model_output_usable: true,
  },
  selected_category: "MOUTH",
  image_quality: { status: "ACCEPTABLE" },
  possible_visual_findings: ORAL_SCREENING_FEATURES.MOUTH.map((feature) => ({
    feature,
    scale: feature === "VISIBLE_REDNESS" ? scale : "0",
    note: null,
  })),
});

test("classifies a potentially concerning observed finding as suspicious", () => {
  expect(classifyOralScreening([assessableMouthImage("FRONT_VIEW", "2")])).toBe("SUSPICIOUS");
});

test("one adequately assessed image can have no suspicious finding without missing views being treated as failures", () => {
  expect(classifyOralScreening([assessableMouthImage("LEFT_VIEW")])).toBe("NO_SUSPICIOUS_FINDING");
});

test("the analyzed-image count excludes images the quality gate did not send to the model", () => {
  const assessed = assessableMouthImage("FRONT_VIEW");
  const qualityRejected = {
    ...assessableMouthImage("LEFT_VIEW"),
    model_information: { inference_performed: false },
  };
  expect(getAnalyzedImageCount([assessed, qualityRejected])).toBe(1);
});

test("database failure and no-inference states override stale successful model details", () => {
  const failedWithOldSuccess = {
    ...assessableMouthImage("FRONT_VIEW"),
    status: "FAILED",
  };
  const skippedWithOldSuccess = {
    ...assessableMouthImage("LEFT_VIEW"),
    model_information: { inference_performed: false },
  };

  expect(getAnalysisStatus(failedWithOldSuccess)).toBe("FAILED");
  expect(getModelDisplayStatus(failedWithOldSuccess)).toBe("ANALYSIS_FAILED");
  expect(getAnalysisStatus(skippedWithOldSuccess)).toBe("NOT_ASSESSED");
  expect(getModelDisplayStatus(skippedWithOldSuccess)).toBe("NOT_ASSESSABLE");
  expect(hasUsableAiOutput(failedWithOldSuccess)).toBe(false);
  expect(hasUsableAiOutput(skippedWithOldSuccess)).toBe(false);
  expect(classifyOralScreening([failedWithOldSuccess])).toBe("INCONCLUSIVE");
});

test("legacy status alone is not enough to label an image assessed or count it", () => {
  const legacyImage = {
    ...assessableMouthImage("FRONT_VIEW"),
    model_information: undefined,
  };
  expect(getAnalysisStatus(legacyImage)).toBe("NOT_ASSESSED");
  expect(getModelDisplayStatus(legacyImage)).toBe("NOT_ASSESSABLE");
  expect(hasUsableAiOutput(legacyImage)).toBe(false);
  expect(getAnalyzedImageCount([legacyImage])).toBe(0);
});

test("missing provider success, response validation, or usable-output flags fail closed", () => {
  for (const metadata of [
    { ...assessableMouthImage("FRONT_VIEW").model_information, provider_request_success: false },
    { ...assessableMouthImage("FRONT_VIEW").model_information, provider_response_validated: false },
    { ...assessableMouthImage("FRONT_VIEW").model_information, model_output_usable: false },
  ]) {
    const image = { ...assessableMouthImage("FRONT_VIEW"), model_information: metadata };
    expect(getAnalysisStatus(image)).toBe("NOT_ASSESSED");
    expect(hasUsableAiOutput(image)).toBe(false);
    expect(classifyOralScreening([image])).toBe("INCONCLUSIVE");
  }
});

test("one failed uploaded view keeps the overall result inconclusive", () => {
  const failed = {
    ...assessableMouthImage("LEFT_VIEW"),
    analysis_status: "FAILED",
    status: "FAILED",
    model_status: "ANALYSIS_FAILED",
    model_information: {
      ...assessableMouthImage("LEFT_VIEW").model_information,
      model_output_usable: false,
    },
    possible_visual_findings: [],
  };
  expect(classifyOralScreening([
    assessableMouthImage("FRONT_VIEW", "2"),
    failed,
    { ...failed, view: "RIGHT_VIEW" },
  ])).toBe("INCONCLUSIVE");
});

test("failed AI response does not render fallback text as visual observations", () => {
  render(
    <OralScreeningReport
      photos={[{
        ...assessableMouthImage("FRONT_VIEW"),
        status: "FAILED",
        analysis_status: "FAILED",
        model_status: "ANALYSIS_FAILED",
        observations: ["Fallback text must not appear as a visual observation."],
        model_information: { inference_performed: true, model_output_usable: false },
      }]}
    />
  );

  expect(screen.getByText("screening.report.analysisFailed")).toBeInTheDocument();
  expect(screen.queryByText("Fallback text must not appear as a visual observation.")).not.toBeInTheDocument();
});

test("poor quality, missing findings, and failed analysis are inconclusive", () => {
  const poorQuality = { ...assessableMouthImage("FRONT_VIEW"), image_quality: { status: "RECAPTURE" } };
  const missingFinding = {
    ...assessableMouthImage("LEFT_VIEW"),
    possible_visual_findings: [],
  };
  const failed = { ...assessableMouthImage("RIGHT_VIEW"), analysis_status: "FAILED" };

  expect(classifyOralScreening([poorQuality])).toBe("INCONCLUSIVE");
  expect(classifyOralScreening([missingFinding])).toBe("INCONCLUSIVE");
  expect(classifyOralScreening([failed])).toBe("INCONCLUSIVE");
});

test("finding states remain textual and distinguish observed, absent, and unassessable", () => {
  expect(getFindingState(assessableMouthImage("FRONT_VIEW", "1"), "VISIBLE_REDNESS")).toBe("OBSERVED");
  expect(getFindingState(assessableMouthImage("FRONT_VIEW"), "VISIBLE_REDNESS")).toBe("NOT_OBSERVED");
  expect(getFindingState({
    ...assessableMouthImage("FRONT_VIEW"),
    possible_visual_findings: [],
  }, "VISIBLE_REDNESS")).toBe("CANNOT_ASSESS");
});
