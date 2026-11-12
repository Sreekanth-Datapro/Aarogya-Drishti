/**
 * Small Web Crypto helpers for offline vault encryption.
 * PIN → PBKDF2 key → AES-GCM. Never stores the PIN itself.
 */
import { PBKDF2_ITERATIONS } from "./constants";

function webCrypto() {
  const api = globalThis.crypto || (typeof window !== "undefined" ? window.crypto : null);
  if (!api?.subtle) {
    throw new Error("Web Crypto API is not available in this environment");
  }
  return api;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  webCrypto().getRandomValues(bytes);
  return bytes;
}

async function importPinKey(pin) {
  return webCrypto().subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
}

/** Derive an AES-GCM key from the offline PIN and a salt. */
export async function deriveAesKey(pin, saltBytes) {
  const baseKey = await importPinKey(pin);
  return webCrypto().subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Create a verifier so we can check a PIN without keeping the PIN. */
export async function createPinVerifier(pin) {
  const salt = randomBytes(16);
  const baseKey = await importPinKey(pin);
  const bits = await webCrypto().subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    256
  );
  return {
    salt: toBase64(salt),
    hash: toBase64(bits),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function verifyPin(pin, verifier) {
  if (!verifier?.salt || !verifier?.hash) return false;
  const salt = new Uint8Array(fromBase64(verifier.salt));
  const baseKey = await importPinKey(pin);
  const bits = await webCrypto().subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: verifier.iterations || PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    256
  );
  return toBase64(bits) === verifier.hash;
}

/** Encrypt a JSON-serializable value. Returns { iv, ciphertext, salt } as base64. */
export async function encryptJson(pin, value, saltBase64) {
  const salt = saltBase64
    ? new Uint8Array(fromBase64(saltBase64))
    : randomBytes(16);
  const key = await deriveAesKey(pin, salt);
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await webCrypto().subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptJson(pin, envelope) {
  const salt = new Uint8Array(fromBase64(envelope.salt));
  const iv = new Uint8Array(fromBase64(envelope.iv));
  const ciphertext = new Uint8Array(fromBase64(envelope.ciphertext));
  const key = await deriveAesKey(pin, salt);
  const plaintext = await webCrypto().subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
