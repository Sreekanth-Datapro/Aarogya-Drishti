import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import api from "../../services/api";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
  getAuthMode: jest.fn(() => "online"),
  setAuthMode: jest.fn(),
}));

const USERS = {
  NAVIGATOR: {
    id: "u-nav", username: "nav.one", full_name: "Ravi Teja", role: "NAVIGATOR",
    permissions: ["appointment.book", "appointment.view", "navigation.update", "patient.read_assigned", "referral.view", "treatment.track"],
  },
  SPECIALIST: {
    id: "u-sp", username: "sp.one", full_name: "Dr Anitha", role: "SPECIALIST",
    permissions: ["consultation.note", "image.view", "referral.view", "video.join"],
  },
  MEDICAL_OFFICER: { id: "u-mo", username: "mo.one", full_name: "Medical One", role: "MEDICAL_OFFICER", permissions: [] },
  HOSPITAL_STAFF: {
    id: "u-hs", username: "staff.one", full_name: "Hospital Staff One", role: "HOSPITAL_STAFF",
    permissions: ["appointment.view", "appointment.confirm"],
  },
};

async function openAs(role, route) {
  localStorage.setItem("language", "en");
  sessionStorage.clear();
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("user", JSON.stringify(USERS[role]));
  window.history.pushState({}, "", route);
  const view = render(<App />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  return view;
}

async function clickAndFlush(button) {
  await act(async () => {
    await userEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function careApiCalls() {
  return api.get.mock.calls.map(([url]) => url).filter((url) => /^\/(navigator|specialist|video)/.test(url));
}

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockRejectedValue({ response: { status: 404, data: { message: "API route not found" } } });
});

test("the Navigator dashboard loads assigned counts and referral queue", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") {
      return Promise.resolve({ data: { dashboard: { assigned: 3, pending: 2, scheduled: 1, completed: 0 } } });
    }
    if (url === "/navigator/referrals") {
      return Promise.resolve({
        data: {
          referrals: [{
            id: "ref-1", patient_name: "Synthetic Patient", patient_code: "AD-2026-000001",
            referral_code: "REF-2026-000001", priority_name: "Urgent", priority_code: "URGENT",
            specialty_name: "Oral Medicine", hospital_name: "District Hospital",
            referral_status: "SENT", specialist_name: "Dr Specialist",
          }],
          pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
        },
      });
    }
    return Promise.reject({ response: { status: 404, data: { message: "API route not found" } } });
  });
  await openAs("NAVIGATOR", "/dashboard");

  await waitFor(() => expect(screen.getByText("Synthetic Patient")).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Navigator dashboard" })).toBeInTheDocument();
  expect(screen.getByText("3", { selector: ".stat-value" })).toBeInTheDocument();
  expect(screen.getByText("2", { selector: ".stat-value" })).toBeInTheDocument();
  expect(screen.getByText("District Hospital")).toBeInTheDocument();
  expect(screen.getByText("Dr Specialist")).toBeInTheDocument();
  expect(careApiCalls()).toEqual(["/navigator/dashboard", "/navigator/referrals"]);
});

test("the Navigator menu links to every Navigator module", async () => {
  await openAs("NAVIGATOR", "/dashboard");
  const menu = screen.getByRole("complementary", { name: "Main menu" });

  [
    ["Assigned patients", "/navigator/patients"],
    ["Referrals", "/navigator/referrals"],
    ["Appointments", "/navigator/appointments"],
    ["Video consultations", "/navigator/video"],
    ["Follow-ups", "/navigator/followups"],
    ["Diagnostics", "/navigator/diagnostics"],
  ].forEach(([name, href]) => {
    expect(within(menu).getByRole("link", { name })).toHaveAttribute("href", href);
  });
  expect(within(menu).queryByRole("link", { name: "Reminders and updates" })).not.toBeInTheDocument();
  expect(within(menu).queryByText("Soon")).not.toBeInTheDocument();
});

test("the Specialist dashboard shows its overview and safety rules", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") {
      return Promise.resolve({
        data: { dashboard: { assigned: 0, pending: 0, urgent: 0, completed: 0 } },
      });
    }
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [] } });
    }
    return Promise.resolve({ data: {} });
  });

  await openAs("SPECIALIST", "/dashboard");

  expect(await screen.findByRole("heading", { name: "Namaste, Dr Anitha" })).toBeInTheDocument();
  expect(screen.getByText("Specialist workspace")).toBeInTheDocument();
  expect(screen.getAllByText("0", { selector: ".stat-value" })).toHaveLength(4);
  expect(screen.getByText("Your recommendations never replace the Medical Officer's signed review.")).toBeInTheDocument();
  expect(screen.getByText("View oral photos (with consent)")).toBeInTheDocument();
  expect(screen.getAllByText("Your step")).toHaveLength(1);

  const menu = screen.getByRole("complementary", { name: "Main menu" });
  expect(within(menu).getByRole("link", { name: "Referral queue" })).toHaveAttribute("href", "/specialist/referrals");
  expect(within(menu).getByRole("link", { name: "Clinical notes" })).toHaveAttribute("href", "/specialist/notes");
  expect(careApiCalls()).toEqual(["/specialist/dashboard", "/specialist/referrals"]);
});

