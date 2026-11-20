const pool = require("./db");

(async () => {
  try {
    const result = await pool.query(`
      SELECT current_database() AS db,
             filename,
             checksum,
             applied_by
      FROM schema_migrations
      WHERE filename IN (
        '001_schema_fixes.sql',
        '002_security_core.sql'
      )
      ORDER BY filename
    `);

    console.table(result.rows);
  } catch (error) {
    console.error(error.message);
  } finally {
    await pool.end();
  }
})();
