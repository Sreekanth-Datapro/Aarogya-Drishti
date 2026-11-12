// 005_case_facts_village_mandal.js
// vw_case_facts found a patient's mandal through village -> gram panchayat -> mandal.
// Villages imported from LGD have no gram panchayat, so the view now uses the
// direct link mst_villages.mandal_id added in 004 (for existing villages it holds
// the same mandal, so current reports do not change).
// The live view definition is read from PostgreSQL and only this one join is changed.
exports.up = async (client, { log = () => {} } = {}) => {
  const { rows } = await client.query("SELECT pg_get_viewdef('vw_case_facts'::regclass, true) AS def");
  const oldDefinition = rows[0].def;

  const oldJoin = /m\.id = gp\.mandal_id/g;
  const matches = oldDefinition.match(oldJoin) || [];

  if (matches.length !== 1) {
    throw new Error(
      `005: expected exactly one "m.id = gp.mandal_id" join in vw_case_facts, found ${matches.length}; view left unchanged`
    );
  }

  const newDefinition = oldDefinition.replace(oldJoin, "m.id = v.mandal_id");
  await client.query(`CREATE OR REPLACE VIEW vw_case_facts AS ${newDefinition}`);

  log("  005: vw_case_facts now reads the mandal from mst_villages.mandal_id");
};
