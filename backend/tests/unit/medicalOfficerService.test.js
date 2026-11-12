const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

jest.mock("../../db", () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: (...args) => mockPoolConnect(...args),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));

const { audit } = require("../../utils/audit");
const medicalOfficerService = require("../../services/medicalOfficerService");

const userId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const req = { user: { id: userId, role_name: "MEDICAL_OFFICER" } };

function mockClaimScenario({ eligible = true, alreadyClaimed = false } = {}) {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("latest_screening.case_state")) {
      return { rows: eligible ? [{ id: patientId }] : [] };
    }
    if (sql.includes("INSERT INTO tbl_medical_officer_case_claims")) {
      if (alreadyClaimed) {
        const error = new Error("duplicate active claim");
        error.code = "23505";
        error.constraint = "uq_mo_claim_one_active_per_patient";
        throw error;
      }
      return { rows: [{ id: "claim-1", patient_id: patientId, medical_officer_id: userId }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: jest.fn(),
  });
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("FROM tbl_patients p")) return { rows: [{ id: patientId }] };
    if (sql.includes("INSERT INTO tbl_medical_officer_case_claims")) {
      return { rows: [{ id: "claim-1", patient_id: patientId, medical_officer_id: userId }] };
    }
    return { rows: [] };
  });
});

test("Medical Officer queue views are limited to available or owned cases", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "1" }] })
    .mockResolvedValueOnce({ rows: [{ id: patientId, sex: "F", age_years: 12 }] });

  const result = await medicalOfficerService.listCases(userId, "available");
  const listQuery = mockPoolQuery.mock.calls[1];
  expect(listQuery[0]).toContain("tbl_medical_officer_mandal_assignments");
  expect(listQuery[0]).toContain("ORDER BY (screening.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, screening.created_at DESC");
  expect(listQuery[0]).toContain("c.id IS NULL");
  expect(listQuery[0]).toContain("(s.signed_at IS NULL OR s.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO'))");
  expect(listQuery[0]).not.toMatch(/p\.full_name|p\.date_of_birth/i);
  expect(listQuery[0]).toMatch(/CASE WHEN \$2='mine' AND consent\.granted IS TRUE THEN p\.sex END AS sex/i);
  expect(listQuery[0]).toMatch(/CASE WHEN \$2='mine' AND consent\.granted IS TRUE THEN p\.age_years END AS age_years/i);
  expect(listQuery[1]).toEqual([userId, "available", 20, 0]);
  expect(result.cases[0]).not.toHaveProperty("sex");
  expect(result.cases[0]).not.toHaveProperty("age_years");
  expect(result.pagination).toEqual({ total: 1, page: 1, page_size: 20, total_pages: 1 });

  await expect(medicalOfficerService.listCases(userId, "all"))
    .rejects.toMatchObject({ status: 400, code: "INVALID_QUEUE_VIEW" });
});

test("available queue and claim eligibility share the signed recapture exception", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "1" }] })
    .mockResolvedValueOnce({ rows: [{ id: patientId }] });

  await medicalOfficerService.listCases(userId, "available");
  mockClaimScenario();
  await medicalOfficerService.claimCase(userId, req, patientId);

  const queueQueries = mockPoolQuery.mock.calls.map(([sql]) => sql);
  const eligibilityQuery = mockClientQuery.mock.calls.find(([sql]) => sql.includes("latest_screening.case_state"))[0];
  for (const sql of queueQueries) {
    expect(sql).toContain("(s.signed_at IS NULL OR s.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO'))");
    expect(sql).toContain("c.id IS NULL");
    expect(sql).toContain("a.valid_from <= CURRENT_DATE");
    expect(sql).toContain("(a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)");
  }
  expect(eligibilityQuery).toContain("(latest_screening.signed_at IS NULL");
  expect(eligibilityQuery).toContain("OR latest_screening.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO'))");
  expect(eligibilityQuery).toContain("latest_consent.granted IS TRUE");
  expect(eligibilityQuery).toContain("a.mandal_id=COALESCE(p.mandal_id,v.mandal_id)");
});

test("a signed REQUEST_MORE_INFO resubmission is claimable within the assigned Mandal", async () => {
  mockClaimScenario();
  await medicalOfficerService.claimCase(userId, req, patientId);

  const eligibilityQuery = mockClientQuery.mock.calls.find(([sql]) => sql.includes("latest_screening.case_state"))[0];
  expect(eligibilityQuery).toContain("latest_screening.case_state='AWAITING_CLINICIAN'");
  expect(eligibilityQuery).toContain("latest_screening.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO')");
  expect(eligibilityQuery).toContain("latest_consent.granted IS TRUE");
  expect(eligibilityQuery).toContain("tbl_medical_officer_mandal_assignments");
});

