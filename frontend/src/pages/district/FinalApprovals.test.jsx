import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import api from "../../services/api";
import FinalApprovals from "./FinalApprovals";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
}));

const base = {
  phone: "9876500000",
  designation: "ANM",
  status: "PENDING",
  created_at: "2026-11-01T09:00:00Z",
  district_name: "Alluri Sitharama Raju",
  mandal_name: "G. Madugula",
  village_name: "Addulu",
  facility_name: "PHC G. Madugula",
  mo_reviewer_name: "Dr. Rao",
  mo_recommended_by: "mo-1",
  mo_recommended_at: "2026-11-06T11:00:00Z",
};
const recommended = { ...base, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Asha One", username: "asha.one", mo_recommendation: "RECOMMENDED", mo_recommendation_note: "Documents verified" };
const notRecommended = { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", full_name: "Asha Two", username: "asha.two", mo_recommendation: "NOT_RECOMMENDED", mo_recommendation_note: "Village does not match" };

function mockApi({ workflow = { two_stage: true, can_finalize: true }, registrations = [recommended, notRecommended], history = [], awaiting = 2 } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/registrations/district-admin") {
      return Promise.resolve({ data: { registrations, workflow, awaiting_mo_review: awaiting } });
    }
    if (url === "/registrations/district-admin/history") return Promise.resolve({ data: { registrations: history } });
    return Promise.reject(new Error("unexpected"));
  });
}

const cardOf = (name) => screen.getAllByRole("article").find((card) => within(card).queryByRole("heading", { name }));
const resultPanel = async (text) => {
  await screen.findByText(text);
  return screen.getAllByRole("status").find((panel) => within(panel).queryByText(text));
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows BOTH Medical Officer outcomes with remarks, reviewer and all application details", async () => {
  mockApi();
  render(<FinalApprovals />);

  await screen.findByText("Asha One");
  const first = cardOf("Asha One");
  expect(within(first).getByText("Recommended by Medical Officer")).toBeInTheDocument();
  expect(within(first).getByText("Documents verified")).toBeInTheDocument();
  expect(within(first).getByText("Awaiting District Admin Final Decision")).toBeInTheDocument();
  for (const text of ["Alluri Sitharama Raju", "G. Madugula", "Addulu", "PHC G. Madugula", "9876500000"]) {
    expect(within(first).getByText(text)).toBeInTheDocument();
  }
  expect(within(first).getByText(/Dr\. Rao/)).toBeInTheDocument();

  const second = cardOf("Asha Two");
  expect(within(second).getByText("Not Recommended by Medical Officer")).toBeInTheDocument();
  expect(within(second).getByText("Village does not match")).toBeInTheDocument();
  // A NOT RECOMMENDED application can still be finally approved
  expect(within(second).getByRole("button", { name: "Final approve" })).toBeEnabled();
  expect(within(second).getByRole("button", { name: "Final reject" })).toBeEnabled();
});

test("the recommendation filter narrows the list without hiding anything by default", async () => {
  mockApi();
  render(<FinalApprovals />);
  await screen.findByText("Asha One");

  fireEvent.click(screen.getByRole("button", { name: "Not recommended" }));
  expect(screen.queryByText("Asha One")).not.toBeInTheDocument();
  expect(screen.getByText("Asha Two")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("Asha One")).toBeInTheDocument();
});

test("final approval asks for confirmation and then shows the activated account", async () => {
  mockApi();
  api.patch.mockResolvedValue({
    data: {
      success: true,
      decision: { id: notRecommended.id, status: "APPROVED", account: { user_id: "12345678-aaaa-4bbb-8ccc-000000000000", username: "asha.two", status: "ACTIVE" } },
    },
  });
  render(<FinalApprovals />);
  await screen.findByText("Asha Two");

  fireEvent.click(within(cardOf("Asha Two")).getByRole("button", { name: "Final approve" }));
  const dialog = screen.getByRole("dialog", { name: "Confirm final approval" });
  expect(within(dialog).getByText(/creates an active Health Worker account with the username asha\.two/)).toBeInTheDocument();
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve and activate account" }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    `/registrations/${notRecommended.id}/decision`,
    { action: "APPROVE", rejection_reason: undefined }
  ));
  const result = await resultPanel("Asha Two was finally approved");
  expect(within(result).getByText(/Account active/)).toBeInTheDocument();
  expect(within(result).getByText("asha.two")).toBeInTheDocument();
  expect(within(result).getByText("12345678")).toBeInTheDocument();
});

test("final rejection requires a reason before it can be confirmed", async () => {
  mockApi();
  api.patch.mockResolvedValue({ data: { success: true, decision: { status: "REJECTED", rejection_reason: "Not eligible", account: null } } });
  render(<FinalApprovals />);
  await screen.findByText("Asha One");

  fireEvent.click(within(cardOf("Asha One")).getByRole("button", { name: "Final reject" }));
  const dialog = screen.getByRole("dialog", { name: "Confirm final rejection" });
  const confirm = within(dialog).getByRole("button", { name: "Reject application" });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Rejection reason/), { target: { value: "   " } });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Rejection reason/), { target: { value: "Not eligible" } });
  fireEvent.click(confirm);

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    `/registrations/${recommended.id}/decision`,
    { action: "REJECT", rejection_reason: "Not eligible" }
  ));
  const result = await resultPanel("Asha One was finally rejected");
  expect(within(result).getByText("Rejection reason: Not eligible")).toBeInTheDocument();
});

test("decision history shows final status, account activation and rejection reason without decision buttons", async () => {
  mockApi({
    history: [
      { ...recommended, status: "APPROVED", reviewed_at: "2026-11-07T12:00:00Z", decision_maker_name: "DA User", account_status: "ACTIVE", created_username: "asha.one" },
      { ...notRecommended, status: "REJECTED", reviewed_at: "2026-11-07T12:30:00Z", decision_maker_name: "DA User", rejection_reason: "Duplicate application" },
    ],
  });
  render(<FinalApprovals />);
  await screen.findByText("Asha One");

  fireEvent.click(screen.getByRole("tab", { name: "Decision history" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/registrations/district-admin/history"));
  expect(await screen.findByText("Finally Approved")).toBeInTheDocument();
  expect(screen.getByText("Finally Rejected")).toBeInTheDocument();
  expect(screen.getByText(/Account active/)).toBeInTheDocument();
  expect(screen.getByText("Rejection reason: Duplicate application")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Final approve" })).not.toBeInTheDocument();
});

test("before the two-stage update, the page explains why no decision is possible", async () => {
  mockApi({ workflow: { two_stage: false, can_finalize: false }, registrations: [], awaiting: 4 });
  render(<FinalApprovals />);

  expect(await screen.findByText(/Final decisions become available after the two-stage registration update is installed\. 4 applications/)).toBeInTheDocument();
  expect(screen.getByText("No applications are waiting for your final decision.")).toBeInTheDocument();
});

test("a District Admin without the finalize permission cannot use the decision buttons", async () => {
  mockApi({ workflow: { two_stage: true, can_finalize: false } });
  render(<FinalApprovals />);
  await screen.findByText("Asha One");

  expect(screen.getByText("Your account can view these applications but cannot make final decisions.")).toBeInTheDocument();
  screen.getAllByRole("button", { name: /Final (approve|reject)/ }).forEach((button) => expect(button).toBeDisabled());
});
