# Aarogya Drishti — Render Environment Variable Checklist

**Type:** READ-ONLY configuration plan  
**Date:** 2026-11-17  
**Sources verified:** `backend/config/config.js`, `backend/db.js`, `backend/utils/dbSsl.js`, `backend/utils/trustProxy.js`, `backend/server.js`, `backend/services/supabaseClient.js`, `backend/utils/aiPipelineUrl.js`, `backend/services/emailTransport.js`, `backend/services/videoMeetingService.js`, `backend/.env.example`, `frontend/src/services/api.js`, `frontend/.env.production`, root `Dockerfile`, `aipipe/aipipe/main.py`, `aipipe/aipipe/.env.example`, `backend/package.json`, `frontend/package.json`  
**Constraints:** No code/.env/Render changes; no secret values printed; no deploy.

---

## 0. Service topology (required understanding)

| Render service | Role | Source evidence |
|----------------|------|-----------------|
| **Web (main)** | Express API + React SPA | Root `Dockerfile` / `backend` `npm start` → `node server.js` |
| **Postgres** | Managed PostgreSQL | App connects via discrete `DB_*` (not `DATABASE_URL`) |
| **Web (aipipe)** — **separate service** | FastAPI AI pipeline | `aipipe/aipipe/Dockerfile`; backend calls via `AI_PIPELINE_URL` |

**Yes — AI needs a separate Render service.** The Express app does not embed FastAPI. Set the same shared `AI_PIPELINE_AUTH_TOKEN` on both services.

**Frontend is not a separate Render service** in the supported production design: CRA is built into the main web image/sync path; browser calls same-origin `/api`.

---

## 1. Critical rule: `DATABASE_URL` is not used at runtime

