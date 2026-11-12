import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../../services/api";
import ScreeningWizard from "./ScreeningWizard";
import { captureVideoFrame, inspectImage, validateImageFile } from "./imageTools";

jest.mock("./imageTools", () => ({
  captureVideoFrame: jest.fn(async (_video, view) => new File(["camera"], `${view}.jpg`, { type: "image/jpeg" })),
  inspectImage: jest.fn(async () => ({ status: "good", warnings: [], width: 1200, height: 900 })),
  validateImageFile: jest.requireActual("./imageTools").validateImageFile,
}));

jest.mock("../../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const SCREENING_ID = "22222222-2222-4222-8222-222222222222";

const options = {
  symptoms: [{ code: "WHITE_PATCH", name_en: "White patch" }, { code: "PAIN", name_en: "Pain" }],
  exposures: [{ code: "SMOKELESS_TOBACCO", category: "TOBACCO", name_en: "Smokeless tobacco" }],
  consent_purposes: [
    { code: "SCREENING", name_en: "Oral screening examination", text_en: "I agree to an oral screening examination.", version: "v1" },
    { code: "IMAGE_CAPTURE", name_en: "Photograph capture", text_en: "I agree to oral photographs being taken.", version: "v1" },
    { code: "TELECONSULT", name_en: "Video consultation", text_en: "I agree to a video consultation with a specialist (not recorded).", version: "v1" },
  ],
  languages: [{ id: 1, code: "en", name_en: "English", native_name: "English" }, { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" }],
  oral_sites: ["CHEEK_LINING", "TONGUE", "PALATE", "GUMS", "FLOOR_OF_MOUTH", "OTHER"],
  photo_views: ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"],
  max_photo_bytes: 10 * 1024 * 1024,
};
const patient = {
  id: PATIENT_ID, patient_code: "AD-2026-000001", full_name: "Demo Patient", sex: "FEMALE", age_years: 42,
  village_name: "Addulu", preferred_language_id: 2, screening_consent: false, case_state: null, screening_id: null,
};

let state;
const screeningRecord = () => ({
  id: SCREENING_ID, patient_id: PATIENT_ID, patient_code: patient.patient_code, full_name: patient.full_name,
  case_state: state.caseState, chief_complaint: "Burning while eating", notes: null,
  medical_officer_request_note: state.requestNote,
  medical_officer_decision: state.patient.medical_officer_decision,
  tobacco_current: false,
  findings: state.findings, photos: state.photos.filter((photo) => photo.status !== "SUPERSEDED"), consents: state.consents,
});

beforeEach(() => {
  jest.clearAllMocks();
  captureVideoFrame.mockImplementation(async (_video, view) => new File(["camera"], `${view}.jpg`, { type: "image/jpeg" }));
  inspectImage.mockResolvedValue({ status: "good", warnings: [], width: 1200, height: 900 });
  state = {
    consents: { SCREENING: null, IMAGE_CAPTURE: null, TELECONSULT: null },
    photos: [],
    caseState: "CONSENTED",
    requestNote: null,
    findings: [],
    patient: { ...patient },
  };
  api.get.mockImplementation(async (url) => {
    if (url === "/screenings/options") return { data: { options } };
    if (url === "/screenings/patients") return { data: { patients: [state.patient] } };
    if (url === `/screenings/patients/${PATIENT_ID}/consents`) return { data: { consents: state.consents } };
    if (url === `/screenings/${SCREENING_ID}`) return { data: { screening: screeningRecord() } };
    if (/\/photos\/[^/]+\/(enhanced\/)?file$/.test(url)) return { data: new Blob([url], { type: "image/jpeg" }) };
    throw new Error(`not mocked: ${url}`);
  });
  api.post.mockImplementation(async (url, body, config) => {
    if (url.endsWith("/consents")) {
      const previous = state.consents[body.purpose];
      state.consents = {
        ...state.consents,
        [body.purpose]: {
          granted: body.granted,
          previously_granted: previous?.granted === true || previous?.previously_granted === true,
          captured_at: "2026-11-07T10:00:00Z",
        },
      };
      return { data: { consent: state.consents[body.purpose] } };
    }
    if (url === "/screenings") return { data: { screening: { id: SCREENING_ID, case_state: "CONSENTED" } } };
    if (url.endsWith("/photos/validate")) {
      if (state.validateError) throw state.validateError;
      return {
        data: {
          validation: state.validation || {
            status: "VALID",
            expected_category: "MOUTH",
            detected_category: "MOUTH",
            confidence: 95,
            reason: "Open mouth clearly visible",
            upload_allowed: true,
          },
          can_upload: state.validation ? state.validation.upload_allowed !== false && state.validation.status === "VALID" : true,
        },
      };
    }
    if (url.endsWith("/photos/enhance-preview")) {
      if (state.previewEnhanceError) throw state.previewEnhanceError;
      return {
        data: new Blob(["enhanced-preview"], { type: "image/jpeg" }),
        headers: { "content-type": "image/jpeg" },
      };
    }
    if (url.endsWith("/photos")) {
      state.photos = state.photos.map((photo) => photo.view === body.get("view") ? { ...photo, status: "SUPERSEDED" } : photo);
      const photo = {
        id: `photo-${state.photos.length + 1}`,
        view: body.get("view"),
        size_bytes: body.get("photo").size,
        is_enhanced: false,
        has_ai_enhanced: false,
        status: "UPLOADED",
      };
      state.photos.push(photo);
      return { data: { photo } };
    }
    if (url.endsWith("/enhance")) {
      if (state.enhanceError) throw state.enhanceError;
      const photoId = url.split("/").slice(-2)[0];
      state.photos = state.photos.map((photo) => photo.id === photoId ? { ...photo, has_ai_enhanced: true } : photo);
      return { data: { enhanced: { photo_id: photoId, width: 1536, height: 1152 } } };
    }
    void config;
    if (url.endsWith("/analyze")) {
      return {
        data: {
          analysis: {
            views: ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"].map((view) => ({
              view,
              classification: "UNCERTAIN",
              model_confidence: null,
              image_quality: { status: "RECAPTURE", warnings: ["blur"] },
              observations: ["Image quality check needs review."],
              uncertainty_warnings: ["IMAGE_QUALITY_NEEDS_REVIEW"],
            })),
          },
        },
      };
    }
    if (url.endsWith("/submit")) {
      state.caseState = "AWAITING_CLINICIAN";
      return { data: { screening: { id: SCREENING_ID, case_state: "AWAITING_CLINICIAN", submitted_at: "2026-11-07T11:00:00Z" } } };
    }
    throw new Error(`not mocked: ${url}`);
  });
  api.put.mockImplementation(async (url) => {
    if (url === `/screenings/${SCREENING_ID}/requested-information`) {
      state.caseState = "AWAITING_CLINICIAN";
      return {
        data: {
          screening: {
            id: SCREENING_ID,
            case_state: "AWAITING_CLINICIAN",
            submitted_at: "2026-11-08T11:00:00Z",
            version: 2,
          },
        },
      };
    }
    throw new Error(`not mocked: ${url}`);
  });
  api.delete.mockImplementation(async (url) => {
    const photoId = url.split("/").pop();
    state.photos = state.photos.map((photo) => photo.id === photoId ? { ...photo, status: "SUPERSEDED" } : photo);
    return { data: { removed: true } };
  });
  URL.createObjectURL = jest.fn(() => `blob:screening-${Math.random()}`);
  URL.revokeObjectURL = jest.fn();
});

