import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import MoDashboard from "./MoDashboard";
import MandalPatients from "./MandalPatients";
import ClinicalReview from "./ClinicalReview";
import ImageReview from "./ImageReview";
import ClinicalNotes from "./ClinicalNotes";
import Referrals from "./Referrals";
import FollowUps from "./FollowUps";
import MoReports from "./MoReports";
import MoProfile from "./MoProfile";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "mo-1", full_name: "Dr Ravi", role: "MEDICAL_OFFICER" } }),
}));

const PATIENT = "11111111-1111-4111-8111-111111111111";
const OTHER_PATIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mine = [{ id: PATIENT, patient_code: "AD-2026-000001", village_name: "Addulu", village_name_te: null }];

const caseData = {
  claim: { claimed_at: "2026-11-06T10:00:00Z" },
  patient: { id: PATIENT, patient_code: "AD-2026-000001", full_name: "Lakshmi", sex: "FEMALE", age_years: 45,
    village_name: "Addulu", mandal_name: "G. Madugula", facility_name: "PHC G. Madugula", registered_at: "2026-11-01T10:00:00Z" },
  consent: { screening: true, image_capture: true, history: [] },
  screening: { id: "s-1", screening_date: "2026-11-02", case_state: "AWAITING_CLINICIAN", chief_complaint: "Ulcer", clinical_exam_done: true, tobacco_current: true },
  screening_hidden: false,
  findings: [
    { id: "finding-symptom", finding_kind: "SYMPTOM", symptom_name: "Burning", duration_days: 4 },
    { id: "finding-oral", finding_kind: "OBSERVATION", oral_site: "CHEEK_LINING", description: "White area" },
  ],
  histories: [{
    history_kind: "EXPOSURE", exposure_name: "Smokeless tobacco", is_current: false,
    frequency_per_day: 3, duration_years: 8, event_date: "2020-05-01",
  }],
  ai_results: [{
    id: "ai-1", status: "COMPLETED", result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW",
    analysis_details: { view: "FRONT_VIEW", classification: "ABNORMAL" },
  }],
  review: null,
  timeline: [{ event_type: "SCREENING", event_time: "2026-11-02T10:00:00Z" }],
};

