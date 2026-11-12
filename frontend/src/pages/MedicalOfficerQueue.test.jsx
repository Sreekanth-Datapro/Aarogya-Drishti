import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import api from "../services/api";
import MedicalOfficerQueue from "./MedicalOfficerQueue";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const patient = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Demo Patient",
  date_of_birth: "1984-05-12",
  patient_code: "AD-00001",
  age_years: 42,
  mandal_name: "Paderu",
  village_name: "Addulu",
  facility_name: "PHC Paderu",
  screening_date: "2026-01-03",
  case_state: "AWAITING_CLINICIAN",
  chief_complaint: "Mouth pain",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((_url, config) => Promise.resolve({
    data: {
      cases: config.params.view === "available" ? [patient] : [],
      pagination: { total: config.params.view === "available" ? 1 : 0, page: 1, page_size: 20, total_pages: config.params.view === "available" ? 1 : 0 },
    },
  }));
  api.post.mockResolvedValue({ data: { success: true } });
});

test("Medical Officer can claim a patient from the available queue", async () => {
  render(<MedicalOfficerQueue />);

  expect(await screen.findByText("AD-00001")).toBeInTheDocument();
  expect(screen.queryByText("Demo Patient")).not.toBeInTheDocument();
  expect(screen.queryByText("Mouth pain")).not.toBeInTheDocument();
  expect(screen.queryByText("1984-05-12")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Claim case" }));

  expect(await screen.findByText("You claimed AD-00001.")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(`/medical-officer/patients/${patient.id}/claim`);
});

test("claimed cases show the complaint only in the claimed-cases tab", async () => {
  api.get.mockImplementation((_url, config) => Promise.resolve({
    data: { cases: config.params.view === "mine" ? [patient] : [] },
  }));
  render(<MedicalOfficerQueue />);

  fireEvent.click(await screen.findByRole("tab", { name: /my claimed cases/i }));

  expect(await screen.findByText("AD-00001")).toBeInTheDocument();
  expect(screen.getByText("Mouth pain")).toBeInTheDocument();
  expect(screen.queryByText("Demo Patient")).not.toBeInTheDocument();
  expect(screen.queryByText("1984-05-12")).not.toBeInTheDocument();
});

test("claimed cases do not show a complaint omitted for missing consent", async () => {
  api.get.mockImplementation((_url, config) => Promise.resolve({
    data: {
      cases: config.params.view === "mine" ? [{ ...patient, chief_complaint: null }] : [],
      pagination: { total: config.params.view === "mine" ? 1 : 0, page: 1, page_size: 20, total_pages: config.params.view === "mine" ? 1 : 0 },
    },
  }));
  render(<MedicalOfficerQueue />);

  fireEvent.click(await screen.findByRole("tab", { name: /my claimed cases/i }));

  expect(await screen.findByText("AD-00001")).toBeInTheDocument();
  expect(screen.queryByText("Mouth pain")).not.toBeInTheDocument();
});

test("queue paging keeps each view's page and uses server totals", async () => {
  const secondPagePatient = { ...patient, id: "33333333-3333-4333-8333-333333333333", patient_code: "AD-00021" };
  api.get.mockImplementation((_url, config) => {
    const { view, page, limit } = config.params;
    const isAvailable = view === "available";
    return Promise.resolve({
      data: {
        cases: isAvailable ? (page === 2 ? [secondPagePatient] : [patient]) : [],
        pagination: {
          total: isAvailable ? 21 : 0,
          page,
          page_size: limit,
          total_pages: isAvailable ? 2 : 0,
        },
      },
    });
  });
  render(<MedicalOfficerQueue />);

  expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  expect(await screen.findByText("AD-00021")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/medical-officer/cases", {
    params: { view: "available", page: 2, limit: 20 },
  });

  fireEvent.click(screen.getByRole("tab", { name: /my claimed cases/i }));
  expect(await screen.findByText("Page 1 of 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /available cases/i }));

  expect(await screen.findByText("AD-00021")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
});

test("empty queues show no cases and disable both page controls", async () => {
  api.get.mockResolvedValue({
    data: { cases: [], pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 } },
  });
  render(<MedicalOfficerQueue />);

  expect(await screen.findByText("There are no unclaimed cases awaiting clinician review in your assigned Mandals.")).toBeInTheDocument();
  expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
