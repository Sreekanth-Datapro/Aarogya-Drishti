// Medical Officer modules: role/permission checks, Mandal scope, claim and
// consent rules, signed-record protection and rollback when the audit fails.
// The database is a programmable fake: each test decides what a query returns.

let mockHandler;
const mockQueries = [];
let mockImageMissing = false;

function mockRun(sql, params) {
  mockQueries.push({ sql, params });
  return mockHandler(sql, params || []);
}

jest.mock("../../db", () => {
  const client = {
    query: jest.fn(async (sql, params) => mockRun(sql, params)),
    release: jest.fn(),
  };
  return {
    query: jest.fn(async (sql, params) => mockRun(sql, params)),
    connect: jest.fn(async () => client),
    mockClient: client,
  };
});
jest.mock("../../utils/jwt", () => ({ verifyAccessToken: jest.fn(() => ({ sub: "mo-1", sid: "session-1" })) }));
let mockPermissions = [];
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => mockPermissions),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../services/privateImageStorage", () => ({
  localFilePath: (key) => {
    if (key.split("/").includes("..")) throw new Error("Image file is not available");
    return `C:\\private\\${key.replace(/\//g, "\\")}`;
  },
  objectExists: jest.fn(async () => false),
  getFile: jest.fn(async (key) => {
    if (mockImageMissing) throw Object.assign(new Error("Image file is not available"), { code: "IMAGE_FILE_MISSING" });
    return { filePath: `C:\\private\\${key.replace(/\//g, "\\")}` };
  }),
}));

const express = require("express");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const routes = require("../../routes/medicalOfficer");
const medicalOfficerService = require("../../services/medicalOfficerService");
const dashboardService = require("../../services/medicalOfficer/dashboardService");
const errorMiddleware = require("../../middleware/errorMiddleware");
const reviewService = require("../../services/medicalOfficer/reviewService");
const imageService = require("../../services/medicalOfficer/imageService");
const referralService = require("../../services/medicalOfficer/referralService");
const followupService = require("../../services/medicalOfficer/followupService");
const reportService = require("../../services/medicalOfficer/reportService");
const profileService = require("../../services/medicalOfficer/profileService");
const patientListService = require("../../services/medicalOfficer/patientListService");

const PATIENT = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const NAVIGATOR = "33333333-3333-4333-8333-333333333333";
const REFERRAL = "44444444-4444-4444-8444-444444444444";
const PHOTO = "55555555-5555-4555-8555-555555555555";
const SCREENING = "66666666-6666-4666-8666-666666666666";
const ORIGINAL_IMAGE_BYTES = Buffer.from("synthetic-original-photo-bytes");
const req = { user: { id: "mo-1", role_name: "MEDICAL_OFFICER" }, ip: "127.0.0.1" };

let sessionRole = "MEDICAL_OFFICER";
let streamedFilePath = "";
function sessionRow() {
  return {
    id: "mo-1", username: "mo.one", full_name: "MO One", role_id: 4, role_name: sessionRole,
    status: "ACTIVE", must_change_password: false, mfa_enabled: true, mfa_required: true,
    session_id: "session-1", mfa_verified: true,
  };
}

// Default answers shared by many tests
function baseHandler(overrides = {}) {
  return (sql, params) => {
    for (const [pattern, answer] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return typeof answer === "function" ? answer(sql, params) : answer;
    }
    if (sql.includes("JOIN tbl_user_sessions")) return { rows: [sessionRow()] };
    if (sql.includes("FROM tbl_medical_officer_case_claims c")) {
      return { rows: [{ id: PATIENT, patient_code: "AD-2026-000001", registered_facility_id: 7, mandal_id: 2, district_id: 1, claim_id: "c-1" }] };
    }
    if (sql.includes("FROM tbl_patient_consents pc") && sql.includes("LIMIT 1")) return { rows: [{ granted: true }] };
    if (sql.includes("COUNT(*) AS total")) return { rows: [{ total: "0" }] };
    return { rows: [] };
  };
}

const app = express();
app.use(express.json());
app.use((request, response, next) => {
  response.sendFile = (filePath) => {
    streamedFilePath = filePath;
    response.end(ORIGINAL_IMAGE_BYTES);
    return response;
  };
  next();
});
app.use("/api/medical-officer", routes);
app.use(errorMiddleware);
const call = (method, path) => request(app)[method](path).set("Authorization", "Bearer token");

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockImageMissing = false;
  streamedFilePath = "";
  sessionRole = "MEDICAL_OFFICER";
  mockPermissions = ["patient.read_assigned", "review.create", "review.sign", "image.view", "referral.create", "referral.view", "case.assign"];
  mockHandler = baseHandler();
});

