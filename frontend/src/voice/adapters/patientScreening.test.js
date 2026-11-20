import {
  parsePatientScreeningTranscript,
  buildScreeningVoiceForm,
  applyScreeningVoiceUpdates,
} from "./patientScreening";
import { classifyPatches, resolvePatches } from "../applyPatches";

const symptoms = [
  { code: "MOUTH_ULCER", name_en: "Non-healing mouth ulcer", name_te: "మానని నోటి పుండు" },
  { code: "WHITE_PATCH", name_en: "White patch", name_te: "తెల్లని మచ్చ" },
  { code: "RED_PATCH", name_en: "Red patch", name_te: "ఎర్రని మచ్చ" },
  { code: "PAIN", name_en: "Pain in mouth", name_te: "నోటిలో నొప్పి" },
  { code: "DIFFICULTY_SWALLOWING", name_en: "Difficulty swallowing", name_te: "మింగడంలో ఇబ్బంది" },
  { code: "LIMITED_MOUTH_OPENING", name_en: "Limited mouth opening", name_te: "నోరు తెరవడంలో ఇబ్బంది" },
  { code: "BLEEDING", name_en: "Bleeding", name_te: "రక్తస్రావం" },
  { code: "VISIBLE_GROWTH", name_en: "Visible growth / lump", name_te: "నోటిలో గడ్డ" },
  { code: "NECK_SWELLING", name_en: "Neck swelling", name_te: "మెడలో వాపు" },
];

const exposures = [
  { code: "SMOKED_TOBACCO", name_en: "Smoked tobacco", name_te: "పొగాకు తాగడం", category: "TOBACCO" },
  { code: "SMOKELESS_TOBACCO", name_en: "Chewing tobacco", name_te: "పొగాకు నమలడం", category: "TOBACCO" },
  { code: "GUTKHA", name_en: "Gutkha", name_te: "గుట్కా", category: "TOBACCO" },
  { code: "REVERSE_SMOKING", name_en: "Reverse smoking", name_te: "రివర్స్ స్మోకింగ్", category: "TOBACCO" },
  { code: "ARECA_NUT", name_en: "Areca nut / betel quid", name_te: "వక్క / తాంబూలం", category: "ARECA" },
  { code: "ALCOHOL", name_en: "Alcohol", name_te: "మద్యం", category: "ALCOHOL" },
];

function parse(transcript, extra = {}) {
  return parsePatientScreeningTranscript(transcript, {
    symptoms,
    exposures,
    form: buildScreeningVoiceForm({}),
    language: "en",
    historyLocked: false,
    ...extra,
  });
}

describe("parsePatientScreeningTranscript — languages", () => {
  test("maps English screening answers", () => {
    const result = parse(
      "Chief complaint is burning sensation. Patient has white patch for 10 days. Currently uses gutkha for 5 years 8 times a day. Notes: follow up next week.",
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "chiefComplaint", value: expect.stringContaining("burning") }),
      expect.objectContaining({ field: "symptoms.WHITE_PATCH", value: "yes" }),
      expect.objectContaining({ field: "symptoms.WHITE_PATCH.duration_days", value: "10" }),
      expect.objectContaining({ field: "exposures.GUTKHA", value: "yes" }),
      expect.objectContaining({ field: "exposures.GUTKHA.is_current", value: "yes" }),
      expect.objectContaining({ field: "exposures.GUTKHA.duration_years", value: "5" }),
      expect.objectContaining({ field: "exposures.GUTKHA.frequency_per_day", value: "8" }),
      expect.objectContaining({ field: "notes", value: expect.stringContaining("follow up") }),
    ]));
  });

  test("maps Telugu symptom and complaint phrasing", () => {
    const result = parse(
      "ప్రధాన ఫిర్యాదు burning mouth. తెల్లని మచ్చ ఉంది.",
      { language: "te" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "chiefComplaint" }),
      expect.objectContaining({ field: "symptoms.WHITE_PATCH", value: "yes" }),
    ]));
  });

  test("maps Hindi symptom and pain negation", () => {
    const result = parse(
      "मुख्य शिकायत मुंह जलन है। सफेद धब्बा है। दर्द नहीं।",
      { language: "en" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "chiefComplaint" }),
      expect.objectContaining({ field: "symptoms.WHITE_PATCH", value: "yes" }),
      expect.objectContaining({ field: "pain.has_pain", value: "no" }),
    ]));
    expect(result.patches.find((item) => item.field === "symptoms.PAIN")).toBeUndefined();
  });
});