const consentCard = (name) => screen.getAllByRole("article").find((card) => within(card).queryByRole("heading", { name }));
const photoFile = (name, type, size = 2048) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

test("a patient awaiting Medical Officer review cannot start or edit another screening", async () => {
  state.patient = { ...patient, screening_id: SCREENING_ID, case_state: "AWAITING_CLINICIAN" };
  render(<MemoryRouter><ScreeningWizard /></MemoryRouter>);

  const patientButton = await screen.findByRole("button", { name: /Demo Patient/ });
  expect(patientButton).toBeDisabled();
  expect(screen.getAllByText("Awaiting Medical Officer Review").length).toBeGreaterThan(0);
  expect(api.get).not.toHaveBeenCalledWith(`/screenings/${SCREENING_ID}`);
  expect(api.get).not.toHaveBeenCalledWith(`/screenings/patients/${PATIENT_ID}/consents`);
});

test("the Health Worker sees the signed Medical Officer request on a returned screening", async () => {
  state.patient = {
    ...patient,
    screening_id: SCREENING_ID,
    case_state: "SCREENED",
    medical_officer_decision: "REQUEST_RECAPTURE",
    medical_officer_request_note: "Please retake the left-side photo.",
  };
  state.caseState = "SCREENED";
  state.requestNote = "Please retake the left-side photo.";
  render(<MemoryRouter><ScreeningWizard /></MemoryRouter>);

  const patientButton = await screen.findByRole("button", { name: /Continue recapture/ });
  expect(patientButton).toBeEnabled();
  expect(screen.getByText("Please retake the left-side photo.")).toBeInTheDocument();
  fireEvent.click(patientButton);

  expect(await screen.findByText("Medical Officer request:")).toBeInTheDocument();
  expect(screen.getByText("Please retake the left-side photo.")).toBeInTheDocument();
});

