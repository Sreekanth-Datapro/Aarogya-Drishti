import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import Register from "./pages/Register";
import api from "./services/api";

jest.mock("./services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  storeSession: jest.fn(),
  clearSession: jest.fn(),
}));

const registrationOptions = {
  success: true,
  districts: [{ id: "1", code: "ASR", name_en: "Alluri Sitharama Raju", name_te: null }],
  facilities: [{
    id: "1",
    code: "FAC_PHC_GM",
    name_en: "PHC G. Madugula (demo)",
    name_te: null,
    facility_type: "PHC",
    district_id: "1",
    mandal_id: "2",
  }],
  mandals: [
    { id: "1", code: "PADERU", name_en: "Paderu", name_te: null, district_id: "1" },
    { id: "2", code: "G_MADUGULA", name_en: "G. Madugula", name_te: null, district_id: "1" },
  ],
  villages: [
    { id: "1", code: "VIL_DEMO_1", name_en: "Demo Village 1", name_te: null, mandal_id: "2" },
    { id: "2", code: "VIL_DEMO_2", name_en: "Demo Village 2", name_te: null, mandal_id: "2" },
  ],
  languages: [
    { id: "1", code: "en", name_en: "English", native_name: "English" },
    { id: "2", code: "te", name_en: "Telugu", native_name: "Telugu" },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: registrationOptions });
});

test("logged-out user is redirected to the login page", async () => {
  render(<App />);
  expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /aarogya drishti/i })).toBeInTheDocument();
});

test("registration form loads master dropdowns and filters villages by mandal", async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

  expect(api.get).toHaveBeenCalledWith("/masters/registration-options");
  expect(screen.getAllByRole("combobox")).toHaveLength(6);

  await screen.findByRole("option", { name: "Alluri Sitharama Raju" });
  fireEvent.change(screen.getByLabelText("District"), { target: { value: "1" } });
  const village = screen.getByLabelText("Village");
  expect(village).toBeDisabled();

  pickOption("Mandal", "gmadugula", "G. Madugula");
  const facilitySelect = screen.getByLabelText("Facility");
  expect(await within(facilitySelect).findByRole("option", { name: /PHC G. Madugula/ })).toBeInTheDocument();
  expect(within(screen.getByLabelText("Preferred language")).getAllByRole("option")).toHaveLength(3);

  // Mandal search: "pad" finds only Paderu, which has no villages
  pickOption("Mandal", "pad", "Paderu");
  expect(village).not.toBeDisabled();
  expect(screen.getByText("No villages are listed for this mandal yet.")).toBeInTheDocument();

  // Dots and spaces are ignored: "gmadugula" finds "G. Madugula"
  pickOption("Mandal", "gmadugula", "G. Madugula");
  expect(screen.getByText("2 villages in this mandal")).toBeInTheDocument();

  fireEvent.focus(village);
  expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);
  fireEvent.change(village, { target: { value: "village 2" } });
  const options = within(screen.getByRole("listbox")).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Demo Village 2"]);
});

test("villages with the same name are told apart by their LGD code", async () => {
  api.get.mockResolvedValue({
    data: {
      ...registrationOptions,
      villages: [
        { id: "7", name_en: "Boddagondi", name_te: null, mandal_id: "2", lgd_code: 584900 },
        { id: "8", name_en: "Boddagondi", name_te: null, mandal_id: "2", lgd_code: 584950 },
        { id: "9", name_en: "Addulu", name_te: null, mandal_id: "2", lgd_code: 585042 },
      ],
    },
  });
  await renderRegister();

  pickOption("Mandal", "madugula", "G. Madugula");
  const village = screen.getByLabelText("Village");
  fireEvent.focus(village);
  const names = within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent);
  expect(names).toEqual(["Boddagondi (LGD 584900)", "Boddagondi (LGD 584950)", "Addulu"]);
});

test("the mandal search shows a message when nothing matches", async () => {
  await renderRegister();
  const mandal = screen.getByLabelText("Mandal");
  fireEvent.focus(mandal);
  fireEvent.change(mandal, { target: { value: "xyz" } });
  expect(screen.getByText("No matches found")).toBeInTheDocument();
});

// Type into a searchable dropdown and click the matching option
function pickOption(label, text, optionName) {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option", { name: optionName }));
}

const renderRegister = async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  await screen.findByRole("option", { name: "Alluri Sitharama Raju" });
  fireEvent.change(screen.getByLabelText("District"), { target: { value: "1" } });
  pickOption("Mandal", "gmadugula", "G. Madugula");
  await screen.findByRole("option", { name: /PHC G. Madugula/ });
};

test("registration shows inline errors and does not submit an invalid form", async () => {
  await renderRegister();

  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: /submit registration/i }));

  expect(screen.getByText("Enter a valid 10-digit mobile number")).toBeInTheDocument();
  expect(screen.getByText("Please accept the terms to continue")).toBeInTheDocument();
  expect(screen.getByLabelText("Mobile number")).toHaveAttribute("aria-invalid", "true");
  expect(api.post).not.toHaveBeenCalled();
});

test("a valid registration sends numeric ids and shows the success panel", async () => {
  api.post.mockResolvedValue({
    data: {
      message: "Registration submitted successfully. Your request is pending review. Applicant status tracking is temporarily unavailable.",
    },
  });
  await renderRegister();

  const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type("Full name", "Asha Worker");
  type("Mobile number", "9876543210");
  pickOption("Mandal", "madugula", "G. Madugula");
  type("Facility", "1");
  pickOption("Village", "1", "Demo Village 1");
  type("Preferred language", "2");
  type("Username", "asha_worker");
  type("Password", "Secure123");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /submit registration/i }));

  expect(await screen.findByText(
    "Registration submitted successfully. Your request is pending review. Applicant status tracking is temporarily unavailable."
  )).toBeInTheDocument();
  expect(screen.getByText(
    "This application has no status token. Authorized staff can continue its review; no personal details are shown here."
  )).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Track application" })).not.toBeInTheDocument();
  expect(screen.queryByText("b".repeat(64))).not.toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(
    "/auth/register",
    expect.objectContaining({
      full_name: "Asha Worker",
      designation: "ASHA",
      facility_id: 1,
      mandal_id: 2,
      village_id: 1,
      language_id: 2,
      terms_accepted: true,
    })
  );
});

test("a successful workflow registration displays its private progress token", async () => {
  api.post.mockResolvedValue({
    data: {
      message: "Registration submitted successfully. Your request is pending review. Save your private status token to check progress.",
      status_token: "a".repeat(64),
    },
  });
  await renderRegister();

  const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type("Full name", "Asha Worker");
  type("Mobile number", "9876543210");
  pickOption("Mandal", "madugula", "G. Madugula");
  type("Facility", "1");
  pickOption("Village", "1", "Demo Village 1");
  type("Preferred language", "2");
  type("Username", "asha_worker");
  type("Password", "Secure123");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /submit registration/i }));

  expect(await screen.findByText("a".repeat(64))).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Check application progress" })).toHaveAttribute(
    "href",
    "/registration-status"
  );
}, 15000);
