# Aarogya Drishti — Fresh Render Deployment Checklist

**Scenario:** Brand-new Render account resources — **no** existing Postgres, **no** existing web services.  
**Baseline:** `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql`  
**Local DB:** `Aarogya` stays **untouched**  
**033a:** Remains unchanged and **ignored** by migrator  
**Type:** Checklist / runbook only — **do not execute from this chat**

**Date:** 2026-11-17

---

## Absolute rules (check every time)

- [ ] I will **never** point bootstrap/`psql` at local `Aarogya`
- [ ] I will load bootstrap only onto a **new empty** Render database
- [ ] I will **not** run `migrate --apply` for 001–043
- [ ] I will **not** run or rename migration `033a`
- [ ] I will map Postgres into `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` (not `DATABASE_URL` alone)
- [ ] I will not commit secrets or paste them into chat

---

## Phase 0 — Local pre-flight (Windows PowerShell)

### 0.1 Confirm local Aarogya is not the target

```powershell
# Read-only identity check against LOCAL only (optional sanity)
# Adjust path/user if your install differs — do NOT use these values for Render.
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d Aarogya -c "SELECT current_database();"
# Expect: Aarogya
# Then close this session. Do not run bootstrap against this database.
```

### 0.2 Confirm bootstrap file exists

```powershell
cd C:\Users\Public\Aarogya_Drishti
Test-Path .\backend\schema\AAROGYA_BOOTSTRAP_FINAL.sql
# Expect: True
```

### 0.3 Confirm 033a stays ignored (no file changes)

```powershell
Select-String -Path .\backend\utils\migrator.js -Pattern 'MIGRATION_FILE'
# Expect regex: /^\d{3}_[a-z0-9_]+\.(sql|js)$/
# 033a_... does not match — leave as-is
```

### 0.4 Generate production secrets (store in password manager; do not echo into tickets)

```powershell
# MFA + setup keys (32-byte Base64 each) — run twice for two different keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# AI shared token (>= 32 chars)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# JWT secret (>= 32 UTF-8 bytes)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Record offline:

| Secret | Generated? |
|--------|------------|
| `JWT_SECRET` | [ ] |
| `MFA_ENCRYPTION_KEY` | [ ] |
| `SETUP_TOKEN_ENCRYPTION_KEY` | [ ] |
| `AI_PIPELINE_AUTH_TOKEN` | [ ] |
| `SYSTEM_ADMIN_PASSWORD` | [ ] |
| Supabase service role | [ ] |
| Cloudflare auth token | [ ] |

### 0.5 External deps ready

- [ ] Supabase project URL  
- [ ] Private storage bucket name  
- [ ] Supabase **service_role** key (server only)  
- [ ] Cloudflare Account ID + Workers AI token  
- [ ] Git repo connected to Render (or ready to connect)  
- [ ] Deploy commit/tag chosen  

---

## Phase 1 — Exact PostgreSQL creation (Render Dashboard)

Create a **new** Render PostgreSQL instance.

| Setting | Recommended value |
|---------|-------------------|
| **Name** | e.g. `aarogya-drishti-db` (your choice) |
| **Database** | Accept Render-generated name **or** set explicitly — copy exact name into `DB_NAME` |
| **User** | Render-generated — copy into `DB_USER` |
| **Region** | Same region as web services |
| **Plan** | Per your SLA (enable backups if available) |
| **IP allow list** | Allow your operator IP for one-time `psql` bootstrap if using External URL |

After create, from Render **Info / Connections** copy:

| Render field | Paste into main web as |
|--------------|------------------------|
| Internal Database Host | `DB_HOST` |
| Port | `DB_PORT` (usually `5432`) |
| Database Name | `DB_NAME` |
| User | `DB_USER` |
| Password | `DB_PASSWORD` |

Also note **External Database URL** (operator bootstrap only). Prefer Internal host for the running app.

- [ ] Postgres created  
- [ ] Credentials stored securely  
- [ ] Confirmed this is **not** local `Aarogya`  

### 1.1 Prove Render DB is empty (PowerShell + psql)

Replace placeholders. Use **External** host for laptop `psql`.

```powershell
$env:PGPASSWORD = "<RENDER_DB_PASSWORD>"   # session only; clear after
$Psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
# Use External hostname from Render (not localhost)
& $Psql -h "<RENDER_EXTERNAL_HOST>" -p 5432 -U "<DB_USER>" -d "<DB_NAME>" `
  -c "SELECT current_database() AS db, current_user AS usr;" `
  -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
