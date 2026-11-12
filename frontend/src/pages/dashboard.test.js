import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import MainLayout from "../components/MainLayout";
import Dashboard from "./Dashboard";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
}));

const masters = { districts: 1, mandals: 2, villages: 3, facilities: 4 };

function renderDashboardAs(user) {
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("user", JSON.stringify(user));

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function mockAdminDashboard(summaryResponse) {
  api.get.mockImplementation((path) => Promise.resolve(
    path === "/admin/district-admins"
      ? { data: { district_admins: [] } }
      : summaryResponse
  ));
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

test("a system admin sees master data, users by role and pending registrations", async () => {
  mockAdminDashboard({
    data: {
      masters,
      users_by_role: [
        { role: "SYSTEM_ADMIN", total: 1 },
        { role: "HEALTH_WORKER", total: 5 },
        { role: "SPECIALIST", total: 0 },
      ],
      pending_registrations: 2,
    },
  });

  renderDashboardAs({ full_name: "Sys Admin", role: "SYSTEM_ADMIN" });

  expect(api.get).toHaveBeenCalledWith("/dashboard/summary");
  expect(await screen.findByText("Total villages")).toBeInTheDocument();
  expect(screen.getByText("Location summary")).toBeInTheDocument();
  expect(screen.getByText("Active users by role")).toBeInTheDocument();
  expect(screen.getByText("Pending registrations")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Welcome, Sys Admin!" })).toBeInTheDocument();

  // Modules that are not built yet are shown but not clickable (sidebar marks them "Soon")
  expect(screen.getAllByText("Registration requests").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Soon").length).toBeGreaterThan(0);
});

test("a super admin sees database-backed administration overview and recent activity", async () => {
  mockAdminDashboard({
    data: {
      masters,
      facilities: { total: 4, active: 4, phc: 1, chc: 0, hospital: 2, other: 1 },
      patients_registered: 0,
      recent_activity: [
        { id: 1, event: "FACILITY_CREATED", outcome: "SUCCESS", occurred_at: "2026-10-31T10:00:00Z" },
        { id: 2, event: "SOMETHING_NEW", outcome: "DENIED", occurred_at: "2026-10-31T09:00:00Z" },
      ],
      system: {
        status: "healthy",
        app_version: "1.0.0",
        database: "PostgreSQL 18.0",
        uptime_seconds: 3700,
        last_lgd_import_at: null,
      },
    },
  });

  renderDashboardAs({ full_name: "Super", role: "SUPER_ADMIN", permissions: ["master.view", "master.manage"] });

  expect(await screen.findByText("Administration Overview")).toBeInTheDocument();
  expect(screen.getByText("Total facilities")).toBeInTheDocument();
  expect(screen.getByText("District-wise Overview")).toBeInTheDocument();

  // Known audit events get a friendly label, unknown ones are made readable
  // (same labels as displayLabels.test.js: "Facility created", "new custom event" style)
  expect(screen.getByText("Facility created")).toBeInTheDocument();
  expect(screen.getByText("something new")).toBeInTheDocument();

  expect(screen.getByText("v1.0.0")).toBeInTheDocument();
  expect(screen.getByText("PostgreSQL 18.0")).toBeInTheDocument();
  expect(screen.getByText("System healthy")).toBeInTheDocument();

  expect(screen.getAllByRole("link", { name: /District Admin Management/ }).some((link) => link.getAttribute("href") === "/admin/district-admins")).toBe(true);
  expect(screen.getAllByRole("link", { name: /Custom Roles & Permissions/ }).some((link) => link.getAttribute("href") === "/admin/roles")).toBe(true);
  expect(screen.getAllByRole("link", { name: /Location Management/ }).some((link) => link.getAttribute("href") === "/admin/locations")).toBe(true);
  expect(screen.getAllByRole("link", { name: /Facility Management/ }).some((link) => link.getAttribute("href") === "/admin/facilities")).toBe(true);
});

test("a health worker gets their own dashboard and no admin blocks", async () => {
  api.get.mockImplementation((path) => Promise.resolve({
    data: {
      "/patients/summary": {
        summary: {
          total: 7, this_month: 3, today: 2, screening_consented: 5, last_7_days: [{ day: "2026-11-07", count: 2 }],
          by_village: [{ village_name: "Addulu", count: 4 }, { village_name: "Kinchumanda", count: 3 }],
          by_sex: [{ sex: "FEMALE", count: 4 }, { sex: "MALE", count: 3 }],
          by_age_group: [{ age_group: "40_59", count: 7 }],
        },
      },
      "/patients/registration-options": {
        mandals: [{ mandal_id: 4, mandal_name: "Paderu", district_name: "Alluri Sitharama Raju", villages: [{ id: 5, name_en: "Addulu" }, { id: 8, name_en: "Kinchumanda" }], facilities: [] }],
      },
      "/patients/mine": { patients: [{ id: "p-1", patient_code: "AD-1", full_name: "Demo Patient", sex: "FEMALE", age_years: 40, village_name: "Addulu", created_at: "2026-11-07T00:00:00Z", screening_consent: true }] },
    }[path] || {},
  }));

  renderDashboardAs({ full_name: "Asha", role: "HEALTH_WORKER" });

  expect(await screen.findByRole("heading", { name: "Namaste, Asha" })).toBeInTheDocument();
  expect(screen.getByText("My patients")).toBeInTheDocument();
  expect(screen.getByText("7", { selector: ".stat-value" })).toBeInTheDocument();
  expect(screen.getByText("Screening consent given")).toBeInTheDocument();
  expect(screen.getByText("5", { selector: ".stat-value" })).toBeInTheDocument();
  // District and Mandal come from the assignment; the analysis charts show the worker's own patients
  expect(screen.getByText(/Paderu · Alluri Sitharama Raju/)).toBeInTheDocument();
  expect(screen.getByText("My patients by village")).toBeInTheDocument();
  expect(screen.getByText("Addulu", { selector: ".bar-label" })).toBeInTheDocument();
  expect(screen.getByText("40–59 years", { selector: ".bar-label" })).toBeInTheDocument();
  expect(screen.getByText("Female", { selector: ".bar-label" })).toBeInTheDocument();
  expect(screen.getByText("71%")).toBeInTheDocument();
  expect(screen.getByText("Demo Patient")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Register a patient/ })).toHaveAttribute("href", "/health-worker/patients");
  expect(api.get).toHaveBeenCalledWith("/patients/summary");
  expect(screen.queryByText("Active users by role")).not.toBeInTheDocument();
  expect(screen.queryByText("Programme indicators")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
  expect(screen.queryByText("System information")).not.toBeInTheDocument();
  expect(screen.queryByText("Total facilities")).not.toBeInTheDocument();
  expect(screen.getAllByText("Patient registration").length).toBeGreaterThan(0);
});

test("a Medical Officer has a link to the recommendation-only registration workflow", async () => {
  api.get.mockResolvedValue({ data: { masters } });

  renderDashboardAs({
    full_name: "Medical Officer",
    role: "MEDICAL_OFFICER",
    permissions: ["registration.monitor"],
  });

  const registrationLinks = await screen.findAllByRole("link", { name: "Health Worker Registrations" });
  registrationLinks.forEach((link) => expect(link).toHaveAttribute("href", "/medical-officer/registrations"));
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  expect(screen.queryByText("Active users by role")).not.toBeInTheDocument();
});

test("a load error shows a message and can be retried", async () => {
  api.get.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ data: { masters } });

  // SYSTEM_ADMIN still uses the shared Dashboard error/retry path
  renderDashboardAs({ full_name: "Ravi", role: "SYSTEM_ADMIN" });

  expect(await screen.findByText("Could not load dashboard data.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Total villages")).toBeInTheDocument();
});

test("the mobile menu button opens and closes the sidebar", async () => {
  mockAdminDashboard({
    data: {
      masters,
      users_by_role: [{ role: "SYSTEM_ADMIN", total: 1 }],
      pending_registrations: 0,
    },
  });
  renderDashboardAs({ full_name: "Ravi", role: "SYSTEM_ADMIN" });

  const menuButton = screen.getByRole("button", { name: "Open menu" });
  expect(menuButton).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("complementary", { name: "Main menu" })).toHaveClass("open");

  fireEvent.keyDown(window, { key: "Escape" });
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await screen.findByText("Total villages");
});

test("Hospital Staff are routed to their dedicated dashboard instead of the shared admin dashboard", async () => {
  api.get.mockResolvedValue({ data: { appointments: [] } });
  renderDashboardAs({ full_name: "Ravi", role: "HOSPITAL_STAFF" });

  // Shared admin "Villages" metrics must not appear for HOSPITAL_STAFF
  expect(screen.queryByText("Total villages")).not.toBeInTheDocument();
  expect(screen.queryByText("Could not load dashboard data.")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Open menu" })).toBeInTheDocument();
});
