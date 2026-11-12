
import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
  timeout: 15000,
  // Sends the httpOnly refresh-token cookie to /auth/refresh
  withCredentials: true,
});

const AUTH_MODE_KEY = "authMode";

export function storeSession(accessToken, user) {
  sessionStorage.setItem("accessToken", accessToken);
  sessionStorage.setItem("user", JSON.stringify(user));
  sessionStorage.setItem(AUTH_MODE_KEY, "online");
}

export function clearSession() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem(AUTH_MODE_KEY);
}

export function setAuthMode(mode) {
  if (mode) sessionStorage.setItem(AUTH_MODE_KEY, mode);
  else sessionStorage.removeItem(AUTH_MODE_KEY);
}

export function getAuthMode() {
  return sessionStorage.getItem(AUTH_MODE_KEY);
}

// Attach access token to protected requests (an explicit header, e.g. the
// short-lived MFA token, is left untouched)
api.interceptors.request.use((config) => {
  // Offline vault unlock is not an API session — fail fast, never invent success
  if (getAuthMode() === "offline" && !sessionStorage.getItem("accessToken")) {
    const offlineError = new Error("OFFLINE_MODE_NO_API");
    offlineError.code = "OFFLINE_MODE_NO_API";
    offlineError.isOfflineError = true;
    return Promise.reject(offlineError);
  }

  const token = sessionStorage.getItem("accessToken");

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/register",
  "/auth/mfa/",
  "/auth/temporary-password/",
  "/auth/password-reset/",
  "/auth/account-setup",
];

const SESSION_ENDED_CODES = ["SESSION_EXPIRED", "TOKEN_INVALID", "TOKEN_REQUIRED", "ACCOUNT_UNAVAILABLE", "MFA_REQUIRED"];

let refreshInFlight = null;

function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post("/auth/refresh")
      .then((response) => {
        storeSession(response.data.accessToken, response.data.user);
        return response.data.accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function endSession() {
  clearSession();
  window.dispatchEvent(new Event("auth:session-ended"));
}

async function readBlobText(blob) {
  if (typeof blob?.text === "function") return blob.text();
  if (typeof Response !== "undefined") return new Response(blob).text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read error body"));
    reader.readAsText(blob);
  });
}

/**
 * Image downloads use responseType "blob", so error bodies arrive as Blobs.
 * Parse JSON once so TOKEN_EXPIRED refresh and session-end codes still work.
 */
async function normalizeErrorPayload(error) {
  const data = error.response?.data;
  if (data == null || (typeof data === "object" && !(typeof Blob !== "undefined" && data instanceof Blob))) {
    return data;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const text = await readBlobText(data);
      const parsed = text ? JSON.parse(text) : null;
      if (parsed && error.response) error.response.data = parsed;
      return parsed;
    } catch {
      return null;
    }
  }
  return data;
}

// Expired access tokens are renewed once via the refresh cookie, then the
// original request is retried.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const payload = await normalizeErrorPayload(error);
    const code = payload?.code;
    const skip = !original || NO_REFRESH_PATHS.some((path) => original.url?.startsWith(path));

    if (status === 401 && code === "TOKEN_EXPIRED" && !skip && !original._retried) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        endSession();
        return Promise.reject(refreshError);
      }
    }

    if (status === 401 && SESSION_ENDED_CODES.includes(code) && !skip) {
      endSession();
    }

    return Promise.reject(error);
  }
);

export default api;
