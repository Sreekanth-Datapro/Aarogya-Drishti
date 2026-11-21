const crypto = require("crypto");
const fs = require("fs");

function normalizeMigrationContent(content) {
  const text = Buffer.isBuffer(content) ? content.toString("utf8") : String(content);
  return text.replace(/\r\n?/g, "\n");
}

function migrationChecksum(content) {
  return crypto
    .createHash("sha256")
    .update(normalizeMigrationContent(content), "utf8")
    .digest("hex");
}

function migrationChecksumCandidates(content) {
  const normalized = normalizeMigrationContent(content);
  const lf = Buffer.from(normalized, "utf8");
  const crlf = Buffer.from(normalized.replace(/\n/g, "\r\n"), "utf8");
  const original = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content), "utf8");

  return [
    ...new Set(
      [lf, crlf, original].map((bytes) =>
        crypto.createHash("sha256").update(bytes).digest("hex")
      )
    ),
  ];
}

function migrationFileChecksum(filePath) {
  return migrationChecksum(fs.readFileSync(filePath));
}

function migrationFileChecksumCandidates(filePath) {
  return migrationChecksumCandidates(fs.readFileSync(filePath));
}

module.exports = {
  migrationChecksum,
  migrationChecksumCandidates,
  migrationFileChecksum,
  migrationFileChecksumCandidates,
  normalizeMigrationContent,
};
