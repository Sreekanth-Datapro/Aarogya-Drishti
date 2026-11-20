# Aarogya Drishti — Render Deployment Execution Plan (Runbook)

**Type:** READ-ONLY planning  
**Date:** 2026-11-17  
**Sources:** `FINAL_PRE_DEPLOYMENT_REPORT.md`, `RENDER_ENVIRONMENT_CHECKLIST.md`, `LOCAL_TO_RENDER_READINESS_REPORT.md`, `DATABASE_COMPLETE_AUDIT_REPORT.md`, `DATABASE_BOOTSTRAP_VERIFICATION_REPORT.md`, `MIGRATION_033A_REMEDIATION_PLAN.md`, root/`aipipe` Dockerfiles, `backend/package.json`, `backend/schema/README.md`

**Constraints for this document:** No Render connection; no code/SQL/.env changes; no deploy; no migrations executed; local `Aarogya` DB untouched.

---

## 0. Non-negotiable safety rules

| Rule | Why |
|------|-----|
| **Never** run `AAROGYA_BOOTSTRAP_FINAL.sql` on a populated DB | Contains `DROP SCHEMA public CASCADE` |
| **Never** blind `migrate --apply` for 001–043 on Render | Non-idempotent / conflict risk (esp. after bootstrap or partial history) |
| **Keep 033a ignored** | Manual recovery only; effects already in bootstrap schema (`MIGRATION_033A_REMEDIATION_PLAN.md` Option A) |
| **Do not use `DATABASE_URL` alone** | Runtime pool reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| **Do not touch local `Aarogya`** | Production work uses Render Postgres only |
| **Preserve local functionality** | Same-origin SPA + API, MFA, roles, Supabase, AI, workflows — configure env; do not redesign |
| **Secrets never in chat / git** | Generate locally; paste only into Render dashboard |

---

## 1. Target architecture

```text
Browser (HTTPS)
    │
    ▼
┌─────────────────────────────────────┐
│  Main Web Service (public)          │
│  React SPA + Express /api           │
│  Health: GET /api/health            │
└──────────────┬──────────────────────┘
               │ DB_* + SSL
               ▼
        Render PostgreSQL
               │
Main Web ──────┼── AI_PIPELINE_URL + Bearer token
               ▼
┌─────────────────────────────────────┐
│  Aipipe Web Service (prefer private)│
│  FastAPI + Cloudflare Workers AI    │
│  Health: GET /health                │
└─────────────────────────────────────┘

Main Web ── service role ──► Supabase private Storage bucket
```

**No separate frontend Render service.**  
**Local `Aarogya` remains offline reference only.**

---

## 2. Choose path A or B first

| Path | When | DB init |
|------|------|---------|
| **A. New empty Render database** | Fresh Postgres; want full schema parity with local | Load `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql` **once** on empty DB |
| **B. Existing populated Render database** | DB already has schema/users/data | **Forbidden:** bootstrap wipe. Status-only migrate; only-003 if needed; **no** 004–043 blind apply |

Confirm which path applies **before** any SQL. If unsure, treat as **B**.

---

## 3. Pre-flight checklist (operator)

- [ ] Git commit/tag of code to deploy identified  
- [ ] Path **A** or **B** decided  
- [ ] Local `Aarogya` will not be targeted by any `psql`  
- [ ] Supabase project + **private** bucket ready  
- [ ] Cloudflare Workers AI credentials ready (aipipe)  
- [ ] Secrets generated (JWT ≥32 bytes; MFA/setup keys = 32-byte Base64; AI token ≥32 chars)  
- [ ] Backup plan understood (§10)  
- [ ] Rollback plan understood (§11)  
- [ ] 033a left ignored  

---

## 4. Service definitions

### 4.1 Render PostgreSQL

