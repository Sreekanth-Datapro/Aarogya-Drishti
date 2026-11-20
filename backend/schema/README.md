# Aarogya Drishti database bootstrap

## `AAROGYA_BOOTSTRAP_FINAL.sql`

Single SQL file that creates the **full current schema** (base + migrations **001–043**) plus **master seed data** (`mst_*`) and records every migrator file in `schema_migrations`.

Use this to stand up an **empty** database without running `npm run migrate`.

### Load

```bash
# Database may be new or previously half-loaded; the SQL wipes schema public first
psql -h HOST -U USER -d DB_NAME -f backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql
```

If you see `type "…" already exists`, the previous run left objects behind. Re-run the updated bootstrap (it drops `public`), or:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

then load the file again.

Then point `DB_*` at that database and start the API (`npm start`).  
`bootstrap.js` can create the first admin if no users exist.

Optional check:

```bash
cd backend
npm run migrate
# expect: Database is up to date.
```

### What is included / excluded

| Included | Excluded |
|----------|----------|
| All tables, views, functions, enums, indexes | Clinical / transactional `tbl_*` row data |
| `mst_*` seed rows from the dump source | Local user passwords / PHI |
| `schema_migrations` rows for 001–043 (and JS migrations tracked by the migrator) | Replacing `migrate --apply` on an **existing** production DB |

### Regenerate (maintainers)

From a local DB that already has all migrations applied:

```powershell
cd backend
$env:PGPASSWORD = '...'   # do not commit
$pg = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
& $pg -h localhost -U postgres -d Aarogya --schema-only --no-owner --no-privileges -f schema\_schema_only.sql
& $pg -h localhost -U postgres -d Aarogya --data-only --column-inserts --rows-per-insert=100 -t 'public.mst_*' -f schema\_mst_data.sql
node scripts/buildBootstrapSql.js
```

Intermediate files `_schema_only.sql` / `_mst_data.sql` are build artifacts.
