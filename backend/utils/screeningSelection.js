const ACTIVE_SCREENING_STATES = ["DRAFT", "CONSENTED", "SCREENED", "AWAITING_CLINICIAN"];

function activeScreeningOrder(alias) {
  const activeStates = ACTIVE_SCREENING_STATES
    .map((state) => `'${state}'::case_state`)
    .join(", ");
  return `(${alias}.case_state = ANY(ARRAY[${activeStates}])) DESC, ${alias}.created_at DESC`;
}

module.exports = { ACTIVE_SCREENING_STATES, activeScreeningOrder };
