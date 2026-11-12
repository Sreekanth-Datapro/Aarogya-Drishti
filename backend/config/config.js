const path = require("path");
const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "test" ? ".env.test" : ".env";
require("dotenv").config({
  path: path.join(__dirname, "..", envFile),
  override: false,
  quiet: true,
});
if (nodeEnv === "test") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
    override: false,
    quiet: true,
  });
}
const {
  decodeBase64EncryptionKey,
  validateBase64EncryptionKey,
} = require("../utils/encryptionKey");
const { buildDatabaseSslConfig } = require("../utils/dbSsl");

const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",

  port: Number(process.env.PORT || 5000),

  database: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: buildDatabaseSslConfig(process.env),
  },

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",

  refreshTokenTtlHours: Number(process.env.REFRESH_TOKEN_TTL_HOURS || 12),
  mfaTokenTtl: "5m",

  passwordResetTtlMinutes: 15,
  // console (development only) | none | email | sms (email/sms adapters not configured yet)
  passwordResetDelivery:
    process.env.PASSWORD_RESET_DELIVERY || (nodeEnv === "production" ? "none" : "console"),

  frontendUrl:
    process.env.FRONTEND_URL || "http://localhost:3000",

  // Government of India Local Government Directory web services (no key needed).
  // Called only from the backend; the browser never talks to LGD directly.
  lgdBaseUrl:
    process.env.LGD_BASE_URL || "https://lgdirectory.gov.in/webservices/lgdws",
  lgdTimeoutMs: Number(process.env.LGD_TIMEOUT_MS || 30000),

  // Private local folder retained for legacy oral screening photos.
  photoStorageDir:
    process.env.PHOTO_STORAGE_DIR || path.join(__dirname, "..", "storage", "screening-photos"),

  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "",
  },

  // Real-ESRGAN enhancement: photos are reduced to this longest side before the
  // 4x model runs (384 -> a 1536 pixel enhanced copy, about 12 tiles on the CPU).
  realEsrgan: {
    maxInputSide: Number(process.env.REAL_ESRGAN_MAX_INPUT_SIDE || 384),
  },

  aiPipeline: {
    url: process.env.AI_PIPELINE_URL || "http://127.0.0.1:8010",
    authToken: process.env.AI_PIPELINE_AUTH_TOKEN || "",
    healthTimeoutMs: Number(process.env.AI_PIPELINE_HEALTH_TIMEOUT_MS || 5000),
    analysisTimeoutMs: Number(process.env.AI_PIPELINE_ANALYSIS_TIMEOUT_MS || 600000),
  },

  systemAdmin: {
    username: process.env.SYSTEM_ADMIN_USERNAME,
    password: process.env.SYSTEM_ADMIN_PASSWORD,
    fullName:
      process.env.SYSTEM_ADMIN_FULL_NAME ||
      "Aarogya Drishti System Administrator",
  },
};

// MFA secrets are encrypted with this key; read lazily so a missing key
// only disables MFA logins instead of the whole API.
config.getMfaEncryptionKey = () => {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) return null;

  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
};

config.getSetupTokenEncryptionKey = () => {
  return decodeBase64EncryptionKey(process.env.SETUP_TOKEN_ENCRYPTION_KEY);
};

config.validateSetupTokenEncryptionKey = () => {
  return validateBase64EncryptionKey(
    process.env.SETUP_TOKEN_ENCRYPTION_KEY,
    "SETUP_TOKEN_ENCRYPTION_KEY"
  );
};

// Validate JWT secret
if (
  !config.jwtSecret ||
  Buffer.byteLength(config.jwtSecret, "utf8") < 32
) {
  throw new Error("JWT_SECRET must contain at least 32 bytes.");
}

// Validate database configuration
if (
  !config.database.name ||
  !config.database.user
) {
  throw new Error("PostgreSQL database configuration is incomplete.");
}

if (typeof config.database.password !== "string" || !config.database.password) {
  throw new Error("PostgreSQL DB_PASSWORD must be configured as a non-empty string.");
}

module.exports = config;