```

**Pass:** `db` is the Render name (not `Aarogya`), `table_count` is `0` (or only trivial/default — no app `mst_*`/`tbl_*`).

```powershell
Remove-Item Env:PGPASSWORD
```

---

## Phase 2 — Safe bootstrap initialization

### 2.1 Preconditions

- [ ] Phase 1 empty check passed  
- [ ] File is `AAROGYA_BOOTSTRAP_FINAL.sql` (not `ALL_IN_ONE (1).sql`)  
- [ ] Local `Aarogya` connection strings are **not** in this session  

### 2.2 Load bootstrap (PowerShell)

```powershell
cd C:\Users\Public\Aarogya_Drishti
$env:PGPASSWORD = "<RENDER_DB_PASSWORD>"
$Psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$Bootstrap = Join-Path $PWD "backend\schema\AAROGYA_BOOTSTRAP_FINAL.sql"

# Triple-check host is Render External, database is Render DB_NAME
& $Psql -h "<RENDER_EXTERNAL_HOST>" -p 5432 -U "<DB_USER>" -d "<DB_NAME>" `
  -v ON_ERROR_STOP=1 `
  -f $Bootstrap
```

**Expect:** Completes with `COMMIT` / no fatal error. File drops/recreates `public` — safe **only** because DB was empty.

```powershell
Remove-Item Env:PGPASSWORD
```

### 2.3 Verify bootstrap (PowerShell)

```powershell
$env:PGPASSWORD = "<RENDER_DB_PASSWORD>"
$Psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $Psql -h "<RENDER_EXTERNAL_HOST>" -p 5432 -U "<DB_USER>" -d "<DB_NAME>" -c @"
SELECT current_database();
SELECT count(*) AS tables FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expect ~97
SELECT count(*) AS migration_rows FROM schema_migrations;
-- Expect 40 (migrator-tracked; 033a NOT included — correct)
SELECT code, is_active, mfa_required FROM mst_roles
 WHERE code IN ('SUPER_ADMIN','SYSTEM_ADMIN') ORDER BY code;
"@
Remove-Item Env:PGPASSWORD
```

- [ ] ~97 tables  
- [ ] 40 `schema_migrations` rows (no 033a — **PASS**)  
- [ ] `SUPER_ADMIN` active + `mfa_required`  
- [ ] `SYSTEM_ADMIN` inactive  

### 2.4 Do **not** apply migrations

```powershell
# OPTIONAL status-only later from a machine with backend deps + DB_* env —
# NEVER add --apply on fresh bootstrap:
#   cd backend
#   npm run migrate
# Expect: up to date
```

- [ ] Confirmed: no `migrate --apply`  
- [ ] Confirmed: 033a ignored  

### 2.5 Optional logical backup of fresh schema (PowerShell)

```powershell
$env:PGPASSWORD = "<RENDER_DB_PASSWORD>"
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$Out = "C:\Users\Public\Aarogya_Drishti_backups\render_fresh_bootstrap_{0:yyyyMMdd_HHmm}.dump" -f (Get-Date)
New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null
& $PgDump -h "<RENDER_EXTERNAL_HOST>" -p 5432 -U "<DB_USER>" -d "<DB_NAME>" `
  --format=custom --file=$Out
Remove-Item Env:PGPASSWORD
Write-Host "Backup written (keep secure): $Out"
```

---

## Phase 3 — Supabase private storage

Dashboard (Supabase):

- [ ] Create/use project  
- [ ] Create **private** bucket (e.g. `aarogya-patient-images`)  
- [ ] Copy Project URL → `SUPABASE_URL`  
- [ ] Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`  
- [ ] Bucket name → `SUPABASE_STORAGE_BUCKET`  
- [ ] Confirm anon key is **not** used as service role on backend  

No Render service for Supabase.

---

## Phase 4 — Separate AI Pipeline service (create first)

| Field | Exact / recommended |
|-------|---------------------|
| **Service type** | Web Service |
| **Name** | e.g. `aarogya-aipipe` |
| **Runtime** | Docker |
| **Root directory / context** | `aipipe/aipipe` |
| **Dockerfile path** | `aipipe/aipipe/Dockerfile` (relative to that context) |
| **Build command** | *(Docker — automatic)* |
| **Start command** | Dockerfile default: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010}` |
| **Instance** | Prefer **Private** service |
| **Health check path** | `/health` |
| **Region** | Same as Postgres / main web |

### Environment variables (aipipe)

| Name | Required | Notes |
|------|----------|--------|
| `PORT` | Platform | Do not hardcode conflicting value |
| `AI_PIPELINE_AUTH_TOKEN` | **Yes** | Same value as main web; ≥ 32 chars |
| `CLOUDFLARE_ACCOUNT_ID` | **Yes** | |
| `CLOUDFLARE_AUTH_TOKEN` | **Yes** | Secret |
| `CLOUDFLARE_AI_MODEL` | Optional | |
| `CLOUDFLARE_AI_TIMEOUT_SECONDS` | Optional | |
| `UVICORN_RELOAD` | **Leave unset** | |

