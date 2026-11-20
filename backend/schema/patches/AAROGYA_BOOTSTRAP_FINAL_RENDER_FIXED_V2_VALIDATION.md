# AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED_V2 — Validation Report

**Generated:** 2026-11-18  
**Method:** Static analysis only — no Render connection, no SQL execution  

**Unchanged inputs:**
- `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql`
- `backend/schema/patches/AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED.sql`

**New output:**
- `backend/schema/patches/AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED_V2.sql`

---

## 1. Root cause

| Item | Detail |
|------|--------|
| Reported failure | Line ~13360: `ERROR: no schema has been selected to create in` |
| Statement | `CREATE TABLE IF NOT EXISTS schema_migrations (...)` |
| Why | Data section left `search_path = ''`. Footer from `buildBootstrapSql.js` creates/inserts **without** `public.` |
| Not the cause | Missing dump table — dump already has `CREATE TABLE public.schema_migrations` (~2317) |

---

## 2. Exact changes (V2 vs RENDER_FIXED)

| # | Location | Before | After | Why |
|---|----------|--------|-------|-----|
| 1 | ~13354 | `CREATE TABLE IF NOT EXISTS schema_migrations (` | `CREATE TABLE IF NOT EXISTS public.schema_migrations (` | CREATE under empty search_path requires explicit schema |
| 2 | 40× (~13362–13635) | `INSERT INTO schema_migrations (` | `INSERT INTO public.schema_migrations (` | Same for DML; keeps history in `public` |

**Carried forward from RENDER_FIXED (already present in V2 base):**

| Line | Change |
|------|--------|
| ~1474 | `FROM public.mst_gram_panchayats` |
| ~778 | `FROM public.mst_mandals` |
| ~788 | `FROM public.mst_villages` |

**Not changed:** empty `search_path` (2×), triggers, table DDL, seed rows, roles, business logic, BEGIN/COMMIT.

---

## 3. `schema_migrations` audit

| Reference type | Original / FIXED | V2 |
|----------------|------------------|-----|
| Dump `CREATE TABLE public.schema_migrations` | Present | Present |
| Footer `CREATE TABLE IF NOT EXISTS` unqualified | **1** (failure) | **0** |
| Footer `CREATE TABLE IF NOT EXISTS public.…` | 0 | **1** |
| `INSERT INTO schema_migrations` unqualified | **40** | **0** |
| `INSERT INTO public.schema_migrations` | 0 | **40** |
| `ALTER TABLE ONLY public.schema_migrations` + PK | Present | Present |
| Constraint name `schema_migrations_pkey` | OK (identifier, not schema) | OK |
| Comments / headers mentioning name | OK | OK |

No SELECT/UPDATE/index/sequence on unqualified `schema_migrations` found in the footer beyond the CREATE/INSERT pair above.

---

## 4. Broader unqualified DDL audit

pg_dump body already emits schema-qualified DDL (`CREATE TABLE public.*`, `ALTER TABLE ONLY public.*`, `CREATE INDEX … ON public.*`, `setval('public.…')`, views as `public.*`).

**Only search_path-sensitive unqualified schema DDL/DML found:** the migration-history footer (`CREATE TABLE IF NOT EXISTS` + 40 `INSERT`s). All fixed in V2.

Other app trigger functions may still contain unqualified `mst_*`/`tbl_*` in bodies for **non-seed** paths; seed-time INSERT triggers on `mst_*` were already fixed in RENDER_FIXED. No additional seed-time unqualified CREATE/ALTER/INSERT remained after V2.

---

## 5. Three-way comparison

| Metric | Original | RENDER_FIXED | V2 |
|--------|---------:|-------------:|---:|
| SHA-256 (prefix) | `4e8eb71f…` | `9f7a071b…` | `77477886…` |
| Bytes | 732605 | 732626 | 732913 |
| CREATE TRIGGER | 95 | 95 | 95 |
| CREATE FUNCTION public.* | 25 | 25 | 25 |
| Unique app tables | 97 | 97 | 97 |
| Migration INSERT rows | 40 unqual | 40 unqual | **40 public** |
| Empty search_path sets | 2 | 2 | 2 |
| search_path=public sets | 0 | 0 | 0 |
| Village/facility public quals | No | Yes | Yes |
| BEGIN / COMMIT | Yes | Yes | Yes |

Note: Statement count of `CREATE TABLE` is 98 because dump creates `public.schema_migrations` and footer adds `CREATE TABLE IF NOT EXISTS public.schema_migrations` (same table, idempotent).

---

## 6. Transaction behavior

- Script still wrapped in `BEGIN;` … `COMMIT;`.
- Any error before `COMMIT` rolls back the whole load.
- After a failed attempt, re-run **V2** on a reset/empty DB (bootstrap still starts with `DROP SCHEMA public CASCADE`).

---

## 7. Static validation checklist

| Check | Result |
|-------|--------|
| Original unchanged | **PASS** (`4e8eb71f…`) |
| RENDER_FIXED unchanged | **PASS** (`9f7a071b…`) |
| V2 qualifies footer CREATE | **PASS** |
| V2 qualifies 40 INSERTs | **PASS** |
| Zero unqualified `INSERT INTO schema_migrations` | **PASS** |
| Empty search_path preserved | **PASS** |
| No global search_path=public | **PASS** |
| 95 triggers / 25 functions | **PASS** |
| 40 migration records | **PASS** |
| Seed-time trigger quals retained | **PASS** |
| BEGIN/COMMIT present | **PASS** |

---

## 8. Overall verdict

# **PASS**

**Load this file next:**  
`backend/schema/patches/AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED_V2.sql`
