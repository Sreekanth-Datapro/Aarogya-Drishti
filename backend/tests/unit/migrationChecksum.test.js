const {
  migrationChecksum,
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

  test("normalizes CRLF and bare CR without changing other migration text", () => {
    expect(normalizeMigrationContent("line one\r\nline two\rline three\n"))
      .toBe("line one\nline two\nline three\n");
  });
});