function renderAt(element, path = "/page") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/page" element={element} />
        <Route path="/medical-officer/notes" element={<p>Sign-off page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockGet(map) {
  api.get.mockImplementation((url, config) => {
    const key = config?.params?.view ? `${url}?view=${config.params.view}` : url;
    if (map[key] instanceof Error) return Promise.reject(map[key]);
    if (map[key] !== undefined) return Promise.resolve({ data: map[key] });
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
});

test("dashboard shows the real API numbers and the assigned Mandals", async () => {
  mockGet({
    "/medical-officer/dashboard": {
      dashboard: {
        assigned_mandals: [{ id: 2, name_en: "G. Madugula" }],
        totals: { total_patients: 12, pending_screenings: 4, my_claimed_cases: 2, pending_reviews: 1, referrals: 3, open_followups: 2, overdue_followups: 1 },
        case_states: [{ state: "AWAITING_CLINICIAN", count: 4 }],
        weekly: [{ week: "2026-11-02", screenings: 4, signed_reviews: 1 }],
        by_mandal: [{ id: 2, name_en: "G. Madugula", patients: 12, awaiting_review: 4 }],
        referrals_by_status: { PLANNED: 3 },
        followups: { open: 2, overdue: 1, closed: 0 },
        recent_activity: [{ id: 1, event: "CLINICAL_REVIEW_SIGNED", occurred_at: "2026-11-06T10:00:00Z" }],
      },
    },
  });
  renderAt(<MoDashboard />);

  expect(await screen.findByText("Welcome, Dr Ravi")).toBeInTheDocument();
  expect(screen.getAllByText("G. Madugula").length).toBeGreaterThan(0);
  expect(screen.getAllByText("12").length).toBeGreaterThan(0);
  expect(screen.getByText("1 overdue")).toBeInTheDocument();
  expect(screen.getByText("Clinical review signed")).toBeInTheDocument();
});

test("Mandal patients hide names until claimed and claim after confirmation", async () => {
  mockGet({
    "/medical-officer/patients/villages": { villages: [] },
    "/medical-officer/patients": {
      patients: [
        { id: PATIENT, patient_code: "AD-2026-000001", full_name: null, sex: "FEMALE", age_years: 45, screening_consent_active: true, village_name: "Addulu",
          mandal_name: "G. Madugula", facility_name: "PHC", registered_at: "2026-11-01T10:00:00Z", case_state: "AWAITING_CLINICIAN", claim_status: "NONE" },
      ],
      pagination: { page: 1, total: 1, total_pages: 1 },
    },
  });
  api.post.mockResolvedValue({ data: { success: true } });
  renderAt(<MandalPatients />);

  expect(await screen.findByText("Name hidden until claimed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Claim case" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/medical-officer/patients/${PATIENT}/claim`));
  expect(window.confirm).toHaveBeenCalled();
});

test("Mandal patients hide names, demographics and case status without current screening consent", async () => {
  mockGet({
    "/medical-officer/patients/villages": { villages: [] },
    "/medical-officer/patients": {
      patients: [
        { id: PATIENT, patient_code: "AD-2026-000001", full_name: "Private Patient", sex: "FEMALE", age_years: 45,
          screening_consent_active: false, village_name: "Addulu", mandal_name: "G. Madugula",
          facility_name: "PHC", case_state: null, claim_status: "MINE" },
      ],
      pagination: { page: 1, total: 1, total_pages: 1 },
    },
  });
  renderAt(<MandalPatients />);

  expect(await screen.findByText("AD-2026-000001")).toBeInTheDocument();
  const patientRow = screen.getByRole("row", { name: /AD-2026-000001/ });
  expect(within(patientRow).getAllByText("Hidden: no current screening consent")).toHaveLength(2);
  expect(within(patientRow).queryByText("Private Patient")).not.toBeInTheDocument();
  expect(within(patientRow).queryByText("45 · Female")).not.toBeInTheDocument();
  expect(within(patientRow).queryByText("Awaiting doctor review")).not.toBeInTheDocument();
});

test("Mandal patient list surfaces a village-filter API failure without hiding the patient list", async () => {
  const villagesError = Object.assign(new Error("request failed"), {
    response: { status: 503, data: { message: "Village service unavailable" } },
  });
  mockGet({
    "/medical-officer/patients/villages": villagesError,
    "/medical-officer/patients": { patients: [], pagination: { page: 1, total: 0, total_pages: 0 } },
  });
  renderAt(<MandalPatients />);

  expect(await screen.findByText("Village service unavailable")).toBeInTheDocument();
  expect(await screen.findByText("No patients found.")).toBeInTheDocument();
});

test("clinical review loads the claimed case, shows the AI warning and saves a draft", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: { case: caseData },
  });
  api.put.mockResolvedValue({ data: { review: { id: "r-1", version: 1 } } });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText("Lakshmi")).toBeInTheDocument();
  expect(screen.getAllByText(/NOT FOR CLINICAL USE/).length).toBeGreaterThan(0);
  expect(screen.getByText("Symptoms")).toBeInTheDocument();
  expect(screen.getByText("Oral examination findings")).toBeInTheDocument();
  expect(screen.getByText("Burning")).toBeInTheDocument();
  expect(screen.getByText(/Cheek lining · White area/)).toBeInTheDocument();
  expect(screen.getByText(/Past · 3 times per day · 8 years/)).toBeInTheDocument();
  expect(screen.getByText("Current tobacco use")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Front view · Potential visible finding reported/ })).toBeInTheDocument();
  expect(screen.getByText("AI Review Completed")).toBeInTheDocument();
  expect(screen.getByText(/AI results are optional supporting information/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Clinical finding/), { target: { value: "White patch on cheek" } });
  fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/review`,
    expect.objectContaining({ finding: "White patch on cheek", ai_agreement: "NOT_AVAILABLE" })
  ));
});

test("clinical review continues and saves a draft when AI review was not performed", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: {
      case: { ...caseData, ai_results: [] },
    },
  });
  api.put.mockResolvedValue({ data: { review: { id: "r-1", version: 1 } } });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText("AI Review Not Performed")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Clinical finding/), { target: { value: "Independent finding" } });
  fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/review`,
    expect.objectContaining({ finding: "Independent finding", ai_agreement: "NOT_AVAILABLE", ai_assessment_id: null })
  ));
});

test("a returned recapture case can be reviewed and signed as a new version", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: {
      case: {
        ...caseData,
        screening: { ...caseData.screening, case_state: "AWAITING_CLINICIAN" },
        review: {
          id: "review-1",
          decision: "REQUEST_RECAPTURE",
          signed_at: "2026-11-05T10:00:00Z",
          version: 3,
        },
      },
    },
  });
  api.post.mockResolvedValue({ data: { review: { id: "review-1", version: 4, case_state: "REVIEWED" } } });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText(/resubmitted after recapture/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Reason for the amendment/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Reason for the amendment/), {
    target: { value: "Reviewed the newly submitted photo" },
  });
  fireEvent.change(screen.getByLabelText(/Clinical decision/), { target: { value: "NO_ACTION" } });
  fireEvent.change(screen.getByLabelText(/Clinical finding/), {
    target: { value: "The new photo shows no concerning lesion" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign re-review" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/medical-officer/reviews/review-1/amend`,
    expect.objectContaining({
      version: 3,
      amendment_reason: "Reviewed the newly submitted photo",
      decision: "NO_ACTION",
      ai_assessment_id: null,
      ai_agreement: "NOT_AVAILABLE",
    })
  ));
});

