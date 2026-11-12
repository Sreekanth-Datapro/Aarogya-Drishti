import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import api, { clearSession, getAuthMode, setAuthMode, storeSession } from "../services/api";
import { clearServiceWorkerCaches } from "../pwa/registerServiceWorker";
import { countPendingDrafts } from "../offline/drafts";
import {
  enableOfflineVault,
  getVaultPublic,
  hasOfflineVault,
  isOfflineRoleAllowed,
  isVaultExpired,
  refreshVaultOnlineAuth,
  unlockVault,
  wipeAllOfflineData,
} from "../offline/vault";
import { syncPendingRegistrations } from "../offline/syncQueue";

export const AuthContext = createContext(null);

const mfaHeaders = (mfaToken) => ({
  headers: { Authorization: `Bearer ${mfaToken}` },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authMode, setAuthModeState] = useState(null); // "online" | "offline" | null
  const [loading, setLoading] = useState(true);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  // PIN stays in memory only — never sessionStorage / IndexedDB plaintext
  const offlinePinRef = useRef(null);

  const refreshPendingCount = useCallback(async (userId) => {
    if (!userId) {
      setPendingDraftCount(0);
      return 0;
    }
    try {
      const count = await countPendingDrafts(userId);
      setPendingDraftCount(count);
      return count;
    } catch {
      setPendingDraftCount(0);
      return 0;
    }
  }, []);

  const setMode = useCallback((mode) => {
    setAuthModeState(mode);
    setAuthMode(mode);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    const savedUser = sessionStorage.getItem("user");
    const savedMode = getAuthMode();

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setMode("online");
      } catch {
        sessionStorage.clear();
        setMode(null);
      }
    } else if (savedMode === "offline" && savedUser) {
      // Offline mode does not survive a full page refresh without re-entering PIN
      // (PIN is memory-only). Clear the stale offline marker.
      sessionStorage.removeItem("user");
      setMode(null);
    }

    setLoading(false);
  }, [setMode]);

  useEffect(() => {
    const onSessionEnded = () => {
      offlinePinRef.current = null;
      setUser(null);
      setMode(null);
      setPendingDraftCount(0);
    };
    window.addEventListener("auth:session-ended", onSessionEnded);
    return () => window.removeEventListener("auth:session-ended", onSessionEnded);
  }, [setMode]);

  const acceptSession = async (data) => {
    storeSession(data.accessToken, data.user);
    setUser(data.user);
    setMode("online");

    // Refresh vault TTL marker when the same HW signs in online again
    try {
      if (isOfflineRoleAllowed(data.user.role)) {
        await refreshVaultOnlineAuth(data.user.id);
      }
    } catch {
      // Vault refresh is best-effort
    }

    await refreshPendingCount(data.user.id);
    return data.user;
  };

  const login = async (username, password) => {
    const response = await api.post("/auth/login", { username, password });
    const data = response.data;

    if (data.password_change_required) {
      return { passwordChangeToken: data.password_change_token };
    }

    if (data.mfa_required || data.mfa_setup_required) {
      return {
        mfaStage: data.mfa_required ? "verify" : "enroll",
        mfaToken: data.mfa_token,
      };
    }

    return { user: await acceptSession(data) };
  };

  const changeTemporaryPassword = async (passwordChangeToken, newPassword) => {
    const response = await api.post(
      "/auth/temporary-password/change",
      { new_password: newPassword },
      mfaHeaders(passwordChangeToken)
    );
    if (response.data.accessToken && response.data.user) {
      return { user: await acceptSession(response.data) };
    }
    return { mfaStage: "enroll", mfaToken: response.data.mfa_token };
  };

  const startMfaSetup = async (mfaToken) => {
    const response = await api.post("/auth/mfa/setup", {}, mfaHeaders(mfaToken));
    return response.data;
  };

  const completeMfa = async (stage, mfaToken, code) => {
    const path = stage === "enroll" ? "/auth/mfa/enable" : "/auth/mfa/verify";
    const response = await api.post(path, { code }, mfaHeaders(mfaToken));
    return acceptSession(response.data);
  };

  const updateUser = useCallback((changes) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...changes };
      if (getAuthMode() === "online" || sessionStorage.getItem("accessToken")) {
        sessionStorage.setItem("user", JSON.stringify(next));
      }
      return next;
    });
  }, []);

  /** Enable offline vault while online (HW + MFA session). */
  const enableOfflineAccess = async (pin, registrationOptions) => {
    if (authMode !== "online" || !user) throw new Error("OFFLINE_REQUIRES_ONLINE_SESSION");
    if (!isOfflineRoleAllowed(user.role)) throw new Error("OFFLINE_ROLE_DENIED");
    await enableOfflineVault(pin, { user, registrationOptions });
    offlinePinRef.current = pin;
    return true;
  };

  /** Unlock local vault offline — no tokens, no /auth/login. */
  const unlockOfflineAccess = async (pin) => {
    if (navigator.onLine && sessionStorage.getItem("accessToken")) {
      // Prefer real online session if somehow present
      throw new Error("OFFLINE_USE_ONLINE_LOGIN");
    }
    const payload = await unlockVault(pin);
    offlinePinRef.current = pin;
    setUser(payload.user);
    setMode("offline");
    // Remember profile for display only; never store tokens
    sessionStorage.setItem("user", JSON.stringify(payload.user));
    await refreshPendingCount(payload.user.id);
    return payload;
  };

  const getOfflinePin = () => offlinePinRef.current;

  const setOfflinePin = (pin) => {
    offlinePinRef.current = pin || null;
  };

  const runOfflineSync = async (pin, confirmMap = {}) => {
    const activePin = pin || offlinePinRef.current;
    if (!activePin || !user?.id) {
      return { skipped: true, reason: "missing_pin_or_user", synced: 0, failed: 0, needsConfirmation: 0 };
    }
    if (authMode !== "online" || !sessionStorage.getItem("accessToken")) {
      return { skipped: true, reason: "not_online_authenticated", synced: 0, failed: 0, needsConfirmation: 0 };
    }
    offlinePinRef.current = activePin;
    const summary = await syncPendingRegistrations({
      pin: activePin,
      userId: user.id,
      confirmMap,
    });
    await refreshPendingCount(user.id);
    return summary;
  };

  const logout = async ({ force = false } = {}) => {
    const count = user?.id ? await countPendingDrafts(user.id) : 0;
    if (!force && count > 0) {
      return { needsConfirm: true, pendingCount: count };
    }

    try {
      if (authMode === "online" && sessionStorage.getItem("accessToken")) {
        await api.post("/auth/logout");
      }
    } catch {
      // Local session is cleared even if the server is unreachable.
    }

    // Default: clear vault + drafts after logout confirm (plan choice)
    await wipeAllOfflineData();
    offlinePinRef.current = null;
    clearSession();
    setUser(null);
    setMode(null);
    setPendingDraftCount(0);
    await clearServiceWorkerCaches();
    return { needsConfirm: false };
  };

  // Auto-sync when connectivity returns and we have an online session + PIN in memory
  useEffect(() => {
    const trySync = async () => {
      if (
        navigator.onLine &&
        authMode === "online" &&
        offlinePinRef.current &&
        user?.id &&
        sessionStorage.getItem("accessToken")
      ) {
        await runOfflineSync(offlinePinRef.current);
      }
    };
    window.addEventListener("online", trySync);
    return () => window.removeEventListener("online", trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode,
        isOffline: authMode === "offline",
        isOnlineAuth: authMode === "online",
        loading,
        pendingDraftCount,
        refreshPendingCount,
        login,
        changeTemporaryPassword,
        startMfaSetup,
        completeMfa,
        updateUser,
        logout,
        enableOfflineAccess,
        unlockOfflineAccess,
        getOfflinePin,
        setOfflinePin,
        runOfflineSync,
        hasOfflineVault,
        getVaultPublic,
        isVaultExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
