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

function migrationFileChecksum(filePath) {
  return migrationChecksum(fs.readFileSync(filePath));
}

module.exports = {
  migrationChecksum,
  migrationFileChecksum,
  normalizeMigrationContent,
};