test("a returned REQUEST_MORE_INFO case uses a signed amendment for its re-review", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: {
      case: {
        ...caseData,
        screening: { ...caseData.screening, case_state: "AWAITING_CLINICIAN" },
        review: {
          id: "review-more-info",
          decision: "REQUEST_MORE_INFO",
          request_note: "Add the symptom duration",
          finding: "Original finding",
          ai_agreement: "NOT_AVAILABLE",
          signed_at: "2026-11-05T10:00:00Z",
          version: 3,
        },
      },
    },
  });
  api.post.mockResolvedValue({ data: { review: { id: "review-more-info", version: 4, case_state: "REVIEWED" } } });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText(/resubmitted the requested information/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Reason for the amendment/), {
    target: { value: "Reviewed the added symptom duration" },
  });
  fireEvent.change(screen.getByLabelText(/Clinical decision/), { target: { value: "NO_ACTION" } });
  fireEvent.change(screen.getByLabelText(/Clinical finding/), {
    target: { value: "Updated clinical finding" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign re-review" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/medical-officer/reviews/review-more-info/amend",
    expect.objectContaining({
      version: 3,
      amendment_reason: "Reviewed the added symptom duration",
      decision: "NO_ACTION",
      finding: "Updated clinical finding",
    })
  ));
});

test.each([
  ["FAILED", "AI Review Failed"],
  ["UNAVAILABLE", "AI Review Unavailable"],
])("clinical review clearly labels an AI result with status %s", async (status, label) => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: {
      case: { ...caseData, ai_results: [{ id: "ai-result", status, result_label: null }] },
    },
  });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText(label)).toBeInTheDocument();
});

test("clinical review explains when the patient is not claimed", async () => {
  mockGet({ "/medical-officer/cases?view=mine": { cases: [] } });
  renderAt(<ClinicalReview />);
  expect(await screen.findByText("You have no claimed cases")).toBeInTheDocument();
});

test("clinical review hides case details and blocks draft editing without current screening consent", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/case`]: {
      case: {
        ...caseData,
        consent: { screening: false, image_capture: true, history: [] },
        screening_hidden: true,
      },
    },
  });
  renderAt(<ClinicalReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText("Clinical review is unavailable because there is no current screening consent.")).toBeInTheDocument();
  expect(screen.getByText("AD-2026-000001")).toBeInTheDocument();
  expect(screen.queryByText("Lakshmi")).not.toBeInTheDocument();
  expect(screen.queryByText("Ulcer")).not.toBeInTheDocument();
  expect(screen.queryByText("Awaiting doctor review")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Clinical finding/)).not.toBeInTheDocument();
  expect(screen.getByText("AI Review Unavailable because required consent is not available.")).toBeInTheDocument();
  expect(api.put).not.toHaveBeenCalled();
});

test("image review shows the consent error from the server and never builds a public URL", async () => {
  const consentError = Object.assign(new Error("forbidden"), {
    response: { status: 403, data: { message: "The patient has no active IMAGE_CAPTURE consent" } },
  });
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/images`]: consentError,
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);
  expect(await screen.findByText("The patient has no active IMAGE_CAPTURE consent")).toBeInTheDocument();
});

