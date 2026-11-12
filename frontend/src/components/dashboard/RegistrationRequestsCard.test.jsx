import { fireEvent, render, screen } from "@testing-library/react";
import RegistrationRequestsCard from "./RegistrationRequestsCard";
import api from "../../services/api";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", t: (key) => key, tm: (key) => key }),
}));

const registration = {
  id: "request-1",
  username: "health-worker",
  full_name: "Health Worker",
  designation: "ASHA",
  facility_name: "Primary Health Centre",
  mandal_name: "Mandal",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: { success: true, registrations: [registration] } });
  api.patch.mockResolvedValue({ data: { success: true, message: "Registration rejected" } });
});

test("monitoring-only users see registrations but no decision controls", async () => {
  render(<RegistrationRequestsCard canReview={false} />);

  fireEvent.click(screen.getByRole("button", { name: /dashboard.viewAll/i }));

  expect(await screen.findByText("Health Worker")).toBeInTheDocument();
  expect(screen.getByText("dashboard.registrationReadOnly")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "dashboard.approve" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "dashboard.reject" })).not.toBeInTheDocument();
});

test("missing registration summary values show zero rather than placeholder statistics", () => {
  render(<RegistrationRequestsCard summary={{}} />);

  // Pending, Approved and Rejected counts
  const counts = screen.getAllByText("0");
  expect(counts).toHaveLength(3);
  counts.forEach((count) => expect(count).toHaveClass("status-count"));
});

test("legacy registration monitoring never exposes final-decision controls", async () => {
  render(<RegistrationRequestsCard canReview />);

  fireEvent.click(screen.getByRole("button", { name: /dashboard.viewAll/i }));
  await screen.findByText("Health Worker");

  expect(screen.queryByRole("button", { name: "dashboard.approve" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "dashboard.reject" })).not.toBeInTheDocument();
  expect(api.patch).not.toHaveBeenCalled();
});
