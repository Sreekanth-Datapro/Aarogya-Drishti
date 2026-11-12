import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../services/api";
import HwDashboard from "./HwDashboard";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { full_name: "Worker" },
    isOffline: false,
    pendingDraftCount: 0,
  }),
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key) => ({
      "hwDashboard.statusAwaitingReview": "Awaiting Medical Officer Review",
      "hwDashboard.statusReviewed": "Reviewed",
      "hwDashboard.statusRecaptureRequired": "Recapture Required",
      "hwDashboard.continueRecapture": "Continue recapture",
      "hwDashboard.statusMoreInformationRequired": "More information requested",
      "hwDashboard.updateRequestedInformation": "Update requested information",
    }[key] || key),
    tm: (key) => key,
  }),
}));

jest.mock("../../components/ui", () => ({
  Alert: ({ children }) => <div>{children}</div>,
  Badge: ({ children }) => <span>{children}</span>,
  BarChart: () => null,
  DonutChart: () => null,
  PageLoader: () => <div>Loading</div>,
  StatCard: () => null,
}));

jest.mock("../district/ColumnChart", () => () => null);

jest.mock("../../components/dashboard/DashboardBanner", () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard-banner">{children}</div>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === "/patients/summary") {
      return Promise.resolve({ data: { summary: {} } });
    }
    if (path === "/patients/registration-options") {
      return Promise.resolve({ data: { mandals: [] } });
    }
    if (path === "/patients/mine") {
      return Promise.resolve({
        data: {
          patients: [
            {
              id: "waiting", full_name: "Waiting Patient", patient_code: "AD-001",
              screening_consent: true, case_state: "AWAITING_CLINICIAN",
            },
            {
              id: "reviewed", full_name: "Reviewed Patient", patient_code: "AD-002",
              screening_consent: true, case_state: "REVIEWED", reviewed_at: "2026-11-08T10:00:00Z",
            },
            {
              id: "recapture", full_name: "Recapture Patient", patient_code: "AD-003",
              screening_consent: true, case_state: "SCREENED",
              medical_officer_decision: "REQUEST_RECAPTURE", reviewed_at: "2026-11-08T10:00:00Z",
              screening_id: "recapture-screening",
              medical_officer_request_note: "Please retake the left-side photo.",
            },
            {
              id: "withdrawn", full_name: "Consent Withdrawn", patient_code: "AD-004",
              screening_consent: false, case_state: "AWAITING_CLINICIAN",
            },
            {
              id: "more-info", full_name: "More Info Requested", patient_code: "AD-005",
              screening_consent: true, case_state: "SCREENED",
              medical_officer_decision: "REQUEST_MORE_INFO", reviewed_at: "2026-11-08T10:00:00Z",
              screening_id: "more-info-screening",
              medical_officer_request_note: "Please add the symptom duration.",
            },
          ],
        },
      });
    }
    return Promise.reject(new Error(`Unexpected API request: ${path}`));
  });
});

test("recent patients show consented screening review statuses without exposing withdrawn-consent status", async () => {
  render(<MemoryRouter><HwDashboard /></MemoryRouter>);

  expect(await screen.findByText("Waiting Patient")).toBeInTheDocument();
  expect(screen.getByText("Awaiting Medical Officer Review")).toBeInTheDocument();
  expect(screen.getByText("Reviewed")).toBeInTheDocument();
  expect(screen.getByText("Recapture Required")).toBeInTheDocument();
  expect(screen.getByText("Please retake the left-side photo.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Continue recapture" }))
    .toHaveAttribute("href", "/health-worker/screening?patientId=recapture");
  expect(screen.getByText("More information requested")).toBeInTheDocument();
  expect(screen.getByText("Please add the symptom duration.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Update requested information" }))
    .toHaveAttribute("href", "/health-worker/screening?patientId=more-info");
  expect(screen.getAllByText("Reviewed")).toHaveLength(1);
  expect(screen.getAllByText("Awaiting Medical Officer Review")).toHaveLength(1);
});
