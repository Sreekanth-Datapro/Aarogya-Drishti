import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import PatientSearch from "./PatientSearch";
import PatientDetails from "./PatientDetails";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("patient search calls the server and links results to authorized details", async () => {
  api.get.mockResolvedValue({
    data: {
      patients: [{
        id: "11111111-1111-4111-8111-111111111111",
        patient_code: "AD-2026-000001",
        full_name: "Demo Patient",
        sex: "FEMALE",
        village_name: "Addulu",
        facility_name: "PHC Paderu",
        created_at: "2026-11-01T00:00:00Z",
      }],
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    },
  });
  render(<MemoryRouter><PatientSearch /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText("Patient name, patient code or patient ID"), {
    target: { value: "Demo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("Demo Patient")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/patients/search", {
    params: { q: "Demo", page: 1, limit: 20 },
  });
  expect(screen.getByRole("link", { name: "View details" }))
    .toHaveAttribute("href", "/health-worker/patients/11111111-1111-4111-8111-111111111111");
});

test("patient details show real records and label AI results advisory", async () => {
  const patientId = "22222222-2222-4222-8222-222222222222";
  api.get.mockResolvedValue({
    data: {
      patient: {
        id: patientId,
        patient_code: "AD-2026-000002",
        full_name: "Demo Patient",
        sex: "FEMALE",
        age_years: 42,
        created_at: "2026-11-01T00:00:00Z",
        registered_by: "Worker One",
        district_name: "ASR",
        mandal_name: "Paderu",
        village_name: "Addulu",
        facility_name: "PHC Paderu",
      },
      consents: [{ purpose: "SCREENING", granted: true, captured_at: "2026-11-01T00:00:00Z", recorded_by: "Worker One" }],
      medical_history: [{
        history_kind: "CONDITION",
        condition_text: "Synthetic history",
        recorded_at: "2026-11-01T00:00:00Z",
        recorded_by: "Worker One",
      }],
      findings: [{
        screening_id: "screening-1",
        finding_kind: "SYMPTOM",
        symptom_name: "White patch",
        recorded_at: "2026-11-01T00:00:00Z",
        recorded_by: "Worker One",
      }],
      screenings: [{
        id: "screening-1",
        screening_date: "2026-11-01",
        case_state: "AWAITING_CLINICIAN",
        submitted_at: "2026-11-01T01:00:00Z",
        ai_status: "COMPLETED",
        medical_officer_decision: null,
        reviewed_at: null,
      }],
      referrals: [{
        id: "referral-1",
        referral_code: "REF-2026-000001",
        status: "PLANNED",
        hospital_name: "District Hospital",
        specialty_name: "ENT",
      }],
    },
  });
  render(
    <MemoryRouter initialEntries={[`/health-worker/patients/${patientId}`]}>
      <Routes>
        <Route path="/health-worker/patients/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: "Demo Patient" })).toBeInTheDocument();
  expect(screen.getByText("Synthetic history")).toBeInTheDocument();
  expect(screen.getByText("AI information is preliminary and advisory only. It is not a diagnosis.")).toBeInTheDocument();
  expect(screen.getByText("District Hospital")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Awaiting Medical Officer Review" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Start or continue screening" })).not.toBeInTheDocument();
});

test("patient details keep screening available after a screening is reviewed", async () => {
  const patientId = "22222222-2222-4222-8222-222222222222";
  api.get.mockResolvedValue({
    data: {
      patient: { id: patientId, full_name: "Demo Patient" },
      consents: [],
      medical_history: [],
      findings: [],
      screenings: [{ id: "screening-1", case_state: "REVIEWED", screening_date: "2026-11-01" }],
      referrals: [],
    },
  });
  render(
    <MemoryRouter initialEntries={[`/health-worker/patients/${patientId}`]}>
      <Routes>
        <Route path="/health-worker/patients/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole("link", { name: "Start or continue screening" }))
    .toHaveAttribute("href", `/health-worker/screening?patientId=${patientId}`);
});

test("patient screening history labels a signed recapture request, shows its remarks, and offers continuation", async () => {
  const patientId = "22222222-2222-4222-8222-222222222222";
  api.get.mockResolvedValue({
    data: {
      patient: { id: patientId, full_name: "Demo Patient" },
      consents: [{ purpose: "SCREENING", granted: true }],
      medical_history: [],
      findings: [],
      screenings: [{
        id: "screening-1",
        case_state: "SCREENED",
        screening_date: "2026-11-01",
        medical_officer_decision: "REQUEST_RECAPTURE",
        medical_officer_request_note: "Please retake the left-side photo.",
        reviewed_at: "2026-11-02T10:00:00Z",
      }],
      referrals: [],
    },
  });
  render(
    <MemoryRouter initialEntries={[`/health-worker/patients/${patientId}`]}>
      <Routes>
        <Route path="/health-worker/patients/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findAllByText("Recapture Required")).not.toHaveLength(0);
  expect(screen.getByText("Please retake the left-side photo.")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Continue recapture" })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "Continue recapture" })[0])
    .toHaveAttribute("href", `/health-worker/screening?patientId=${patientId}`);
});

test("patient screening history shows and links a signed more-information request", async () => {
  const patientId = "22222222-2222-4222-8222-222222222222";
  api.get.mockResolvedValue({
    data: {
      patient: { id: patientId, full_name: "Demo Patient" },
      consents: [{ purpose: "SCREENING", granted: true }],
      medical_history: [],
      findings: [],
      screenings: [{
        id: "screening-1",
        case_state: "SCREENED",
        screening_date: "2026-11-01",
        medical_officer_decision: "REQUEST_MORE_INFO",
        medical_officer_request_note: "Please add the symptom duration.",
        reviewed_at: "2026-11-02T10:00:00Z",
      }],
      referrals: [],
    },
  });
  render(
    <MemoryRouter initialEntries={[`/health-worker/patients/${patientId}`]}>
      <Routes>
        <Route path="/health-worker/patients/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findAllByText("More information requested")).not.toHaveLength(0);
  expect(screen.getByText("Please add the symptom duration.")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Update requested information" })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "Update requested information" })[0])
    .toHaveAttribute("href", `/health-worker/screening?patientId=${patientId}`);
});

test("patient details show the backend access-denied not-found response", async () => {
  api.get.mockRejectedValue({
    response: { data: { message: "Patient not found", code: "PATIENT_NOT_FOUND" } },
  });
  render(
    <MemoryRouter initialEntries={["/health-worker/patients/33333333-3333-4333-8333-333333333333"]}>
      <Routes>
        <Route path="/health-worker/patients/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("Patient not found")).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
});
