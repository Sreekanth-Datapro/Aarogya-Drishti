import api from "./api";

const DEFAULT_TIMEOUT_MS = 180000;

async function readBlobText(blob) {
  if (typeof blob?.text === "function") return blob.text();
  if (typeof Response !== "undefined") return new Response(blob).text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image response"));
    reader.readAsText(blob);
  });
}

/**
 * Load a private patient image through the authenticated API as a Blob URL.
 * Rejects empty/non-image bodies (e.g. JSON error payloads with responseType blob).
 * Callers must revoke the returned object URL when done.
 */
export async function fetchPrivateImageObjectUrl(path, {
  timeout = DEFAULT_TIMEOUT_MS,
  fallbackType = "image/jpeg",
} = {}) {
  const response = await api.get(path, { responseType: "blob", timeout });
  const blob = response.data;
  if (!(blob instanceof Blob) || !blob.size) {
    throw Object.assign(new Error("empty image"), {
      response: { data: { code: "IMAGE_EMPTY", message: "Image file is empty" } },
    });
  }

  const contentType = String(response.headers?.["content-type"] || blob.type || "").toLowerCase();
  if (contentType.includes("application/json") || contentType.includes("text/html") || contentType.includes("text/plain")) {
    const text = await readBlobText(blob);
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { message: text || "Image could not be loaded" };
    }
    throw Object.assign(new Error(payload?.message || "Image could not be loaded"), {
      response: { data: payload || { code: "IMAGE_INVALID", message: "Image could not be loaded" } },
    });
  }

  if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    throw Object.assign(new Error("unsupported image type"), {
      response: { data: { code: "IMAGE_INVALID", message: "Image could not be loaded" } },
    });
  }

  const typed = blob.type
    ? blob
    : new Blob([blob], { type: contentType.startsWith("image/") ? contentType.split(";")[0].trim() : fallbackType });
  return URL.createObjectURL(typed);
}
