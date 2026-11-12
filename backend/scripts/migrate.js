// Usage:
//   node scripts/migrate.js            show pending migrations (no changes)
//   node scripts/migrate.js --apply    apply pending migrations
require("dotenv").config({ quiet: true });

const { Client } = require("pg");
const config = require("../config/config");
const { runMigrations, getStatus } = require("../utils/migrator");

async function main() {
  const apply = process.argv.includes("--apply");

  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
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
      context: { bootstrapUsername: config.systemAdmin.username },
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
