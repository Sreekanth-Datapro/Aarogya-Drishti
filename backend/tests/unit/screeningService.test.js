// Health Worker consent, oral screening, photo upload and submit.
// The database is mocked; photos are written to a temporary private folder.
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const mockStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), "aarogya-photos-"));
const mockImageObjects = new Map();
const mockState = {
  consents: {},          // Latest synthetic consent rows, keyed by purpose.
  screening: null,       // { id, patient_id, case_state }
  reviewDecision: "REQUEST_RECAPTURE",
  openScreening: false,
  activeScreening: null,
  photos: [],            // { id, annotation_site, status }
  statements: [],
  failPhotoInsert: false,
};
let mockPatientRowLockHeld = false;
const mockPatientRowLockWaiters = [];

function mockAcquirePatientRowLock() {
  if (!mockPatientRowLockHeld) {
    mockPatientRowLockHeld = true;
    return Promise.resolve(mockReleasePatientRowLock);
  }
  return new Promise((resolve) => mockPatientRowLockWaiters.push(resolve));
}

function mockReleasePatientRowLock() {
  const next = mockPatientRowLockWaiters.shift();
  if (next) next(mockReleasePatientRowLock);
  else mockPatientRowLockHeld = false;
}

const PATIENT = "11111111-1111-4111-8111-111111111111";
const SCREENING = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function mockQuery(sql, params = []) {
  const query = String(sql).replace(/\s+/g, " ").trim();
  mockState.statements.push({ sql: query, params });
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(query) || query.startsWith("SELECT set_config")) return { rows: [] };
  if (query.includes("FROM tbl_patients p WHERE p.id = $2")) {
    return { rows: params[1] === PATIENT ? [{ id: PATIENT, patient_code: "AD-1", full_name: "Demo", registered_facility_id: 6, preferred_language_id: 2 }] : [] };
  }
  if (query.includes("FROM tbl_screenings s WHERE s.id = $2 AND s.examiner_id = $1")) {
    return { rows: mockState.screening && params[1] === mockState.screening.id ? [{ ...mockState.screening }] : [] };
  }
  if (query.startsWith("SELECT s.id, s.patient_id, p.patient_code, p.full_name")) {
    return {
      rows: [{
        id: SCREENING,
        patient_id: PATIENT,
        patient_code: "AD-1",
        full_name: "Demo",
        case_state: mockState.screening.case_state,
        medical_officer_request_note: "Please retake the left-side photo.",
      }],
    };
  }
  if (query.startsWith("SELECT decision::text AS decision")) {
    return { rows: mockState.reviewDecision ? [{ decision: mockState.reviewDecision }] : [] };
  }
  if (query.startsWith("SELECT p.id, p.patient_code, p.full_name")) {
    return {
      rows: [{
        id: PATIENT,
        screening_consent: true,
        screening_id: SCREENING,
        case_state: "SCREENED",
        medical_officer_decision: "REQUEST_RECAPTURE",
        medical_officer_request_note: "Please retake the left-side photo.",
      }],
    };
  }
  if (query.includes("SELECT DISTINCT ON (cp.code)")) {
    return { rows: Object.entries(mockState.consents).map(([purpose, row]) => ({ purpose, ...row })) };
  }
  if (query.startsWith("SELECT EXISTS (") && query.includes("FROM tbl_patient_consents previous")) {
    return { rows: [{ granted: mockState.consents.TELECONSULT?.previously_granted === true }] };
  }
  if (query.includes("ORDER BY pc.consent_seq DESC LIMIT 1")) {
    return { rows: mockState.consents[params[1]] ? [{ granted: mockState.consents[params[1]].granted }] : [] };
  }
  if (query.startsWith("SELECT id, version FROM mst_consent_purposes")) return { rows: [{ id: 1, version: "v1" }] };
  if (query.startsWith("SELECT id FROM mst_languages")) return { rows: params[0] === 2 ? [{ id: 2 }] : [] };
  if (query.startsWith("INSERT INTO tbl_patient_consents")) {
    return { rows: [{ id: "consent-new", granted: params[5], method: params[4], consent_version: "v1", witness_name: params[7], captured_at: "2026-11-07T10:00:00Z" }] };
  }
  if (query.startsWith("SELECT id, code FROM mst_symptoms")) return { rows: [{ id: 1, code: "WHITE_PATCH" }, { id: 4, code: "PAIN" }] };
  if (query.startsWith("SELECT id, code FROM mst_exposure_types")) return { rows: [{ id: 2, code: "SMOKELESS_TOBACCO" }] };
  if (query.includes("FROM tbl_screenings WHERE patient_id = $1 AND case_state = ANY")) {
    const activeStates = params[1] || [];
    return {
      rows: mockState.openScreening || activeStates.includes(mockState.activeScreening)
        ? [{ id: "old" }]
        : [],
    };
  }
  if (query.startsWith("INSERT INTO tbl_screenings")) {
    mockState.activeScreening = "CONSENTED";
    return { rows: [{ id: SCREENING }] };
  }
  if (query.startsWith("UPDATE tbl_screening_photos SET status = 'SUPERSEDED'") && query.includes("WHERE screening_id = $1")) {
    const old = mockState.photos.filter((photo) => photo.annotation_site === params[1] && photo.status !== "SUPERSEDED");
    old.forEach((photo) => { photo.status = "SUPERSEDED"; });
    return { rows: old.map((photo) => ({ id: photo.id })) };
  }
  if (query.startsWith("INSERT INTO tbl_screening_photos")) {
    if (mockState.failPhotoInsert) throw Object.assign(new Error("duplicate"), { code: "23505" });
    const photo = {
      id: params[0],
      annotation_site: params[3],
      private_key: params[4],
      mime_type: params[6],
      status: "UPLOADED",
    };
    mockState.photos.push(photo);
    return { rows: [{ id: photo.id, view: params[3], mime_type: params[6], size_bytes: params[7], width_px: params[8], height_px: params[9], status: "UPLOADED", captured_at: "now" }] };
  }
  if (query.startsWith("INSERT INTO tbl_image_quality_results")) {
    return { rows: [] };
  }
  if (query.startsWith("SELECT id, private_key, annotation_site AS view FROM tbl_screening_photos")) {
    const photo = mockState.photos.find((item) => item.id === params[0] && item.status !== "SUPERSEDED");
    return { rows: photo ? [{ id: photo.id, private_key: photo.private_key, view: photo.annotation_site }] : [] };
  }
  if (query.includes("FROM tbl_screening_photos ph WHERE ph.screening_id = $1")) {
    return { rows: mockState.photos.filter((photo) => photo.status !== "SUPERSEDED")
      .map((photo) => ({ id: photo.id, view: photo.annotation_site, size_bytes: "100", status: photo.status, is_enhanced: false })) };
  }
  if (query.startsWith("SELECT private_key, mime_type FROM tbl_screening_photos")) {
    const photo = mockState.photos.find((item) => item.id === params[0] && item.status !== "SUPERSEDED");
    return { rows: photo ? [{ private_key: photo.private_key, mime_type: photo.mime_type }] : [] };
  }
  if (query.startsWith("UPDATE tbl_screening_photos SET status = 'SUPERSEDED'") && query.includes("WHERE id = $1")) {
    const photo = mockState.photos.find((item) => item.id === params[0] && item.status !== "SUPERSEDED");
    if (photo) photo.status = "SUPERSEDED";
    return { rows: photo ? [{ id: photo.id, view: photo.annotation_site }] : [] };
  }
  if (query.includes("SELECT DISTINCT annotation_site FROM tbl_screening_photos")) {
    const views = [...new Set(mockState.photos.filter((photo) => photo.status !== "SUPERSEDED").map((photo) => photo.annotation_site))];
    return { rows: views.map((view) => ({ annotation_site: view })) };
  }
  if (query.startsWith("UPDATE tbl_screenings SET case_state = 'SCREENED'")) {
    mockState.screening.case_state = "SCREENED";
    return { rows: [] };
  }
  if (query.startsWith("UPDATE tbl_screenings SET case_state = 'AWAITING_CLINICIAN'")) {
    mockState.screening.case_state = "AWAITING_CLINICIAN";
    return { rows: [{ id: SCREENING, case_state: "AWAITING_CLINICIAN", submitted_at: "now" }] };
  }
  if (query.startsWith("UPDATE tbl_screenings") && query.includes("SET chief_complaint=")) {
    return { rows: [{ id: SCREENING, version: 2 }], rowCount: 1 };
  }
  if (query.startsWith("UPDATE tbl_screenings") && query.includes("SET case_state='AWAITING_CLINICIAN'")) {
    mockState.screening.case_state = "AWAITING_CLINICIAN";
    return { rows: [{ id: SCREENING, case_state: "AWAITING_CLINICIAN", submitted_at: "now", version: 2 }], rowCount: 1 };
  }
  return { rows: [] };
}

