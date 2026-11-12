/**
 * Decide whether Express may call the AI pipeline at this URL.
 * HTTPS is always allowed. HTTP is limited to loopback / private Docker-style hosts
 * so service-to-service calls work without sending PHI over the public internet in cleartext.
 */

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isLoopbackHost(hostname) {
  const host = normalizeHostname(hostname);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPrivateIpv4(hostname) {
  const host = normalizeHostname(hostname);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  return false;
}

function isPrivateServiceHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  if (isLoopbackHost(host) || isPrivateIpv4(host)) return true;
  // Render private service DNS
  if (host.endsWith(".render.internal")) return true;
  // Docker Compose / Swarm single-label service names (e.g. "aipipe")
  if (!host.includes(".")) return true;
  // Local/dev DNS suffixes
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  return false;
}

function assertAiPipelineUrlAllowed(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    const error = new Error("AI_PIPELINE_URL is not a valid URL");
    error.code = "AI_PIPELINE_UNAVAILABLE";
    throw error;
  }

  if (url.protocol === "https:") {
    return url;
  }

  if (url.protocol === "http:" && isPrivateServiceHostname(url.hostname)) {
    return url;
  }

  const error = new Error(
    "The AI pipeline must use HTTPS, or HTTP only to a private/loopback service hostname."
  );
  error.code = "AI_PIPELINE_UNAVAILABLE";
  throw error;
}

module.exports = {
  assertAiPipelineUrlAllowed,
  isLoopbackHost,
  isPrivateIpv4,
  isPrivateServiceHostname,
  normalizeHostname,
};