test("the Health Worker updates prefilled information and resubmits the same REQUEST_MORE_INFO screening", async () => {
  state.patient = {
    ...patient,
    screening_id: SCREENING_ID,
    case_state: "SCREENED",
    medical_officer_decision: "REQUEST_MORE_INFO",
    medical_officer_request_note: "Please add the symptom duration.",
  };
  state.caseState = "SCREENED";
  state.requestNote = "Please add the symptom duration.";
  state.findings = [{
    finding_kind: "SYMPTOM",
    symptom_code: "WHITE_PATCH",
    duration_days: 14,
  }, {
    finding_kind: "EXAM",
    oral_site: "CHEEK_LINING",
    description: "White patch on left cheek",
  }];
  render(<MemoryRouter><ScreeningWizard /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: /Update requested information/ }));
  expect(await screen.findByRole("heading", { name: "Update requested information" })).toBeInTheDocument();
  expect(screen.getByText("Please add the symptom duration.")).toBeInTheDocument();
  expect(screen.getByLabelText("Chief complaint")).toHaveValue("Burning while eating");
  expect(screen.getByLabelText("Days with White patch")).toHaveValue(14);
  expect(screen.getByLabelText("What you saw: Cheek lining")).toHaveValue("White patch on left cheek");

  fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Burning for three weeks" } });
  fireEvent.click(screen.getByRole("button", { name: "Update and resubmit to Medical Officer" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    `/screenings/${SCREENING_ID}/requested-information`,
    expect.objectContaining({ chief_complaint: "Burning for three weeks" })
  ));
  expect(await screen.findByText("Sent to the Medical Officer")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith(`/screenings/${SCREENING_ID}/submit`);
});

async function openConsent() {
  render(<MemoryRouter><ScreeningWizard /></MemoryRouter>);
  expect(await screen.findByText("You record observations only. This screening is not a diagnosis. The Medical Officer and other authorised clinicians make every clinical decision.", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Demo Patient/ }));
  await screen.findByRole("heading", { name: "Patient consent" });
}

async function giveConsent(name) {
  fireEvent.click(within(consentCard(name)).getByRole("button", { name: "Patient agrees" }));
  await within(consentCard(name)).findByText("Patient agreed");
}

