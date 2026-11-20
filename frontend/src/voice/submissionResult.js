/**
 * Normalize what parent onRequestSubmit returns into a fixed shape.
 * Interview completion is separate from this — only API/validation outcome.
 */

export function normalizeSubmitResult(result) {
  if (result === true) return { ok: true, error: "", code: "" };
  if (result && typeof result === "object" && result.ok === true) {
    return { ok: true, error: "", code: "" };
  }
  if (result === false) {
    return { ok: false, error: "", code: "FAILED" };
  }
  if (result && typeof result === "object") {
    return {
      ok: false,
      error: result.error ? String(result.error) : "",
      code: result.code ? String(result.code) : "FAILED",
    };
  }
  // Undefined / unexpected → treat as failure so UI never assumes success
  return { ok: false, error: "", code: "FAILED" };
}

/** True while a submit request should block a second click. */
export function canStartSubmit(phase, isSubmitting) {
  if (isSubmitting) return false;
  return phase === "ready" || phase === "failed" || phase === "review";
}
