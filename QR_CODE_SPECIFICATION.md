# QR Code Specification

## Identifier
| Item | Value |
|---|---|
| Public code | 10 characters, Crockford Base32 alphabet `0-9 A-H J K M N P-T V-Z` (no I, L, O, U) |
| Entropy | 32¹⁰ ≈ 1.13 × 10¹⁵ (50 bits) from `crypto.randomInt` |
| Uniqueness | DB unique constraint; generator retries collisions |
| Human reference | `serial_no` → printed as `LC-000123`; used by staff to assign stickers. The serial does **not** open the public page. |
| Internal ID | UUID, never appears in public URLs or pages |
| Input tolerance | Case-insensitive; `O→0`, `I/L→1` |

## Destination URL
`QR_BASE_URL + "/" + public_code`, e.g. `https://car.example.com/q/7KQ2M9XH4D`.
The URL is **permanent** once printed. The page behind it is dynamic: vehicle details, photo, privacy choice and status are read live, so stickers never need reprinting for data changes.

## Encoding
- Error correction **H** (≈30% recovery) — tolerates rear-window defroster lines and dirt.
- Byte mode, as produced by the `qrcode` library.
- Version depends on URL length (measured):

| URL length | Example | Version | Modules | Module size on sticker* |
|---|---|---|---|---|
| ≤ 34 chars | `https://car.lamma.app/q/XXXXXXXXXX` | 4 | 33 | **1.76 mm** |
| 35–46 chars | `https://car.lammamobility.com/q/XXXXXXXXXX` | 5 | 37 | 1.60 mm |

\* QR panel 72 × 72 mm including the 4-module quiet zone. Shorter domain ⇒ bigger modules ⇒ longer scan distance. Recommendation: keep `QR_BASE_URL` ≤ 24 characters (e.g. `https://lamma.car/q`).

## Statuses
| Status | Meaning | Public page |
|---|---|---|
| generated | Created in a batch not yet released | 410 “not active” |
| available | Printed and in stock | 410 “not active” |
| assigned | Linked to customer + vehicle | 410 “not active” |
| active | Live | 200 vehicle card |
| suspended | Temporarily disabled (reason required) | 410 “not active” |
| deactivated | Permanently retired (reason required); never reused | 410 “not active” |
| (unknown/malformed) | — | 404 “code not recognised” |

All non-active states return identical content so a visitor cannot learn whether a code is in stock, assigned or suspended.

## Permissions
| Action | Super Admin | Admin | Sales Operator |
|---|---|---|---|
| Generate/release/close batch, download PDFs | ✓ | ✓ | — |
| Assign available sticker to a vehicle | ✓ | ✓ | ✓ |
| Activate / reactivate / suspend / deactivate | ✓ | ✓ | — |

## Rules enforced in the database
Valid transitions only; identity immutable; owner immutable once set; one live code per vehicle; no deletes. Replacing a damaged sticker = deactivate old (reason) → assign new serial → activate.

## Rate limiting & caching
Per-IP: 60 requests/min on `/q/*`; 30 failed lookups per 15 min; 5 contact submissions/hour. Responses are `no-store` and `noindex`.
