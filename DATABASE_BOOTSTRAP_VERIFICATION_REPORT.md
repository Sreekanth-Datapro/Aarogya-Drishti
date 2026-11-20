# Aarogya Drishti — Bootstrap Final Verification Report

**Type:** READ-ONLY verification (no SQL executed against any database in this pass)  
**Date:** 2026-11-17  
**Inputs:**
- `DATABASE_COMPLETE_AUDIT_REPORT.md`
- `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql`
- Prior local inventory snapshot of database `Aarogya` (from earlier approved read-only audit)
- `backend/migrations/*` + `backend/utils/migrator.js` (filename regex / checksums)

**Not done:** schema changes, migration runs, Render connection, secret exposure, automatic fixes.

---

## 1. Executive verdict

| Question | Result |
|----------|--------|
| Do local DB tables match `AAROGYA_BOOTSTRAP_FINAL.sql`? | **PASS** — exact **97 = 97**, zero missing, zero extra |
| Can `AAROGYA_BOOTSTRAP_FINAL.sql` initialize an **empty** Postgres DB? | **PASS** (greenfield only) — `DROP SCHEMA public CASCADE` + full recreate + mst seed + 40 migration history rows |
| Is it safe on a DB with existing data? | **CONFLICT** — destructive wipe of `public` |
| Migration 001–043 compatibility with bootstrap file | **PASS** for migrator-tracked set (**40** files); checksums match disk |
| Migration `033a` recognition | **WARNING** — on disk + in local history; **not** in migrator regex; **not** recorded by bootstrap final |

**Overall:** `AAROGYA_BOOTSTRAP_FINAL.sql` is a valid one-shot empty-DB initializer aligned with the local migrated schema. Await approval before any remediation.

---

## 2. Table set verification (97 local vs bootstrap)

### 2.1 Counts

| Source | Tables |
|--------|-------:|
| Local `Aarogya` (prior audit) | **97** |
| `AAROGYA_BOOTSTRAP_FINAL.sql` `CREATE TABLE public.*` | **97** |
| Missing in bootstrap vs local | **0** |
| Extra in bootstrap vs local | **0** |

**Status: PASS** (`tableEqual: true`)

### 2.2 Classification (both sources)

| Class | Count |
|-------|------:|
| `mst_*` | 27 |
| `tbl_*` | 69 |
| `schema_migrations` | 1 |
| **Total** | **97** |

### 2.3 Full table list (identical in both)

`mst_ai_models`, `mst_appointment_statuses`, `mst_consent_purposes`, `mst_diagnostic_categories`, `mst_diagnostic_tests`, `mst_districts`, `mst_exposure_types`, `mst_facilities`, `mst_followup_statuses`, `mst_gram_panchayats`, `mst_hospitals`, `mst_investigation_statuses`, `mst_investigation_types`, `mst_languages`, `mst_mandals`, `mst_missed_reasons`, `mst_notification_templates`, `mst_permissions`, `mst_phcs`, `mst_protocol_rules`, `mst_referral_priorities`, `mst_roles`, `mst_screening_sites`, `mst_specialties`, `mst_symptoms`, `mst_ui_translations`, `mst_villages`, `schema_migrations`,  
`tbl_ai_assessment_logs`, `tbl_ai_assessments`, `tbl_appointment_status_history`, `tbl_audit_logs`, `tbl_care_discomfort_reports`, `tbl_care_final_reviews`, `tbl_care_followup_reports`, `tbl_care_followup_schedules`, `tbl_care_medicines`, `tbl_care_plan_status_history`, `tbl_care_plans`, `tbl_care_return_to_mo`, `tbl_case_assignments`, `tbl_case_classifications`, `tbl_case_escalations`, `tbl_clinical_review_versions`, `tbl_clinical_reviews`, `tbl_consultation_notes`, `tbl_consultation_slots`, `tbl_data_exports`, `tbl_demo_datasets`, `tbl_diagnostic_advice`, `tbl_diagnostic_advice_followups`, `tbl_diagnostic_appointment_history`, `tbl_diagnostic_appointments`, `tbl_diagnostic_order_items`, `tbl_diagnostic_order_reports`, `tbl_diagnostic_orders`, `tbl_diagnostic_status_history`, `tbl_district_admin_setup_tokens`, `tbl_followup_tasks`, `tbl_health_worker_location_assignments`, `tbl_hospital_appointments`, `tbl_image_quality_results`, `tbl_investigation_orders`, `tbl_investigation_status_history`, `tbl_location_import_batches`, `tbl_medical_officer_case_claims`, `tbl_medical_officer_mandal_assignments`, `tbl_notifications`, `tbl_offline_sync_queue`, `tbl_password_reset_tokens`, `tbl_pathology_reports`, `tbl_pathology_reviews`, `tbl_patient_consents`, `tbl_patient_contact_history`, `tbl_patient_duplicate_flags`, `tbl_patient_medical_histories`, `tbl_patients`, `tbl_referral_slips`, `tbl_referral_status_history`, `tbl_referrals`, `tbl_role_permissions`, `tbl_screening_findings`, `tbl_screening_photos`, `tbl_screenings`, `tbl_specialist_availability_requests`, `tbl_specialist_consultation_decisions`, `tbl_sync_conflicts`, `tbl_system_error_logs`, `tbl_transport_support_records`, `tbl_treatment_linkages`, `tbl_user_facility_assignments`, `tbl_user_language_preferences`, `tbl_user_registration_requests`, `tbl_user_sessions`, `tbl_users`, `tbl_video_consultations`, `tbl_video_join_tokens`