| Field | Value |
|-------|--------|
| **Service type** | Render PostgreSQL |
| **Root directory** | N/A |
| **Build command** | N/A |
| **Start command** | Managed by Render |
| **Environment variables** | N/A on DB itself — copy Internal connection fields into main web `DB_*` |
| **Health check path** | N/A (use `psql` / main `/api/health`) |
| **Dependencies** | None |

**Map credentials (exact names the app expects):**

| Render Postgres field | Main web env var |
|-----------------------|------------------|
| Internal Hostname | `DB_HOST` |
| Port | `DB_PORT` (usually `5432`) |
| Database | `DB_NAME` |
| User | `DB_USER` |
| Password | `DB_PASSWORD` |
| — | `DB_SSL=require` |

Do **not** rely on Render’s `DATABASE_URL` for the Node pool.

---

### 4.2 Main Web Service (React + Node.js API)

| Field | Recommended (Docker) | Alternative (Native Node) |
|-------|----------------------|---------------------------|
| **Service type** | Web Service | Web Service |
| **Root directory** | Repository root (Docker context) | `backend` |
| **Dockerfile** | `./Dockerfile` (repo root) | — |
| **Build command** | *(Docker build — no separate npm build)* | `npm run build:native` |
| **Start command** | `npm start` → `node server.js` | `npm start` → `node server.js` |
| **Health check path** | `/api/health` | `/api/health` |
| **Dependencies** | PostgreSQL; Aipipe (for AI); Supabase (for photos) | Same |

**Docker notes:** Multi-stage builds CRA with `REACT_APP_API_URL=/api`, copies to `/app/frontend/build`, clears local `storage/`.  
**Native notes:** `build:native` needs sibling `../frontend` in the checkout.

#### Main web — environment variables

**Required for boot**

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | Leave to Render |
| `DB_HOST` | Internal hostname |
| `DB_PORT` | Usually `5432` |
| `DB_NAME` | Exact DB name |
| `DB_USER` | Postgres user |
| `DB_PASSWORD` | Secret |
| `DB_SSL` | `require` |
| `JWT_SECRET` | ≥ 32 bytes; stable |

**Required for MFA / CORS / setup / clinical parity**

| Variable | Notes |
|----------|--------|
| `MFA_ENCRYPTION_KEY` | 32-byte Base64; **never rotate casually** |
| `SETUP_TOKEN_ENCRYPTION_KEY` | 32-byte Base64 |
| `FRONTEND_URL` | Exact public HTTPS origin, e.g. `https://<main>.onrender.com` |
| `SUPABASE_URL` | `https://….supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret; server only |
| `SUPABASE_STORAGE_BUCKET` | Private bucket name |
| `AI_PIPELINE_URL` | Private `http://…render.internal:PORT` or HTTPS aipipe URL |
| `AI_PIPELINE_AUTH_TOKEN` | **Identical** to aipipe; ≥ 32 chars |
| `SYSTEM_ADMIN_USERNAME` | Path A first admin |
| `SYSTEM_ADMIN_PASSWORD` | Secret; rotate after MFA enroll |

**Recommended**

| Variable | Notes |
|----------|--------|
| `TRUST_PROXY` | `1` |
| `PASSWORD_RESET_DELIVERY` | `none` (prod default) |
| `VIDEO_PROVIDER` | `jitsi` |
| `JITSI_DOMAIN` | `meet.jit.si` |
| `SMTP_*` | If district invitations needed |

**Optional**

`LISTEN_HOST` (default `0.0.0.0`), `JWT_EXPIRES_IN`, `REFRESH_TOKEN_TTL_HOURS`, `FRONTEND_BUILD_PATH`, AI timeouts, `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_FULL_NAME`

**Temporary (Path B only-003 — unset after)**

`MIGRATION_TRUSTED_DATABASE_NAME`, `MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP`

**Do not set:** `TEST_*`, `DATABASE_URL` as sole DB config, `UVICORN_RELOAD`

---

### 4.3 AI Pipeline Service (separate)