| Fact | Evidence |
|------|----------|
| Runtime pool uses `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (+ optional SSL) | `config.js` → `db.js` |
| `DATABASE_URL` | **Not read** by production `db.js` |
| `TEST_DATABASE_URL` | Tests only — **do not set on Render web** |

On Render Postgres, copy Internal Database host / port / database / user / password into the discrete `DB_*` variables below. Leaving only Render’s injected `DATABASE_URL` will **not** configure this app.

---

## 2. Main web service — variable checklist

For each variable: **name**, **service**, **required?**, **value source**, **secret?**, **local vs prod**, **validation (no secret leak)**.

### 2.1 Runtime / platform

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 1 | `NODE_ENV` | Main web | **Required** | Set literally `production` on Render | No | Yes (local: `development`) | Logs / cookie `Secure` behavior; boot uses production defaults |
| 2 | `PORT` | Main web | **Required** (Render injects) | Render platform (do not hardcode conflicting value) | No | Yes (local often `5000`) | Startup log: `listening on 0.0.0.0:<port>`; `GET /api/health` |
| 3 | `LISTEN_HOST` | Main web | Optional | Default `0.0.0.0` in `server.js` if unset | No | Usually same | Leave unset on Render; confirm listen log shows `0.0.0.0` |
| 4 | `TRUST_PROXY` | Main web | Optional (prod default **1**) | Set `1` explicitly recommended | No | Yes (local often `loopback`) | Rate-limit / IP behavior behind Render; invalid values crash startup |

### 2.2 PostgreSQL (discrete vars — verified names)

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 5 | `DB_HOST` | Main web | **Required** | Render Postgres **Internal** hostname (preferred) or External host | No* | Yes | Boot log `PostgreSQL connected successfully`; `GET /api/health` DB OK |
| 6 | `DB_PORT` | Main web | Recommended | Render Postgres port (usually `5432`) | No | Often same | Same as above |
| 7 | `DB_NAME` | Main web | **Required** | Render database name (exact `current_database()`) | No | Yes (local often `Aarogya`) | Boot fails if empty; query via admin tool: `SELECT current_database();` |
| 8 | `DB_USER` | Main web | **Required** | Render Postgres user | No* | Yes | Boot / health |
| 9 | `DB_PASSWORD` | Main web | **Required** | Render Postgres password | **Yes** | Yes | Boot succeeds; never print value; check only presence length in dashboard |
| 10 | `DB_SSL` | Main web | **Required for managed Postgres** | Use `require` (or `verify-full` with CA) | No | Yes (local often `disable`) | Connection works; unsupported values throw at config load |
| 11 | `DB_SSL_CA` | Main web | Optional | PEM string if `verify-full` / custom CA | No† | Prod-only typical | Connection with verify-full succeeds |
| 12 | `DB_SSL_CA_FILE` | Main web | Optional | Path to PEM file in container (rare on Render) | No | Prod-only | Same |

\*Hostname/user are sensitive operationally but not cryptographic secrets.  
†CA material is sensitive infrastructure config — treat carefully; do not commit.

**Not supported for runtime:** `DATABASE_URL`.

### 2.3 Auth / JWT / sessions / MFA

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 13 | `JWT_SECRET` | Main web | **Required** (≥ 32 **bytes**) | Generate new strong random string; keep stable | **Yes** | Must differ from local | App **refuses to boot** if missing/short; never log value |
| 14 | `JWT_EXPIRES_IN` | Main web | Optional | Default `15m` | No | Can match | Access token expiry behavior |
| 15 | `REFRESH_TOKEN_TTL_HOURS` | Main web | Optional | Default `12` | No | Can match | Refresh cookie lifetime |
| 16 | `MFA_ENCRYPTION_KEY` | Main web | **Required** for MFA roles | 32 random bytes, **Base64**; keep forever stable | **Yes** | Prefer dedicated prod key | Boot warns if missing; MFA login without key → `503 MFA_NOT_CONFIGURED`; validate: Base64 decodes to **exactly 32 bytes** (check length only) |
| 17 | `SETUP_TOKEN_ENCRYPTION_KEY` | Main web | **Required** for district setup links | 32 random bytes, Base64 | **Yes** | Prefer dedicated prod key | Setup-link create fails if invalid; length check only |
| 18 | `PASSWORD_RESET_DELIVERY` | Main web | Optional | Prod default `none` if unset | No | Yes (local often `console`) | Confirm mode; email/sms adapters not configured yet |

### 2.4 CORS / frontend origin / SPA path

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 19 | `FRONTEND_URL` | Main web | **Required** on Render | Exact public site URL, e.g. `https://<service>.onrender.com` (no trailing slash mismatch) | No | Yes (local `http://localhost:3000`) | Browser network: no CORS errors; Origin matches allowlist |
| 20 | `FRONTEND_BUILD_PATH` | Main web | Optional | Only if SPA not at default `../frontend/build` or `./public` | No | Docker usually unset | Startup log: `Serving frontend production build from …` |

**Build-time (not a Render runtime env for Node):**

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate |
|---|----------|---------|----------|------------------|--------|--------------|-----------------|
| 21 | `REACT_APP_API_URL` | Frontend **build** (Docker stage / `npm run build`) | Set at build | `/api` (`Dockerfile` + `.env.production`) | No | Dev uses localhost | Built SPA requests go to `/api/...` (DevTools Network) |

Do **not** put Supabase or JWT secrets in `REACT_APP_*`.

### 2.5 Supabase private storage

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 22 | `SUPABASE_URL` | Main web | **Required** for photos | Supabase project URL (`https://…supabase.co`) | No* | Can match same project or use prod project | Must be `https:` (non-loopback); upload path returns not `IMAGE_STORAGE_UNAVAILABLE` |
| 23 | `SUPABASE_SERVICE_ROLE_KEY` | Main web | **Required** for photos | Supabase **service_role** key (server only) | **Yes** | Prefer prod-only key | Same; never expose to browser |
| 24 | `SUPABASE_STORAGE_BUCKET` | Main web | **Required** for photos | Private bucket name (e.g. from `.env.example` pattern) | No | Can match | Upload/list succeeds; bucket private |