---

## 3. Missing and extra tables

| Direction | Result | Status |
|-----------|--------|--------|
| Local only | _(none)_ | **PASS** |
| Bootstrap only | _(none)_ | **PASS** |

---

## 4. Primary keys and foreign keys (bootstrap SQL)

Parsed from `AAROGYA_BOOTSTRAP_FINAL.sql` (not re-queried live in this pass):

| Constraint type | Count in bootstrap file | Status |
|-----------------|------------------------:|--------|
| `PRIMARY KEY` (`ADD CONSTRAINT … PRIMARY KEY`) | **97** | **PASS** — one PK statement per table |
| `FOREIGN KEY` (`ADD CONSTRAINT … FOREIGN KEY`) | **290** | **PASS** — dense relational graph present |

**Note:** Exact live FK/PK re-count was not re-executed (per “do not execute SQL”). Alignment is inferred from: bootstrap dump was generated from the migrated local DB, and table sets match exactly.

---

## 5. Functions and triggers

| Metric | Bootstrap file | Local prior audit | Status |
|--------|---------------:|------------------:|--------|
| `CREATE TRIGGER` statements | **95** | **95** (non-internal) | **PASS** |
| Unique `CREATE FUNCTION public.*` names | **25** | — | Application guards present |
| `pg_proc` count in `public` | — | **274** | **WARNING** — live count includes extension-provided functions (`btree_gist` / `pgcrypto` / related) beyond the 25 app `CREATE FUNCTION` statements |
| Views | **6** | **6** | **PASS** |
| ENUMs | **39** | **39** | **PASS** |
| Extensions declared | `btree_gist`, `pgcrypto` | same (+ `plpgsql` system) | **PASS** |

Application functions present in bootstrap include (among others):  
`fn_validate_registration_reviewer`, `fn_user_has_patient_access`, `fn_protect_signed_specialist_decision`, `fn_case_transition_allowed`, `fn_require_role`, `fn_require_consent`, care/HW/MO validators, video slot guards.

Two-stage reviewer: **`fn_validate_registration_reviewer` present** — **PASS**.

---

## 6. Master data and role permissions

| Item | Finding | Status |
|------|---------|--------|
| Master seed in bootstrap | File includes `mst_*` data from dump (`_mst_data` build path) | **PASS** for greenfield |
| Clinical `tbl_*` rows | Excluded by design (header L18) | **PASS** (intentional) |
| `mst_roles` seed | Includes `SYSTEM_ADMIN` (`mfa_required=true`, `is_active=false`) and `SUPER_ADMIN` (`mfa_required=true`, `is_active=true`) per `_mst_data.sql` / prior audit | **PASS** |
| `tbl_role_permissions` | Included in schema dump + seed path | **PASS** |
| Local custom roles (`AO_123`, `PO_123`) | Present in **local DB only**; not required for bootstrap product baseline | **WARNING** — local extras vs pristine bootstrap |

---

## 7. SUPER_ADMIN and MFA configuration

| Check | Bootstrap SQL | Local snapshot | Status |
|-------|---------------|----------------|--------|
| `SUPER_ADMIN` role | Present | active, `mfa_required=true` | **PASS** |
| `SYSTEM_ADMIN` role | Present | inactive, `mfa_required=true` | **PASS** (post-011 shape) |
| `tbl_users.mfa_enabled` | Present | Present | **PASS** |
| `tbl_users.mfa_secret_encrypted` | Present | Present | **PASS** |
| `tbl_users.mfa_enrolled_at` | Present | Present | **PASS** |
| `tbl_users.mfa_last_used_step` | Present | Present | **PASS** |
| `mst_roles.mfa_required` | Present | Present | **PASS** |
| Bootstrap creates admin **user** row | **No** (no passwords / PHI) | N/A | **PASS** — `bootstrap.js` / seed script creates first admin after load |

**Runtime still required after bootstrap load:** valid `MFA_ENCRYPTION_KEY` (32-byte Base64) for MFA-required roles to enroll/login — app-layer, not SQL.

---

## 8. Migration 001–043 compatibility

### 8.1 What bootstrap records

Footer comment: `Recorded 40 migration file(s).`  
Inserts cover migrator-tracked files **001–043 with gaps 014/016/019**, and **excluding `033a`**.

### 8.2 Checksums vs current migration files on disk

| Check | Result | Status |
|-------|--------|--------|
| Bootstrapped filenames ⊆ migrator list | Yes | **PASS** |
| Migrator-listed files missing from bootstrap history | **0** | **PASS** |
| SHA-256 mismatches (bootstrap vs disk bytes) | **0** | **PASS** |

