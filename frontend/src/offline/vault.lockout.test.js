import { webcrypto } from "crypto";
import {
  createPinVerifier,
  encryptJson,
} from "./crypto";
import {
  getPinLockoutState,
  lockoutDelayMs,
  unlockVault,
} from "./vault";
import { OFFLINE_PIN_MAX_ATTEMPTS } from "./constants";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

jest.mock("./db", () => {
  const getStore = () => {
    if (!globalThis.__aarogyaOfflineMeta) {
      globalThis.__aarogyaOfflineMeta = new Map();
    }
    return globalThis.__aarogyaOfflineMeta;
  };
  return {
    metaGet: async (key) => {
      const store = getStore();
      return store.has(key) ? store.get(key) : null;
    },
    metaSet: async (key, value) => {
      getStore().set(key, value);
    },
    metaDelete: async (key) => {
      getStore().delete(key);
    },
    draftsDeleteByUser: async () => {},
    wipeOfflineDb: async () => {
      getStore().clear();
    },
  };
});

async function seedVault(pin = "2468") {
  const store = globalThis.__aarogyaOfflineMeta;
  const verifier = await createPinVerifier(pin);
  const envelope = await encryptJson(pin, {
    version: 1,
    user: {
      id: 42,
      username: "hw1",
      full_name: "Health Worker",
      role: "HEALTH_WORKER",
      permissions: [],
    },
    registrationOptions: null,
    lastOnlineAuthAt: Date.now(),
  });
  store.set("pin_verifier", verifier);
  store.set("vault_envelope", envelope);
  store.set("vault_public", {
    userId: 42,
    username: "hw1",
    full_name: "Health Worker",
    role: "HEALTH_WORKER",
    lastOnlineAuthAt: Date.now(),
  });
  store.set("pin_lockout", { failedAttempts: 0, lockedUntil: null, updatedAt: Date.now() });
}

describe("offline PIN lockout", () => {
  beforeEach(() => {
    globalThis.__aarogyaOfflineMeta = new Map();
  });

  test("lockoutDelayMs stays zero until max attempts, then steps up", () => {
    expect(lockoutDelayMs(OFFLINE_PIN_MAX_ATTEMPTS - 1)).toBe(0);
    expect(lockoutDelayMs(OFFLINE_PIN_MAX_ATTEMPTS)).toBe(30 * 1000);
    expect(lockoutDelayMs(OFFLINE_PIN_MAX_ATTEMPTS + 1)).toBe(2 * 60 * 1000);
  });

  test("wrong PIN increments persistent attempts and does not store the PIN", async () => {
    await seedVault("2468");
    await expect(unlockVault("0000")).rejects.toMatchObject({
      message: "OFFLINE_PIN_WRONG",
      attemptsRemaining: OFFLINE_PIN_MAX_ATTEMPTS - 1,
    });

    const lockout = globalThis.__aarogyaOfflineMeta.get("pin_lockout");
    expect(lockout.failedAttempts).toBe(1);
    expect(JSON.stringify(lockout)).not.toMatch(/2468|0000/);
    const state = await getPinLockoutState();
    expect(state.failedAttempts).toBe(1);
    expect(state.isLocked).toBe(false);
  });

  test("reaching max attempts locks the vault until the delay elapses", async () => {
    await seedVault("2468");
    for (let i = 0; i < OFFLINE_PIN_MAX_ATTEMPTS - 1; i += 1) {
      await expect(unlockVault("1111")).rejects.toThrow("OFFLINE_PIN_WRONG");
    }
    await expect(unlockVault("1111")).rejects.toMatchObject({
      message: "OFFLINE_PIN_LOCKED",
      remainingMs: expect.any(Number),
    });

    const locked = await getPinLockoutState();
    expect(locked.isLocked).toBe(true);
    expect(locked.remainingMs).toBeGreaterThan(0);
    await expect(unlockVault("2468")).rejects.toThrow("OFFLINE_PIN_LOCKED");
  });

  test("successful unlock clears the lockout counter", async () => {
    await seedVault("2468");
    await expect(unlockVault("0000")).rejects.toThrow("OFFLINE_PIN_WRONG");
    const payload = await unlockVault("2468");
    expect(payload.user.id).toBe(42);
    const state = await getPinLockoutState();
    expect(state.failedAttempts).toBe(0);
    expect(state.isLocked).toBe(false);
  });
});
