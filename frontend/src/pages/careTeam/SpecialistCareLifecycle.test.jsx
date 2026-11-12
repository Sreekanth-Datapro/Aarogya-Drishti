import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SpecialistCareLifecycle from "./SpecialistCareLifecycle";
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

describe("SpecialistCareLifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => "Handoff notes");
  });

  function mockList() {
    api.get.mockImplementation(async (url) => {
      if (url === "/specialist/care/plans") {
        return {
          data: {
            items: [{
              id: "plan-1",
              patient_id: "patient-1",
              patient_name: "Rama",
              patient_code: "P-1",
              status: "FINAL_CHECKUP_PENDING",
              hospital_revisit_date: "2026-11-20",
              navigator_name: "Nav",
            }],
          },
        };
      }
      if (url === "/specialist/care/dashboard") {
        return {
          data: {
            care: {
              active_care_plans: 1,
              reassessment_queue: 1,
              revisit_due: 0,
              missed_revisit: 0,
              diagnostic_orders: 0,
              reports_pending_review: 0,
              closed_cases: 0,
            },
          },
        };
      }
      if (url === "/specialist/care/plans/plan-1") {
        return {
          data: {
            plan: {
              id: "plan-1",
              patient_id: "patient-1",
              patient_name: "Rama",
              patient_code: "P-1",
              status: "FINAL_CHECKUP_PENDING",
              clinical_summary: "Specialist plan",
              precautions: "Rinse",
              medicines: [],
              source: "SPECIALIST",
            },
          },
        };
      }
      return { data: {} };
    });
  }

  test("loads Specialist care plans and opens reassessment", async () => {
    mockList();
    render(
      <MemoryRouter>
        <SpecialistCareLifecycle />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Rama")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("care.open"));
    await waitFor(() => {
      expect(screen.getByText("care.reassessment")).toBeInTheDocument();
    });
  });

  test("submits CLOSE_RECOVERED final review", async () => {
    mockList();
    api.post.mockResolvedValue({
      data: {
        plan: {
          id: "plan-1",
          patient_id: "patient-1",
          patient_name: "Rama",
          patient_code: "P-1",
          status: "CLOSED",
          clinical_summary: "Specialist plan",
          medicines: [],
          source: "SPECIALIST",
        },
      },
    });

    render(
      <MemoryRouter>
        <SpecialistCareLifecycle />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Rama")).toBeInTheDocument());
    fireEvent.click(screen.getByText("care.open"));
    await waitFor(() => expect(screen.getByText("care.reassessment")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/care.observations/i), {
      target: { value: "Recovered after specialist care" },
    });
    const recovery = screen.getByLabelText(/care.confirmRecovery/i);
    fireEvent.click(recovery);
    fireEvent.click(screen.getByText("care.submitFinalReview"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/specialist/care/plans/plan-1/final-review",
        expect.objectContaining({
          decision: "CLOSE_RECOVERED",
          recovery_confirmed: true,
          observations: "Recovered after specialist care",
        })
      );
    });
  });
});
