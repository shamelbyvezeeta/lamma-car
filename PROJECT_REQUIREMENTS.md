# Project Requirements — Lamma Car

This file maps every requirement in the master brief to what was implemented, where, and how it was verified. Status legend: **Done + tested** (automated test exists), **Done + visually checked** (screenshot QA), **Done, not tested**, **Pending external**, **Pending decision**.

## 1. Product concept
| Requirement | Status | Where |
|---|---|---|
| Admin team registers owner and vehicle | Done + tested | `/admin/customers`, `/admin/vehicles` · tests B, C |
| Unique QR assigned, activated by authorised admin | Done + tested | `services/qr.js`, DB trigger `trg_qr_guard` · tests D/E |
| Branded sticker inside rear windshield, scannable from outside | Design + spec done; **physical validation pending** | `sticker/`, `docs/STICKER_PRINT_SPECIFICATIONS.md` |
| Visitor sees approved info subject to privacy | Done + tested | `/q/:code`, DB function `public_qr_card()` · tests F/G |

## 2. Brand
| Requirement | Status | Notes |
|---|---|---|
| Original Lamma logo preserved | Done | Only the supplied PNG is used; variants are crops/resizes (`scripts/build-brand-assets.js`). No redraw. |
| Palette Navy/Coral/Lavender/Cream | Done | CSS tokens in `public/css/base.css`; functional status colours documented separately |
| Manrope (EN) / Alexandria (AR), weights as specified | Done | Self-hosted WOFF2 (web) + TTF (PDF) |
| Vector original logo | **Pending external** | Only a raster PNG was supplied — see PENDING_DECISIONS |

## 3. Sticker system
Spec, production files (proof PDF, CMYK-mirrored + white + cut PDF, 600 dpi PNG, editable SVG) and physical test checklist: **Done (engineering design)**. Physical tests: **Pending external** (requires printed samples and a car).

## 4. QR code system
| Requirement | Status |
|---|---|
| Unique identifier, unique secure URL, batch, customer, vehicle, dates, status | Done + tested |
| Statuses generated / available / assigned / active / suspended / deactivated | Done + tested (state machine in DB trigger) |
| Only authorised admins activate/suspend/deactivate | Done + tested (server + DB) |
| Inactive/suspended/deactivated never expose info | Done + tested (no-leak assertions) |
| Never reuse identifiers; prevent duplicate assignment | Done + tested (unique indexes + immutability triggers) |
| No internal IDs in public URLs | Done + tested (public code is a separate random value) |
| Dynamic: info editable without reprint | Done + tested |

## 5. Batch management
Create (unique name + auto reference), bulk generation (≤5,000/batch, single transaction, idempotent), view/filter codes, release to stock, close, CSV export, PDF per batch with configurable layouts, regeneration without new identifiers: **Done + tested**.

## 6. Customers & vehicles
CRUD, search, multiple vehicles per customer, relationship Customer → Vehicle → QR → Batch → Sale: **Done + tested**. Vehicle photo upload with metadata stripping and approval: **Done + tested**.

## 7. Privacy & contact
| Requirement | Status |
|---|---|
| Owner controls phone visibility | Done + tested |
| Hidden number never in page source / API / URL / public queries | Done + tested (DB read model returns NULL) |
| Consent and changes recorded | Done + tested (append-only `consent_records`) |
| Privacy-protective default until recorded | Done + tested (`not_set` ≡ private) |
| Alternative contact mechanism | Built as internal **message relay**, **disabled by default** pending business approval. No third-party provider, no WhatsApp. |

## 8. Public landing page
Mobile-first, AR/EN, RTL/LTR, logo, approved photo, make/model/year/colour, approved details, contact CTA, tagline, safe error/empty states: **Done + tested + visually checked**.

## 9. Sales
Record/edit/search/filter/export, link to customer/vehicle/QR/batch, revenue = paid only, dashboard figures from live data: **Done + tested**. No payment gateway (not requested; not invented).

## 10. Admin dashboard
All 11 modules, search/filter/sort/pagination, validation, messages, confirmations, responsive, AR/EN, RBAC on server, secure first-admin CLI: **Done + tested**.

## 11–14. Database, language, security, reports
See `DATABASE_SCHEMA.md`, `SYSTEM_ARCHITECTURE.md`, `TEST_REPORT.md`. Reports for customers, vehicles, QR codes, batches, sales, revenue, activation in CSV and PDF: **Done + tested**.

## 17. Deployment
Production build, env template, migrations, Docker image definition, guides: **Done**. Production-mode run tested locally behind a simulated TLS proxy. Docker image build and real hosting: **Pending external** (no Docker daemon / hosting credentials in the build environment).

## Out of scope / not implemented (by design)
- Payment gateway, SMS, WhatsApp, e-mail sending — not approved, not invented.
- Customer self-service portal — the brief specifies admin-managed records.
- Native mobile apps — the public page is a mobile web page.
