import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import DistrictHealthWorkers from "./DistrictHealthWorkers";
import DistrictPatients from "./DistrictPatients";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const WORKER_ID = "5b8e1c2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d";
const workers = [
  {
    id: WORKER_ID, username: "rajilaxmi", full_name: "Raji", phone: "9807654321", designation: "ASHA", status: "ACTIVE",
    last_login_at: "2026-11-06T09:00:00Z", has_location: true, patient_count: 3,
    village_name: "A.Bandaveedhi", mandal_name: "G. Madugula", facility_name: "PHC G. Madugula",
  },
  {
    id: "6c9f2d3b-4e5a-4b6c-9d7e-8f9a0b1c2d3e", username: "sita.anm", full_name: "Sita", phone: null, designation: "ANM", status: "PENDING_SETUP",
    last_login_at: null, has_location: false, patient_count: 0,
  },
];

function mockApi() {
  api.get.mockImplementation((url) => {
    if (url === "/district/mandals") return Promise.resolve({ data: { mandals: [{ id: 7, name_en: "G. Madugula" }] } });
    if (url === "/district/health-workers") {
      return Promise.resolve({
        data: {
          health_workers: workers,
          summary: { total: 2, active: 1, without_location: 1, patients: 3 },
          pagination: { page: 1, total: 2, total_pages: 1 },
        },
      });
    }
    if (url === "/facilities") return Promise.resolve({ data: { facilities: [] } });
    if (url === "/district/patients") {
      return Promise.resolve({ data: { patients: [], summary: { total: 0 }, pagination: { page: 1, total: 0, total_pages: 0 } } });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function renderPages() {
  return render(
    <MemoryRouter initialEntries={["/district/health-workers"]}>
      <Routes>
        <Route path="/district/health-workers" element={<DistrictHealthWorkers />} />
        <Route path="/district/patients" element={<DistrictPatients />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi();
});

test("lists the district's Health Workers with location, status and patient counts", async () => {
  renderPages();

  const row = await screen.findByRole("row", { name: /Raji/ });
  for (const text of ["rajilaxmi", "9807654321", "A.Bandaveedhi", "G. Madugula", "PHC G. Madugula", "Active", "3"]) {
    expect(within(row).getByText(text)).toBeInTheDocument();
  }
  const unassigned = screen.getByRole("row", { name: /Sita/ });
  expect(within(unassigned).getByText("No work location")).toBeInTheDocument();
  expect(within(unassigned).getByText("Never")).toBeInTheDocument();
  expect(within(unassigned).queryByText("View patients")).not.toBeInTheDocument();

  const statCard = (label) => screen.getAllByRole("article").find((card) => within(card).queryByText(label, { selector: ".stat-label" }));
  expect(within(statCard("Patients registered")).getByText("3", { selector: ".stat-value" })).toBeInTheDocument();
  expect(within(statCard("Without work location")).getByText("1", { selector: ".stat-value" })).toBeInTheDocument();
});

test("filters are sent to the server without any district id", async () => {
  renderPages();
  await screen.findByText("Raji");

  fireEvent.change(screen.getByLabelText("Account status"), { target: { value: "ACTIVE" } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/district/health-workers", {
    params: { page: 1, page_size: 25, status: "ACTIVE" },
  }));
  api.get.mock.calls.forEach(([, options]) => expect(options?.params || {}).not.toHaveProperty("district_id"));
});

test("View patients opens the de-identified patient list for that Health Worker", async () => {
  renderPages();
  fireEvent.click(await screen.findByRole("link", { name: "View patients" }));

  expect(await screen.findByText("Showing patients registered by Raji")).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/district/patients", {
    params: { page: 1, page_size: 25, health_worker_id: WORKER_ID },
  }));

  fireEvent.click(screen.getByRole("button", { name: "Show all patients" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/district/patients", { params: { page: 1, page_size: 25 } }));
});
