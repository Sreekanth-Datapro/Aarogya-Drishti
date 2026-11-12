import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { LanguageProvider } from "../../i18n/LanguageContext";
import MainLayout from "../MainLayout";
import Sidebar from "./Sidebar";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

const MENU_EN = [
  "Dashboard",
  "Health Worker Registrations",
  "My Mandal Patients",
  "Patient Screening Queue",
  "Clinical Review",
  "Oral Image Review",
  "Clinical Notes & Sign-off",
  "Referrals",
  "Follow-up Management",
  "Reports",
  "My Profile",
];

const MENU_TE = [
  "డాష్‌బోర్డ్",
  "ఆరోగ్య కార్యకర్తల నమోదులు",
  "నా మండల రోగులు",
  "రోగుల స్క్రీనింగ్ క్యూ",
  "క్లినికల్ సమీక్ష",
  "నోటి చిత్రాల సమీక్ష",
  "క్లినికల్ నోట్స్ & సంతకం",
  "రిఫరల్స్",
  "ఫాలో-అప్ నిర్వహణ",
  "నివేదికలు",
  "నా ప్రొఫైల్",
];

// Menu labels in display order ("Soon" is removed from disabled items)
function menuLabels(soonText) {
  return screen.getAllByText(/./, { selector: ".sidebar-nav-label" })
    .map((label) => label.textContent.replace(soonText, "").trim());
}

const MEDICAL_OFFICER = {
  id: "mo-1",
  full_name: "Dr Ravi",
  role: "MEDICAL_OFFICER",
  permissions: ["registration.recommend", "review.create", "review.sign"],
};

// Every Medical Officer screen is implemented, so every item is a link
const LINKS = {
  Dashboard: "/dashboard",
  "Health Worker Registrations": "/medical-officer/registrations",
  "My Mandal Patients": "/medical-officer/patients",
  "Patient Screening Queue": "/medical-officer/queue",
  "Clinical Review": "/medical-officer/review",
  "Oral Image Review": "/medical-officer/images",
  "Clinical Notes & Sign-off": "/medical-officer/notes",
  Referrals: "/medical-officer/referrals",
  "Follow-up Management": "/medical-officer/followups",
  Reports: "/medical-officer/reports",
  "My Profile": "/medical-officer/profile",
};

function mockCounts() {
  api.get.mockImplementation((url) => {
    if (url === "/medical-officer/cases") {
      return Promise.resolve({ data: { cases: [{ id: "p-1" }, { id: "p-2" }] } });
    }
    if (url === "/registrations/medical-officer") {
      return Promise.resolve({
        data: { registrations: [{ id: "r-1", mo_recommended_by: null }, { id: "r-2", mo_recommended_by: "mo-1" }] },
      });
    }
    return Promise.reject(new Error("unexpected"));
  });
}

function sidebar(user, props = {}) {
  return <Sidebar user={user} open={false} onClose={() => {}} onLogout={() => {}} {...props} />;
}

function renderSidebar(user, { path = "/dashboard", ...props } = {}) {
  return render(<MemoryRouter initialEntries={[path]}>{sidebar(user, props)}</MemoryRouter>);
}

const menu = () => within(screen.getByRole("navigation"));
// Link names include the badge text, e.g. "Patient Screening Queue 2"
const link = (name) => menu().getByRole("link", { name: new RegExp(`^${name.replace(/[&]/g, "\\$&")}`) });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

test("all 11 Medical Officer modules are working links and none is marked Soon", async () => {
  mockCounts();
  renderSidebar(MEDICAL_OFFICER);
  await menu().findByLabelText("2 pending");

  Object.entries(LINKS).forEach(([name, path]) => expect(link(name)).toHaveAttribute("href", path));
  expect(menu().queryByText("Soon")).not.toBeInTheDocument();
});

test("badges show real API counts: unrecommended applications and unclaimed screenings", async () => {
  mockCounts();
  renderSidebar(MEDICAL_OFFICER);

  await waitFor(() => expect(within(link("Patient Screening Queue")).getByLabelText("2 pending")).toHaveTextContent("2"));
  expect(within(link("Health Worker Registrations")).getByLabelText("1 pending")).toHaveTextContent("1");
  expect(api.get).toHaveBeenCalledWith("/medical-officer/cases", { params: { view: "available" } });
  expect(api.get).toHaveBeenCalledWith("/registrations/medical-officer");
});

test("queue badge uses the paginated server total instead of the current page size", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/medical-officer/cases") {
      return Promise.resolve({
        data: { cases: [{ id: "p-1" }], pagination: { total: 27 } },
      });
    }
    return Promise.resolve({ data: { registrations: [] } });
  });
  renderSidebar({ ...MEDICAL_OFFICER, permissions: [] });

  await menu().findByLabelText("27 pending");
  expect(within(link("Patient Screening Queue")).getByLabelText("27 pending")).toHaveTextContent("27");
});

