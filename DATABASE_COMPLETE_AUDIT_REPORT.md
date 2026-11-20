# Aarogya Drishti — Complete Database Schema & Migration Audit

**Audit type:** READ-ONLY  
**Date:** 2026-11-17  
**Project path:** `C:\Users\Public\Aarogya_Drishti`  
**Backend path:** `C:\Users\Public\Aarogya_Drishti\backend`  

**Rules followed:** No schema changes, no migration execution, no drops/alters, no secret exposure.  
**Local DB inspected:** `Aarogya` on `localhost` only (identity verified via `current_database()`). Render / production was **not** connected.

---

## 1. Executive summary

| Area | Status | Summary |
|------|--------|---------|
| Local DB object counts | **PASS** | 97 tables, 6 views, 274 functions, 324 indexes; aligns with your reported inventory (trigger count method differs — see §2). |
| `ALL_IN_ONE (1).sql` completeness | **WARNING** | Valid **baseline v3** (71 tables). **Not** the full current schema. Missing ~25 tables and post-002 roles/workflows added by migrations 002–043. |
| Migrations vs DB | **PASS** (local) | Local `schema_migrations` lists **41** files (001–043 incl. `033a`). Table set matches `AAROGYA_BOOTSTRAP_FINAL` + live DB. |
| `ALL_IN_ONE` vs live DB | **MISSING** (expected) | 25+ objects exist only via migrations / bootstrap final — not a defect if migrations or `AAROGYA_BOOTSTRAP_FINAL.sql` were used. |
| Fresh empty DB init | **PASS** with preferred path | Use `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql` for empty DB. Do **not** treat `ALL_IN_ONE (1).sql` alone as production-complete. |
| Blind `migrate --apply` on bootstrap-loaded DB | **CONFLICT / WARNING** | Several migrations are non-idempotent (004, 007, 013, 022, 023, …). Migrator baselines only **001, 002, 022**. |
| Roles / MFA | **PASS** (local) | `SUPER_ADMIN` active + `mfa_required=true`. `SYSTEM_ADMIN` present but `is_active=false` (expected after 011). |
| Two-stage registration | **NEEDS VERIFICATION** on Render | Local history includes `015`. Re-applying `011` on a two-stage DB is unsafe. |
| Production Render readiness | **WARNING** | Render previously had bootstrap schema + only 001/002 applied; 003-only promote is the safe admin fix. Do **not** roll 004–043 blindly. |

**Bottom line:** The live local database is a coherent, migration-complete schema. `ALL_IN_ONE (1).sql` is an older baseline, not the full product schema. The authoritative one-shot empty-DB artifact is `AAROGYA_BOOTSTRAP_FINAL.sql`.

---

## 2. Actual database object counts

### 2.1 Verified local connection (`Aarogya`)

| Item | Value |
|------|-------|
| `current_database()` | `Aarogya` |
| `current_user` | `postgres` |
| `current_schema()` | `public` |
| PostgreSQL | 18.6 (Windows) |

### 2.2 Counts

| Object | Your report | This audit (local) | Notes |
|--------|-------------|--------------------|-------|
| Tables | 97 | **97** | **PASS** |
| Views | 6 | **6** | **PASS** |
| Functions | 274 | **274** | **PASS** (all `public` procs) |
| Triggers | 151 | **95** | **WARNING** — audit counted `NOT tgisinternal` only; 151 likely includes internal/RI triggers |
| Indexes | 324 | **324** | **PASS** |
| ENUMs | — | **39** | ALL_IN_ONE has 34; +5 care enums from 026/033 |
| Extensions | — | `btree_gist`, `pgcrypto`, `plpgsql` | **PASS** |

### 2.3 Table classification (local)

| Class | Count |
|-------|------:|
| `mst_*` | 27 |
| `tbl_*` | 69 |
| `schema_migrations` | 1 |
| **Total** | **97** |

---

## 3–6. Table inventories

### 3. Complete table inventory (live `Aarogya` = source of truth)

See live list in audit run (all 97 names). Matches `AAROGYA_BOOTSTRAP_FINAL.sql` CREATE TABLE set (plus tracking table).

### 4. Master tables (`mst_*`) — 27