test("image review downloads the file through the authorised API", async () => {
  global.URL.createObjectURL = jest.fn(() => "blob:local-image");
  global.URL.revokeObjectURL = jest.fn();
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/images`]: {
      images: [{ id: "ph-1", screening_id: "screening-1", status: "ACCEPTED", view_type: "TONGUE", size_bytes: 20480, captured_at: "2026-11-02T10:00:00Z", screening_date: "2026-11-02" }],
    },
    [`/medical-officer/patients/${PATIENT}/images/ph-1/file`]: new Blob(["x"], { type: "image/jpeg" }),
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);
  fireEvent.click(await screen.findByRole("button", { name: "View image", exact: true }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/images/ph-1/file`,
    expect.objectContaining({ responseType: "blob", timeout: 180000 })
  ));
  expect(await screen.findByRole("img", { name: "Tongue" })).toHaveAttribute("src", "blob:local-image");
});

test("image comparison keeps Front, Left and Right originals paired with their own enhanced copies", async () => {
  let blobNumber = 0;
  global.URL.createObjectURL = jest.fn(() => `blob:comparison-${blobNumber += 1}`);
  global.URL.revokeObjectURL = jest.fn();
  const front = {
    id: "front-photo", screening_id: "screening-current", annotation_site: "FRONT_VIEW",
    status: "UPLOADED", enhancement_status: "AVAILABLE", width_px: 1200, height_px: 900,
    size_bytes: 2048, captured_at: "2026-11-02T10:00:00Z", screening_date: "2026-11-02",
  };
  const left = {
    ...front, id: "left-photo", annotation_site: "LEFT_VIEW", enhancement_status: "NOT_PERFORMED",
  };
  const right = {
    ...front, id: "right-photo", annotation_site: "RIGHT_VIEW", enhancement_status: "UNAVAILABLE",
  };
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/images`]: { images: [front, left, right] },
    [`/medical-officer/patients/${PATIENT}/images/front-photo/file`]: new Blob(["front-original"]),
    [`/medical-officer/patients/${PATIENT}/images/front-photo/enhanced-file`]: new Blob(["front-enhanced"]),
    [`/medical-officer/patients/${PATIENT}/images/left-photo/file`]: new Blob(["left-original"]),
    [`/medical-officer/patients/${PATIENT}/images/right-photo/file`]: new Blob(["right-original"]),
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText("Enhanced image available")).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: "Original Image" }).length).toBeGreaterThan(0);
  expect(screen.getByText("1200 × 900 pixels")).toBeInTheDocument();
  expect(screen.getByText(
    "AI-enhanced images are for visual assistance only. Enhancement may introduce artificial details. Always refer to the original image for clinical assessment. AI enhancement is not a diagnosis."
  )).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/images/front-photo/enhanced-file`,
    expect.objectContaining({ responseType: "blob", timeout: 180000 })
  );

  fireEvent.click(screen.getByRole("button", { name: "Left view" }));
  expect(await screen.findByText("Enhancement not performed")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/images/left-photo/enhanced-file`,
    expect.objectContaining({ responseType: "blob" })
  );

  fireEvent.click(screen.getByRole("button", { name: "Right view" }));
  expect(await screen.findByText("Enhanced image unavailable")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/images/right-photo/enhanced-file`,
    expect.objectContaining({ responseType: "blob" })
  );
});

