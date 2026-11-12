import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "../../services/api";
import HospitalStaffDashboard from "./HospitalStaffDashboard";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key) => key,
    tm: (message) => message,
    language: "en",
  }),
}));

const syntheticAppointments = [
  {
    id: "synthetic-appointment-1",
    patient_code: "SYNTH-PAT-001",
    referral_code: "SYNTH-REF-001",
    specialty_name: "Synthetic specialty",
    requesting_clinician: "Synthetic clinician",
    scheduled_at: "2030-01-02T10:00:00.000Z",
    assigned_service: "",
    location_note: "Synthetic note",
    status_code: "REQUESTED",
  },
  {
    id: "synthetic-appointment-2",
    patient_code: "SYNTH-PAT-002",
    referral_code: "SYNTH-REF-002",
    specialty_name: "Synthetic specialty",
    requesting_clinician: "Synthetic clinician",
    scheduled_at: "2030-01-03T10:00:00.000Z",
    assigned_service: "",
    location_note: "",
    status_code: "CONFIRMED",
  },
];

const syntheticVideoConsultation = {
  id: "synthetic-video-consultation",
  referral_id: "synthetic-video-referral-id",
  patient_code: "SYNTH-VIDEO-PAT-001",
  referral_code: "SYNTH-VIDEO-REF-001",
  referral_mode: "VIDEO_CONSULT",
  specialty_name: "Synthetic specialty",
  specialist_name: "Synthetic Specialist",
  scheduled_at: "2030-01-02T10:00:00.000Z",
  hospital_name: "Synthetic Hospital",
  teleconsult_consent_status: "ACTIVE",
  availability_status: "RESERVED",
  status_code: "REQUESTED",
  alternative_slots: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [syntheticVideoConsultation] } });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });
});

test("Hospital Staff dashboard shows appointment analytics from its facility-scoped API", async () => {
  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("hospitalStaff.recentRequests")).toBeInTheDocument();
  expect(screen.getByText("hospitalStaff.recentConfirmed")).toBeInTheDocument();
  expect(screen.getAllByText("1", { selector: ".stat-value" })).toHaveLength(2);
  expect(screen.getAllByText("SYNTH-PAT-001").length).toBeGreaterThan(0);
  expect(screen.getAllByText("SYNTH-PAT-002").length).toBeGreaterThan(0);
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith("/hospital-staff/appointments", {
      params: { status: "REQUESTED" },
    });
    expect(api.get).toHaveBeenCalledWith("/hospital-staff/appointments");
    expect(api.get).toHaveBeenCalledWith("/hospital-staff/video-consultations");
  });
});

test("video consultation requests show specialist, facility, consent and slot availability before confirmation", async () => {
  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("Synthetic Specialist")).toBeInTheDocument();
  expect(screen.getByText("Synthetic Hospital")).toBeInTheDocument();
  expect(screen.getByText("specialist.teleconsultConsentStatus.ACTIVE")).toBeInTheDocument();
  expect(screen.getByText("hospitalStaff.availability.RESERVED")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "hospitalStaff.confirmAppointment" })).toBeEnabled();
});

test("video consultation confirmation is disabled without availability or active consent", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({
        data: {
          consultations: [{
            ...syntheticVideoConsultation,
            availability_status: "UNAVAILABLE",
            teleconsult_consent_status: "WITHDRAWN",
            alternative_slots: [{
              id: "synthetic-alternative-slot",
              slot_start: "2030-01-03T10:00:00.000Z",
              slot_end: "2030-01-03T10:30:00.000Z",
            }],
          }],
        },
      });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole("button", { name: "hospitalStaff.confirmAppointment" })).toBeDisabled();
  expect(screen.getByText("hospitalStaff.slotUnavailable")).toBeInTheDocument();
  expect(screen.getByText("hospitalStaff.videoConsentRequired")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "hospitalStaff.rescheduleVideoRequest" })).toBeDisabled();
});

test("expired video request cannot be confirmed and can request a new time from the assigned Specialist", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({
        data: {
          consultations: [{
            ...syntheticVideoConsultation,
            status_code: "REQUESTED",
            availability_status: "EXPIRED",
            signed_video_decision: true,
            alternative_slots: [],
          }],
        },
      });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });
  api.post.mockResolvedValue({ data: { request: { status: "PENDING" } } });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("hospitalStaff.slotExpired")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "hospitalStaff.confirmAppointment" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("hospitalStaff.requestedDateTime", { selector: "input" }), {
    target: { value: "2030-01-04T10:00" },
  });
  fireEvent.change(screen.getByLabelText("hospitalStaff.requestedEndTime", { selector: "input" }), {
    target: { value: "2030-01-04T10:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "hospitalStaff.requestNewSpecialistTime" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/video-availability-requests",
    expect.objectContaining({
      referral_id: "synthetic-video-referral-id",
      reschedule_consultation_id: "synthetic-video-consultation",
    })
  ));
});

