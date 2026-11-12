# Aarogya Drishti — Docker & Render deployment guide

This document describes how to build and run the stack with Docker, and how to configure Render later.
**Do not deploy until separately approved.** This guide never prints secret values.

## Architecture

```text
                    Internet (HTTPS)
                           |
                           v
              +------------------------+
              |  web (Render Web)      |
              |  Express :PORT         |
              |  serves SPA + /api     |
              |  trust proxy = 1 hop   |
              +-----------+------------+
                    |     |
         /api/*     |     |  AI_PIPELINE_URL (private HTTP)
         Postgres   |     |  Authorization: Bearer AI_PIPELINE_AUTH_TOKEN
                    v     v
         +----------+   +------------------+
         | Postgres |   | aipipe (Private)  |
         | + SSL    |   | FastAPI / Uvicorn |
         +----------+   | NOT public       |
                        +--------+---------+
                                 |
                                 v
                        Cloudflare Workers AI

         Supabase Storage (private bucket) <--- Express only (service role)
```

Same-origin SPA: browser calls `/api` on the web service. Refresh cookie `ad_refresh` stays on `/api/auth`.

Offline PWA: service worker **aarogya-drishti-v7** caches app shell only — never `/api`, tokens, or patient data. IndexedDB drafts are not deleted on cache activation.

## Docker build commands

From the repository root (`C:\Users\Public\Aarogya_Drishti`):

```bash
# Web image (Express + React build)
docker build -t aarogya-web -f Dockerfile .

# AI pipeline image
docker build -t aarogya-aipipe -f aipipe/aipipe/Dockerfile aipipe/aipipe
```

## Docker Compose commands

```bash
# Validate compose file
docker compose config

# Build images
docker compose build

# Start web + private aipipe (uses existing backend/.env and aipipe/aipipe/.env)
docker compose up

# Optional local Postgres (separate DB name; NOT production)
set COMPOSE_POSTGRES_PASSWORD=choose-a-local-password
docker compose --profile local-db up --build
```

Compose intentionally:

- Does **not** run migrations
- Does **not** publish aipipe ports to the host
- Overrides `AI_PIPELINE_URL=http://aipipe:8010` so Express reaches the private service

Internal AI health check:

```bash
docker compose exec aipipe curl -fsS http://127.0.0.1:8010/health
```

Authenticated Express→AI calls use the shared bearer token from both env files.

## Required environment variable NAMES

### Web service (Express)

