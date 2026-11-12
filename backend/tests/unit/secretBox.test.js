const crypto = require("crypto");
const { encrypt, decrypt } = require("../../utils/secretBox");
const {
  decodeBase64EncryptionKey,
  validateBase64EncryptionKey,
} = require("../../utils/encryptionKey");

test("AES-256-GCM encrypts and decrypts setup-token material", () => {
  const key = crypto.randomBytes(32);
  const plaintext = crypto.randomBytes(32).toString("hex");
  const encrypted = encrypt(plaintext, key);

  expect(encrypted).not.toContain(plaintext);
  expect(decrypt(encrypted, key)).toBe(plaintext);
});

test("AES-256-GCM rejects a tampered authentication tag", () => {
  const key = crypto.randomBytes(32);
  const encrypted = encrypt("setup-token", key);
  const [version, iv, tag, ciphertext] = encrypted.split(":");
  const tamperedTag = Buffer.from(tag, "base64");
  tamperedTag[0] ^= 0xff;

  expect(() => decrypt(
    [version, iv, tamperedTag.toString("base64"), ciphertext].join(":"),
    key
  )).toThrow();
});

test("AES-256-GCM rejects a different 32-byte key", () => {
  const encrypted = encrypt("setup-token", crypto.randomBytes(32));
  expect(() => decrypt(encrypted, crypto.randomBytes(32))).toThrow();
});

test("accepts only canonical Base64 encoding of a 32-byte encryption key", () => {
  const key = crypto.randomBytes(32);
  expect(decodeBase64EncryptionKey(key.toString("base64"))).toEqual(key);
  expect(decodeBase64EncryptionKey("not-base64@@")).toBeNull();
  expect(decodeBase64EncryptionKey(Buffer.alloc(16).toString("base64"))).toBeNull();
  expect(decodeBase64EncryptionKey(`${key.toString("base64")}extra`)).toBeNull();
});

test("validates missing and invalid setup encryption-key configuration", () => {
  const key = crypto.randomBytes(32);

  expect(() =>
    validateBase64EncryptionKey("", "SETUP_TOKEN_ENCRYPTION_KEY")
  ).toThrow("SETUP_TOKEN_ENCRYPTION_KEY is missing.");
  expect(() =>
    validateBase64EncryptionKey("not-base64@@", "SETUP_TOKEN_ENCRYPTION_KEY")
  ).toThrow("SETUP_TOKEN_ENCRYPTION_KEY must be canonical Base64 encoding");
  expect(() =>
    validateBase64EncryptionKey(
      Buffer.alloc(16).toString("base64"),
      "SETUP_TOKEN_ENCRYPTION_KEY"
    )
  ).toThrow("exactly 32 bytes");
  expect(validateBase64EncryptionKey(
    key.toString("base64"),
    "SETUP_TOKEN_ENCRYPTION_KEY"
  ).length).toBe(32);
});
