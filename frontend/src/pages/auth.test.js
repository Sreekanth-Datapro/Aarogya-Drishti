import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import Login from "./Login";
import ForgotPassword from "./ForgotPassword";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  storeSession: (token, user) => {
    global.sessionStorage.setItem("accessToken", token);
    global.sessionStorage.setItem("user", JSON.stringify(user));
  },
  clearSession: () => global.sessionStorage.clear(),
}));

const renderAt = (path, routes) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </AuthProvider>
  );

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

test("login with an MFA-required role shows the code step and completes sign-in", async () => {
  api.post.mockImplementation((url) => {
    if (url === "/auth/login") {
      return Promise.resolve({ data: { mfa_required: true, mfa_token: "mfa-token" } });
    }
    if (url === "/auth/mfa/verify") {
      return Promise.resolve({
        data: { accessToken: "access", user: { full_name: "Dr Test", role: "MEDICAL_OFFICER", must_change_password: false } },
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });

  renderAt("/login", [
    <Route key="l" path="/login" element={<Login />} />,
    <Route key="d" path="/dashboard" element={<p>Dashboard page</p>} />,
  ]);

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "dr_test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password1" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  const codeInput = await screen.findByLabelText("Authentication code");
  expect(sessionStorage.getItem("accessToken")).toBeNull();

  fireEvent.change(codeInput, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

  expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/auth/mfa/verify", { code: "123456" }, { headers: { Authorization: "Bearer mfa-token" } });
});

test("Hospital Staff use the common login form and continue to the authenticated dashboard route", async () => {
  api.post.mockResolvedValue({
    data: {
      accessToken: "staff-access",
      user: { full_name: "Synthetic Staff", role: "HOSPITAL_STAFF", must_change_password: false },
    },
  });

  renderAt("/login", [
    <Route key="l" path="/login" element={<Login />} />,
    <Route key="d" path="/dashboard" element={<p>Hospital Staff dashboard route</p>} />,
  ]);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "hs.synthetic.1234" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Temporary123!" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByText("Hospital Staff dashboard route")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/auth/login", {
    username: "hs.synthetic.1234",
    password: "Temporary123!",
  });
  expect(JSON.parse(sessionStorage.getItem("user")).role).toBe("HOSPITAL_STAFF");
});

test("forgot password shows the generic confirmation message", async () => {
  api.post.mockResolvedValue({ data: { message: "If the account exists, password reset instructions have been sent." } });

  renderAt("/forgot-password", [<Route key="f" path="/forgot-password" element={<ForgotPassword />} />]);

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "someone" } });
  fireEvent.click(screen.getByRole("button", { name: /send reset instructions/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/if the account exists/i);
});

test("a user who must change their password is redirected to the change-password page", async () => {
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("user", JSON.stringify({ full_name: "Temp", role: "HEALTH_WORKER", must_change_password: true }));

  renderAt("/dashboard", [
    <Route key="p" element={<ProtectedRoute />}>
      <Route path="/change-password" element={<p>Change password page</p>} />
      <Route path="/dashboard" element={<p>Dashboard page</p>} />
    </Route>,
  ]);

  expect(await screen.findByText("Change password page")).toBeInTheDocument();
});
