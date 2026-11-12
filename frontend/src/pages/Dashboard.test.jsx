import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import api from "../services/api";

let mockUser;

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock("../i18n/LanguageContext", () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("../components/dashboard/DashboardBanner", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/SummaryTiles", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/AnalyticsOverview", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/FacilityDistributionCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/UserDistributionCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/RecentActivity", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/RegistrationRequestsCard", () => ({
  __esModule: true,
  default: () => <div data-testid="registration-requests-card" />,
}));
jest.mock("../components/dashboard/DistrictOverviewCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/SystemStatusCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/FacilitySummary", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/LocationSummary", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/dashboard/QuickActions", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/ui", () => ({
  Alert: ({ children }) => <div>{children}</div>,
  Card: ({ children }) => <div>{children}</div>,
  StatCard: ({ label, value }) => <div>{label}: {value}</div>,
}));

function renderDashboard(user) {
  mockUser = user;
  api.get.mockImplementation((path) => {
    if (path === "/dashboard/summary") {
      return Promise.resolve({ data: { success: true, masters: {} } });
    }
    if (path === "/admin/rbac/dashboard") {
      return Promise.resolve({
        data: {
          metrics: { total_users: 10, active_users: 8, inactive_users: 2, total_roles: 7, total_permissions: 28, custom_roles: 1 },
          activities: [],
        },
      });
    }
    return Promise.resolve({ data: { district_admins: [] } });
  });

  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("SYSTEM_ADMIN without registration.monitor does not see the registration card", async () => {
  renderDashboard({ role: "SYSTEM_ADMIN", permissions: [] });

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/dashboard/summary"));
  expect(screen.queryByTestId("registration-requests-card")).not.toBeInTheDocument();
});

test("a role with registration.monitor can see the registration card", async () => {
  renderDashboard({ role: "SUPER_ADMIN", permissions: ["registration.monitor"] });

  expect(await screen.findByTestId("registration-requests-card")).toBeInTheDocument();
});

test("Super Admin dashboard loads its RBAC metrics from the backend", async () => {
  renderDashboard({ role: "SUPER_ADMIN", permissions: [] });
  expect(await screen.findByText("dashboard.rbacOverview")).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/rbac/dashboard"));
  expect(screen.getByText("dashboard.rbacTotalUsers: 10")).toBeInTheDocument();
  expect(screen.getByText("dashboard.rbacInactiveUsers: 2")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /dashboard.manageAccess/ })).toHaveAttribute("href", "/admin/roles");
});
