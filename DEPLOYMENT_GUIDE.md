# Deployment Guide

**Deployment status:** not deployed — no hosting account, domain or production database credentials were available. Everything below is ready to run; production mode was exercised locally behind a simulated TLS proxy (secure cookies, HSTS, CSP verified). The Docker image definition was written but could not be built in the build environment (no Docker daemon).

## 1. Requirements
- Node.js ≥ 20 (22 LTS recommended) **or** Docker
- PostgreSQL 14+ (16 recommended), extensions `pgcrypto` and `citext` (available on all major managed services, including Supabase, Neon, RDS, Cloud SQL, DigitalOcean)
- A persistent volume for vehicle photos (`STORAGE_DIR`)
- HTTPS termination (reverse proxy / platform load balancer)
- Outbound network: none required at runtime (fonts and assets are self-hosted)

## 2. Domain (decide before the first print run)
1. Choose the public domain, e.g. `car.lamma.<tld>` — keep `QR_BASE_URL` short (≤ 24 chars gives a version-4 QR with 1.76 mm modules).
2. Point DNS (A/AAAA or CNAME) to the host/load balancer; issue a TLS certificate (Let's Encrypt/platform-managed).
3. Set `QR_BASE_URL=https://<domain>/q` and `APP_BASE_URL=https://<domain>`.
4. **Never change `QR_BASE_URL` after stickers are printed.** If the domain must change later, keep the old domain redirecting `/q/*` permanently.

## 3. Database
```sql
-- as an admin user on the server
CREATE ROLE lamma_app LOGIN PASSWORD '<strong password>';
CREATE DATABASE lamma_car OWNER lamma_app;
\c lamma_car
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- if the app role cannot create extensions
CREATE EXTENSION IF NOT EXISTS citext;
```
Then: `DATABASE_URL=postgres://lamma_app:…@host:5432/lamma_car npm run migrate`. Re-running is safe; the runner takes an advisory lock and skips applied files.

**Supabase Postgres** works as a plain database: use the *Session pooler* or direct connection string, `DATABASE_SSL=true`. The app does not use Supabase Auth/Storage/Edge Functions; do not expose the database through the Supabase REST API (disable the Data API for these tables or keep RLS enabled with no policies).

Optional hardening for the public read path: create a role that can only `EXECUTE public_qr_card(text)` and point a second pool at it for `/q/*` routes (code change in `services/publicCard.js`).

## 4. Configuration
Copy `.env.example` → `.env` and set at least: `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL`, `SESSION_SECRET` (≥ 32 random chars), `QR_BASE_URL` (https), `TRUST_PROXY` (number of proxies), `STORAGE_DIR`. The app refuses to start in production with a short secret or a non-https QR base.

## 5. Run
**Docker (single server):**
```bash
export POSTGRES_PASSWORD='<strong>'
docker compose up -d --build        # runs migrations, then the app on 127.0.0.1:3000
```
Put Caddy/nginx in front for TLS, e.g. Caddy: `car.example.com { reverse_proxy 127.0.0.1:3000 }`.

**Node directly / PaaS (Render, Railway, Fly, App Service…):**
```bash
npm ci --omit=dev
npm run migrate
npm start                    # listens on $PORT
```
Health check: `GET /healthz` → `{"status":"ok"}` (checks the database).

## 6. First admin (secure bootstrap)
```bash
npm run create-admin -- --email owner@company.com --name "Full Name"
# password is prompted (hidden) — or set LAMMA_ADMIN_PASSWORD for non-interactive use, then unset it
```
The command only works while **no** Super Admin exists. All further users are created in the dashboard. No passwords are stored in code or seed files.

## 7. Storage
Photos are re-encoded WebP files in `STORAGE_DIR/photos`, named with random hex. They are served only through authorised routes (admin) or the public route for **active** codes with **approved** photos. Back up this directory with the database.

## 8. Backups (recommended)
- Managed Postgres: enable daily automated backups + point-in-time recovery (≥ 7 days).
- Self-hosted: nightly `pg_dump -Fc lamma_car > lamma_car-$(date +%F).dump`, keep 14 daily + 8 weekly, copy off-site, **test a restore monthly**.
- Photos: nightly sync of `STORAGE_DIR` to object storage.
- Keep `sticker/` masters and every batch CSV export with the print order.

## 9. Scaling & operations
- One app instance handles typical loads. For several instances: move rate limiting to the proxy (or a Redis store) and use shared storage for photos. Sessions are already in PostgreSQL.
- Logs: stdout/stderr (errors include method + URL; no request bodies or passwords are logged).
- Sessions expire after 8 hours of inactivity; expired rows are pruned every 15 minutes.

## 10. Troubleshooting
| Symptom | Fix |
|---|---|
| App exits: “Missing required environment variable” | Set the variable in `.env` / platform settings |
| “SESSION_SECRET must be at least 32 characters” / “QR_BASE_URL must use https” | Production safety checks — fix the values |
| Login loops back to the login page behind a proxy | Set `TRUST_PROXY` correctly and forward `X-Forwarded-Proto: https`; otherwise the secure cookie is not set |
| 403 “session expired or form is out of date” | Page was open across a sign-out/restart — reload; check that the proxy passes cookies |
| `permission denied to create extension` during migrate | Create `pgcrypto` and `citext` as a superuser once, then re-run |
| “Migration … was modified after being applied” | Revert the edit; put changes in a new migration file |
| Everyone gets 429 | Proxy not configured → all visitors appear as one IP. Set `TRUST_PROXY` |
| Arabic shows as boxes in PDFs | `assets/fonts/*.ttf` missing from the deployment |
| Photos disappear after redeploy | `STORAGE_DIR` is not on a persistent volume |
