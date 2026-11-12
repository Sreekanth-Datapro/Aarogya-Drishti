import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
}));

function openLogin(language = "en") {
  localStorage.setItem("language", language);
  sessionStorage.clear();
  window.history.pushState({}, "", "/login");
  render(<App />);
}

function signIn(username, password) {
  fireEvent.change(screen.getByLabelText(/Username|వినియోగదారు పేరు/), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/^Password$|^పాస్‌వర్డ్$/), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /^(Sign in|సైన్ ఇన్)$/ }));
}

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: {} });
});

test("a temporary password leads to a forced password change and then MFA enrollment", async () => {
  api.post.mockImplementation((url) => {
    if (url === "/auth/login") {
      return Promise.resolve({ data: { success: true, password_change_required: true, password_change_token: "password-step-token" } });
    }
    if (url === "/auth/temporary-password/change") {
      return Promise.resolve({ data: { success: true, mfa_setup_required: true, mfa_token: "enroll-step-token" } });
    }
    if (url === "/auth/mfa/setup") {
      return Promise.resolve({ data: { success: true, secret: "ABC", qr_code: "data:image/png;base64,qr" } });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  openLogin();

  signIn("da.ravi.4821", "Tmp#Pass7xQ2kR");
  expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();

  // Passwords must match before anything is sent
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "MyNewPassword2026" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "Different2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith("/auth/temporary-password/change", expect.anything(), expect.anything());

  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "MyNewPassword2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

  expect(await screen.findByRole("heading", { name: "Set up two-step verification" })).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(
    "/auth/temporary-password/change",
    { new_password: "MyNewPassword2026" },
    { headers: { Authorization: "Bearer password-step-token" } }
  );
  expect(api.post).toHaveBeenCalledWith("/auth/mfa/setup", {}, { headers: { Authorization: "Bearer enroll-step-token" } });
  // No session before MFA is completed
  expect(sessionStorage.getItem("accessToken")).toBeNull();
});

test("an expired temporary password shows the server message in English and Telugu", async () => {
  api.post.mockRejectedValue({
    response: {
      status: 401,
      data: {
        code: "TEMPORARY_PASSWORD_EXPIRED",
        message: "Your temporary password has expired. Ask the Super Admin to resend your login details.",
      },
    },
  });
  openLogin();
  signIn("da.ravi.4821", "Tmp#Pass7xQ2kR");
  expect(await screen.findByText(/temporary password has expired/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "తెలుగు" }));
  expect(screen.getByText(/తాత్కాలిక పాస్‌వర్డ్ గడువు ముగిసింది/)).toBeInTheDocument();
});

test("the password-change step can be shown in Telugu", async () => {
  api.post.mockResolvedValue({ data: { success: true, password_change_required: true, password_change_token: "t" } });
  openLogin("te");
  signIn("da.ravi.4821", "Tmp#Pass7xQ2kR");
  expect(await screen.findByRole("heading", { name: "కొత్త పాస్‌వర్డ్ ఎంచుకోండి" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "కొత్త పాస్‌వర్డ్ సేవ్ చేయండి" })).toBeInTheDocument();
});