test("image comparison reports an unavailable enhanced file and allows retry", async () => {
  global.URL.createObjectURL = jest.fn(() => "blob:comparison-retry");
  global.URL.revokeObjectURL = jest.fn();
  const image = {
    id: "missing-enhanced", screening_id: "screening-current", annotation_site: "FRONT_VIEW",
    status: "UPLOADED", enhancement_status: "AVAILABLE", width_px: 1200, height_px: 900,
    size_bytes: 2048, captured_at: "2026-11-02T10:00:00Z", screening_date: "2026-11-02",
  };
  api.get.mockImplementation((url) => {
    if (url === "/medical-officer/cases") {
      return Promise.resolve({ data: { cases: mine } });
    }
    if (url === `/medical-officer/patients/${PATIENT}/images`) {
      return Promise.resolve({ data: { images: [image] } });
    }
    if (url.endsWith("/enhanced-file")) {
      return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
    }
    if (url.endsWith("/file")) return Promise.resolve({ data: new Blob(["original"]) });
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);

  expect(await screen.findByText("Enhanced image unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
  await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url.endsWith("/enhanced-file"))).toHaveLength(2));
  expect(screen.getByText("Original Image")).toBeInTheDocument();
});

test("image review displays saved AI observations and review metadata", async () => {
  global.URL.createObjectURL = jest.fn(() => "blob:local-image");
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    [`/medical-officer/patients/${PATIENT}/images`]: {
      images: [{
        id: "ai-photo",
        screening_id: "screening-current",
        status: "ACCEPTED",
        annotation_site: "FRONT_VIEW",
        size_bytes: 20480,
        captured_at: "2026-11-02T10:00:00Z",
        screening_date: "2026-11-02",
        ai_result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW",
        ai_analysis_details: {
          classification: "ABNORMAL",
          image_quality: { status: "RECAPTURE", warnings: ["blur"], model_assessment: "POOR" },
          observations: ["A visible area has a different color."],
          uncertainty_warnings: ["CLINICIAN_REVIEW_REQUIRED"],
          recommendation: "A Medical Officer must review the original photos.",
        },
        ai_score: 0.6,
        ai_model_provider: "ollama-cloud",
        ai_model_version: "gemma4:31b-cloud",
      }, {
        id: "past-photo",
        screening_id: "screening-previous",
        status: "ACCEPTED",
        annotation_site: "LEFT_VIEW",
        size_bytes: 1024,
        captured_at: "2025-11-02T10:00:00Z",
        screening_date: "2025-11-02",
      }],
    },
    [`/medical-officer/patients/${PATIENT}/images/ai-photo/file`]: new Blob(["synthetic-original"], { type: "image/jpeg" }),
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);

  expect((await screen.findAllByText("AI supportive information")).length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Selected screening images" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Previous screening images" })).toBeInTheDocument();
  expect(screen.getByText("Potential visible finding reported")).toBeInTheDocument();
  expect(screen.getByText("Image may be blurry.")).toBeInTheDocument();
  expect(screen.getByText((_, element) => element.tagName === "P" && element.textContent.includes("AI image assessment: POOR"))).toBeInTheDocument();
  expect(screen.getByText("A visible area has a different color.")).toBeInTheDocument();
  expect(screen.getByText("Medical Officer review is required.")).toBeInTheDocument();
  expect(screen.getByText("A Medical Officer must review the original photos.")).toBeInTheDocument();
  expect(screen.getByText(/Model confidence \(confidence in the model output; NOT disease probability\): 60\/100/)).toBeInTheDocument();
  expect(screen.getByText("Model: ollama-cloud · gemma4:31b-cloud")).toBeInTheDocument();
  expect(screen.getByText("Review status: Pending Medical Officer review")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View image", exact: true }));
  expect(await screen.findByText("NOT FOR CLINICAL USE. AI output is advisory only and is never a diagnosis.")).toBeInTheDocument();

  const screeningSelect = screen.getByLabelText("Screening");
  fireEvent.change(screeningSelect, { target: { value: "screening-previous" } });
  expect(screeningSelect).toHaveValue("screening-previous");
  expect(screen.getByRole("heading", { name: "Images from other screenings" })).toBeInTheDocument();
});

