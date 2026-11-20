const { stripScoreFields } = require("../../utils/screeningAiPresentation");

test("removes legacy screening scores without changing clinical observations or status", () => {
  const details = {
    analysis_status: "COMPLETED",
    model_status: "OK",
    possible_visual_findings: [{ feature: "VISIBLE_REDNESS", scale: "1" }],
    model_confidence: 95,
    visual_health_assessment_score: null,
    image_quality: { status: "ACCEPTABLE", score_report: { score: 90 } },
  };

  expect(stripScoreFields(details)).toEqual({
    analysis_status: "COMPLETED",
    model_status: "OK",
    possible_visual_findings: [{ feature: "VISIBLE_REDNESS", scale: "1" }],
    image_quality: { status: "ACCEPTABLE" },
  });
  expect(details.model_confidence).toBe(95);
});