jest.mock("../../db", () => ({
  query: jest.fn(async (sql, params) => mockQuery(sql, params)),
  connect: jest.fn(async () => {
    let releasePatientLock = null;
    return {
      query: jest.fn(async (sql, params) => {
        const query = String(sql).replace(/\s+/g, " ").trim();
        if (query.includes("FOR UPDATE OF p") && !releasePatientLock) {
          releasePatientLock = await mockAcquirePatientRowLock();
        }
        const result = await mockQuery(sql, params);
        if (["COMMIT", "ROLLBACK"].includes(query) && releasePatientLock) {
          releasePatientLock();
          releasePatientLock = null;
        }
        return result;
      }),
      release: jest.fn(() => {
        if (releasePatientLock) {
          releasePatientLock();
          releasePatientLock = null;
        }
      }),
    };
  }),
}));
jest.mock("../../config/config", () => ({ photoStorageDir: mockStorageDir, realEsrgan: { maxInputSide: 384 } }));
jest.mock("../../utils/audit", () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/privateImageStorage", () => ({
  uploadBuffer: jest.fn(async (key, data) => {
    mockImageObjects.set(key, Buffer.from(data));
    return key;
  }),
  downloadBuffer: jest.fn(async (key) => {
    if (!mockImageObjects.has(key)) throw Object.assign(new Error("missing"), { code: "IMAGE_FILE_MISSING" });
    return Buffer.from(mockImageObjects.get(key));
  }),
  getFile: jest.fn(async (key) => {
    if (!mockImageObjects.has(key)) throw Object.assign(new Error("missing"), { code: "IMAGE_FILE_MISSING" });
    return { data: Buffer.from(mockImageObjects.get(key)) };
  }),
  objectExists: jest.fn(async (key) => mockImageObjects.has(key)),
}));
// The real model is tested in realEsrgan.test.js; here only the photo handling around it
jest.mock("../../services/ai/realEsrgan", () => {
  class ModelUnavailableError extends Error {}
  return {
    MODEL: { name: "Real-ESRGAN General x4v3", checkpoint: "realesr-general-x4v3" },
    ModelUnavailableError,
    enhance: jest.fn(),
  };
});
jest.mock("../../services/imageCategoryValidationService", () => ({
  normalizeCategory: jest.fn((value) => String(value || "MOUTH").toUpperCase()),
  validateScreeningImage: jest.fn(async () => ({
    status: "VALID",
    upload_allowed: true,
    expected_category: "MOUTH",
    detected_category: "MOUTH",
    confidence: 90,
    reason: "ok",
  })),
  assertUploadAllowed: jest.fn((validation) => {
    if (!validation || validation.upload_allowed !== true || validation.status !== "VALID") {
      const error = new Error(validation?.reason || "not allowed");
      error.status = 422;
      error.code = validation?.status || "NEEDS_REVIEW";
      throw error;
    }
  }),
}));