test("switching claimed patients discards a late image-list response from the previous case", async () => {
  let resolveFirstPatient;
  const firstPatientImages = new Promise((resolve) => { resolveFirstPatient = resolve; });
  api.get.mockImplementation((url, config) => {
    if (url === "/medical-officer/cases" && config?.params?.view === "mine") {
      return Promise.resolve({ data: { cases: [
        ...mine,
        { id: OTHER_PATIENT, patient_code: "AD-2026-000002", village_name: "Kothuru" },
      ] } });
    }
    if (url === `/medical-officer/patients/${PATIENT}/images`) return firstPatientImages;
    if (url === `/medical-officer/patients/${OTHER_PATIENT}/images`) {
      return Promise.resolve({ data: { images: [
        { id: "second-photo", screening_id: "screening-2", status: "ACCEPTED", view_type: "PALATE", size_bytes: 1024, captured_at: "2026-11-02T10:00:00Z", screening_date: "2026-11-02" },
      ] } });
    }
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  renderAt(<ImageReview />, `/page?patient=${PATIENT}`);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    `/medical-officer/patients/${PATIENT}/images`
  ));
  fireEvent.change(await screen.findByLabelText("Claimed case"), { target: { value: OTHER_PATIENT } });
  expect((await screen.findAllByText("Palate")).length).toBeGreaterThan(0);

  resolveFirstPatient({
    data: {
      images: [
        { id: "first-photo", screening_id: "screening-1", status: "ACCEPTED", view_type: "GUMS", size_bytes: 1024, captured_at: "2026-11-01T10:00:00Z", screening_date: "2026-11-01" },
      ],
    },
  });
  await waitFor(() => expect(screen.queryByText("Gums")).not.toBeInTheDocument());
});

test("clinical notes sign a draft after confirmation and amendments need a reason", async () => {
  mockGet({
    "/medical-officer/reviews": {
      reviews: [
        { id: "r-1", patient_id: PATIENT, patient_code: "AD-2026-000001", finding: "Patch", decision: "NO_ACTION", version: 2,
          signed_at: null, case_state: "AWAITING_CLINICIAN", updated_at: "2026-11-06T10:00:00Z", ai_agreement: "NOT_AVAILABLE" },
        { id: "r-2", patient_id: PATIENT, patient_code: "AD-2026-000002", finding: "Ulcer", decision: "NO_ACTION", version: 3,
          signed_at: "2026-11-05T10:00:00Z", case_state: "REVIEWED", updated_at: "2026-11-05T10:00:00Z", ai_agreement: "NOT_AVAILABLE" },
      ],
      pagination: { page: 1, total: 2, total_pages: 1 },
    },
  });
  api.post.mockResolvedValue({ data: { success: true } });
  renderAt(<ClinicalNotes />);

  fireEvent.click((await screen.findAllByRole("button", { name: /^Sign$/ }))[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/medical-officer/patients/${PATIENT}/review/sign`, { version: 2 }));

  fireEvent.click(screen.getByRole("button", { name: /Amend/ }));
  expect(screen.getByRole("button", { name: "Sign amendment" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Reason for the amendment/), { target: { value: "Typo corrected" } });
  expect(screen.getByRole("button", { name: "Sign amendment" })).not.toBeDisabled();
});

test("clinical notes direct a returned recapture to its full clinical review", async () => {
  mockGet({
    "/medical-officer/reviews": {
      reviews: [{
        id: "review-1",
        patient_id: PATIENT,
        patient_code: "AD-2026-000001",
        finding: "Original finding",
        decision: "REQUEST_RECAPTURE",
        request_note: "Retake the left photo",
        version: 3,
        signed_at: "2026-11-05T10:00:00Z",
        case_state: "AWAITING_CLINICIAN",
        updated_at: "2026-11-05T10:00:00Z",
        ai_agreement: "NOT_AVAILABLE",
      }],
      pagination: { page: 1, total: 1, total_pages: 1 },
    },
  });
  api.post.mockResolvedValue({ data: { success: true } });
  renderAt(<ClinicalNotes />);

  expect(await screen.findByRole("link", { name: "Review resubmission" }))
    .toHaveAttribute("href", `/medical-officer/review?patient=${PATIENT}`);
  expect(screen.queryByRole("button", { name: "Review resubmission" })).not.toBeInTheDocument();
});

test("referrals explain when the case is not eligible", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    "/medical-officer/referrals": { referrals: [], pagination: { page: 1, total: 0, total_pages: 0 } },
    [`/medical-officer/patients/${PATIENT}/referral-options`]: {
      options: { eligible: false, review: null, hospitals: [], specialties: [], priorities: [], specialists: [], navigators: [], modes: ["HOSPITAL_VISIT"] },
    },
  });
  renderAt(<Referrals />, `/page?patient=${PATIENT}`);
  expect(await screen.findByText(/A referral needs a signed review/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Create referral/ })).not.toBeInTheDocument();
});

test("referrals are created with the chosen hospital, specialty and priority", async () => {
  mockGet({
    "/medical-officer/cases?view=mine": { cases: mine },
    "/medical-officer/referrals": { referrals: [], pagination: { page: 1, total: 0, total_pages: 0 } },
    [`/medical-officer/patients/${PATIENT}/referral-options`]: {
      options: {
        eligible: true, review: { referral_reason: "Suspicious lesion" },
        hospitals: [{ id: 8, name_en: "Area Hospital" }], specialties: [{ id: 1, name_en: "ENT" }],
        priorities: [{ id: 1, name_en: "Urgent" }], specialists: [], navigators: [], modes: ["HOSPITAL_VISIT"],
      },
    },
  });
  api.post.mockResolvedValue({ data: { referral: { referral_code: "REF-2026-000001" } } });
  renderAt(<Referrals />, `/page?patient=${PATIENT}`);

  fireEvent.change(await screen.findByLabelText(/Hospital/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/Specialty/), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/^Priority/), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Create referral/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/medical-officer/patients/${PATIENT}/referrals`,
    expect.objectContaining({ hospital_facility_id: "8", specialty_id: "1", priority_id: "1", reason: "Suspicious lesion" })));
  expect(await screen.findByText("Referral REF-2026-000001 created.")).toBeInTheDocument();
});

