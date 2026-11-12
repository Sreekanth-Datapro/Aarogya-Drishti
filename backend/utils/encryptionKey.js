function decodeBase64EncryptionKey(value) {
  if (
    typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return null;
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    return null;
  }
  return key;
}

function validateBase64EncryptionKey(value, variableName) {
  const name = String(variableName || "Encryption key");
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is missing.`);
  }

  const key = decodeBase64EncryptionKey(value);
  if (!key) {
    throw new Error(`${name} must be canonical Base64 encoding that decodes to exactly 32 bytes.`);
  }
  return key;
}

module.exports = { decodeBase64EncryptionKey, validateBase64EncryptionKey };