const { audit } = require("../../utils/audit");
const realEsrgan = require("../../services/ai/realEsrgan");
const service = require("../../services/screeningService");

const req = { user: { id: USER, role_name: "HEALTH_WORKER" } };
const statements = (text) => mockState.statements.filter((statement) => statement.sql.includes(text));
const storedFiles = () => [...mockImageObjects.keys()];

async function image(format = "jpeg") {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: "#cc6666" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-device" } } })
    .toFormat(format)
    .toBuffer();
}
const fileOf = async (format = "jpeg", mimetype = `image/${format}`) => {
  const buffer = await image(format);
  return { buffer, size: buffer.length, mimetype };
};

const validScreening = {
  patient_id: PATIENT,
  chief_complaint: "Burning sensation while eating",
  symptoms: [{ code: "WHITE_PATCH", duration_days: 30 }],
  medical_history: { exposures: [{ code: "SMOKELESS_TOBACCO", is_current: true, duration_years: 10, frequency_per_day: 5 }], conditions: "Diabetes" },
  oral_observations: [{ site: "CHEEK_LINING", description: "White area on left cheek" }],
  pain: { has_pain: true, severity: 4, location: "Left cheek", duration_days: 10 },
  notes: "Uses tobacco daily",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockImageObjects.clear();
  Object.assign(mockState, {
    consents: { SCREENING: { id: "consent-s", granted: true }, IMAGE_CAPTURE: { id: "consent-i", granted: true } },
    screening: { id: SCREENING, patient_id: PATIENT, case_state: "CONSENTED" },
    reviewDecision: "REQUEST_RECAPTURE",
    openScreening: false,
    activeScreening: null,
    photos: [],
    statements: [],
    failPhotoInsert: false,
  });
});

afterAll(() => fs.rmSync(mockStorageDir, { recursive: true, force: true }));

