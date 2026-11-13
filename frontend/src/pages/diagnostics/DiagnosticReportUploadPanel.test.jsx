import React from "react";
import { render, screen } from "@testing-library/react";
import DiagnosticReportUploadPanel from "./DiagnosticReportUploadPanel";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key, vars) => {
      if (key === "diagnostics.selectedFileCount") return `${vars?.count || 0} file(s) selected`;
      if (key === "diagnostics.submitReports") return "Submit Reports";
      if (key === "diagnostics.requiredDocuments") return "Required documents";
      if (key === "diagnostics.requiredDocumentsHint") return "Assign each file to a required category.";
      if (key === "diagnostics.multipleAllowed") return "multiple files allowed";
      if (key === "diagnostics.categoryReady") return "ready";
      if (key === "diagnostics.categoryMissing") return "still needed";
      if (key === "diagnostics.autoAssignCategories") return "Auto-assign categories";
      if (key === "diagnostics.categoryNeedsFile") {
        return `${vars?.label}: need at least ${vars?.count} file(s)`;
      }
      return key;
    },
    tm: (message) => message,
  }),
}));

jest.mock("../../i18n/translate", () => ({
  apiMessage: () => "upload failed",
}));

describe("DiagnosticReportUploadPanel", () => {
  test("shows required document categories and disables submit until files are selected", () => {
    render(
      <DiagnosticReportUploadPanel
        orderId="11111111-1111-4111-8111-111111111111"
        requiredDocuments={[
          { code: "TEST_MRI_BRAIN", label: "MRI Brain", min_files: 1, allow_multiple: true },
          { code: "RADIOLOGIST_REPORT", label: "Radiologist written report", min_files: 1, allow_multiple: true },
        ]}
        existingReports={[]}
      />
    );

    expect(screen.getByText("Required documents")).toBeInTheDocument();
    expect(screen.getByText("MRI Brain")).toBeInTheDocument();
    expect(screen.getByText("Radiologist written report")).toBeInTheDocument();
    expect(screen.getByText("0 file(s) selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit Reports/i })).toBeDisabled();
    expect(document.querySelector('input[type="file"][multiple]')).toBeTruthy();
  });
});
