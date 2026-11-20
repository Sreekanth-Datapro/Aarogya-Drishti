# AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED — Validation Report

**Generated:** 2026-11-17T19:53:48.249Z  
**Original:** `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql` (unchanged)  
**Corrected copy:** `backend/schema/patches/AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED.sql`  
**Method:** File transform only — no Render connection, no SQL execution

---

## 1. Seed-time trigger audit

| Trigger | Table | Function | Fires on seed INSERT? | Action |
|---------|-------|----------|----------------------|--------|
| `trg_village_mandal` | `mst_villages` | `fn_village_mandal_from_gp` | **Yes** | Schema-qualify table refs |
| `trg_facility_location` | `mst_facilities` | `fn_facility_location_check` | **Yes** | Schema-qualify table refs |
| `trg_mst_diagnostic_tests_updated_at` | `mst_diagnostic_tests` | `fn_set_updated_at` | No (UPDATE-only) | No change (no table refs) |

Only **mst_*** tables receive seed INSERT/UPDATE in this bootstrap data section. No other `mst_*` INSERT triggers exist.

---

## 2. Changed lines (every edit)

### `fn_village_mandal_from_gp` (starts near original line 1467)

| Approx file line | Before | After |
|------------------|--------|-------|
| ~1473 (body L6) | `SELECT mandal_id INTO gp_mandal FROM mst_gram_panchayats WHERE id = NEW.gram_panchayat_id;` | `SELECT mandal_id INTO gp_mandal FROM public.mst_gram_panchayats WHERE id = NEW.gram_panchayat_id;` |

**Why:** Under `search_path = ''` (preserved), unqualified `mst_gram_panchayats` fails at trigger runtime. Prefix `public.` resolves the relation without changing business logic.

### `fn_facility_location_check` (starts near original line 763)

| Approx file line | Before | After |
|------------------|--------|-------|
| ~777 (body L14) | `SELECT district_id INTO mandal_district FROM mst_mandals WHERE id = NEW.mandal_id;` | `SELECT district_id INTO mandal_district FROM public.mst_mandals WHERE id = NEW.mandal_id;` |
| ~787 (body L24) | `SELECT mandal_id INTO village_mandal FROM mst_villages WHERE id = NEW.village_id;` | `SELECT mandal_id INTO village_mandal FROM public.mst_villages WHERE id = NEW.village_id;` |

**Why:** Under `search_path = ''` (preserved), unqualified `mst_mandals / mst_villages` fails at trigger runtime. Prefix `public.` resolves the relation without changing business logic.


---

## 3. What was intentionally NOT changed

- Empty `search_path` settings preserved (2 occurrence(s))
- No `SET search_path TO public` added (0 public sets)
- Triggers not disabled
- Table DDL, seed rows, roles, migration history, other 23 functions unchanged
- Business logic (IF conditions, exceptions, assignments) unchanged

---

## 4. Object count comparison

| Metric | Original | Fixed | Match |
|--------|---------:|------:|:-----:|
| CREATE TABLE | 97 | 97 | PASS |
| CREATE TRIGGER | 95 | 95 | PASS |
| CREATE FUNCTION | 25 | 25 | PASS |
| schema_migrations seed VALUES | 40 | 40 | PASS |
| Empty search_path sets | 2 | 2 | PASS |

Expected: **97** tables, **95** triggers, **25** functions.

---

## 5. Post-fix unqualified-ref audit (seed-time functions)

| Function | Remaining unqualified app tables | Status |
|----------|----------------------------------|--------|
| `fn_village_mandal_from_gp` | _(none)_ | PASS |
| `fn_facility_location_check` | _(none)_ | PASS |
| `fn_set_updated_at` | _(none)_ | PASS |

---

## 6. Syntax / structural checks (static)

| Check | Result |
|-------|--------|
| BEGIN present | PASS |
| COMMIT present | PASS |
| DROP SCHEMA preserved | PASS |
| Village fn uses `public.mst_gram_panchayats` | PASS |
| Facility fn uses `public.mst_mandals` | PASS |
| Facility fn uses `public.mst_villages` | PASS |
| Original still has unqualified village lookup | PASS (baseline) |
| Fixed removed unqualified village lookup | PASS |
| Village fn `$$` pair balance | PASS |
| Facility fn `$$` pair balance | PASS |
| Structural metrics aligned | PASS |

**Note:** Full PostgreSQL parse was not run (no DB execution per requirements). Static structure checks only.

---

## 7. File hashes

| File | SHA-256 | Bytes |
|------|---------|------:|
| Original | `4e8eb71fb184dbf0bc01c90e116beaa6bdeca4296ffee057583aed2aa62d3cef` | 732605 |
| Fixed copy | `9f7a071be86ac1ac842b3bf24e736a7cea97e4bbb41340086e4688c52e8a23a8` | 732626 |

Hashes differ only due to the qualified table names in the two function bodies.

---

## 8. Overall verdict

**PASS** — Corrected copy ready for operator review before Render load.

---

## 9. Operator next step (not executed here)

After approval, load **only** the fixed copy against empty Render DB `aarogya_1q77`:

```powershell
# Use External host; never local Aarogya
# psql ... -f backend\schema\patches\AAROGYA_BOOTSTRAP_FINAL_RENDER_FIXED.sql
```