test("no badge when the API fails, and the registrations API is not called without permission", async () => {
  api.get.mockRejectedValue(new Error("network"));
  renderSidebar({ ...MEDICAL_OFFICER, permissions: [] });

  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  expect(api.get).not.toHaveBeenCalledWith("/registrations/medical-officer");
  expect(menu().queryByLabelText(/pending/)).not.toBeInTheDocument();
});

test("the current page is highlighted", async () => {
  mockCounts();
  renderSidebar(MEDICAL_OFFICER, { path: "/medical-officer/queue" });
  await menu().findByLabelText("2 pending");

  expect(link("Patient Screening Queue")).toHaveClass("active");
  expect(link("Dashboard")).not.toHaveClass("active");
});

test("the collapse button switches to icon-only mode with tooltips", async () => {
  mockCounts();
  const onToggleCollapse = jest.fn();
  const { rerender } = renderSidebar(MEDICAL_OFFICER, { onToggleCollapse });
  await menu().findByLabelText("2 pending");

  fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
  expect(onToggleCollapse).toHaveBeenCalledTimes(1);

  rerender(<MemoryRouter>{sidebar(MEDICAL_OFFICER, { collapsed: true, onToggleCollapse })}</MemoryRouter>);
  expect(screen.getByRole("complementary")).toHaveClass("collapsed");
  expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
  expect(link("Patient Screening Queue")).toHaveAttribute("title", "Patient Screening Queue");
});

test("all 11 Medical Officer items appear in the requested order without a sidebar logout action", async () => {
  mockCounts();
  renderSidebar(MEDICAL_OFFICER);
  await menu().findByLabelText("2 pending");

  expect(menuLabels("Soon")).toEqual(MENU_EN);
  expect(menu().queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
});

test("the menu is fully translated in Telugu mode", async () => {
  mockCounts();
  localStorage.setItem("language", "te");
  render(
    <LanguageProvider>
      <MemoryRouter>{sidebar(MEDICAL_OFFICER, { onToggleCollapse: () => {} })}</MemoryRouter>
    </LanguageProvider>
  );
  await menu().findByLabelText("2 పెండింగ్‌లో ఉన్నాయి");

  const labels = menuLabels("త్వరలో");
  expect(labels.slice(0, MENU_TE.length)).toEqual(MENU_TE);
  expect(menu().queryByText("త్వరలో")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "మెనూను కుదించండి" })).toBeInTheDocument();
  expect(screen.getByText("రోగులు")).toBeInTheDocument();
  expect(screen.getByText("వైద్య పని")).toBeInTheDocument();
  expect(screen.getByText("చికిత్స సమన్వయం")).toBeInTheDocument();
});

test("mobile drawer: open state, close button and closing after choosing a page", async () => {
  mockCounts();
  const onClose = jest.fn();
  render(<MemoryRouter>{sidebar(MEDICAL_OFFICER, { open: true, onClose })}</MemoryRouter>);
  await menu().findByLabelText("2 pending");

  expect(screen.getByRole("complementary")).toHaveClass("open");
  fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
  fireEvent.click(link("Patient Screening Queue"));
  expect(onClose).toHaveBeenCalledTimes(2);
});

describe("layout collapse setting", () => {
  function renderLayout(user) {
    useAuth.mockReturnValue({ user, logout: jest.fn() });
    return render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<p>page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  test("dashboard roles can collapse and expand, and the choice is remembered", async () => {
    mockCounts();
    const { unmount } = renderLayout(MEDICAL_OFFICER);
    await menu().findByLabelText("2 pending");

    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(screen.getByRole("complementary")).toHaveClass("collapsed");
    expect(localStorage.getItem("sidebarCollapsed")).toBe("true");
    unmount();

    renderLayout(MEDICAL_OFFICER);
    await menu().findByLabelText("2 pending");
    expect(screen.getByRole("complementary")).toHaveClass("collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));
    expect(screen.getByRole("complementary")).not.toHaveClass("collapsed");
    expect(localStorage.getItem("sidebarCollapsed")).toBe("false");
  });

  test("a stored collapsed setting is available to other roles", () => {
    localStorage.setItem("sidebarCollapsed", "true");
    renderLayout({ id: "da-1", full_name: "Ravi", role: "DISTRICT_ADMIN", permissions: [] });

    expect(screen.getByRole("complementary")).toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith("/medical-officer/cases", expect.anything());
    expect(api.get).not.toHaveBeenCalledWith("/registrations/medical-officer");
  });
});

test("other roles keep their own menu and never call the Medical Officer APIs", () => {
  renderSidebar({ id: "hw-1", full_name: "Lakshmi", role: "HEALTH_WORKER", permissions: [] });

  expect(menu().queryByText("Patient Screening Queue")).not.toBeInTheDocument();
  expect(menu().queryByText("Health Worker Registrations")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Collapse menu" })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
