const mockClient = { query: jest.fn() };
const mockPool = { query: jest.fn() };
const mockAudit = jest.fn(async () => {});
const mockRequireConsent = jest.fn(async () => {});
const mockWithTransaction = jest.fn(async (_pool, callback) => callback(mockClient));
const mockDownloadBuffer = jest.fn(async (objectKey) => Buffer.from(`synthetic-original:${objectKey}`));
let mockPhotoRows;
let mockModelRows;
let mockScreeningRows;
let mockAttemptByPhoto;
let changePhotosBeforePersistence;
let mockPipelinePayload;
let mockAnalysisStatus;
let mockMalformedAnalysisJson;

jest.mock("../../db", () => mockPool);
jest.mock("../../utils/audit", () => ({ audit: (...args) => mockAudit(...args) }));
jest.mock("../../services/medicalOfficer/scope", () => ({
  requireConsent: (...args) => mockRequireConsent(...args),
  requireUuid: jest.fn(),
  setActor: jest.fn(async () => {}),
  withTransaction: (...args) => mockWithTransaction(...args),
}));
jest.mock("../../services/privateImageStorage", () => ({
  downloadBuffer: (...args) => mockDownloadBuffer(...args),
}));

const config = require("../helpers/unitConfig");
const { analyzeScreening } = require("../../services/aiAnalysisService");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCREENING_ID = "22222222-2222-4222-8222-222222222222";
const PATIENT_ID = "33333333-3333-4333-8333-333333333333";
const MODEL_VERSION = "gemma4:31b-cloud";
const VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];

function makePhotos() {
  return VIEWS.map((view) => ({
    id: `photo-${view}`,
    view,
    private_key: `${view.toLowerCase()}.jpg`,
    mime_type: "image/jpeg",
    size_bytes: 100,
  }));
}

function makeView(view, extras = {}) {
  return {
    view,
    screening_reference: SCREENING_ID,
    selected_category: "MOUTH",
    classification: "ABNORMAL",
    model_status: "OK",
    model_confidence: 60,
    observation_confidence: 60,
    confidence_meaning: "Model confidence only; it is not a disease probability.",
    observations: ["Visible redness: Mild appearance"],
    abnormalities: ["Visible redness: Mild appearance"],
    possible_visual_findings: [
      { feature: "VISIBLE_REDNESS", scale: "1", note: null },
      { feature: "POSSIBLE_SWELLING", scale: "0", note: null },
      { feature: "WHITE_OR_RED_PATCHES", scale: "0", note: null },
      { feature: "VISIBLE_ULCERS", scale: "0", note: null },
      { feature: "GUM_APPEARANCE_CHANGES", scale: "0", note: null },
    ],
    visual_health_assessment_score: 87,
    visual_health_assessment_score_message:
      "Score calculated from the visual findings returned by the AI model.",
    visual_health_assessment_score_reasons: [
      { feature: "VISIBLE_REDNESS", scale: "1", points: 67, reason: "Visible redness: Mild appearance → 67/100" },
      { feature: "POSSIBLE_SWELLING", scale: "0", points: 100, reason: "Possible swelling: Not observed → 100/100" },
      { feature: "WHITE_OR_RED_PATCHES", scale: "0", points: 100, reason: "White/red patches: Not observed → 100/100" },
      { feature: "VISIBLE_ULCERS", scale: "0", points: 100, reason: "Visible ulcers: Not observed → 100/100" },
      { feature: "GUM_APPEARANCE_CHANGES", scale: "0", points: 100, reason: "Gum appearance changes: Not observed → 100/100" },
    ],
    visual_health_assessment_unassessable: [],
    not_assessable_reason: null,
    recommendation: "A Medical Officer must review the original image and clinical findings before making any decision.",
    image_quality: { status: "ACCEPTABLE", warnings: [], metrics: { width: 1200, height: 900 } },
    model_information: { provider: "ollama-cloud", model_version: MODEL_VERSION, inference_performed: true },
    uncertainty_warnings: ["CLINICIAN_REVIEW_REQUIRED"],
    review_status: "PENDING_MEDICAL_OFFICER_REVIEW",
    ...extras,
  };
}

function makeAnalysisPayload() {
  return {
    status: "success",
    analysis: {
      screening_reference: SCREENING_ID,
      model_information: { provider: "ollama-cloud", model_version: MODEL_VERSION },
      views: VIEWS.map(makeView),
      review_status: "PENDING_MEDICAL_OFFICER_REVIEW",
      disclaimer: "Preliminary screening support only; not a diagnosis.",
    },
  };
}

