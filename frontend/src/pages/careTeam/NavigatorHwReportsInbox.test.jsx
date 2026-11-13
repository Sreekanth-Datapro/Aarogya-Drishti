import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavigatorHwReportsInbox from "./NavigatorHwReportsInbox";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key) => key,
    tm: (message) => message,
  }),
}));

const api = require("../../services/api").default;

describe("NavigatorHwReportsInbox", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders submitted diagnostic report cards for Navigator", async () => {
    api.get.mockResolvedValue({
      data: {
        orders: [{
          id: "11111111-1111-4111-8111-111111111111",
          patient_name: "Demo Patient",
          patient_code: "AD-1",
          order_code: "DX-1",
          investigation_names: ["MRI Brain"],
          assigned_health_worker_name: "HW One",
          report_count: 3,
          latest_upload_at: "2026-11-13T01:00:00.000Z",
          workflow_status: "REPORT_UPLOADED",
          status_code: "REPORT_RECEIVED",
        }],
      },
    });

    render(
      <MemoryRouter>
        <NavigatorHwReportsInbox />
      </MemoryRouter>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls[0][0]).toBe("/diagnostics/orders");
    expect(api.get.mock.calls[0][1].params.awaiting_navigator).toBe("true");
    expect(await screen.findByText("Demo Patient")).toBeInTheDocument();
    expect(screen.getByText("DX-1")).toBeInTheDocument();
    expect(screen.getByText(/MRI Brain/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /navigator\.hwReportsView/i })).toHaveAttribute(
      "href",
      "/navigator/diagnostics/11111111-1111-4111-8111-111111111111"
    );
  });

  test("shows empty state when no reports", async () => {
    api.get.mockResolvedValue({ data: { orders: [] } });
    render(
      <MemoryRouter>
        <NavigatorHwReportsInbox />
      </MemoryRouter>
    );
    expect(await screen.findByText("navigator.hwReportsEmpty")).toBeInTheDocument();
  });
});