async function fillAndSaveForm() {
  fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Burning while eating" } });
  fireEvent.click(screen.getByLabelText("White patch"));
  fireEvent.change(screen.getByLabelText("Days with White patch"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByRole("heading", { name: "Oral photos" });
}

test("screening cannot start without screening consent; consents are recorded separately", async () => {
  await openConsent();
  const next = screen.getByRole("button", { name: "Next" });
  expect(next).toBeDisabled();
  expect(screen.getByText("Screening can start only after the patient agrees to the screening.")).toBeInTheDocument();

  await giveConsent("Photograph capture");
  expect(api.post).toHaveBeenLastCalledWith(`/screenings/patients/${PATIENT_ID}/consents`,
    { purpose: "IMAGE_CAPTURE", granted: true, method: "CHECKBOX", witness_name: null, language_id: 2 });
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  await giveConsent("Oral screening examination");
  expect(api.post).toHaveBeenLastCalledWith(`/screenings/patients/${PATIENT_ID}/consents`, expect.objectContaining({ purpose: "SCREENING", granted: true }));
  expect(within(consentCard("Oral screening examination")).getByText(/Recorded on/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("the Health Worker records the patient's video consent choice and later withdrawal", async () => {
  await openConsent();
  const videoConsent = consentCard("Video consultation");

  expect(within(videoConsent).getByText("Not given")).toBeInTheDocument();
  expect(within(videoConsent).getByText(/specifically for video consultations/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith(`/screenings/patients/${PATIENT_ID}/consents`, expect.objectContaining({
    purpose: "TELECONSULT",
    granted: true,
  }));

  fireEvent.click(within(videoConsent).getByRole("button", { name: "Patient agrees" }));
  await within(videoConsent).findByText("Active");
  expect(api.post).toHaveBeenLastCalledWith(`/screenings/patients/${PATIENT_ID}/consents`, {
    purpose: "TELECONSULT",
    granted: true,
    method: "CHECKBOX",
    witness_name: null,
    language_id: 2,
  });

  fireEvent.click(within(videoConsent).getByRole("button", { name: "Patient does not agree" }));
  await within(videoConsent).findByText("Withdrawn");
  expect(api.post).toHaveBeenLastCalledWith(`/screenings/patients/${PATIENT_ID}/consents`, expect.objectContaining({
    purpose: "TELECONSULT",
    granted: false,
  }));
});

test("an explicit refusal is shown as declined, while missing consent stays not given", async () => {
  await openConsent();
  const videoConsent = consentCard("Video consultation");

  expect(within(videoConsent).getByText("Not given")).toBeInTheDocument();
  fireEvent.click(within(videoConsent).getByRole("button", { name: "Patient does not agree" }));
  await within(videoConsent).findByText("Declined");
  expect(within(videoConsent).queryByText("Withdrawn")).not.toBeInTheDocument();
});

test("a witnessed consent needs the witness name", async () => {
  await openConsent();
  fireEvent.change(screen.getByLabelText(/How consent was given/), { target: { value: "THUMBPRINT" } });
  fireEvent.click(within(consentCard("Oral screening examination")).getByRole("button", { name: "Patient agrees" }));
  expect(await screen.findByText("Enter the witness name for spoken or thumbprint consent.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test("the screening form shows clear errors and sends only observations", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });

  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect(await screen.findByText("Enter the chief complaint.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Burning while eating" } });
  fireEvent.click(screen.getByLabelText("Has pain"));
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect(await screen.findByText("Enter a pain score from 0 to 10.")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("No pain"));
  fireEvent.click(screen.getByLabelText("Tongue"));
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect(await screen.findByText("Describe what you saw in each ticked part of the mouth.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith("/screenings", expect.anything());

  fireEvent.change(screen.getByLabelText("What you saw: Tongue"), { target: { value: "Red area on the side" } });
  fireEvent.click(screen.getByLabelText("Smokeless tobacco"));
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByRole("heading", { name: "Oral photos" });
  expect(api.post).toHaveBeenCalledWith("/screenings", expect.objectContaining({
    patient_id: PATIENT_ID,
    chief_complaint: "Burning while eating",
    tobacco_current: true,
    oral_observations: [{ site: "TONGUE", description: "Red area on the side" }],
    pain: expect.objectContaining({ has_pain: false }),
  }));
});

test("tobacco duration must be in range and use half-year steps", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Burning while eating" } });
  fireEvent.click(screen.getByLabelText("Smokeless tobacco"));
  fireEvent.change(screen.getByLabelText("Years of Smokeless tobacco"), { target: { value: "1.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

  expect(await screen.findByText("Years of use must be from 0 to 120 in 0.5-year steps.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith("/screenings", expect.anything());
});

test("photos: wrong type and over 10 MB are refused; all three views are needed; submit sends to the MO queue", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Photo: Front view"), { target: { files: [photoFile("front.gif", "image/gif")] } });
  expect(await screen.findByText("Choose a JPG, PNG or WEBP photo.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Photo: Front view"), { target: { files: [photoFile("big.jpg", "image/jpeg", 10 * 1024 * 1024 + 1)] } });
  expect(await screen.findByText("The photo is larger than 10 MB. Take a smaller photo.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith(expect.stringContaining("/photos"), expect.anything());

  for (const [view, type] of [["Front view", "image/jpeg"], ["Left view", "image/png"], ["Right view", "image/webp"]]) {
    fireEvent.change(screen.getByLabelText(`Photo: ${view}`), { target: { files: [photoFile("mouth", type)] } });
    const card = screen.getAllByRole("article").find((item) => within(item).queryByLabelText(`Photo: ${view}`));
    expect(await within(card).findByText("Enhanced")).toBeInTheDocument();
    fireEvent.click(await within(card).findByRole("button", { name: "Save photo" }));
    expect(await within(card).findByText("Saved · 2 KB")).toBeInTheDocument();
  }
  const form = api.post.mock.calls.find(([url]) => url.endsWith("/photos"))[1];
  expect(form.get("view")).toBe("FRONT_VIEW");
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("3 photos saved")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Submit to Medical Officer/ }));
  expect(await screen.findByText("Sent to the Medical Officer")).toBeInTheDocument();
  expect(api.post).toHaveBeenLastCalledWith(`/screenings/${SCREENING_ID}/submit`);
});

test("without photograph consent no photo can be taken and the screening can still be submitted", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  expect(screen.getByText(/The patient did not agree to photographs/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Photo: Front view")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("No photos (no photograph consent)")).toBeInTheDocument();
});

test("camera access requires consent, captured frames can be previewed, saved, and camera tracks stop when closed", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  const track = { stop: jest.fn() };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: jest.fn(async () => stream) },
  });
  const frontCard = screen.getAllByRole("article").find((item) => within(item).queryByLabelText("Photo: Front view"));
  fireEvent.click(within(frontCard).getByRole("button", { name: "Use camera" }));
  expect(await screen.findByRole("dialog", { name: "Take a photo" })).toBeInTheDocument();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  const cameraDialog = screen.getByRole("dialog", { name: "Take a photo" });
  fireEvent.click(within(cameraDialog).getAllByRole("button", { name: "Close camera" })[0]);
  expect(track.stop).toHaveBeenCalled();

  fireEvent.click(within(frontCard).getByRole("button", { name: "Use camera" }));
  await screen.findByRole("dialog", { name: "Take a photo" });
  const captureButton = await screen.findByRole("button", { name: "Capture photo" });
  await waitFor(() => expect(captureButton).toBeEnabled());
  fireEvent.click(captureButton);
  await waitFor(() => expect(captureVideoFrame).toHaveBeenCalled());
  const capturedFile = await captureVideoFrame.mock.results[0].value;
  expect(capturedFile.type).toBe("image/jpeg");
  expect(validateImageFile(capturedFile)).toBeNull();
  expect(await screen.findByText("Enhanced")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(
    expect.stringContaining("/photos/enhance-preview"),
    expect.any(FormData),
    expect.objectContaining({ responseType: "blob" })
  );
  expect(api.post).toHaveBeenCalledWith(
    expect.stringContaining("/photos/validate"),
    expect.any(FormData),
    expect.objectContaining({ timeout: 180000 })
  );
  expect(api.post.mock.calls.some(([url]) => url.endsWith("/photos"))).toBe(false);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("chosen photos auto-enhance then validate; Save all photos uploads only after VALID", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  for (const view of ["Front view", "Left view", "Right view"]) {
    fireEvent.change(screen.getByLabelText(`Photo: ${view}`), { target: { files: [photoFile(`${view}.jpg`, "image/jpeg")] } });
  }
  expect(await screen.findByText(/3 photos are chosen but not saved yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await waitFor(() => expect(screen.getAllByText("Enhanced")).toHaveLength(3));
  expect(api.post.mock.calls.filter(([url]) => url.endsWith("/photos/enhance-preview"))).toHaveLength(3);
  expect(api.post.mock.calls.filter(([url]) => url.endsWith("/photos/validate"))).toHaveLength(3);
  expect(api.post.mock.calls.some(([url]) => url.endsWith("/photos"))).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Save all photos" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  const uploads = api.post.mock.calls.filter(([url]) => url.endsWith("/photos")).map(([, form]) => form.get("view"));
  expect(uploads).toEqual(["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"]);
  expect(screen.queryByText(/not saved yet/)).not.toBeInTheDocument();
  await waitFor(() => expect(api.post.mock.calls.filter(([url]) => url.endsWith("/enhance")).length).toBeGreaterThanOrEqual(3));
});

test("analysis is explicitly requested only after all three originals are saved", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  for (const view of ["Front view", "Left view", "Right view"]) {
    fireEvent.change(screen.getByLabelText(`Photo: ${view}`), { target: { files: [photoFile(`${view}.jpg`, "image/jpeg")] } });
  }
  const analyzeButton = await screen.findByRole("button", { name: "Analyze all three original photos" });
  expect(analyzeButton).toBeDisabled();
  await waitFor(() => expect(screen.getAllByText("Enhanced")).toHaveLength(3));
  fireEvent.click(screen.getByRole("button", { name: "Save all photos" }));
  await waitFor(() => expect(analyzeButton).toBeEnabled());

  fireEvent.click(analyzeButton);
  expect(await screen.findByText("Preliminary image observations")).toBeInTheDocument();
  expect(screen.getAllByText(/Uncertain or unable to assess/)).toHaveLength(3);
  expect(api.post).toHaveBeenCalledWith(
    `/screenings/${SCREENING_ID}/analyze`,
    null,
    { timeout: 600000 }
  );
  expect(screen.getAllByText("Image quality checks need review.")).toHaveLength(3);
});

async function saveFrontPhoto() {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();
  fireEvent.change(screen.getByLabelText("Photo: Front view"), { target: { files: [photoFile("front.jpg", "image/jpeg")] } });
  const card = screen.getAllByRole("article").find((item) => within(item).queryByLabelText("Photo: Front view"));
  expect(await within(card).findByText("Enhanced")).toBeInTheDocument();
  fireEvent.click(await within(card).findByRole("button", { name: "Save photo" }));
  await within(card).findByText("Saved · 2 KB");
  return card;
}

test("selecting a photo auto-enhances, then Save photo stores original and persists AI copy", async () => {
  const card = await saveFrontPhoto();
  expect(screen.getByText(/AI enhancement starts automatically/)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(
    `/screenings/${SCREENING_ID}/photos/enhance-preview`,
    expect.any(FormData),
    expect.objectContaining({ responseType: "blob", timeout: 180000 })
  );
  expect(api.post).toHaveBeenCalledWith(`/screenings/${SCREENING_ID}/photos/photo-1/enhance`, null, { timeout: 180000 });
  expect(api.get).toHaveBeenCalledWith(
    `/screenings/${SCREENING_ID}/photos/photo-1/file`,
    expect.objectContaining({ responseType: "blob", timeout: 180000 })
  );
  expect(api.get).toHaveBeenCalledWith(
    `/screenings/${SCREENING_ID}/photos/photo-1/enhanced/file`,
    expect.objectContaining({ responseType: "blob", timeout: 180000 })
  );

  expect(await within(card).findByAltText("Front view · Original image")).toBeInTheDocument();
  expect(within(card).getByAltText("Front view · AI-enhanced copy")).toBeInTheDocument();
  expect(within(card).getByText("Saved · 2 KB")).toBeInTheDocument();
  expect(within(card).getByText("AI copy ready")).toBeInTheDocument();

  // Only the original was uploaded; the AI copy never replaces it
  const uploads = api.post.mock.calls.filter(([url]) => url.endsWith("/photos")).map(([, form]) => form);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].get("photo").name).toBe("front.jpg");
  expect(uploads[0].get("enhanced")).toBeNull();
  expect(state.photos.filter((photo) => photo.status !== "SUPERSEDED")).toHaveLength(1);

  fireEvent.click(within(card).getByRole("button", { name: "Preview" }));
  const previewDialog = await screen.findByRole("dialog", { name: "Preview" });
  expect(within(previewDialog).getByText("Original image")).toBeInTheDocument();
  expect(within(previewDialog).getByText("AI-enhanced copy")).toBeInTheDocument();
  expect(within(previewDialog).getByText(/is not a diagnosis/)).toBeInTheDocument();
});

test("if preview enhancement fails, validation can still proceed and save waits for VALID", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();
  state.previewEnhanceError = {
    response: { status: 503, data: { message: "AI enhancement is not available right now. The original photo is saved." } },
  };
  fireEvent.change(screen.getByLabelText("Photo: Front view"), { target: { files: [photoFile("front.jpg", "image/jpeg")] } });
  const card = screen.getAllByRole("article").find((item) => within(item).queryByLabelText("Photo: Front view"));
  expect(await screen.findByText("AI enhancement is not available right now. The original photo is saved.")).toBeInTheDocument();
  expect(await within(card).findByText("Valid for selected category")).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "Save photo" }));
  expect(await within(card).findByText("Saved · 2 KB")).toBeInTheDocument();
});

test("removing a saved photo uses the protected removal API and leaves old image history", async () => {
  await openConsent();
  await giveConsent("Oral screening examination");
  await giveConsent("Photograph capture");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Health screening" });
  await fillAndSaveForm();

  fireEvent.change(screen.getByLabelText("Photo: Front view"), { target: { files: [photoFile("front.jpg", "image/jpeg")] } });
  const card = screen.getAllByRole("article").find((item) => within(item).queryByLabelText("Photo: Front view"));
  fireEvent.click(await within(card).findByRole("button", { name: "Save photo" }));
  await within(card).findByText("Saved · 2 KB");
  fireEvent.click(await within(card).findByRole("button", { name: "Remove" }));

  await within(card).findByText("Not taken yet");
  expect(api.delete).toHaveBeenCalledWith(`/screenings/${SCREENING_ID}/photos/photo-1`);
  expect(state.photos).toHaveLength(1);
  expect(state.photos[0].status).toBe("SUPERSEDED");
});