describe("consent", () => {
  test("screening and photograph consent are recorded separately as new rows with an audit event", async () => {
    const consent = await service.recordConsent(USER, req, PATIENT, { purpose: "IMAGE_CAPTURE", granted: true, method: "CHECKBOX", language_id: 2 });
    expect(consent).toMatchObject({ purpose: "IMAGE_CAPTURE", granted: true, captured_at: "2026-11-07T10:00:00Z" });
    const [insert] = statements("INSERT INTO tbl_patient_consents");
    expect(insert.params).toEqual([PATIENT, 1, 2, "v1", "CHECKBOX", true, USER, null]);
    expect(statements("UPDATE tbl_patient_consents")).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ event: "CONSENT_GRANTED", required: true, patientId: PATIENT }));
  });

  test("withdrawing consent is a new row, never an update", async () => {
    await service.recordConsent(USER, req, PATIENT, { purpose: "SCREENING", granted: false, method: "CHECKBOX", language_id: 2 });
    expect(statements("INSERT INTO tbl_patient_consents")[0].params[5]).toBe(false);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ event: "CONSENT_WITHDRAWN" }));
  });

  test.each([
    [true, false, "ACTIVE"],
    [false, false, "DECLINED"],
    [false, true, "WITHDRAWN"],
  ])("returns the latest TELECONSULT consent state (%s, previously granted: %s)", async (granted, previouslyGranted, status) => {
    mockState.consents.TELECONSULT = {
      id: "synthetic-teleconsult-consent",
      granted,
      previously_granted: previouslyGranted,
      method: "CHECKBOX",
      consent_version: "v1",
      captured_at: "2026-11-07T10:00:00Z",
    };

    const result = await service.getConsents(USER, PATIENT);
    expect(result.consents.TELECONSULT).toMatchObject({
      granted,
      previously_granted: previouslyGranted,
      status,
      consent_version: "v1",
      method: "CHECKBOX",
    });
  });

  test("missing TELECONSULT consent remains not recorded", async () => {
    const result = await service.getConsents(USER, PATIENT);
    expect(result.consents.TELECONSULT).toBeNull();
  });

  test("records the patient's TELECONSULT refusal as a new row", async () => {
    const consent = await service.recordConsent(USER, req, PATIENT, {
      purpose: "TELECONSULT",
      granted: false,
      method: "VERBAL_WITNESSED",
      witness_name: "Synthetic Witness",
      language_id: 2,
    });

    expect(consent).toMatchObject({ purpose: "TELECONSULT", granted: false });
    expect(statements("INSERT INTO tbl_patient_consents")[0].params).toEqual([
      PATIENT, 1, 2, "v1", "VERBAL_WITNESSED", false, USER, "Synthetic Witness",
    ]);
    expect(statements("UPDATE tbl_patient_consents")).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "CONSENT_DECLINED",
      required: true,
      patientId: PATIENT,
    }));
  });

  test("records granted TELECONSULT consent with current form version and capture method", async () => {
    const consent = await service.recordConsent(USER, req, PATIENT, {
      purpose: "TELECONSULT",
      granted: true,
      method: "CHECKBOX",
      language_id: 2,
    });

    expect(consent).toMatchObject({
      purpose: "TELECONSULT",
      granted: true,
      consent_version: "v1",
      method: "CHECKBOX",
      captured_at: "2026-11-07T10:00:00Z",
    });
    expect(statements("INSERT INTO tbl_patient_consents")[0].params).toEqual([
      PATIENT, 1, 2, "v1", "CHECKBOX", true, USER, null,
    ]);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "CONSENT_GRANTED",
      required: true,
      patientId: PATIENT,
    }));
  });

  test("records TELECONSULT withdrawal distinctly after a prior grant", async () => {
    mockState.consents.TELECONSULT = { id: "prior", granted: false, previously_granted: true };
    await service.recordConsent(USER, req, PATIENT, {
      purpose: "TELECONSULT",
      granted: false,
      method: "CHECKBOX",
      language_id: 2,
    });

    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "CONSENT_WITHDRAWN",
      required: true,
      patientId: PATIENT,
    }));
  });

  test.each([
    [{ purpose: "DATA_PROCESSING", granted: true, method: "CHECKBOX", language_id: 2 }, "INVALID_CONSENT"],
    [{ purpose: "SCREENING", method: "CHECKBOX", language_id: 2 }, "INVALID_CONSENT"],
    [{ purpose: "SCREENING", granted: true, method: "THUMBPRINT", language_id: 2 }, "INVALID_CONSENT"],
    [{ purpose: "SCREENING", granted: true, method: "CHECKBOX" }, "INVALID_CONSENT"],
  ])("invalid consent input is refused before any database work (%#)", async (input, code) => {
    await expect(service.recordConsent(USER, req, PATIENT, input)).rejects.toMatchObject({ status: 400, code });
    expect(statements("INSERT")).toHaveLength(0);
  });

  test("a patient the worker may not access is not found", async () => {
    await expect(service.recordConsent(USER, req, "44444444-4444-4444-8444-444444444444", { purpose: "SCREENING", granted: true, method: "CHECKBOX", language_id: 2 }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe("screening details", () => {
  test("returns only the current signed MO recapture or information request note", async () => {
    const details = await service.getScreening(USER, SCREENING);
    const [detailsQuery] = statements("SELECT s.id, s.patient_id, p.patient_code, p.full_name");

    expect(details.medical_officer_request_note).toBe("Please retake the left-side photo.");
    expect(detailsQuery.sql).toContain("cr.screening_id = s.id AND cr.signed_at IS NOT NULL");
    expect(detailsQuery.sql).toContain("ORDER BY cr.version DESC");
  });

  test("screening detail refuses to return clinical data after SCREENING consent is withdrawn", async () => {
    mockState.consents.SCREENING.granted = false;
    await expect(service.getScreening(USER, SCREENING))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(statements("FROM tbl_screening_findings")).toHaveLength(0);
  });

  test("REQUEST_MORE_INFO update edits and resubmits the same screening with required audit events", async () => {
    mockState.screening.case_state = "SCREENED";
    mockState.reviewDecision = "REQUEST_MORE_INFO";
    mockState.consents.IMAGE_CAPTURE.granted = false;

    const result = await service.updateRequestedInformation(USER, req, SCREENING, {
      chief_complaint: "Burning for three weeks",
      symptoms: [{ code: "WHITE_PATCH", duration_days: 21 }],
      oral_observations: [{ site: "CHEEK_LINING", description: "Updated observation" }],
      medical_history: { exposures: [], conditions: "Ignored patient-level history" },
      notes: "Additional requested detail",
    });

    expect(result).toMatchObject({ id: SCREENING, case_state: "AWAITING_CLINICIAN", version: 2 });
    expect(statements("DELETE FROM tbl_screening_findings")).toHaveLength(1);
    expect(statements("INSERT INTO tbl_screening_findings")).toHaveLength(2);
    expect(statements("INSERT INTO tbl_clinical_reviews")).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "SCREENING_INFORMATION_UPDATED",
      required: true,
      resourceId: SCREENING,
    }));
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "SCREENING_SUBMITTED",
      required: true,
      metadata: { resubmitted: true, request_decision: "REQUEST_MORE_INFO" },
    }));
    expect(mockState.screening.case_state).toBe("AWAITING_CLINICIAN");
    expect(statements("COMMIT")).toHaveLength(1);
  });

  test("REQUEST_MORE_INFO update is blocked after consent withdrawal or without screening ownership", async () => {
    mockState.screening.case_state = "SCREENED";
    mockState.reviewDecision = "REQUEST_MORE_INFO";
    mockState.consents.SCREENING.granted = false;
    await expect(service.updateRequestedInformation(USER, req, SCREENING, validScreening))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(statements("DELETE FROM tbl_screening_findings")).toHaveLength(0);

    mockState.screening = null;
    mockState.consents.SCREENING.granted = true;
    await expect(service.updateRequestedInformation(USER, req, SCREENING, validScreening))
      .rejects.toMatchObject({ status: 404, code: "SCREENING_NOT_FOUND" });
    expect(statements("DELETE FROM tbl_screening_findings")).toHaveLength(0);
  });

  test("only a SCREENED screening with a signed REQUEST_MORE_INFO can use the update endpoint", async () => {
    mockState.screening.case_state = "SCREENED";
    mockState.reviewDecision = "REQUEST_RECAPTURE";
    mockState.consents.IMAGE_CAPTURE.granted = false;
    await expect(service.updateRequestedInformation(USER, req, SCREENING, validScreening))
      .rejects.toMatchObject({ status: 409, code: "REQUEST_MORE_INFO_REQUIRED" });
    expect(statements("DELETE FROM tbl_screening_findings")).toHaveLength(0);
  });

  test("the patient list prioritizes any active screening over later terminal history", async () => {
    const [patient] = await service.listPatients(USER);
    const [query] = statements("latest.id AS screening_id");

    expect(query.sql).toContain("ORDER BY (s.case_state = ANY(ARRAY['DRAFT'::case_state, 'CONSENTED'::case_state, 'SCREENED'::case_state, 'AWAITING_CLINICIAN'::case_state])) DESC, s.created_at DESC");
    expect(query.sql).toContain("latest.signed_at IS NOT NULL");
    expect(query.sql).toContain("latest.medical_officer_decision IN ('REQUEST_RECAPTURE', 'REQUEST_MORE_INFO')");
    expect(query.sql).toContain("fn_user_has_patient_access($1, p.id)");
    expect(query.params).toEqual([USER]);
    expect(patient).toMatchObject({
      screening_id: SCREENING,
      case_state: "SCREENED",
      medical_officer_decision: "REQUEST_RECAPTURE",
      medical_officer_request_note: "Please retake the left-side photo.",
    });
  });

  test("a screening needs an active SCREENING consent", async () => {
    mockState.consents.SCREENING = { id: "consent-s", granted: false };
    await expect(service.createScreening(USER, req, validScreening)).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(statements("INSERT INTO tbl_screenings")).toHaveLength(0);
  });

  test("the screening follows DRAFT -> CONSENTED and saves symptoms, pain, observations and history", async () => {
    const created = await service.createScreening(USER, req, validScreening);
    expect(created).toEqual({ id: SCREENING, patient_id: PATIENT, case_state: "CONSENTED" });

    const [insert] = statements("INSERT INTO tbl_screenings");
    expect(insert.sql).toContain("'DRAFT'");
    expect(insert.params).toEqual([PATIENT, USER, 6, null, "Burning sensation while eating", true, "Uses tobacco daily"]);
    const [consented] = statements("SET consent_id = $1, case_state = 'CONSENTED'");
    expect(consented.params).toEqual(["consent-s", SCREENING]);

    const findings = statements("INSERT INTO tbl_screening_findings");
    expect(findings).toHaveLength(3);
    expect(findings[0].params).toEqual([SCREENING, 1, 30, USER]);
    expect(findings[1].params[2]).toBe("Pain score 4/10. Location: Left cheek");
    expect(findings[2].params).toEqual([SCREENING, "CHEEK_LINING", "White area on left cheek", USER]);
    const history = statements("INSERT INTO tbl_patient_medical_histories");
    expect(history.map((item) => item.params)).toEqual([[PATIENT, 2, true, 10, 5, USER], [PATIENT, "Diabetes", USER]]);
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ event: "SCREENING_CREATED", required: true }));
  });

  test("a separate pain detail remains valid alongside the PAIN symptom code", async () => {
    await service.createScreening(USER, req, {
      ...validScreening,
      symptoms: [{ code: "PAIN", duration_days: 10 }],
    });

    const findings = statements("INSERT INTO tbl_screening_findings");
    expect(findings).toHaveLength(3);
    expect(findings[0].params).toEqual([SCREENING, 4, 10, USER]);
    expect(findings[1].params[2]).toContain("Pain score 4/10");
  });

  test("half-year tobacco duration values are accepted", async () => {
    await service.createScreening(USER, req, {
      ...validScreening,
      medical_history: {
        ...validScreening.medical_history,
        exposures: [{ ...validScreening.medical_history.exposures[0], duration_years: 0.5 }],
      },
    });

    expect(statements("INSERT INTO tbl_patient_medical_histories")[0].params[3]).toBe(0.5);
  });

  test.each([
    [{ chief_complaint: "  " }, "Enter the chief complaint"],
    [{ symptoms: [{ code: "MADE_UP" }] }, "Select a valid symptom"],
    [{ symptoms: [{ code: "WHITE_PATCH" }, { code: "WHITE_PATCH" }] }, "A symptom can only be recorded once per screening"],
    [{ oral_observations: [{ site: "TONGUE", description: "First note" }, { site: "TONGUE", description: "Second note" }] }, "An oral observation site can only be recorded once per screening"],
    [{ medical_history: { exposures: [{ code: "SMOKELESS_TOBACCO", duration_years: 1.25 }] } }, "Years of use must be from 0 to 120 in 0.5-year steps"],
    [{ medical_history: { exposures: [{ code: "SMOKELESS_TOBACCO", duration_years: 120.5 }] } }, "Years of use must be from 0 to 120 in 0.5-year steps"],
    [{ oral_observations: [{ site: "TONGUE", description: "" }] }, "Describe what you saw in each mouth area"],
    [{ pain: { has_pain: true } }, "Enter a pain score from 0 to 10"],
    [{ pain: { has_pain: true, severity: 15 } }, "Pain score must be a whole number from 0 to 10"],
  ])("invalid screening input is refused (%#)", async (change, message) => {
    await expect(service.createScreening(USER, req, { ...validScreening, ...change })).rejects.toMatchObject({ status: 400, message });
    expect(statements("INSERT INTO tbl_screenings")).toHaveLength(0);
  });

  test.each(["DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN"])(
    "%s blocks a second screening for the same patient",
    async (caseState) => {
      mockState.activeScreening = caseState;
      await expect(service.createScreening(USER, req, validScreening))
        .rejects.toMatchObject({
          status: 409,
          code: "SCREENING_IN_PROGRESS",
          message: "This patient already has an active screening. Finish it before starting another.",
        });
      expect(statements("INSERT INTO tbl_screenings")).toHaveLength(0);
    }
  );

  test.each(["REVIEWED", "CLOSED"])("%s permits a legitimate future screening", async (caseState) => {
    mockState.activeScreening = caseState;
    await expect(service.createScreening(USER, req, validScreening))
      .resolves.toMatchObject({ id: SCREENING, case_state: "CONSENTED" });
    expect(statements("INSERT INTO tbl_screenings")).toHaveLength(1);
  });

  test("concurrent screening creation attempts for the same patient cannot both succeed", async () => {
    const results = await Promise.allSettled([
      service.createScreening(USER, req, validScreening),
      service.createScreening(USER, req, validScreening),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(statements("INSERT INTO tbl_screenings")).toHaveLength(1);
    expect(statements("FOR UPDATE OF p")).toHaveLength(2);
  });

  test("patient access is checked before a screening can be created", async () => {
    await expect(service.createScreening(USER, req, {
      ...validScreening,
      patient_id: "44444444-4444-4444-8444-444444444444",
    })).rejects.toMatchObject({ status: 404, code: "PATIENT_NOT_FOUND" });
    expect(statements("INSERT INTO tbl_screenings")).toHaveLength(0);
  });
});

