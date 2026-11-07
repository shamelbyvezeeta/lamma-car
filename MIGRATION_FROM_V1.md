# Version history and migration

| Version | Concept | Where it is |
|---|---|---|
| **v1.0.0** | Full server platform: admin dashboard, PostgreSQL, batches, sales, vehicle pages | branch `archive/v1-platform`, tag `v1.0.0`, file `lamma-car-v1.0.0.zip` |
| **v2.0.0** | Static GitHub Pages site with vehicle profile pages | tag `v2.0.0` (history of `main`) |
| **v3.0.0** (current, `main`) | Static **contact-only** QR service: display name, Egyptian mobile, Call, WhatsApp | branch `main`, tag `v3.0.0` |

Nothing was deleted from history: every earlier version can be checked out from its branch or tag.

## Kept from earlier versions
| Component | Location | Status |
|---|---|---|
| Lamma Car logo derivatives (from the original PNG) | `web/brand/` | unchanged |
| Fonts (Manrope, Alexandria) | `web/fonts/`, `assets/fonts/` | unchanged |
| Design tokens and page frame (header, footer, tagline) | `web/css/base.css`, `tools/lib/render.js` | unchanged |
| QR code format (10-char random Crockford Base32) and URL `<base>/q/<CODE>` | `tools/lib/codes.js`, `tools/lib/config.js` | unchanged |
| Sticker design, size, QR settings, print layers, PDF engine | `tools/pdf/`, `sticker/` | unchanged |
| Static build, GitHub Pages publishing, 404 page, local preview | `tools/build.js`, `.github/workflows/publish.yml`, `tools/serve.js` | adapted |

## Changed in v3
| v2 (vehicle pages) | v3 (contact only) |
|---|---|
| `vehicles/` with make, model, year, colour, price, photo… | `records/` with only `status`, `name`, `phone`, `consent_confirmed`, `consent_date` |
| Vehicle profile page | Contact page: display name, number, Call, WhatsApp |
| Optional owner phone (any country) | Required Egyptian mobile (010/011/012/015), stored `+201XXXXXXXXX` |
| Owner approval date when publishing a phone | Mandatory consent box + consent date for every active/hidden record |
| `retired` kept data in the file | `retired` requires name and number erased |
| `photos/` folder | removed |
| *Add vehicle* workflow (vehicle form, values via environment variables) | *Add record* workflow (name, number, consent; values read privately, masked, never printed) |
| Editing by hand only | New *Manage record* workflow: update details, hide, reactivate, retire |
| Public repository | Private repository (GitHub Pro); public Pages site |
| Sticker label: code | unchanged |

## Removed (and why)
Vehicle data, photos, prices and listings — outside the approved concept and an unnecessary privacy exposure. `exif-reader` dependency (only used for photos). Vehicle-era screenshots (they showed vehicle pages).

## Moving existing v2 data
v2 had no real customer data. If you created v2 vehicle files with owner approval, add those people again with **Add record** (with fresh consent for the new purpose), then delete the old files and follow the history clean-up in PRIVACY_AND_PUBLIC_DATA.md if they contained personal data.
