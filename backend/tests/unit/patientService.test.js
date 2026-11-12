const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

jest.mock("../../db", () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: (...args) => mockPoolConnect(...args),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));

const { audit } = require("../../utils/audit");
const patientService = require("../../services/patientService");

const userId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const req = { user: { id: userId, role_name: "HEALTH_WORKER" } };
// Registration requires a preferred language and the patient's consent answers
const patientInput = {
  full_name: "Demo Patient",
  sex: "FEMALE",
  age_years: 42,
  village_id: 12,
  facility_id: 45,
  preferred_language_id: 2,
  consents: { DATA_PROCESSING: true, SCREENING: true, IMAGE_CAPTURE: false },
  consent_method: "CHECKBOX",
};
const purposes = [
  { id: 1, code: "SCREENING", version: "v1" },
  { id: 2, code: "IMAGE_CAPTURE", version: "v1" },
  { id: 4, code: "DATA_PROCESSING", version: "v1" },
];

function defaultClientQuery(sql) {
  if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
  if (sql.includes("FROM tbl_health_worker_location_assignments")) return { rows: [{ mandal_id: 6 }] };
  if (sql.includes("FROM mst_languages")) return { rows: [{ id: 2 }] };
  if (sql.includes("FROM mst_consent_purposes")) return { rows: purposes };
  if (sql.includes("INSERT INTO tbl_patients")) {
    return { rows: [{ id: patientId, patient_code: "AD-2026-000001", mandal_id: 6 }] };
  }
  return { rows: [] };
}

const consentInserts = () => mockClientQuery.mock.calls.filter(([sql]) => sql.includes("INSERT INTO tbl_patient_consents"));

beforeEach(() => {
  jest.clearAllMocks();
  mockPoolQuery.mockReset();
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: jest.fn(),
  });
  mockClientQuery.mockImplementation(async (sql) => defaultClientQuery(sql));
});

test("patient registration uses only the authenticated worker's assigned village and facility", async () => {
  const patient = await patientService.registerPatient(userId, req, {
    ...patientInput,
    district_id: 999,
    mandal_id: 999,
    registered_by: "33333333-3333-4333-8333-333333333333",
  });

  const assignmentCheck = mockClientQuery.mock.calls.find(([sql]) =>
    sql.includes("FROM tbl_health_worker_location_assignments")
  );
  const insert = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_patients"));
  const insertedColumns = insert[0].match(/INSERT INTO tbl_patients\s*\(([\s\S]*?)\)\s*VALUES/i)[1];
  expect(assignmentCheck[1]).toEqual([userId, patientInput.village_id, patientInput.facility_id]);
  expect(insert[1]).toContain(userId);
  expect(insertedColumns).not.toMatch(/district_id|mandal_id/i);
  expect(patient.mandal_id).toBe(6);
  expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    client: expect.anything(),
    required: true,
    event: "PATIENT_REGISTERED",
  }));
  const commitIndex = mockClientQuery.mock.calls.findIndex(([sql]) => sql === "COMMIT");
  expect(audit.mock.invocationCallOrder[0])
    .toBeLessThan(mockClientQuery.mock.invocationCallOrder[commitIndex]);
});

test("Health Worker recent patients use the active-first screening and consent-gated review status", async () => {
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{
      id: patientId,
      screening_consent: true,
      case_state: "AWAITING_CLINICIAN",
      medical_officer_decision: null,
      reviewed_at: null,
      medical_officer_request_note: null,
    }],
  });

  const [patient] = await patientService.listMine(userId);
  const query = mockPoolQuery.mock.calls[0][0];

  expect(query).toContain("fn_user_has_patient_access($1,p.id)");
  expect(query).toContain("ORDER BY (s.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, s.created_at DESC");
  expect(query).toContain("CASE WHEN screening_consent.granted IS TRUE THEN latest.case_state::text END AS case_state");
  expect(query).toContain("CASE WHEN screening_consent.granted IS TRUE AND latest.signed_at IS NOT NULL");
  expect(query).toContain("THEN latest.decision::text END AS medical_officer_decision");
  expect(query).toContain("latest.decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')");
  expect(query).toContain("latest.signed_at IS NOT NULL");
  expect(patient).toMatchObject({
    case_state: "AWAITING_CLINICIAN",
    screening_consent: true,
    medical_officer_request_note: null,
  });
  expect(mockPoolQuery.mock.calls[0][1]).toEqual([userId]);
});