describe("routes", () => {
  test("other roles cannot use the Medical Officer API", async () => {
    sessionRole = "DISTRICT_ADMIN";
    const response = await call("get", "/api/medical-officer/dashboard");
    expect(response.status).toBe(403);

    mockQueries.length = 0;
    const caseResponse = await call("get", `/api/medical-officer/patients/${PATIENT}/case`);
    expect(caseResponse.status).toBe(403);
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_ai_assessments"))).toBe(false);

    mockQueries.length = 0;
    const signResponse = await call("post", `/api/medical-officer/patients/${PATIENT}/review/sign`).send({ version: 1 });
    expect(signResponse.status).toBe(403);
    expect(mockQueries.some((query) => query.sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });

  test("signing needs the existing review.sign permission", async () => {
    mockPermissions = ["review.create"];
    const response = await call("post", `/api/medical-officer/patients/${PATIENT}/review/sign`).send({ version: 1 });
    expect(response.status).toBe(403);
  });

  test("opening screening images needs the existing image.view permission", async () => {
    mockPermissions = ["patient.read_assigned"];
    const response = await call("get", `/api/medical-officer/patients/${PATIENT}/images`);
    expect(response.status).toBe(403);
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_screening_photos"))).toBe(false);
  });

  test("enhanced image retrieval uses the existing image.view permission and MO role", async () => {
    mockPermissions = ["patient.read_assigned"];
    const permissionResponse = await call(
      "get", `/api/medical-officer/patients/${PATIENT}/images/${PHOTO}/enhanced-file`
    );
    expect(permissionResponse.status).toBe(403);

    sessionRole = "HEALTH_WORKER";
    mockPermissions = ["image.view"];
    const roleResponse = await call(
      "get", `/api/medical-officer/patients/${PATIENT}/images/${PHOTO}/enhanced-file`
    );
    expect(roleResponse.status).toBe(403);
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_screening_photos"))).toBe(false);
  });

  test("the clinical profile is refused without an active claim", async () => {
    mockHandler = baseHandler({ "FROM tbl_medical_officer_case_claims c": { rows: [] } });
    const response = await call("get", `/api/medical-officer/patients/${PATIENT}/case`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CLAIM_REQUIRED");
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_ai_assessments"))).toBe(false);
  });

  test("the claim check uses the signed-in user and the Mandal assignment", async () => {
    mockHandler = baseHandler({ "FROM tbl_medical_officer_case_claims c": { rows: [] } });
    await call("get", `/api/medical-officer/patients/${PATIENT}/case?user_id=someone-else`);
    const claimQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_medical_officer_case_claims c"));
    expect(claimQuery.params).toEqual(["mo-1", PATIENT]);
    expect(claimQuery.sql).toContain("tbl_medical_officer_mandal_assignments");
  });

  test("a Medical Officer with an active claim can retrieve synthetic AI results", async () => {
    const aiResults = [
      { id: "ai-front", photo_id: "photo-front", analysis_details: { view: "FRONT_VIEW" } },
      { id: "ai-left", photo_id: "photo-left", analysis_details: { view: "LEFT_VIEW" } },
      { id: "ai-right", photo_id: "photo-right", analysis_details: { view: "RIGHT_VIEW" } },
    ];
    mockHandler = baseHandler({
      "FROM tbl_patient_consents pc": { rows: [{ granted: true }] },
      "FROM tbl_screenings": {
        rows: [{ id: "screening-synthetic", case_state: "AWAITING_CLINICIAN", screening_date: "2026-11-08" }],
      },
      "FROM tbl_ai_assessments": { rows: aiResults },
    });

    const response = await call("get", `/api/medical-officer/patients/${PATIENT}/case`);

    expect(response.status).toBe(200);
    expect(response.body.case.ai_results).toEqual(aiResults);
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_medical_officer_case_claims c"))).toBe(true);
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_ai_assessments"))).toBe(true);
  });
});

describe("My Mandal Patients", () => {
  test("names are only selected for patients claimed by me and no Mandal comes from the request", async () => {
    await patientListService.listMandalPatients("mo-1", { mandal_id: 99, district_id: 5, claim: "none" });
    const listQuery = mockQueries.find((query) => query.sql.includes("claim_status"));
    expect(listQuery.sql).toContain("CASE WHEN latest_screening_consent.granted IS TRUE");
    expect(listQuery.sql).toContain("ORDER BY (s.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, s.created_at DESC");
    expect(listQuery.sql).toContain("AND claim.medical_officer_id = $1 THEN p.full_name END");
    expect(listQuery.params).not.toContain(99);
    expect(listQuery.params).not.toContain(5);
    expect(listQuery.sql).not.toMatch(/contact_phone|address_line/);
  });

  test("personal and case details, including status-filter results, require the latest SCREENING consent", async () => {
    await patientListService.listMandalPatients("mo-1", { status: "AWAITING_CLINICIAN" });
    const listQuery = mockQueries.find((query) => query.sql.includes("claim_status"));

    expect(listQuery.sql).toContain("purpose.code = 'SCREENING'");
    expect(listQuery.sql).toContain("ORDER BY pc.consent_seq DESC");
    expect(listQuery.sql).toContain("latest_screening_consent.granted IS TRUE AS screening_consent_active");
    expect(listQuery.sql).toContain("CASE WHEN latest_screening_consent.granted IS TRUE THEN p.sex::text END");
    expect(listQuery.sql).toContain("CASE WHEN latest_screening_consent.granted IS TRUE");
    expect(listQuery.sql).toContain("latest_screening_consent.granted IS TRUE AND latest.case_state::text = $2");
    expect(listQuery.params).toContain("AWAITING_CLINICIAN");
    expect(listQuery.sql).toContain("EXISTS (");
    expect(listQuery.sql).toContain("tbl_medical_officer_mandal_assignments");
  });
});

describe("Clinical Review consent", () => {
  test("case context masks patient details and skips clinical history when SCREENING consent is withdrawn", async () => {
    mockHandler = baseHandler({
      "FROM tbl_patient_consents pc": { rows: [{ granted: false }] },
      "FROM tbl_patients p": {
        rows: [{
          id: PATIENT, patient_code: "AD-2026-000001", full_name: "Private Patient",
          sex: "FEMALE", age_years: 45, registered_at: new Date(),
          village_name: "Addulu", village_name_te: "అద్దులు",
          mandal_name: "Mandal", mandal_name_te: "మండలం",
          facility_name: "PHC", facility_name_te: "పీహెచ్‌సీ",
        }],
      },
      "FROM tbl_screenings": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
    });

    const context = await reviewService.getCaseContext("mo-1", req, PATIENT);
    const patientQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_patients p"));
    const latestScreeningQuery = mockQueries.find((query) => query.sql.includes("SELECT screening.id, screening.screening_date"));

    expect(latestScreeningQuery.sql).toContain("ORDER BY (screening.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, screening.created_at DESC");
    expect(patientQuery.params).toEqual([PATIENT, false]);
    expect(patientQuery.sql).toContain("CASE WHEN $2 IS TRUE THEN p.full_name END");
    expect(context.patient).toMatchObject({
      id: PATIENT,
      patient_code: "AD-2026-000001",
      full_name: null,
      sex: null,
      age_years: null,
      village_name: null,
      mandal_name: null,
      facility_name: null,
    });
    expect(context.screening).toBeNull();
    expect(context.findings).toEqual([]);
    expect(context.histories).toEqual([]);
    expect(context.ai_results).toEqual([]);
    expect(context.timeline).toEqual([]);
    expect(mockQueries.some((query) => query.sql.includes("vw_patient_timeline"))).toBe(false);
    expect(mockQueries.some((query) => query.sql.includes("tbl_screening_findings"))).toBe(false);
  });

  test("claimed-case queue gates status, demographics and claim eligibility on latest SCREENING consent", async () => {
    await medicalOfficerService.listCases("mo-1", "mine");
    const queueQuery = mockQueries.find((query) => query.sql.includes("CASE WHEN $2='mine' AND consent.granted IS TRUE THEN p.sex"));

    expect(queueQuery.sql).toContain("purpose.code='SCREENING'");
    expect(queueQuery.sql).toContain("ORDER BY pc.consent_seq DESC");
    expect(queueQuery.sql).toContain("CASE WHEN $2='mine' AND consent.granted IS TRUE THEN p.sex");
    expect(queueQuery.sql).toContain("CASE WHEN consent.granted IS TRUE THEN s.case_state END");
    expect(queueQuery.sql).toContain("tbl_medical_officer_mandal_assignments");
    expect(queueQuery.sql).toContain("ORDER BY (screening.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, screening.created_at DESC");
  });

  test("Medical Officer dashboard selects the same active-first screening as the Health Worker", async () => {
    await dashboardService.getDashboard("mo-1");

    const patientSummaryQuery = mockQueries.find((query) => query.sql.includes("COUNT(*) AS total_patients"));
    const mandalSummaryQuery = mockQueries.find((query) => query.sql.includes("COUNT(p.id) AS patients"));
    const expectedOrder = "ORDER BY (s.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, s.created_at DESC";

    expect(patientSummaryQuery.sql).toContain(expectedOrder);
    expect(mandalSummaryQuery.sql).toContain(expectedOrder);
  });

  test("claim eligibility requires the latest screening consent", async () => {
    mockHandler = baseHandler({
      "latest_consent.granted IS TRUE": { rows: [{ id: PATIENT }] },
      "INSERT INTO tbl_medical_officer_case_claims": { rows: [{ id: "claim-1", patient_id: PATIENT, medical_officer_id: "mo-1" }] },
    });
    await medicalOfficerService.claimCase("mo-1", req, PATIENT);
    const eligibilityQuery = mockQueries.find((query) => query.sql.includes("latest_consent.granted IS TRUE"));

    expect(eligibilityQuery).toBeDefined();
    expect(eligibilityQuery.params).toEqual([PATIENT, "mo-1"]);
  });
});

describe("clinical review", () => {
  test("a finding is required", () => {
    expect(() => reviewService.normalizeReview({ finding: "  " })).toThrow("Clinical finding is required");
  });

  test("signing checks the decision rules", () => {
    expect(() => reviewService.assertSignable({ decision: null })).toThrow("Choose a clinical decision");
    expect(() => reviewService.assertSignable({ decision: "SPECIALIST_REVIEW" })).toThrow("referral reason");
    expect(() => reviewService.assertSignable({ decision: "REQUEST_MORE_INFO" })).toThrow("Health Worker");
    expect(() => reviewService.assertSignable({ decision: "NO_ACTION", ai_agreement: "DISAGREE" })).toThrow("disagree");
  });

  test("a signed review cannot be overwritten by saving a draft", async () => {
    mockHandler = baseHandler({
      "FROM tbl_screenings": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "FROM tbl_clinical_reviews": { rows: [{ id: REVIEW, doctor_id: "mo-1", version: 2, signed_at: new Date() }] },
    });
    await expect(reviewService.saveDraft("mo-1", req, PATIENT, { finding: "White patch", version: 2 }))
      .rejects.toMatchObject({ status: 409, code: "REVIEW_SIGNED" });
    expect(mockQueries.map((query) => query.sql)).toContain("ROLLBACK");
  });

  test("a draft cannot be saved without SCREENING consent", async () => {
    mockHandler = baseHandler({ "FROM tbl_patient_consents pc": { rows: [{ granted: false }] } });
    await expect(reviewService.saveDraft("mo-1", req, PATIENT, { finding: "White patch" }))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
  });

  test.each([
    ["completed", { ai_assessment_id: PHOTO, ai_agreement: "AGREE" }],
    ["not performed", { ai_assessment_id: null, ai_agreement: "NOT_AVAILABLE" }],
    ["failed", { ai_assessment_id: PHOTO, ai_agreement: "NOT_AVAILABLE" }],
    ["unavailable", { ai_assessment_id: PHOTO, ai_agreement: "NOT_AVAILABLE" }],
  ])("sign-off succeeds when AI review is %s", async (_label, aiFields) => {
    mockHandler = baseHandler({
      "FROM tbl_screenings": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "FROM tbl_clinical_reviews": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        version: 3, signed_at: null, finding: "Independent clinical finding",
        decision: "NO_ACTION", ...aiFields,
      }] },
      "UPDATE tbl_clinical_reviews": { rows: [{ id: REVIEW, version: 4, signed_at: new Date() }] },
    });

    const signed = await reviewService.signReview("mo-1", req, PATIENT, { version: 3 });

    expect(signed).toMatchObject({ id: REVIEW, version: 4, case_state: "REVIEWED" });
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_ai_assessments"))).toBe(false);
  });

  test("sign-off remains blocked without SCREENING consent", async () => {
    mockHandler = baseHandler({
      "FROM tbl_patient_consents pc": { rows: [{ granted: false }] },
    });

    await expect(reviewService.signReview("mo-1", req, PATIENT, { version: 3 }))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some((query) => query.sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });

  test("signing moves the case to REVIEWED and is rolled back if the audit fails", async () => {
    mockHandler = baseHandler({
      "FROM tbl_screenings": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "FROM tbl_clinical_reviews": { rows: [{ id: REVIEW, doctor_id: "mo-1", version: 3, signed_at: null, finding: "Patch", decision: "NO_ACTION", ai_agreement: "NOT_AVAILABLE" }] },
      "UPDATE tbl_clinical_reviews": { rows: [{ id: REVIEW, version: 4, signed_at: new Date() }] },
      "INSERT INTO tbl_audit_logs": () => { throw new Error("audit table unavailable"); },
    });
    await expect(reviewService.signReview("mo-1", req, PATIENT, { version: 3 })).rejects.toThrow("audit table unavailable");
    const sqls = mockQueries.map((query) => query.sql);
    expect(sqls.some((sql) => sql.includes("UPDATE tbl_screenings SET case_state"))).toBe(true);
    expect(mockQueries.find((query) => query.sql.includes("UPDATE tbl_screenings")).params[0]).toBe("REVIEWED");
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });

  test("an out-of-date version is refused", async () => {
    mockHandler = baseHandler({
      "FROM tbl_screenings": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "FROM tbl_clinical_reviews": { rows: [{ id: REVIEW, doctor_id: "mo-1", version: 5, signed_at: null, decision: "NO_ACTION" }] },
    });
    await expect(reviewService.signReview("mo-1", req, PATIENT, { version: 4 }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("amending needs a reason", async () => {
    await expect(reviewService.amendReview("mo-1", req, REVIEW, { finding: "x" }))
      .rejects.toMatchObject({ code: "AMENDMENT_REASON_REQUIRED" });
  });

  test("a returned recapture can be explicitly re-reviewed as a signed new version", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW,
        screening_id: "s-1",
        patient_id: PATIENT,
        doctor_id: "mo-1",
        finding: "Original finding",
        impression: null,
        decision: "REQUEST_RECAPTURE",
        followup_instructions: null,
        referral_reason: null,
        request_note: "Retake the left photo",
        version: 3,
        amendment_reason: null,
        signed_at: "2026-11-05T10:00:00Z",
        case_state: "AWAITING_CLINICIAN",
      }] },
      "FROM tbl_screenings screening": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "UPDATE tbl_clinical_reviews": { rows: [{ id: REVIEW, version: 4, signed_at: "2026-11-08T10:00:00Z" }] },
      "UPDATE tbl_screenings SET case_state": { rows: [{ id: "s-1" }], rowCount: 1 },
    });

    const result = await reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed the newly submitted photo",
      finding: "The new photo shows no concerning lesion",
      decision: "NO_ACTION",
    });

    expect(result).toMatchObject({ id: REVIEW, version: 4, case_state: "REVIEWED" });
    const reviewUpdate = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"));
    expect(reviewUpdate.sql).toContain("decision=$3");
    expect(reviewUpdate.params[2]).toBe("NO_ACTION");
    expect(reviewUpdate.params[7]).toBe("Reviewed the newly submitted photo");
    const caseUpdate = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_screenings SET case_state"));
    expect(caseUpdate.params).toEqual(["REVIEWED", "s-1"]);
    expect(mockQueries.some(({ sql }) => /(?:UPDATE|DELETE).*tbl_clinical_review_versions/.test(sql))).toBe(false);
    expect(mockQueries.map(({ sql }) => sql)).toContain("COMMIT");
  });

  test("a returned REQUEST_MORE_INFO case can be amended as a new signed version", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW,
        screening_id: "s-1",
        patient_id: PATIENT,
        doctor_id: "mo-1",
        finding: "Original finding",
        impression: null,
        decision: "REQUEST_MORE_INFO",
        followup_instructions: null,
        referral_reason: null,
        request_note: "Add the symptom duration",
        ai_assessment_id: null,
        ai_agreement: "NOT_AVAILABLE",
        version: 3,
        amendment_reason: null,
        signed_at: "2026-11-05T10:00:00Z",
        case_state: "AWAITING_CLINICIAN",
      }] },
      "FROM tbl_screenings screening": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "UPDATE tbl_clinical_reviews": { rows: [{ id: REVIEW, version: 4, signed_at: "2026-11-08T10:00:00Z" }] },
      "UPDATE tbl_screenings SET case_state": { rows: [{ id: "s-1" }], rowCount: 1 },
    });

    const result = await reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed added symptom duration",
      finding: "Updated clinical finding",
      decision: "NO_ACTION",
      ai_agreement: "NOT_AVAILABLE",
      ai_assessment_id: null,
    });

    expect(result).toMatchObject({ id: REVIEW, version: 4, case_state: "REVIEWED" });
    const reviewUpdate = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"));
    expect(reviewUpdate.params[2]).toBe("NO_ACTION");
    expect(reviewUpdate.params[7]).toBe("Reviewed added symptom duration");
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_clinical_reviews"))).toBe(false);
    expect(mockQueries.some(({ sql, params }) => sql.includes("INSERT INTO tbl_audit_logs") && params.includes("CLINICAL_REVIEW_AMENDED"))).toBe(true);
    expect(mockQueries.map(({ sql }) => sql)).toContain("COMMIT");
  });

  test("re-review requires the screening still be awaiting review and a new clinical decision", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        decision: "REQUEST_RECAPTURE", case_state: "AWAITING_CLINICIAN",
        version: 3, signed_at: "2026-11-05T10:00:00Z", amendment_reason: null,
      }] },
      "FROM tbl_screenings screening": { rows: [{ id: "s-1", case_state: "SCREENED" }] },
    });

    await expect(reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed the newly submitted information",
      finding: "A finding",
      decision: "NO_ACTION",
    })).rejects.toMatchObject({ code: "NOT_AWAITING_REVIEW" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });

  test("re-review requires a current MO case claim", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        decision: "REQUEST_RECAPTURE", case_state: "AWAITING_CLINICIAN",
        version: 3, signed_at: "2026-11-05T10:00:00Z", amendment_reason: null,
      }] },
      "FROM tbl_medical_officer_case_claims c": { rows: [] },
    });

    await expect(reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed the newly submitted information",
      finding: "A finding",
      decision: "NO_ACTION",
    })).rejects.toMatchObject({ status: 403, code: "CLAIM_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });

  test("an explicit new recapture decision returns the case to the Health Worker", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        finding: "Original finding", decision: "REQUEST_RECAPTURE",
        version: 3, signed_at: "2026-11-05T10:00:00Z", amendment_reason: null,
        case_state: "AWAITING_CLINICIAN",
      }] },
      "FROM tbl_screenings screening": { rows: [{ id: "s-1", case_state: "AWAITING_CLINICIAN" }] },
      "UPDATE tbl_clinical_reviews": { rows: [{ id: REVIEW, version: 4, signed_at: "2026-11-08T10:00:00Z" }] },
      "UPDATE tbl_screenings SET case_state": { rows: [{ id: "s-1" }], rowCount: 1 },
    });

    const result = await reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed the newly submitted photo",
      finding: "Image quality is still insufficient",
      decision: "REQUEST_RECAPTURE",
      request_note: "Please capture a clear left-side image.",
    });

    expect(result.case_state).toBe("SCREENED");
    const caseUpdate = mockQueries.find(({ sql }) => sql.includes("UPDATE tbl_screenings SET case_state"));
    expect(caseUpdate.params).toEqual(["SCREENED", "s-1"]);
  });

  test("a signed decision cannot change outside a returned recapture re-review", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        decision: "NO_ACTION", case_state: "REVIEWED",
        version: 3, signed_at: "2026-11-05T10:00:00Z", amendment_reason: null,
      }] },
    });

    await expect(reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Attempted decision change",
      finding: "A finding",
      decision: "URGENT_REFERRAL",
    })).rejects.toMatchObject({ code: "INVALID_REVIEW" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });

  test("a returned recapture cannot be re-reviewed without active screening consent", async () => {
    mockHandler = baseHandler({
      "FROM tbl_clinical_reviews cr": { rows: [{
        id: REVIEW, screening_id: "s-1", patient_id: PATIENT, doctor_id: "mo-1",
        decision: "REQUEST_RECAPTURE", case_state: "AWAITING_CLINICIAN",
        version: 3, signed_at: "2026-11-05T10:00:00Z", amendment_reason: null,
      }] },
      "FROM tbl_patient_consents pc": { rows: [{ granted: false }] },
    });

    await expect(reviewService.amendReview("mo-1", req, REVIEW, {
      version: 3,
      amendment_reason: "Reviewed the newly submitted information",
      finding: "A finding",
      decision: "NO_ACTION",
    })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
  });
});

