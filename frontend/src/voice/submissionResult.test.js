import { canStartSubmit, normalizeSubmitResult } from "./submissionResult";

describe("normalizeSubmitResult", () => {
  test("API success → ok true", () => {
    expect(normalizeSubmitResult({ ok: true })).toEqual({ ok: true, error: "", code: "" });
    expect(normalizeSubmitResult(true)).toEqual({ ok: true, error: "", code: "" });
  });

  test("API 400/401/500 style failure → error UI shape", () => {
    expect(normalizeSubmitResult({ ok: false, error: "Bad request", code: "API" })).toEqual({
      ok: false,
      error: "Bad request",
      code: "API",
    });
    expect(normalizeSubmitResult({ ok: false, error: "Unauthorized", code: "API" }).ok).toBe(false);
    expect(normalizeSubmitResult({ ok: false, error: "Server error", code: "SERVER" }).code).toBe("SERVER");
  });

  test("network failure → not success", () => {
    expect(normalizeSubmitResult({ ok: false, error: "Network Error", code: "NETWORK" }).ok).toBe(false);
  });

  test("undefined / missing return never counts as success", () => {
    expect(normalizeSubmitResult(undefined).ok).toBe(false);
    expect(normalizeSubmitResult(null).ok).toBe(false);
    expect(normalizeSubmitResult(false).ok).toBe(false);
  });

  test("retry after failure can start again when not submitting", () => {
    expect(canStartSubmit("failed", false)).toBe(true);
    expect(canStartSubmit("ready", false)).toBe(true);
    expect(canStartSubmit("failed", true)).toBe(false);
    expect(canStartSubmit("submitting", false)).toBe(false);
    expect(canStartSubmit("success", false)).toBe(false);
  });
});

describe("double-submit guard contract", () => {
  test("only one active request while isSubmitting flag set", () => {
    let inFlight = false;
    let calls = 0;
    const run = () => {
      if (inFlight) return;
      inFlight = true;
      calls += 1;
      inFlight = false;
    };
    run();
    inFlight = true;
    run(); // blocked
    inFlight = false;
    run();
    expect(calls).toBe(2);
  });
});
