# Bootstrap failure — root cause and proposed fix

**Status:** Investigation only — **original `AAROGYA_BOOTSTRAP_FINAL.sql` not modified**  
**Date:** 2026-11-18  
**Observed error (Render):**  
`ERROR: relation "mst_gram_panchayats" does not exist`  
in `fn_village_mandal_from_gp()` during village seed (reported near line **10355**)

---

## 1. What line 10355 actually is

```text
10355:   (... last value row of a multi-row INSERT ...);
10356: INSERT INTO public.mst_villages (...) VALUES
```

Line **10355** is the **end** of the **first** `INSERT INTO public.mst_villages` statement that **starts at line 10255**.  
`psql` often attributes the error to the last line of the failing statement.

That statement’s first data rows are:

```text
(1, 1, 'VIL_DEMO_1', ... mandal_id 2),   -- gram_panchayat_id = 1
(2, 1, 'VIL_DEMO_2', ...),               -- gram_panchayat_id = 1
(3, NULL, 'LGD_V_584320', ...),          -- gram_panchayat_id NULL → trigger skips GP lookup
```

Failure is triggered by rows with **non-null** `gram_panchayat_id` (demo villages 1–2), not by “table created after this line.”

---

## 2. Object locations (ordering is fine for CREATE)

| Object | Line (approx) | Notes |
|--------|---------------|--------|
| `CREATE FUNCTION public.fn_village_mandal_from_gp` | **1467** | Body uses **unqualified** `mst_gram_panchayats` |
| `CREATE TABLE public.mst_gram_panchayats` | **1789** | Exists before data |
| `CREATE TABLE public.mst_villages` | **2282** | Exists before data |
| `CREATE TRIGGER trg_village_mandal` | **7721** | `BEFORE INSERT OR UPDATE OF gram_panchayat_id, mandal_id ON mst_villages` → `fn_village_mandal_from_gp()` |
| `INSERT INTO public.mst_gram_panchayats` | **10223** | One demo GP row |
| `INSERT INTO public.mst_villages` (batch 1) | **10255–10355** | Fires trigger |

**Conclusion:** This is **not** “INSERT before CREATE TABLE.”  
`public.mst_gram_panchayats` is created long before seed data.

---

## 3. Exact root cause

### 3.1 Empty `search_path` (pg_dump style)

Bootstrap sets:

```sql
SELECT pg_catalog.set_config('search_path', '', false);
```

- Once near the **schema** section (~line **48**)
- Again at the start of the **data** section (~line **10067**)

With `search_path = ''`, unqualified names do **not** resolve to `public.*`.

### 3.2 Trigger function uses unqualified relation

```sql
-- fn_village_mandal_from_gp (≈1467)
IF NEW.gram_panchayat_id IS NOT NULL THEN
  SELECT mandal_id INTO gp_mandal
    FROM mst_gram_panchayats          -- NOT public.mst_gram_panchayats
   WHERE id = NEW.gram_panchayat_id;
```

### 3.3 Execution sequence that fails

1. Schema + trigger created (`trg_village_mandal` active).  
2. Data section sets `search_path` to **empty**.  
3. `INSERT INTO public.mst_villages ...` runs (schema-qualified INSERT — OK).  
4. `BEFORE INSERT` trigger runs `fn_village_mandal_from_gp`.  
5. Function looks up `mst_gram_panchayats` with **empty search_path**.  
6. PostgreSQL reports: **`relation "mst_gram_panchayats" does not exist`**  
   even though **`public.mst_gram_panchayats` exists**.

So the error message is about **name resolution**, not a missing CREATE TABLE.

---

## 4. Invoking INSERT / trigger chain

```text
INSERT INTO public.mst_villages (...)        -- line 10255+
  → trg_village_mandal (BEFORE INSERT)
    → fn_village_mandal_from_gp()
      → SELECT ... FROM mst_gram_panchayats   -- fails under search_path=''
```

No UPDATE is required; INSERT alone fires this trigger.

---

## 5. Minimum safe correction (preserve all objects)

**Do not reorder the 97 tables / 95 triggers / 25 functions / seeds / migration history.**  
CREATE order is already valid. Fix **session resolution** (and optionally seed-time trigger behavior).

### Recommended minimum (Option A) — before continuing / regenerating load

At the **start of the data section** (immediately after the second empty `search_path` set, ~10067), set:

```sql
SELECT pg_catalog.set_config('search_path', 'public', false);
-- or: SET search_path TO public;
```

That alone should allow unqualified names inside trigger functions during seed.

### Hardening for seed only (Option B — also recommended)

Disable user triggers on seeded masters that run validation during bulk load, then re-enable:

```sql
ALTER TABLE public.mst_villages DISABLE TRIGGER trg_village_mandal;
ALTER TABLE public.mst_facilities DISABLE TRIGGER trg_facility_location;
-- ... all mst_* INSERT blocks ...
ALTER TABLE public.mst_villages ENABLE TRIGGER trg_village_mandal;
ALTER TABLE public.mst_facilities ENABLE TRIGGER trg_facility_location;
```