test("confirmed availability request is represented by its linked consultation only", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({
        data: {
          consultations: [{
            ...syntheticVideoConsultation,
            status_code: "CONFIRMED",
          }],
        },
      });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({
        data: {
          requests: [{
            id: "synthetic-confirmed-request",
            patient_code: syntheticVideoConsultation.patient_code,
            referral_code: syntheticVideoConsultation.referral_code,
            status: "CONFIRMED",
            video_consultation_id: syntheticVideoConsultation.id,
          }],
        },
      });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [] } });
    }
    return Promise.resolve({ data: { appointments: [] } });
  });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("hospitalStaff.status.CONFIRMED")).toBeInTheDocument();
  expect(screen.queryByText("hospitalStaff.availabilityRequestStatus.CONFIRMED")).not.toBeInTheDocument();
  expect(screen.getByText(/SYNTH-VIDEO-REF-001/)).toBeInTheDocument();
});

test("Hospital Staff can reschedule a request only to an offered Specialist slot", async () => {
  const appointment = {
    ...syntheticVideoConsultation,
    availability_status: "UNAVAILABLE",
    alternative_slots: [{
      id: "synthetic-alternative-slot",
      slot_start: "2030-01-03T10:00:00.000Z",
      slot_end: "2030-01-03T10:30:00.000Z",
    }],
  };
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [appointment] } });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });
  api.post.mockResolvedValue({ data: { consultation: { status_code: "RESCHEDULED" } } });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.change(await screen.findByRole("combobox", {
    name: "hospitalStaff.alternativeSpecialistSlot",
  }), { target: { value: "synthetic-alternative-slot" } });
  fireEvent.change(screen.getByLabelText("hospitalStaff.rescheduleReason"), {
    target: { value: "Synthetic reschedule reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "hospitalStaff.rescheduleVideoRequest" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/video-consultations/synthetic-video-consultation/reschedule",
    { slot_id: "synthetic-alternative-slot", reason: "Synthetic reschedule reason" }
  ));
});

test("Hospital Staff sends availability requests separately from regular appointments", async () => {
  const referral = {
    referral_id: "synthetic-video-referral",
    patient_code: "SYNTH-VIDEO-PAT-002",
    referral_code: "SYNTH-VIDEO-REF-002",
    specialist_name: "Synthetic Specialist",
    specialty_name: "Synthetic specialty",
    hospital_name: "Synthetic Hospital",
    teleconsult_consent_status: "ACTIVE",
    signed_video_decision: true,
  };
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({ data: { requests: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [referral] } });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });
  api.post.mockResolvedValue({ data: { request: { status: "PENDING" } } });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("SYNTH-VIDEO-PAT-002")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("hospitalStaff.requestedDateTime"), {
    target: { value: "2035-02-01T10:00" },
  });
  fireEvent.change(screen.getByLabelText("hospitalStaff.requestedEndTime"), {
    target: { value: "2035-02-01T10:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "hospitalStaff.sendAvailabilityRequest" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/video-availability-requests",
    expect.objectContaining({
      referral_id: referral.referral_id,
      requested_start: new Date("2035-02-01T10:00").toISOString(),
      requested_end: new Date("2035-02-01T10:30").toISOString(),
    })
  ));
  expect(api.post).not.toHaveBeenCalledWith(
    expect.stringContaining("/appointments/"),
    expect.anything()
  );
});

test("Hospital Staff cannot coordinate availability without a signed video decision", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({ data: { requests: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [{
        referral_id: "synthetic-unsigned-referral",
        patient_code: "SYNTH-UNSIGNED-PAT",
        referral_code: "SYNTH-UNSIGNED-REF",
        specialist_name: "Synthetic Specialist",
        specialty_name: "Synthetic specialty",
        hospital_name: "Synthetic Hospital",
        teleconsult_consent_status: "ACTIVE",
        signed_video_decision: false,
        available_slots: [{
          id: "synthetic-unsigned-slot",
          slot_start: "2035-02-01T10:00:00.000Z",
          slot_end: "2035-02-01T10:30:00.000Z",
        }],
      }] } });
    }
    return Promise.resolve({ data: { appointments: [] } });
  });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("hospitalStaff.videoDecisionRequired")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "hospitalStaff.confirmExistingSlot" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "hospitalStaff.sendAvailabilityRequest" })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test("Hospital Staff can confirm an exact available pre-created Specialist slot", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({ data: { requests: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [{
        referral_id: "synthetic-direct-referral",
        patient_code: "SYNTH-DIRECT-PAT",
        referral_code: "SYNTH-DIRECT-REF",
        specialist_name: "Synthetic Specialist",
        specialty_name: "Synthetic specialty",
        hospital_name: "Synthetic Hospital",
        teleconsult_consent_status: "ACTIVE",
        signed_video_decision: true,
        available_slots: [{
          id: "synthetic-existing-slot",
          slot_start: "2035-02-01T10:00:00.000Z",
          slot_end: "2035-02-01T10:30:00.000Z",
        }],
      }] } });
    }
    return Promise.resolve({ data: { appointments: [] } });
  });
  api.post.mockResolvedValue({ data: { appointment: { status_code: "CONFIRMED" } } });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("SYNTH-DIRECT-PAT")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("hospitalStaff.alternativeSpecialistSlot"), {
    target: { value: "synthetic-existing-slot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "hospitalStaff.confirmExistingSlot" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/video-availability-requests/direct-confirm",
    { referral_id: "synthetic-direct-referral", slot_id: "synthetic-existing-slot" }
  ));
  expect(api.post).not.toHaveBeenCalledWith(
    "/hospital-staff/video-availability-requests",
    expect.anything()
  );
});

