import { webcrypto } from "crypto";
import { createPinVerifier, decryptJson, encryptJson, verifyPin } from "./crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

describe("offline crypto", () => {
  test("PIN verifier accepts the correct PIN and rejects a wrong one", async () => {
    const verifier = await createPinVerifier("4821");
    expect(await verifyPin("4821", verifier)).toBe(true);
    expect(await verifyPin("0000", verifier)).toBe(false);
  });

  test("encrypt/decrypt round-trip preserves JSON payload", async () => {
    const payload = { user: { id: 7, role: "HEALTH_WORKER" }, note: "village draft" };
    const envelope = await encryptJson("9142", payload);
    expect(envelope.salt).toBeTruthy();
    expect(envelope.iv).toBeTruthy();
    expect(envelope.ciphertext).toBeTruthy();
    await expect(decryptJson("9142", envelope)).resolves.toEqual(payload);
    await expect(decryptJson("1111", envelope)).rejects.toBeTruthy();
  });

  test("reusing the same salt keeps key material stable across encrypts", async () => {
    const first = await encryptJson("5555", { a: 1 });
    const second = await encryptJson("5555", { a: 2 }, first.salt);
    expect(second.salt).toBe(first.salt);
    await expect(decryptJson("5555", second)).resolves.toEqual({ a: 2 });
  });
});
