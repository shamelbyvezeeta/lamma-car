# Test Report

**Date:** 2026-11-07 · **Environment:** Linux build container, Node 22.23.4, PostgreSQL 16.15, Chrome for Testing 153 (headless) · **Result: 61 / 61 automated tests passed**, 0 failed, 0 skipped.

Run yourself: `TEST_DATABASE_URL=postgres://…/lamma_car_test npm test` (the test database is dropped and re-migrated on each run).

## 1. Automated tests (`tests/system.test.js` — real PostgreSQL, real HTTP, sessions and CSRF)

### A. Authentication & authorisation — 8 passed
- rejects wrong password and does not reveal whether the email exists
- admin login succeeds and dashboard renders live figures
- locks the account after 5 failed attempts
- redirects anonymous users to login and returns 401 JSON for API
- rejects state-changing requests without a valid CSRF token
- enforces role permissions on the server (not just hidden buttons) — operator/admin forced POSTs return 403 and create nothing
- forces a password change for new users and disables sessions of deactivated users
- prevents removing the last Super Admin

### B. Customers — 7 passed
validates required fields and phone format · creates a customer (Arabic name, Arabic-Indic digits normalised) with privacy defaulting to not_set · rejects a duplicate mobile number · requires a consent method when recording a privacy choice at creation · edits a customer and records an audit entry · searches by name, mobile fragment and reference · only admins can archive customers

### C. Vehicles — 5 passed
validates vehicle input · creates vehicles under a customer (multiple per customer) · edits vehicle information · a vehicle can never be moved to another customer (DB-enforced) · accepts a photo, strips metadata, requires approval, rejects non-images

### D/E. Batches & QR codes — 11 passed
generates 200 unique, well-formed identifiers in one transaction (idempotent resubmission) · rejects duplicate batch names and out-of-range quantities · DB refuses duplicate public codes · cannot assign codes from an unreleased batch · releases batch to stock · assigns by printed serial; prevents double assignment and reuse (DB triggers verified) · only admins can activate/suspend/deactivate · suspend requires a reason; reactivation keeps the original activation date; full status history verified · invalid transitions rejected incl. DB guard · deactivation is permanent; replacement sticker works · batch CSV + 4 PDF variants regenerate **without creating identifiers**

### E2. PDF dimensions and readability — 2 passed
- A4 proof PDF has page size 595.28 × 841.89 pt and ⌈199/4⌉ = 50 pages (deactivated code excluded)
- the first sticker on page 1, rasterised at 300 dpi and cropped to the 90 × 130 mm cell, **decodes to the exact public URL** (jsQR)

### F/G. Privacy & public landing page — 10 passed
- active code with phone *not recorded*: page renders; response contains **no** mobile number, customer/vehicle/QR UUIDs, owner name, e-mail or internal notes; `Cache-Control: no-store`; `X-Robots-Tag: noindex`
- phone *public* → `tel:` link appears; switching to *private* removes it immediately; consent history has both entries; consent table is append-only
- privacy change without consent method is rejected
- DB read model returns `public_phone = NULL` and no identifiers
- listing status and show_price/show_mileage flags honoured
- approved photo served only for active codes
- invalid / unknown → 404; available, suspended, deactivated → 410 with **identical** content and no vehicle data; photo 404 when suspended
- inactive customer hides contact details even with an active code
- Arabic default `lang="ar" dir="rtl"`, English `dir="ltr"`
- message relay: off by default; requires setting **and** owner opt-in; validation; CSRF; request visible to staff

### H. Sales — 5 passed
records a sale linked to customer, vehicle, sticker and derived batch (idempotent) · rejects mismatched vehicle/customer/sticker and negative amounts · operators edit only status/notes on their own sales; admins edit amounts · revenue counts **paid only** (cancelled/pending excluded) and dashboard KPIs equal direct SQL counts · filters by status/date range; CSV export; operator export forbidden

### I. Security & reports — 9 passed
CSP / frame-ancestors / nosniff headers, no `X-Powered-By` · stored XSS escaped · SQL-like input treated as data · invalid-code lookups rate-limited (429) · audit log append-only and records exports · customer export masks mobiles for Admin, full for Super Admin · all 7 reports render as CSV and PDF (Arabic) · CSV formula neutralisation · **every admin page (24) renders for all 3 roles in both languages** with only 200/403 responses and no untranslated keys

## 2. Automated tests (`tests/print-and-i18n.test.js`) — 4 passed
- Arabic and English dictionaries have identical keys, none empty
- every static translation key used in templates/code exists
- sticker geometry: QR panel inside the 4 mm safe margin, version 4 for a 34-char URL, module ≥ 1.7 mm, 4-module quiet zone
- the **mirrored CMYK production page**, when flipped (as seen from outside through glass), decodes to the exact URL

## 3. Visual QA (Chrome headless; screenshots in `docs/screenshots/`)
| Viewport | Checked |
|---|---|
| Mobile 390 × 844 @2x | Public card (AR/EN), private-contact card, inactive page, dashboard (AR/EN), customer list |
| Tablet 834 × 1112 | Batch detail |
| Desktop 1440 × 900 | Login, dashboard (AR/EN), customer, vehicle, QR, batch, sales, new sale, reports, settings, users, activity |

Horizontal-overflow check (script measuring `scrollWidth` vs viewport at 390 px) on 18 admin and public pages in both languages: **no overflow** after fixes. No browser console errors (the only logged “error” is the intentional HTTP 410 of the inactive page).

## 4. Other verification
- **Production mode** run locally behind a simulated TLS proxy: login → 303, session cookie `Secure`, HSTS and CSP present, dashboard 200.
- **Migrations** applied to a clean PostgreSQL 16 database (dev DB once; test DB on every run). Checksum guard verified by design (not by a dedicated test).
- **Performance**: 1,000-code A4 PDF in ≈ 2.1 s (2.6 MB).

## 5. Issues found and fixed during QA
| Issue | Fix |
|---|---|
| Customer page 500 when an optional select value was undefined | `select` macro null-safe |
| PDFKit resolved spot colour `White` to the CSS colour white (white layer printed as nothing/black) | spot names now take precedence |
| Mobile dashboard overflowed horizontally (table inside grid track) | grid tracks `minmax(0,1fr)`, `min-width:0` |
| Heading icons rendered oversized | explicit icon sizing |
| RTL chart labels clipped | chart forced LTR, last label end-anchored |
| Long Arabic spec labels wrapped on the public card | shorter public labels |

## 6. Not tested (requires physical or external access)
- Printing, installation and scanning of real stickers (see STICKER_PRINT_SPECIFICATIONS §9 checklist)
- Real phones (iOS/Android camera apps) against a deployed HTTPS domain
- Docker image build (no Docker daemon in build environment)
- Production hosting, DNS/TLS, managed database, backups and restore
- Load testing beyond single-user QA
- Screen-reader audit (semantic HTML, labels, focus states and contrast were applied but not audited with assistive technology)
