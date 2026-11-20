const mockPool = { query: jest.fn() };
const mockClient = { query: jest.fn() };
const mockAudit = jest.fn(async () => {});
const mockRequireActiveClaim = jest.fn(async () => ({ claimed_at: "2026-11-08T09:00:00Z" }));
const mockRequireConsent = jest.fn(async () => {});
const mockHasConsent = jest.fn(async () => true);
const mockSetActor = jest.fn(async () => {});
const mockWithTransaction = jest.fn(async (_pool, callback) => callback(mockClient));
const mockImageData = new Map();

jest.mock("../../db", () => mockPool);
jest.mock("../../utils/audit", () => ({ audit: (...args) => mockAudit(...args) }));
jest.mock("../../services/medicalOfficer/scope", () => ({
  hasConsent: (...args) => mockHasConsent(...args),
  requireActiveClaim: (...args) => mockRequireActiveClaim(...args),
  requireConsent: (...args) => mockRequireConsent(...args),
  requireUuid: jest.fn(),
  setActor: (...args) => mockSetActor(...args),
  withTransaction: (...args) => mockWithTransaction(...args),
}));
jest.mock("../../services/privateImageStorage", () => ({
  localFilePath: (key) => `C:\\private\\${key.replace(/\//g, "\\")}`,
  downloadBuffer: jest.fn(async (key) => {
    if (!mockImageData.has(key)) throw Object.assign(new Error("Missing synthetic image"), { code: "IMAGE_FILE_MISSING" });
    return Buffer.from(mockImageData.get(key));
  }),
  getFile: jest.fn(async (key) => ({ data: Buffer.from(mockImageData.get(key)) })),
  objectExists: jest.fn(async () => false),
}));

const { analyzeScreening } = require("../../services/aiAnalysisService");
const reviewService = require("../../services/medicalOfficer/reviewService");
const imageService = require("../../services/medicalOfficer/imageService");

const HEALTH_WORKER_ID = "11111111-1111-4111-8111-111111111111";
const MEDICAL_OFFICER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const SCREENING_ID = "33333333-3333-4333-8333-333333333333";
const MODEL_ID = 3;
const MODEL_VERSION = "@cf/meta/llama-3.2-11b-vision-instruct";
const VIEWS = ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"];
const originalImages = new Map(VIEWS.map((view) => [
  view,
  Buffer.from([0xff, 0xd8, 0xff, 0x00, ...Buffer.from(`synthetic-${view}`), 0xff, 0xd9]),
]));
const photoRows = VIEWS.map((view) => ({
  id: `photo-${view}`,
  screening_id: SCREENING_ID,
  view,
  annotation_site: view,
  private_key: `${view.toLowerCase()}.jpg`,
  mime_type: "image/jpeg",
  size_bytes: originalImages.get(view).length,
  width_px: 1200,
  height_px: 900,
  metadata_stripped: true,
  status: "ACCEPTED",
  captured_at: "2026-11-08T08:00:00Z",
  screening_date: "2026-11-08",
}));
const screening = {
  id: SCREENING_ID,
  patient_id: PATIENT_ID,
  case_state: "SCREENED",
  screening_date: "2026-11-08",
  chief_complaint: "Synthetic complaint",
  clinical_exam_done: true,
  submitted_at: "2026-11-08T08:30:00Z",
  facility_id: 1,
};

let savedAssessments;
let savedInsertValues;

function makeAnalysisView(view) {
  return {
    view,
    screening_reference: SCREENING_ID,
    analysis_status: "FAILED",
    analyzed_at: "2026-11-19T10:00:00.000Z",
    error_code: "MODEL_NOT_ASSESSABLE",
    selected_category: "MOUTH",
    model_status: "NOT_ASSESSABLE",
    classification: "UNCERTAIN",
    model_confidence: null,
    confidence_meaning: "Model confidence only; it is not a disease probability.",
    observations: [],
    abnormalities: [],
    possible_visual_findings: [],
    recommendation: "A Medical Officer must review the original images and clinical findings.",
    image_quality: { status: "ACCEPTABLE", warnings: [], metrics: { width: 1200, height: 900 } },
    model_information: {
      provider: "cloudflare-workers-ai",
      model_version: MODEL_VERSION,
      trained_oral_model: false,
      validation_status: "NOT_VALIDATED",
      provider_request_started: true,
      provider_request_success: true,
      provider_response_received: true,
      provider_http_status: 200,
      provider_response_validated: true,
      inference_performed: true,
      model_output_usable: false,
      error_code: "MODEL_NOT_ASSESSABLE",
    },
    uncertainty_warnings: ["CLINICIAN_REVIEW_REQUIRED"],
    review_status: "PENDING_MEDICAL_OFFICER_REVIEW",
  };
}