`mst_ai_models`, `mst_appointment_statuses`, `mst_consent_purposes`, `mst_diagnostic_categories`, `mst_diagnostic_tests`, `mst_districts`, `mst_exposure_types`, `mst_facilities`, `mst_followup_statuses`, `mst_gram_panchayats`, `mst_hospitals`, `mst_investigation_statuses`, `mst_investigation_types`, `mst_languages`, `mst_mandals`, `mst_missed_reasons`, `mst_notification_templates`, `mst_permissions`, `mst_phcs`, `mst_protocol_rules`, `mst_referral_priorities`, `mst_roles`, `mst_screening_sites`, `mst_specialties`, `mst_symptoms`, `mst_ui_translations`, `mst_villages`

**vs ALL_IN_ONE:** ALL_IN_ONE has **25** masters. **MISSING** from ALL_IN_ONE only: `mst_diagnostic_categories`, `mst_diagnostic_tests` (migration 029).

### 5. Application tables (`tbl_*`) — 69

All clinical/auth/care/diagnostic/video/offline tables listed in §2 inventory JSON. Notable migration-only tables (not in ALL_IN_ONE):

| Table | Introduced by |
|-------|----------------|
| `tbl_password_reset_tokens` | 002 |
| `tbl_location_import_batches` | 004 |
| `tbl_district_admin_setup_tokens` | 009 |
| `tbl_health_worker_location_assignments` | 013 |
| `tbl_medical_officer_mandal_assignments` | 013 |
| `tbl_medical_officer_case_claims` | 013 |
| `tbl_specialist_availability_requests` | 023 |
| `tbl_care_*` (7 tables) | 026 |
| `tbl_diagnostic_*` (orders/items/history/appointments/reports/advice…) | 029–043 |
| `tbl_care_return_to_mo` | 037 |

**Note:** `tbl_specialist_consultation_decisions` exists in **both** ALL_IN_ONE (L1308) and migration 022 — bootstrap + 022 dual definition → **CONFLICT** risk if 022 re-applied without baseline.

### 6. Migration table inventory

| Item | Status |
|------|--------|
| `public.schema_migrations` | Present |
| Local recorded files | **41** (includes `033a_care_followup_reassessment_recovery.sql`) |
| Migrator disk regex | `^\d{3}_[a-z0-9_]+\.(sql|js)$` — **`033a` does not match** → **WARNING**: history row exists but file is not in migrator’s normal apply list |

Number gaps (no files): **014, 016, 019** — intentional absences, not failures.

---

## 7. ALL_IN_ONE schema inventory

**File:** `backend/ALL_IN_ONE (1).sql` (119,147 bytes)  
**Header:** “complete PostgreSQL schema v3”

| Object | Count | Line refs (representative) |
|--------|------:|----------------------------|
| Extensions | 2 | L8–9 `btree_gist`, `pgcrypto` |
| ENUMs | 34 | L16–55 |
| Sequences | 3 | L12–14 |
| Functions | 16 | L60–248, L1368, L1681 |
| Tables | 71 | L331–1661 |
| Triggers | 57 | e.g. L619–1647 |
| Views | 6 | L1704–1806 |
| Role seed | yes | L1835+ (`SYSTEM_ADMIN`, no `SUPER_ADMIN`) |
| MFA columns | yes | `mst_roles.mfa_required`; `tbl_users.mfa_enabled`, `mfa_secret_encrypted` |
| `schema_migrations` | **none** | **MISSING** |
| `SUPER_ADMIN` | **none** | Added in **002** |
| Consent append-only | yes | `tbl_patient_consents` + triggers |
| Audit append-only | yes | `tbl_audit_logs` + block-mutation pattern |

**Verdict:** **WARNING** — solid baseline for early product; **not** equivalent to current migrated schema.

---

## 8. Migration-by-migration summary

Full detail was produced in the read-only migration audit. Condensed risk matrix:

| Migration | Idempotent? | Bootstrap / ALL_IN_ONE risk | Severity |
|-----------|-------------|-----------------------------|----------|
| 001 | Partial | Baselined if constraints present | Low if baselined |
| **002** | Mostly | Recreates reviewer trigger to admin path; blocked if two-stage present | **CONFLICT** if re-run after 015 |
| **003** | Soft no-op | Gated promote SYSTEM_ADMIN→SUPER_ADMIN | Controlled |
| **004** | No (bare CHECKs) | Fails if LGD constraints exist | **CONFLICT** |
| 005 | No | View rewrite fails if already fixed | **WARNING** |
| 006–010 | Mixed | Some bare ADD CONSTRAINT | **WARNING** |
| **011** | Partial | Deactivates SYSTEM_ADMIN; hard-coded role ids 7/8; MO reviewer (later replaced by 015) | **CONFLICT** |
| 012 | Yes | Low | PASS |
| **013** | No | Bare CREATE TABLE | **CONFLICT** |
| **015** | Mixed | Final two-stage reviewer | Protect on Render |
| 017–021 | Mostly | Low | PASS |
| **022** | No | Table already in ALL_IN_ONE; **baselined** | Must baseline, not re-apply |
| **023** | No | Bare CREATE | **CONFLICT** if present |
| 024–025 | Partial | Alters 022 checks | **WARNING** |
| 026–043 | Mostly IF NOT EXISTS | Later modules | Generally safer |
| **033a** | Yes | Manual recovery; **not** in migrator file list | **WARNING** |

