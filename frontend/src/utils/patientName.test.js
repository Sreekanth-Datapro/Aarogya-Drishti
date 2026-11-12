import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "../i18n/LanguageContext";
import PatientName from "../components/patient/PatientName";
import { transliterateEnglishNameToTelugu } from "./patientName";

function LanguageButtons() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <button type="button" onClick={() => setLanguage("en")}>English</button>
      <button type="button" onClick={() => setLanguage("te")}>Telugu</button>
    </div>
  );
}

describe("patient name transliteration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test.each([
    ["Sreekanth", "శ్రీకాంత్"],
    ["Ramesh", "రమేష్"],
    ["Lakshmi", "లక్ష్మి"],
    ["Sravani", "శ్రావణి"],
  ])("transliterates %s to Telugu", (englishName, teluguName) => {
    expect(transliterateEnglishNameToTelugu(englishName)).toBe(teluguName);
  });

  test("does not transliterate numbers, IDs, phone numbers, or emails", () => {
    expect(transliterateEnglishNameToTelugu("AD-2026-000123")).toBe("AD-2026-000123");
    expect(transliterateEnglishNameToTelugu("+91 9876543210")).toBe("+91 9876543210");
    expect(transliterateEnglishNameToTelugu("patient@example.com")).toBe("patient@example.com");
  });

  test("switches between original and Telugu patient names without changing the original", () => {
    localStorage.setItem("language", "en");

    render(
      <LanguageProvider>
        <LanguageButtons />
        <PatientName patientId="patient-1" name="Sreekanth" />
      </LanguageProvider>
    );

    expect(screen.getByText("Sreekanth")).toBeInTheDocument();
    userEvent.click(screen.getByRole("button", { name: "Telugu" }));
    expect(screen.getByTestId("language")).toHaveTextContent("te");
    expect(screen.getByText("శ్రీకాంత్")).toBeInTheDocument();
  });

  test("allows a confirmed manual Telugu correction", () => {
    localStorage.setItem("language", "te");

    render(
      <LanguageProvider>
        <PatientName patientId="patient-2" name="Ramesh" allowCorrection />
      </LanguageProvider>
    );

    userEvent.click(screen.getByRole("button", { name: "పేరు సరిచేయండి" }));
    const input = screen.getByRole("textbox", { name: "రోగి తెలుగు పేరును సరిచేయండి" });
    userEvent.clear(input);
    userEvent.type(input, "రామేశ్");
    userEvent.click(screen.getByRole("button", { name: "సవరణను సేవ్ చేయండి" }));

    expect(screen.getByText("రామేశ్")).toBeInTheDocument();
    expect(localStorage.getItem("patient_telugu_name_corrections")).toContain("patient-2");
  });
});