function mockPipeline() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith("/health")) {
      return new Response(JSON.stringify({
        status: "healthy",
        model_information: {
          provider: "ollama-cloud",
          model_version: MODEL_VERSION,
          model_type: "cloud_vision",
          trained_oral_model: false,
          validation_status: "NOT_VALIDATED",
        },
      }), { status: 200 });
    }
    if (changePhotosBeforePersistence) {
      mockPhotoRows = mockPhotoRows.map((photo) => (
        photo.view === "FRONT_VIEW" ? { ...photo, id: "replacement-photo" } : photo
      ));
    }
    const body = mockMalformedAnalysisJson ? "not-json" : JSON.stringify(mockPipelinePayload);
    return new Response(body, { status: mockAnalysisStatus });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPhotoRows = makePhotos();
  mockScreeningRows = [{ id: SCREENING_ID, patient_id: PATIENT_ID, case_state: "SCREENED" }];
  mockAttemptByPhoto = {};
  changePhotosBeforePersistence = false;
  mockPipelinePayload = makeAnalysisPayload();
  mockAnalysisStatus = 200;
  mockMalformedAnalysisJson = false;
  mockModelRows = [{
    id: 3,
    provider: "ollama-cloud",
    model_version: MODEL_VERSION,
    is_active: true,
    is_research_only: true,
    clinical_use: false,
  }];
  mockPool.query.mockImplementation(async (sql, values = []) => {
    if (sql.includes("FROM tbl_screenings")) {
      return { rows: mockScreeningRows };
    }
    if (sql.includes("FROM tbl_screening_photos")) return { rows: mockPhotoRows };
    if (sql.includes("FROM tbl_audit_logs") && sql.includes("PHOTO_UPLOADED")) {
      return {
        rows: mockPhotoRows.map((photo) => ({
          photo_id: photo.id,
          image_category: "MOUTH",
        })),
      };
    }
    if (sql.includes("FROM mst_ai_models")) {
      const rows = mockModelRows.filter((model) => (
        model.provider === values[0]
        && model.model_version === values[1]
        && model.is_active === true
        && model.is_research_only === true
        && model.clinical_use === false
      ));
      return { rows };
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  });
  let inserted = 0;
  mockClient.query.mockImplementation(async (sql, values) => {
    if (sql.includes("FROM tbl_screenings")) {
      return { rows: mockScreeningRows };
    }
    if (sql.includes("FROM tbl_screening_photos")) {
      return { rows: mockPhotoRows.map(({ id, view }) => ({ id, view })) };
    }
    if (sql.includes("FROM tbl_ai_assessments")) {
      return {
        rows: Object.entries(mockAttemptByPhoto).map(([photo_id, attempt_no]) => ({ photo_id, attempt_no })),
      };
    }
    if (sql.includes("INSERT INTO tbl_ai_assessments")) {
      inserted += 1;
      mockAttemptByPhoto[values[1]] = values[3];
      return {
        rows: [{
          id: `assessment-${inserted}`,
          photo_id: values[1],
          status: "COMPLETED",
          result_label: values[4],
        }],
      };
    }
    return { rows: [] };
  });
  mockDownloadBuffer.mockImplementation(async (objectKey) => Buffer.from(`synthetic-original:${objectKey}`));
  mockWithTransaction.mockImplementation(async (_pool, callback) => callback(mockClient));
  mockPipeline();
});

afterEach(() => {
  delete global.fetch;
});

