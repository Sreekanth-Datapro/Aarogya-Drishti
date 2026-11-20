/**
 * Merge proposed voice patches into form state without silent overwrites.
 *
 * Each patch: { field, value, labelKey?, displayValue? }
 * Conflicts: field already has a non-empty value different from the proposal.
 */

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

export function classifyPatches(currentForm, patches) {
  const safe = Array.isArray(patches) ? patches : [];
  const applicable = [];
  const conflicts = [];

  safe.forEach((patch) => {
    if (!patch || !patch.field) return;
    const current = currentForm?.[patch.field];
    if (!isEmptyValue(current) && String(current) !== String(patch.value)) {
      conflicts.push({
        ...patch,
        currentValue: current,
      });
    } else if (isEmptyValue(current) || String(current) === String(patch.value)) {
      if (!isEmptyValue(current) && String(current) === String(patch.value)) {
        // Same value — no-op, skip
        return;
      }
      applicable.push(patch);
    }
  });

  return { applicable, conflicts };
}

/**
 * Build the final field updates from applicable patches + user conflict choices.
 * choices: { [field]: "keep" | "voice" }
 */
export function resolvePatches({ applicable, conflicts, choices = {} }) {
  const updates = {};
  const filledFields = [];

  (applicable || []).forEach((patch) => {
    updates[patch.field] = patch.value;
    filledFields.push(patch.field);
  });

  (conflicts || []).forEach((patch) => {
    const choice = choices[patch.field] || "keep";
    if (choice === "voice") {
      updates[patch.field] = patch.value;
      filledFields.push(patch.field);
    }
  });

  return { updates, filledFields };
}
