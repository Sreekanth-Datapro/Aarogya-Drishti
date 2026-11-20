import { parsePatientRegistrationTranscript } from "./patientRegistration";

const mandals = [
  {
    district_id: 3,
    district_name: "Alluri Sitharama Raju",
    mandal_id: 4,
    mandal_name: "Paderu",
    villages: [{ id: 5, name_en: "Addulu" }, { id: 8, name_en: "Kinchumanda" }],
    facilities: [{ id: 6, name_en: "PHC Paderu" }, { id: 9, name_en: "SC Addulu" }],
    pairs: [
      { village_id: 5, facility_id: 6 },
      { village_id: 5, facility_id: 9 },
      { village_id: 8, facility_id: 10 },
    ],
  },
];

const languages = [
  { id: 1, code: "en", name_en: "English", native_name: "English" },
  { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" },
];

describe("parsePatientRegistrationTranscript", () => {
  test("parses English name, sex and age", () => {
    const result = parsePatientRegistrationTranscript(
      "Patient name is Lakshmi Devi, female, age 45 years",
      { mandals, languages, form: {}, language: "en" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "full_name", value: expect.stringContaining("Lakshmi") }),
      expect.objectContaining({ field: "sex", value: "FEMALE" }),
      expect.objectContaining({ field: "age_years", value: "45" }),
    ]));
  });

  test("parses Hindi sex and age phrases", () => {
    const result = parsePatientRegistrationTranscript(
      "नाम Ramesh है उम्र 50 साल पुरुष",
      { mandals, languages, form: {}, language: "en" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sex", value: "MALE" }),
      expect.objectContaining({ field: "age_years", value: "50" }),
    ]));
  });

  test("parses Telugu age phrase", () => {
    const result = parsePatientRegistrationTranscript(
      "పేరు Sita, వయసు 32",
      { mandals, languages, form: {}, language: "te" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "age_years", value: "32" }),
    ]));
  });

  test("matches village from assigned options only", () => {
    const result = parsePatientRegistrationTranscript(
      "Name is Demo, village Addulu, facility PHC Paderu",
      { mandals, languages, form: { mandal_id: "4" }, language: "en" },
    );
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "village_id", value: "5" }),
      expect.objectContaining({ field: "facility_id", value: "6" }),
    ]));
  });

  test("marks unknown village as unclear instead of inventing an id", () => {
    const result = parsePatientRegistrationTranscript(
      "village UnknownPlace",
      { mandals, languages, form: { mandal_id: "4" }, language: "en" },
    );
    expect(result.patches.find((item) => item.field === "village_id")).toBeUndefined();
    expect(result.unclear.some((item) => item.code === "VILLAGE_UNCLEAR")).toBe(true);
  });

  test("empty transcript yields unclear, no invented patches", () => {
    const result = parsePatientRegistrationTranscript("   ", { mandals, languages, form: {} });
    expect(result.patches).toEqual([]);
    expect(result.unclear[0].code).toBe("EMPTY_TRANSCRIPT");
  });

  test("does not map consent fields", () => {
    const result = parsePatientRegistrationTranscript(
      "Name is Asha, female, age 20, patient agrees to data processing and screening",
      { mandals, languages, form: {}, language: "en" },
    );
    const forbidden = new Set([
      "consents", "consent_method", "witness_name", "DATA_PROCESSING", "SCREENING", "IMAGE_CAPTURE",
    ]);
    expect(result.patches.every((item) => !String(item.field).includes("consent"))).toBe(true);
    expect(result.patches.every((item) => !forbidden.has(item.field))).toBe(true);
  });

  test("partial transcript maps only the spoken fields", () => {
    const result = parsePatientRegistrationTranscript(
      "age 28 years",
      { mandals, languages, form: {}, language: "en" },
    );
    expect(result.patches).toEqual([
      expect.objectContaining({ field: "age_years", value: "28" }),
    ]);
    expect(result.patches.find((item) => item.field === "full_name")).toBeUndefined();
  });
});