`BASELINE_CHECKS` in `utils/migrator.js`: **001, 002, 022 only**.

---

## 9. Database vs SQL comparison

### Sources

| Source | Role |
|--------|------|
| A. `ALL_IN_ONE (1).sql` | Hand baseline v3 (71 tables) |
| B. `migrations/*` (41 files) | Incremental evolution |
| C. Live local `Aarogya` | Migrated DB (97 tables) |
| D. `schema/AAROGYA_BOOTSTRAP_FINAL.sql` | Regenerated full schema + mst seed + migration history |

### 9.1 Tables in ALL_IN_ONE but missing in DB

**None** (all 71 baseline tables exist locally). **PASS**

### 9.2 Tables in DB but missing in ALL_IN_ONE

**~25 tables** (listed in §5) — intentionally added by migrations. **PASS** (not unnecessary)

### 9.3 Tables created by migrations only

Same set as §5. **PASS**

### 9.4 Duplicate definitions

| Finding | Status |
|---------|--------|
| `tbl_specialist_consultation_decisions` in ALL_IN_ONE **and** 022 | **CONFLICT** if 022 re-applied |
| Multiple dumps: `AAROGYA_LOCAL_SCHEMA.sql`, `_schema_only.sql`, `AAROGYA_BOOTSTRAP_FINAL.sql`, large `AAROGYA_*_DATA*.sql` | **WARNING** — duplicates/archives; prefer BOOTSTRAP_FINAL for empty DB |
| Filename `ALL_IN_ONE (1).sql` vs docs saying `ALL_IN_ONE.sql` | **WARNING** naming drift |

### 9.5 ENUMs

| Source | Count |
|--------|------:|
| ALL_IN_ONE | 34 |
| Live DB | 39 |
| Delta | care_* enums (+ `PENDING_SETUP` on `user_status`, facility enum values) |

**PASS** — expected evolution.

### 9.6–9.14 Columns / FKs / indexes / triggers / functions

| Check | Status |
|-------|--------|
| Live DB vs BOOTSTRAP_FINAL table set | **PASS** (aligned) |
| Column-level every-table diff ALL_IN_ONE→DB | **NEEDS VERIFICATION** — not fully line-diffed in this pass; migrations add many columns (LGD, MFA replay, diagnostics, care, etc.) |
| FK graph for core clinical path | **PASS** (present in schema; healthcare modules covered) |
| Missing indexes vs ALL_IN_ONE | Migrations add many; live index count 324 |
| Duplicate indexes | **NEEDS VERIFICATION** (no automatic duplicate-name scan completed) |
| Trigger count method | **WARNING** (95 vs 151) |
| Function count | **PASS** (274); ALL_IN_ONE only ships 16 — rest from migrations / bootstrap |

### 9.15 Migration history

| Finding | Status |
|---------|--------|
| Local has 41 recorded migrations | **PASS** for local completeness |
| Includes `033a` while migrator regex skips it | **WARNING** |
| Filenames alone ≠ successful apply on Render | **NEEDS VERIFICATION** for Render (known: 001/002 applied, 003+ pending historically) |

### 9.16 Seed / roles (local)

| Role | mfa_required | is_active | Status |
|------|--------------|-----------|--------|
| SUPER_ADMIN | true | true | **PASS** |
| SYSTEM_ADMIN | true | **false** | **PASS** (post-011) |
| DISTRICT_ADMIN | true | true | **PASS** |
| MEDICAL_OFFICER | true | true | **PASS** |
| SPECIALIST | true | true | **PASS** |
| HEALTH_WORKER | false | true | **PASS** |
| NAVIGATOR | false | true | **PASS** |
| HOSPITAL_STAFF | false | true | **PASS** |
| Custom `AO_123`, `PO_123` | — | mixed | **WARNING** — local custom roles present |