describe("oral images", () => {
  test("images need IMAGE_CAPTURE consent", async () => {
    mockHandler = baseHandler({ "FROM tbl_patient_consents pc": { rows: [{ granted: false }] } });
    await expect(imageService.listImages("mo-1", req, PATIENT)).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    const consentQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_patient_consents pc"));
    expect(consentQuery.sql).toContain("ORDER BY pc.consent_seq DESC");
    expect(mockQueries.some((query) => query.sql.includes("FROM tbl_screening_photos"))).toBe(false);
  });

  test("private image bytes are not resolved without current IMAGE_CAPTURE consent", async () => {
    mockHandler = baseHandler({ "FROM tbl_patient_consents pc": { rows: [{ granted: false }] } });
    const storage = require("../../services/privateImageStorage");
    const getFile = storage.getFile;
    await expect(imageService.getImageFile("mo-1", req, PATIENT, PHOTO))
      .rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(mockQueries.some((query) => query.sql.includes("SELECT id, private_key"))).toBe(false);
    expect(getFile).not.toHaveBeenCalled();
  });

  test("the image list never selects the private storage key", async () => {
    await imageService.listImages("mo-1", req, PATIENT);
    const listQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_screening_photos ph"));
    expect(listQuery.sql).not.toContain("private_key");
  });

  test("an authorized Medical Officer receives original image bytes with private response headers", async () => {
    mockHandler = baseHandler({
      "SELECT id, private_key, mime_type": {
        rows: [{ id: PHOTO, private_key: "synthetic/original.jpg", mime_type: "image/jpeg" }],
      },
    });
    const response = await call("get", `/api/medical-officer/patients/${PATIENT}/images/${PHOTO}/file`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ORIGINAL_IMAGE_BYTES);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("the MO endpoint streams private Supabase bytes after the existing access checks", async () => {
    mockHandler = baseHandler({
      "SELECT id, private_key, mime_type": {
        rows: [{ id: PHOTO, private_key: `originals/${SCREENING}/${PHOTO}.jpg`, mime_type: "image/jpeg" }],
      },
    });
    const storage = require("../../services/privateImageStorage");
    storage.getFile.mockResolvedValueOnce({ data: ORIGINAL_IMAGE_BYTES });

    const response = await call("get", `/api/medical-officer/patients/${PATIENT}/images/${PHOTO}/file`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ORIGINAL_IMAGE_BYTES);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(storage.getFile).toHaveBeenCalledWith(`originals/${SCREENING}/${PHOTO}.jpg`);
  });

  test("private keys cannot escape the photo folder", () => {
    expect(() => imageService.resolvePrivateFile("../../.env")).toThrow("Image file is not available");
    expect(imageService.resolvePrivateFile("2026/photo-1.jpg")).toContain("photo-1.jpg");
  });

  test("a missing file returns 404 instead of a public URL", async () => {
    mockHandler = baseHandler({ "FROM tbl_screening_photos WHERE id": { rows: [{ id: PHOTO, private_key: "missing/none.jpg", mime_type: "image/jpeg" }] } });
    mockImageMissing = true;
    await expect(imageService.getImageFile("mo-1", req, PATIENT, PHOTO)).rejects.toMatchObject({ code: "IMAGE_FILE_MISSING" });
  });

  test("an authorized Medical Officer streams an enhanced copy without exposing its path", async () => {
    mockHandler = baseHandler({
      "SELECT ph.id, ph.screening_id": { rows: [{ id: PHOTO, screening_id: SCREENING }] },
    });
    const response = await call(
      "get", `/api/medical-officer/patients/${PATIENT}/images/${PHOTO}/enhanced-file`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ORIGINAL_IMAGE_BYTES);
    expect(response.headers["content-type"]).toMatch(/image\/jpeg/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(streamedFilePath).toContain(`enhanced\\${SCREENING}\\${PHOTO}.jpg`);
    expect(response.text || "").not.toContain(streamedFilePath);
    expect(mockQueries.some(({ sql }) => sql.includes("SELECT ph.id, ph.screening_id"))).toBe(true);
  });

  test("enhanced image retrieval requires an active claim and current photo consent", async () => {
    const storage = require("../../services/privateImageStorage");
    mockHandler = baseHandler({ "FROM tbl_medical_officer_case_claims c": { rows: [] } });
    await expect(imageService.getEnhancedImageFile("mo-1", req, PATIENT, PHOTO))
      .rejects.toMatchObject({ status: 403, code: "CLAIM_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_screening_photos"))).toBe(false);
    expect(storage.getFile).not.toHaveBeenCalled();

    mockHandler = baseHandler({ "FROM tbl_patient_consents pc": { rows: [{ granted: false }] } });
    await expect(imageService.getEnhancedImageFile("mo-1", req, PATIENT, PHOTO))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_screening_photos"))).toBe(false);
    expect(storage.getFile).not.toHaveBeenCalled();
  });

  test("missing enhanced copies return 404", async () => {
    mockHandler = baseHandler({
      "SELECT ph.id, ph.screening_id": { rows: [{ id: PHOTO, screening_id: SCREENING }] },
    });
    mockImageMissing = true;
    await expect(imageService.getEnhancedImageFile("mo-1", req, PATIENT, PHOTO))
      .rejects.toMatchObject({ status: 404, code: "IMAGE_FILE_MISSING" });
  });

  test.each(["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"])(
    "enhanced image key stays paired with its %s original photo",
    async (view) => {
      const photoId = {
        FRONT_VIEW: PHOTO,
        LEFT_VIEW: "77777777-7777-4777-8777-777777777777",
        RIGHT_VIEW: "88888888-8888-4888-8888-888888888888",
      }[view];
      mockHandler = baseHandler({
        "SELECT ph.id, ph.screening_id": {
          rows: [{ id: photoId, screening_id: SCREENING, annotation_site: view }],
        },
      });
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
      try {
        const result = await imageService.getEnhancedImageFile("mo-1", req, PATIENT, photoId);
        expect(result.filePath).toContain(path.join("enhanced", SCREENING, `${photoId}.jpg`));
        expect(mockQueries.find(({ sql }) => sql.includes("SELECT ph.id, ph.screening_id")).params)
          .toEqual([photoId, PATIENT]);
      } finally {
        existsSpy.mockRestore();
      }
    }
  );
});

describe("referrals and follow-ups", () => {
  const referralInput = {
    hospital_facility_id: 8,
    specialty_id: 1,
    priority_id: 1,
    reason: "Biopsy",
  };

  function referralHandler({
    decision = "SPECIALIST_REVIEW",
    signedAt = "2026-04-04T10:00:00Z",
    caseState = "REVIEWED",
    hasActiveReferral = false,
    consentGranted = true,
    claimAvailable = true,
  } = {}) {
    const handler = baseHandler({
      "FROM tbl_medical_officer_case_claims c": claimAvailable
        ? { rows: [{ id: PATIENT, registered_facility_id: 7, mandal_id: 2, district_id: 1, claim_id: "c-1" }] }
        : { rows: [] },
      "FROM tbl_patient_consents pc": { rows: [{ granted: consentGranted }] },
      "LEFT JOIN tbl_clinical_reviews cr": {
        rows: [{
          review_id: REVIEW,
          decision,
          signed_at: signedAt,
          case_state: caseState,
          screening_id: "screening-1",
          has_active_referral: hasActiveReferral,
        }],
      },
      "SELECT hospital_id FROM mst_facilities": { rows: [{ hospital_id: 18 }] },
      "SELECT (SELECT COUNT(*) FROM mst_specialties": {
        rows: [{ specialty: "1", priority: "1", priority_code: "URGENT" }],
      },
      "INSERT INTO tbl_referrals": {
        rows: [{ id: REFERRAL, referral_code: "RF-1", status: "PLANNED", created_at: "2026-04-04T10:00:00Z" }],
      },
    });
    return handler;
  }

  test("a referral needs a signed referral decision", async () => {
    mockHandler = referralHandler({ decision: "NO_ACTION" });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ code: "REFERRAL_NOT_ALLOWED" });
    const referralScreeningQuery = mockQueries.find((query) =>
      query.sql.includes("LEFT JOIN tbl_clinical_reviews cr")
    );
    expect(referralScreeningQuery.sql).toContain("ORDER BY (s.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, s.created_at DESC");
  });

  test.each(["SPECIALIST_REVIEW", "URGENT_REFERRAL"])(
    "a signed %s review allows referral creation",
    async (decision) => {
      mockHandler = referralHandler({ decision });
      await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
        .resolves.toMatchObject({ id: REFERRAL, status: "PLANNED" });

      const reviewQuery = mockQueries.find((query) => query.sql.includes("LEFT JOIN tbl_clinical_reviews cr"));
      expect(reviewQuery.sql).toContain("cr.screening_id = s.id AND cr.patient_id = s.patient_id");
      expect(reviewQuery.sql).toContain("FOR UPDATE OF s");
      // Open referrals only (PLANNED/SENT/ACCEPTED); matches referralService.js.
      expect(reviewQuery.sql).toContain("existing.status IN ('PLANNED', 'SENT', 'ACCEPTED')");
      expect(mockQueries.some((query) => query.sql.includes("FOR UPDATE OF c"))).toBe(true);
      expect(mockQueries.some((query) => query.sql.includes("UPDATE tbl_clinical_reviews"))).toBe(false);
    }
  );

  test("urgent referral can be created without Navigator assignment or TELECONSULT consent", async () => {
    mockHandler = referralHandler({ decision: "URGENT_REFERRAL" });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .resolves.toMatchObject({ id: REFERRAL, status: "PLANNED" });

    const insert = mockQueries.find((query) => query.sql.includes("INSERT INTO tbl_referrals"));
    const consentQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_patient_consents pc"));
    expect(insert.params[9]).toBeNull();
    expect(consentQuery.params).toContain("SCREENING");
    expect(consentQuery.params).not.toContain("TELECONSULT");
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_case_assignments"))).toBe(false);
  });

  test("urgent referral cannot be recorded with a non-urgent priority", async () => {
    const handler = referralHandler({ decision: "URGENT_REFERRAL" });
    mockHandler = (sql, params) => {
      if (sql.includes("SELECT (SELECT COUNT(*) FROM mst_specialties")) {
        return { rows: [{ specialty: "1", priority: "1", priority_code: "ROUTINE" }] };
      }
      return handler(sql, params);
    };
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ status: 400, code: "URGENT_PRIORITY_REQUIRED" });
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
  });

  test("an unsigned referral decision is rejected", async () => {
    mockHandler = referralHandler({ signedAt: null });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ code: "REFERRAL_NOT_ALLOWED" });
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
  });

  test.each(["REQUEST_RECAPTURE", "REQUEST_MORE_INFO", "APPROVE", "NO_ACTION"])(
    "a signed %s review is not eligible for referral",
    async (decision) => {
      mockHandler = referralHandler({ decision });
      await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
        .rejects.toMatchObject({ code: "REFERRAL_NOT_ALLOWED" });
      expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
    }
  );

  test("an existing active referral blocks a duplicate", async () => {
    mockHandler = referralHandler({ hasActiveReferral: true, caseState: "REFERRAL_PLANNED" });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ code: "REFERRAL_ALREADY_EXISTS" });
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
  });

  test("a cancelled referral does not block a new eligible referral", async () => {
    mockHandler = referralHandler({ hasActiveReferral: false });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .resolves.toMatchObject({ id: REFERRAL });
    const referralCheck = mockQueries.find((query) => query.sql.includes("FROM tbl_referrals existing"));
    expect(referralCheck.sql).toContain("existing.status IN ('PLANNED', 'SENT', 'ACCEPTED')");
  });

  test("missing screening consent blocks referral creation", async () => {
    mockHandler = referralHandler({ consentGranted: false });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
  });

  test("a referral requires the active Medical Officer claim", async () => {
    mockHandler = referralHandler({ claimAvailable: false });
    await expect(referralService.createReferral("mo-1", req, PATIENT, referralInput))
      .rejects.toMatchObject({ code: "CLAIM_REQUIRED" });
    expect(mockQueries.some((query) => query.sql.includes("INSERT INTO tbl_referrals"))).toBe(false);
  });

  test("referral input is validated", () => {
    expect(() => referralService.normalizeReferral({ hospital_facility_id: 8, specialty_id: 1, priority_id: 1 })).toThrow("reason");
    expect(() => referralService.normalizeReferral({ reason: "x", specialty_id: 1, priority_id: 1 })).toThrow("hospital");
  });

  test("a follow-up navigator must belong to the patient's district", async () => {
    mockHandler = baseHandler({
      "FROM tbl_referrals r": { rows: [{ id: REFERRAL, patient_id: PATIENT, district_id: 1 }] },
      "r.code = 'NAVIGATOR'": { rows: [] },
    });
    const due = new Date(Date.now() + 86400000).toISOString();
    await expect(followupService.createFollowup("mo-1", req, { referral_id: REFERRAL, navigator_id: NAVIGATOR, task_type: "REMINDER", due_at: due, reason: "Call patient" }))
      .rejects.toMatchObject({ code: "INVALID_FOLLOWUP" });
  });

  test("follow-up input is validated", () => {
    expect(() => followupService.normalizeTask({ task_type: "WRONG" })).toThrow("follow-up type");
    expect(() => followupService.normalizeTask({ task_type: "REMINDER", referral_id: REFERRAL, navigator_id: NAVIGATOR, due_at: "2000-01-01", reason: "x" })).toThrow("past");
  });
});

