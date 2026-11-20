# Migration 033a — Remediation Plan

**Type:** READ-ONLY plan (no code/SQL/DB/deploy changes applied)  
**Date:** 2026-11-17  
**Inputs:** `033a_care_followup_reassessment_recovery.sql`, `033_care_followup_reassessment.sql`, `migrator.js`, prior DB audits, `AAROGYA_BOOTSTRAP_FINAL.sql`, `FINAL_PRE_DEPLOYMENT_REPORT.md`  
**Not found:** `ALL_IN_ONE_COMPLETE.sql` (does not exist in repo). Closest: `backend/ALL_IN_ONE (1).sql` (older baseline; not used for 033a conclusions).

---

## 1. Executive recommendation

| Question | Answer |
|----------|--------|
| Is 033a a deploy blocker for greenfield Render? | **No** |
| Are 033a schema effects already in bootstrap / local schema dumps? | **Yes** |
| Should the migrator regex be widened before Render go-live? | **No (not recommended)** |
| Preferred remediation | **Document as manual recovery only** + optional archive/move out of `migrations/` **after approval** |
| If history purity is desired later | Add **history-only** / **baseline** recognition — do not re-execute DDL blindly |

**Verdict:** Leave 033a ignored by the migrator for production. Schema parity is already achieved via `033` + dump/`AAROGYA_BOOTSTRAP_FINAL.sql`. Changing the regex without baseline guards is the higher-risk path.

---

## 2. Why 033a is ignored

**File:** `backend/migrations/033a_care_followup_reassessment_recovery.sql`

**Migrator filter** (`backend/utils/migrator.js`):

```js
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.(sql|js)$/;
```

| Filename | Matches regex? |
|----------|----------------|
| `033_care_followup_reassessment.sql` | **Yes** (`033_` + rest) |
| `033a_care_followup_reassessment_recovery.sql` | **No** — after `033` the next character is `a`, not `_` |

`listMigrationFiles()` therefore never returns 033a. Status/apply loops never see it as pending or applied, regardless of `schema_migrations` rows.

**Intent of the file (header):** recovery for a **partially applied** `033`, not a normal forward migration. It explicitly says not to re-run full 033, and documents a **two-step** commit order for enum `ADD VALUE`.

---

## 3. What 033a changes (SQL inventory)

| Object | Change |
|--------|--------|
| Enum `care_final_decision` | Add label `URGENT_ESCALATION` if missing |
| `tbl_care_plans` | `hospital_revisit_date`, `patient_informed`, `hospital_revisit_scheduled`, `hospital_attended` |
| Constraint | `ck_care_plan_revisit_dates` if missing |
| `tbl_care_followup_reports` | `improvement_noted`, `side_effects`, `hospital_attended`, `hospital_revisit_reminded` |
| Index | `idx_care_plans_revisit_date` (partial) |
| Explicitly omitted | `uq_care_followup_active_plan` (assumes already exists) |

These are the same additive effects as `033_care_followup_reassessment.sql`, minus the unique index (033a skips it).

**Disk checksum (SHA-256 of current 033a file bytes):**  
`3f2780b94e6fe7a1b1b60978d2bb6ec4d5a0a8c28c1f83de03094c4180de6115`  
(for future history-only / baseline matching — not executed in this pass)

---

## 4. Are changes already in the local DB?

| Evidence | Result | Status |
|----------|--------|--------|
| Prior audit: local `schema_migrations` includes `033a_…` | Row present (41 files) | History says recovery was recorded |
| `AAROGYA_LOCAL_SCHEMA.sql` dump | Contains `URGENT_ESCALATION`, revisit columns, `ck_care_plan_revisit_dates`, `idx_care_plans_revisit_date`, `uq_care_followup_active_plan` | **PASS** — objects present in local schema artifact |
| Live re-query this pass | **Not run** (no SQL execution per task) | Objects inferred from dump + prior audits |