test("queue pagination uses a bounded page size and returns the total page count", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "45" }] })
    .mockResolvedValueOnce({ rows: [{ id: patientId }] });

  const result = await medicalOfficerService.listCases(userId, "mine", { page: "3", limit: "10" });

  expect(mockPoolQuery.mock.calls[0][0]).toContain("COUNT(*) AS total");
  expect(mockPoolQuery.mock.calls[1][1]).toEqual([userId, "mine", 10, 20]);
  expect(result.pagination).toEqual({ total: 45, page: 3, page_size: 10, total_pages: 5 });
});

test("queue pagination clamps an out-of-range page to the last available page", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "25" }] })
    .mockResolvedValueOnce({ rows: [{ id: patientId }] });

  const result = await medicalOfficerService.listCases(userId, "available", { page: "99", limit: "10" });

  expect(mockPoolQuery.mock.calls[1][1]).toEqual([userId, "available", 10, 20]);
  expect(result.pagination).toEqual({ total: 25, page: 3, page_size: 10, total_pages: 3 });
});

test("empty queue results return page one and no total pages", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "0" }] })
    .mockResolvedValueOnce({ rows: [] });

  const result = await medicalOfficerService.listCases(userId, "mine", { page: "9" });

  expect(mockPoolQuery.mock.calls[1][1]).toEqual([userId, "mine", 20, 0]);
  expect(result).toEqual({
    cases: [],
    pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 },
  });
});

test.each([
  [{ page: "0" }, "Page"],
  [{ page: "1.5" }, "Page"],
  [{ limit: "0" }, "Limit"],
  [{ limit: "101" }, "Limit"],
])("invalid queue pagination is rejected for %j", async (query) => {
  await expect(medicalOfficerService.listCases(userId, "available", query))
    .rejects.toMatchObject({ status: 400, code: "INVALID_PAGINATION" });
  expect(mockPoolQuery).not.toHaveBeenCalled();
});

test("claim eligibility selects the same active-first screening as the Health Worker list", async () => {
  mockClaimScenario();
  await medicalOfficerService.claimCase(userId, req, patientId);
  const eligible = mockClientQuery.mock.calls.find(([sql]) => sql.includes("latest_screening.case_state"));

  expect(eligible[0]).toContain("ORDER BY (screening.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, screening.created_at DESC");
});

test.each([
  ["without a previous review", true],
  ["with a signed REQUEST_RECAPTURE review", true],
  ["with a signed APPROVE review", false],
  ["with a signed REFER_TO_SPECIALIST review", false],
])("claim eligibility for an awaiting screening is decided correctly %s", async (_label, eligible) => {
  mockClaimScenario({ eligible });

  if (eligible) {
  await expect(medicalOfficerService.claimCase(userId, req, patientId)).resolves.toMatchObject({
    patient_id: patientId,
    medical_officer_id: userId,
  });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_medical_officer_case_claims"))).toBe(true);
  } else {
  await expect(medicalOfficerService.claimCase(userId, req, patientId))
    .rejects.toMatchObject({ status: 404, code: "CASE_NOT_AVAILABLE" });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_medical_officer_case_claims"))).toBe(false);
  }

  const eligibilityQuery = mockClientQuery.mock.calls.find(([sql]) => sql.includes("latest_screening.case_state"))[0];
  expect(eligibilityQuery).toContain("latest_screening.case_state='AWAITING_CLINICIAN'");
  expect(eligibilityQuery).toContain("OR latest_screening.review_decision IN ('REQUEST_RECAPTURE','REQUEST_MORE_INFO'))");
});

