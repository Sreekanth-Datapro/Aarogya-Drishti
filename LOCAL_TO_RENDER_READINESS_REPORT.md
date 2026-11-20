# Aarogya Drishti — Local → Render Production Readiness Report

**Type:** READ-ONLY audit  
**Date:** 2026-11-17  
**Scope:** Preserve existing local functionality; assess parity on Render.  
**Constraints honored:** No code/SQL/.env/Render changes; no migrations; no deploys; no secret values printed.

**Evidence sources:** project source, `backend/.env.example`, `frontend/.env.production`, root `Dockerfile`, `aipipe` Dockerfile, prior DB audits (`DATABASE_COMPLETE_AUDIT_REPORT.md`, `DATABASE_BOOTSTRAP_VERIFICATION_REPORT.md`).  
**Not inspected:** Live Render dashboard env values (operator must confirm on Render UI).

---

## 1. Executive summary

| Area | Status |
|------|--------|
| Local app architecture (CRA + Express + FastAPI + Postgres + Supabase) | **PASS** — production-oriented same-origin design exists |
| Frontend production API wiring | **PASS** — `REACT_APP_API_URL=/api` |
| Backend listen / SPA hosting | **PASS** — `0.0.0.0`, `PORT`, SPA fallback after `/api` |
| DB connection code vs Render `DATABASE_URL` | **CRITICAL** — app uses **`DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_PORT`**, not `DATABASE_URL` |
| MFA / JWT / cookies for HTTPS | **PASS** with correct env |
| Existing Render DB (bootstrap + partial migrations) | **WARNING / CONFLICT** — do not blind-apply 004–043; use only-003 for admin if still needed |
| Fresh Render Postgres | **PASS** via `AAROGYA_BOOTSTRAP_FINAL.sql` (empty DB only) |
| AI pipeline | **PASS** if private Render service + matching token + Cloudflare env |
| Supabase private storage | **PASS** if all three Supabase vars set (HTTPS required) |

**Bottom line:** The codebase is largely Render-ready **if** environment variables match what the **source** reads, the SPA is built into the web service, AI and Supabase are configured, and the database strategy matches whether the Render DB is empty or already partially migrated.

---

## 2. Features working locally (from architecture + prior audits)

These modules exist end-to-end in source and are supported by the local `Aarogya` schema (97 tables):

| Feature | Local support | Notes |
|---------|---------------|-------|
| Login / JWT access + refresh cookie | Yes | `ad_refresh` httpOnly cookie |
| MFA enroll (QR) + verify | Yes | Needs valid `MFA_ENCRYPTION_KEY` |
| SUPER_ADMIN / SYSTEM_ADMIN | Yes | Local: SUPER_ADMIN active; SYSTEM_ADMIN inactive post-011 |
| Registration (two-stage) | Yes | `015` in local history |
| Role dashboards / RBAC pages | Yes | Dynamic page permissions |
| Patients / consent | Yes | Append-only consents |
| Screening + photo upload | Yes | Supabase private storage when configured; legacy `PHOTO_STORAGE_DIR` exists |
| AI assessment | Yes | Express → FastAPI (`AI_PIPELINE_*`) |
| Clinical review / sign-off | Yes | |
| Specialist decisions / availability | Yes | |
| Diagnostics / navigator workflow | Yes | |
| Referrals / hospital appointments | Yes | |
| Care plans / follow-ups | Yes | |
| Video consultation (Jitsi) | Yes | Public `meet.jit.si` rooms |
| Notifications | Yes | |
| Audit / exports | Yes | |
| Offline HW vault (frontend) | Yes | Browser-side; not a Render dependency |

**Status label for “actually works locally”:** **PASS** for core product paths **when** local `.env` is complete (DB, JWT, MFA key, Supabase, AI). Incomplete local env causes **503** on MFA/storage/AI — that is configuration, not missing features.

---

## 3. Features not working / degraded locally (typical)

| Issue | Status | Cause |
|-------|--------|-------|
| MFA login without `MFA_ENCRYPTION_KEY` | **FAIL** locally too | Source returns `503 MFA_NOT_CONFIGURED` |
| Image upload without Supabase trio | **FAIL** | `IMAGE_STORAGE_UNAVAILABLE` |
| AI analysis without pipeline / token | **FAIL** | `AI_PIPELINE_*` errors |
| Password reset email/SMS | **WARNING** | `PASSWORD_RESET_DELIVERY` email/sms “not configured yet” |
| SYSTEM_ADMIN login after role unify | **FAIL** by design | Role `is_active=false`; use SUPER_ADMIN |

---

## 4. Frontend readiness

