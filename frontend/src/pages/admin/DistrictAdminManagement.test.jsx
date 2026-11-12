import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../services/api";
import DistrictAdminManagement from "./DistrictAdminManagement";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/districts")
      ? { districts: [{ id: 1, name_en: "Example District" }] }
      : {
          district_admins: [{
            id: "admin-1",
            full_name: "District Admin",
            username: "district.admin",
            email: "district@example.test",
            phone: "9876543210",
            district_id: 1,
            district_name: "Example District",
            status: "PENDING_SETUP",
            setup_password_pending: true,
            email_delivery_status: "FAILED",
            created_at: "2025-01-01T00:00:00Z",
          }],
        },
  }));
  api.post.mockResolvedValue({
    data: { message: "Email delivery retry completed." },
  });
});

test("shows delivery states and retries only the selected channel", async () => {
  render(<DistrictAdminManagement />);

  expect(await screen.findByText("Failed")).toBeInTheDocument();
  expect(screen.queryByText("SMS Delivery")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry SMS" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry Email" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith(
      "/admin/district-admins/admin-1/setup-delivery/email/retry"
    );
  }, 15000);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/secret-token|setup-account#token/i)).not.toBeInTheDocument();
});

test("the create form has no username field, requires an email and shows the generated username", async () => {
  api.post.mockResolvedValue({
    data: {
      success: true,
      district_admin: { id: "admin-2", username: "da.ravi.4821" },
      delivery_status: { email: { status: "SENT" } },
    },
  });
  render(<DistrictAdminManagement />);
  await screen.findByText("Failed");

  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ravi Kumar" } });
  fireEvent.change(screen.getByLabelText("District"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByText("Enter the email address for the login details.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ravi@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Account created with username da.ravi.4821. The login details were emailed.")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/admin/district-admins", {
    full_name: "Ravi Kumar",
    email: "ravi@example.test",
    phone: "",
    district_id: 1,
  });
});

test("resending login details calls the existing reissue endpoint and shows the expiry", async () => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/districts")
      ? { districts: [{ id: 1, name_en: "Example District" }] }
      : {
          district_admins: [{
            id: "admin-1", full_name: "District Admin", username: "da.district.1234", email: "district@example.test",
            district_id: 1, district_name: "Example District", status: "PENDING_SETUP", setup_password_pending: true,
            email_delivery_status: "SENT", created_at: "2025-01-01T00:00:00Z",
            credentials_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          }],
        },
  }));
  api.post.mockResolvedValue({
    data: { message: "New login details were issued and email delivery was attempted. The previous temporary password no longer works." },
  });
  render(<DistrictAdminManagement />);

  expect(await screen.findByText(/Temporary password expires/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry Email" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Resend login details" }));

  expect(await screen.findByText(/The previous temporary password no longer works/)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/admin/district-admins/admin-1/setup-token");
});