test("the Specialist can create and cancel their future availability slots", async () => {
  const priorPermissions = USERS.SPECIALIST.permissions;
  USERS.SPECIALIST.permissions = [...priorPermissions, "appointment.slot_manage"];
  let slotCreated = false;
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [], pagination: { page: 1, total_pages: 0, total: 0 } } });
    }
    if (url === "/specialist/availability/hospitals") {
      return Promise.resolve({ data: { hospitals: [{ id: 8, name_en: "Assigned Hospital" }] } });
    }
    if (url === "/specialist/availability/slots") {
      return Promise.resolve({
        data: {
          slots: slotCreated ? [{
            id: "slot-1",
            slot_start: "2030-01-02T10:00:00.000Z",
            slot_end: "2030-01-02T10:30:00.000Z",
            mode: "VIDEO",
            booking_status: "AVAILABLE",
            can_cancel: true,
          }] : [],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
  api.post.mockImplementation((url) => {
    if (url === "/specialist/availability/slots") slotCreated = true;
    return Promise.resolve({ data: { slot: { id: "slot-1" } } });
  });
  api.delete.mockImplementation(() => {
    slotCreated = false;
    return Promise.resolve({ data: { slot: { cancelled: true } } });
  });

  try {
    await openAs("SPECIALIST", "/specialist/referrals");
    expect(await screen.findByRole("heading", { name: "Manage availability" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-01-02" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText("Hospital (optional)"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Create slot" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/specialist/availability/slots",
      expect.objectContaining({
        slot_start: new Date("2030-01-02T10:00:00").toISOString(),
        slot_end: new Date("2030-01-02T10:30:00").toISOString(),
        hospital_id: "8",
      })
    ));
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(screen.getAllByText("VIDEO").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel slot" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      "/specialist/availability/slots/slot-1"
    ));
    expect(await screen.findByText("Consultation slot cancelled.")).toBeInTheDocument();
  } finally {
    USERS.SPECIALIST.permissions = priorPermissions;
  }
});

test("the Specialist receives an availability request and can accept the requested time", async () => {
  const priorPermissions = USERS.SPECIALIST.permissions;
  USERS.SPECIALIST.permissions = [...priorPermissions, "appointment.slot_manage"];
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [], pagination: { page: 1, total_pages: 0, total: 0 } } });
    }
    if (url === "/specialist/availability/requests") {
      return Promise.resolve({ data: { requests: [{
        id: "availability-request-1",
        patient_code: "SYNTH-AVAIL-PAT",
        referral_code: "SYNTH-AVAIL-REF",
        specialty_name: "Synthetic specialty",
        hospital_name: "Synthetic hospital",
        requested_start: "2035-02-01T10:00:00.000Z",
        requested_end: "2035-02-01T10:30:00.000Z",
        teleconsult_consent_status: "ACTIVE",
      }] } });
    }
    if (url === "/specialist/availability/slots") return Promise.resolve({ data: { slots: [] } });
    if (url === "/specialist/availability/hospitals") return Promise.resolve({ data: { hospitals: [] } });
    return Promise.resolve({ data: {} });
  });

  try {
    await openAs("SPECIALIST", "/specialist/referrals");
    expect(await screen.findByText(/SYNTH-AVAIL-PAT/)).toBeInTheDocument();
    expect(screen.getByText(/SYNTH-AVAIL-REF/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept requested time" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/specialist/availability/requests/availability-request-1/respond",
      { response: "ACCEPT" }
    ));
    expect(await screen.findByText("Availability response sent. Hospital Staff must confirm the appointment.")).toBeInTheDocument();
  } finally {
    USERS.SPECIALIST.permissions = priorPermissions;
  }
});

test("the Navigator referral menu opens its live queue", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    return Promise.resolve({ data: { referrals: [], pagination: { page: 1, page_size: 10, total: 0, total_pages: 0 } } });
  });
  await openAs("NAVIGATOR", "/navigator/referrals");
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Referral queue" })).toBeInTheDocument());
  expect(screen.getByText("No referrals found")).toBeInTheDocument();
  expect(careApiCalls()).toContain("/navigator/referrals");
});

test("the Navigator sees Specialist responses and Hospital Staff confirmation status", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/navigator/referrals") {
      return Promise.resolve({
        data: {
          referrals: [{
            id: "navigator-referral-availability",
            patient_name: "Synthetic Navigator Patient",
            patient_code: "SYNTH-NAV-PAT",
            referral_code: "SYNTH-NAV-REF",
            priority_name: "Routine",
            priority_code: "ROUTINE",
            specialty_name: "Synthetic specialty",
            hospital_name: "Synthetic hospital",
            referral_status: "SENT",
            specialist_name: "Synthetic Specialist",
          }],
          pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
        },
      });
    }
    if (url === "/navigator/referrals/navigator-referral-availability") {
      return Promise.resolve({ data: {
        referral: {
          id: "navigator-referral-availability",
          patient_name: "Synthetic Navigator Patient",
          patient_code: "SYNTH-NAV-PAT",
          referral_code: "SYNTH-NAV-REF",
          specialty_name: "Synthetic specialty",
          hospital_name: "Synthetic hospital",
          priority_name: "Routine",
          reason: "Synthetic reason",
        },
        status_history: [],
        appointments: [],
        contacts: [],
        specialist_decision: null,
        video_availability_requests: [{
          id: "navigator-availability-request",
          status: "SUGGESTED",
          requested_start: "2035-02-01T10:00:00.000Z",
          requested_end: "2035-02-01T10:30:00.000Z",
          proposed_start: "2035-02-02T11:00:00.000Z",
          proposed_end: "2035-02-02T11:30:00.000Z",
          response_reason: "Synthetic response",
          video_status: "CONFIRMED",
        }],
      } });
    }
    return Promise.resolve({ data: {} });
  });

  await openAs("NAVIGATOR", "/navigator/referrals");
  fireEvent.click(await screen.findByRole("button", { name: "Open details" }));
  expect(await screen.findByText("Specialist suggested another time")).toBeInTheDocument();
  expect(screen.getByText("Response: Synthetic response")).toBeInTheDocument();
  expect(screen.getByText("Appointment: Confirmed")).toBeInTheDocument();
});

