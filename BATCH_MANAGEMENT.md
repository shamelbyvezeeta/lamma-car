# Batch Management

## Lifecycle
1. **Create** (Admin/Super Admin) — `Batches → New batch`: unique name, quantity 1–5,000, notes. A reference `B-YYYY-NNNN` is assigned. All codes are created in one transaction with status **Generated**. The form carries a one-time token; double-clicking or resubmitting returns the same batch.
2. **Print** — download PDFs (any number of times). PDFs are regenerated from stored codes; **no identifier is ever created by printing**.
3. **Release to stock** — after the printed sheets are checked, `Release` moves every Generated code to **Available**. Only Available codes can be assigned.
4. **Assign** (any role) — from a vehicle page, enter the serial printed on the sticker (`LC-000123`).
5. **Activate** (Admin) — public page goes live.
6. **Close batch** (optional) — remaining Available codes can no longer be assigned; active stickers keep working.

## Batch record
Batch ID (UUID, internal) · reference · name · quantity · created at/by · released at/by · status (Generated/Released/Closed) · live counts: generated, available, assigned, active, suspended, deactivated, ever assigned, ever activated.

## Finding codes
`Batches → <batch>` lists codes with search (serial, code, owner, vehicle) and status filter. `QR codes` lists all codes with status chips and batch filter (`?batch=B-2026-0001`).

## Exports
- **CSV** (`Export CSV`): serial, public code, full URL, batch, status, customer ref, vehicle ref, created/assigned/activated/deactivated timestamps. UTF-8 with BOM (opens correctly in Excel). No names or phone numbers.
- **Reports → QR codes / Batches / Activation performance**: CSV and PDF.

## Print PDFs
Choose **sheet layout**, **file** and **codes**:

| File | Use |
|---|---|
| Proof (as seen from outside) | Check codes, layout and colours. RGB, reading orientation. Not for production. |
| Print — CMYK, mirrored | Colour layer for reverse (second-surface) printing on clear film |
| Print — white underlay | Spot colour `White` (configurable), mirrored, printed after CMYK |
| Cut contour | Spot colour `CutContour` (configurable), mirrored; trim 90 × 130 mm, R6 |

“Codes”: *All printable codes* (everything except deactivated) or *Unassigned only* (stock). A single sticker can be reprinted from its QR page (same identifier).

All four files of a batch use the same grid, mirrored identically, so layers register with each other. Each page has a slug line (batch, page x/y, variant, timestamp, user) when the bottom margin allows.

## Sheet layouts (Settings → Sticker sheet layouts, Super Admin)
Seeded layouts: A4 2 × 2, A3 3 × 3, Single sticker per page (98 × 138 mm, for print shops/plotters — default for single reprints). New layouts are validated: stickers + gaps must fit the page; gaps ≥ 2 × bleed; margins ≥ bleed. Crop marks are drawn only where space allows.

## Performance (measured in build environment)
1,000 codes on A4 2 × 2 (250 pages): CMYK file ≈ 2.1 s and 2.6 MB; white-underlay file ≈ 0.6 s and 0.2 MB (build environment, single core). Scales linearly.