test("patient registration rejects an unassigned location without inserting a patient", async () => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("FROM tbl_health_worker_location_assignments")) return { rows: [] };
    return { rows: [] };
  });

  await expect(patientService.registerPatient(userId, req, patientInput))
    .rejects.toMatchObject({ status: 403, code: "LOCATION_NOT_ASSIGNED" });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_patients"))).toBe(false);
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("patient registration requires age or date of birth before opening a database connection", async () => {
  const { age_years, ...incomplete } = patientInput;
  await expect(patientService.registerPatient(userId, req, incomplete))
    .rejects.toMatchObject({ status: 400, code: "INVALID_PATIENT" });
  expect(mockPoolConnect).not.toHaveBeenCalled();
});

test("patient registration rolls back when its critical audit write fails", async () => {
  audit.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(patientService.registerPatient(userId, req, patientInput))
    .rejects.toThrow("audit unavailable");

  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(mockClientQuery).not.toHaveBeenCalledWith("COMMIT");
});

test("the patient's consent answers are stored in the same transaction, one row per purpose", async () => {
  const patient = await patientService.registerPatient(userId, req, {
    ...patientInput, consent_method: "VERBAL_WITNESSED", witness_name: "ANM Sita",
  });

  const rows = consentInserts().map(([, params]) => params);
  expect(rows).toHaveLength(3);
  const byPurpose = Object.fromEntries(rows.map((params) => [params[1], params]));
  expect(byPurpose[1]).toEqual([patientId, 1, 2, "v1", "VERBAL_WITNESSED", true, userId, "ANM Sita"]);
  expect(byPurpose[2][5]).toBe(false);
  expect(byPurpose[4][5]).toBe(true);
  expect(patient.consents).toEqual({ DATA_PROCESSING: true, SCREENING: true, IMAGE_CAPTURE: false });

  const order = (text) => mockClientQuery.mock.calls.findIndex(([sql]) => sql === text || sql.includes(text));
  expect(order("INSERT INTO tbl_patients")).toBeLessThan(order("INSERT INTO tbl_patient_consents"));
  expect(order("INSERT INTO tbl_patient_consents")).toBeLessThan(order("COMMIT"));
  const insert = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_patients"));
  expect(insert[0]).toContain("preferred_language_id");
});

test.each([
  ["no data processing consent", { consents: { DATA_PROCESSING: false, SCREENING: true, IMAGE_CAPTURE: true } }, "CONSENT_REQUIRED"],
  ["a missing consent answer", { consents: { DATA_PROCESSING: true, SCREENING: true } }, "INVALID_CONSENT"],
  ["an unknown consent method", { consent_method: "EMAIL" }, "INVALID_CONSENT"],
  ["verbal consent without a witness", { consent_method: "VERBAL_WITNESSED" }, "INVALID_CONSENT"],
  ["thumbprint consent without a witness", { consent_method: "THUMBPRINT", witness_name: "  " }, "INVALID_CONSENT"],
  ["no preferred language", { preferred_language_id: "" }, "INVALID_PATIENT"],
])("registration is refused for %s before any database work", async (_label, change, code) => {
  await expect(patientService.registerPatient(userId, req, { ...patientInput, ...change }))
    .rejects.toMatchObject({ status: 400, code });
  expect(mockPoolConnect).not.toHaveBeenCalled();
});

