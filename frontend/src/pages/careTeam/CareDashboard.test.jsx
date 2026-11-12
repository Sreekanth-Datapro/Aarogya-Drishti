import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../services/api";
import CareDashboard from "./CareDashboard";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { full_name: "Synthetic Specialist", permissions: ["referral.view"] } }),
}));
jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key) => key,
    tm: (message) => message,
    language: "en",
  }),
}));
jest.mock("./VideoNotConfigured", () => () => null);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <CareDashboard role="SPECIALIST" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("Specialist dashboard displays live assigned referral totals and pending cases", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/specialist/dashboard") {
      return Promise.resolve({
        data: { dashboard: { assigned: 3, pending: 2, urgent: 1, completed: 1 } },
      });
    }
    return Promise.resolve({
      data: {
        referrals: [{
          id: "synthetic-referral-id",
          patient_code: "SYNTH-PAT-001",
          referral_code: "SYNTH-REF-001",
          specialty_name: "Synthetic specialty",
          priority_name: "Urgent",
          priority_code: "URGENT",
        }],
      },
    });
  });

  renderDashboard();

  expect(await screen.findByText("SYNTH-PAT-001")).toBeInTheDocument();
  expect(screen.getAllByText("care.spStatAssigned").length).toBeGreaterThan(0);
  const summary = screen.getByRole("region", { name: "care.summaryTitle" });
  expect(within(summary).getByText("3")).toBeInTheDocument();
  expect(screen.getByText("SYNTH-REF-001 · Synthetic specialty")).toBeInTheDocument();
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith("/specialist/dashboard");
    expect(api.get).toHaveBeenCalledWith("/specialist/referrals", {
      params: { filter: "pending", page: 1, page_size: 5 },
    });
  });
});

test("Specialist dashboard shows a loading state while its requests are pending", () => {
  api.get.mockImplementation(() => new Promise(() => {}));

  renderDashboard();

  expect(screen.getByText("common.loading")).toBeInTheDocument();
});

test("Specialist dashboard shows the empty state when there are no referrals", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/specialist/dashboard") {
      return Promise.resolve({
        data: { dashboard: { assigned: 0, pending: 0, urgent: 0, completed: 0 } },
      });
    }
    return Promise.resolve({ data: { referrals: [] } });
  });

  renderDashboard();

  expect(await screen.findAllByText("care.noAssignedCases")).toHaveLength(2);
});

test("Specialist dashboard renders null and incomplete referral records safely", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/specialist/dashboard") {
      return Promise.resolve({ data: { dashboard: { pending: 1 } } });
    }
    return Promise.resolve({
      data: { referrals: [null, undefined, { id: "incomplete-referral" }] },
    });
  });

  renderDashboard();

  expect(await screen.findAllByText("common.notAvailable")).toHaveLength(6);
  expect(screen.getAllByText("common.notAvailable · common.notAvailable")).toHaveLength(3);
  expect(screen.getByText("care.noAssignedCases")).toBeInTheDocument();
});

test("Specialist dashboard shows a retry action rather than fabricated values when loading fails", async () => {
  api.get.mockRejectedValue(new Error("synthetic API failure"));

  renderDashboard();

  expect(await screen.findByText("care.dashboardLoadFailed")).toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "common.tryAgain" })).toBeInTheDocument();
});
