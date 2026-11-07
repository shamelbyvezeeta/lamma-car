# Lamma Car

**Find it. Sell it. Easy.** — a Lamma Mobility service.

Lamma Car connects car owners with people who want to discover or contact them, through a branded QR sticker installed on the **inside** of the rear windshield and scanned from **outside**. This repository contains the complete platform: public QR landing page, admin dashboard, QR/batch engine, print-ready sticker PDFs, sales management, reports, and the database.

| Area | What's here |
|---|---|
| Public | Mobile-first landing page per sticker (`/q/<code>`), Arabic (default, RTL) and English (LTR), privacy-safe states for invalid / inactive / suspended codes |
| Admin | Dashboard, customers, vehicles, QR codes, batches & print PDFs, sales, contact requests, reports & exports, users, settings, activity log |
| Security | Server-side RBAC (Super Admin / Admin / Sales Operator), argon2id passwords, lockout, CSRF, CSP, rate limiting, append-only audit & consent logs, DB-level QR state machine |
| Print | Configurable sticker sheet layouts; proof / CMYK-mirrored / white-underlay / cut-contour PDFs; master design files in `sticker/` |

## Stack

Node.js 22 · Express 4 · server-rendered Nunjucks (no SPA, minimal JS) · PostgreSQL 16 · PDFKit + HarfBuzz (correct Arabic shaping in PDFs) · sharp (photo processing). See `docs/SYSTEM_ARCHITECTURE.md` for why.

## Quick start (local)

```bash
npm ci
cp .env.example .env            # set DATABASE_URL, SESSION_SECRET, QR_BASE_URL (http allowed outside production)
npm run migrate                 # applies migrations/ once each (checksummed)
npm run create-admin -- --email you@company.com --name "Your Name"   # first Super Admin; password prompted
npm start                       # http://localhost:3000/admin
```

Optional, for QA/demo only: `npm run seed:test` loads records flagged **TEST** (fictional +44 7700 900xxx numbers) and two test staff accounts with one-time random passwords.

## Tests

```bash
createdb lamma_car_test          # separate database; it is wiped on every run
TEST_DATABASE_URL=postgres://…/lamma_car_test npm test
```

61 automated tests (57 end-to-end) run against real PostgreSQL over HTTP (sessions, CSRF, roles, QR lifecycle, privacy leakage, PDF size + QR decode, sales maths, security). Results: `docs/TEST_REPORT.md`.

## Repository map

```
src/            app.js, server.js, config, db, routes/, services/, pdf/, lib/, middleware/, i18n/
views/          Nunjucks templates (layouts, admin/, public/, auth/, partials/)
public/         CSS, JS, self-hosted fonts, brand images derived from the original logo
migrations/     SQL schema (001_initial_schema.sql)
scripts/        migrate, create-admin, seed-test-data, build-brand-assets, build-sticker-files
sticker/        Master sticker design files (proof PDF, production PDF, 600 dpi PNG, editable SVG)
assets/         Original logo (unaltered) and TTF fonts used for PDF output
tests/          system.test.js (node:test + supertest), e2e/screens.js (visual QA)
docs/           Full documentation set (see below)
```

## Documentation

`docs/` — PROJECT_REQUIREMENTS · SYSTEM_ARCHITECTURE · DATABASE_SCHEMA · QR_CODE_SPECIFICATION · BATCH_MANAGEMENT · STICKER_PRINT_SPECIFICATIONS · BRAND_GUIDELINES · ADMIN_USER_GUIDE · DEPLOYMENT_GUIDE · TEST_REPORT · PENDING_DECISIONS · DELIVERY_REPORT

> **Before printing the first real batch:** fix the production domain (`QR_BASE_URL`). It is encoded into every sticker and cannot change afterwards. See `docs/PENDING_DECISIONS.md`.
