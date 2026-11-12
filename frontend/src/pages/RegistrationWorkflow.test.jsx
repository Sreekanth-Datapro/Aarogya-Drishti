import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RegistrationWorkflow from "./RegistrationWorkflow";
import RegistrationStatus from "./RegistrationStatus";
import api from "../services/api";
import { LanguageProvider } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

function renderPage(element, initialEntries = ["/"]) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>
    </LanguageProvider>
  );
}

const pendingRegistration = {
  id: "request-1",
  full_name: "Test Applicant",
  username: "test_worker",
  designation: "ASHA",
  mandal_id: 2,
  facility_name: "PHC One",
  mandal_name: "Mandal One",
  village_name: "Village One",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({
    user: {
      role: "MEDICAL_OFFICER",
      permissions: ["registration.recommend"],
    },
  });
});

test("Medical Officer cannot see final decision controls and must enter recommendation remarks", async () => {
  useAuth.mockReturnValue({
    user: { role: "MEDICAL_OFFICER", permissions: ["registration.recommend"] },
  });
  api.get.mockResolvedValue({ data: { registrations: [pendingRegistration] } });
  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  expect(await screen.findByText("Test Applicant")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Mandal One" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Final approval" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Recommend approval" }));
  expect(screen.getByText("Enter remarks before submitting a recommendation.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Mandatory recommendation remarks"), {
    target: { value: "Verified details" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Recommend approval" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/registrations/request-1/recommendation",
    { action: "RECOMMENDED", remarks: "Verified details" }
  ));
});

test("Medical Officer can submit NOT_RECOMMENDED with required remarks", async () => {
  api.get.mockResolvedValue({ data: { registrations: [pendingRegistration] } });
  api.post.mockResolvedValue({ data: { message: "Recommendation recorded" } });
  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  fireEvent.change(await screen.findByLabelText("Mandatory recommendation remarks"), {
    target: { value: "Please correct the submitted details" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Recommend rejection" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/registrations/request-1/recommendation",
    { action: "NOT_RECOMMENDED", remarks: "Please correct the submitted details" }
  ));
});

test("District Admin sees the MO recommendation and can submit a final decision", async () => {
  useAuth.mockReturnValue({
    user: {
      role: "DISTRICT_ADMIN",
      permissions: ["registration.monitor", "registration.finalize"],
    },
  });
  api.get.mockResolvedValue({
    data: {
      registrations: [{
        ...pendingRegistration,
        mo_recommendation: "RECOMMENDED",
        mo_recommendation_note: "Documents verified",
        mo_reviewer_name: "Medical Officer",
      }],
    },
  });
  api.patch.mockResolvedValue({ data: { message: "Registration approved" } });
  renderPage(<RegistrationWorkflow role="DISTRICT_ADMIN" />);

  expect(await screen.findByText("Documents verified")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Final approval" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/registrations/request-1/decision",
    { action: "APPROVE", rejection_reason: undefined }
  ));
});

test("only Medical Officers with recommendation permission load the MO queue", async () => {
  api.get.mockResolvedValue({ data: { registrations: [] } });
  useAuth.mockReturnValue({
    user: { role: "MEDICAL_OFFICER", permissions: ["registration.recommend"] },
  });

  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/registrations/medical-officer"));
  expect(api.get).not.toHaveBeenCalledWith("/registrations/district-admin");
});

test.each([
  ["HEALTH_WORKER", ["registration.recommend"]],
  ["DISTRICT_ADMIN", ["registration.recommend"]],
  ["SYSTEM_ADMIN", ["registration.recommend"]],
  ["SUPER_ADMIN", ["registration.recommend"]],
])("%s cannot mount the MO workflow or call its endpoint", async (actualRole, permissions) => {
  useAuth.mockReturnValue({ user: { role: actualRole, permissions } });

  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  expect(screen.getByText(
    "This workflow is unavailable until your account has the required permission and the reviewed registration schema is deployed."
  )).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});

test("Medical Officer without registration.recommend sees unavailable state and makes no request", () => {
  useAuth.mockReturnValue({ user: { role: "MEDICAL_OFFICER", permissions: [] } });

  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  expect(screen.getByText(
    "This workflow is unavailable until your account has the required permission and the reviewed registration schema is deployed."
  )).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});

test("District Admin workflow calls only its district endpoint with both required permissions", async () => {
  api.get.mockResolvedValue({ data: { registrations: [] } });
  useAuth.mockReturnValue({
    user: {
      role: "DISTRICT_ADMIN",
      permissions: ["registration.monitor", "registration.finalize"],
    },
  });

  renderPage(<RegistrationWorkflow role="DISTRICT_ADMIN" />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/registrations/district-admin"));
  expect(api.get).not.toHaveBeenCalledWith("/registrations/medical-officer");
});

test("Medical Officer can open recommendation history", async () => {
  api.get.mockResolvedValue({ data: { registrations: [] } });
  useAuth.mockReturnValue({
    user: { role: "MEDICAL_OFFICER", permissions: ["registration.recommend"] },
  });
  renderPage(<RegistrationWorkflow role="MEDICAL_OFFICER" />);

  fireEvent.click(screen.getByRole("button", { name: "Recommendation history" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
    "/registrations/medical-officer/history"
  ));
});

test("District Admin can open final decision history without decision controls", async () => {
  api.get.mockResolvedValue({ data: { registrations: [] } });
  useAuth.mockReturnValue({
    user: {
      role: "DISTRICT_ADMIN",
      permissions: ["registration.monitor", "registration.finalize"],
    },
  });
  renderPage(<RegistrationWorkflow role="DISTRICT_ADMIN" />);

  fireEvent.click(screen.getByRole("button", { name: "Decision history" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
    "/registrations/district-admin/history"
  ));
  expect(screen.queryByRole("button", { name: "Final approval" })).not.toBeInTheDocument();
});

test("applicant status page verifies a private token before showing application progress", async () => {
  api.post.mockResolvedValue({
    data: {
      status: "PENDING",
      submitted_at: "2026-01-01T00:00:00Z",
      recommendation: null,
    },
  });
  renderPage(
    <RegistrationStatus />,
    [{ pathname: "/registration-status", state: { statusToken: "private-token" } }]
  );

  expect(await screen.findByText("Pending review")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/registrations/status", {
    status_token: "private-token",
  });
});

test("legacy status page does not query or reveal applicant data without a token", () => {
  renderPage(<RegistrationStatus />);

  expect(screen.getByText(
    "Enter your private status token to securely view application progress. Tokenless legacy applications remain available for authorized staff review."
  )).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
