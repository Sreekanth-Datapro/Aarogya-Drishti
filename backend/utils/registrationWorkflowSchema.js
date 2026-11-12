const REQUIRED_COLUMNS = [
  "workflow_version",
  "mo_recommended_by",
  "mo_recommended_at",
  "mo_recommendation",
  "mo_recommendation_note",
  "status_token_hash",
  "status_token_expires_at",
];

async function hasTwoStageRegistrationSchema(db) {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT column_name)::int AS column_count
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tbl_user_registration_requests'
        AND column_name = ANY($1::text[])`,
    [REQUIRED_COLUMNS]
  );
  return Number(rows[0]?.column_count) === REQUIRED_COLUMNS.length;
}

module.exports = { hasTwoStageRegistrationSchema };
