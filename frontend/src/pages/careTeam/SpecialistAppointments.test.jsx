import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../services/api";
import SpecialistAppointments from "./SpecialistAppointments";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const mockUpdateUser = jest.fn();
const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    updateUser: mockUpdateUser,
    user: { permissions: ["appointment.slot_manage", "video.join"] },
  }),
}));

const pendingRequest = {
  id: "request-pending",
  patient_name: "Synthetic Patient",
  patient_code: "SYNTH-PAT-008",
  referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  referral_code: "SYNTH-REF-004",
  hospital_name: "Synthetic Area Hospital",
  hospital_staff_name: "Synthetic Hospital Staff",
  specialty_name: "Synthetic ENT",
  requested_start: "2035-02-01T10:00:00.000Z",
  requested_end: "2035-02-01T10:30:00.000Z",
  status: "PENDING",
  teleconsult_consent_status: "ACTIVE",
};

const appointmentsData = {
  pending_requests: [pendingRequest],
  accepted_requests: [{ ...pendingRequest, id: "request-accepted", status: "ACCEPTED" }],
  confirmed_appointments: [{
    id: "video-confirmed",
    patient_name: "Confirmed Patient",
    patient_code: "SYNTH-PAT-009",
    referral_id: "confirmed-referral-id",
    referral_code: "SYNTH-REF-009",
    hospital_name: "Synthetic Hospital",
    hospital_staff_name: "Staff Member",
    specialty_name: "Synthetic ENT",
    scheduled_start: "2035-02-02T10:00:00.000Z",
    scheduled_end: "2035-02-02T10:30:00.000Z",
    status: "CONFIRMED",
    consultation_type: "VIDEO",
    attendance: "PENDING",
    can_join: true,
  }],
  completed_consultations: [{
    id: "video-completed",
    patient_name: "Completed Patient",
    patient_code: "SYNTH-PAT-010",
    referral_id: "completed-referral-id",
    referral_code: "SYNTH-REF-010",
    hospital_name: "Synthetic Hospital",
    hospital_staff_name: "Staff Member",
    specialty_name: "Synthetic ENT",
    scheduled_start: "2035-02-03T10:00:00.000Z",
    scheduled_end: "2035-02-03T10:30:00.000Z",
    status: "COMPLETED",
    consultation_type: "VIDEO",
    attendance: "ATTENDED",
    can_join: false,
  }],
  missed_appointments: [{
    id: "video-missed",
    patient_name: "Missed Patient",
    patient_code: "SYNTH-PAT-011",
    referral_id: "missed-referral-id",
    referral_code: "SYNTH-REF-011",
    hospital_name: "Synthetic Hospital",
    hospital_staff_name: "Staff Member",
    specialty_name: "Synthetic ENT",
    scheduled_start: "2035-02-01T05:00:00.000Z",
    scheduled_end: "2035-02-01T05:30:00.000Z",
    status: "MISSED",
    consultation_type: "VIDEO",
    attendance: "NO_SHOW",
    can_join: false,
    join_blocked_reason: "MISSED",
  }],
  rescheduled_appointments: [{
    id: "video-rescheduled",
    patient_name: "Rescheduled Patient",
    patient_code: "SYNTH-PAT-012",
    referral_id: "rescheduled-referral-id",
    referral_code: "SYNTH-REF-012",
    hospital_name: "Synthetic Hospital",
    hospital_staff_name: "Staff Member",
    specialty_name: "Synthetic ENT",
    scheduled_start: "2035-01-20T05:00:00.000Z",
    scheduled_end: "2035-01-20T05:30:00.000Z",
    status: "RESCHEDULED",
    consultation_type: "VIDEO",
    can_join: false,
    join_blocked_reason: "RESCHEDULED",
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: { user: { permissions: ["appointment.slot_manage"] } },
      });
    }
    if (path === "/specialist/appointments") {
      return Promise.resolve({ data: appointmentsData });
    }
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
  api.post.mockResolvedValue({ data: { success: true } });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SpecialistAppointments />
    </MemoryRouter>
  );
}

test("shows pending, accepted, confirmed, completed, missed, and rescheduled Specialist appointment records", async () => {
  renderPage();

  expect((await screen.findAllByText("Synthetic Patient")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Synthetic Hospital Staff").length).toBeGreaterThan(0);
  expect(screen.getAllByText("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb").length).toBeGreaterThan(0);
  expect(screen.getByText("Confirmed Patient")).toBeInTheDocument();
  expect(screen.getByText("Completed Patient")).toBeInTheDocument();
  expect(screen.getByText("Missed Patient")).toBeInTheDocument();
  expect(screen.getByText("Rescheduled Patient")).toBeInTheDocument();
  expect(screen.getByText("Pending Availability Requests")).toBeInTheDocument();
  expect(screen.getByText("Accepted Requests")).toBeInTheDocument();
  expect(screen.getByText("Confirmed Appointments")).toBeInTheDocument();
  expect(screen.getByText("Completed Consultations")).toBeInTheDocument();
  expect(screen.getByText("Missed Appointments")).toBeInTheDocument();
  expect(screen.getByText("Rescheduled Appointments")).toBeInTheDocument();

  expect(api.get).toHaveBeenCalledWith("/auth/me");
  expect(api.get).toHaveBeenCalledWith("/specialist/appointments");
  expect(mockUpdateUser).toHaveBeenCalledWith({ permissions: ["appointment.slot_manage"] });
});

test("hides Join Consultation for missed appointments and shows it for joinable confirmed ones", async () => {
  renderPage();
  await screen.findByText("Confirmed Patient");
  expect(screen.getByRole("button", { name: /Join Consultation/i })).toBeInTheDocument();
  expect(screen.getByText("Missed Patient")).toBeInTheDocument();
  expect(screen.queryAllByRole("button", { name: /Join Consultation/i })).toHaveLength(1);
});

test("records an availability response without treating it as a booked appointment", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Accept requested time" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/specialist/availability/requests/request-pending/respond",
    { response: "ACCEPT" }
  ));
  expect(api.get).toHaveBeenCalledWith("/specialist/appointments");
});

test("refreshes permissions and does not request appointments without slot management permission", async () => {
  api.get.mockResolvedValueOnce({
    data: { user: { permissions: ["referral.view"] } },
  });
  renderPage();

  expect(await screen.findByText(/does not have permission/)).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/specialist/appointments");
});

test("shows request loading errors without rendering a success-shaped empty dashboard", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: { user: { permissions: ["appointment.slot_manage"] } },
      });
    }
    return Promise.reject({
      response: { data: { message: "Synthetic API failure" } },
    });
  });
  renderPage();

  expect(await screen.findByText("Synthetic API failure")).toBeInTheDocument();
});