test.each([
  ["wrong Mandal", { eligible: false }],
  ["inactive Mandal assignment", { eligible: false }],
  ["missing or revoked screening consent", { eligible: false }],
])("claim is rejected with %s", async (_label, scenario) => {
  mockClaimScenario(scenario);

  await expect(medicalOfficerService.claimCase(userId, req, patientId))
  .rejects.toMatchObject({ status: 404, code: "CASE_NOT_AVAILABLE" });
  expect(mockClientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_medical_officer_case_claims"))).toBe(false);

  const eligibilityQuery = mockClientQuery.mock.calls.find(([sql]) => sql.includes("latest_screening.case_state"))[0];
  expect(eligibilityQuery).toContain("a.user_id=$2");
  expect(eligibilityQuery).toContain("a.mandal_id=COALESCE(p.mandal_id,v.mandal_id)");
  expect(eligibilityQuery).toContain("a.valid_from <= CURRENT_DATE");
  expect(eligibilityQuery).toContain("(a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)");
  expect(eligibilityQuery).toContain("latest_consent.granted IS TRUE");
});

test("claimed cases do not expose sex or age when screening consent is absent or denied", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "1" }] })
    .mockResolvedValueOnce({ rows: [{ id: patientId, sex: null, age_years: null }] });

  const result = await medicalOfficerService.listCases(userId, "mine");
  const sql = mockPoolQuery.mock.calls[1][0];

  expect(result.cases[0]).toMatchObject({ sex: null, age_years: null });
  expect(sql).toMatch(/CASE WHEN \$2='mine' AND consent\.granted IS TRUE THEN p\.sex END AS sex/i);
  expect(sql).toMatch(/CASE WHEN \$2='mine' AND consent\.granted IS TRUE THEN p\.age_years END AS age_years/i);
  expect(sql).toContain("purpose.code='SCREENING'");
  expect(sql).toContain("ORDER BY pc.consent_seq DESC");
});

test("claimed-case complaints are exposed only with current screening consent", async () => {
  mockPoolQuery.mockResolvedValue({ rows: [] });

  await medicalOfficerService.listCases(userId, "mine");

  const query = mockPoolQuery.mock.calls[1][0];
  expect(query).toContain("CASE WHEN $2='mine' AND consent.granted IS TRUE");
  expect(query).toContain("FROM tbl_patient_consents pc");
  expect(query).toContain("purpose.code='SCREENING'");
  expect(query).toContain("ORDER BY pc.consent_seq DESC");
});

test("referral purpose excludes patients with an open specialist referral", async () => {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ total: "0" }] })
    .mockResolvedValueOnce({ rows: [] });

  await medicalOfficerService.listCases(userId, "mine", { purpose: "referral" });

  const query = mockPoolQuery.mock.calls[1][0];
  expect(query).toContain("SPECIALIST_REVIEW");
  expect(query).toContain("URGENT_REFERRAL");
  expect(query).toContain("open_ref.status IN ('PLANNED', 'SENT', 'ACCEPTED')");
  expect(query).toContain("s.case_state = 'REVIEWED'");
});

test("claim insertion uses the database's unique active-claim guard", async () => {
  const claim = await medicalOfficerService.claimCase(userId, req, patientId);

  expect(mockClientQuery.mock.calls.some(([sql]) =>
    sql.includes("INSERT INTO tbl_medical_officer_case_claims")
  )).toBe(true);
  expect(claim.id).toBe("claim-1");
  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    client: expect.anything(),
    required: true,
    event: "MEDICAL_OFFICER_CASE_CLAIMED",
    patientId,
  }));
});

test("claim is rolled back when its critical audit write fails", async () => {
  audit.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(medicalOfficerService.claimCase(userId, req, patientId))
    .rejects.toThrow("audit unavailable");

  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(mockClientQuery).not.toHaveBeenCalledWith("COMMIT");
});

test("an active claim owned by another MO returns a conflict instead of success", async () => {
  mockClaimScenario({ alreadyClaimed: true });

  await expect(medicalOfficerService.claimCase(userId, req, patientId))
    .rejects.toMatchObject({ status: 409, code: "CASE_ALREADY_CLAIMED" });
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(audit).not.toHaveBeenCalled();
});

test("a Medical Officer cannot release another user's claim", async () => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("UPDATE tbl_medical_officer_case_claims")) return { rows: [] };
    return { rows: [] };
  });
  await expect(medicalOfficerService.releaseCase(userId, req, patientId))
    .rejects.toMatchObject({ status: 409, code: "CLAIM_NOT_OWNED" });
  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
});

test("release is rolled back when its critical audit write fails", async () => {
  mockClientQuery.mockImplementation(async (sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("UPDATE tbl_medical_officer_case_claims")) {
      return { rows: [{ id: "claim-1", patient_id: patientId, released_at: new Date() }] };
    }
    return { rows: [] };
  });
  audit.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(medicalOfficerService.releaseCase(userId, req, patientId))
    .rejects.toThrow("audit unavailable");

  expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(mockClientQuery).not.toHaveBeenCalledWith("COMMIT");
});
