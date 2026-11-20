# Initial master data & admin seed

## Files

| File | Purpose |
|------|---------|
| `AAROGYA_RENDER_MINIMAL_SEED.sql` | **Preferred for Render:** roles, permissions, grants, dropdown masters only — **no** geography/facilities/users |
| `AAROGYA_INITIAL_SEED.sql` | Full master seed including locations/facilities (heavier; not required for admin bootstrap) |
| `create-system-admin.js` | Creates one `SUPER_ADMIN` with **bcrypt cost 12** (same as API) |
| `exportRolePermissions.js` | Rebuild helper (read-only export from a fully migrated local DB) |
| `_role_permissions_export.json` | Cached role→permission matrix used when rebuilding the SQL |

## Order of operations (Render / empty schema DB)

1. Schema already loaded (your current state).
2. Load master data:

```bash
psql "YOUR_RENDER_EXTERNAL_DATABASE_URL" -f backend/database/seeds/AAROGYA_INITIAL_SEED.sql
```

3. Create admin (from `backend/`, with DB_* pointing at Render):

```bash
# PowerShell example — do not commit these values
$env:SYSTEM_ADMIN_USERNAME = "youradmin"
$env:SYSTEM_ADMIN_PASSWORD = "your-long-password"
$env:SYSTEM_ADMIN_EMAIL = "you@example.com"          # optional
$env:SYSTEM_ADMIN_FULL_NAME = "Aarogya Drishti Admin" # optional
node database/seeds/create-system-admin.js
```

4. Ensure `MFA_ENCRYPTION_KEY` (32-byte base64) is set on the API. First login enrolls MFA — no secret is seeded.

## Why SUPER_ADMIN (not SYSTEM_ADMIN)?

Migration `011_unify_admin_roles.sql` keeps `SYSTEM_ADMIN` in `mst_roles` but sets **`is_active = false`**. Platform ownership is **`SUPER_ADMIN`** (`mfa_required = true`). The Node helper matches `bootstrap.js` after migrations 001–043.

## Tables receiving seed data

- `mst_ai_models`
- `mst_appointment_statuses`
- `mst_consent_purposes`
- `mst_diagnostic_categories`
- `mst_diagnostic_tests`
- `mst_districts`
- `mst_exposure_types`
- `mst_facilities`
- `mst_followup_statuses`
- `mst_gram_panchayats`
- `mst_hospitals`
- `mst_investigation_statuses`
- `mst_investigation_types`
- `mst_languages`
- `mst_mandals`
- `mst_missed_reasons`
- `mst_notification_templates`
- `mst_permissions`
- `mst_phcs`
- `mst_protocol_rules`
- `mst_referral_priorities`
- `mst_roles`
- `mst_specialties`
- `mst_symptoms`
- `mst_ui_translations`
- `mst_villages`
- `tbl_role_permissions` (177 system-role grants)

## Not seeded (by design)

| Topic | Reason |
|-------|--------|
| `tbl_users` / passwords | Use `create-system-admin.js` (bcrypt); never fake hashes in SQL |
| MFA secrets | Enroll on first login |
| Patient / clinical `tbl_*` rows | Out of scope |
| Designations ASHA/ANM/CHO/OTHER | CHECK on `tbl_users.designation`, not a master table |
| `user_status`, `sex_type`, `facility_type` | PostgreSQL ENUMs in schema |
| Blood group / document-type masters | No such tables in schema |
| Screening “status” dropdown | Driven by enums / workflow, not `mst_*` |
| Local junk roles `AO_123`, `PO_123` | Excluded |

## Location data

Included from the verified local dump: Andhra Pradesh districts (incl. Alluri Sitharama Raju + Anakapalli), mandals, villages (LGD/manual), sample facilities/hospitals/PHCs. Do not invent extra villages outside this seed.

## Verification SQL

```sql
SELECT code, is_active, mfa_required FROM mst_roles ORDER BY id;
SELECT count(*) FROM mst_permissions;
SELECT count(*) FROM tbl_role_permissions;
SELECT count(*) FROM mst_languages;          -- expect 2 (en, te)
SELECT count(*) FROM mst_districts;
SELECT count(*) FROM mst_mandals;
SELECT count(*) FROM mst_villages;
SELECT u.username, r.code, u.status, u.mfa_enabled
  FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
 WHERE u.deleted_at IS NULL;
```

## Rebuild (maintainers)

```bash
cd backend
node database/seeds/exportRolePermissions.js
node scripts/buildInitialSeedSql.js
```
