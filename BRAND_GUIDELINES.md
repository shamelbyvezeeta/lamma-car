# Brand Guidelines — Lamma Car (as implemented)

## Logo
- **Source:** `assets/brand/Lamma_Car_Motion_Logo.original.png` — the supplied original (2172 × 724 px, transparent background). It is never modified.
- **Derived files** (`npm run build:brand`, crops and resizes only — no redrawing):

| File | Use |
|---|---|
| `web/brand/lamma-car-logo.png` | Full lockup with tagline (home page) |
| `web/brand/lamma-car-wordmark.png` | Lockup without the tagline line (headers, sticker, PDFs) |
| `web/brand/lamma-mark.png` | The original Lamma “L” symbol with sparks (footer, favicon) |
| `icon-512.png`, `apple-touch-icon.png`, `favicon-48.png` | App/browser icons from the mark |

- **Rules:** use on Cream or White backgrounds only (the navy letterforms disappear on Navy). Minimum width: 110 px on screen, 40 mm in print. Keep clear space ≥ the height of the coral wedge around the logo. Do not recolour, outline, stretch, or add effects.
- **Missing assets (requested):** vector logo (SVG/AI/PDF) and a reversed version for dark backgrounds. Still outstanding.

## Colour
| Token | Hex | Use |
|---|---|---|
| Navy | `#1F222C` | Text, dark surfaces (contact card header, WhatsApp button), sticker band |
| Coral | `#FE764F` | Primary buttons (with **navy** text — white on coral fails contrast), highlights, sticker CTA |
| Lavender | `#9274D2` | Supporting accent: focus ring, secondary highlights |
| Cream | `#FDF6EC` | Page background, sticker background |

Derived neutrals are tints of navy/cream only. Functional status colours (green success, amber warning, red error) are used **only** for system feedback and status badges, never as brand colours.

Accessibility: body text navy on cream/white (≈ 15:1). Coral is never used for small text on light backgrounds.

## Typography
| | Headings | Body |
|---|---|---|
| English | Manrope ExtraBold (800) | Manrope Regular (400); 600/700 for labels |
| Arabic | Alexandria Bold (700) | Alexandria Regular (400); 500 for emphasis |

Fonts are self-hosted (`web/fonts`, WOFF2, from Fontsource) — no third-party font requests. PDF output embeds TTFs from `assets/fonts` (OFL licence). Numerals are always Western (0–9) in both languages.

## Tagline
“Find it. Sell it. Easy.” — always in English (approved). An Arabic tagline has not been approved and is not used.

## Brand name in Arabic UI
Kept in Latin script (“Lamma Car”, “Lamma Mobility”) inside Arabic text because no Arabic brand rendering was approved.

## UI system
Rounded components (pill buttons, 14–22 px card radius), generous white space, subtle shadows, one coral primary action per screen, logical CSS properties so every layout mirrors correctly in RTL.
