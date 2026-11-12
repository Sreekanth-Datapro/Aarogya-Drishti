// RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s), compatible
// with Google Authenticator, Microsoft Authenticator and similar apps.
const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / PERIOD_SECONDS);
}

function codeForStep(secretBase32, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

// Returns the matched time step, or null. Steps at or before lastUsedStep are
// rejected so a code cannot be replayed.
function verifyCode(secretBase32, code, { lastUsedStep = null, window = 1, now = Date.now() } = {}) {
  if (!/^\d{6}$/.test(String(code || ""))) return null;

  const step = currentStep(now);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = step + offset;
    if (lastUsedStep !== null && candidate <= Number(lastUsedStep)) continue;

    const expected = Buffer.from(codeForStep(secretBase32, candidate));
    const given = Buffer.from(String(code));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      return candidate;
    }
  }

  return null;
}

function otpauthUrl({ secret, accountName, issuer = "Aarogya Drishti" }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, codeForStep, currentStep, verifyCode, otpauthUrl };