All three must be set together (`supabaseClient.isConfigured()`).

### 2.6 AI pipeline client (on main web)

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| 25 | `AI_PIPELINE_URL` | Main web | **Required** for AI | URL of aipipe service: `https://…onrender.com` **or** `http://…render.internal` (private DNS allowed) | No | Yes (local `http://127.0.0.1:8010`) | Screening AI succeeds; invalid URL → `AI_PIPELINE_UNAVAILABLE`; public HTTP non-private host rejected |
| 26 | `AI_PIPELINE_AUTH_TOKEN` | Main web | **Required** for AI (≥ 32 chars) | Shared secret — **identical** to aipipe service | **Yes** | Prefer dedicated prod token | AI works; mismatch → auth fail; check **length ≥ 32** only |
| 27 | `AI_PIPELINE_HEALTH_TIMEOUT_MS` | Main web | Optional | Default `5000` | No | Can match | Health probe timing |
| 28 | `AI_PIPELINE_ANALYSIS_TIMEOUT_MS` | Main web | Optional | Default `600000` | No | Can match | Long analysis does not false-timeout |

### 2.7 Bootstrap admin (empty DB / first deploy)

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate |
|---|----------|---------|----------|------------------|--------|--------------|-----------------|
| 29 | `SYSTEM_ADMIN_USERNAME` | Main web | Required for auto-bootstrap | Operator-chosen username | No* | Often differ | Startup creates account only if missing; never overwrites existing |
| 30 | `SYSTEM_ADMIN_PASSWORD` | Main web | Required to create bootstrap user | Strong password | **Yes** | Must differ | First login works; remove/rotate after enroll |
| 31 | `SYSTEM_ADMIN_EMAIL` | Main web | Optional | Operator email | No | — | Stored if provided |
| 32 | `SYSTEM_ADMIN_FULL_NAME` | Main web | Optional | Default display name in config | No | — | Profile name |

### 2.8 SMTP (district admin invitation email)

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate |
|---|----------|---------|----------|------------------|--------|--------------|-----------------|
| 33 | `SMTP_HOST` | Main web | Required **together** for email | SMTP provider | No | — | Invitation send succeeds; incomplete set → transport unavailable |
| 34 | `SMTP_PORT` | Main web | Required with SMTP | e.g. `587` | No | — | Same |
| 35 | `SMTP_SECURE` | Main web | Required with SMTP | Exactly `true` or `false` | No | — | Same |
| 36 | `SMTP_USER` | Main web | Required with SMTP | Provider user | No* | — | Same |
| 37 | `SMTP_PASSWORD` | Main web | Required with SMTP | Provider password | **Yes** | — | Presence only |
| 38 | `SMTP_FROM` | Main web | Required with SMTP | From address / display | No | — | Same |

### 2.9 Video (optional defaults exist)

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate |
|---|----------|---------|----------|------------------|--------|--------------|-----------------|
| 39 | `VIDEO_PROVIDER` | Main web | Optional | `jitsi` | No | Can match | Video join link issued |
| 40 | `JITSI_DOMAIN` | Main web | Optional | Default `meet.jit.si` | No | Can match | Join URL host correct |

### 2.10 Optional / rarely needed on Render

| # | Variable | Service | Required | Notes | Secret |
|---|----------|---------|----------|-------|--------|
| 41 | `PHOTO_STORAGE_DIR` | Main web | Optional | Legacy local photos; **do not rely on Render disk** | No |
| 42 | `REAL_ESRGAN_MAX_INPUT_SIDE` | Main web | Optional | Default `384` | No |
| 43 | `LGD_BASE_URL` / `LGD_TIMEOUT_MS` | Main web | Optional | India LGD directory defaults in code | No |
| 44 | `SMS_PROVIDER` / `SMS_API_KEY` / `SMS_TEMPLATE_ID` | Main web | Optional | SMS not fully productized | Yes (key) |

