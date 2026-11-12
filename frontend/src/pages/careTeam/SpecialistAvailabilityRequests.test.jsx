import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../services/api";
import SpecialistAvailabilityRequests from "./SpecialistAvailabilityRequests";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { permissions: ["appointment.slot_manage"] },
  }),
}));

const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function requestRecord(overrides = {}) {
  return {
    id: REQUEST_ID,
    referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patient_code: "SYNTH-PAT-008",
    referral_code: "SYNTH-REF-004",
    hospital_name: "Synthetic Area Hospital",
    specialty_name: "Synthetic ENT",
    requested_start: "2035-02-01T10:00:00.000Z",
    requested_end: "2035-02-01T10:30:00.000Z",
    status: "PENDING",
    teleconsult_consent_status: "ACTIVE",
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <SpecialistAvailabilityRequests />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: { requests: [requestRecord()] } });
  api.post.mockResolvedValue({ data: { success: true } });
});

test("shows referral details, consent and waiting status in the Specialist request section", async () => {
  renderPanel();

  expect(await screen.findByText("SYNTH-PAT-008")).toBeInTheDocument();
  expect(screen.getByText("SYNTH-REF-004")).toBeInTheDocument();
  expect(screen.getByText(/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/)).toBeInTheDocument();
  expect(screen.getByText(/Synthetic Area Hospital/)).toBeInTheDocument();
  expect(screen.getByText(/Synthetic ENT/)).toBeInTheDocument();
  expect(screen.getByText("Waiting for Specialist")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
});

test("accepts an availability request without booking a slot or consultation", async () => {
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Accept requested time" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/specialist/availability/requests/${REQUEST_ID}/respond`,
    { response: "ACCEPT" }
  ));
  expect(api.get).toHaveBeenCalledWith("/specialist/availability/requests");
  expect(await screen.findByText(/Hospital Staff must confirm the appointment/)).toBeInTheDocument();
});

test("suggests an alternative time without booking it", async () => {
  renderPanel();
  await screen.findByText("SYNTH-PAT-008");
  fireEvent.change(screen.getByLabelText("Alternative start"), {
    target: { value: "2035-02-02T10:00" },
  });
  fireEvent.change(screen.getByLabelText("Alternative end"), {
    target: { value: "2035-02-02T10:30" },
  });
  fireEvent.change(screen.getByLabelText("Response note (optional)"), {
    target: { value: "Synthetic schedule note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Suggest alternative time" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/specialist/availability/requests/${REQUEST_ID}/respond`,
    expect.objectContaining({
      response: "SUGGEST",
      proposed_start: new Date("2035-02-02T10:00").toISOString(),
      proposed_end: new Date("2035-02-02T10:30").toISOString(),
      reason: "Synthetic schedule note",
    })
  ));
});

test("declines an availability request with a reason", async () => {
  renderPanel();
  await screen.findByText("SYNTH-PAT-008");
  fireEvent.change(screen.getByLabelText("Reason for declining"), {
    target: { value: "Synthetic unavailable" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Decline request" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/specialist/availability/requests/${REQUEST_ID}/respond`,
    { response: "DECLINE", reason: "Synthetic unavailable" }
  ));
});

test("shows an empty state and allows retry after request loading fails", async () => {
  api.get.mockRejectedValueOnce({ response: { data: { message: "Synthetic network error" } } });
  renderPanel();

  expect(await screen.findByText("Synthetic network error")).toBeInTheDocument();
  api.get.mockResolvedValueOnce({ data: { requests: [] } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh slots" }));
  expect(await screen.findByText("There are no pending availability requests.")).toBeInTheDocument();
});
