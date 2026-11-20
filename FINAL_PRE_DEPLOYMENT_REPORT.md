# Aarogya Drishti — Final Pre-Deployment Verification Report

**Type:** READ-ONLY verification  
**Date:** 2026-11-17  
**Inputs:**  
1. `LOCAL_TO_RENDER_READINESS_REPORT.md`  
2. `RENDER_ENVIRONMENT_CHECKLIST.md`  
3. `DATABASE_COMPLETE_AUDIT_REPORT.md`  
4. `DATABASE_BOOTSTRAP_VERIFICATION_REPORT.md`  
5. Project source (config, server, routes, Dockerfiles, migrator, frontend API)

**Not done:** code/SQL/.env changes; Render connection; SQL/migrations; deploy; secret exposure.

---

## Executive verdict

| Overall | Result |
|---------|--------|
| Codebase design for Render same-origin deploy | **PASS** |
| Greenfield DB init via `AAROGYA_BOOTSTRAP_FINAL.sql` | **PASS** |
| Env contract (`DB_*`, JWT, MFA, Supabase, AI) | **PASS** (operator must set values) |
| Live Render dashboard / live Render DB state | **NOT VERIFIED** |
| Existing partially migrated Render DB path | **WARNING** — do not wipe; do not blind-apply 004–043 |
| Ready to deploy after operator env + DB init | **PASS with conditions** (see blockers) |

**Do not deploy until:** `DB_*` (not `DATABASE_URL` alone), SSL, secrets, Supabase, aipipe, and empty-DB bootstrap (or existing-DB plan) are confirmed by the operator.

---

## Verification matrix (17 items)

| # | Item | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Frontend production build | **PASS** | Root `Dockerfile` stage builds CRA with `REACT_APP_API_URL=/api`; `frontend/.env.production` same; `backend` `build:native` + `sync:frontend` → `backend/public`. SPA mount after `/api` in `app.js` + `frontendStatic.js`. |
| 2 | Backend production start command | **PASS** | `backend/package.json` `"start": "node server.js"`; Docker `CMD ["npm", "start"]`. |
| 3 | PostgreSQL `DB_*` configuration | **PASS** | `config.js` + `db.js` use `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. **`DATABASE_URL` not used at runtime.** |
| 4 | Database SSL support | **PASS** | `utils/dbSsl.js`: `DB_SSL` = `disable` \| `require` \| `verify-full` (+ optional `DB_SSL_CA` / `DB_SSL_CA_FILE`). Render needs `require` (or verify-full). |
| 5 | JWT authentication | **PASS** | `JWT_SECRET` ≥ 32 bytes required at boot; refresh cookie `ad_refresh`; auth routes under `/api/auth`. |
| 6 | SUPER_ADMIN and MFA | **PASS** | Role seed: `SUPER_ADMIN` active + `mfa_required`; `SYSTEM_ADMIN` inactive post-011. MFA needs `MFA_ENCRYPTION_KEY` (32-byte Base64). `bootstrap.js` / seed create SUPER_ADMIN. |
| 7 | All role-based permissions | **PASS** (code + schema) | `requirePermission` / `allowRoles` + `tbl_role_permissions` / `mst_permissions` in bootstrap. Role route trees: admin, district, HW, MO, navigator, specialist, hospital-staff, etc. **Runtime seed content on Render: NOT VERIFIED until DB loaded.** |
| 8 | Supabase private storage | **PASS** (design) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET`; HTTPS enforced; `privateImageStorage.js`. **FAIL at runtime if unset** → `IMAGE_STORAGE_UNAVAILABLE`. |
| 9 | AI service authentication | **PASS** (design) | Shared `AI_PIPELINE_AUTH_TOKEN` ≥ 32 chars; Bearer on FastAPI; URL allowlist HTTPS or private/`*.render.internal`. Separate aipipe service required. |
| 10 | Frontend → backend API connectivity | **PASS** | Prod `REACT_APP_API_URL=/api`; same-origin Express hosts SPA + API. |
| 11 | CORS and HTTPS | **PASS** | `cors({ origin: FRONTEND_URL, credentials: true })`; cookies `secure` when `NODE_ENV=production`. Set `FRONTEND_URL` to exact public HTTPS origin. |
| 12 | Render PORT and `0.0.0.0` binding | **PASS** | `PORT` from env; `LISTEN_HOST` default `0.0.0.0` in `server.js`. Aipipe: uvicorn `--host 0.0.0.0 --port ${PORT}`. |
| 13 | Health-check endpoints | **PASS** | Main: `GET /api/health` (DB `SELECT 1`). Aipipe: `GET /health` (+ Dockerfile `HEALTHCHECK`). |
| 14 | Database bootstrap safety | **PASS** / **CONFLICT** | Empty DB: **PASS** with `AAROGYA_BOOTSTRAP_FINAL.sql`. Existing data: **CONFLICT** (`DROP SCHEMA public CASCADE`). |
| 15 | Migration `033a` compatibility | **WARNING** | File exists; migrator regex `^\d{3}_[a-z0-9_]+\.(sql|js)$` excludes `033a`; bootstrap history omits it. Greenfield OK (schema already includes effects). Manual recovery only. |
| 16 | File uploads and image processing | **PASS** (design) | Screening upload → Supabase; Real-ESRGAN enhancement → private storage; category validation via aipipe. Ephemeral container disk not for PHI. |
| 17 | Major healthcare workflows | **PASS** (routes present) | Patients, screenings, MO, specialist, diagnostics, navigator, referrals/hospital-staff, video, notifications, audit, registrations, dashboards. End-to-end on Render: **NOT VERIFIED** until post-deploy tests. |