### 8.3 Compatibility meaning

After loading bootstrap on an **empty** DB:

1. Schema already contains effects of migrations 001–043 (as dumped).  
2. `schema_migrations` marks the **40** migrator-visible files applied with matching checksums.  
3. `npm run migrate` (status) should report up to date for those files.  
4. Re-running `migrate --apply` should **not** re-execute those 40 files.

**Status: PASS** for greenfield bootstrap ↔ migrator alignment.

### 8.4 Local DB history divergence

| Item | Local | Bootstrap final | Status |
|------|------:|----------------:|--------|
| `schema_migrations` rows | **41** | **40** | **WARNING** |
| Includes `033a_…` | **Yes** | **No** | **WARNING** |

Local DB retained a recovery migration row that bootstrap intentionally omits (see §9). Schema objects still match.

---

## 9. Migration `033a` filename recognition

| Layer | Behavior | Status |
|-------|----------|--------|
| Disk file | `migrations/033a_care_followup_reassessment_recovery.sql` exists | Present |
| Migrator regex | `^\d{3}_[a-z0-9_]+\.(sql|js)$` | **Does not match** `033a_…` |
| `listMigrationFiles()` | Excludes `033a` | **WARNING** |
| `AAROGYA_BOOTSTRAP_FINAL` history | Does **not** insert `033a` | Aligned with migrator |
| Local `schema_migrations` | **Does** contain `033a` | Diverges from bootstrap/migrator |

**Interpretation:** `033a` is a **manual recovery** script. Bootstrap correctly ignores it for greenfield (effects already folded into schema via normal `033` + dump). Local history still shows it from an earlier recovery path — harmless for object inventory, noisy for history purity.

**No fix applied** (awaiting approval).

---

## 10. Can bootstrap safely initialize a completely empty database?

### 10.1 Designed load sequence (from file header)

```text
BEGIN;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
-- extensions, types, functions, tables, constraints, indexes, triggers, views
-- mst_* seed data
-- schema_migrations inserts (40 files)
COMMIT;
```

### 10.2 Safety matrix

| Condition | Safe? | Status |
|-----------|-------|--------|
| Brand-new empty database | **Yes** | **PASS** |
| Empty DB with only default `public` | **Yes** (drops/recreates `public`) | **PASS** |
| Database with existing app data / users | **No** — wipe | **CONFLICT** |
| Production Render with live data | **No** — must not use as in-place upgrade | **CONFLICT** |
| Partial prior failed load | **Yes** — drop cascade cleans leftovers | **PASS** |
| Requires clinical seed | No — masters only; admin via bootstrap/seed | **PASS** |
| Transaction wrapped | `BEGIN` … `COMMIT` | **PASS** |

### 10.3 Verdict on empty-DB initialization

**PASS — safe for completely empty / greenfield PostgreSQL databases**, provided:

1. Operator accepts `DROP SCHEMA public CASCADE`.  
2. Extensions `btree_gist` and `pgcrypto` can be created (superuser or allowed roles).  
3. After load: configure `DB_*`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, then start API / create first admin.  
4. Do **not** use this file to “repair” Render in place.

---

## 11. Cross-check vs `DATABASE_COMPLETE_AUDIT_REPORT.md`

| Prior finding | This verification |
|---------------|-------------------|
| Prefer BOOTSTRAP_FINAL for empty DB | **Confirmed PASS** |
| Local 97 tables | **Confirmed** equal to bootstrap |
| Blind migrate on bootstrap-loaded DB unsafe for non-idempotent files | Still true if history/checksums diverge; with matching 40 checksums, apply should no-op |
| `033a` migrator gap | **Confirmed WARNING** |
| ALL_IN_ONE incomplete | Unchanged — out of scope here |

---

## 12. Finding summary

| ID | Finding | Status |
|----|---------|--------|
| V1 | Table sets identical (97) | **PASS** |
| V2 | No missing/extra tables | **PASS** |
| V3 | 97 PKs + 290 FKs in bootstrap SQL | **PASS** |
| V4 | 95 triggers match local non-internal count | **PASS** |
| V5 | Function count 25 app DDL vs 274 `pg_proc` | **WARNING** (extension functions) |
| V6 | SUPER_ADMIN / MFA columns present | **PASS** |
| V7 | 40 migration checksums match disk | **PASS** |
| V8 | `033a` not migrator-listed / not in bootstrap history | **WARNING** |
| V9 | Local history has extra `033a` row | **WARNING** |
| V10 | Empty DB init via bootstrap | **PASS** |
| V11 | Existing/populated DB wipe risk | **CONFLICT** if misused |

---

## 13. Recommended actions (not executed)

Await approval. Suggested only:

1. Document BOOTSTRAP_FINAL as the **only** empty-DB initializer.  
2. Document `033a` as manual-recovery-only; optionally clean local history row later if desired.  
3. Never load BOOTSTRAP_FINAL against Render production data.  
4. Optional future: regenerate bootstrap after any migration change; re-verify checksum block.

---

**Awaiting your approval before any fixes or execution.**
