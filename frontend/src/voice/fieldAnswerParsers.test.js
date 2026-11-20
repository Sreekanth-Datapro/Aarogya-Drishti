import { parseRegistrationFieldAnswer, parseScreeningFieldAnswer } from "./fieldAnswerParsers";
import { classifyConfirmation } from "./receptionistLocales";
import { registrationAnswersToFormPatch, screeningAnswersToUpdates } from "./receptionistScripts";

describe("classifyConfirmation", () => {
  test("recognizes yes/no in en/te/hi", () => {
    expect(classifyConfirmation("Yes")).toBe("yes");
    expect(classifyConfirmation("అవును")).toBe("yes");
    expect(classifyConfirmation("हाँ")).toBe("yes");
    expect(classifyConfirmation("No")).toBe("no");
    expect(classifyConfirmation("కాదు")).toBe("no");
    expect(classifyConfirmation("नहीं")).toBe("no");
  });
});

describe("parseRegistrationFieldAnswer", () => {
  test("parses full name and age", () => {
    expect(parseRegistrationFieldAnswer("full_name", "My name is Ramesh Kumar").value).toBe("Ramesh Kumar");
    expect(parseRegistrationFieldAnswer("age_years", "45 years").value).toBe("45");
    expect(parseRegistrationFieldAnswer("age_years", "200").ok).toBe(false);
  });

  test("parses sex aliases", () => {
    expect(parseRegistrationFieldAnswer("sex", "female").value).toBe("FEMALE");
    expect(parseRegistrationFieldAnswer("sex", "పురుషుడు").value).toBe("MALE");
    expect(parseRegistrationFieldAnswer("sex", "महिला").value).toBe("FEMALE");
  });

  test("maps consent yes/no", () => {
    expect(parseRegistrationFieldAnswer("consent_data", "yes").value).toBe(true);
    expect(parseRegistrationFieldAnswer("consent_screening", "no").value).toBe(false);
    expect(parseRegistrationFieldAnswer("consent_data", "no").ok).toBe(false);
  });

  test("allows skip on optional habitation", () => {
    const result = parseRegistrationFieldAnswer("habitation", "skip");
    expect(result.ok).toBe(true);
    expect(result.skip).toBe(true);
  });
});

describe("registrationAnswersToFormPatch", () => {
  test("maps answers onto existing form fields", () => {
    const { patch, filled } = registrationAnswersToFormPatch({
      full_name: "Ramesh",
      sex: "MALE",
      age_years: "40",
      consent_data: true,
      consent_screening: true,
      consent_image: false,
    }, { form: { consents: { DATA_PROCESSING: false, SCREENING: null, IMAGE_CAPTURE: null } }, mandals: [] });
    expect(patch.full_name).toBe("Ramesh");
    expect(patch.sex).toBe("MALE");
    expect(patch.consents.DATA_PROCESSING).toBe(true);
    expect(patch.consents.SCREENING).toBe(true);
    expect(patch.consents.IMAGE_CAPTURE).toBe(false);
    expect(filled).toContain("full_name");
  });
});

describe("parseScreeningFieldAnswer", () => {
  const symptoms = [
    { code: "MOUTH_ULCER", name_en: "Mouth ulcer", name_te: "నోటి పుండు" },
    { code: "WHITE_PATCH", name_en: "White patch", name_te: "తెల్లని మచ్చ" },
  ];
  const exposures = [
    { code: "GUTKHA", name_en: "Gutkha", name_te: "గుట్కా" },
    { code: "ALCOHOL", name_en: "Alcohol", name_te: "మద్యం" },
  ];

  test("parses chief complaint as free text", () => {
    const result = parseScreeningFieldAnswer("chiefComplaint", "burning sensation in mouth");
    expect(result.ok).toBe(true);
    expect(result.updates.chiefComplaint).toContain("burning");
  });

  test("parses symptoms and none", () => {
    const hit = parseScreeningFieldAnswer("symptoms", "I have a mouth ulcer", { symptoms });
    expect(hit.ok).toBe(true);
    expect(hit.updates["symptoms.MOUTH_ULCER"]).toBe("yes");
    const none = parseScreeningFieldAnswer("symptoms", "none", { symptoms });
    expect(none.clearSymptoms).toBe(true);
  });

  test("parses pain yes/no", () => {
    expect(parseScreeningFieldAnswer("pain", "yes").updates["pain.has_pain"]).toBe("yes");
    expect(parseScreeningFieldAnswer("pain", "నొప్పి లేదు").updates["pain.has_pain"]).toBe("no");
  });

  test("parses exposures current/former", () => {
    const result = parseScreeningFieldAnswer("exposures", "I currently use gutkha", { exposures });
    expect(result.updates["exposures.GUTKHA"]).toBe("yes");
    expect(result.updates["exposures.GUTKHA.is_current"]).toBe("yes");
  });
});

describe("screeningAnswersToUpdates", () => {
  test("flattens meta updates", () => {
    const { updates } = screeningAnswersToUpdates({
      chiefComplaint: "ulcer",
      pain: true,
      __meta_symptoms: {
        updates: { "symptoms.MOUTH_ULCER": "yes" },
      },
    });
    expect(updates.chiefComplaint).toBe("ulcer");
    expect(updates["pain.has_pain"]).toBe("yes");
    expect(updates["symptoms.MOUTH_ULCER"]).toBe("yes");
  });
});
