// Usage:
//   node scripts/migrate.js
//       show pending migrations (no changes)
//   node scripts/migrate.js --apply --defer-003
//       phase 1: apply/baseline only 001–002; stop before 003 (004+ stay pending)
//   node scripts/migrate.js --apply --approve-003-promote-bootstrap
//       execute 003 (requires MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP), then 004+ in order
//   node scripts/migrate.js --apply --only-003-promote-bootstrap --approve-003-promote-bootstrap
//       execute ONLY 003 (requires MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP and
//       MIGRATION_TRUSTED_DATABASE_NAME matching current_database()); never 004+
require("dotenv").config({ quiet: true });

const { Client } = require("pg");
const { buildDatabaseSslConfig } = require("../utils/dbSsl");
const config = require("../config/config");
const { runMigrations, getStatus } = require("../utils/migrator");

async function main() {
  const apply = process.argv.includes("--apply");
  const defer003 = process.argv.includes("--defer-003");
  const approve003PromoteBootstrap = process.argv.includes(
    "--approve-003-promote-bootstrap"
  );
  const only003PromoteBootstrap = process.argv.includes(
    "--only-003-promote-bootstrap"
  );

  if (defer003 && approve003PromoteBootstrap) {
    throw new Error(
      "Use either --defer-003 or --approve-003-promote-bootstrap, not both."
    );
  }
  if (defer003 && only003PromoteBootstrap) {
    throw new Error(
      "Use either --defer-003 or --only-003-promote-bootstrap, not both."
    );
  }
  if (only003PromoteBootstrap && !approve003PromoteBootstrap) {
    throw new Error(
      "--only-003-promote-bootstrap requires --approve-003-promote-bootstrap " +
        "and MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP."
    );
  }

  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: buildDatabaseSslConfig(process.env),
  });

  await client.connect();

  try {
    const { rows } = await client.query("SELECT current_database() AS name");
    console.log(`Target database: ${rows[0].name}`);

    const status = await getStatus(client);
    for (const m of status) {
      console.log(`  ${m.state.padEnd(8)}  ${m.file}`);
    }

    if (!apply) {
      const pending = status.filter((m) => m.state === "pending").length;
      console.log(
        pending
          ? `\n${pending} pending migration(s). Run with --apply to apply them.`
          : "\nDatabase is up to date."
      );
      return;
    }

    console.log("\nApplying pending migrations...");
    const results = await runMigrations(client, {
      apply: true,
      defer003,
      approve003PromoteBootstrap,
      only003PromoteBootstrap,
      context: {
        bootstrapUsername: config.systemAdmin.username,
        defer003,
        approve003PromoteBootstrap,
        only003PromoteBootstrap,
      },
    });
    console.log(results.length ? "Done." : "Nothing to apply.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
