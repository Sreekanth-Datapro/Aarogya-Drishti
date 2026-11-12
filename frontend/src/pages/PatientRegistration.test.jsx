import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import api from "../services/api";
import { LanguageProvider } from "../i18n/LanguageContext";
import PatientRegistration from "./PatientRegistration";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const mockRefreshPendingCount = jest.fn(async () => 0);
const mockGetOfflinePin = jest.fn(() => null);
const mockRunOfflineSync = jest.fn();
const mockListDrafts = jest.fn(async () => []);

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, role: "HEALTH_WORKER", full_name: "Worker" },
    isOffline: false,
    isOnlineAuth: true,
    getOfflinePin: mockGetOfflinePin,
    refreshPendingCount: mockRefreshPendingCount,
    runOfflineSync: mockRunOfflineSync,
  }),
}));

jest.mock("../offline/drafts", () => ({
  listRegistrationDrafts: (...args) => mockListDrafts(...args),
  loadDraftPayload: jest.fn(),
  removeDraft: jest.fn(),
  saveRegistrationDraft: jest.fn(),
}));

const location = {
  assignment_id: "assignment-1",
  district_id: 3,
  mandal_id: 4,
  mandal_name: "Paderu",
  village_id: 5,
  village_name: "Addulu",
  facility_id: 6,
  facility_name: "PHC Paderu",
};
// One assigned Mandal with two villages; Addulu may use two facilities, Kinchumanda one
const paderu = {
  district_id: 3, district_name: "Alluri Sitharama Raju", mandal_id: 4, mandal_name: "Paderu",
  villages: [{ id: 5, name_en: "Addulu" }, { id: 8, name_en: "Kinchumanda" }],
  facilities: [{ id: 6, name_en: "PHC Paderu" }, { id: 9, name_en: "SC Addulu" }, { id: 10, name_en: "SC Kinchumanda" }],
  pairs: [{ village_id: 5, facility_id: 6 }, { village_id: 5, facility_id: 9 }, { village_id: 8, facility_id: 10 }],
};
const options = {
  locations: [location],
  mandal_wide: false,
  mandals: [paderu],
  languages: [{ id: 1, code: "en", name_en: "English", native_name: "English" }, { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" }],
  consent_purposes: [
    { code: "DATA_PROCESSING", name_en: "Data processing", text_en: "I agree to my record being stored and processed securely.", version: "v1" },
    { code: "SCREENING", name_en: "Oral screening examination", text_en: "I agree to an oral screening examination.", version: "v1" },
    { code: "IMAGE_CAPTURE", name_en: "Photograph capture", text_en: "I agree to oral photographs being taken.", version: "v1" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/registration-options")
      ? options
      : { patients: [{ id: "p-1", patient_code: "AD-00009", full_name: "Old Patient", sex: "MALE", age_years: 60, village_name: "Addulu", mandal_name: "Paderu", created_at: "2026-11-01T00:00:00Z", screening_consent: true }] },
  }));
  api.post.mockResolvedValue({
    data: { patient: { id: "patient-1", patient_code: "AD-00001" } },
  });
});

