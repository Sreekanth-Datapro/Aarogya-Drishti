import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import FacilityForm from "./FacilityForm";
import FacilityList from "./FacilityList";
import FacilityDetails from "./FacilityDetails";
import api from "../../services/api";
import { canManageFacilities } from "../../components/facilities/facilityTypes";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
}));

const ADMIN = { full_name: "Admin", role: "SUPER_ADMIN", permissions: ["master.view", "master.manage"] };
const VIEWER = { full_name: "District Admin", role: "DISTRICT_ADMIN", permissions: ["master.view"] };

const facility = {
  id: 7, name_en: "PHC Kothapalli", name_te: null, code: "PHC-01", category: "PHC", is_active: true,
  district_id: 1, district_name: "Alluri Sitharama Raju", mandal_id: 2, mandal_name: "G. Madugula",
  village_id: 11, village_name: "Addulu", contact_phone: "9876543210", address: null, pin_code: null,
  email: null, incharge_name: null, created_at: "2026-10-31T10:00:00Z", updated_at: "2026-10-31T10:00:00Z",
};

// Fake backend for the location dropdowns and facility reads
function mockGets() {
  api.get.mockImplementation((url, config = {}) => {
    const params = config.params || {};
    if (url === "/masters/districts") return Promise.resolve({ data: { districts: [{ id: 1, name_en: "Alluri Sitharama Raju" }] } });
    if (url === "/masters/mandals") {
      return Promise.resolve({ data: { mandals: params.district_id === "1" ? [{ id: 2, name_en: "G. Madugula" }, { id: 3, name_en: "Paderu" }] : [] } });
    }
    if (url === "/masters/villages") {
      return Promise.resolve({ data: { villages: params.mandal_id === "2" ? [{ id: 11, name_en: "Addulu" }, { id: 12, name_en: "Alagam" }] : [] } });
    }
    if (url === "/facilities/summary") return Promise.resolve({ data: { summary: { total: 5, active: 4, inactive: 1, phc: 2, chc: 1, hospital: 2 } } });
    if (url === "/facilities") return Promise.resolve({ data: { facilities: [facility], total: 1 } });
    if (url === "/facilities/7") return Promise.resolve({ data: { facility } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function renderAt(path, user = ADMIN) {
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("user", JSON.stringify(user));
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/facilities" element={<FacilityList />} />
          <Route path="/admin/facilities/new" element={<FacilityForm />} />
          <Route path="/admin/facilities/:id" element={<FacilityDetails />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function pickOption(label, text, optionName) {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option", { name: optionName }));
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  mockGets();
});

test("add facility: dependent dropdowns and the saved payload", async () => {
  api.post.mockResolvedValue({ data: { facility: { ...facility, id: 7 } } });
  renderAt("/admin/facilities/new");

  const mandal = screen.getByLabelText("Mandal");
  const village = screen.getByLabelText("Village");
  expect(mandal).toBeDisabled();
  expect(village).toBeDisabled();

  // District -> its mandals are loaded from our backend
  fireEvent.change(await screen.findByLabelText("District"), { target: { value: "1" } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/masters/mandals", { params: { district_id: "1" } }));
  await waitFor(() => expect(mandal).not.toBeDisabled());
  pickOption("Mandal", "madugula", "G. Madugula");

  // Mandal -> its villages
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/masters/villages", { params: { mandal_id: "2" } }));
  await waitFor(() => expect(village).not.toBeDisabled());
  pickOption("Village", "add", "Addulu");

  fireEvent.change(screen.getByLabelText("Facility name"), { target: { value: "PHC Kothapalli" } });
  fireEvent.change(screen.getByLabelText("Facility type"), { target: { value: "PHC" } });
  fireEvent.change(screen.getByLabelText("Facility code"), { target: { value: "phc-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Save facility" }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/facilities", expect.objectContaining({
      name_en: "PHC Kothapalli", category: "PHC", code: "phc-01",
      district_id: 1, mandal_id: 2, village_id: 11, is_active: true,
    }))
  );
  expect(await screen.findByText("Facility created successfully.")).toBeInTheDocument();
});

test("add facility: required fields are checked before saving", async () => {
  renderAt("/admin/facilities/new");
  await screen.findByRole("option", { name: "Alluri Sitharama Raju" });
  fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "Save facility" }));

  expect(screen.getByText("Please correct the highlighted fields.")).toBeInTheDocument();
  expect(screen.getByText("PIN code must be 6 digits")).toBeInTheDocument();
  expect(screen.getByLabelText("Facility name")).toHaveAttribute("aria-invalid", "true");
  expect(api.post).not.toHaveBeenCalled();
});

test("add facility: a duplicate code from the server is shown on the code field", async () => {
  api.post.mockRejectedValue({ response: { data: { code: "DUPLICATE_CODE", message: "A facility with this code already exists" } } });
  renderAt("/admin/facilities/new");

  fireEvent.change(await screen.findByLabelText("District"), { target: { value: "1" } });
  await waitFor(() => expect(screen.getByLabelText("Mandal")).not.toBeDisabled());
  pickOption("Mandal", "pad", "Paderu");
  pickOption("Mandal", "madugula", "G. Madugula");
  await waitFor(() => expect(screen.getByLabelText("Village")).not.toBeDisabled());
  pickOption("Village", "ala", "Alagam");
  fireEvent.change(screen.getByLabelText("Facility name"), { target: { value: "Copy" } });
  fireEvent.change(screen.getByLabelText("Facility type"), { target: { value: "CHC" } });
  fireEvent.change(screen.getByLabelText("Facility code"), { target: { value: "PHC-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Save facility" }));

  expect(await screen.findAllByText("A facility with this code already exists")).toHaveLength(2);
  expect(screen.getByLabelText("Facility code")).toHaveAttribute("aria-invalid", "true");
});

test("facility list: dashboard counts, rows and deactivation after confirmation", async () => {
  api.patch.mockResolvedValue({ data: { message: "Facility deactivated", facility: { ...facility, is_active: false } } });
  renderAt("/admin/facilities");

  expect(await screen.findByText("PHC Kothapalli")).toBeInTheDocument();
  expect(screen.getByText("Total facilities")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /add facility/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Deactivate this facility?")).toBeInTheDocument();
  expect(api.patch).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/facilities/7/status", { is_active: false }));
  expect(await screen.findByText("Facility deactivated")).toBeInTheDocument();
});

test("facility list: filters are sent to the server", async () => {
  renderAt("/admin/facilities");
  await screen.findByText("PHC Kothapalli");

  fireEvent.change(screen.getByLabelText("Facility type"), { target: { value: "CHC" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "inactive" } });

  await waitFor(() =>
    expect(api.get).toHaveBeenLastCalledWith("/facilities", { params: { page: 1, page_size: 20, category: "CHC", status: "inactive" } })
  );
});

test("district admins get a read-only view", async () => {
  renderAt("/admin/facilities", VIEWER);
  expect(await screen.findByText("PHC Kothapalli")).toBeInTheDocument();
  expect(screen.getByText(/only administrators can change them/i)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /add facility/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
});

test("facility write permission is excluded for District Admins", () => {
  expect(canManageFacilities({
    role: "DISTRICT_ADMIN",
    permissions: ["master.view", "master.manage"],
  })).toBe(false);
  expect(canManageFacilities(ADMIN)).toBe(true);
});

test("facility details show the location names", async () => {
  renderAt("/admin/facilities/7");
  expect(await screen.findByRole("heading", { name: "PHC Kothapalli" })).toBeInTheDocument();
  expect(screen.getByText("Alluri Sitharama Raju")).toBeInTheDocument();
  expect(screen.getByText("G. Madugula")).toBeInTheDocument();
  expect(screen.getByText("Addulu")).toBeInTheDocument();
});
