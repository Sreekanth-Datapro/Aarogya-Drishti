import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import api from "../../services/api";
import HealthWorkerAssignments from "./HealthWorkerAssignments";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const worker = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Asha Worker",
  username: "asha.worker",
  status: "ACTIVE",
  district_id: 1,
  district_name: "Alluri Sitharama Raju",
  assignment_count: 0,
};
const assignments = {
  districts: [{ id: 1, name_en: "Alluri Sitharama Raju" }],
  mandals: [{ id: 10, district_id: 1, name_en: "Paderu" }],
  villages: [{ id: 20, mandal_id: 10, district_id: 1, name_en: "Addulu" }],
  facilities: [{ id: 30, district_id: 1, mandal_id: 10, name_en: "PHC Paderu" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/assignments")
      ? { health_worker: { ...worker, assignments: [] } }
      : url.endsWith("/health-workers")
        ? { health_workers: [worker] }
        : { options: assignments },
  }));
  api.put.mockResolvedValue({ data: { success: true } });
});

test("an administrator can add and save a Health Worker's authorized location", async () => {
  render(<HealthWorkerAssignments />);

  const row = await screen.findByText("Asha Worker");
  fireEvent.click(screen.getByRole("button", { name: "Manage locations" }));

  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Add location" }));
  fireEvent.change(within(dialog).getByLabelText("Mandal"), { target: { value: "10" } });
  fireEvent.change(within(dialog).getByLabelText("Village"), { target: { value: "20" } });
  fireEvent.change(within(dialog).getByLabelText("Facility"), { target: { value: "30" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save assignments" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    `/admin/health-workers/${worker.id}/assignments`,
    { assignments: [{ mandal_id: 10, village_id: 20, facility_id: 30 }] }
  ));
  expect(await screen.findByText("Location assignments updated for Asha Worker.")).toBeInTheDocument();
  expect(row).toBeInTheDocument();
});