describe("photo upload", () => {
  test.each(["jpeg", "png", "webp"])("a %s photo is checked, cleaned and stored privately", async (format) => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf(format));
    expect(photo).toMatchObject({ view: "FRONT_VIEW", mime_type: `image/${format}`, width_px: 40, height_px: 30 });

    const [insert] = statements("INSERT INTO tbl_screening_photos");
    const [photoId, screeningId, patientId, view, privateKey, checksum] = insert.params;
    expect(photoId).toBe(photo.id);
    expect([screeningId, patientId, view]).toEqual([SCREENING, PATIENT, "FRONT_VIEW"]);
    expect(insert.sql).toContain("'OTHER'");
    expect(privateKey).toMatch(new RegExp(`^originals/${SCREENING}/${photo.id}\\.(jpg|png|webp)$`));
    expect(privateKey).not.toMatch(/^(https?:)?\/\//);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);

    const saved = mockImageObjects.get(privateKey);
    const meta = await sharp(saved).metadata();
    expect(meta.exif).toBeUndefined();
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "PHOTO_UPLOADED",
      required: true,
      client: expect.anything(),
    }));
  });

  test("a new photo of the same view replaces the old one", async () => {
    await service.uploadPhoto(USER, req, SCREENING, "LEFT_VIEW", await fileOf());
    await service.uploadPhoto(USER, req, SCREENING, "LEFT_VIEW", await fileOf("png"));
    expect(mockState.photos.map((photo) => photo.status)).toEqual(["SUPERSEDED", "UPLOADED"]);
    expect(statements("INSERT INTO tbl_screening_photos")[1].params[10]).toBe(mockState.photos[0].id);
  });

  test("no photo without an active IMAGE_CAPTURE consent, and nothing is written", async () => {
    mockState.consents.IMAGE_CAPTURE = { id: "consent-i", granted: false };
    const before = storedFiles().length;
    await expect(service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf()))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(storedFiles()).toHaveLength(before);
    expect(statements("INSERT INTO tbl_screening_photos")).toHaveLength(0);
  });

  test("an authorized Health Worker retrieves the stored original only after ownership and consent checks", async () => {
    const storage = require("../../services/privateImageStorage");
    const photo = await service.uploadPhoto(USER, req, SCREENING, "LEFT_VIEW", await fileOf());

    await expect(service.getPhotoFile(USER, SCREENING, photo.id)).resolves.toMatchObject({
      data: mockImageObjects.get(mockState.photos[0].private_key),
      mimeType: "image/jpeg",
    });
    expect(storage.getFile).toHaveBeenCalledWith(mockState.photos[0].private_key);

    mockState.consents.IMAGE_CAPTURE.granted = false;
    await expect(service.getPhotoFile(USER, SCREENING, photo.id))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(storage.getFile).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["an unknown view", "TOP_VIEW", async () => fileOf(), 400],
    ["a GIF", "FRONT_VIEW", async () => ({ buffer: Buffer.from("GIF89a"), size: 6, mimetype: "image/gif" }), 400],
    ["a file larger than 10 MB", "FRONT_VIEW", async () => ({ buffer: Buffer.alloc(10), size: 10 * 1024 * 1024 + 1, mimetype: "image/jpeg" }), 400],
    ["a text file named as a JPG", "FRONT_VIEW", async () => ({ buffer: Buffer.from("not an image at all"), size: 19, mimetype: "image/jpeg" }), 400],
  ])("%s is refused", async (_label, view, makeFile, status) => {
    await expect(service.uploadPhoto(USER, req, SCREENING, view, await makeFile())).rejects.toMatchObject({ status });
    expect(statements("INSERT INTO tbl_screening_photos")).toHaveLength(0);
  });

  test("photos cannot be added after submission", async () => {
    mockState.screening.case_state = "AWAITING_CLINICIAN";
    await expect(service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf())).rejects.toMatchObject({ status: 409 });
  });

  test("a failed database insert leaves a private storage orphan for later cleanup", async () => {
    mockState.failPhotoInsert = true;
    const before = storedFiles().length;
    await expect(service.uploadPhoto(USER, req, SCREENING, "RIGHT_VIEW", await fileOf())).rejects.toMatchObject({ status: 409, code: "DUPLICATE_PHOTO" });
    expect(storedFiles()).toHaveLength(before + 1);
  });

  test("a browser-made 'enhanced' upload is refused; only originals are uploaded", async () => {
    const upload = service.uploadPhoto(USER, { ...req, body: { enhanced: "true" } }, SCREENING, "FRONT_VIEW", await fileOf());
    await expect(upload).rejects.toMatchObject({ status: 400 });
    expect(statements("INSERT INTO tbl_screening_photos")).toHaveLength(0);
  });

  test("removing a photo preserves its row and file while auditing the change in the transaction", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "LEFT_VIEW", await fileOf());
    const fileCount = storedFiles().length;
    const result = await service.removePhoto(USER, req, SCREENING, photo.id);

    expect(result).toEqual({ removed: true, view: "LEFT_VIEW" });
    expect(mockState.photos[0].status).toBe("SUPERSEDED");
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "PHOTO_REMOVED",
      required: true,
      client: expect.anything(),
    }));
    expect(statements("BEGIN")).toHaveLength(2);
    expect(statements("COMMIT")).toHaveLength(2);
    await expect(service.getPhotoFile(USER, SCREENING, photo.id)).rejects.toMatchObject({ status: 404 });
    expect(storedFiles()).toHaveLength(fileCount);
    expect(statements("SELECT private_key, mime_type FROM tbl_screening_photos")[0].sql).toContain("status <> 'SUPERSEDED'");
  });

  test("a required audit failure rolls back photo removal", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "RIGHT_VIEW", await fileOf());
    audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(service.removePhoto(USER, req, SCREENING, photo.id)).rejects.toThrow("audit unavailable");
    expect(statements("ROLLBACK")).toHaveLength(1);
    expect(statements("COMMIT")).toHaveLength(1);
  });
});