test("analyzes and stores exactly the three owned, consented original views", async () => {
  const result = await analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID);

  expect(result.views.map((view) => view.view)).toEqual(VIEWS);
  expect(result.views.map((view) => view.classification)).toEqual(Array(3).fill("ABNORMAL"));
  expect(result.assessments).toHaveLength(3);
  expect(mockRequireConsent).toHaveBeenCalledWith(mockPool, PATIENT_ID, "IMAGE_CAPTURE");
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual([
    "Bearer test-internal-pipeline-auth-token-123456",
    "Bearer test-internal-pipeline-auth-token-123456",
  ]);
  expect(mockDownloadBuffer.mock.calls.map(([objectKey]) => objectKey)).toEqual([
    "front_view.jpg",
    "left_view.jpg",
    "right_view.jpg",
  ]);
  const analysisRequest = global.fetch.mock.calls[1][1];
  expect(analysisRequest.body.get("screening_reference")).toBe(SCREENING_ID);
  expect(VIEWS.map((view) => analysisRequest.body.get(view.toLowerCase().replace("_view", "")).name))
    .toEqual(["front_view.jpg", "left_view.jpg", "right_view.jpg"]);
  const uploadedPhotoContents = await Promise.all(
    VIEWS.map(async (view) => {
      const field = view.toLowerCase().replace("_view", "");
      return Buffer.from(await analysisRequest.body.get(field).arrayBuffer()).toString("utf8");
    })
  );
  expect(uploadedPhotoContents).toEqual([
    "synthetic-original:front_view.jpg",
    "synthetic-original:left_view.jpg",
    "synthetic-original:right_view.jpg",
  ]);
  expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))).toHaveLength(3);
  expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessment_logs"))).toHaveLength(3);

  const assessmentInserts = mockClient.query.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"));
  expect(assessmentInserts).toHaveLength(3);
  assessmentInserts.forEach(([, values]) => {
    expect(values[2]).toBe(3);
    expect(values[3]).toBe(1);
  });

  const savedAssessments = mockClient.query.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))
    .map(([, values]) => ({ photoId: values[1], resultLabel: values[4], details: JSON.parse(values[7]) }));
  expect(savedAssessments.map((entry) => entry.photoId)).toEqual(VIEWS.map((view) => `photo-${view}`));
  expect(savedAssessments.map((entry) => entry.details.view)).toEqual(VIEWS);
  expect(savedAssessments.map((entry) => entry.resultLabel)).toEqual(Array(3).fill("SUSPICIOUS_FOR_CLINICAL_REVIEW"));
  savedAssessments.forEach(({ details }) => {
    expect(details.confidence_meaning).toContain("not a disease probability");
    expect(details.review_status).toBe("PENDING_MEDICAL_OFFICER_REVIEW");
  });
  const initialOwnershipQuery = mockPool.query.mock.calls.find(([sql]) => sql.includes("FROM tbl_screenings"))[0];
  expect(initialOwnershipQuery).toContain("s.examiner_id = $2");
  expect(initialOwnershipQuery).toContain("fn_user_has_patient_access");
});

test("each retry increments per-photo attempt numbers without replacing prior assessments", async () => {
  await analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID);
  const firstRunCalls = mockClient.query.mock.calls.slice();
  await analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID);

  const assessmentInserts = mockClient.query.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"));
  expect(assessmentInserts).toHaveLength(6);
  expect(assessmentInserts.map(([, values]) => values[3])).toEqual([1, 1, 1, 2, 2, 2]);
  expect(mockClient.query.mock.calls.some(([sql]) => /\bUPDATE\s+tbl_ai_assessments|\bDELETE\s+FROM\s+tbl_ai_assessments/i.test(sql))).toBe(false);

  const lockIndex = firstRunCalls.findIndex(([sql]) => sql.includes("FROM tbl_screenings") && sql.includes("FOR UPDATE"));
  const attemptIndex = firstRunCalls.findIndex(([sql]) => sql.includes("MAX(attempt_no)"));
  const insertIndex = firstRunCalls.findIndex(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"));
  expect(lockIndex).toBeGreaterThanOrEqual(0);
  expect(attemptIndex).toBeGreaterThan(lockIndex);
  expect(insertIndex).toBeGreaterThan(attemptIndex);
});

test("concurrent analysis retries receive distinct per-photo attempt numbers", async () => {
  let transactionTail = Promise.resolve();
  mockWithTransaction.mockImplementation(async (_pool, callback) => {
    const previousTransaction = transactionTail;
    let releaseTransaction;
    transactionTail = new Promise((resolve) => { releaseTransaction = resolve; });
    await previousTransaction;
    try {
      return await callback(mockClient);
    } finally {
      releaseTransaction();
    }
  });

  await Promise.all([
    analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID),
    analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID),
  ]);

  const assessmentInserts = mockClient.query.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"));
  expect(assessmentInserts).toHaveLength(6);
  expect(assessmentInserts.map(([, values]) => values[3]).sort()).toEqual([1, 1, 1, 2, 2, 2]);
  expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes("FROM tbl_screenings") && sql.includes("FOR UPDATE")))
    .toHaveLength(2);
});

