import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Topbar from "./Topbar";
import { LanguageProvider } from "../../i18n/LanguageContext";
import api from "../../services/api";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ logout: jest.fn(), isOffline: false }),
}));

const notification = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  title: "Specialist availability request",
  message: "Hospital Staff requested a response.",
  event_type: "SPECIALIST_AVAILABILITY_REQUEST",
  target_path: "/specialist/referrals#availability-request-cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  created_at: "2026-11-11T09:00:00.000Z",
  is_read: false,
};

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.hash}`}</output>;
}

function renderTopbar(user = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  full_name: "Synthetic Specialist",
  role: "SPECIALIST",
}) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Topbar
          title="Dashboard"
          user={user}
          menuOpen={false}
          onMenuClick={() => {}}
        />
        <CurrentPath />
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("language", "en");
  jest.clearAllMocks();
  api.get.mockResolvedValue({
    data: { unread_count: 1, notifications: [notification] },
  });
  api.post.mockResolvedValue({ data: { success: true } });
});

test("bell loads the unread count, marks a notification read and opens its in-app destination", async () => {
  renderTopbar();

  const bell = screen.getByRole("button", { name: "Open notifications" });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/notifications"));
  fireEvent.click(bell);
  expect(await screen.findByText("1 unread")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Specialist availability request/ }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/notifications/${notification.id}/read`
  ));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(
    notification.target_path
  ));
});

test("notification bell displays an explicit loading error", async () => {
  api.get.mockRejectedValue({ response: { data: { message: "Synthetic notification error" } } });
  renderTopbar();

  fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic notification error");
});

test("Medical Officer bell opens screening-queue notifications", async () => {
  const moNotification = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    title: "New screening awaiting review",
    message: "A screening is waiting.",
    event_type: "SCREENING_AWAITING_REVIEW",
    target_path: "/medical-officer/queue",
    created_at: "2026-11-12T09:00:00.000Z",
    is_read: false,
  };
  api.get.mockResolvedValue({
    data: { unread_count: 1, notifications: [moNotification] },
  });

  renderTopbar({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    full_name: "Dr Medical Officer",
    role: "MEDICAL_OFFICER",
  });

  fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
  fireEvent.click(await screen.findByRole("button", { name: /New screening awaiting review/ }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/notifications/${moNotification.id}/read`
  ));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(
    "/medical-officer/queue"
  ));
});