describe("submit", () => {
  const uploadAll = async () => {
    for (const view of service.PHOTO_VIEWS) await service.uploadPhoto(USER, req, SCREENING, view, await fileOf());
  };

  test("with photograph consent, all three views are required", async () => {
    await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf());
    await expect(service.submitScreening(USER, req, SCREENING)).rejects.toMatchObject({ status: 400, code: "PHOTOS_REQUIRED" });
    expect(mockState.screening.case_state).toBe("CONSENTED");
  });

  test("a complete screening moves CONSENTED -> SCREENED -> AWAITING_CLINICIAN (Medical Officer queue)", async () => {
    await uploadAll();
    const result = await service.submitScreening(USER, req, SCREENING);
    expect(result.case_state).toBe("AWAITING_CLINICIAN");
    const updates = statements("UPDATE tbl_screenings SET case_state").map((item) => item.sql);
    expect(updates[0]).toContain("'SCREENED'");
    expect(updates[1]).toContain("'AWAITING_CLINICIAN'");
    expect(updates[1]).toContain("submitted_at = now()");
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ event: "SCREENING_SUBMITTED", required: true }));
  });

  test("without photograph consent the screening can be submitted without photos", async () => {
    mockState.consents.IMAGE_CAPTURE = { id: "consent-i", granted: false };
    await expect(service.submitScreening(USER, req, SCREENING)).resolves.toMatchObject({ case_state: "AWAITING_CLINICIAN" });
  });

  test("a case sent back by the Medical Officer (SCREENED) is resubmitted directly", async () => {
    mockState.screening.case_state = "SCREENED";
    await uploadAll();
    const result = await service.submitScreening(USER, req, SCREENING);
    const updates = statements("UPDATE tbl_screenings SET case_state");
    expect(updates).toHaveLength(1);
    expect(result.case_state).toBe("AWAITING_CLINICIAN");
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ metadata: { resubmitted: true } }));
  });

  test("a withdrawn screening consent blocks the submission", async () => {
    mockState.consents.SCREENING = { id: "consent-s", granted: false };
    await expect(service.submitScreening(USER, req, SCREENING)).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
  });

  test("a submitted screening cannot be submitted again", async () => {
    mockState.screening.case_state = "AWAITING_CLINICIAN";
    await expect(service.submitScreening(USER, req, SCREENING)).rejects.toMatchObject({ status: 409 });
  });

  test("another worker's screening is not found", async () => {
    await expect(service.submitScreening(USER, req, "55555555-5555-4555-8555-555555555555")).rejects.toMatchObject({ status: 404 });
  });
});

