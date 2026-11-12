import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import api from "../../services/api";
import { LanguageProvider, useLanguage } from "../../i18n/LanguageContext";
import ReportsAnalytics from "./ReportsAnalytics";

// Mock the API module
jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

/** Minimal analytics API response matching reportsController output shape */
const mockData = {
  success: true,
  total_users: 42,
  active_users: 38,
  users_by_role: [
    { role: "SUPER_ADMIN", total: 1 },
    { role: "HEALTH_WORKER", total: 10 },
  ],
  district_facilities: [
    { district_id: 1, district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామ రాజు జిల్లా", total: 4, active: 3 },
  ],
  registration: {
    designation: [
      { designation: "ASHA", total: 5 },
      { designation: null, total: 2 },
    ],
    total: 10,
    pending: 3,
    approved: 6,
    rejected: 1,
  },
  account_setup: { pending_setup: 2, completed: 5, total: 7 },
  delivery: { email_sent: 7, email_failed: 1, sms_sent: 6, sms_failed: 2 },
  monthly_activity: [
    { month: "May", month_key: "2026-05", registrations: 2, users: 1, facilities: 0 },
  ],
  filters: {
    districts: [{ id: 1, name_en: "Alluri Sitharama Raju", name_te: "అల్లూరి సీతారామ రాజు జిల్లా" }],
    facilities: [{ id: 10, name_en: "PHC Paderu", name_te: "పాడేరు PHC", district_id: 1 }],
  },
};

// Helper: wraps component with LanguageProvider for language switching tests
function LanguageControls() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setLanguage("en")}>English</button>
      <button type="button" onClick={() => setLanguage("te")}>Telugu</button>
      <ReportsAnalytics />
    </>
  );
}

beforeEach(() => {
  localStorage.setItem("language", "en");
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: mockData });
});

test("renders page title and subtitle in English", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Reports & Analytics")).toBeInTheDocument();
  expect(
    screen.getByText("Authorized database statistics for Aarogya Drishti.")
  ).toBeInTheDocument();
});

test("renders summary metric cards with API values", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Total users")).toBeInTheDocument();
  expect(screen.getByText("42")).toBeInTheDocument();
  expect(screen.getByText("Active users")).toBeInTheDocument();
  expect(screen.getByText("38")).toBeInTheDocument();
});

test("renders designation label and null-designation fallback", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("ASHA")).toBeInTheDocument();
  expect(screen.getByText("Not specified")).toBeInTheDocument();
});

test("renders role labels via getRoleLabel in users-by-role chart", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Super administrator")).toBeInTheDocument();
  expect(screen.getByText("Health worker")).toBeInTheDocument();
});

test("renders email and SMS delivery metric cards", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Email sent")).toBeInTheDocument();
  expect(screen.getByText("Email failed")).toBeInTheDocument();
  expect(screen.getByText("SMS sent")).toBeInTheDocument();
  expect(screen.getByText("SMS failed")).toBeInTheDocument();
});

test("renders monthly activity table with API row data", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Monthly activity")).toBeInTheDocument();
  expect(screen.getByText("May")).toBeInTheDocument();
});

test("renders district dropdown with All districts option", async () => {
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("All districts")).toBeInTheDocument();
  expect(screen.getByText("All facilities")).toBeInTheDocument();
});

test("shows error message when API fails", async () => {
  api.get.mockRejectedValueOnce({
    response: { data: { message: "Server error" } },
  });
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("Server error")).toBeInTheDocument();
});

test("shows Telugu load-error fallback when API fails without message", async () => {
  localStorage.setItem("language", "te");
  api.get.mockRejectedValueOnce(new Error("Network error"));
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(await screen.findByText("విశ్లేషణలు లోడ్ కాలేదు.")).toBeInTheDocument();
});

test("shows empty-row messages when data arrays are empty", async () => {
  api.get.mockResolvedValueOnce({
    data: {
      ...mockData,
      district_facilities: [],
      registration: { ...mockData.registration, designation: [] },
      monthly_activity: [],
    },
  });
  render(
    <LanguageProvider>
      <ReportsAnalytics />
    </LanguageProvider>
  );
  expect(
    await screen.findByText("No district facility records found.")
  ).toBeInTheDocument();
  expect(
    screen.getByText("No Health Worker registration records found.")
  ).toBeInTheDocument();
  expect(screen.getByText("No monthly activity found.")).toBeInTheDocument();
});

test("switches all static labels to Telugu on language change", async () => {
  render(
    <LanguageProvider>
      <LanguageControls />
    </LanguageProvider>
  );

  // English first
  expect(await screen.findByText("Reports & Analytics")).toBeInTheDocument();

  // Switch to Telugu
  fireEvent.click(screen.getByRole("button", { name: "Telugu" }));

  expect(await screen.findByText("నివేదికలు & విశ్లేషణలు")).toBeInTheDocument();
  expect(screen.getByText("మొత్తం వినియోగదారులు")).toBeInTheDocument();
  expect(screen.getByText("క్రియాశీల వినియోగదారులు")).toBeInTheDocument();
  expect(screen.getByText("జిల్లా వారీ ఆరోగ్య కేంద్రాలు")).toBeInTheDocument();
  expect(screen.getByText("నెలవారీ కార్యకలాపాలు")).toBeInTheDocument();
  expect(screen.getByText("ఇమెయిల్ పంపబడింది")).toBeInTheDocument();
  // Role label in Telugu
  expect(screen.getByText("సూపర్ అడ్మిన్")).toBeInTheDocument();
  // Designation label in Telugu
  expect(screen.getByText("ఆశా కార్యకర్త")).toBeInTheDocument();
  expect(screen.getByText("పెండింగ్‌లో ఉంది")).toBeInTheDocument();
  expect(screen.getAllByText("అల్లూరి సీతారామ రాజు జిల్లా").length).toBeGreaterThan(0);

  // Switch back to English
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByText("Reports & Analytics")).toBeInTheDocument();
});
