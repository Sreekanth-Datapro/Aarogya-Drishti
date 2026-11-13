import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyAppointments from "./MyAppointments";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("../../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
const mockUpdateUser = jest.fn();
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "hw-1", role: "HEALTH_WORKER", permissions: ["video.join", "patient.read_assigned"] },
    updateUser: mockUpdateUser,
  }),
}));
jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key) => key,
    language: "en",
  }),
}));

const api = require("../../services/api");

const appointment = {
  video_consultation_id: "99999999-9999-4999-8999-999999999999",
  patient_name: "Test Patient",
  patient_code: "P-1",
  referral_code: "REF-1",
  specialist_name: "Dr Spec",
  specialty_name: "Oral",
  hospital_name: "District Hospital",
  scheduled_at_display: "1 Jun 2035, 3:30 pm",
  slot_end_display: "1 Jun 2035, 4:00 pm",
  duration_minutes: 30,
  appointment_status: "CONFIRMED",
  video_status: "SCHEDULED",
  meeting_ready: true,
  can_join: false,
  join_blocked_reason: "TOO_EARLY",
  attendance: "PENDING",
  patient_contact_status: "NOT_CONTACTED",
  reminder_status: "SENT",
  has_signed_report: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: {
          user: {
            id: "hw-1",
            role: "HEALTH_WORKER",
            permissions: ["video.join", "patient.read_assigned"],
          },
        },
      });
    }
    return Promise.resolve({ data: { appointments: [appointment] } });
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MyAppointments role="HEALTH_WORKER" />
    </MemoryRouter>
  );
}

test("Health Worker My Appointments loads assigned consultations", async () => {
  renderPage();
  expect(await screen.findByText("Test Patient")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/auth/me");
  expect(api.get).toHaveBeenCalledWith("/health-worker/appointments", { params: { filter: "upcoming" } });
  expect(mockUpdateUser).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "myAppointments.join" })).not.toBeInTheDocument();
  expect(screen.getByText("myAppointments.joinUnavailable")).toBeInTheDocument();
});

test("Join is enabled for confirmed appointments inside the join window", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: {
          user: {
            id: "hw-1",
            role: "HEALTH_WORKER",
            permissions: ["video.join", "patient.read_assigned"],
          },
        },
      });
    }
    return Promise.resolve({
      data: {
        appointments: [{
          ...appointment,
          can_join: true,
          join_blocked_reason: null,
          video_status: "IN_PROGRESS",
        }],
      },
    });
  });

  renderPage();
  const joinButton = await screen.findByRole("button", { name: "myAppointments.join" });
  expect(joinButton).toBeEnabled();
  await userEvent.click(joinButton);
  expect(mockNavigate).toHaveBeenCalledWith(
    `/video-consultations/${appointment.video_consultation_id}/meeting`
  );
});

test("filter change requests today appointments", async () => {
  renderPage();
  await screen.findByText("Test Patient");
  await userEvent.click(screen.getByRole("tab", { name: "myAppointments.filter.today" }));
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith("/health-worker/appointments", { params: { filter: "today" } });
  });
});

test("Join Consultation is hidden after meeting end when can_join is false", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: {
          user: {
            id: "hw-1",
            role: "HEALTH_WORKER",
            permissions: ["video.join", "patient.read_assigned"],
          },
        },
      });
    }
    return Promise.resolve({
      data: {
        appointments: [{
          ...appointment,
          can_join: false,
          join_blocked_reason: "EXPIRED",
          video_status: "EXPIRED",
        }],
      },
    });
  });

  renderPage();
  await screen.findByText("Test Patient");
  expect(screen.queryByRole("button", { name: "myAppointments.join" })).not.toBeInTheDocument();
  expect(screen.getByText("myAppointments.joinUnavailable")).toBeInTheDocument();
});

test("Navigator sees Reschedule for MISSED appointments", async () => {
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") {
      return Promise.resolve({
        data: {
          user: {
            id: "nav-1",
            role: "NAVIGATOR",
            permissions: ["video.join", "appointment.book"],
          },
        },
      });
    }
    return Promise.resolve({
      data: {
        appointments: [{
          ...appointment,
          appointment_status: "MISSED",
          attendance: "NO_SHOW",
          video_status: "MISSED",
          can_join: false,
          join_blocked_reason: "MISSED",
          referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }],
      },
    });
  });

  render(
    <MemoryRouter>
      <MyAppointments role="NAVIGATOR" />
    </MemoryRouter>
  );

  await screen.findByText("Test Patient");
  expect(screen.getByText("myAppointments.missedRescheduleHint")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "navigator.rescheduleAppointment" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "myAppointments.join" })).not.toBeInTheDocument();
});