---

## 10. Foreign-key / relationship findings

**PASS** for core healthcare graph in current schema:

- Users → roles; facility/mandal assignments → geography masters  
- Patients → villages/mandals/facilities; consents append-only  
- Screenings → patients/photos/AI/reviews  
- Referrals → appointments / video / investigations  
- Specialist decisions + availability requests  
- Care plans → medicines / follow-ups / return-to-MO  
- Diagnostics → orders / appointments / advice / reports  

**WARNING:** Exact FK inventory vs ALL_IN_ONE was not exhaustively dumped; use `AAROGYA_BOOTSTRAP_FINAL.sql` / live catalog as authority.

---

## 11. Functions and triggers analysis

| Topic | Finding | Status |
|-------|---------|--------|
| ALL_IN_ONE function set | 16 guards (consent, review, referral, AI, video, classification, access) | Baseline **PASS** |
| Live function count | 274 | Evolved **PASS** |
| Registration reviewer evolution | 002 admin path → 011 MO path → **015 two-stage** | **CONFLICT** if 002/011 re-run |
| Specialist signed decision protection | Present (ALL_IN_ONE + 022) | **PASS** |
| Consent / audit append-only | `fn_block_mutation` pattern | **PASS** |

---

## 12. Role and MFA verification

| Check | Status |
|-------|--------|
| SUPER_ADMIN seeded by 002 | **PASS** |
| MFA columns on users + role `mfa_required` | **PASS** |
| MFA enroll/verify APIs | **PASS** (app layer; prior audit) |
| Login requires `r.is_active = TRUE` | **PASS** — inactive SYSTEM_ADMIN cannot login |
| After 003 promote (Render path) | User becomes SUPER_ADMIN; enroll MFA if not enabled | **PASS** (app design) |

---

## 13. Healthcare workflow coverage

| Module | DB support | Status |
|--------|------------|--------|
| 1. Auth + MFA | users, sessions, password reset, MFA cols | **PASS** |
| 2. Registration / approval | registration requests + 015 two-stage | **PASS** (local) |
| 3. District / mandal / village | mst_* + LGD cols (004) | **PASS** |
| 4. Facilities | mst_facilities + 007 | **PASS** |
| 5. Patients | tbl_patients + access fns | **PASS** |
| 6. Consent | tbl_patient_consents append-only | **PASS** |
| 7. Screening + photos | screenings / photos / quality | **PASS** |
| 8. AI assessment logs | assessments + logs | **PASS** |
| 9. Clinical review / sign-off | reviews + versions | **PASS** |
| 10. Case assignments | tbl_case_assignments + MO claims | **PASS** |
| 11. Specialist availability | tbl_specialist_availability_requests | **PASS** |
| 12. Specialist decisions | tbl_specialist_consultation_decisions | **PASS** |
| 13. Hospital appointments | appointments + history | **PASS** |
| 14. Diagnostics | full diagnostic_* suite | **PASS** |
| 15. Referrals | referrals + slips + history | **PASS** |
| 16. Care plans / follow-ups | care_* suite | **PASS** |
| 17. Video consultations | video + tokens + slots | **PASS** |
| 18. Notifications | notifications + templates | **PASS** |
| 19. Offline sync | offline_sync_queue + conflicts | **PASS** |
| 20. Audit / exports | audit_logs + data_exports | **PASS** |

---

## 14. Missing objects (relative to full product)

| Relative to | Missing | Status |
|-------------|---------|--------|
| ALL_IN_ONE → full product | ~25 tables, SUPER_ADMIN, many fns/triggers, care/diagnostic enums | **MISSING** in ALL_IN_ONE (expected) |
| Live DB → product | None identified at table level | **PASS** |
| Migrator apply list → `033a` | File on disk + in history, not regex-listed | **WARNING** |

---

## 15. Duplicate objects

| Item | Status |
|------|--------|
| Multiple full SQL dumps in `backend/` | **WARNING** |
| 022 table also in ALL_IN_ONE | **CONFLICT** on re-apply |
| `AAROGYA_RENDER_DATA*.sql` ≈ 4.4MB siblings | **WARNING** — archive hygiene |

---

## 16. Conflicting definitions