describe("AI enhancement (Real-ESRGAN)", () => {
  const enhancedOutput = async () => ({
    data: await sharp({ create: { width: 160, height: 120, channels: 3, background: "#cc6666" } }).jpeg().toBuffer(),
    mimeType: "image/jpeg", width: 160, height: 120, inputWidth: 40, inputHeight: 30, tiles: 1, durationMs: 12,
  });
  const enhancedPath = (photoId) => `enhanced/${SCREENING}/${photoId}.jpg`;
  const originalPath = (photoId) => mockState.photos.find((item) => item.id === photoId).private_key;

  beforeEach(async () => {
    realEsrgan.enhance.mockResolvedValue(await enhancedOutput());
  });

  test("the enhanced copy is stored separately; the original file and row are not changed", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf());
    const originalBytes = Buffer.from(mockImageObjects.get(originalPath(photo.id)));
    const before = mockState.statements.length;

    const result = await service.enhancePhoto(USER, req, SCREENING, photo.id);

    expect(result).toMatchObject({ photo_id: photo.id, view: "FRONT_VIEW", width: 160, height: 120, already_enhanced: false });
    expect(realEsrgan.enhance).toHaveBeenCalledWith(originalBytes);
    expect(mockImageObjects.get(originalPath(photo.id)).equals(originalBytes)).toBe(true);
    expect(mockImageObjects.has(enhancedPath(photo.id))).toBe(true);
    const writes = mockState.statements.slice(before).filter((item) => /^(INSERT|UPDATE|DELETE)/.test(item.sql));
    expect(writes).toHaveLength(0);
    expect(mockState.photos[0].status).toBe("UPLOADED");
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
      event: "PHOTO_AI_ENHANCED", required: true, resourceId: photo.id,
      metadata: expect.objectContaining({ model: "Real-ESRGAN General x4v3", input_size: "40x30", output_size: "160x120" }),
    }));

    const details = await service.getScreening(USER, SCREENING);
    expect(details.photos[0]).toMatchObject({ id: photo.id, has_ai_enhanced: true });
    const detailQuery = statements("SELECT ph.id, ph.annotation_site AS view")[0];
    expect(detailQuery.sql).toContain("a.event = 'PHOTO_AI_ENHANCED'");
    const file = await service.getEnhancedPhotoFile(USER, SCREENING, photo.id);
    expect(file).toEqual({ data: mockImageObjects.get(enhancedPath(photo.id)), mimeType: "image/jpeg" });
  });

  test("a second request reuses the enhanced copy without running the model again", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "LEFT_VIEW", await fileOf());
    await service.enhancePhoto(USER, req, SCREENING, photo.id);
    const again = await service.enhancePhoto(USER, req, SCREENING, photo.id);
    expect(again).toMatchObject({ already_enhanced: true, width: 160, height: 120 });
    expect(realEsrgan.enhance).toHaveBeenCalledTimes(1);
  });

  test("no enhancement without an active photograph consent", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "RIGHT_VIEW", await fileOf());
    mockState.consents.IMAGE_CAPTURE = { id: "consent-i", granted: false };
    await expect(service.enhancePhoto(USER, req, SCREENING, photo.id)).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(service.getEnhancedPhotoFile(USER, SCREENING, photo.id)).rejects.toMatchObject({ status: 403 });
    expect(realEsrgan.enhance).not.toHaveBeenCalled();
  });

  test("a missing or damaged model gives a clear 503 and no file", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf());
    realEsrgan.enhance.mockRejectedValueOnce(new realEsrgan.ModelUnavailableError("Model file missing"));
    await expect(service.enhancePhoto(USER, req, SCREENING, photo.id)).rejects.toMatchObject({ status: 503, code: "PHOTO_ENHANCEMENT_MODEL_FAILED" });
    expect(mockImageObjects.has(enhancedPath(photo.id))).toBe(false);
  });

  test("if the audit log cannot be written, the enhanced private object remains for reconciliation", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf());
    audit.mockImplementation(async (_req, entry) => {
      if (entry.event === "PHOTO_AI_ENHANCED") throw new Error("audit unavailable");
    });
    await expect(service.enhancePhoto(USER, req, SCREENING, photo.id)).rejects.toThrow("audit unavailable");
    expect(mockImageObjects.has(enhancedPath(photo.id))).toBe(true);
    audit.mockResolvedValue(undefined);
  });

  test("photos are not enhanced after submission, and unknown photos are not found", async () => {
    const photo = await service.uploadPhoto(USER, req, SCREENING, "FRONT_VIEW", await fileOf());
    await expect(service.enhancePhoto(USER, req, SCREENING, "77777777-7777-4777-8777-777777777777")).rejects.toMatchObject({ status: 404 });
    await expect(service.enhancePhoto(USER, req, SCREENING, "not-an-id")).rejects.toMatchObject({ status: 400 });
    mockState.screening.case_state = "AWAITING_CLINICIAN";
    await expect(service.enhancePhoto(USER, req, SCREENING, photo.id)).rejects.toMatchObject({ status: 409 });
    expect(realEsrgan.enhance).not.toHaveBeenCalled();
  });
});

test("screening details never include the private photo key", async () => {
  await service.getScreening(USER, SCREENING);
  const photoQuery = statements("FROM tbl_screening_photos ph")[0];
  expect(photoQuery).toBeDefined();
  expect(photoQuery.sql.split("FROM")[0]).not.toContain("private_key");
});
