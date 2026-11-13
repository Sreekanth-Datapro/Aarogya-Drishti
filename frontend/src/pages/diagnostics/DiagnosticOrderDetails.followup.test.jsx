import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import DiagnosticOrderDetails from "./DiagnosticOrderDetails";
import api from "../../services/api";

jest.mock("../../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key) => key,
    tm: (key) => key,
    language: "en",
  }),
}));

jest.mock("../../i18n/translate", () => ({
  apiMessage: (error, fallback) => error?.response?.data?.message || fallback,
}));

jest.mock("./DiagnosticReportUploadPanel", () => () => null);

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function mockOrder(overrides = {}) {
  api.get.mockImplementation(async (url) => {
    if (String(url).includes(`/diagnostics/orders/${ORDER_ID}`)) {
      return {
        data: {
          order: {
            id: ORDER_ID,
            order_code: "DX-1",
            patient_name: "Test Patient",
            patient_code: "P-1",
            facility_name: "Demo Hospital",
            workflow_status: "REASSESSMENT_PENDING",
            status_name: "Clinician reviewed",
            items: [],
            reports: [],
            history: [],
            advice: {
              id: "advice-1",
              findings: "Prior findings",
              status: "SIGNED",
              version_no: 1,
              is_current: true,
              follow_up_due_date: "2026-11-01",
            },
            advice_history: [{
              id: "advice-1",
              findings: "Prior findings",
              status: "SIGNED",
              version_no: 1,
              is_current: true,
              signed_at: "2026-11-01T10:00:00Z",
            }],
            followups: [{
              id: "fu-1",
              status: "FORWARDED",
              improvement_status: "Improved",
              outcome_notes: "Feeling better",
              followup_notes: "Feeling better",
              created_at: "2026-11-10T10:00:00Z",
            }],
            ...overrides,
          },
        },
      };
    }
    if (String(url).includes("/eligible-health-workers")) {
      return { data: { health_workers: [] } };
    }
    return { data: {} };
  });
  api.post.mockResolvedValue({ data: { success: true, order: { id: ORDER_ID } } });
}

describe("DiagnosticOrderDetails follow-up cycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
  });

  test("Specialist sees reassessment decisions when reassessment is pending", async () => {
    mockOrder();
    render(
      <MemoryRouter initialEntries={[`/specialist/diagnostics/${ORDER_ID}`]}>
        <Routes>
          <Route path="/specialist/diagnostics/:orderId" element={<DiagnosticOrderDetails role="SPECIALIST" />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("diagnostics.reassessmentPanel")).toBeInTheDocument();
    });
    expect(screen.getByText("diagnostics.decisionContinue")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.decisionUpdate")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.decisionDiagnostics")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.decisionVideo")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.decisionClose")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.adviceHistory")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.followupHistory")).toBeInTheDocument();
  });

  test("Health Worker follow-up form includes draft and submit actions", async () => {
    mockOrder({
      workflow_status: "SENT_TO_HEALTH_WORKER",
      follow_up_overdue: true,
      follow_up_due_date: "2026-11-01",
    });
    render(
      <MemoryRouter initialEntries={[`/health-worker/diagnostics/orders/${ORDER_ID}`]}>
        <Routes>
          <Route
            path="/health-worker/diagnostics/orders/:orderId"
            element={<DiagnosticOrderDetails role="HEALTH_WORKER" />}
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("diagnostics.patientFollowup")).toBeInTheDocument();
    });
    expect(screen.getByText("diagnostics.saveFollowupDraft")).toBeInTheDocument();
    expect(screen.getByText("diagnostics.submitFollowup")).toBeInTheDocument();
    expect(screen.getByText((text) => String(text).includes("diagnostics.followupOverdueBanner"))).toBeInTheDocument();
  });

  test("Frontend requires real test selection for additional diagnostics", async () => {
    const { fireEvent } = require("@testing-library/react");
    api.get.mockImplementation(async (url) => {
      if (String(url).includes("/diagnostics/tests")) {
        return { data: { tests: [{ id: 3, name_en: "CBC", code: "CBC" }] } };
      }
      if (String(url).includes("consultation-slots")) {
        return { data: { slots: [] } };
      }
      if (String(url).includes(`/diagnostics/orders/${ORDER_ID}`)) {
        return {
          data: {
            order: {
              id: ORDER_ID,
              order_code: "DX-1",
              patient_name: "Test Patient",
              patient_code: "P-1",
              facility_id: 8,
              facility_name: "Demo Hospital",
              workflow_status: "REASSESSMENT_PENDING",
              status_name: "Clinician reviewed",
              referral_id: "abababab-abab-4aba-8aba-abababababab",
              items: [],
              reports: [],
              history: [],
              advice: { id: "advice-1", findings: "Prior", status: "SIGNED", version_no: 1, is_current: true },
              advice_history: [],
              followups: [],
            },
          },
        };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({
      data: {
        created_order_id: "99999999-9999-4999-8999-999999999999",
        created_order_code: "DX-NEW-1",
        message: "Additional diagnostic order DX-NEW-1 created",
        order: { id: ORDER_ID },
      },
    });

    render(
      <MemoryRouter initialEntries={[`/specialist/diagnostics/${ORDER_ID}`]}>
        <Routes>
          <Route path="/specialist/diagnostics/:orderId" element={<DiagnosticOrderDetails role="SPECIALIST" />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("diagnostics.reassessmentPanel")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("diagnostics.reassessDecision"), {
      target: { value: "REQUEST_DIAGNOSTICS" },
    });
    await waitFor(() => {
      expect(screen.getByText("diagnostics.selectDiagnosticTests")).toBeInTheDocument();
      expect(screen.getByText("diagnostics.clinicalReason")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("diagnostics.reassessDecision"), {
      target: { value: "REQUEST_VIDEO" },
    });
    await waitFor(() => {
      expect(screen.getByText("diagnostics.videoBookingHint")).toBeInTheDocument();
      expect(screen.getByText("diagnostics.publishedVideoSlot")).toBeInTheDocument();
    });
  });
});
