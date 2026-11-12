import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import StaffManagement from "./StaffManagement";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

const districts = [
  { id: 1, name_en: "Alluri Sitharama Raju", name_te: null },
  { id: 2, name_en: "Visakhapatnam", name_te: null },
];
const mandals = [
  { id: 10, district_id: 1, name_en: "Paderu", name_te: null },
  { id: 11, district_id: 1, name_en: "Paderu North", name_te: null },
  { id: 20, district_id: 2, name_en: "Anakapalli", name_te: null },
];
const facilities = [
  { id: 7, district_id: 1, mandal_id: 10, facility_type: "PHC", name_en: "PHC Paderu" },
  { id: 8, district_id: 1, mandal_id: 10, facility_type: "HOSPITAL", name_en: "Area Hospital Paderu" },
  { id: 9, district_id: 2, mandal_id: 20, facility_type: "PHC", name_en: "PHC Anakapalli" },
];

function mockApi(optionDistricts, optionMandals = mandals) {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/options")
      ? { options: { districts: optionDistricts, facilities, specialties: [], mandals: optionMandals } }
      : {
          staff: [{
            id: "mo-1", full_name: "Ravi Teja", username: "mo.ravi.1234", status: "ACTIVE", role_code: "MEDICAL_OFFICER",
            district_id: 1, district_name: "Alluri Sitharama Raju", facility_name: "PHC Paderu",
          }],
        },
  }));
}

function renderPage(path = "/district/staff/medical-officers") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/district/staff/:staffPage" element={<StaffManagement />} />
        <Route path="/admin/staff" element={<StaffManagement />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.post.mockResolvedValue({ data: { staff: { username: "mo.asha.1234" } } });
});

test("District Admin assigns Medical Officers to Mandals in their district", async () => {
  useAuth.mockReturnValue({ user: { role: "DISTRICT_ADMIN" } });
  mockApi([districts[0]], [mandals[0], mandals[1]]);
  renderPage();

  expect(await screen.findAllByText("Alluri Sitharama Raju")).not.toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /Add staff/ }));

  const dialog = screen.getByRole("dialog");
  // District is a dropdown fixed to the District Admin's own district
  const districtField = within(dialog).getByLabelText("District");
  expect(districtField).toHaveValue("1");
  expect(districtField).toBeDisabled();

  // Mandal is a single-choice dropdown of that district only
  const mandalField = within(dialog).getByLabelText("Mandal");
  expect(mandalField).not.toHaveAttribute("multiple");
  const mandalNames = within(mandalField).getAllByRole("option").map((option) => option.textContent);
  expect(mandalNames).toEqual(["Select mandal", "Paderu", "Paderu North"]);

  const facilityField = within(dialog).getByLabelText("Facility");
  expect(facilityField).toBeDisabled();
  await userEvent.selectOptions(mandalField, "10");
  expect(mandalField).toHaveValue("10");
  expect(facilityField).not.toBeDisabled();
  const facilityNames = within(facilityField).getAllByRole("option").map((option) => option.textContent);
  expect(facilityNames).toContain("PHC Paderu");
  expect(facilityNames).not.toContain("PHC Anakapalli");
  fireEvent.change(facilityField, { target: { value: "7" } });

  fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Asha Medical Officer" } });
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "asha@example.test" } });
  fireEvent.change(within(dialog).getByLabelText("Phone"), { target: { value: "9876543210" } });
  await userEvent.click(within(dialog).getByRole("button", { name: "Create staff account" }));
  expect(await screen.findByText("Account created for mo.asha.1234.")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/admin/staff/MEDICAL_OFFICER", expect.objectContaining({
    district_id: 1,
    facility_id: 7,
    mandal_ids: [10],
  }));
}, 10000);