test("an inactive or unknown language is refused and nothing is stored", async () => {
  mockClientQuery.mockImplementation(async (sql) => (sql.includes("FROM mst_languages") ? { rows: [] } : defaultClientQuery(sql)));
  await expect(patientService.registerPatient(userId, req, patientInput))
    .rejects.toMatchObject({ status: 400, code: "INVALID_PATIENT" });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("a failed consent write rolls back the patient", async () => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql.includes("INSERT INTO tbl_patient_consents")) throw new Error("consent write failed");
    return defaultClientQuery(sql);
  });
  await expect(patientService.registerPatient(userId, req, patientInput)).rejects.toThrow("consent write failed");
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(mockClientQuery).not.toHaveBeenCalledWith("COMMIT");
});

test("submitting the same form twice returns the first patient without a second insert", async () => {
  const idempotencyKey = "44444444-4444-4444-8444-444444444444";
  mockClientQuery.mockImplementation(async (sql) => (
    sql.includes("idempotency_key=$2")
      ? { rows: [{ id: patientId, patient_code: "AD-2026-000001" }] }
      : defaultClientQuery(sql)
  ));
  const patient = await patientService.registerPatient(userId, req, { ...patientInput, idempotency_key: idempotencyKey });

  expect(patient).toMatchObject({ patient_code: "AD-2026-000001", already_registered: true });
  const lookup = mockClientQuery.mock.calls.find(([sql]) => sql.includes("idempotency_key=$2"));
  expect(lookup[1]).toEqual([userId, idempotencyKey]);
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  expect(audit).not.toHaveBeenCalled();
});

test("offline sync timestamps are stored separately from server created_at", async () => {
  const clientCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const consentCapturedAt = new Date(Date.now() - 55 * 60 * 1000).toISOString();

  const patient = await patientService.registerPatient(userId, req, {
    ...patientInput,
    idempotency_key: "55555555-5555-4555-8555-555555555555",
    client_created_at: clientCreatedAt,
    consent_captured_at: consentCapturedAt,
  });

  const insert = mockClientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO tbl_patients"));
  expect(insert[0]).toMatch(/client_created_at/);
  expect(insert[1]).toContain(clientCreatedAt);

  const consentInsert = consentInserts()[0];
  expect(consentInsert[0]).toMatch(/captured_at/);
  expect(consentInsert[1]).toContain(consentCapturedAt);
  expect(patient.consent_captured_at).toBe(consentCapturedAt);
  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    metadata: expect.objectContaining({
      client_created_at: clientCreatedAt,
      consent_captured_at: consentCapturedAt,
    }),
  }));
});

test("rejects a future client_created_at without inserting", async () => {
  await expect(patientService.registerPatient(userId, req, {
    ...patientInput,
    client_created_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })).rejects.toMatchObject({ status: 400, code: "INVALID_CLIENT_TIMESTAMP" });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
});

