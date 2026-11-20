import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MobileBottomNavigation from "./MobileBottomNavigation";

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

function renderNavigation(user) {
  return render(
    <MemoryRouter>
      <MobileBottomNavigation user={user} />
    </MemoryRouter>
  );
}

describe("mobile bottom navigation", () => {
  test("includes dashboard and only routes granted to a custom role", () => {
    renderNavigation({
      role: "CUSTOM_AUDITOR",
      permissions: ["page.reports"],
    });

    expect(screen.getByRole("navigation", { name: "nav.mobileNavigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "nav.dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "modules.reports.title" })).toHaveAttribute("href", "/admin/reports");
    expect(screen.queryByRole("link", { name: "modules.facilities.title" })).not.toBeInTheDocument();
  });

  test("limits role shortcuts to three while keeping the rest in the existing menu", () => {
    renderNavigation({ role: "HEALTH_WORKER", permissions: [] });

    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "modules.healthWorkerPatientSearch.title" }))
      .toHaveAttribute("href", "/health-worker/patient-search");
    expect(screen.getByRole("link", { name: "modules.healthWorkerPatients.title" }))
      .toHaveAttribute("href", "/health-worker/patients");
    expect(screen.getByRole("link", { name: "modules.screening.title" }))
      .toHaveAttribute("href", "/health-worker/screening");
  });

  test("keeps System Administrator shortcuts aligned with its existing sidebar", () => {
    renderNavigation({ role: "SYSTEM_ADMIN", permissions: [] });

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "modules.facilities.title" }))
      .toHaveAttribute("href", "/admin/facilities");
    expect(screen.getByRole("link", { name: "modules.roleManagement.title" }))
      .toHaveAttribute("href", "/admin/roles");
    expect(screen.queryByRole("link", { name: "modules.diagnosticTestMaster.title" }))
      .not.toBeInTheDocument();
  });
});
