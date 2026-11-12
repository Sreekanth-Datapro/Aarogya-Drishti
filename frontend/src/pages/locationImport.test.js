import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import RequireRole from "../components/RequireRole";
import LocationImport from "./LocationImport";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
}));

const districtPreview = {
  level: "district",
  source: "LGD",
  parent: { id: null, lgd_code: 28, name_en: "Andhra Pradesh" },
  rows: [
    { lgd_code: 745, name_en: "Alluri Sitharama Raju", name_te: null, action: "link", existing: { id: 1, code: "ASR", name_en: "Alluri Sitharama Raju", is_verified: false } },
    { lgd_code: 744, name_en: "Anakapalli", name_te: null, action: "new", existing: null },
    { lgd_code: 502, name_en: "Ananthapuramu", name_te: "అనంతపురము", action: "protected", existing: { id: 9, code: "ATP", name_en: "Ananthapuramu", is_verified: true } },
  ],
  counts: { new: 1, update: 0, link: 1, unchanged: 0, protected: 1, conflict: 0 },
  onlyInAarogya: [],
};

function mockGet(previewResult) {
  api.get.mockImplementation((url) => {
    if (url === "/locations/lgd/states") return Promise.resolve({ data: { states: [{ lgd_code: 28, name_en: "Andhra Pradesh" }] } });
    if (url === "/locations/records") return Promise.resolve({ data: { records: [{ id: 1, code: "ASR", name_en: "Alluri Sitharama Raju", lgd_code: null, data_source: "MANUAL", is_verified: false }] } });
    if (url === "/locations/imports") return Promise.resolve({ data: { imports: [] } });
    if (url === "/locations/preview") return previewResult();
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function renderAs(role) {
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("user", JSON.stringify({ full_name: "Admin", role }));
  render(
    <AuthProvider>
      <MemoryRouter>
        <RequireRole roles={["SUPER_ADMIN"]}>
          <LocationImport />
        </RequireRole>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

test("other roles see a no-access message", () => {
  mockGet(() => Promise.resolve({ data: districtPreview }));
  renderAs("SYSTEM_ADMIN");
  expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});

test("preview, select and import only after explicit confirmation", async () => {
  mockGet(() => Promise.resolve({ data: districtPreview }));
  api.post.mockResolvedValue({ data: { batch_id: 1, inserted: 1, updated: 0, linked: 1, skipped: 0, parent: districtPreview.parent } });
  renderAs("SUPER_ADMIN");

  fireEvent.click(await screen.findByRole("button", { name: /fetch from lgd/i }));
  expect(await screen.findByText("Anakapalli")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/locations/preview", { params: { level: "district", state_code: 28 } });

  // Protected (verified) rows cannot be selected
  expect(screen.getByRole("checkbox", { name: "Select Ananthapuramu" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Select new and changed" }));
  expect(screen.getByText("2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /import selected/i }));
  const dialog = screen.getByRole("dialog");
  const importNow = within(dialog).getByRole("button", { name: "Import now" });
  expect(importNow).toBeDisabled();

  fireEvent.click(within(dialog).getByLabelText(/i have reviewed these records/i));
  fireEvent.click(importNow);

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/locations/import", {
      level: "district",
      state_code: 28,
      lgd_codes: expect.arrayContaining([744, 745]),
      confirm: true,
    })
  );
  expect(await screen.findByText("Import complete")).toBeInTheDocument();
});

test("an LGD error offers try again and manual entry", async () => {
  mockGet(() => Promise.reject({ response: { data: { message: "Could not reach the LGD service.", code: "LGD_UNAVAILABLE" } } }));
  renderAs("SUPER_ADMIN");

  fireEvent.click(await screen.findByRole("button", { name: /fetch from lgd/i }));
  expect(await screen.findByText("LGD could not be reached")).toBeInTheDocument();

  const alert = screen.getByRole("alert");
  fireEvent.click(within(alert).getByRole("button", { name: /add manually/i }));
  expect(screen.getByText(/add a location manually/i)).toBeInTheDocument();
  expect(screen.getByLabelText("Name (English)")).toBeInTheDocument();
});