describe("parsePatientScreeningTranscript — polarity", () => {
  test("positive symptom answers", () => {
    const result = parse("Bleeding and neck swelling are present");
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "symptoms.BLEEDING", value: "yes" }),
      expect.objectContaining({ field: "symptoms.NECK_SWELLING", value: "yes" }),
    ]));
  });

  test("negative answers clear symptoms and exposures", () => {
    const result = parse("No white patch. Patient does not use alcohol. I do not have fever is unrelated. No pain.");
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "symptoms.WHITE_PATCH", value: "" }),
      expect.objectContaining({ field: "exposures.ALCOHOL", value: "" }),
      expect.objectContaining({ field: "pain.has_pain", value: "no" }),
    ]));
  });

  test("Telugu negation for symptom", () => {
    const result = parse("తెల్లని మచ్చ లేదు", { language: "te" });
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "symptoms.WHITE_PATCH", value: "" }),
    ]));
  });

  test("unknown exposure status does not modify values", () => {
    const result = parse("Alcohol use is unknown");
    expect(result.patches.find((item) => String(item.field).startsWith("exposures.ALCOHOL"))).toBeUndefined();
    expect(result.unclear.some((item) => item.code === "EXPOSURE_UNKNOWN")).toBe(true);
  });

  test("empty transcript yields unclear and no patches", () => {
    const result = parse("   ");
    expect(result.patches).toEqual([]);
    expect(result.unclear[0].code).toBe("EMPTY_TRANSCRIPT");
  });

  test("partial transcript maps only spoken fields", () => {
    const result = parse("difficulty swallowing for 3 days");
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "symptoms.DIFFICULTY_SWALLOWING", value: "yes" }),
      expect.objectContaining({ field: "symptoms.DIFFICULTY_SWALLOWING.duration_days", value: "3" }),
    ]));
    expect(result.patches.find((item) => item.field === "chiefComplaint")).toBeUndefined();
  });

  test("unclear bare pain does not invent has_pain", () => {
    const result = parse("patient mentioned pain vaguely");
    expect(result.patches.find((item) => item.field === "pain.has_pain")).toBeUndefined();
    expect(result.unclear.some((item) => item.code === "PAIN_UNCLEAR")).toBe(true);
  });
});

describe("parsePatientScreeningTranscript — exposures", () => {
  test("distinguishes current vs former exposure", () => {
    const current = parse("Currently drinks alcohol");
    expect(current.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "exposures.ALCOHOL", value: "yes" }),
      expect.objectContaining({ field: "exposures.ALCOHOL.is_current", value: "yes" }),
    ]));

    const former = parse("Former smoker, quit smoked tobacco");
    expect(former.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "exposures.SMOKED_TOBACCO", value: "yes" }),
      expect.objectContaining({ field: "exposures.SMOKED_TOBACCO.is_current", value: "no" }),
    ]));
  });

  test("never infers current exposure from duration alone", () => {
    const result = parse("Gutkha for 5 years");
    expect(result.patches.find((item) => item.field === "exposures.GUTKHA")).toBeUndefined();
    expect(result.patches.find((item) => item.field === "exposures.GUTKHA.is_current")).toBeUndefined();
    expect(result.unclear.some((item) => item.code === "EXPOSURE_STATUS_UNCLEAR")).toBe(true);
  });

  test("duration alone can update years only when exposure already selected", () => {
    const form = buildScreeningVoiceForm({
      exposures: { GUTKHA: { is_current: true, duration_years: "", frequency_per_day: "" } },
    });
    const result = parse("Gutkha for 5 years", { form });
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "exposures.GUTKHA.duration_years", value: "5" }),
    ]));
    expect(result.patches.find((item) => item.field === "exposures.GUTKHA.is_current")).toBeUndefined();
  });

  test("REQUEST_MORE_INFO locks exposures and conditions", () => {
    const result = parse(
      "Currently uses alcohol. Other history is diabetes. Chief complaint is sore mouth.",
      { historyLocked: true },
    );
    expect(result.patches.find((item) => String(item.field).startsWith("exposures."))).toBeUndefined();
    expect(result.patches.find((item) => item.field === "conditions")).toBeUndefined();
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "chiefComplaint" }),
    ]));
    expect(result.unclear.some((item) => item.code === "HISTORY_LOCKED")).toBe(true);
  });
});

