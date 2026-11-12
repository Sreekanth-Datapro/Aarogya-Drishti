import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import api from "../../services/api";
import { LanguageProvider, useLanguage } from "../../i18n/LanguageContext";
import RegistrationMonitoring from "./RegistrationMonitoring";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

function LanguageControls() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setLanguage("en")}>English</button>
      <button type="button" onClick={() => setLanguage("te")}>Telugu</button>
      <RegistrationMonitoring />
    </>
  );
}

beforeEach(() => {
  localStorage.setItem("language", "en");
  jest.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      registrations: [{
        id: "request-1",
        full_name: "Asha Worker",
        username: "asha.worker",
        designation: "ASHA",
        facility_name: "PHC G. Madugula (demo)",
        facility_name_te: "PHC జి. మాడుగుల (డెమో)",
        mandal_name: "Chinthapalli",
        mandal_name_te: "చింతపల్లి",
        status: "PENDING",
        created_at: "2025-01-01T10:20:00+05:30",
      }],
    },
  });
});

test("switches static labels, master data, designation, status, and locale date", async () => {
  render(
    <LanguageProvider>
      <LanguageControls />
    </LanguageProvider>
  );

  expect(await screen.findByText("Registration Monitoring")).toBeInTheDocument();
  expect(await screen.findByText("PHC G. Madugula (demo)")).toBeInTheDocument();
  expect(screen.getByText("Chinthapalli")).toBeInTheDocument();
  expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  expect(screen.getByText("asha.worker")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Telugu" }));

  expect(await screen.findByText("నమోదు పర్యవేక్షణ")).toBeInTheDocument();
  expect(await screen.findByText("ఆశా కార్యకర్త")).toBeInTheDocument();
  expect(screen.getByText("PHC జి. మాడుగుల (డెమో)")).toBeInTheDocument();
  expect(screen.getByText("చింతపల్లి")).toBeInTheDocument();
  expect(screen.getAllByText("పెండింగ్‌లో ఉంది").length).toBeGreaterThan(0);
  expect(screen.getByText("asha.worker")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "English" }));

  expect(await screen.findByText("Registration Monitoring")).toBeInTheDocument();
  expect(await screen.findByText("ASHA")).toBeInTheDocument();
  expect(await screen.findByText("PHC G. Madugula (demo)")).toBeInTheDocument();
});

test("falls back to English when Telugu master names are missing", async () => {
  api.get.mockResolvedValue({
    data: {
      registrations: [{
        id: "request-2",
        full_name: "Health Worker",
        username: "health.worker",
        designation: "ANM",
        facility_name: "Fallback PHC",
        facility_name_te: null,
        mandal_name: "Fallback Mandal",
        mandal_name_te: null,
        status: "APPROVED",
        created_at: "2025-01-01T10:20:00+05:30",
      }],
    },
  });
  localStorage.setItem("language", "te");

  render(
    <LanguageProvider>
      <RegistrationMonitoring />
    </LanguageProvider>
  );

  expect(await screen.findByText("Fallback PHC")).toBeInTheDocument();
  expect(screen.getByText("Fallback Mandal")).toBeInTheDocument();
  expect((await screen.findAllByText("ఆమోదించబడింది")).length).toBeGreaterThan(0);
  expect(screen.getByText("health.worker")).toBeInTheDocument();
});