**Conclusion:** Local schema **already contains** 033a’s DDL effects (via completed 033 and/or 033a recovery). Re-applying 033a would be a no-op for those objects if idempotent clauses hold.

---

## 5. Are changes included in `AAROGYA_BOOTSTRAP_FINAL.sql`?

| 033a effect | In bootstrap CREATE/INDEX? |
|-------------|----------------------------|
| `URGENT_ESCALATION` on `care_final_decision` | **Yes** |
| Care plan revisit columns + `hospital_attended` | **Yes** |
| `ck_care_plan_revisit_dates` | **Yes** |
| Follow-up report columns | **Yes** |
| `idx_care_plans_revisit_date` | **Yes** |
| `uq_care_followup_active_plan` (from 033, not 033a) | **Yes** |

**`schema_migrations` inserts in bootstrap:** records **`033_care_followup_reassessment.sql`** only — **does not** insert `033a_…`.

| Layer | 033a |
|-------|------|
| Schema objects | **Included** (folded into dump) |
| Migration history row | **Not included** |

Greenfield bootstrap DBs are schema-complete for care revisit features **without** ever running 033a.

---

## 6. Is the migration checksum tracked?

| Location | Tracked? |
|----------|----------|
| Migrator apply list / status | **No** — file filtered out |
| `AAROGYA_BOOTSTRAP_FINAL` history inserts | **No** |
| Local `schema_migrations` (prior audit) | **Yes** — orphan relative to migrator (row exists; migrator never validates it) |
| Migrator checksum compare for 033a | **Never** — not in `listMigrationFiles()` |

So: local may have a history row, but the runner does **not** checksum-guard 033a. Changing the file on disk would not produce a migrator `modified` state for 033a.

---

## 7. What happens if 033a runs again?

### 7.1 Manual `psql` re-run (current supported path)

| Step | Behavior |
|------|----------|
| Enum already present | `DO` block no-ops |
| Columns already present | `ADD COLUMN IF NOT EXISTS` no-ops |
| Constraint exists | `DO` block no-ops |
| Index exists | `CREATE INDEX IF NOT EXISTS` no-ops |
| Data | Additive; header claims preserve rows |

**Mostly safe** if schema already complete. Still follow header: enum step may need its own commit on older clients; Step 2 should not assume uncommitted enum use (033a Step 2 does not reference the new label, so single-script run is usually OK on modern PostgreSQL).

### 7.2 If migrator were taught to apply it (hypothetical)

Migrator wraps SQL in **one** `BEGIN` … `COMMIT` and strips lone `BEGIN`/`COMMIT` lines via `stripTransactionControl`. Risks:

1. **Enum + same-transaction policy:** 033a header requires commit between steps for general safety; Step 2 does not *use* the new enum value, so PG 12+ often accepts single-transaction `ADD VALUE`. Still a footgun if the script is later edited to use the label in Step 2.  
2. **Idempotent re-apply on bootstrap:** After greenfield load, objects exist → DDL no-ops → then `INSERT INTO schema_migrations` for 033a → **OK** if no PK conflict.  
3. **Local DB already has history row:** If regex expanded and checksum matches → state `applied`, skip. If checksum differs → `modified` → can **block** bootstrap/startup paths that refuse modified migrations.  
4. **Duplicate execution of full 033:** 033a warns not to re-run full 033; migrator would not re-run 033 if already recorded. Risk is operator confusion, not automatic double 033.

---

## 8. Is changing the filename regex safe?

**Proposed naive change (NOT recommended without guards):**

```js
// current
/^\d{3}_[a-z0-9_]+\.(sql|js)$/

// unsafe widening examples
/^\d{3}[a-z]?_[a-z0-9_]+\.(sql|js)$/
/^\d{3}[a-z]*_[a-z0-9_]+\.(sql|js)$/
```