### Status legend used above

- **PASS** — source/reports confirm production-ready design or verified local artifact.  
- **WARNING** — safe if understood; operator action or non-blocking divergence.  
- **FAIL** — would break deploy if that condition occurs (called out conditionally).  
- **NOT VERIFIED** — cannot confirm without Render access or live traffic.  
- **CONFLICT** — destructive / incompatible path if misused.

---

## Exact Render services required

| # | Render service type | Purpose | Repo path / notes |
|---|---------------------|---------|-------------------|
| 1 | **PostgreSQL** | Application database | Map credentials into `DB_*` (not rely on `DATABASE_URL` alone) |
| 2 | **Web service (main)** | Express API + React SPA | Root `Dockerfile` **or** Node Root Directory `backend` with native build |
| 3 | **Web service (aipipe)** | FastAPI AI pipeline | `aipipe/aipipe/Dockerfile`; prefer **private** network; Cloudflare env |

No separate frontend Render service in the supported design.

---

## Exact build commands

### Option A — Docker (recommended monorepo)

| Service | Build |
|---------|--------|
| Main web | Render Docker: context = **repository root**, Dockerfile = root `Dockerfile` (builds frontend then backend image) |
| Aipipe | Docker: context = `aipipe/aipipe`, Dockerfile = that folder’s `Dockerfile` |

Root Dockerfile frontend stage effectively runs:

```text
npm ci
REACT_APP_API_URL=/api npm run build
```

### Option B — Native Node (Root Directory = `backend`)

**Build Command:**

```text
npm run build:native
```

(`build:native` = `npm --prefix ../frontend ci && npm --prefix ../frontend run build && node scripts/syncFrontendBuild.js`)

Requires Render repo access to sibling `frontend/` (root of monorepo checked out).

**Frontend-only build (if composing manually):**

```text
npm --prefix frontend ci
npm --prefix frontend run build
```

Then sync into backend public (via `npm run sync:frontend` from backend).

---

## Exact start commands

| Service | Start command |
|---------|----------------|
| Main web (Docker or Node) | `npm start` → `node server.js` |
| Aipipe | Dockerfile `CMD`: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010}` |

Do not override listen host away from `0.0.0.0` on Render.

---

## Exact environment variable names

### Main web — required for boot

`NODE_ENV`, `PORT` (platform), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `JWT_SECRET`

### Main web — required for MFA / CORS / setup / clinical parity

`MFA_ENCRYPTION_KEY`, `FRONTEND_URL`, `SETUP_TOKEN_ENCRYPTION_KEY`,  
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`,  
`AI_PIPELINE_URL`, `AI_PIPELINE_AUTH_TOKEN`,  
`SYSTEM_ADMIN_USERNAME`, `SYSTEM_ADMIN_PASSWORD` (first admin on empty DB)

### Main web — recommended / optional