test("the Specialist referral page loads the assigned queue and assigned details", async () => {
  const referral = {
    id: "ref-sp-1",
    patient_name: "Synthetic Specialist Patient",
    patient_code: "AD-2026-000009",
    referral_code: "REF-2026-000009",
    priority_name: "Urgent",
    priority_code: "URGENT",
    hospital_name: "District Hospital",
    specialty_name: "Oral Medicine",
    assessment_completed_at: null,
  };
  const detail = {
    referral: {
      ...referral,
      patient_sex: "FEMALE",
      age_years: 42,
      referral_reason: "Clinical review requested",
      medical_officer_finding: "Screening finding",
      medical_officer_impression: "Needs specialist review",
      screening_date: "2026-05-01",
    },
    findings: [{ id: "finding-1", finding_kind: "LESION", oral_site: "TONGUE", description: "Synthetic finding" }],
    ai_observations: [],
    medical_history: [],
    investigation_orders: [],
    reports: [],
    consultations: [],
    images: [],
    image_capture_consent: false,
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") {
      return Promise.resolve({ data: { dashboard: { assigned: 2, pending: 1, urgent: 1, completed: 1 } } });
    }
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-1") return Promise.resolve({ data: detail });
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  await openAs("SPECIALIST", "/specialist/referrals");

  await waitFor(() => expect(screen.getByText("Synthetic Specialist Patient")).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Assigned referral dashboard" })).toBeInTheDocument();
  expect(screen.getByText("2", { selector: ".stat-value" })).toBeInTheDocument();
  expect(screen.getAllByText("Urgent").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "Review case" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/specialist/referrals/ref-sp-1"));
  await waitFor(() => expect(screen.getAllByText("Clinical review requested").length).toBeGreaterThan(0));
  expect(screen.getByText(/AI observations — advisory only/)).toBeInTheDocument();
  expect(screen.getByText("No medical history has been recorded.")).toBeInTheDocument();
  expect(screen.getByText("No saved AI analysis results are available.")).toBeInTheDocument();
  expect(screen.getByText("No reports are available for this referral.")).toBeInTheDocument();
  expect(screen.getByText("Current image-capture consent is not active. Images are not available.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Specialist Consultation Decision" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Emergency hospital referral" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Direct hospital visit" }));
  expect(screen.getByLabelText("Assigned hospital")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Additional investigations" }));
  expect(screen.getByLabelText("Investigation type")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clinical follow-up" }));
  expect(screen.getByLabelText("Follow-up date")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Emergency hospital referral" }));
  expect(screen.getByText(/Emergency: do not delay urgent care/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Video consultation" }));
  expect(screen.getByText(/Video consultation requires active TELECONSULT consent/)).toBeInTheDocument();
  expect(screen.getByText(/Signing records your clinical decision only/)).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/specialist/referrals/ref-sp-1");
});

test("the Specialist details page renders saved clinical, AI and investigation information", async () => {
  URL.createObjectURL = jest.fn(() => "blob:specialist-report");
  URL.revokeObjectURL = jest.fn();
  const referral = {
    id: "ref-sp-clinical",
    patient_name: "Synthetic Clinical Patient",
    patient_code: "AD-2026-000011",
    referral_code: "REF-2026-000011",
    referral_reason: "Synthetic referral reason",
    hospital_name: "Synthetic hospital",
    specialty_name: "Oral Medicine",
    age_years: 51,
    patient_sex: "FEMALE",
    screening_date: "2026-04-02",
    screening_case_state: "AWAITING_CLINICIAN",
    chief_complaint: "Synthetic symptom",
    screening_notes: "Synthetic screening observation",
    medical_officer_finding: "Synthetic MO finding",
    medical_officer_impression: "Synthetic MO impression",
    medical_officer_recommendations: "Synthetic MO recommendation",
    medical_officer_signed_at: "2026-04-03T10:00:00Z",
    medical_officer_name: "Synthetic MO",
  };
  const detail = {
    referral,
    findings: [{ id: "finding-clinical", finding_kind: "SYMPTOM", oral_site: "TONGUE", description: "Synthetic examination finding" }],
    medical_history: [{ history_kind: "CONDITION", condition_text: "Synthetic condition", is_current: true }],
    ai_observations: [{
      id: "ai-clinical",
      status: "COMPLETED",
      result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW",
      score: 0.82,
      model_provider: "synthetic-provider",
      model_version: "synthetic-v1",
      is_research_only: true,
      clinical_use: false,
      warning: "NOT FOR CLINICAL USE",
      image_view: "FRONT_VIEW",
      analysis_details: {
        classification: "ABNORMAL",
        model_confidence: 82,
        observations: ["Synthetic saved observation"],
      },
    }],
    investigation_orders: [{
      id: "order-clinical",
      investigation_name: "Synthetic investigation",
      status: "In progress",
      indication: "Synthetic indication",
    }],
    reports: [{
      id: "report-clinical",
      investigation_name: "Synthetic investigation",
      doc_kind: "PATHOLOGY_REPORT",
      summary: "Synthetic report summary",
    }],
    consultations: [],
    images: [],
    image_capture_consent: false,
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-clinical") return Promise.resolve({ data: detail });
    if (url.endsWith("/reports/report-clinical/file")) return Promise.resolve({ data: new Blob(["report"]) });
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  await openAs("SPECIALIST", "/specialist/referrals");
  fireEvent.click(await screen.findByRole("button", { name: "Review case" }));

  expect(await screen.findByText(/Synthetic condition/)).toBeInTheDocument();
  expect(screen.getByText("Synthetic screening observation")).toBeInTheDocument();
  expect(screen.getByText("Synthetic MO recommendation")).toBeInTheDocument();
  expect(screen.getByText("Synthetic saved observation")).toBeInTheDocument();
  expect(screen.getByText("Synthetic report summary")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Medical history" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Screening details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Medical Officer referral" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "AI analysis report" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Investigation orders" })).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    "/specialist/referrals/ref-sp-clinical/reports/report-clinical/file",
    { responseType: "blob" }
  ));
});

test("the Specialist can sign a video decision without creating a consultation or selecting a slot", async () => {
  jest.setTimeout(15000);
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  const referral = {
    id: "ref-sp-consult",
    patient_name: "Synthetic Consultation Patient",
    patient_code: "AD-2026-000014",
    referral_code: "REF-2026-000014",
  };
  let savedDecision = null;
  let signed = false;
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-consult") {
      return Promise.resolve({
        data: {
          referral,
          findings: [],
          medical_history: [],
          ai_observations: [],
          investigation_orders: [],
          reports: [],
          consultations: [],
          teleconsult_consent: { status: "ACTIVE", captured_at: "2026-11-09T10:00:00Z" },
          specialist_decision: signed
            ? { ...savedDecision, status: "SIGNED", signed_at: "2026-11-10T07:00:00Z" }
            : savedDecision,
          decision_options: { hospitals: [], priorities: [], investigation_types: [] },
          images: [],
          image_capture_consent: false,
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
  api.put.mockImplementation(async (_url, body) => {
    savedDecision = { id: "decision-1", ...body, status: "DRAFT" };
    return { data: { decision: savedDecision } };
  });
  api.post.mockImplementation(async (url) => {
    if (url === `/specialist/referrals/${referral.id}/assessment/sign`) {
      signed = true;
      return { data: { decision: { ...savedDecision, status: "SIGNED" } } };
    }
    return { data: {} };
  });

  try {
    await openAs("SPECIALIST", "/specialist/referrals");
    fireEvent.click(await screen.findByRole("button", { name: "Review case" }));
    expect(await screen.findByText("Video consultation consent")).toBeInTheDocument();
    expect(await screen.findByText("Active")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Video consultation" }));
    expect(await screen.findByText(/Signing records your clinical decision only/)).toBeInTheDocument();
    expect(screen.queryByText(/Video consultation requires active TELECONSULT consent/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Synthetic clinical reason" } });
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Remote review recommended" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/specialist/referrals/ref-sp-consult/assessment/draft",
      {
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Synthetic clinical reason",
        clinical_recommendation: "Remote review recommended",
        instructions: "",
        additional_notes: "",
        priority_id: null,
        follow_up_date: null,
        hospital_id: null,
        investigation_type_id: null,
      }
    ));
    fireEvent.click(screen.getByRole("button", { name: "Submit clinical decision" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/specialist/referrals/${referral.id}/assessment/sign`,
      expect.objectContaining({
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Synthetic clinical reason",
        clinical_recommendation: "Remote review recommended",
      })
    ));
    expect(await screen.findByText(/Signed clinical decision/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith(
      "/specialist/referrals/ref-sp-consult/consultations",
      expect.anything()
    );
  } finally {
    confirm.mockRestore();
  }
});

test("the Specialist can reopen and sign a saved direct-hospital decision draft", async () => {
  const referral = {
    id: "ref-sp-saved-draft",
    patient_name: "Synthetic Draft Patient",
    patient_code: "AD-2026-000015",
    referral_code: "REF-2026-000015",
    priority_id: 3,
  };
  const draft = {
    id: "decision-saved-draft",
    status: "DRAFT",
    decision_type: "DIRECT_HOSPITAL_VISIT",
    clinical_reason: "Synthetic saved reason",
    clinical_recommendation: "Synthetic saved recommendation",
    instructions: "Synthetic coordination instructions",
    priority_id: 3,
    hospital_id: 8,
  };
  let signed = false;
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === `/specialist/referrals/${referral.id}`) {
      return Promise.resolve({
        data: {
          referral,
          specialist_decision: signed
            ? { ...draft, status: "SIGNED", signed_at: "2026-11-10T07:00:00Z" }
            : draft,
          findings: [],
          medical_history: [],
          ai_observations: [],
          investigation_orders: [],
          reports: [],
          consultations: [],
          decision_options: {
            hospitals: [{ id: 8, name_en: "Synthetic District Hospital" }],
            priorities: [{ id: 3, name_en: "Normal" }],
            investigation_types: [],
          },
          images: [],
          image_capture_consent: false,
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
  api.post.mockImplementation(async (url) => {
    if (url === `/specialist/referrals/${referral.id}/assessment/sign`) {
      signed = true;
      return { data: { decision: { ...draft, status: "SIGNED" } } };
    }
    return { data: {} };
  });

  try {
    await openAs("SPECIALIST", "/specialist/referrals");
    fireEvent.click(await screen.findByRole("button", { name: "Review case" }));
    expect(await screen.findByLabelText("Clinical reason")).toHaveValue("Synthetic saved reason");
    expect(screen.getByLabelText("Clinical recommendation")).toHaveValue("Synthetic saved recommendation");
    expect(screen.getByLabelText("Instructions for care coordination")).toHaveValue("Synthetic coordination instructions");
    expect(screen.getByLabelText("Priority")).toHaveValue("3");
    expect(screen.getByLabelText("Assigned hospital")).toHaveValue("8");

    fireEvent.click(screen.getByRole("button", { name: "Submit clinical decision" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/specialist/referrals/${referral.id}/assessment/sign`,
      expect.objectContaining({
        decision_type: "DIRECT_HOSPITAL_VISIT",
        clinical_reason: "Synthetic saved reason",
        clinical_recommendation: "Synthetic saved recommendation",
        instructions: "Synthetic coordination instructions",
        priority_id: "3",
        hospital_id: "8",
      })
    ));
    expect(await screen.findByText(/Signed clinical decision/)).toBeInTheDocument();
  } finally {
    confirm.mockRestore();
  }
});

test("video sign-off requires active consent but does not require an existing slot", async () => {
  const referral = {
    id: "ref-sp-video-no-consent",
    patient_name: "Synthetic Video Patient",
    patient_code: "AD-2026-000016",
    referral_code: "REF-2026-000016",
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === `/specialist/referrals/${referral.id}`) {
      return Promise.resolve({
        data: {
          referral,
          teleconsult_consent: { status: "NOT_GIVEN", captured_at: null },
          specialist_decision: {
            id: "decision-video-draft",
            status: "DRAFT",
            decision_type: "VIDEO_CONSULTATION",
            clinical_reason: "Synthetic video reason",
          },
          findings: [],
          medical_history: [],
          ai_observations: [],
          investigation_orders: [],
          reports: [],
          consultations: [],
          decision_options: { hospitals: [], priorities: [], investigation_types: [] },
          images: [],
          image_capture_consent: false,
        },
      });
    }
    return Promise.resolve({ data: {} });
  });

  await openAs("SPECIALIST", "/specialist/referrals");
  fireEvent.click(await screen.findByRole("button", { name: "Review case" }));
  expect(await screen.findByText(/Video consultation requires active TELECONSULT consent/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit clinical decision" }));

  // One alert only — do not duplicate the same consent message as a second field error.
  expect(screen.getAllByText(/Video consultation requires active TELECONSULT consent/)).toHaveLength(1);
  expect(api.get).not.toHaveBeenCalledWith(
    `/specialist/referrals/${referral.id}/consultation-slots`
  );
  expect(api.post).not.toHaveBeenCalledWith(
    `/specialist/referrals/${referral.id}/assessment/sign`,
    expect.anything()
  );
});

test("the Specialist page shows a section error without hiding other detail sections", async () => {
  const referral = {
    id: "ref-sp-partial",
    patient_name: "Synthetic Partial Patient",
    patient_code: "AD-2026-000012",
    referral_code: "REF-2026-000012",
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-partial") {
      return Promise.resolve({
        data: {
          referral,
          findings: [],
          medical_history: [],
          ai_observations: [],
          investigation_orders: [],
          reports: [],
          consultations: [],
          images: [],
          image_capture_consent: false,
          section_errors: { ai_analysis: "LOAD_FAILED" },
        },
      });
    }
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  await openAs("SPECIALIST", "/specialist/referrals");
  fireEvent.click(await screen.findByRole("button", { name: "Review case" }));

  expect(await screen.findByText("This section could not be loaded. Other available sections remain visible.")).toBeInTheDocument();
  expect(screen.getByText("No medical history has been recorded.")).toBeInTheDocument();
  expect(screen.getByText("No reports are available for this referral.")).toBeInTheDocument();
});

test("the Specialist page shows original and enhanced images separately with an enhancement fallback", async () => {
  URL.createObjectURL = jest.fn(() => "blob:specialist-image");
  URL.revokeObjectURL = jest.fn();
  const referral = {
    id: "ref-sp-2", patient_name: "Synthetic Image Patient", patient_code: "AD-2026-000010",
    referral_code: "REF-2026-000010", priority_name: "Routine", priority_code: "ROUTINE",
    hospital_name: "District Hospital", specialty_name: "Oral Medicine",
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-2") {
      return Promise.resolve({
        data: {
          referral,
          findings: [],
          reports: [],
          ai_observations: [],
          consultations: [],
          image_capture_consent: true,
          images: [{
            id: "photo-1", annotation_site: "Front View", width_px: 640, height_px: 480,
            enhancement_status: "NOT_PERFORMED",
          }],
        },
      });
    }
    if (url.endsWith("/enhanced-file")) {
      return Promise.reject({ response: { status: 404, data: { message: "Unavailable" } } });
    }
    if (url.endsWith("/file")) return Promise.resolve({ data: new Blob(["image"]) });
    return Promise.reject({ response: { status: 404, data: { message: "Not found" } } });
  });
  await openAs("SPECIALIST", "/specialist/referrals");
  await waitFor(() => expect(screen.getByText("Synthetic Image Patient")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Review case" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/specialist/referrals/ref-sp-2"));
  await waitFor(() => expect(screen.getByText("Front View")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByAltText("Front View - Original Image")).toBeInTheDocument());
  expect(screen.getByText("AI Enhanced Image")).toBeInTheDocument();
  expect(screen.getByText("No enhanced copy has been generated for this image yet.")).toBeInTheDocument();
  expect(screen.getByText(/AI-enhanced images are for visual assistance only/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry enhancement" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/specialist/referrals/ref-sp-2/images/photo-1/enhance"
  ));
});

test("the Specialist image panel explains a recorded enhancement upload failure", async () => {
  const referral = {
    id: "ref-sp-failed",
    patient_name: "Synthetic Enhancement Failure Patient",
    patient_code: "AD-2026-000013",
    referral_code: "REF-2026-000013",
  };
  api.get.mockImplementation((url) => {
    if (url === "/specialist/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url === "/specialist/referrals") {
      return Promise.resolve({ data: { referrals: [referral], pagination: { page: 1, total_pages: 1, total: 1 } } });
    }
    if (url === "/specialist/referrals/ref-sp-failed") {
      return Promise.resolve({
        data: {
          referral,
          findings: [],
          medical_history: [],
          ai_observations: [],
          investigation_orders: [],
          reports: [],
          consultations: [],
          image_capture_consent: true,
          images: [{
            id: "photo-failed",
            view_type: "FRONT_VIEW",
            enhancement_status: "FAILED",
            enhancement_failure_stage: "STORAGE_UPLOAD",
            enhancement_error_code: "IMAGE_STORAGE_UPLOAD_FAILED",
          }],
        },
      });
    }
    if (url.endsWith("/enhanced-file")) {
      return Promise.reject({
        response: { status: 404, data: { code: "IMAGE_FILE_MISSING", message: "Missing" } },
      });
    }
    return Promise.resolve({ data: new Blob(["synthetic-image"]) });
  });
  await openAs("SPECIALIST", "/specialist/referrals");
  fireEvent.click(await screen.findByRole("button", { name: "Review case" }));

  expect(await screen.findByText("Real-ESRGAN generated an image, but the private bucket did not save it.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry enhancement" })).toBeInTheDocument();
});

test("Navigator can record a contact and request an appointment from assigned referral details", async () => {
  const detail = {
    referral: {
      id: "ref-1", patient_name: "Synthetic Patient", patient_code: "AD-2026-000001",
      referral_code: "REF-2026-000001", contact_phone: "0000000000",
      health_worker_name: "Synthetic Health Worker", health_worker_phone: "+1 202 555 0100",
      health_worker_id: "77777777-7777-4777-8777-777777777777",
      hospital_name: "District Hospital", specialty_name: "Oral Medicine",
      priority_name: "Urgent", reason: "Synthetic referral", specialist_name: null,
    },
    contacts: [],
    appointments: [],
  };
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url.startsWith("/navigator/referrals/")) return Promise.resolve({ data: detail });
    return Promise.resolve({
      data: {
        referrals: [{
          id: "ref-1", patient_name: "Synthetic Patient", patient_code: "AD-2026-000001",
          referral_code: "REF-2026-000001", priority_name: "Urgent", priority_code: "URGENT",
          specialty_name: "Oral Medicine", hospital_name: "District Hospital", referral_status: "SENT",
        }],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  await openAs("NAVIGATOR", "/dashboard");
  await waitFor(() => expect(screen.getByText("Synthetic Patient")).toBeInTheDocument());
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: "Open details" }));
  });
  await waitFor(() => expect(screen.getByText("0000000000")).toBeInTheDocument());
  expect(screen.getByText("Synthetic Health Worker")).toBeInTheDocument();
  expect(screen.getByText("+1 202 555 0100")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Call" }).map((link) => link.getAttribute("href"))).toEqual([
    "tel:0000000000",
    "tel:+12025550100",
  ]);

  await userEvent.selectOptions(screen.getByLabelText("Outcome"), "NOT_REACHED");
  await userEvent.selectOptions(screen.getByLabelText("Who did you contact?"), "PATIENT");
  await userEvent.type(screen.getByLabelText("Notes (optional)"), "Call attempt");
  await userEvent.click(screen.getByRole("button", { name: "Save contact attempt" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/navigator/referrals/ref-1/contacts",
    { channel: "PHONE", outcome: "NOT_REACHED", recipient: "PATIENT", notes: "Call attempt" }
  ));
  await waitFor(() => expect(screen.getByText("Contact attempt saved.")).toBeInTheDocument());

  const schedule = screen.getByLabelText("Date and time");
  fireEvent.change(schedule, { target: { value: "2030-01-01T10:00" } });
  await userEvent.click(screen.getByRole("button", { name: "Request appointment" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/navigator/referrals/ref-1/appointments",
    expect.objectContaining({ assigned_service: "", location_note: "" })
  ));
});

test("Navigator can record a contact attempt with the registering Health Worker recipient", async () => {
  const detail = {
    referral: {
      id: "ref-hw", patient_name: "Synthetic Patient", patient_code: "AD-2026-000003",
      referral_code: "REF-2026-000003", contact_phone: null,
      health_worker_name: "Synthetic Health Worker", health_worker_phone: "0000000001",
      health_worker_id: "77777777-7777-4777-8777-777777777777",
      hospital_name: "District Hospital", specialty_name: "Oral Medicine",
      priority_name: "Urgent", reason: "Synthetic referral", specialist_name: null,
    },
    contacts: [],
    appointments: [],
  };
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url.startsWith("/navigator/referrals/")) return Promise.resolve({ data: detail });
    return Promise.resolve({
      data: {
        referrals: [{
          id: "ref-hw", patient_name: "Synthetic Patient", patient_code: "AD-2026-000003",
          referral_code: "REF-2026-000003", priority_name: "Urgent", priority_code: "URGENT",
          specialty_name: "Oral Medicine", hospital_name: "District Hospital", referral_status: "SENT",
        }],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  await openAs("NAVIGATOR", "/navigator/referrals");
  await act(async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Open details" }));
  });
  const recipient = screen.getByLabelText("Who did you contact?");
  expect(within(recipient).getByRole("option", { name: "Registering Health Worker" })).toBeEnabled();
  await userEvent.selectOptions(recipient, "HEALTH_WORKER");
  await userEvent.selectOptions(screen.getByLabelText("Outcome"), "REACHED");
  await userEvent.type(screen.getByLabelText("Notes (optional)"), "Synthetic Health Worker contact");
  await userEvent.click(screen.getByRole("button", { name: "Save contact attempt" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/navigator/referrals/ref-hw/contacts",
    {
      channel: "PHONE", outcome: "REACHED", recipient: "HEALTH_WORKER",
      notes: "Synthetic Health Worker contact",
    }
  ));
});

test("Hospital Staff navigation and appointment actions are role-specific", async () => {
  const appointment = {
    id: "appointment-1", patient_code: "AD-SYNTH-0001", referral_code: "REF-SYNTH-0001",
    specialty_name: "Synthetic specialty", requesting_clinician: "Synthetic Medical Officer",
    scheduled_at: "2030-01-01T10:00:00Z", location_note: "Synthetic coordination",
    status_code: "REQUESTED", attendance: "PENDING",
  };
  api.get.mockImplementation((url) => {
    if (url === "/hospital-staff/appointments") return Promise.resolve({ data: { appointments: [appointment] } });
    return Promise.reject({ response: { status: 404, data: { message: "API route not found" } } });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  await openAs("HOSPITAL_STAFF", "/hospital-staff/appointments");
  expect(await screen.findAllByText("AD-SYNTH-0001")).toHaveLength(2);
  expect(screen.getByText("Synthetic Medical Officer")).toBeInTheDocument();

  await clickAndFlush(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/appointments/appointment-1/confirm", {}
  ));
  expect(await screen.findByText("Appointment confirmed.")).toBeInTheDocument();

  const menu = screen.getByRole("complementary", { name: "Main menu" });
  expect(within(menu).getByRole("link", { name: "Appointments" })).toHaveAttribute("href", "/hospital-staff/appointments");
  expect(within(menu).getByRole("link", { name: "Attendance" })).toHaveAttribute("href", "/hospital-staff/attendance");
});

test("Hospital Staff dashboard shows empty and error states", async () => {
  api.get.mockResolvedValueOnce({ data: { appointments: [] } });
  await openAs("HOSPITAL_STAFF", "/hospital-staff/appointments");
  expect(await screen.findByText("No appointments found")).toBeInTheDocument();
  api.get.mockRejectedValueOnce({ response: { status: 500, data: { message: "synthetic service failure" } } });
  await clickAndFlush(screen.getByRole("button", { name: "common.refresh" }));
  expect(await screen.findByText("synthetic service failure")).toBeInTheDocument();
});

test("Hospital Staff can reschedule and record attendance through their protected API", async () => {
  let listStatus = "REQUESTED";
  api.get.mockImplementation((url) => {
    if (url === "/hospital-staff/appointments") {
      return Promise.resolve({ data: { appointments: [{
        id: "appointment-2", patient_code: "AD-SYNTH-0002", referral_code: "REF-SYNTH-0002",
        specialty_name: "Synthetic specialty", requesting_clinician: "Synthetic MO",
        scheduled_at: "2030-01-01T10:00:00Z", location_note: "Synthetic note",
        status_code: listStatus, attendance: "PENDING",
      }] } });
    }
    return Promise.resolve({ data: { history: [] } });
  });
  api.post.mockImplementation((url) => {
    if (url.endsWith("/reschedule")) listStatus = "CONFIRMED";
    if (url.endsWith("/attendance")) listStatus = "MISSED";
    return Promise.resolve({ data: { success: true } });
  });
  await openAs("HOSPITAL_STAFF", "/hospital-staff/appointments");
  await userEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
  fireEvent.change(screen.getByLabelText("New date and time"), { target: { value: "2030-01-02T10:00" } });
  await userEvent.type(screen.getByLabelText("Reschedule reason"), "Synthetic reason");
  await clickAndFlush(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/appointments/appointment-2/reschedule",
    { scheduled_at: new Date("2030-01-02T10:00").toISOString(), reason: "Synthetic reason" }
  ));
  expect(await screen.findByText("Appointment rescheduled.")).toBeInTheDocument();

  await clickAndFlush(screen.getByRole("link", { name: "Attendance" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Record attendance" })).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "Record attendance" }));
  await userEvent.selectOptions(screen.getByLabelText("Attendance result"), "NO_SHOW");
  await userEvent.type(screen.getByLabelText("No-show reason (required for no-show)"), "Synthetic no-show");
  await clickAndFlush(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/appointments/appointment-2/attendance",
    { attendance: "NO_SHOW", reason: "Synthetic no-show" }
  ));
  expect(await screen.findByText("Attendance recorded.")).toBeInTheDocument();
});

test("Navigator shows missing contacts without offering invalid call actions", async () => {
  const detail = {
    referral: {
      id: "ref-2", patient_name: "Synthetic Patient Two", patient_code: "AD-2026-000002",
      referral_code: "REF-2026-000002", contact_phone: null,
      health_worker_name: "Synthetic Health Worker", health_worker_phone: null,
      hospital_name: "District Hospital", specialty_name: "Oral Medicine",
      priority_name: "Urgent", reason: "Synthetic referral", specialist_name: null,
    },
    contacts: [],
    appointments: [],
  };
  api.get.mockImplementation((url) => {
    if (url === "/navigator/dashboard") return Promise.resolve({ data: { dashboard: {} } });
    if (url.startsWith("/navigator/referrals/")) return Promise.resolve({ data: detail });
    return Promise.resolve({
      data: {
        referrals: [{
          id: "ref-2", patient_name: "Synthetic Patient Two", patient_code: "AD-2026-000002",
          referral_code: "REF-2026-000002", priority_name: "Urgent", priority_code: "URGENT",
          specialty_name: "Oral Medicine", hospital_name: "District Hospital", referral_status: "SENT",
        }],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      },
    });
  });
  await openAs("NAVIGATOR", "/dashboard");
  await act(async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Open details" }));
  });

  expect(await screen.findAllByText("Not provided")).toHaveLength(2);
  expect(screen.getByText("Patient number missing. Contact the registering Health Worker.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Call" })).not.toBeInTheDocument();
});

test("the Specialist video page keeps joining switched off", async () => {
  await openAs("SPECIALIST", "/specialist/video");

  expect(screen.getByRole("heading", { level: 1, name: "Video consultations" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Video not configured" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Join meeting" })).toBeDisabled();
  expect(screen.getByText("Off: calls are never recorded by default")).toBeInTheDocument();
  expect(careApiCalls()).toEqual([]);
});

test("each role only opens its own pages", async () => {
  await openAs("NAVIGATOR", "/specialist/referrals");
  expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
});

test("a Medical Officer cannot open Navigator pages", async () => {
  await openAs("MEDICAL_OFFICER", "/navigator/patients");
  expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
});

test("Hospital Staff dashboard route opens appointments and exposes only staff navigation", async () => {
  api.get.mockResolvedValue({ data: { appointments: [] } });
  await openAs("HOSPITAL_STAFF", "/dashboard");

  expect(await screen.findByRole("heading", { name: "Hospital appointment requests" })).toBeInTheDocument();
  const menu = screen.getByRole("complementary", { name: "Main menu" });
  expect(within(menu).getByRole("link", { name: "Appointments" })).toBeInTheDocument();
  expect(within(menu).getByRole("link", { name: "Attendance" })).toBeInTheDocument();
  expect(within(menu).queryByRole("link", { name: "Clinical Review" })).not.toBeInTheDocument();
  expect(within(menu).queryByRole("link", { name: "Referral queue" })).not.toBeInTheDocument();
});

test("Hospital Staff cannot open Medical Officer dashboards", async () => {
  await openAs("HOSPITAL_STAFF", "/medical-officer/review");
  expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/medical-officer/review");
});

test("Hospital Staff dashboard route opens appointments and exposes only staff navigation", async () => {
  api.get.mockResolvedValue({ data: { appointments: [] } });
  await openAs("HOSPITAL_STAFF", "/dashboard");

  expect(await screen.findByRole("heading", { name: "Hospital appointment requests" })).toBeInTheDocument();
  const menu = screen.getByRole("complementary", { name: "Main menu" });
  expect(within(menu).getByRole("link", { name: "Appointments" })).toBeInTheDocument();
  expect(within(menu).getByRole("link", { name: "Attendance" })).toBeInTheDocument();
  expect(within(menu).queryByRole("link", { name: "Clinical Review" })).not.toBeInTheDocument();
  expect(within(menu).queryByRole("link", { name: "Referral queue" })).not.toBeInTheDocument();
});

test("Hospital Staff cannot open Medical Officer dashboards", async () => {
  await openAs("HOSPITAL_STAFF", "/medical-officer/review");
  expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/medical-officer/review");
});