function assessmentRow(values, index) {
  return {
    id: `assessment-${index + 1}`,
    screening_id: values[0],
    photo_id: values[1],
    ai_model_id: values[2],
    status: values[4],
    result_label: values[5],
    image_quality_status: values[6],
    analysis_details: JSON.parse(values[7]),
    requested_by: values[8],
    model_provider: "cloudflare-workers-ai",
    model_version: MODEL_VERSION,
    warning: null,
    completed_at: "2026-11-08T08:31:00Z",
    requested_at: `2026-11-08T08:31:0${index}Z`,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  savedAssessments = [];
  savedInsertValues = [];
  mockImageData.clear();
  photoRows.forEach((photo) => mockImageData.set(photo.private_key, originalImages.get(photo.view)));

  mockPool.query.mockImplementation(async (sql) => {
    if (sql.includes("s.examiner_id = $2")) return { rows: [screening] };
    if (sql.includes("SELECT id, annotation_site AS view")) {
      return { rows: photoRows.map(({ id, view, private_key, mime_type, size_bytes }) => ({
        id,
        view,
        private_key,
        mime_type,
        size_bytes,
      })) };
    }
    if (sql.includes("SELECT id, private_key, mime_type")) {
      const photo = photoRows.find((row) => row.id === "photo-FRONT_VIEW");
      return { rows: [{ id: photo.id, private_key: photo.private_key, mime_type: photo.mime_type }] };
    }
    if (sql.includes("FROM tbl_screening_photos ph")) {
      return { rows: photoRows.map(({ private_key, ...photo }) => ({
        ...photo,
        ai_result_label: "IMAGE_INSUFFICIENT",
        ai_status: "COMPLETED",
        ai_warning: null,
        ai_score: null,
        ai_model_provider: "cloudflare-workers-ai",
        ai_model_version: MODEL_VERSION,
        ai_analysis_details: savedAssessments.find((assessment) => assessment.photo_id === photo.id)?.analysis_details,
      })) };
    }
    if (sql.includes("FROM mst_ai_models")) {
      return {
        rows: [{
          id: MODEL_ID,
          provider: "cloudflare-workers-ai",
          model_version: MODEL_VERSION,
          is_active: true,
          is_research_only: true,
          clinical_use: false,
        }],
      };
    }
    if (sql.includes("FROM tbl_patients p")) {
      return { rows: [{ id: PATIENT_ID, patient_code: "SYNTHETIC-001", full_name: "Synthetic Patient" }] };
    }
    if (sql.includes("JOIN mst_consent_purposes cp")) return { rows: [] };
    if (sql.includes("FROM tbl_screenings")) return { rows: [screening] };
    if (sql.includes("FROM tbl_screening_findings")) return { rows: [] };
    if (sql.includes("FROM tbl_patient_medical_histories")) return { rows: [] };
    if (sql.includes("FROM tbl_ai_assessments")) return { rows: savedAssessments };
    if (sql.includes("FROM tbl_clinical_reviews")) return { rows: [] };
    if (sql.includes("FROM vw_patient_timeline")) return { rows: [] };
    if (sql.includes("FROM tbl_audit_logs") && sql.includes("PHOTO_UPLOADED")) {
      return {
        rows: photoRows.map((photo) => ({
          photo_id: photo.id,
          image_category: "MOUTH",
        })),
      };
    }
    throw new Error(`Unexpected synthetic workflow pool query: ${sql}`);
  });

  mockClient.query.mockImplementation(async (sql, values = []) => {
    if (sql.includes("s.examiner_id = $2")) return { rows: [screening] };
    if (sql.includes("SELECT id, annotation_site AS view")) {
      return { rows: photoRows.map(({ id, view }) => ({ id, view })) };
    }
    if (sql.includes("INSERT INTO tbl_ai_assessments")) {
      savedInsertValues.push(values);
      const row = assessmentRow(values, savedAssessments.length);
      savedAssessments.push(row);
      return { rows: [row] };
    }
    return { rows: [] };
  });

  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith("/health")) {
      return new Response(JSON.stringify({
        status: "healthy",
        model_information: {
          provider: "cloudflare-workers-ai",
          model_version: MODEL_VERSION,
          validation_status: "NOT_VALIDATED",
          model_type: "cloud_vision",
          trained_oral_model: false,
          validation_status: "NOT_VALIDATED",
        },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: "success",
      analysis: {
        screening_reference: SCREENING_ID,
        model_information: {
          provider: "cloudflare-workers-ai",
          model_version: MODEL_VERSION,
          validation_status: "NOT_VALIDATED",
        },
        views: VIEWS.map(makeAnalysisView),
        review_status: "PENDING_MEDICAL_OFFICER_REVIEW",
        disclaimer: "Preliminary visual screening support only; not a diagnosis.",
      },
    }), { status: 200 });
  });

});