- [ ] Aipipe deployed  
- [ ] Health `/health` OK  
- [ ] Copy **Internal URL** for `AI_PIPELINE_URL` (e.g. `http://<service>.render.internal:<port>`)  

---

## Phase 5 — Main Web Service (React + Node API) — frontend included

**Frontend is not a separate Render service.** CRA is built into this service (Docker multi-stage).

| Field | Exact / recommended |
|-------|---------------------|
| **Service type** | Web Service (**Public**) |
| **Name** | e.g. `aarogya-drishti` |
| **Runtime** | Docker |
| **Root directory** | Repository **root** |
| **Dockerfile** | `./Dockerfile` |
| **Build command** | *(Docker builds frontend then backend)* |
| **Start command** | `npm start` → `node server.js` |
| **Health check path** | `/api/health` |
| **Region** | Same as DB |
| **Depends on** | Postgres (required); Aipipe + Supabase (clinical parity) |

### Alternative (Native Node — only if not using Docker)

| Field | Value |
|-------|--------|
| Root directory | `backend` |
| Build command | `npm run build:native` |
| Start command | `npm start` |
| Health | `/api/health` |

Requires monorepo checkout so `../frontend` exists.

### Frontend build configuration (Docker — already in Dockerfile)

| Build-time | Value |
|------------|--------|
| `REACT_APP_API_URL` | `/api` |
| Same-origin | Browser calls `/api` on this service |

No separate frontend env on Render runtime beyond `FRONTEND_URL` for CORS.

---

## Phase 6 — All required environment variable names (main web)

Paste into Render **Environment** for the main web service.

### 6.1 Required — boot + DB

```text
NODE_ENV=production
DB_HOST=<Render Internal Hostname>
DB_PORT=5432
DB_NAME=<Render Database Name>
DB_USER=<Render User>
DB_PASSWORD=<Render Password>
DB_SSL=require
JWT_SECRET=<generated, >=32 bytes>
```

`PORT` — leave to Render.  
`LISTEN_HOST` — omit (defaults `0.0.0.0`).

### 6.2 Required — MFA / CORS / setup / admin

```text
MFA_ENCRYPTION_KEY=<32-byte Base64>
SETUP_TOKEN_ENCRYPTION_KEY=<32-byte Base64>
FRONTEND_URL=https://<your-main-service>.onrender.com
TRUST_PROXY=1
SYSTEM_ADMIN_USERNAME=<chosen username>
SYSTEM_ADMIN_PASSWORD=<strong password>
```

Optional: `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_FULL_NAME`

### 6.3 Required — Supabase + AI

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_STORAGE_BUCKET=<private-bucket-name>
AI_PIPELINE_URL=http://<aipipe-private>.render.internal:<port>
AI_PIPELINE_AUTH_TOKEN=<same as aipipe, >=32 chars>
```

If aipipe is public HTTPS instead: `AI_PIPELINE_URL=https://<aipipe>.onrender.com`

### 6.4 Recommended

```text
PASSWORD_RESET_DELIVERY=none
VIDEO_PROVIDER=jitsi
JITSI_DOMAIN=meet.jit.si
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_HOURS=12
```

### 6.5 Optional SMTP (district invitations)

```text
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

### 6.6 Do **not** set on fresh production

```text
DATABASE_URL          # not used by runtime pool as sole config
TEST_DATABASE_URL
TEST_DB_ALLOW_DESTRUCTIVE_RESET
MIGRATE_APPROVE_003   # not needed on Path A fresh bootstrap
MIGRATION_TRUSTED_DATABASE_NAME  # not needed for normal boot
UVICORN_RELOAD
```

- [ ] All required vars set  
- [ ] `FRONTEND_URL` matches final public URL (update + redeploy if URL changes after first deploy)  
- [ ] AI token matches aipipe  

---

## Phase 7 — Deploy order (fresh)

1. [ ] Postgres created + empty verified  
2. [ ] Bootstrap loaded + verified (§2)  
3. [ ] Optional `pg_dump` backup (§2.5)  
4. [ ] Supabase private bucket ready (§3)  
5. [ ] Deploy **aipipe** → `/health` OK (§4)  
6. [ ] Set main web env (§6)  
7. [ ] Deploy **main web** Docker (§5)  
8. [ ] Confirm logs (§8)  
9. [ ] Health checks (§8)  
10. [ ] Post-deploy workflow tests (§10)  
11. [ ] SUPER_ADMIN MFA enroll; rotate bootstrap password  

---

## Phase 8 — Health checks

### 8.1 From PowerShell (after public URL exists)

```powershell
# Main API
Invoke-RestMethod -Uri "https://<main>.onrender.com/api/health" -Method GET

# Expect: success = True, database = Connected

# SPA root
Invoke-WebRequest -Uri "https://<main>.onrender.com/" -Method GET | Select-Object StatusCode