describe("reports and profile", () => {
  test("the CSV export holds counts only and is logged as non-identifiable", async () => {
    mockHandler = baseHandler({ "FROM tbl_medical_officer_mandal_assignments moa": { rows: [{ id: 2, name_en: "G. Madugula", patients: "3", screenings: "2" }] } });
    const csv = await reportService.exportMandalReport("mo-1", req, {});
    expect(csv.split("\n")[0]).toBe("mandal,patients,screenings,awaiting_review,signed_reviews,draft_reviews,referrals,referrals_completed,followups_open,followups_closed");
    const exportLog = mockQueries.find((query) => query.sql.includes("INSERT INTO tbl_data_exports"));
    expect(exportLog.sql).toContain("FALSE");
  });

  test("the profile never selects password or MFA secrets and validates the phone", async () => {
    mockHandler = baseHandler({ "FROM tbl_users u": { rows: [{ id: "mo-1", full_name: "MO One" }] } });
    await profileService.getProfile("mo-1");
    const profileQuery = mockQueries.find((query) => query.sql.includes("FROM tbl_users u"));
    expect(profileQuery.sql).not.toMatch(/password_hash|mfa_secret/);
    await expect(profileService.updatePhone("mo-1", req, { phone: "12" })).rejects.toMatchObject({ code: "INVALID_PHONE" });
  });
});