test("Medical Officer form text fields keep focus while typing", async () => {
  useAuth.mockReturnValue({ user: { role: "DISTRICT_ADMIN" } });
  mockApi([districts[0]], [mandals[0]]);
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: /Add staff/ }));
  const dialog = screen.getByRole("dialog");
  const fields = [
    ["Full name", "Asha Medical Officer"],
    ["Email", "asha@example.test"],
    ["Phone", "9876543210"],
  ];

  for (const [label, value] of fields) {
    const input = within(dialog).getByLabelText(label);
    await userEvent.type(input, value);
    expect(input).toHaveValue(value);
    expect(input).toHaveFocus();
    await userEvent.type(input, "{backspace}");
    expect(input).toHaveValue(value.slice(0, -1));
    expect(input).toHaveFocus();
  }

  const fullName = within(dialog).getByLabelText("Full name");
  await userEvent.type(fullName, "{home}Dr ");
  expect(fullName).toHaveValue("Dr Asha Medical Office");
  await userEvent.type(fullName, "{home}{delete}");
  expect(fullName).toHaveValue("r Asha Medical Office");
  fullName.setSelectionRange(0, fullName.value.length);
  await userEvent.type(fullName, "Updated Name");
  expect(fullName).toHaveValue("Updated Name");
  expect(fullName).toHaveFocus();
});

test("Super Admin selects a district and assigns one or more Mandals", async () => {
  useAuth.mockReturnValue({ user: { role: "SUPER_ADMIN" } });
  mockApi(districts);
  renderPage("/admin/staff");

  fireEvent.click(await screen.findByRole("button", { name: /Add staff/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Role"), { target: { value: "MEDICAL_OFFICER" } });
  const districtField = within(dialog).getByLabelText("District");
  fireEvent.change(districtField, { target: { value: "2" } });
  const mandalField = within(dialog).getByLabelText("Mandal");
  expect(within(mandalField).getByRole("option", { name: "Anakapalli" })).toBeInTheDocument();
  expect(within(mandalField).queryByRole("option", { name: "Paderu" })).not.toBeInTheDocument();

  const facilitySelect = within(dialog).getByLabelText("Facility");
  expect(facilitySelect).toBeDisabled();

  await userEvent.selectOptions(mandalField, "20");
  expect(mandalField).toHaveValue("20");
  expect(facilitySelect).not.toBeDisabled();
  const names = within(facilitySelect).getAllByRole("option").map((option) => option.textContent);
  expect(names).toContain("PHC Anakapalli");
  expect(names).not.toContain("PHC Paderu");
});

test("Specialists can only be assigned to hospitals", async () => {
  useAuth.mockReturnValue({ user: { role: "DISTRICT_ADMIN" } });
  mockApi([districts[0]], [mandals[0]]);
  renderPage("/district/staff/specialists");

  fireEvent.click(await screen.findByRole("button", { name: /Add staff/ }));
  const facilitySelect = within(screen.getByRole("dialog")).getByLabelText("Facility");
  const names = within(facilitySelect).getAllByRole("option").map((option) => option.textContent);
  expect(names).toContain("Area Hospital Paderu");
  expect(names).not.toContain("PHC Paderu");
});

test("System Admin can create a Hospital Staff account only at a hospital", async () => {
  useAuth.mockReturnValue({ user: { role: "SYSTEM_ADMIN" } });
  mockApi(districts);
  api.post.mockResolvedValue({
    data: {
      staff: { username: "hs.asha.1234" },
      delivery_status: { email: { status: "SENT" } },
    },
  });
  renderPage("/admin/staff");

  await userEvent.click(await screen.findByRole("button", { name: /Add staff/ }));
  const dialog = screen.getByRole("dialog");
  await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "HOSPITAL_STAFF");
  await userEvent.selectOptions(within(dialog).getByLabelText("District"), "1");

  const facility = within(dialog).getByLabelText("Facility");
  expect(within(facility).getByRole("option", { name: "Area Hospital Paderu" })).toBeInTheDocument();
  expect(within(facility).queryByRole("option", { name: "PHC Paderu" })).not.toBeInTheDocument();
  await userEvent.selectOptions(facility, "8");
  await userEvent.type(within(dialog).getByLabelText("Full name"), "Asha Hospital Staff");
  await userEvent.type(within(dialog).getByLabelText("Email"), "asha@example.test");
  await userEvent.type(within(dialog).getByLabelText("Phone"), "9876543210");
  await userEvent.click(within(dialog).getByRole("button", { name: "Create staff account" }));

  expect(await screen.findByText("Account created for hs.asha.1234.")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/admin/staff/HOSPITAL_STAFF", expect.objectContaining({
    district_id: 1,
    facility_id: 8,
  }));
});