| Risk | Detail |
|------|--------|
| Suddenly pending | Any DB whose history lacks 033a (including **bootstrap greenfield**) shows 033a as **pending** |
| Accidental apply | `migrate --apply` would execute recovery SQL in migrator’s single transaction |
| Orphan / modified | Local history checksum may mismatch if file edited → startup/bootstrap refusal |
| Sort order | Lexicographic: `033_…` then `033a_…` (OK relative to 033). Still sits between 033 and 034 |
| Future lettered migrations | Widening invites `033b`, `034a`, etc. without a clear policy |
| Tests | `listMigrationFiles()` count assertions may break |

**Conclusion:** Widening the regex alone is **not safe** for Render go-live. Safe only if paired with baseline/history-only behavior (see §10).

---

## 9. How to prevent duplicate migration execution

Already true today for normal migrator flow:

1. **Filename gate** — 033a never enters pending list.  
2. **For 033** — `schema_migrations.filename` PK + checksum; applied once.  
3. **Idempotent DDL** — 033/033a use `IF NOT EXISTS` for columns/indexes/constraints/enum.  
4. **Bootstrap** — records 033 as applied; does not need 033a.

Additional protections (proposed, not applied):

| Guard | Purpose |
|-------|---------|
| Keep 033a out of migrator list | Strongest anti-duplicate for automated runs |
| Move to `migrations/manual/` or `migrations/recovery/` | Operators won’t confuse it with numbered chain |
| If ever tracked: `BASELINE_CHECKS["033a_…"]` | Record history without re-running DDL when objects exist |
| Never re-run full `033` after partial recovery | Already documented in 033a header |

---

## 10. Remediation options (for approval)

### Option A — Document only (recommended for deploy now)

**Actions after approval:** none required for Render greenfield.

- Treat 033a as **manual recovery**.  
- Greenfield: load `AAROGYA_BOOTSTRAP_FINAL.sql`; ignore 033a.  
- Existing DBs that already have objects: do nothing.  
- Existing DBs missing revisit columns but with 033 marked applied: run 033a **manually** via `psql` (two-step if needed), optional history insert.

**Risks:** Local history noise (41 vs bootstrap 40) remains.  
**Code changes:** none.

---

### Option B — Archive / relocate file (cleanup; low risk)

**Proposed (after approval only):**

1. Move  
   `backend/migrations/033a_care_followup_reassessment_recovery.sql`  
   → `backend/migrations/manual/033a_care_followup_reassessment_recovery.sql`  
   (or `backend/database/recovery/`).  
2. Add short `README.md` in that folder: manual-only; not scanned by migrator.  
3. Optionally leave a one-line stub comment file — **prefer no stub inside `migrations/`** that matches regex.

**Risks:** Operators with bookmarks to old path; local `schema_migrations` still names old filename (harmless orphan).  
**Do not** expand regex.

---

### Option C — History-only recognition without executing DDL (optional purity)

**Goal:** Greenfield bootstrap and migrator status agree that 033a is “accounted for” without running it.

**Proposed code change (illustrative — not applied):**

```js
// migrator.js — either keep regex unchanged and add an explicit allowlist:
const MANUAL_RECOVERY_BASELINES = {
  "033a_care_followup_reassessment_recovery.sql": `
    SELECT
      EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'care_final_decision'
          AND e.enumlabel = 'URGENT_ESCALATION'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tbl_care_plans'
          AND column_name = 'hospital_revisit_date'
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_care_plan_revisit_dates'
      )
      AND EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'idx_care_plans_revisit_date'
      ) AS ok`,
};
```

Plus status reporting that shows recovery baselines separately from `listMigrationFiles()`.

**And/or** add to bootstrap footer (SQL regeneration, not hand-edit lightly):

```sql
INSERT INTO public.schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES (
  '033a_care_followup_reassessment_recovery.sql',
  '3f2780b94e6fe7a1b1b60978d2bb6ec4d5a0a8c28c1f83de03094c4180de6115',
  'bootstrap_final',
  0
);
```

**Risks:** Bootstrap rebuild process must stay in sync; checksum must match file bytes forever; still should **not** auto-execute 033a in the single-transaction migrator without a dedicated multi-step runner.