describe("Mandal-wide registration (proposed migration 017)", () => {
  const locations = [
    { assignment_id: "a-1", district_id: "3", district_name: "ASR", mandal_id: "4", mandal_name: "Paderu",
      village_id: "5", village_name: "Addulu", facility_id: "6", facility_name: "PHC Paderu" },
    { assignment_id: "a-2", district_id: "3", district_name: "ASR", mandal_id: "4", mandal_name: "Paderu",
      village_id: "8", village_name: "Kinchumanda", facility_id: "6", facility_name: "PHC Paderu" },
  ];
  const migrationApplied = (applied) => (sql) => (
    sql.includes("schema_migrations") ? { rows: [{ enabled: applied }] } : null
  );

  test("before 017 the choices are only the assigned villages, facilities and their pairs", async () => {
    mockPoolQuery.mockImplementation(async (sql) => migrationApplied(false)(sql) || { rows: [] });
    const choices = await patientService.getRegistrationChoices(userId, locations);

    expect(choices.mandal_wide).toBe(false);
    expect(choices.mandals).toHaveLength(1);
    const [mandal] = choices.mandals;
    expect(mandal).toMatchObject({ district_name: "ASR", mandal_name: "Paderu" });
    expect(mandal.villages.map((village) => village.name_en)).toEqual(["Addulu", "Kinchumanda"]);
    expect(mandal.facilities.map((facility) => facility.name_en)).toEqual(["PHC Paderu"]);
    expect(mandal.pairs).toEqual([{ village_id: "5", facility_id: "6" }, { village_id: "8", facility_id: "6" }]);
    expect(mockPoolQuery.mock.calls.some(([sql]) => sql.includes("FROM mst_villages"))).toBe(false);
  });

  test("after 017 every active village and facility of the assigned Mandal is offered", async () => {
    mockPoolQuery.mockImplementation(async (sql, params) => {
      const migration = migrationApplied(true)(sql);
      if (migration) return migration;
      if (sql.includes("FROM mst_villages")) {
        expect(params).toEqual([["4"]]);
        return { rows: [{ id: "5", mandal_id: "4", name_en: "Addulu" }, { id: "9", mandal_id: "4", name_en: "Lagisapalli" }] };
      }
      if (sql.includes("FROM mst_facilities")) {
        expect(sql).toContain("is_active IS TRUE");
        return { rows: [{ id: "6", mandal_id: "4", name_en: "PHC Paderu" }, { id: "12", mandal_id: "4", name_en: "SC Lagisapalli" }] };
      }
      return { rows: [] };
    });
    const { mandal_wide: mandalWide, mandals } = await patientService.getRegistrationChoices(userId, locations);

    expect(mandalWide).toBe(true);
    expect(mandals[0].villages.map((village) => village.name_en)).toEqual(["Addulu", "Lagisapalli"]);
    expect(mandals[0].facilities.map((facility) => facility.name_en)).toEqual(["PHC Paderu", "SC Lagisapalli"]);
    expect(mandals[0].pairs).toEqual([]);
  });

  test("after 017 registration checks the Mandal assignment and that village and facility belong to it", async () => {
    mockPoolQuery.mockImplementation(async (sql) => migrationApplied(true)(sql) || { rows: [] });
    await patientService.registerPatient(userId, req, patientInput);

    const check = mockClientQuery.mock.calls.find(([sql]) => sql.includes("FROM tbl_health_worker_location_assignments"));
    expect(check[0]).toContain("v.mandal_id=a.mandal_id");
    expect(check[0]).toContain("f.mandal_id=a.mandal_id");
    expect(check[0]).not.toContain("a.village_id=$2");
    expect(check[1]).toEqual([userId, patientInput.village_id, patientInput.facility_id]);
  });

  test("before 017 registration still needs the exact assigned village and facility", async () => {
    mockPoolQuery.mockImplementation(async (sql) => migrationApplied(false)(sql) || { rows: [] });
    await patientService.registerPatient(userId, req, patientInput);

    const check = mockClientQuery.mock.calls.find(([sql]) => sql.includes("FROM tbl_health_worker_location_assignments"));
    expect(check[0]).toContain("a.village_id=$2");
    expect(check[0]).toContain("a.facility_id=$3");
  });
});

test("the dashboard summary counts only the signed-in worker's patients", async () => {
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("screening_consented")) return { rows: [{ total: "5", this_month: "3", today: "1", screening_consented: "4" }] };
    if (sql.includes("generate_series")) return { rows: [{ day: "2026-11-07", count: "1" }] };
    if (sql.includes("JOIN mst_villages")) return { rows: [{ village_name: "Addulu", village_name_te: null, count: "5" }] };
    if (sql.includes("p.sex::text")) return { rows: [{ sex: "FEMALE", count: "3" }, { sex: "MALE", count: "2" }] };
    if (sql.includes("age_group")) return { rows: [{ age_group: "40_59", count: "5" }] };
    return { rows: [] };
  });
  const summary = await patientService.getSummary(userId);

  expect(summary).toEqual({
    total: 5, this_month: 3, today: 1, screening_consented: 4,
    last_7_days: [{ day: "2026-11-07", count: 1 }],
    by_village: [{ village_name: "Addulu", village_name_te: null, count: 5 }],
    by_sex: [{ sex: "FEMALE", count: 3 }, { sex: "MALE", count: 2 }],
    by_age_group: [{ age_group: "40_59", count: 5 }],
  });
  expect(mockPoolQuery).toHaveBeenCalledTimes(5);
  mockPoolQuery.mock.calls.forEach(([sql]) => expect(sql).not.toMatch(/full_name|contact_phone|address_line/));
  mockPoolQuery.mock.calls.forEach(([sql, params]) => {
    expect(sql).toContain("p.registered_by=$1");
    expect(params).toEqual([userId]);
  });
});