| Check | Finding | Status |
|-------|---------|--------|
| API base URL | `frontend/src/services/api.js`: prod default `/api`; override `REACT_APP_API_URL` | **PASS** |
| Production env file | `frontend/.env.production` → `REACT_APP_API_URL=/api` | **PASS** |
| Dev localhost | Dev uses `http://localhost:5000/api`; `setupProxy.js` → `127.0.0.1:5000` | **PASS** (dev only) |
| Credentials / refresh | `withCredentials: true` | **PASS** |
| Hardcoded production hostnames in `src/` | None found beyond localhost defaults | **PASS** |
| SPA routing | Backend `mountFrontendStatic` after `/api`; Express 5 `/{*path}` fallback | **PASS** |
| Docker build | Dockerfile sets `REACT_APP_API_URL=/api` at build time | **PASS** |
| Native Render build | `npm run build:native` / `sync:frontend` → `backend/public` | **PASS** if build command used |

**CORS:** `cors({ origin: config.frontendUrl, credentials: true })`. Same-origin SPA still sends `Origin`; set `FRONTEND_URL` to the **exact public HTTPS site URL** on Render.

---

## 5. Backend readiness

| Check | Finding | Status |
|-------|---------|--------|
| Start | `npm start` → `node server.js` | **PASS** |
| Bind | `LISTEN_HOST` default **`0.0.0.0`**, `PORT` from env (default 5000) | **PASS** |
| Trust proxy | `TRUST_PROXY` via `resolveTrustProxy`; production default hop **1** | **PASS** |
| Health | `GET /api/health` | **PASS** |
| API mounts | auth, registrations, masters, dashboard, locations, facilities, admin, reports, audit, district, patients, screenings, MO, navigator, specialist, hospital-staff, health-worker, video, notifications, diagnostics, tracking | **PASS** |
| SPA after API | Yes | **PASS** |
| Refresh cookie | `secure: isProduction`, `sameSite: "strict"`, path `/api/auth` | **PASS** on HTTPS |
| JWT | `JWT_SECRET` ≥ 32 bytes required at boot | **PASS** / blocker if missing |
| DB pool | Discrete `DB_*` + optional `DB_SSL` | See §6 / blockers |

### Environment variables the **source** actually reads (backend)

Verified from `config.js`, `db.js`, `cookies`, `bootstrap`, services — **names only**:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | production vs development |
| `PORT` | Listen port (Render injects) |
| `LISTEN_HOST` | Optional; default `0.0.0.0` |
| `TRUST_PROXY` | Proxy hop trust |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Postgres (required) |
| `DB_SSL`, `DB_SSL_CA`, `DB_SSL_CA_FILE` | TLS to managed Postgres |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access tokens |
| `REFRESH_TOKEN_TTL_HOURS` | Session cookie lifetime |
| `MFA_ENCRYPTION_KEY` | TOTP secret encryption (32-byte Base64) |
| `FRONTEND_URL` | CORS allowlist |
| `FRONTEND_BUILD_PATH` | Optional SPA path |
| `PASSWORD_RESET_DELIVERY` | console / none / email / sms |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Private images |
| `AI_PIPELINE_URL`, `AI_PIPELINE_AUTH_TOKEN`, timeouts | FastAPI client |
| `SETUP_TOKEN_ENCRYPTION_KEY` | District admin setup links |
| `SMTP_*` | Invitation email |
| `SYSTEM_ADMIN_USERNAME`, `SYSTEM_ADMIN_PASSWORD`, `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_FULL_NAME` | Bootstrap admin |
| `VIDEO_PROVIDER`, `JITSI_DOMAIN` | Video |
| `PHOTO_STORAGE_DIR` | Legacy local photos |
| `REAL_ESRGAN_MAX_INPUT_SIDE` | Enhancement sizing |
| `MIGRATION_TRUSTED_DATABASE_NAME`, `MIGRATE_APPROVE_003` | Migrator gates only |

**Not used by runtime pool:** `DATABASE_URL` (tests only via `TEST_DATABASE_URL`).

---

## 6. Database readiness

| Item | Status | Notes |
|------|--------|-------|
| Local `Aarogya` schema | **PASS** | 97 tables; full workflows |
| `AAROGYA_BOOTSTRAP_FINAL.sql` | **PASS** | Empty DB initializer; matches local tables |
| `ALL_IN_ONE (1).sql` | **WARNING** | Baseline only (71 tables) — not full product |
| Migrations 001–043 | **PASS** locally recorded; **WARNING** on existing Render | Blind apply unsafe |
| `033a` | **WARNING** | Manual recovery; migrator regex ignores |
| Fresh Render Postgres plan | **PASS** | Load BOOTSTRAP_FINAL on empty DB; do not wipe populated Render |
| Existing Render DB | **WARNING** | Prefer status-only migrate; only-003 for admin; never 011 on two-stage |