### 2.11 Migrator-only (do **not** leave set permanently on Render)

| # | Variable | Service | Required | Notes | Secret |
|---|----------|---------|----------|-------|--------|
| 45 | `MIGRATION_TRUSTED_DATABASE_NAME` | Main web (CLI migrate) | Only for gated 003 | Exact `current_database()` name | No |
| 46 | `MIGRATE_APPROVE_003` | Main web (CLI) | Only for 003 apply | Exact value `PROMOTE_BOOTSTRAP` | Treat as approval gate |

Unset after successful one-time promotion.

### 2.12 Never set on Render production web

| Variable | Why |
|----------|-----|
| `TEST_DATABASE_URL` | Tests only |
| `TEST_DB_ALLOW_DESTRUCTIVE_RESET` | Destructive test guard |
| `TEST_MFA_ENCRYPTION_KEY` / `TEST_*` | Test helpers |
| `UVICORN_RELOAD` | aipipe local only |
| `DATABASE_URL` as sole DB config | **Ignored by runtime pool** |

---

## 3. Aipipe service — variable checklist

Deploy as a **separate** Render Web Service (Docker from `aipipe/aipipe`). Prefer **private** service + Internal URL on main web.

| # | Variable | Service | Required | Value comes from | Secret | Local ≠ Prod | How to validate (no secrets) |
|---|----------|---------|----------|------------------|--------|--------------|------------------------------|
| A1 | `PORT` | Aipipe | Render-injected | Platform | No | Yes | Health endpoint responds |
| A2 | `AI_PIPELINE_AUTH_TOKEN` | Aipipe | **Required** (≥ 32 chars) | **Same value** as main web | **Yes** | Prefer prod token | Unauthorized without Bearer; authorized with matching token (do not log token) |
| A3 | `CLOUDFLARE_ACCOUNT_ID` | Aipipe | **Required** for real vision | Cloudflare account | No* | Can match or prod-only | Service boots; vision calls work |
| A4 | `CLOUDFLARE_AUTH_TOKEN` | Aipipe | **Required** for real vision | Cloudflare API token | **Yes** | Prefer scoped prod token | Same; boot fails if missing with account id |
| A5 | `CLOUDFLARE_AI_MODEL` | Aipipe | Optional | Default in code / `.env.example` | No | Can match | Model responses |
| A6 | `CLOUDFLARE_AI_TIMEOUT_SECONDS` | Aipipe | Optional | Default `120` | No | Can match | Timeout behavior |
| A7 | `UVICORN_RELOAD` | Aipipe | Leave **unset** on Render | Local only | No | Yes | — |

Host binding is hardcoded `0.0.0.0` in Dockerfile/`main.py` — no env needed.

---

## 4. Frontend build variables (build pipeline, not Node runtime)

| Variable | Where set | Required value on Render build | Secret |
|----------|-----------|--------------------------------|--------|
| `REACT_APP_API_URL` | Docker stage / CRA build / `.env.production` | `/api` | No |
| `CI` | Dockerfile sets `false` | Avoid CRA treating warnings as failures | No |
| `GENERATE_SOURCEMAP` | Dockerfile `false` | Optional hardening | No |

`frontend/package.json` scripts: `build` = `react-scripts build`.  
`backend/package.json`: `build:native` builds frontend then `sync:frontend`; `start` = `node server.js`.

---

## 5. Recommended Render dashboard grouping

### Main web — minimum for boot + login + SPA

```
NODE_ENV=production
# PORT — leave to Render
DB_HOST=...
DB_PORT=5432
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
DB_SSL=require
JWT_SECRET=...                 # ≥32 bytes
MFA_ENCRYPTION_KEY=...         # 32-byte Base64
SETUP_TOKEN_ENCRYPTION_KEY=... # 32-byte Base64
FRONTEND_URL=https://<your-main-service>.onrender.com
TRUST_PROXY=1
SYSTEM_ADMIN_USERNAME=...
SYSTEM_ADMIN_PASSWORD=...
```