test("patient search scopes every result to authorized patients and binds escaped search input", async () => {
  mockPoolQuery.mockImplementation(async (sql) => (
    sql.includes("COUNT(*)") ? { rows: [{ total: "21" }] } : { rows: [{ id: patientId, patient_code: "AD-2026-000001" }] }
  ));
  const result = await patientService.searchPatients(userId, { q: "A%_", page: "2", limit: "10" });

  expect(result).toMatchObject({ page: 2, limit: 10, total: 21, pages: 3 });
  expect(result.patients).toHaveLength(1);
  expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  mockPoolQuery.mock.calls.forEach(([sql]) => {
    expect(sql).toContain("fn_user_has_patient_access($1,p.id)");
    expect(sql).toContain("p.id::text ILIKE");
  });
  expect(mockPoolQuery.mock.calls[0][1]).toEqual([userId, "%A\\%\\_%", 10, 10]);
  expect(mockPoolQuery.mock.calls[1][1]).toEqual([userId, "%A\\%\\_%"]);
});

test("patient search rejects short terms before querying the database", async () => {
  await expect(patientService.searchPatients(userId, { q: "a" }))
    .rejects.toMatchObject({ status: 400, code: "INVALID_SEARCH" });
  expect(mockPoolQuery).not.toHaveBeenCalled();
});

test("duplicate checks validate location assignment and limit matches to accessible patients", async () => {
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("schema_migrations")) return { rows: [{ enabled: false }] };
    if (sql.includes("tbl_health_worker_location_assignments")) return { rows: [{ mandal_id: 6 }] };
    return { rows: [{ id: patientId, patient_code: "AD-2026-000001" }] };
  });
  const matches = await patientService.checkDuplicates(userId, patientInput);

  expect(matches).toHaveLength(1);
  expect(matches[0].match_type).toBe("NAME_SEX_AGE_VILLAGE");
  const matchQuery = mockPoolQuery.mock.calls.find(([sql]) => sql.includes("regexp_replace"));
  expect(matchQuery[0]).toContain("fn_user_has_patient_access($1,p.id)");
  expect(matchQuery[1]).toEqual([userId, "demo patient", "FEMALE", 12, 42]);
});