**Safe fresh initialization (empty DB only):**

1. Create empty Postgres on Render.  
2. `psql` load `backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql`.  
3. Set `DB_*` + `DB_SSL=require` (or verify-full + CA).  
4. Set secrets; start API; let `bootstrap.js` create first admin **or** seed.  
5. `npm run migrate` (no `--apply`) → expect up to date.

**Do not** run BOOTSTRAP_FINAL against a DB with live data (`DROP SCHEMA public CASCADE`).

---

## 7. AI service readiness

| Check | Finding | Status |
|-------|---------|--------|
| Stack | FastAPI + uvicorn, `aipipe/aipipe` | **PASS** |
| Bind | `0.0.0.0` + `PORT` | **PASS** |
| Auth | Bearer `AI_PIPELINE_AUTH_TOKEN` ≥ 32 chars | **PASS** |
| Dockerfile | Private service; healthcheck on `/health` | **PASS** |
| Cloudflare env | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`, model, timeout | **Required** for real vision |
| Backend default URL | `.env.example` points at Render aipipe host pattern; code default `http://127.0.0.1:8010` | **WARNING** — production must set `AI_PIPELINE_URL` explicitly |
| Network | Backend must reach private aipipe URL | **NEEDS VERIFICATION** on Render |

---

## 8. Storage readiness

| Check | Finding | Status |
|-------|---------|--------|
| Production path | Supabase private bucket via service role | **PASS** design |
| Required vars | URL + service role key + bucket | **PASS** if set |
| HTTPS enforcement | Non-loopback must be `https:` | **PASS** |
| Ephemeral disk | Dockerfile clears `./storage`; PHI not in container FS | **PASS** |
| Legacy `PHOTO_STORAGE_DIR` | Still in config for older local photos | **WARNING** — do not rely on Render disk |

---

## 9. Render configuration (from repo)

| Item | Repo evidence | Status |
|------|---------------|--------|
| Docker web service | Root `Dockerfile`: CRA build → Express + `frontend/build` | **PASS** |
| Start command | `npm start` / `node server.js` | **PASS** |
| Build (native alternative) | `build:native` + `sync:frontend` into `backend/public` | **PASS** if Root Directory = `backend` |
| `render.yaml` | **Not found** in repo | **NEEDS VERIFICATION** — dashboard settings unknown |
| PORT | Uses `process.env.PORT` | **PASS** |
| Separate aipipe service | `aipipe/aipipe/Dockerfile` | **PASS** pattern |

Operator must confirm on Render UI (not visible in this audit): build/start commands, linked Postgres, env map, private networking to aipipe.

---

## 10. Missing / critical environment variables (production)

### Critical blockers if missing

| Variable | Impact |
|----------|--------|
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (+ `DB_PORT`) | **Boot fail** — `DATABASE_URL` alone is **insufficient** |
| `DB_SSL=require` (typical Render) | Connection fail without TLS |
| `JWT_SECRET` (≥32 bytes) | **Boot fail** |
| `MFA_ENCRYPTION_KEY` (32-byte Base64) | MFA roles cannot login/enroll |
| `FRONTEND_URL` = `https://<your-web>.onrender.com` | CORS / origin mismatch risk |
| `NODE_ENV=production` | Cookie `secure`, delivery defaults |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Screening/photo workflows **503** |
| `AI_PIPELINE_URL`, `AI_PIPELINE_AUTH_TOKEN` | AI analysis fails |
| `SETUP_TOKEN_ENCRYPTION_KEY` | District admin setup links fail |
| `SYSTEM_ADMIN_*` | First-admin bootstrap on empty DB |

### Strongly recommended

| Variable | Why |
|----------|-----|
| `TRUST_PROXY=1` | Correct client IP behind Render (or rely on production default) |
| `SMTP_*` | Setup invitation emails |
| Matching aipipe Cloudflare vars | Real oral AI |

---

## 11. Critical deployment blockers

1. **CRITICAL:** Runtime DB config ignores `DATABASE_URL` — must map Render Postgres into `DB_*` (and SSL).  
2. **CRITICAL:** Same-origin SPA must be **built and present** (`Dockerfile` or `sync:frontend`); otherwise API-only.  
3. **CRITICAL:** `MFA_ENCRYPTION_KEY` stable and valid — changing it breaks enrolled authenticators.  
4. **CRITICAL:** `FRONTEND_URL` must match the public HTTPS origin.  
5. **CRITICAL:** Supabase + AI env for full clinical screening parity.  
6. **CONFLICT:** Existing Render DB — do not `BOOTSTRAP_FINAL` wipe; do not blind `migrate --apply` 004–043; use **only-003** if SUPER_ADMIN promotion still pending.  
7. **WARNING:** `033a` not in migrator list — ignore for greenfield bootstrap.  
8. **WARNING:** Jitsi rooms are public once name is known — product risk, not a deploy break.

