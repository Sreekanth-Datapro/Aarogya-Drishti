import {
  buildOkayAck,
  detectChangeFieldIntent,
  shouldAutoAdvance,
  shouldRepeatQuestion,
} from "./conversationFlow";
import { parseRegistrationFieldAnswer } from "./fieldAnswerParsers";
import { registrationAnswersToFormPatch } from "./receptionistScripts";
import { normalizeSubmitResult } from "./submissionResult";

describe("no per-field yes/no confirmation", () => {
  test("valid answer automatically advances", () => {
    const parsed = parseRegistrationFieldAnswer("full_name", "Srikanth");
    const question = { id: "full_name", optional: false };
    expect(shouldAutoAdvance(parsed, question)).toBe(true);
    expect(shouldRepeatQuestion(parsed, question)).toBe(false);
  });

  test("does not require yes/no after each field", () => {
    // Auto-advance means the confirm phase is skipped by design.
    const parsed = parseRegistrationFieldAnswer("age_years", "25");
    expect(shouldAutoAdvance(parsed, { id: "age_years", optional: false })).toBe(true);
    expect(buildOkayAck("Okay, {value}.", "25")).toBe("Okay, 25.");
    expect(buildOkayAck("Okay, {value}.", "25")).not.toMatch(/is that correct/i);
  });

  test("invalid answer repeats the same question", () => {
    const parsed = parseRegistrationFieldAnswer("age_years", "two hundred");
    const question = { id: "age_years", optional: false };
    expect(shouldRepeatQuestion(parsed, question)).toBe(true);
    expect(shouldAutoAdvance(parsed, question)).toBe(false);
  });

  test("answer updates the correct form field", () => {
    const parsed = parseRegistrationFieldAnswer("full_name", "My name is Srikanth");
    const { patch, filled } = registrationAnswersToFormPatch(
      { full_name: parsed.value },
      { form: { consents: {} }, mandals: [] },
    );
    expect(patch.full_name).toBe("Srikanth");
    expect(filled).toContain("full_name");
    expect(patch.age_years).toBeUndefined();
  });

  test("change-field intent jumps to one field without full restart", () => {
    const ids = ["full_name", "age_years", "sex"];
    expect(detectChangeFieldIntent("change my name", ids)).toBe("full_name");
    expect(detectChangeFieldIntent("edit age", ids)).toBe("age_years");
    expect(detectChangeFieldIntent("hello", ids)).toBeNull();
  });

  test("final submission still requires explicit confirmation result", () => {
    // Review yes triggers submit; success only when API returns ok:true (D1).
    expect(normalizeSubmitResult(undefined).ok).toBe(false);
    expect(normalizeSubmitResult({ ok: true }).ok).toBe(true);
    expect(normalizeSubmitResult({ ok: false, code: "API" }).ok).toBe(false);
  });

  test("manual correction mapping still works via form patch", () => {
    const first = registrationAnswersToFormPatch(
      { full_name: "Old Name", age_years: "20" },
      { form: { consents: {} }, mandals: [] },
    );
    const corrected = registrationAnswersToFormPatch(
      { full_name: "New Name", age_years: "20" },
      { form: { consents: {} }, mandals: [] },
    );
    expect(first.patch.full_name).toBe("Old Name");
    expect(corrected.patch.full_name).toBe("New Name");
  });
});