---

### Option D — Expand regex + rename to normal number (highest process cost)

**Example rename:**  
`033a_…` → `044_care_followup_reassessment_recovery.sql`  
(only if 044 is free — verify current max is 043)

**Also required:**

1. Add `BASELINE_CHECKS` so bootstrap DBs record without re-apply.  
2. Local: insert/rename history carefully (manual SQL; not done here).  
3. Unit tests for file list / ordering.  
4. Do **not** re-run full 033.

**Risks:** Highest. Can make 033a (as 044) pending on Render after bootstrap if baseline missing → migrator applies recovery SQL. Usually idempotent, but unnecessary and transaction/enum fragile.

**Not recommended before first production cut.**

---

### Option E — Widen regex in place (rejected)

```js
const MIGRATION_FILE = /^\d{3}[a-z]?_[a-z0-9_]+\.(sql|js)$/;
```

**Rejected for go-live** unless Option C baseline is implemented in the same change set and tests cover “bootstrap → 033a baselines, does not execute.”

---

## 11. Exact proposed code changes (if Option C later approved)

### 11.1 Minimal documentation-only (Option A)

No code. Optional comment at top of 033a already exists; could add pointer in `backend/migrations/README` **if** such a README is approved later.

### 11.2 Option B move (filesystem only)

```text
git mv backend/migrations/033a_care_followup_reassessment_recovery.sql \
       backend/migrations/manual/033a_care_followup_reassessment_recovery.sql
```

Create `backend/migrations/manual/README.md` stating: not matched by `MIGRATION_FILE`; run only for partial-033 recovery.

### 11.3 Option C baseline snippet (reference)

In `migrator.js`, extend apply loop similarly to existing `BASELINE_CHECKS` **only if** 033a is deliberately listed (explicit array or widened regex). Preferred: **explicit filename allowlist**, not open `[a-z]?` regex.

```js
// Pseudocode — awaiting approval before implementation
if (RECOVERY_BASELINES[migration.file]) {
  const check = await client.query(RECOVERY_BASELINES[migration.file]);
  if (check.rows[0]?.ok) {
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, applied_by)
       VALUES ($1, $2, 'baseline')
       ON CONFLICT (filename) DO NOTHING`,
      [migration.file, migration.checksum]
    );
    // do not execute SQL
    continue;
  }
  // else: refuse auto-apply OR require --apply-recovery flag
}
```

**Risk if auto-apply when baseline fails:** re-introduces enum/transaction issues; better fail closed and point operator to manual `psql`.

---

## 12. Risks summary

| Action | Risk level | Notes |
|--------|------------|-------|
| Do nothing (Option A) | **Low** | Greenfield OK; FINAL report WARNING remains documentary |
| Archive to `manual/` (B) | **Low** | Cleanup; update operator docs |
| History-only / baseline (C) | **Medium** | Code + bootstrap regen discipline |
| Rename to 044 (D) | **Medium–High** | History remapping on local/Render |
| Widen regex alone (E) | **High** | Pending recovery on every bootstrap DB |

---

## 13. Alignment with `FINAL_PRE_DEPLOYMENT_REPORT.md`

| Final report statement | This plan |
|------------------------|-----------|
| 033a **WARNING**; ignore for greenfield | **Confirmed** |
| Bootstrap omits 033a history | **Confirmed** |
| Effects folded into schema | **Confirmed** via bootstrap object grep |
| No deploy blocker | **Confirmed** |

---

## 14. Recommended decision for approval

1. **Approve Option A** for immediate Render path (no code change).  
2. Optionally **approve Option B** as a follow-up cleanup PR (move file + README).  
3. Defer Options C–E until after production cut unless history purity is mandatory.  
4. Do **not** execute 033a, alter `schema_migrations`, or widen the regex as part of deploy prep.

---

**No files, SQL, database, `.env`, or Render settings were modified. No migrations were executed.**

**Awaiting your approval before any remediation implementation.**