test("follow-ups need a referral first", async () => {
  mockGet({
    "/medical-officer/followups/options": { options: { referrals: [], navigators: [], statuses: [], task_types: ["REMINDER"] } },
    "/medical-officer/followups": { tasks: [], pagination: { page: 1, total: 0, total_pages: 0 } },
  });
  renderAt(<FollowUps />);
  expect(await screen.findByText(/Create a referral first/)).toBeInTheDocument();
});

test("reports show totals and the CSV is requested from the server", async () => {
  global.URL.createObjectURL = jest.fn(() => "blob:csv");
  global.URL.revokeObjectURL = jest.fn();
  const totals = { patients: 5, screenings: 4, awaiting_review: 1, signed_reviews: 2, draft_reviews: 1, referrals: 1, referrals_completed: 0, followups_open: 1, followups_closed: 0 };
  mockGet({
    "/medical-officer/reports/mandals": { report: { mandals: [{ id: 2, name_en: "G. Madugula", ...totals }], totals, columns: Object.keys(totals) } },
    "/medical-officer/reports/mandals.csv": new Blob(["mandal,patients"]),
  });
  renderAt(<MoReports />);
  expect(await screen.findByText("Mandal-wise summary")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/medical-officer/reports/mandals.csv", { params: {}, responseType: "blob" }));
});

test("profile shows assignments and updates only the phone number", async () => {
  mockGet({
    "/medical-officer/profile": {
      profile: { full_name: "Dr Ravi", username: "mo.ravi.1234", email: "ravi@example.test", phone: "9876543210",
        role_code: "MEDICAL_OFFICER", status: "ACTIVE", mfa_enabled: true, mandals: [{ id: 2, name_en: "G. Madugula" }], facilities: [] },
    },
  });
  api.patch.mockResolvedValue({ data: { profile: { full_name: "Dr Ravi", phone: "9876500000", status: "ACTIVE", mandals: [], facilities: [] } } });
  renderAt(<MoProfile />);

  expect(await screen.findByText("G. Madugula")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "98765-00000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save phone number" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/medical-officer/profile", { phone: "9876500000" }));
  expect(screen.getByRole("link", { name: /Change password/ })).toHaveAttribute("href", "/change-password");
});