test("registration rechecks duplicates in its transaction and requires explicit confirmation", async () => {
  const candidate = { id: patientId, patient_code: "AD-2026-000001", full_name: "Demo Patient" };
  mockClientQuery.mockImplementation(async (sql) => (
    sql.includes("regexp_replace") ? { rows: [candidate] } : defaultClientQuery(sql)
  ));

  await expect(patientService.registerPatient(userId, req, patientInput))
    .rejects.toMatchObject({
      status: 409,
      code: "POSSIBLE_DUPLICATES",
      matches: [expect.objectContaining(candidate)],
    });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_patients"))).toBe(false);
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("registration asks for new confirmation when the final duplicate recheck finds an unseen match", async () => {
  const reviewedMatch = { id: patientId, patient_code: "AD-2026-000001", full_name: "Demo Patient" };
  const newMatch = { id: "33333333-3333-4333-8333-333333333333", patient_code: "AD-2026-000002", full_name: "Demo Patient" };
  mockClientQuery.mockImplementation(async (sql) => (
    sql.includes("regexp_replace") ? { rows: [reviewedMatch, newMatch] } : defaultClientQuery(sql)
  ));

  await expect(patientService.registerPatient(userId, req, {
    ...patientInput,
    confirm_possible_duplicate: true,
    confirmed_duplicate_ids: [reviewedMatch.id],
  })).rejects.toMatchObject({
    code: "POSSIBLE_DUPLICATES",
    matches: [expect.objectContaining({ id: newMatch.id })],
  });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_patients"))).toBe(false);
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("patient details return only records guarded by the worker patient-access function", async () => {
  mockPoolQuery.mockImplementation(async (sql) => (
    sql.includes("JOIN tbl_users registrar")
      ? { rows: [{ id: patientId, patient_code: "AD-2026-000001", full_name: "Demo Patient" }] }
      : { rows: [] }
  ));
  const result = await patientService.getPatientDetails(userId, patientId);

  expect(result).toMatchObject({
    patient: { id: patientId, patient_code: "AD-2026-000001" },
    consents: [],
    medical_history: [],
    findings: [],
    screenings: [],
    referrals: [],
  });
  mockPoolQuery.mock.calls.forEach(([sql]) => expect(sql).toContain("fn_user_has_patient_access"));
});

test("patient details require current SCREENING consent for screening-derived records", async () => {
  mockPoolQuery.mockImplementation(async (sql) => (
    sql.includes("JOIN tbl_users registrar")
      ? { rows: [{ id: patientId, patient_code: "AD-2026-000001", full_name: "Demo Patient" }] }
      : { rows: [] }
  ));
  await patientService.getPatientDetails(userId, patientId);

  const queryFor = (table) => mockPoolQuery.mock.calls.find(([sql]) => sql.includes(table))?.[0];
  const historyQuery = queryFor("FROM tbl_patient_medical_histories");
  const findingsQuery = queryFor("FROM tbl_screening_findings");
  const screeningsQuery = queryFor("FROM tbl_screenings s");
  const referralsQuery = queryFor("FROM tbl_referrals r");

  for (const query of [historyQuery, findingsQuery, screeningsQuery, referralsQuery]) {
    expect(query).toContain("fn_user_has_patient_access");
  }
  for (const query of [historyQuery, findingsQuery, referralsQuery]) {
    expect(query).toContain("cp.code='SCREENING'");
    expect(query).toContain("ORDER BY pc.consent_seq DESC");
    expect(query).toContain(") IS TRUE");
  }
  expect(screeningsQuery).toContain("screening_consent.granted IS TRUE");
});

test("patient history includes signed recapture remarks only while screening consent is current", async () => {
  mockPoolQuery.mockImplementation(async (sql) => {
    if (sql.includes("JOIN tbl_users registrar")) {
      return { rows: [{ id: patientId, patient_code: "AD-2026-000001", full_name: "Demo Patient" }] };
    }
    if (sql.includes("FROM tbl_screenings s")) {
      return { rows: [{
        id: "33333333-3333-4333-8333-333333333333",
        case_state: "SCREENED",
        medical_officer_decision: "REQUEST_RECAPTURE",
        medical_officer_request_note: "Retake the left-side photo.",
      }] };
    }
    return { rows: [] };
  });

  const result = await patientService.getPatientDetails(userId, patientId);
  const [screeningQuery] = mockPoolQuery.mock.calls.find(([sql]) => sql.includes("FROM tbl_screenings s"));

  expect(result.screenings).toEqual([expect.objectContaining({
    case_state: "SCREENED",
    medical_officer_decision: "REQUEST_RECAPTURE",
    medical_officer_request_note: "Retake the left-side photo.",
  })]);
  expect(screeningQuery).toContain("screening_consent.granted IS TRUE AND review.signed_at IS NOT NULL");
  expect(screeningQuery).toContain("review.decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')");
  expect(screeningQuery).toContain("fn_user_has_patient_access");
});

test("patient details conceal invalid or inaccessible patient IDs", async () => {
  await expect(patientService.getPatientDetails(userId, "not-a-uuid"))
    .rejects.toMatchObject({ status: 404, code: "PATIENT_NOT_FOUND" });
  expect(mockPoolQuery).not.toHaveBeenCalled();

  mockPoolQuery.mockResolvedValueOnce({ rows: [] });
  await expect(patientService.getPatientDetails(userId, patientId))
    .rejects.toMatchObject({ status: 404, code: "PATIENT_NOT_FOUND" });
  expect(mockPoolQuery).toHaveBeenCalledTimes(1);
});