describe("parsePatientScreeningTranscript — protected fields", () => {
  test("ordinary pain maps to pain.has_pain never symptoms.PAIN", () => {
    const result = parse("Patient has pain in the mouth");
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "pain.has_pain", value: "yes" }),
    ]));
    expect(result.patches.find((item) => item.field === "symptoms.PAIN")).toBeUndefined();
  });

  test("pain.severity stays protected", () => {
    const result = parse("Patient has pain, pain score 7 out of 10");
    expect(result.patches.find((item) => item.field === "pain.severity")).toBeUndefined();
    expect(result.patches.find((item) => item.field === "pain.has_pain")?.value).toBe("yes");
    expect(result.unclear.some((item) => item.code === "PAIN_SCORE_PROTECTED")).toBe(true);
  });

  test("consent fields are never mapped", () => {
    const result = parse(
      "Chief complaint is ulcer. Patient consent granted, witness Ramesh, authorization approved.",
    );
    expect(result.patches.every((item) => !/consent|witness|authorization/i.test(item.field))).toBe(true);
    expect(result.unclear.some((item) => item.code === "CONSENT_PROTECTED")).toBe(true);
  });

  test("diagnosis and clinician fields are never mapped", () => {
    const result = parse(
      "Chief complaint is lump. Diagnosis is cancer, referral to oncology, AI risk score high, medical officer approved.",
    );
    expect(result.patches.every((item) => !/diagnos|referral|ai_|medical_officer|risk/i.test(item.field))).toBe(true);
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "chiefComplaint" }),
    ]));
    expect(result.unclear.some((item) => item.code === "CLINICAL_PROTECTED")).toBe(true);
  });

  test("oral examination observations are never mapped", () => {
    const result = parse(
      "Oral observation on tongue: white lesion. Cheek lining exam shows red patch.",
    );
    expect(result.patches.every((item) => !String(item.field).startsWith("observations."))).toBe(true);
    expect(result.unclear.some((item) => item.code === "ORAL_EXAM_PROTECTED")).toBe(true);
  });

  test("conditions and notes require labeled phrasing", () => {
    const unlabeled = parse("diabetes and hypertension mentioned casually");
    expect(unlabeled.patches.find((item) => item.field === "conditions")).toBeUndefined();
    expect(unlabeled.patches.find((item) => item.field === "notes")).toBeUndefined();

    const labeled = parse("Other history is diabetes. Notes: review tomorrow.");
    expect(labeled.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "conditions", value: expect.stringContaining("diabetes") }),
      expect.objectContaining({ field: "notes", value: expect.stringContaining("review") }),
    ]));
  });
});

describe("conflict handling and apply helpers", () => {
  test("conflicting existing values default to keep", () => {
    const form = buildScreeningVoiceForm({
      chiefComplaint: "Existing complaint",
      symptoms: {},
      exposures: {},
      pain: { has_pain: false, severity: "", location: "", duration_days: "", notes: "" },
    });
    const parsed = parse("Chief complaint is new burning mouth");
    const { applicable, conflicts } = classifyPatches(form, parsed.patches);
    expect(conflicts.some((item) => item.field === "chiefComplaint")).toBe(true);
    const kept = resolvePatches({ applicable, conflicts, choices: {} });
    expect(kept.updates.chiefComplaint).toBeUndefined();
    const voiced = resolvePatches({ applicable, conflicts, choices: { chiefComplaint: "voice" } });
    expect(voiced.updates.chiefComplaint).toEqual(expect.stringContaining("burning"));
  });

  test("applyScreeningVoiceUpdates does not auto-submit and preserves cancel semantics", () => {
    const current = {
      chiefComplaint: "A",
      symptoms: { WHITE_PATCH: { duration_days: "2" } },
      exposures: {},
      conditions: "",
      pain: { has_pain: false, severity: "", location: "", duration_days: "", notes: "" },
      notes: "",
    };
    const canceled = applyScreeningVoiceUpdates(current, {});
    expect(canceled).toEqual(current);

    const applied = applyScreeningVoiceUpdates(current, {
      chiefComplaint: "B",
      "symptoms.BLEEDING": "yes",
      "symptoms.WHITE_PATCH": "",
      "pain.has_pain": "yes",
      "pain.location": "tongue",
      "pain.severity": "9",
      "observations.TONGUE": "lesion",
      "symptoms.PAIN": "yes",
    });
    expect(applied.chiefComplaint).toBe("B");
    expect(applied.symptoms.BLEEDING).toEqual({ duration_days: "" });
    expect(applied.symptoms.WHITE_PATCH).toBeUndefined();
    expect(applied.symptoms.PAIN).toBeUndefined();
    expect(applied.pain.has_pain).toBe(true);
    expect(applied.pain.location).toBe("tongue");
    expect(applied.pain.severity).toBe("");
    expect(applied.observations).toBeUndefined();
  });

  test("typing workflow state shape remains compatible after voice apply", () => {
    const form = buildScreeningVoiceForm({
      chiefComplaint: "",
      symptoms: {},
      exposures: {},
      conditions: "",
      pain: { has_pain: false, severity: "", location: "", duration_days: "", notes: "" },
      notes: "",
    });
    const parsed = parse(
      "Chief complaint is sore gums. Currently chews gutkha. Patient has pain. Pain location is left cheek.",
    );
    const { applicable, conflicts } = classifyPatches(form, parsed.patches);
    const { updates } = resolvePatches({
      applicable,
      conflicts,
      choices: Object.fromEntries(conflicts.map((item) => [item.field, "voice"])),
    });
    const next = applyScreeningVoiceUpdates({
      chiefComplaint: "",
      symptoms: {},
      exposures: {},
      conditions: "",
      pain: { has_pain: false, severity: "", location: "", duration_days: "", notes: "" },
      notes: "",
    }, updates);

    expect(next.chiefComplaint).toContain("sore");
    expect(next.exposures.GUTKHA.is_current).toBe(true);
    expect(next.pain.has_pain).toBe(true);
    expect(next.pain.location).toContain("left cheek");
    // Existing validation still expects these shapes
    expect(typeof next.chiefComplaint).toBe("string");
    expect(next.pain.severity).toBe("");
  });
});