| Field | Value |
|-------|--------|
| **Service type** | Web Service (Docker) — prefer **Private** |
| **Root directory / Docker context** | `aipipe/aipipe` |
| **Dockerfile** | `aipipe/aipipe/Dockerfile` |
| **Build command** | Docker build from that context |
| **Start command** | `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010}` (Dockerfile `CMD`) |
| **Health check path** | `/health` |
| **Dependencies** | Cloudflare Workers AI; shared token with main web |

#### Aipipe — environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `PORT` | Platform | Injected |
| `AI_PIPELINE_AUTH_TOKEN` | **Yes** | Same as main web; ≥ 32 chars |
| `CLOUDFLARE_ACCOUNT_ID` | **Yes** (real vision) | |
| `CLOUDFLARE_AUTH_TOKEN` | **Yes** (secret) | |
| `CLOUDFLARE_AI_MODEL` | Optional | Default in `.env.example` |
| `CLOUDFLARE_AI_TIMEOUT_SECONDS` | Optional | Default `120` |
| `UVICORN_RELOAD` | **Unset** | |

After deploy, copy **Internal URL** into main web `AI_PIPELINE_URL` (HTTP to `*.render.internal` is allowed by app URL policy).

---

### 4.4 Supabase Private Storage (external)

| Field | Value |
|-------|--------|
| **Service type** | Supabase project (not Render) |
| **Root / build / start** | N/A |
| **Configuration** | Private bucket; service role key only on main web |
| **Health check** | Successful screening photo upload/download via API |
| **Dependencies** | Main web env trio |