| Name | Notes |
|------|--------|
| `NODE_ENV` | `production` on Render |
| `PORT` | Set by Render |
| `LISTEN_HOST` | Optional; default `0.0.0.0` |
| `TRUST_PROXY` | Prefer `1` on Render |
| `DB_HOST` | |
| `DB_PORT` | |
| `DB_NAME` | |
| `DB_USER` | |
| `DB_PASSWORD` | |
| `DB_SSL` | `disable` locally; `require` / `verify-full` on managed Postgres |
| `DB_SSL_CA` | Optional PEM string for verification |
| `DB_SSL_CA_FILE` | Optional path to CA PEM |
| `JWT_SECRET` | ≥32 bytes |
| `JWT_EXPIRES_IN` | Optional |
| `REFRESH_TOKEN_TTL_HOURS` | Optional |
| `MFA_ENCRYPTION_KEY` | 32-byte base64 |
| `SETUP_TOKEN_ENCRYPTION_KEY` | 32-byte base64 |
| `FRONTEND_URL` | Public HTTPS origin of the web app |
| `SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only — never `REACT_APP_*` |
| `SUPABASE_STORAGE_BUCKET` | Private bucket |
| `AI_PIPELINE_URL` | Private service URL (HTTP OK only for private hosts) |
| `AI_PIPELINE_AUTH_TOKEN` | ≥32 chars; same as aipipe |
| `AI_PIPELINE_HEALTH_TIMEOUT_MS` | Optional |
| `AI_PIPELINE_ANALYSIS_TIMEOUT_MS` | Optional |
| `SYSTEM_ADMIN_USERNAME` | Bootstrap |
| `SYSTEM_ADMIN_PASSWORD` | Bootstrap |
| `SYSTEM_ADMIN_FULL_NAME` | Optional |
| `PASSWORD_RESET_DELIVERY` | Optional |
| `SMTP_*` | Optional (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) |
| `VIDEO_PROVIDER` / `JITSI_DOMAIN` | Optional |
| `PHOTO_STORAGE_DIR` | Avoid on Render; use Supabase |
| `REAL_ESRGAN_MAX_INPUT_SIDE` | Optional |

### Frontend build-time

| Name | Value for same-origin Docker/Render |
|------|--------------------------------------|
| `REACT_APP_API_URL` | `/api` (set in Dockerfile) |

### aipipe (private)

| Name | Notes |
|------|--------|
| `PORT` | Platform port |
| `CLOUDFLARE_ACCOUNT_ID` | Required to start |
| `CLOUDFLARE_AUTH_TOKEN` | Required to start |
| `CLOUDFLARE_AI_MODEL` | Optional |
| `CLOUDFLARE_AI_TIMEOUT_SECONDS` | Optional |
| `AI_PIPELINE_AUTH_TOKEN` | ≥32 chars; must match web |

## Render service configuration (manual — do not auto-create)

1. **web** — Docker web service
   - Dockerfile path: `Dockerfile`
   - Context: repository root
   - Health check path: `/api/health`
   - Attach public URL

2. **aipipe** — **Private** Docker service (not publicly routable)
   - Dockerfile path: `aipipe/aipipe/Dockerfile`
   - Context: `aipipe/aipipe`
   - Health check path: `/health`
   - Set web `AI_PIPELINE_URL` to the private service hostname

3. **PostgreSQL** — Render Postgres or external managed DB
   - Map credentials into `DB_*`
   - Enable SSL verification (`DB_SSL=verify-full` + CA)

4. **Supabase** — external private storage (already used by the app)

## Private AI networking

- Keep aipipe off the public internet (Compose: no `ports:`; Render: private service).
- Express calls aipipe with `Authorization: Bearer <AI_PIPELINE_AUTH_TOKEN>`.
- FastAPI accepts **only** that bearer token (constant-time compare).
- Auth does **not** trust `X-Forwarded-For` / client IP.
- HTTP to `AI_PIPELINE_URL` is allowed only for loopback / private Docker / `*.render.internal` hosts; public cleartext HTTP is rejected.

## PostgreSQL SSL

| Environment | Suggested `DB_SSL` |
|-------------|--------------------|
| Local Docker / laptop Postgres | `disable` or unset |
| Managed Postgres with CA | `verify-full` + `DB_SSL_CA` or `DB_SSL_CA_FILE` |
| Managed Postgres requiring TLS | `require` (still verifies; supply CA when the provider uses a private CA) |

The app never defaults to `rejectUnauthorized: false`.

## Health check paths

| Service | Method | Path | Expectation |
|---------|--------|------|-------------|
| web | GET | `/api/health` | JSON `{ success: true, database: "Connected" }` |
| aipipe | GET | `/health` | JSON `{ status: "healthy", ... }` — no secrets |

Unknown `/api/*` paths return JSON 404 (never the SPA HTML).

## Supabase Storage

- Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.
- Bucket must be **private**; only Express with the service role downloads/uploads.
- Docker images **exclude** `backend/storage` patient files.
- Do not rely on container disk for PHI.

## Migrations & backups

1. Take a database backup before any production migrate.
2. Review: `npm run migrate` (from `backend/`, against the **target** DB only after approval).
3. Apply: `npm run migrate:apply` — **never** automatic in Compose/Docker entrypoint.
4. Bootstrap refuses to start if migrations are outstanding.
5. Never run migrate against production from a developer laptop without explicit approval.

## Deployment & rollback checklist

**Before deploy**

- [ ] Images build locally (`docker build` web + aipipe)
- [ ] `docker compose config` validates
- [ ] Env var **names** set on Render (values entered only in the dashboard)
- [ ] Matching `AI_PIPELINE_AUTH_TOKEN` on web + aipipe
- [ ] `FRONTEND_URL` = public HTTPS origin
- [ ] `DB_SSL` + CA configured for managed Postgres
- [ ] Supabase private bucket verified
- [ ] Migrations reviewed/applied with backup
- [ ] SPA build contains SW `aarogya-drishti-v7`

**After deploy**

- [ ] `GET /api/health` → JSON + DB connected
- [ ] Invalid login → JSON 401 (not HTML)
- [ ] MFA-required login still returns `mfa_token` flow
- [ ] Private aipipe `/health` OK from platform network
- [ ] Express→aipipe authenticated analyze works; unauthenticated rejected
- [ ] Uploads land in private Supabase (not container disk)
- [ ] Offline shell / SW v7 intact

**Rollback**

- [ ] Redeploy previous web + aipipe image tags
- [ ] Restore DB from pre-migrate backup if schema changed
- [ ] Confirm health endpoints and login/MFA

## Local testing instructions (after Docker Desktop is installed)

```bash
cd C:\Users\Public\Aarogya_Drishti
docker build -t aarogya-web -f Dockerfile .
docker build -t aarogya-aipipe -f aipipe/aipipe/Dockerfile aipipe/aipipe
docker compose config
docker compose up --build
```

Then:

1. Open `http://localhost:5000` — SPA from Express
2. `GET /api/health` — JSON
3. `POST /api/auth/login` with bad password — JSON 401
4. Valid MFA-required user — MFA challenge payload intact
5. `docker compose exec aipipe curl -fsS http://127.0.0.1:8010/health`
6. From web container, call aipipe with bearer token — success
7. Same call without token — 403
8. Confirm `build/service-worker.js` cache name `aarogya-drishti-v7` inside the web image

Non-Docker checks (always available):

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=src/offline
cd backend && npx jest --runInBand --testPathPatterns="aiPipelineUrl|dbSsl|trustProxy|aiAnalysisService|patientService"
cd aipipe/aipipe && python -m unittest discover -s tests -v
```
