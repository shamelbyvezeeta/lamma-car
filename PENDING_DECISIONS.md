# Pending Decisions & External Actions

Implementation defaults are marked **[default]**; they are configurable and safe, but need an owner decision.

## A. Blocking before the first real print run
| # | Item | Why it matters | Current state |
|---|---|---|---|
| A1 | **Production domain / `QR_BASE_URL`** | Printed into every sticker; cannot change afterwards. Shorter = larger QR modules (≤ 34 chars → 1.76 mm modules) | Not set. Sample files use `https://lamma-car.example/q` |
| A2 | **Physical sticker tests** (STICKER_PRINT_SPECIFICATIONS §9) | Material, adhesive, tint, defroster lines and scan distance are engineering estimates | Not performed |
| A3 | **Printer selection & proof** | Confirm CMYK values, white opacity, spot names (`White`/`CutContour` or e.g. `RDG_WHITE`), sheet layout | Defaults set; configurable |
| A4 | **Legal check** — rear-window stickers in Egypt (size/position/visibility rules) | Compliance | Not checked |

## B. Brand assets
| # | Item | State |
|---|---|---|
| B1 | **Vector logo** (SVG/AI/PDF) of the Lamma Car lockup | Missing — only a 2172 × 724 PNG was supplied. Used as-is (≈ 550 dpi at 70 mm on the sticker). Required for screen printing and crisp large formats |
| B2 | Reversed logo for dark backgrounds | Missing — logo is only used on light backgrounds |
| B3 | Arabic tagline | Not approved — the English tagline is used everywhere |
| B4 | Arabic rendering of the brand name | Not approved — “Lamma Car” is kept in Latin script in Arabic UI |

## C. Business / product decisions
| # | Decision | Default implemented |
|---|---|---|
| C1 | **Alternative contact channel** for owners who hide their number | Internal *message relay* (stored in Lamma, staff call the owner). **[default: OFF]** — Settings → Enable message relay. No SMS/WhatsApp/third party |
| C2 | Sticker price & currency | No default price; currency **[default: EGP]** |
| C3 | Sales channels list | direct, showroom, event, partner, online (migration seed) |
| C4 | Public card optional fields | Category, approved photo, extended details **[default: ON]**; price/mileage per vehicle opt-in |
| C5 | Who may see full phone numbers in bulk exports | Super Admin only **[default]** |
| C6 | Support phone/e-mail shown on inactive/private pages | Empty **[default]** |
| C7 | Replacement sticker policy & fees | System supports deactivate → assign new; no fee logic |
| C8 | Data retention (archived customers, contact requests, audit logs) | Kept indefinitely; no automatic deletion |
| C9 | Customer-facing privacy notice / terms on the public page | Not written — needs legal text |
| C10 | Batch size ceiling | 5,000 codes per batch |

## D. External access needed from you
1. Hosting account (or server) + PostgreSQL credentials → deploy per DEPLOYMENT_GUIDE.
2. DNS control for the chosen domain + TLS.
3. Print vendor contact for proofs and RIP spot names.
4. A test vehicle (ideally 3: clear glass, factory privacy glass, aftermarket film) for §9 tests.
5. If an existing Lamma Mobility repository should host this module, share access — this build is standalone because the workspace contained no prior code.
