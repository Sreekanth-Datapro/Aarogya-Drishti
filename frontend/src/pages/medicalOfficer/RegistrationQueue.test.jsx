import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../services/api";
import RegistrationQueue from "./RegistrationQueue";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const applicant = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Lakshmi Devi",
  username: "lakshmi.asha",
  phone: "9876500000",
  email: null,
  designation: "ASHA",
  employee_ref: "EMP-12",
  status: "PENDING",
  created_at: "2026-11-05T10:00:00Z",
  workflow_version: null,
  mandal_id: 2,
  district_name: "Alluri Sitharama Raju",
  mandal_name: "G. Madugula",
  village_name: "Addulu",
  facility_name: "PHC G. Madugula",
  mo_recommended_by: null,
  mo_recommendation: null,
};

function mockApi(workflow, history = []) {
  api.get.mockImplementation((url) => {
    if (url === "/registrations/medical-officer") {
      return Promise.resolve({ data: { registrations: [applicant], workflow } });
    }
    if (url === "/registrations/medical-officer/history") {
      return Promise.resolve({ data: { registrations: history } });
    }
    if (url === `/registrations/medical-officer/requests/${applicant.id}`) {
      return Promise.resolve({
        data: {
          registration: applicant,
          history: [{ event: "REGISTRATION_SUBMITTED", occurred_at: "2026-11-05T10:00:00Z", actor_role: null }],
          workflow,
        },
      });
    }
    return Promise.reject(new Error("unexpected"));
  });
}

const renderQueue = () => render(<MemoryRouter><RegistrationQueue /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
});

test("compatibility applicants (workflow_version NULL) are shown with all details, but recommending is disabled", async () => {
  mockApi({ two_stage: false, can_recommend: false });
  renderQueue();

  const row = await screen.findByRole("row", { name: /Lakshmi Devi/ });
  for (const text of ["lakshmi.asha", "9876500000", "Addulu", "G. Madugula · Alluri Sitharama Raju", "PHC G. Madugula"]) {
    expect(within(row).getByText(text)).toBeInTheDocument();
  }
  expect(within(row).getByRole("button", { name: "Recommend" })).toBeDisabled();
  expect(within(row).getByRole("button", { name: "Not recommend" })).toBeDisabled();
  expect(screen.getByText(/Recommendations can be submitted after the two-stage registration update/)).toBeInTheDocument();
});

test("view details shows the application and its review history", async () => {
  mockApi({ two_stage: false, can_recommend: false });
  renderQueue();

  fireEvent.click(await screen.findByRole("button", { name: /View details/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("EMP-12")).toBeInTheDocument();
  expect(within(dialog).getByText("Registration submitted")).toBeInTheDocument();
});

test("Recommend opens a confirmation form that requires remarks, then shows the saved recommendation", async () => {
  mockApi({ two_stage: true, can_recommend: true });
  api.post.mockResolvedValue({
    data: {
      success: true,
      recommendation: { status: "PENDING", mo_recommendation: "RECOMMENDED", mo_recommendation_note: "Documents verified at PHC", mo_recommended_at: "2026-11-07T10:00:00Z" },
    },
  });
  renderQueue();

  await screen.findByText("Lakshmi Devi");
  expect(screen.queryByRole("button", { name: /Final approve|Final reject|^Approve|^Reject/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Recommend" }));
  const dialog = screen.getByRole("dialog", { name: "Confirm: Recommend this application" });
  expect(within(dialog).getByText(/This is not a final decision/)).toBeInTheDocument();
  const save = within(dialog).getByRole("button", { name: "Save recommendation" });
  expect(save).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Remarks/), { target: { value: "  " } });
  expect(save).toBeDisabled();

  fireEvent.change(within(dialog).getByLabelText(/Remarks/), { target: { value: "Documents verified at PHC" } });
  fireEvent.click(save);

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/registrations/${applicant.id}/recommendation`,
    { action: "RECOMMENDED", remarks: "Documents verified at PHC" }
  ));
  await screen.findByText("Recommendation for Lakshmi Devi saved");
  const saved = screen.getAllByRole("status").find((panel) => within(panel).queryByText("Recommendation for Lakshmi Devi saved"));
  expect(within(saved).getByText("Recommended by Medical Officer")).toBeInTheDocument();
  expect(within(saved).getByText("Awaiting District Admin Final Decision")).toBeInTheDocument();
  expect(within(saved).getByText("Documents verified at PHC")).toBeInTheDocument();
});

test("Not recommend also requires remarks and is sent as NOT_RECOMMENDED", async () => {
  mockApi({ two_stage: true, can_recommend: true });
  api.post.mockResolvedValue({ data: { success: true } });
  renderQueue();

  fireEvent.click(await screen.findByRole("button", { name: "Not recommend" }));
  const dialog = screen.getByRole("dialog", { name: "Confirm: Do not recommend this application" });
  fireEvent.change(within(dialog).getByLabelText(/Remarks/), { target: { value: "Facility does not match" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save recommendation" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/registrations/${applicant.id}/recommendation`,
    { action: "NOT_RECOMMENDED", remarks: "Facility does not match" }
  ));
});

test("My recommendations shows saved remarks and the District Admin's final status", async () => {
  mockApi({ two_stage: true, can_recommend: true }, [
    { ...applicant, mo_recommended_by: "mo-1", mo_recommendation: "NOT_RECOMMENDED", mo_recommendation_note: "Wrong village", status: "APPROVED" },
  ]);
  renderQueue();
  await screen.findByText("Lakshmi Devi");

  fireEvent.click(screen.getByRole("tab", { name: "My recommendations" }));
  expect(await screen.findByText("Wrong village")).toBeInTheDocument();
  expect(screen.getByText("Not Recommended by Medical Officer")).toBeInTheDocument();
  expect(screen.getByText("Finally Approved")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Recommend" })).not.toBeInTheDocument();
});