test("matches the exact provider and model version with the required registry flags", async () => {
  await analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID);

  const registryQuery = mockPool.query.mock.calls.find(([sql]) => sql.includes("FROM mst_ai_models"));
  expect(registryQuery[0]).toMatch(/provider = \$1 AND model_version = \$2/);
  expect(registryQuery[0]).toMatch(/is_active = TRUE AND is_research_only = TRUE AND clinical_use = FALSE/);
  expect(registryQuery[1]).toEqual(["ollama-cloud", "gemma4:31b-cloud"]);
  expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))).toHaveLength(3);
});

test.each([
  ["inactive model", { is_active: false }],
  ["non-research model", { is_research_only: false }],
  ["clinical-use model", { clinical_use: true }],
])("does not select a registry model marked as %s", async (_label, flag) => {
  mockModelRows = [{ ...mockModelRows[0], ...flag }];

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
  expect(mockClient.query).not.toHaveBeenCalled();
});

test("does not match a different registry model version", async () => {
  mockModelRows = [{ ...mockModelRows[0], model_version: "gemma4:cloud" }];

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
  const registryQuery = mockPool.query.mock.calls.find(([sql]) => sql.includes("FROM mst_ai_models"));
  expect(registryQuery[1]).toEqual(["ollama-cloud", "gemma4:31b-cloud"]);
  expect(mockClient.query).not.toHaveBeenCalled();
});

const invalidAnalysisCases = [
  ["missing analysis", (payload) => { delete payload.analysis; }],
  ["invalid screening reference", (payload) => { payload.analysis.screening_reference = "wrong-screening"; }],
  ["invalid review status", (payload) => { payload.analysis.review_status = "APPROVED"; }],
  ...VIEWS.map((view) => [
    `missing ${view}`,
    (payload) => { payload.analysis.views = payload.analysis.views.filter((result) => result.view !== view); },
  ]),
  ["duplicate view", (payload) => {
    payload.analysis.views = [makeView("FRONT_VIEW"), makeView("FRONT_VIEW"), makeView("RIGHT_VIEW")];
  }],
  ["missing confidence", (payload) => { delete payload.analysis.views[0].model_confidence; }],
  ["decimal confidence", (payload) => { payload.analysis.views[0].model_confidence = 0.5; }],
  ["string confidence", (payload) => { payload.analysis.views[0].model_confidence = "50"; }],
  ["percentage confidence", (payload) => { payload.analysis.views[0].model_confidence = "50%"; }],
  ["confidence below zero", (payload) => { payload.analysis.views[0].model_confidence = -1; }],
  ["confidence above one hundred", (payload) => { payload.analysis.views[0].model_confidence = 101; }],
  ["invalid model status", (payload) => { payload.analysis.views[0].model_status = "DIAGNOSED"; }],
  ["invalid finding scale", (payload) => {
    payload.analysis.views[0].possible_visual_findings = [
      { feature: "VISIBLE_REDNESS", scale: "severe", note: null },
    ];
  }],
  ["invalid selected category", (payload) => { payload.analysis.views[0].selected_category = "EYE"; }],
  ["visual health score above one hundred", (payload) => {
    payload.analysis.views[0].visual_health_assessment_score = 101;
  }],
  ["visual health score decimal", (payload) => {
    payload.analysis.views[0].visual_health_assessment_score = 87.5;
  }],
  ["visual health score string", (payload) => {
    payload.analysis.views[0].visual_health_assessment_score = "87";
  }],
];