test("Hospital Staff can confirm an accepted response without a pre-created slot", async () => {
  const availabilityRequest = {
    id: "synthetic-availability-request",
    patient_code: "SYNTH-VIDEO-PAT-003",
    referral_code: "SYNTH-VIDEO-REF-003",
    specialist_name: "Synthetic Specialist",
    specialty_name: "Synthetic specialty",
    hospital_name: "Synthetic Hospital",
    requested_start: "2035-02-01T10:00:00.000Z",
    requested_end: "2035-02-01T10:30:00.000Z",
    proposed_start: "2035-02-02T11:00:00.000Z",
    proposed_end: "2035-02-02T11:30:00.000Z",
    status: "SUGGESTED",
    slot_id: null,
    slot_is_booked: null,
    availability_status: "AVAILABLE",
    teleconsult_consent_status: "ACTIVE",
    signed_video_decision: true,
  };
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({ data: { requests: [availabilityRequest] } });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [] } });
    }
    return Promise.resolve({ data: { appointments: syntheticAppointments } });
  });
  api.post.mockResolvedValue({ data: { appointment: { status: "CONFIRMED" } } });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("SYNTH-VIDEO-PAT-003")).toBeInTheDocument();
  const confirmButton = screen.getByRole("button", { name: "hospitalStaff.confirmAppointment" });
  expect(confirmButton).toBeEnabled();
  fireEvent.click(confirmButton);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/hospital-staff/video-availability-requests/synthetic-availability-request/confirm",
    {}
  ));
});

test("Hospital Staff cannot confirm an availability response after TELECONSULT consent is withdrawn", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    if (path === "/hospital-staff/video-availability-requests") {
      return Promise.resolve({ data: { requests: [{
        id: "synthetic-withdrawn-request",
        patient_code: "SYNTH-WITHDRAWN-PAT",
        referral_code: "SYNTH-WITHDRAWN-REF",
        requested_start: "2035-02-01T10:00:00.000Z",
        requested_end: "2035-02-01T10:30:00.000Z",
        proposed_start: "2035-02-02T11:00:00.000Z",
        proposed_end: "2035-02-02T11:30:00.000Z",
        status: "ACCEPTED",
        slot_id: "synthetic-withdrawn-slot",
        slot_is_booked: false,
        availability_status: "AVAILABLE",
        teleconsult_consent_status: "WITHDRAWN",
      }] } });
    }
    if (path === "/hospital-staff/video-availability-requests/eligible-referrals") {
      return Promise.resolve({ data: { referrals: [] } });
    }
    return Promise.resolve({ data: { appointments: [] } });
  });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("SYNTH-WITHDRAWN-PAT")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "hospitalStaff.confirmAppointment" })).toBeDisabled();
});

test("a BOTH referral labeled ENT - Video Consultation cannot use generic appointment confirmation", async () => {
  const mixedModeAppointment = {
    ...syntheticAppointments[0],
    referral_mode: "BOTH",
    assigned_service: "ENT - Video Consultation",
    has_active_video_consultation: true,
  };
  api.get.mockImplementation((path) => {
    if (path === "/hospital-staff/video-consultations") {
      return Promise.resolve({ data: { consultations: [] } });
    }
    return Promise.resolve({ data: { appointments: [mixedModeAppointment] } });
  });

  render(
    <MemoryRouter initialEntries={["/hospital-staff/appointments"]}>
      <Routes>
        <Route path="/hospital-staff/appointments" element={<HospitalStaffDashboard />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("hospitalStaff.videoRequestUseQueue")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "hospitalStaff.confirm" })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