`TRUST_PROXY`, `LISTEN_HOST`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_TTL_HOURS`, `PASSWORD_RESET_DELIVERY`,  
`FRONTEND_BUILD_PATH`, `AI_PIPELINE_HEALTH_TIMEOUT_MS`, `AI_PIPELINE_ANALYSIS_TIMEOUT_MS`,  
`SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_FULL_NAME`,  
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,  
`VIDEO_PROVIDER`, `JITSI_DOMAIN`,  
`DB_SSL_CA`, `DB_SSL_CA_FILE`, `PHOTO_STORAGE_DIR`, `REAL_ESRGAN_MAX_INPUT_SIDE`, `LGD_BASE_URL`, `LGD_TIMEOUT_MS`

### Main web — migrator gates only (temporary)

`MIGRATION_TRUSTED_DATABASE_NAME`, `MIGRATE_APPROVE_003`

### Aipipe

`PORT` (platform), `AI_PIPELINE_AUTH_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`,  
optional: `CLOUDFLARE_AI_MODEL`, `CLOUDFLARE_AI_TIMEOUT_SECONDS`  
leave unset: `UVICORN_RELOAD`

### Build-time (frontend)

`REACT_APP_API_URL=/api`

### Do not use as sole DB config

`DATABASE_URL` — **not read by production `db.js`**

Full per-var detail: `RENDER_ENVIRONMENT_CHECKLIST.md`.

---

## Database initialization instructions

### Greenfield (recommended for full local parity)

1. Create **empty** Render PostgreSQL.  
2. From an operator machine (not this audit), load:

   ```text
   psql -h HOST -U USER -d DB_NAME -f backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql
   ```

3. Set main web `DB_*` + `DB_SSL=require`.  
4. Do **not** use `ALL_IN_ONE (1).sql` as the complete production schema.  
5. Do **not** run bootstrap on a DB with live data.  
6. Start API; `bootstrap.js` creates first SUPER_ADMIN if username/password set and none exists.  
7. Status-only: `npm run migrate` (no `--apply`) — expect migrator-tracked set up to date.  
8. Ignore `033a` for greenfield (not in migrator; effects already in bootstrap schema).

### Existing Render DB (bootstrap + partial migrations)

1. **Do not** load `AAROGYA_BOOTSTRAP_FINAL.sql`.  
2. Read-only status of `schema_migrations` / `current_database()`.  
3. If admin still SYSTEM_ADMIN / cannot login: use **only-003** dual-approval procedure (prior work).  
4. Do **not** blind `migrate --apply` for 004–043.

---

## Deployment order

1. **Postgres** provisioned.  
2. **Initialize DB** (greenfield bootstrap **or** confirm existing plan).  
3. Deploy **aipipe** with Cloudflare + `AI_PIPELINE_AUTH_TOKEN`; note Internal URL.  
4. Set **main web** env (`DB_*`, SSL, JWT, MFA, FRONTEND_URL, Supabase, `AI_PIPELINE_*`, SYSTEM_ADMIN_*).  
5. Deploy **main web** (Docker or native build+start).  
6. Confirm logs: Postgres connected; SPA served; listen `0.0.0.0:$PORT`.  
7. Hit `GET /api/health` and aipipe `GET /health`.  
8. Run post-deployment checklist below.  
9. Enroll SUPER_ADMIN MFA; rotate bootstrap password as needed.

---

## Post-deployment testing checklist

- [ ] `GET /api/health` → success, `database: "Connected"`  
- [ ] Aipipe `GET /health` → success (from main or private network)  
- [ ] SPA loads at `/`; deep-link refresh does not break (SPA fallback)  
- [ ] Unknown `/api/...` returns JSON 404 (not HTML)  
- [ ] SUPER_ADMIN login → MFA enroll (QR) → verify  
- [ ] Access token refresh via httpOnly cookie (`Secure` on HTTPS)  
- [ ] Logout clears session  
- [ ] Role dashboards load for seeded roles (permission denials where expected)  
- [ ] Patient create/list + consent  
- [ ] Screening photo upload (Supabase) + authorized retrieve  
- [ ] Image enhancement (Real-ESRGAN) stores enhanced object  
- [ ] AI analysis / category validation completes  
- [ ] Medical officer clinical review path  
- [ ] Specialist decision / availability  
- [ ] Diagnostics order + navigator steps  
- [ ] Referral / hospital appointment  
- [ ] Video consultation join link  
- [ ] Notification created/visible  
- [ ] Audit log for login/MFA  
- [ ] No CORS errors with `FRONTEND_URL`  
- [ ] Confirm no reliance on container local disk for patient photos  

---

## Critical blockers before go-live

1. Map Render Postgres into **`DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`** + **`DB_SSL=require`**.  
2. Ensure SPA is built into the main service image/path.  
3. Set stable **`JWT_SECRET`**, **`MFA_ENCRYPTION_KEY`**, **`SETUP_TOKEN_ENCRYPTION_KEY`**.  
4. Set **`FRONTEND_URL`** to exact HTTPS site origin.  
5. Configure Supabase trio + separate aipipe + matching AI token + Cloudflare.  
6. Choose greenfield bootstrap **or** existing-DB only-003 path — never both wipe + blind migrate.

---

## Cross-report consistency

| Topic | Readiness | Env checklist | DB audit | Bootstrap verify | This final |
|-------|-----------|---------------|----------|------------------|------------|
| `DB_*` not `DATABASE_URL` | Yes | Yes | — | — | **PASS** |
| BOOTSTRAP_FINAL = 97 tables | Yes | — | Yes | **PASS** | **PASS** |
| ALL_IN_ONE incomplete | Yes | — | **WARNING** | — | **WARNING** |
| `033a` ignored by migrator | Yes | — | **WARNING** | **WARNING** | **WARNING** |
| Separate aipipe | Yes | Yes | — | — | **PASS** |
| Render UI live state | NOT VERIFIED | NOT VERIFIED | Not connected | Not connected | **NOT VERIFIED** |

---

**No code, SQL, `.env`, or Render settings were modified. No SQL, migrations, or deploys were executed.**

**Awaiting your approval before any remediation or deployment.**