---

## 12. Local vs production differences

| Topic | Local | Production (Render) |
|-------|-------|---------------------|
| Frontend URL | `localhost:3000` CRA | Same-origin Express HTTPS |
| API URL | `localhost:5000/api` | `/api` |
| DB SSL | often `disable` | `require` / verify-full |
| Cookies | `secure:false` | `secure:true` |
| Trust proxy | loopback | hop count 1 |
| Photos | may use local dir | Supabase only (durable) |
| AI | localhost:8010 or remote | Dedicated private service |
| Migrations | already applied | Empty → BOOTSTRAP_FINAL; existing → careful/status/only-003 |

---

## 13. Step-by-step deployment plan (do not execute here)

### A. Greenfield Render (recommended for “same as local full schema”)

1. Create Render **Web** service from repo (Docker root Dockerfile **or** Node with Root Directory `backend` + frontend build sync).  
2. Create Render **Postgres**; note host/db/user/password.  
3. Load **`AAROGYA_BOOTSTRAP_FINAL.sql`** into the **empty** DB via external `psql` (not from this audit).  
4. Create private **aipipe** web service from `aipipe/aipipe` Dockerfile; set Cloudflare + `AI_PIPELINE_AUTH_TOKEN`.  
5. Set backend env: all Critical vars in §10; `AI_PIPELINE_URL` to private aipipe URL; Supabase; `FRONTEND_URL` to public site URL.  
6. Deploy web service; confirm logs: Postgres connected, frontend build served, listen `0.0.0.0:$PORT`.  
7. Open `/api/health`; open site; enroll MFA for SUPER_ADMIN; smoke-test workflows (§14).

### B. Existing partially migrated Render DB

1. **Do not** load BOOTSTRAP_FINAL.  
2. Confirm `current_database()` and migration status (read-only).  
3. Deploy code with only-003 support if SYSTEM_ADMIN still cannot login.  
4. Run **only-003** promote with dual approval + trusted DB name (prior procedure).  
5. Leave 004–043 pending until a written compatibility plan exists.  
6. Ensure Supabase/AI/MFA/FRONTEND_URL as above.

---

## 14. Post-deployment testing checklist

- [ ] `GET /api/health` → success + database connected  
- [ ] SPA loads at `/` and client routes refresh without 404 HTML for `/api`  
- [ ] Login password → MFA enroll/verify for SUPER_ADMIN  
- [ ] Refresh session (cookie) after access token expiry  
- [ ] Logout clears session  
- [ ] Create/list patients; record consent  
- [ ] Screening photo upload to Supabase; retrieve authorized image  
- [ ] AI analysis completes (pipeline reachable + token match)  
- [ ] MO clinical review / assignment path  
- [ ] Specialist decision / availability  
- [ ] Diagnostic order / navigator step  
- [ ] Referral + hospital appointment  
- [ ] Video join link issued  
- [ ] Notification appears  
- [ ] Audit log entry for login/MFA  
- [ ] CORS: no browser origin errors  
- [ ] HTTPS cookie present (`Secure`, `HttpOnly`) on `/api/auth/refresh`

---

## 15. Readiness scorecard

| Area | Status |
|------|--------|
| 1. Features working locally | **PASS** (with complete local env) |
| 2. Features not working locally | MFA/storage/AI without secrets; inactive SYSTEM_ADMIN |
| 3. Frontend readiness | **PASS** |
| 4. Backend readiness | **PASS** (env-dependent) |
| 5. Database readiness | **PASS** greenfield via BOOTSTRAP_FINAL; **WARNING** existing Render |
| 6. AI service readiness | **PASS** if separate service configured |
| 7. Storage readiness | **PASS** if Supabase set |
| 8. Render configuration (repo) | **PASS** Docker/native patterns; dashboard **NEEDS VERIFICATION** |
| 9. Missing env vars | See §10 — especially **`DB_*` vs `DATABASE_URL`** |
| 10. Critical blockers | §11 |
| 11. Deployment plan | §13 |
| 12. Post-deploy tests | §14 |

---

**No code, SQL, `.env`, Render settings, migrations, or deploys were changed.**  

**Awaiting your approval before any remediation or deployment actions.**
