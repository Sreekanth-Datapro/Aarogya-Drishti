/**
 * Resolve Express `trust proxy` safely.
 *
 * - Development: trust loopback only (default).
 * - Production / Render: trust a fixed hop count (default 1 = platform edge).
 * - Override with TRUST_PROXY: "loopback" | "false" | integer hops | "true"
 *
 * Does not blindly trust arbitrary multi-hop X-Forwarded-* chains.
 */
function resolveTrustProxy(env = process.env, { isProduction = false } = {}) {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return isProduction ? 1 : "loopback";
  }

  const value = String(raw).trim().toLowerCase();
  if (value === "false" || value === "0" || value === "off" || value === "no") {
    return false;
  }
  if (value === "loopback") {
    return "loopback";
  }
  if (value === "true" || value === "on" || value === "yes") {
    // Prefer a bounded hop count over trusting all proxies.
    return isProduction ? 1 : "loopback";
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  throw new Error(
    `Unsupported TRUST_PROXY value "${raw}". Use loopback, false, or a hop count (e.g. 1).`
  );
}

module.exports = { resolveTrustProxy };
