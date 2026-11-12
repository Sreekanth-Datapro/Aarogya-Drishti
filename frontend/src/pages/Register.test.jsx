import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../services/api";
import Register from "./Register";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

beforeEach(() => {
  api.get.mockResolvedValue({
    data: {
      districts: [
        { id: 1, name_en: "Alluri Sitharama Raju" },
        { id: 2, name_en: "Visakhapatnam" },
      ],
      facilities: [
        { id: 7, district_id: 1, mandal_id: 10, name_en: "PHC Paderu" },
        { id: 9, district_id: 2, mandal_id: 20, name_en: "PHC Anakapalli" },
        { id: 11, district_id: 2, mandal_id: null, name_en: "District Office" },
      ],
      mandals: [
        { id: 10, district_id: 1, name_en: "Paderu" },
        { id: 20, district_id: 2, name_en: "Anakapalli" },
      ],
      villages: [],
      languages: [],
    },
  });
});

test("district and Mandal selection filters registration Mandals and facilities", async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

  const district = await screen.findByLabelText("District");
  expect(district.closest(".auth-content-scrollable")).toBeInTheDocument();
  expect(district.closest(".auth-layout-scrollable")).toBeInTheDocument();
  await screen.findByRole("option", { name: "Visakhapatnam" });
  const mandal = screen.getByRole("combobox", { name: "Mandal" });
  const facility = screen.getByLabelText("Facility");
  expect(mandal).toBeDisabled();
  expect(facility).toBeDisabled();

  fireEvent.change(district, { target: { value: "2" } });
  expect(mandal).not.toBeDisabled();
  fireEvent.click(mandal);
  const mandalList = screen.getByRole("listbox", { name: "Mandal" });
  expect(within(mandalList).getByRole("option", { name: "Anakapalli" })).toBeInTheDocument();
  expect(within(mandalList).queryByRole("option", { name: "Paderu" })).not.toBeInTheDocument();

  expect(facility).toBeDisabled();
  fireEvent.mouseDown(within(mandalList).getByRole("option", { name: "Anakapalli" }));
  expect(facility).not.toBeDisabled();
  expect(within(facility).getByRole("option", { name: "PHC Anakapalli" })).toBeInTheDocument();
  expect(within(facility).queryByRole("option", { name: "PHC Paderu" })).not.toBeInTheDocument();
  expect(within(facility).queryByRole("option", { name: "District Office" })).not.toBeInTheDocument();
});
