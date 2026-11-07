# System Architecture

## Context
The workspace contained no existing Lamma Mobility code or database — only the logo and the brief. Lamma Car is therefore built as a **standalone application** that can run on its own domain or sub-domain (e.g. `car.<lamma-domain>`). It shares no runtime with other Lamma products, so nothing existing could be affected.

## Stack and why
| Choice | Reason |
|---|---|
| **Node.js 22 + Express 4** | Mature, small surface, easy hosting anywhere |
| **Server-rendered HTML (Nunjucks, autoescape on)** | The public page must be fast on mobile data and must never ship private fields to the browser. Rendering on the server means only approved values ever reach HTML; there is no client API exposing records. Admin pages also work without JavaScript (JS only adds confirm dialogs, customer search, drawer). |
| **PostgreSQL 16** | Relational integrity, partial unique indexes, triggers for invariants, transactions, JSONB for audit details |
| **Supabase** | Not used. With server-rendering, all data access is server-side under one DB role, so Supabase RLS would add a second permission system without benefit. The equivalent guarantees are implemented as DB constraints/triggers and a `SECURITY DEFINER` public read function. Supabase Postgres can still host the database (see DEPLOYMENT_GUIDE). |
| **PDFKit + HarfBuzz (WASM) + bidi-js** | Vector PDFs with spot colours for print; HarfBuzz shapes Arabic correctly (PDFKit alone cannot) |
| **sharp** | Photo re-encoding (strips EXIF/GPS), logo derivatives, PNG rasterisation |
| **argon2id** (`@node-rs/argon2`) | Password hashing (OWASP parameters) |

## Components
```
Browser (visitor) ──GET /q/:code──▶ routes/public.js ──▶ services/publicCard.js ──▶ SQL public_qr_card(code)
Browser (staff)   ──/admin/*──────▶ routes/admin/*  ──▶ services/* (permission re-check, transactions) ──▶ PostgreSQL
                                                    └─▶ pdf/* (batch sheets, sticker, reports) ──▶ streamed PDF
```

- `src/app.js` — security headers (Helmet CSP), static assets, sessions (PostgreSQL store), locale, CSRF, user loading, error handling.
- `src/routes/admin/index.js` — login/logout, login rate limit, CSRF on every POST, auth gate, forced password change.
- `src/lib/permissions.js` — the single permission matrix. Routes use `requirePerm()`; services call `can()` again for sensitive operations (defence in depth).
- `src/services/*` — all business rules. Every write that touches more than one row runs in a transaction with row locks (`SELECT … FOR UPDATE`) and writes an audit entry in the same transaction.
- `src/pdf/sticker.js` — single geometry for the sticker, rendered to PDF and SVG.
- `src/i18n/{ar,en}.js` — all UI text; a test verifies parity and that no key is missing.

## Request lifecycle (admin write)
1. Session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production) → user reloaded from DB every request (deactivation is immediate).
2. CSRF token (synchronizer pattern, constant-time compare).
3. `requirePerm(...)` → 403 if role lacks permission.
4. `zod` schema validation → 422 with per-field errors.
5. Service: transaction, row locks, DB constraints/triggers, audit log.
6. PRG redirect (303) with flash message.

## Public page data flow
`/q/:code` normalises the code (Crockford Base32, case-insensitive), then calls the DB function `public_qr_card()`. That function returns **only** whitelisted columns and returns vehicle fields only for `active` codes, phone only when the owner chose `public` and the customer is active. The page is `Cache-Control: no-store` (suspension is instant) and `noindex`. Invalid codes → 404; any non-active state → 410 with identical content (no stock/customer information leaks).

## Security controls
| Threat | Control |
|---|---|
| Code enumeration | 50-bit random codes (32¹⁰), per-IP rate limits (60/min general; 30 invalid lookups / 15 min) |
| Private number leakage | DB read model, server rendering, tests scanning responses for numbers/IDs |
| Broken access control | Permission matrix on server + service-level checks + DB invariants |
| CSRF | Synchronizer token on all POSTs (admin and public contact form) |
| XSS | Autoescaping templates, strict CSP (`script-src 'self'`, no inline scripts) |
| SQL injection | Parameterised queries only; `LIKE` wildcards escaped |
| Brute force | argon2id, 5-attempt lockout (15 min), per-IP login limiter, timing equalisation for unknown emails |
| Session fixation | Session regenerated on login; sessions of disabled/reset users deleted |
| File upload abuse | 8 MB limit, magic-byte check via sharp, re-encode to WebP, metadata stripped, random file names, served only through authorised routes |
| CSV injection | Formula-leading cells prefixed with `'` |
| Tampering with history | `audit_logs`, `consent_records`, `qr_status_history` are append-only (triggers) |

## Scaling notes
- Rate limiting uses in-memory counters: correct for one instance. For multiple instances, put the limiter on the reverse proxy or swap the store (Redis) — documented in DEPLOYMENT_GUIDE.
- Photos are on local disk (`STORAGE_DIR`); use a persistent volume. Moving to object storage only requires changing `services/vehicles.js` (`setPhoto`/`photoPath`).
- PDFs are generated on demand and streamed. Measured: 1,000 codes (250 A4 pages) CMYK file in ≈2.1 s, 2.6 MB; a 5,000-code batch ≈ 10–12 s.
