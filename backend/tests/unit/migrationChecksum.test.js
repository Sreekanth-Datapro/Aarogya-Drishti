const crypto = require("crypto");
const {
  migrationChecksum,
  migrationChecksumCandidates,
  normalizeMigrationContent,
} = require("../../utils/migrationChecksum");

describe("migration checksums", () => {
  test("LF and CRLF migration contents produce the same SHA-256 checksum", () => {
    const lf = Buffer.from(
      "CREATE TABLE example (\n  id INTEGER PRIMARY KEY\n);\n",
      "utf8"
    );
    const crlf = Buffer.from(
      "CREATE TABLE example (\r\n  id INTEGER PRIMARY KEY\r\n);\r\n",
      "utf8"
    );

    expect(migrationChecksum(crlf)).toBe(migrationChecksum(lf));
  });

  test("accepts legacy raw LF and CRLF digests for equivalent content", () => {
    const lf = Buffer.from("line one\nline two\n", "utf8");
    const crlf = Buffer.from("line one\r\nline two\r\n", "utf8");
    const checksum = (content) =>
      crypto.createHash("sha256").update(content).digest("hex");

    expect(migrationChecksumCandidates(lf)).toContain(checksum(lf));
    expect(migrationChecksumCandidates(lf)).toContain(checksum(crlf));
    expect(migrationChecksumCandidates(crlf)).toContain(checksum(lf));
    expect(migrationChecksumCandidates(crlf)).toContain(checksum(crlf));
  });

  test("normalizes CRLF and bare CR without changing other migration text", () => {
    expect(normalizeMigrationContent("line one\r\nline two\rline three\n"))
      .toBe("line one\nline two\nline three\n");
  });
});