| Conflict | Status |
|----------|--------|
| 002 reviewer trigger vs 015 two-stage | **CONFLICT** |
| 011 MO-only reviewer vs 015 DA finalize | **CONFLICT** (015 wins if applied later) |
| 022 baseline CHECK vs 024 dropping video consultation CHECK | **WARNING** |
| 038 strips SYSTEM_ADMIN `role.manage`; 040 re-grants if active | **WARNING** (intentional sequence) |
| ALL_IN_ONE as “complete” vs BOOTSTRAP_FINAL as true complete | **CONFLICT** in documentation messaging |

---

## 17. Migration history problems

| Issue | Status |
|-------|--------|
| Local history complete (41) | **PASS** |
| `033a` recorded but not migrator-listed | **WARNING** |
| Render historically pending 003–043 while schema mostly present | **WARNING** — baselining gaps; 004+ unsafe blind apply |
| Checksums sensitive to CRLF/LF | **WARNING** (prior ops finding) |

---

## 18. Production deployment readiness

### Preferred empty-database path

1. Create empty Postgres DB.  
2. Load **`backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql`** (drops/recreates `public`, loads full schema + mst seed + `schema_migrations`).  
3. Configure `DB_*` (no secrets in git).  
4. Set valid `MFA_ENCRYPTION_KEY` (32-byte Base64).  
5. Start API; let `bootstrap.js` create first admin **or** use seed script.  
6. `npm run migrate` should report up to date (status only).

**Status:** **PASS** for this path.

### Unsafe / incomplete paths

| Path | Status |
|------|--------|
| Load only `ALL_IN_ONE (1).sql` then expect full app | **MISSING** modules |
| Load ALL_IN_ONE then blind `migrate --apply` through 043 | **CONFLICT** (004/013/022/023/011…) |
| On Render bootstrap DB: dual-approve without `--only-003-promote-bootstrap` | **CONFLICT** (runs 004+) |
| Re-run 011 on two-stage registration DB | **CONFLICT** |

### Render (existing) — reminder only

- Safe admin restore: **only-003** mode after code deploy (prior design).  
- Do **not** apply 004–043 without a dedicated compatibility plan.  
- **011 must not run** on two-stage DBs.

---

## 19. Recommended safe correction plan (no automatic fixes)

**Do nothing destructive without explicit approval.** Suggested order when you choose to act:

1. **Treat `AAROGYA_BOOTSTRAP_FINAL.sql` as the canonical empty-DB baseline** in docs/runbooks; demote `ALL_IN_ONE (1).sql` to “legacy baseline v3 / historical”.  
2. **Keep ALL_IN_ONE unmodified** unless you intentionally regenerate a new baseline.  
3. **Local DB (`Aarogya`):** no schema fix required for table coverage — **PASS**. Optionally reconcile trigger-count methodology.  
4. **Migrator:** decide policy for `033a` (document as manual-only, or rename to `033b_…` / fold into 033 — only after approval).  
5. **Render:** continue **only-003** for SUPER_ADMIN login; do not roll forward migrations until a written compatibility matrix for 004+.  
6. **Hygiene:** archive or `.gitignore` large duplicate data dumps if not needed in repo (approval required).  
7. **Optional deep pass (future):** automated column/FK/index diff ALL_IN_ONE ↔ BOOTSTRAP_FINAL ↔ live DB.

---

## Appendix A — Project discovery (Phase 1)

| Item | Location |
|------|----------|
| ALL_IN_ONE | `backend/ALL_IN_ONE (1).sql` |
| Migrations | `backend/migrations/` (41 files) |
| Migrator | `backend/utils/migrator.js`, `backend/scripts/migrate.js` |
| npm scripts | `migrate`, `migrate:apply`, `seed:admin` |
| Bootstrap final | `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql` |
| Schema README | `backend/schema/README.md` |
| Seeds | `backend/database/seeds/` |
| Config (non-secret) | `.env.example` → `DB_HOST=localhost`, `DB_NAME=Aarogya` |
| Duplicate dumps | `AAROGYA_LOCAL_SCHEMA.sql`, `AAROGYA_*_DATA*.sql`, `schema/_schema_only.sql`, `schema/_mst_data.sql` |

## Appendix B — Finding legend used in this report

- **PASS** — verified OK  
- **WARNING** — attention / ops risk, not necessarily broken  
- **MISSING** — absent from a named source  
- **CONFLICT** — incompatible re-apply / dual definition  
- **NEEDS VERIFICATION** — not fully proven in this read-only pass  

---

## Appendix C — What was not done (by design)

- No migration execution  
- No DDL/DML changes  
- No Render / production connection  
- No secret printing  
- No automatic fixes  

---

**Awaiting your approval before any remediation work.**