### Main web — full clinical parity

```
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=...
AI_PIPELINE_URL=https://<aipipe>.onrender.com
  # or http://<aipipe-private>.render.internal:PORT
AI_PIPELINE_AUTH_TOKEN=...     # same as aipipe, ≥32 chars
SMTP_*                         # if invitations needed
VIDEO_PROVIDER=jitsi
JITSI_DOMAIN=meet.jit.si
```

### Aipipe service

```
AI_PIPELINE_AUTH_TOKEN=...     # identical to main web
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_AUTH_TOKEN=...
# optional: CLOUDFLARE_AI_MODEL, CLOUDFLARE_AI_TIMEOUT_SECONDS
```

---

## 6. Secret generation (operator-side; do not paste into chat)

| Secret | Generation guidance (names only) |
|--------|----------------------------------|
| `JWT_SECRET` | Random string with UTF-8 byte length ≥ 32 |
| `MFA_ENCRYPTION_KEY` | `crypto.randomBytes(32).toString('base64')` — **never rotate casually** |
| `SETUP_TOKEN_ENCRYPTION_KEY` | Same pattern as MFA key |
| `AI_PIPELINE_AUTH_TOKEN` | Random string length ≥ 32; shared across services |
| `DB_PASSWORD` / Supabase / Cloudflare / SMTP | From respective providers |

**Validation without exposing secrets:**

- Confirm variable **exists** in Render UI (masked).  
- Confirm **length** / format rules (JWT ≥ 32 bytes; MFA/setup keys Base64 → 32 bytes; AI token ≥ 32 chars).  
- Confirm runtime behavior: boot log, `/api/health`, MFA enroll, photo upload, AI analysis.  
- Never `echo`, never commit, never paste into tickets.

---

## 7. Local vs production differences (quick matrix)

| Concern | Local typical | Render production |
|---------|---------------|-------------------|
| DB host | `localhost` | Render Internal hostname |
| `DB_SSL` | `disable` | `require` |
| `FRONTEND_URL` | `http://localhost:3000` | `https://<web>.onrender.com` |
| API URL (browser) | `http://localhost:5000/api` | `/api` same-origin |
| `AI_PIPELINE_URL` | `http://127.0.0.1:8010` | HTTPS public or `*.render.internal` HTTP |
| Cookies | `secure:false` | `secure:true` (`NODE_ENV=production`) |
| Trust proxy | `loopback` | hop `1` |
| Photos | May use local dir | Supabase trio required |
| `DATABASE_URL` | Unused by app | Still unused — map to `DB_*` |

---

## 8. Pre-apply checklist (operator)

- [ ] Main web has all **§5 minimum** vars  
- [ ] `DB_*` filled from Postgres (not relying on `DATABASE_URL` alone)  
- [ ] `DB_SSL=require`  
- [ ] `FRONTEND_URL` exact HTTPS origin  
- [ ] `JWT_SECRET` / `MFA_ENCRYPTION_KEY` / `SETUP_TOKEN_ENCRYPTION_KEY` set and valid length  
- [ ] Supabase trio set for screening photos  
- [ ] Separate aipipe service deployed  
- [ ] Matching `AI_PIPELINE_AUTH_TOKEN` on both services  
- [ ] `AI_PIPELINE_URL` points at aipipe (HTTPS or private `.render.internal`)  
- [ ] Cloudflare vars on aipipe  
- [ ] SPA build present (Docker or `build:native` sync)  
- [ ] Migrator approval vars **unset** unless running gated 003  

---

**No code, `.env`, SQL, or Render settings were modified.**  

**Awaiting your approval before applying any environment values or deploying.**