afterEach(() => {
  delete global.fetch;
});

test("completes synthetic three-view analysis and makes advisory results and originals available to an MO", async () => {
  const analysis = await analyzeScreening(
    HEALTH_WORKER_ID,
    { user: { id: HEALTH_WORKER_ID } },
    SCREENING_ID
  );

  expect(analysis.views.map((result) => result.view)).toEqual(VIEWS);
  expect(savedAssessments).toHaveLength(3);
  expect(savedInsertValues).toHaveLength(3);
  savedInsertValues.forEach((values, index) => {
    expect(values[2]).toBe(MODEL_ID);
    expect(JSON.parse(values[7]).view).toBe(VIEWS[index]);
  });
  expect(analysis.disclaimer).toMatch(/not a diagnosis/i);
  expect(analysis.views.every((result) => result.review_status === "PENDING_MEDICAL_OFFICER_REVIEW")).toBe(true);

  const context = await reviewService.getCaseContext(
    MEDICAL_OFFICER_ID,
    { user: { id: MEDICAL_OFFICER_ID }, ip: "127.0.0.1" },
    PATIENT_ID
  );
  expect(mockRequireActiveClaim).toHaveBeenLastCalledWith(
    mockPool,
    MEDICAL_OFFICER_ID,
    PATIENT_ID
  );
  expect(context.ai_results).toHaveLength(3);
  expect(context.ai_results.map((result) => result.analysis_details.view).sort()).toEqual([...VIEWS].sort());
  expect(context.ai_results.every((result) => (
    result.analysis_details.disclaimer.toLowerCase().includes("not a diagnosis")
    && result.analysis_details.review_status === "PENDING_MEDICAL_OFFICER_REVIEW"
  ))).toBe(true);
  const latestCaseAssessmentQuery = mockPool.query.mock.calls
    .find(([sql]) => sql.includes("DISTINCT ON (photo_id)"));
  expect(latestCaseAssessmentQuery[0]).toMatch(
    /ORDER BY photo_id, requested_at DESC, attempt_no DESC, id DESC/
  );

  const listedImages = await imageService.listImages(
    MEDICAL_OFFICER_ID,
    { user: { id: MEDICAL_OFFICER_ID } },
    PATIENT_ID
  );
  expect(listedImages).toHaveLength(3);
  const latestImageAssessmentQuery = mockPool.query.mock.calls
    .find(([sql]) => sql.includes("LEFT JOIN LATERAL") && sql.includes("FROM tbl_ai_assessments a"));
  expect(latestImageAssessmentQuery[0]).toMatch(
    /ORDER BY a\.requested_at DESC, a\.attempt_no DESC, a\.id DESC/
  );
  expect(JSON.stringify(listedImages)).not.toContain("private_key");
  const originalPhoto = await imageService.getImageFile(
    MEDICAL_OFFICER_ID,
    { user: { id: MEDICAL_OFFICER_ID }, ip: "127.0.0.1" },
    PATIENT_ID,
    "photo-FRONT_VIEW"
  );
  const originalBytesBefore = originalImages.get("FRONT_VIEW");
  const originalBytesAfter = originalPhoto.data;
  expect(originalBytesAfter).toEqual(originalBytesBefore);
  const imageStorage = require("../../services/privateImageStorage");
  expect(imageStorage.downloadBuffer).toHaveBeenCalledTimes(3);
  expect(imageStorage.getFile).toHaveBeenCalledWith("front_view.jpg");
});
