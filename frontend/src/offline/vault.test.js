import { webcrypto } from "crypto";
import { isOfflineRoleAllowed, isVaultExpired } from "./vault";
import { OFFLINE_TTL_MS } from "./constants";
import { createPinVerifier, verifyPin } from "./crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

describe("offline vault gates", () => {
  test("only HEALTH_WORKER may use offline vault", () => {
    expect(isOfflineRoleAllowed("HEALTH_WORKER")).toBe(true);
    expect(isOfflineRoleAllowed("MEDICAL_OFFICER")).toBe(false);
    expect(isOfflineRoleAllowed("SUPER_ADMIN")).toBe(false);
  });

  test("vault expires after OFFLINE_TTL_MS", () => {
    const fresh = { lastOnlineAuthAt: Date.now() };
    const stale = { lastOnlineAuthAt: Date.now() - OFFLINE_TTL_MS - 1 };
    expect(isVaultExpired(fresh)).toBe(false);
    expect(isVaultExpired(stale)).toBe(true);
    expect(isVaultExpired(null)).toBe(true);
  });

  test("wrong PIN fails verifier used by unlock", async () => {
    const verifier = await createPinVerifier("2468");
    expect(await verifyPin("2468", verifier)).toBe(true);
    expect(await verifyPin("9999", verifier)).toBe(false);
  });
});