test("accepts structured findings and NOT_ASSESSABLE views", async () => {
  mockPipelinePayload = makeAnalysisPayload();
  mockPipelinePayload.analysis.views = [
    makeView("FRONT_VIEW"),
    makeView("LEFT_VIEW", {
      classification: "UNCERTAIN",
      model_status: "NOT_ASSESSABLE",
      model_confidence: null,
      observation_confidence: null,
      possible_visual_findings: [],
      visual_health_assessment_score: null,
      visual_health_assessment_score_message:
        "Score Not Available – insufficient usable visual findings.",
      visual_health_assessment_score_reasons: [],
      not_assessable_reason: "Image too dark",
      observations: ["Image too dark"],
      abnormalities: [],
      uncertainty_warnings: ["MODEL_RESULT_UNCERTAIN", "CLINICIAN_REVIEW_REQUIRED"],
    }),
    makeView("RIGHT_VIEW", {
      classification: "NORMAL",
      model_status: "OK",
      possible_visual_findings: [
        { feature: "VISIBLE_REDNESS", scale: "0", note: null },
        { feature: "POSSIBLE_SWELLING", scale: "0", note: null },
        { feature: "WHITE_OR_RED_PATCHES", scale: "0", note: null },
        { feature: "VISIBLE_ULCERS", scale: "0", note: null },
        { feature: "GUM_APPEARANCE_CHANGES", scale: "0", note: null },
      ],
      visual_health_assessment_score: 100,
      visual_health_assessment_score_reasons: [],
      observations: ["No listed visual features were marked as present."],
      abnormalities: [],
    }),
  ];

  const result = await analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID);
  expect(result.views.map((view) => view.model_status)).toEqual(["OK", "NOT_ASSESSABLE", "OK"]);
  expect(result.views[0].possible_visual_findings).toHaveLength(5);
  expect(result.assessments).toHaveLength(3);

  const assessmentInserts = mockClient.query.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"));
  // score column = visual_health_assessment_score / 100 (not model confidence)
  expect(assessmentInserts.map(([, values]) => values[6])).toEqual([0.87, null, 1]);
});

test.each(invalidAnalysisCases)("rejects an AI response with %s", async (_label, invalidate) => {
  mockPipelinePayload = makeAnalysisPayload();
  invalidate(mockPipelinePayload);

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "AI_PIPELINE_INVALID_RESPONSE" });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))).toBe(false);
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessment_logs"))).toBe(false);
});

test.each([
  ["a non-success HTTP response", { status: 502, body: JSON.stringify({ detail: "Synthetic upstream failure" }) }],
  ["malformed JSON", { status: 200, body: "not-json" }],
  ["an incomplete response", { status: 200, body: JSON.stringify({ status: "success" }) }],
  ["an invalid response structure", { status: 200, body: JSON.stringify([]) }],
])("does not persist results after %s", async (_label, response) => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith("/health")) {
      return new Response(JSON.stringify({
        status: "healthy",
        model_information: {
          provider: "ollama-cloud",
          model_version: MODEL_VERSION,
          model_type: "cloud_vision",
          trained_oral_model: false,
          validation_status: "NOT_VALIDATED",
        },
      }), { status: 200 });
    }
    return new Response(response.body, { status: response.status });
  });

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toBeDefined();
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))).toBe(false);
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessment_logs"))).toBe(false);
});

test("does not contact the AI service without current photo consent", async () => {
  mockRequireConsent.mockRejectedValueOnce(Object.assign(new Error("Consent required"), { status: 403 }));

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ status: 403 });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockDownloadBuffer).not.toHaveBeenCalled();
  expect(mockClient.query).not.toHaveBeenCalled();
});

test("requires all three active views before analysis", async () => {
  mockPhotoRows = mockPhotoRows.filter((photo) => photo.view !== "RIGHT_VIEW");

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "PHOTOS_REQUIRED" });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("rejects duplicate uploaded photo views before analysis", async () => {
  mockPhotoRows = [
    mockPhotoRows[0],
    mockPhotoRows[1],
    { ...mockPhotoRows[2], view: "LEFT_VIEW" },
  ];

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "PHOTOS_REQUIRED" });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("rechecks screening ownership and case state before analysis", async () => {
  mockScreeningRows = [];
  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ status: 404 });
  expect(global.fetch).not.toHaveBeenCalled();

  mockScreeningRows = [{ id: SCREENING_ID, patient_id: PATIENT_ID, case_state: "AWAITING_CLINICIAN" }];
  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ status: 409 });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("does not persist results if the original photos change during analysis", async () => {
  changePhotosBeforePersistence = true;
  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "PHOTOS_CHANGED" });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessments"))).toBe(false);
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_ai_assessment_logs"))).toBe(false);
});

test("requires an active non-clinical model registry entry", async () => {
  mockModelRows = [];

  await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
    .rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(mockClient.query).not.toHaveBeenCalled();
});

test("reports the shared pipeline-token requirement before making a request", async () => {
  const originalToken = config.aiPipeline.authToken;
  config.aiPipeline.authToken = "";
  try {
    await expect(analyzeScreening(USER_ID, { user: { id: USER_ID } }, SCREENING_ID))
      .rejects.toMatchObject({
        status: 503,
        message: "AI_PIPELINE_AUTH_TOKEN must be set to the same value (at least 32 characters) in the backend and Python service.",
      });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    config.aiPipeline.authToken = originalToken;
  }
});