# Expect: 200
```

Aipipe private: use Render shell / logs / Dockerfile healthcheck — or temporary authenticated probe from main after deploy.

### 8.2 Render logs — main web

- [ ] `PostgreSQL connected successfully.`  
- [ ] `listening on 0.0.0.0:<port>`  
- [ ] `Serving frontend production build from …` (**not** “API only”)  
- [ ] Bootstrap account created or “exists … left unchanged”  

### 8.3 Dependency matrix

| Dependency | Check |
|------------|--------|
| Postgres | `/api/health` database Connected |
| SPA | `/` 200 + client route refresh works |
| Aipipe | `/health` + AI screening call |
| Supabase | Photo upload succeeds |

---

## Phase 9 — Backup and rollback (fresh)

### Backup

| When | Action |
|------|--------|
| After bootstrap | Custom `pg_dump` (§2.5) |
| Ongoing | Enable Render Postgres automatic backups |
| Before any future DDL | New `pg_dump` |

### Rollback

| Failure | Action |
|---------|--------|
| Bad main web build | Redeploy previous Render deploy |
| Bad env | Fix env → restart (no DB wipe) |
| Aipipe broken | Fix aipipe; API still serves non-AI paths |
| Supabase wrong | Fix trio; uploads 503 until fixed |
| Need empty DB reset | **Only** if still no real PHI: re-run bootstrap on **that** Render DB; restore from dump if data exists |
| Never | Point anything at local `Aarogya` to “fix” Render |

```powershell
# Example restore to Render (ONLY when intentionally recovering that Render DB)
# $env:PGPASSWORD = "<RENDER_DB_PASSWORD>"
# & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
#   -h "<RENDER_EXTERNAL_HOST>" -p 5432 -U "<DB_USER>" -d "<DB_NAME>" `
#   --clean --if-exists "C:\path\to\render_fresh_bootstrap_....dump"
```

---

## Phase 10 — Complete post-deployment workflow tests

### Platform

- [ ] `GET /api/health` → success + DB connected  
- [ ] `GET /` SPA loads  
- [ ] Client-side route refresh (SPA fallback)  
- [ ] Unknown `/api/...` → JSON 404  

### Auth / MFA / session

- [ ] Login as `SYSTEM_ADMIN_USERNAME` (SUPER_ADMIN role)  
- [ ] MFA QR enroll → verify  
- [ ] Access token refresh (Secure cookie)  
- [ ] Logout  
- [ ] Wrong-role API → 403  

### Healthcare workflows

- [ ] Registration path (if used in go-live)  
- [ ] Patient create / list  
- [ ] Consent  
- [ ] Screening + **photo upload** (Supabase)  
- [ ] Image category validation (aipipe)  
- [ ] Real-ESRGAN enhancement stored privately  
- [ ] AI assessment completes  
- [ ] Medical officer clinical review  
- [ ] Specialist decision / availability  
- [ ] Diagnostics order / updates  
- [ ] Navigator steps  
- [ ] Referral + hospital appointment  
- [ ] Video consultation link  
- [ ] Notification appears  
- [ ] Care plan / follow-up (revisit fields — **no 033a run**)  
- [ ] Audit log entry for login/MFA  

### Security negatives

- [ ] No Bearer → aipipe rejects  
- [ ] Bucket not publicly listable  
- [ ] Unauthenticated protected API → 401  

---

## Phase 11 — Final sign-off

| Item | Done |
|------|------|
| Local `Aarogya` untouched | [ ] |
| Fresh Render Postgres bootstrapped with `AAROGYA_BOOTSTRAP_FINAL.sql` | [ ] |
| No `migrate --apply` | [ ] |
| 033a ignored | [ ] |
| `DB_*` + `DB_SSL=require` | [ ] |
| Main web Docker (SPA + API) | [ ] |
| Separate aipipe + matching token | [ ] |
| Supabase private storage | [ ] |
| Health checks passed | [ ] |
| Workflow tests passed | [ ] |
| Backup retained | [ ] |

**Fresh deploy complete only when Phase 11 is fully checked.**

---

## Quick service cards

| # | Service | Type | Root / context | Build | Start | Health |
|---|---------|------|----------------|-------|-------|--------|
| 1 | Postgres | PostgreSQL | — | — | Managed | via `/api/health` |
| 2 | Aipipe | Web (private Docker) | `aipipe/aipipe` | Docker | uvicorn `0.0.0.0:$PORT` | `/health` |
| 3 | Main | Web (public Docker) | repo root `Dockerfile` | Docker (includes CRA) | `npm start` | `/api/health` |
| 4 | Supabase | External | — | — | — | upload smoke |

---

**No commands were executed. No source files modified. No Render connection made.**

**Awaiting your approval before any real deployment step.**