Seed rows already contain consistent `mandal_id` / GP data from the dump; re-validation is unnecessary during bootstrap load.

### Permanent function hardening (Option C — best long-term)

For every trigger/SQL function that references `mst_*` / `tbl_*` without schema:

```sql
ALTER FUNCTION public.fn_village_mandal_from_gp() SET search_path = public;
ALTER FUNCTION public.fn_facility_location_check() SET search_path = public;
-- ... same for other trigger functions listed in §6 ...
```

Or rewrite bodies to `public.mst_gram_panchayats`, etc. Prefer `SET search_path = public` on the function to match secure dump practice.

---

## 6. Similar forward-reference / search_path risks

**Triggers on `mst_*` that can fire during this bootstrap’s seed:**

| Trigger | Table | Function | Seed risk |
|---------|-------|----------|-----------|
| `trg_village_mandal` | `mst_villages` | `fn_village_mandal_from_gp` | **HIT NOW** — unqualified `mst_gram_panchayats` |
| `trg_facility_location` | `mst_facilities` | `fn_facility_location_check` | **NEXT** — inserts at ~12779 with `mandal_id` / `village_id` set; unqualified `mst_mandals`, `mst_villages` |
| `trg_mst_diagnostic_tests_updated_at` | `mst_diagnostic_tests` | `fn_set_updated_at` | Low — **UPDATE** only; seed is INSERT |

**Other functions** also use unqualified `mst_*`/`tbl_*` (guards for clinical tables). They are not hit during **mst-only** seed, but will fail the same way under `search_path=''` once the app writes data unless functions get `SET search_path = public` or qualified names.

**Not a CREATE-order bug:** tables/functions/triggers are created before data. The class of bug is **empty search_path + unqualified identifiers in PL/pgSQL**.

---

## 7. Preservation requirements

| Requirement | Impact of proposed fix |
|-------------|------------------------|
| 97 tables | Unchanged |
| 95 triggers | Unchanged (disable/enable is temporary during load only if Option B used) |
| 25 functions | Unchanged bodies if using Option A/B; Option C only adds `SET search_path` |
| Seeds | Unchanged row content |
| Migration history (40 rows, no 033a) | Unchanged |

---

## 8. Proposed patch artifact (do not edit original in place)

See companion file:

`backend/schema/patches/AAROGYA_BOOTSTRAP_FINAL.searchpath_seed_guard.proposed.sql`

**How to use (after approval, operator-executed):**

1. Reset failed Render DB (empty / re-`DROP SCHEMA` via a controlled reload — bootstrap already drops `public`).  
2. Either:
   - **Preferred:** regenerate bootstrap later with `buildBootstrapSql.js` fix (`SET search_path TO public` before data + optional trigger disable), **or**
   - Apply a **derived** bootstrap copy that includes the patch lines (never silently overwrite without review).  
3. For a one-off: run schema portion, apply seed-guard SQL, run data portion — only if you split the file; simplest is a patched copy with two edits at ~10067 and before/after village/facility inserts.

### Minimal textual edits for a **copy** of the bootstrap (illustrative)

**Edit 1 — replace empty search_path in data preamble (~10067):**

```sql
-- FROM:
SELECT pg_catalog.set_config('search_path', '', false);
-- TO:
SELECT pg_catalog.set_config('search_path', 'public', false);
```

**Edit 2 — immediately before first `INSERT INTO public.mst_villages` (~10254):**

```sql
ALTER TABLE public.mst_villages DISABLE TRIGGER trg_village_mandal;
```

**Edit 3 — after last `mst_villages` INSERT block (before next major section / sequence setvals):**

```sql
ALTER TABLE public.mst_villages ENABLE TRIGGER trg_village_mandal;
```

**Edit 4 — before `INSERT INTO public.mst_facilities` (~12778):**

```sql
ALTER TABLE public.mst_facilities DISABLE TRIGGER trg_facility_location;
```

**Edit 5 — after facilities INSERT:**

```sql
ALTER TABLE public.mst_facilities ENABLE TRIGGER trg_facility_location;
```

Optional but strongly recommended: also change schema-section `search_path` (~48) to `'public'` **or** add `ALTER FUNCTION ... SET search_path = public` for all 25 app functions after they are created.

---

## 9. What not to do

- Do **not** assume `mst_gram_panchayats` CREATE is missing or must move after villages.  
- Do **not** delete the trigger or function.  
- Do **not** blind-apply migrations to “fix” this.  
- Do **not** touch local `Aarogya`.  
- Do **not** use `ALL_IN_ONE (1).sql`.

---

## 10. Verdict

| Item | Result |
|------|--------|
| Root cause | **PASS identified:** empty `search_path` + unqualified `mst_gram_panchayats` in `fn_village_mandal_from_gp`, fired by `trg_village_mandal` on `INSERT INTO public.mst_villages` |
| CREATE TABLE ordering | **PASS** — not the defect |
| Same class risk | **`trg_facility_location` / `fn_facility_location_check`** on later `mst_facilities` seed |
| Minimum fix | Set `search_path` to `public` for data load; optionally disable those two triggers during seed |
| Original file | **Unchanged** |