| Variable on main web | Purpose |
|----------------------|---------|
| `SUPABASE_URL` | Project URL (HTTPS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side access |
| `SUPABASE_STORAGE_BUCKET` | Private bucket |

Bucket must be **private**. Never put service role in `REACT_APP_*`.

---

## 5. Path A — New empty Render database (runbook)

### A1. Provision Postgres

1. Create Render PostgreSQL.  
2. Note Internal host, port, database, user, password.  
3. Confirm DB is empty (no app tables).

### A2. Initialize schema (operator machine → Render DB only)

```bash
# WARNING: destructive to public schema — EMPTY DB ONLY
psql "host=INTERNAL_OR_EXTERNAL_HOST port=5432 dbname=DB_NAME user=DB_USER sslmode=require" \
  -f backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql
```

**Do not** use `ALL_IN_ONE (1).sql` as complete schema.  
**Do not** run against local `Aarogya`.  
**Do not** run `migrate --apply`.

### A3. Status-only migrate check (optional)

From a machine with `DB_*` pointed at Render (or Render shell):

```bash
cd backend
npm run migrate
# expect: up to date for migrator-tracked files
```

**Ignore 033a** (not in migrator list; schema already includes effects).

### A4. Deploy aipipe → then main web

Follow §7 order. Set `SYSTEM_ADMIN_*` so `bootstrap.js` can create first SUPER_ADMIN if none exists.

### A5. Post-deploy

§9 health + §12 workflow tests. Enroll MFA. Rotate bootstrap password.

---

## 6. Path B — Existing populated Render database (runbook)

### B1. Absolute bans

- [ ] **No** `AAROGYA_BOOTSTRAP_FINAL.sql`  
- [ ] **No** `DROP SCHEMA public CASCADE`  
- [ ] **No** blind `migrate --apply` for 004–043  
- [ ] **No** changes to local `Aarogya`

### B2. Read-only discovery (operator)

Run **SELECT-only** on Render DB (examples — do not modify):

```sql
SELECT current_database(), current_user;
SELECT filename, applied_at, applied_by
  FROM schema_migrations
 ORDER BY filename;
SELECT code, is_active, mfa_required FROM mst_roles
 WHERE code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');
```

Decide:

| Finding | Action |
|---------|--------|
| Schema incomplete vs product | **Stop** — written recovery plan required (out of scope of blind apply) |
| Admin stuck as inactive SYSTEM_ADMIN / needs SUPER_ADMIN | Use **only-003** dual-approval procedure (prior migrator work); unset approval env after |
| Migrations 004+ pending | Leave pending until explicit compatibility plan |
| Care revisit objects missing but 033 applied | Manual 033a via `psql` only if needed — not via migrator |

### B3. Backup before any write

§10 — full logical dump before only-003 or any DDL.

### B4. Deploy code + env

Deploy aipipe + main web with correct `DB_*` / secrets / Supabase / AI. Do not auto-migrate on start (app does not apply migrations on boot; only bootstrap admin check).

### B5. Post-deploy

§9 + §12. Confirm existing users/sessions policy (JWT secret change invalidates tokens; MFA key change breaks authenticators — reuse production keys if already enrolled).

---

## 7. Deployment order (both paths)

```text
1. PostgreSQL ready
2. Path A init OR Path B discovery + backup
3. Supabase private bucket + keys ready
4. Deploy Aipipe (private) → verify GET /health
5. Set Main Web env (DB_*, SSL, JWT, MFA, FRONTEND_URL, Supabase, AI_PIPELINE_*)
6. Deploy Main Web → verify logs + GET /api/health
7. Align FRONTEND_URL with final public URL (redeploy if URL changed)
8. Smoke tests (§9) then full workflow tests (§12)
9. MFA enroll SUPER_ADMIN; unset MIGRATE_APPROVE_003 if used
```

**Dependency rule:** Main web may boot without aipipe/Supabase, but AI and photo workflows will 503 until those are configured.

---

## 8. Secret generation (operator local — do not paste values here)

```bash
# JWT_SECRET — ensure UTF-8 byte length >= 32
# MFA_ENCRYPTION_KEY / SETUP_TOKEN_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# AI_PIPELINE_AUTH_TOKEN: random string length >= 32 (same on both services)
```

Store in a password manager. Set once; keep MFA key stable.

---

## 9. Health checks and dependency verification

| Check | How | Pass criteria |
|-------|-----|----------------|
| Postgres | Main boot log / `/api/health` | `database: "Connected"` |
| Main web | `GET https://<main>/api/health` | `success: true` |
| SPA | `GET https://<main>/` | HTML shell; assets load |
| SPA routing | Refresh a client route | Not JSON 404; not broken API |
| Aipipe | `GET …/health` (internal or private) | Healthy response |
| Token match | Trigger AI analysis | Not auth failure |
| Supabase | Upload screening photo | Not `IMAGE_STORAGE_UNAVAILABLE` |
| CORS | Browser Network on login | No origin errors; `FRONTEND_URL` exact |
| Cookies | DevTools | `ad_refresh` HttpOnly + Secure on HTTPS |

**Startup logs to confirm:**

- `PostgreSQL connected successfully.`  
- `Aarogya Drishti API listening on 0.0.0.0:<port>`  
- `Serving frontend production build from …` (not “API only”)

---

## 10. Backup procedures

### Before Path A load

Optional empty-DB snapshot not critical; still record Render Postgres connection identity.

### Before Path B any write / only-003

```bash
# From operator machine — Render External URL with SSL
pg_dump "host=... port=5432 dbname=... user=... sslmode=require" \
  --format=custom --file=aarogya_render_prechange_YYYYMMDD.dump
```

Store dump offline securely (contains PHI if present).

### Ongoing

- Enable Render Postgres backups / PITR per plan.  
- Do not back up secrets into git.  
- Supabase: rely on Supabase retention; do not copy PHI to laptop unnecessarily.

### Local Aarogya

No action required for Render deploy; optionally take a local dump for disaster recovery of **dev** only — never restore local dump over Render without an explicit migration plan.

---

## 11. Rollback procedures

| Failure | Rollback |
|---------|----------|
| Main web bad deploy | Redeploy previous Render deploy / image tag |
| Wrong env var | Fix env; restart service (no DB wipe) |
| Aipipe down | Fix aipipe; main web stays up (AI degraded) |
| Supabase misconfig | Fix env; photos fail closed (503) — no DB rollback needed |
| Path A bootstrap mistake on **wrong** DB | If empty intended DB: may re-run bootstrap; if **populated** mistaken wipe: restore from §10 dump immediately |
| Path B only-003 / DDL issue | Restore from `pg_dump` custom file: `pg_restore …` into recovered instance; point `DB_*` back |
| JWT/MFA key rotated by mistake | Restore previous secret values from password manager; users re-login / re-enroll if key lost forever |

**Never “fix” production by re-loading bootstrap.**

---

## 12. Post-deployment testing — healthcare workflows

### 12.1 Platform

- [ ] `/api/health`  
- [ ] Aipipe `/health`  
- [ ] SPA load + deep-link refresh  
- [ ] `/api/unknown` → JSON 404  

### 12.2 Auth / RBAC / MFA

- [ ] SUPER_ADMIN password → MFA QR enroll → verify  
- [ ] Refresh cookie renews session  
- [ ] Logout  
- [ ] Permission denied (403) for wrong role  
- [ ] Role dashboards for HW / MO / Specialist / Navigator / District / Hospital as seeded  

### 12.3 Clinical / operational

- [ ] Registration request path (if used)  
- [ ] Patient create/list  
- [ ] Consent record  
- [ ] Screening create + **photo upload** (Supabase)  
- [ ] Image category validation (aipipe)  
- [ ] Enhancement (Real-ESRGAN → private storage)  
- [ ] AI assessment complete  
- [ ] MO clinical review / assignment  
- [ ] Specialist decision / availability  
- [ ] Diagnostics order + status  
- [ ] Navigator workflow step  
- [ ] Referral + hospital appointment  
- [ ] Video consultation join link  
- [ ] Notification visible  
- [ ] Audit log for login/MFA  
- [ ] Care plan / follow-up path (revisit fields present — no 033a run needed on Path A)  

### 12.4 Negative / security

- [ ] Unauthenticated API → 401  
- [ ] Image URL not publicly listable on Supabase  
- [ ] Aipipe rejects missing/wrong Bearer token  

---

## 13. Migration policy during this deploy

| Action | Allowed? |
|--------|----------|
| Path A: bootstrap final on **empty** DB | **Yes** |
| `npm run migrate` (status only, no `--apply`) | **Yes** |
| `migrate --apply` 004–043 | **No** |
| 033a via migrator | **No** (ignored; Option A) |
| 033a manual `psql` | Only if Path B missing objects after investigation |
| only-003 with dual approval | Path B admin promotion only |
| Touch local `Aarogya` | **No** |

---

## 14. Quick-reference service card

| Service | Type | Root / context | Build | Start | Health | Depends on |
|---------|------|----------------|-------|-------|--------|------------|
| Postgres | PostgreSQL | — | — | Managed | via `/api/health` | — |
| Main web | Web | repo root Docker **or** `backend` | Docker / `npm run build:native` | `npm start` | `/api/health` | Postgres, Supabase, Aipipe |
| Aipipe | Web (private) | `aipipe/aipipe` | Docker | uvicorn `0.0.0.0:$PORT` | `/health` | Cloudflare |
| Supabase | External storage | — | — | — | upload smoke | Main web env |

---

## 15. Go / no-go

**GO** when Path A or B is chosen, secrets ready, Supabase + Cloudflare ready, and operator accepts §0 safety rules.

**NO-GO** if anyone plans to: wipe a populated DB with bootstrap; blind-apply migrations; point production at local `Aarogya`; or deploy without `DB_*` mapping.

---

**This is a plan only. No Render connection, code, SQL, env, migration, or deploy was performed.**

**Awaiting your approval before any execution step.**