async function fillPatient() {
  fireEvent.change(await screen.findByLabelText("Patient name"), { target: { value: "Demo Patient" } });
  fireEvent.change(screen.getByLabelText("Sex"), { target: { value: "FEMALE" } });
  fireEvent.change(screen.getByLabelText("Age in years"), { target: { value: "42" } });
  fireEvent.change(screen.getByLabelText("Village"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Facility"), { target: { value: "6" } });
}

const optionNames = (label) => within(screen.getByLabelText(label)).getAllByRole("option").map((option) => option.textContent);
const renderRegistration = () => render(
  <LanguageProvider>
    <MemoryRouter><PatientRegistration /></MemoryRouter>
  </LanguageProvider>
);

function answerConsents({ data = true, screening = "Agrees", images = "Does not agree" } = {}) {
  if (data) fireEvent.click(screen.getByLabelText(/The patient agrees/));
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Oral screening examination" })).getByLabelText(screening));
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Photograph capture" })).getByLabelText(images));
}

test("patient registration sends the patient, the server-derived location and the consent answers", async () => {
  renderRegistration();
  await fillPatient();

  expect(screen.getByLabelText("Mandal")).toHaveValue("Paderu");
  expect(screen.getByLabelText("Mandal")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("District")).toHaveValue("Alluri Sitharama Raju");
  expect(screen.getByLabelText("District")).toHaveAttribute("readonly");
  // Telugu is preselected as the preferred language
  expect(screen.getByLabelText("Preferred language")).toHaveValue("2");
  fireEvent.change(screen.getByLabelText(/Address/), { target: { value: "Near the school" } });
  answerConsents();

  await userEvent.click(screen.getByRole("button", { name: "Register patient" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/patients", expect.objectContaining({
    full_name: "Demo Patient",
    sex: "FEMALE",
    age_years: 42,
    date_of_birth: null,
    preferred_language_id: 2,
    village_id: 5,
    facility_id: 6,
    habitation: null,
    address_line: "Near the school",
    consents: { DATA_PROCESSING: true, SCREENING: true, IMAGE_CAPTURE: false },
    consent_method: "CHECKBOX",
    witness_name: null,
  })));
  const payload = api.post.mock.calls[0][1];
  expect(payload).not.toHaveProperty("mandal_id");
  expect(payload).not.toHaveProperty("district_id");
  expect(payload.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  expect(await screen.findByText("Patient registered successfully. Patient code: AD-00001.")).toBeInTheDocument();
});

test("the facility list follows the chosen village of the fixed Mandal", async () => {
  renderRegistration();
  await screen.findByLabelText("Village");

  expect(optionNames("Village")).toEqual(["Select the patient's village", "Addulu", "Kinchumanda"]);
  expect(screen.getByLabelText("Facility")).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Village"), { target: { value: "5" } });
  expect(optionNames("Facility")).toEqual(["Select a facility", "PHC Paderu", "SC Addulu"]);

  // A village with one facility selects it automatically
  fireEvent.change(screen.getByLabelText("Village"), { target: { value: "8" } });
  expect(optionNames("Facility")).toEqual(["Select a facility", "SC Kinchumanda"]);
  expect(screen.getByLabelText("Facility")).toHaveValue("10");
});

test("with Mandal-wide registration every facility of the Mandal can be chosen for any village", async () => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/registration-options")
      ? { ...options, mandal_wide: true, mandals: [{ ...paderu, pairs: [] }] }
      : { patients: [] },
  }));
  renderRegistration();
  fireEvent.change(await screen.findByLabelText("Village"), { target: { value: "8" } });
  expect(optionNames("Facility")).toEqual(["Select a facility", "PHC Paderu", "SC Addulu", "SC Kinchumanda"]);
  expect(screen.getByText("All villages of your Mandal.")).toBeInTheDocument();
});

test("a Health Worker with two Mandals chooses the Mandal first", async () => {
  const second = { ...paderu, mandal_id: 7, mandal_name: "Hukumpeta", villages: [{ id: 20, name_en: "Gadutura" }], facilities: [{ id: 21, name_en: "PHC Hukumpeta" }], pairs: [{ village_id: 20, facility_id: 21 }] };
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/registration-options") ? { ...options, mandals: [paderu, second] } : { patients: [] },
  }));
  renderRegistration();
  expect(await screen.findByLabelText("Village")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Mandal"), { target: { value: "7" } });
  expect(optionNames("Village")).toEqual(["Select the patient's village", "Gadutura"]);
});

test("without a work Mandal the form explains what to do and shows no empty location fields", async () => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/registration-options") ? { ...options, locations: [], mandals: [] } : { patients: [] },
  }));
  renderRegistration();
  expect(await screen.findByText(/Your work Mandal is not set yet/)).toBeInTheDocument();
  expect(screen.queryByLabelText("District")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Village")).not.toBeInTheDocument();
  expect(screen.queryByText("}")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Register patient" })).toBeDisabled();
});

test("the consent statements from the database are shown to read to the patient", async () => {
  renderRegistration();
  expect(await screen.findByText("I agree to my record being stored and processed securely.")).toBeInTheDocument();
  expect(screen.getByText("I agree to an oral screening examination.")).toBeInTheDocument();
  expect(screen.getByText("I agree to oral photographs being taken.")).toBeInTheDocument();
});

test("the record is not sent without data processing consent or without every answer", async () => {
  renderRegistration();
  await fillPatient();

  await userEvent.click(screen.getByRole("button", { name: "Register patient" }));
  expect(await screen.findByText("The patient must agree to data processing before the record can be saved.")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/The patient agrees/));
  await userEvent.click(screen.getByRole("button", { name: "Register patient" }));
  expect(await screen.findByText("Record the patient's answer for every consent.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test("spoken or thumbprint consent needs a witness name", async () => {
  renderRegistration();
  await fillPatient();
  answerConsents();
  fireEvent.change(screen.getByLabelText("How consent was given"), { target: { value: "THUMBPRINT" } });

  await userEvent.click(screen.getByRole("button", { name: "Register patient" }));
  expect(await screen.findByText("Enter the witness name for spoken or thumbprint consent.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Witness name/), { target: { value: "Sita (ANM)" } });
  await userEvent.click(screen.getByRole("button", { name: "Register patient" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/patients", expect.objectContaining({
    consent_method: "THUMBPRINT",
    witness_name: "Sita (ANM)",
  })));
});

test("recent patients show their screening consent", async () => {
  renderRegistration();
  const row = await screen.findByRole("row", { name: /Old Patient/ });
  expect(within(row).getByText("Given")).toBeInTheDocument();
  expect(within(row).getByText("AD-00009")).toBeInTheDocument();
});
