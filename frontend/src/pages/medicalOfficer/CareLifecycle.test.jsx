import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CareLifecycle from "./CareLifecycle";
import api from "../../services/api";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key, opts) => (opts && opts.defaultValue) || key,
    tm: (value) => value,
  }),
}));

jest.mock("../../i18n/displayLabels", () => ({
  getCaseStateLabel: (code) => code || "",
}));

jest.mock("../../i18n/translate", () => ({
  apiMessage: (error, fallback) => error?.response?.data?.message || fallback,
}));

const PLAN = {
  id: "plan-1",
  patient_id: "patient-1",
  patient_name: "Rama Devi",
  patient_code: "AD-1",
  clinical_summary: "Community care",
  status: "FINAL_CHECKUP_PENDING",
  case_state: "REVIEWED",
  medicines: [{ id: "m1", medicine_name: "Chlorhexidine", dosage: "10ml", frequency: "BID", duration_days: 14 }],
  discomforts: [],
  treatment_start_date: "2026-11-12",
  expected_end_date: "2026-11-26",
  hospital_revisit_date: "2026-11-26",
};

function mockListApis() {
  api.get.mockImplementation((url) => {
    if (url === "/medical-officer/care/plans") {
      return Promise.resolve({ data: { items: [PLAN] } });
    }
    if (url === "/medical-officer/care/navigators") {
      return Promise.resolve({ data: { navigators: [{ id: "nav-1", full_name: "Nav One" }] } });
    }
    if (url === "/medical-officer/care/eligible-patients") {
      return Promise.resolve({ data: { items: [] } });
    }
    if (url === "/medical-officer/care/plans/plan-1") {
      return Promise.resolve({ data: { plan: { ...PLAN } } });
    }
    return Promise.reject({ response: { status: 404 } });
  });
}

async function openPlanDetail() {
  mockListApis();
  render(
    <MemoryRouter>
      <CareLifecycle />
    </MemoryRouter>
  );
  await screen.findByText("Rama Devi");
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "care.open" })[0]);
  });
  await screen.findByText("care.reassessmentNote");
}

function reviewForm() {
  return screen.getByText("care.reassessmentNote").closest("form");
}

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
});

test("MO reassessment CLOSE_RECOVERED posts recovery confirmation", async () => {
  api.post.mockResolvedValueOnce({
    data: { plan: { ...PLAN, status: "CLOSED", screening_sync_status: "SYNCED" } },
  });
  await openPlanDetail();
  const form = reviewForm();
  fireEvent.change(form.querySelectorAll("textarea")[0], { target: { value: "Recovered fully" } });
  fireEvent.click(form.querySelector('input[type="checkbox"]'));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "care.saveFinalReview" }));
  });
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const call = api.post.mock.calls.find(([url]) => String(url).includes("/final-review"));
  expect(call[1]).toMatchObject({
    decision: "CLOSE_RECOVERED",
    recovery_confirmed: true,
    observations: "Recovered fully",
  });
});

test("MO reassessment CONTINUE_TREATMENT sends new medicines and revisit date", async () => {
  api.post.mockResolvedValueOnce({
    data: { plan: { ...PLAN, id: "plan-2", status: "AWAITING_NAVIGATOR" } },
  });
  await openPlanDetail();
  fireEvent.change(screen.getByDisplayValue("care.decision.closeRecovered"), {
    target: { value: "CONTINUE_TREATMENT" },
  });
  await waitFor(() => expect(screen.getByDisplayValue("care.decision.continue")).toBeInTheDocument());
  const form = reviewForm();
  fireEvent.change(form.querySelectorAll("textarea")[0], { target: { value: "Still needs care" } });
  const textareas = form.querySelectorAll("textarea");
  fireEvent.change(textareas[textareas.length - 1], { target: { value: "New plan summary" } });
  const dateInputs = Array.from(form.querySelectorAll('input[type="date"]'));
  const revisit = dateInputs.find((input) => !input.readOnly && input.value === "");
  fireEvent.change(revisit, { target: { value: "2026-12-11" } });
  Array.from(form.querySelectorAll('input[type="text"]')).forEach((input, index) => {
    if (!input.value) {
      fireEvent.change(input, {
        target: { value: index % 3 === 0 ? "Amoxicillin" : index % 3 === 1 ? "500mg" : "TID" },
      });
    }
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "care.saveFinalReview" }));
  });
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const call = api.post.mock.calls.find(([url]) => String(url).includes("/final-review"));
  expect(call[1].decision).toBe("CONTINUE_TREATMENT");
  expect(Array.isArray(call[1].medicines)).toBe(true);
  expect(call[1].hospital_revisit_date).toBe("2026-12-11");
});

test("MO reassessment REFER_SPECIALIST keeps case open messaging", async () => {
  api.post.mockResolvedValueOnce({
    data: {
      plan: {
        ...PLAN,
        status: "MO_REASSESSMENT",
        referral_workflow_required: true,
        mo_reassessment_outcome: "REFER_SPECIALIST",
      },
    },
  });
  await openPlanDetail();
  fireEvent.change(screen.getByDisplayValue("care.decision.closeRecovered"), {
    target: { value: "REFER_SPECIALIST" },
  });
  await waitFor(() => expect(screen.getByDisplayValue("care.decision.referSpecialist")).toBeInTheDocument());
  const form = reviewForm();
  fireEvent.change(form.querySelectorAll("textarea")[0], { target: { value: "Needs specialist" } });
  const textareas = form.querySelectorAll("textarea");
  fireEvent.change(textareas[textareas.length - 1], { target: { value: "Persistent lesion" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "care.saveFinalReview" }));
  });
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const call = api.post.mock.calls.find(([url]) => String(url).includes("/final-review"));
  expect(call[1].decision).toBe("REFER_SPECIALIST");
  expect(call[1].referral_reason).toBe("Persistent lesion");
  await screen.findByText("care.referralWorkflowRequired");
});

test("MO reassessment URGENT_ESCALATION posts urgent reason", async () => {
  api.post.mockResolvedValueOnce({
    data: {
      plan: {
        ...PLAN,
        status: "MO_REASSESSMENT",
        mo_reassessment_outcome: "URGENT_ESCALATION",
      },
    },
  });
  await openPlanDetail();
  fireEvent.change(screen.getByDisplayValue("care.decision.closeRecovered"), {
    target: { value: "URGENT_ESCALATION" },
  });
  await waitFor(() => expect(screen.getByDisplayValue("care.decision.urgentEscalation")).toBeInTheDocument());
  const form = reviewForm();
  fireEvent.change(form.querySelectorAll("textarea")[0], { target: { value: "Emergency" } });
  const textareas = form.querySelectorAll("textarea");
  fireEvent.change(textareas[textareas.length - 1], { target: { value: "Severe bleeding" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "care.saveFinalReview" }));
  });
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const call = api.post.mock.calls.find(([url]) => String(url).includes("/final-review"));
  expect(call[1].decision).toBe("URGENT_ESCALATION");
  expect(call[1].urgent_reason).toBe("Severe bleeding");
});
