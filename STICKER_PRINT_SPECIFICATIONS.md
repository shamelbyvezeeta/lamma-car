# Sticker Print Specifications

> **Status:** engineering specification and production-ready artwork. **No physical sample has been printed, installed or scanned yet.** Every value below is a technically justified recommendation, not a validated result. Complete the physical test checklist (section 9) on real samples before approving a production run.

## 1. Mandatory installation principle
The sticker is applied to the **inside** surface of the rear windshield and read from **outside** the vehicle. The artwork is therefore printed in reverse (mirror image) on a clear film whose adhesive faces the glass, and a solid white layer is printed behind the artwork so the code is opaque and high-contrast.

```
OUTSIDE  ▸  glass  ▸  clear adhesive  ▸  clear PET film  ▸  CMYK artwork (mirrored)  ▸  white ink ×2  ▸  INSIDE (cabin)
viewer                                                    seen through the film                         seen by the driver as a plain white panel
```

## 2. Dimensions
| Item | Value | Reason |
|---|---|---|
| Trim size | **90 × 130 mm**, portrait | Big enough for a ≥ 59 mm QR symbol; small enough for a lower corner of most rear windows and to keep rear visibility |
| Corner radius | 6 mm | Resists edge lift; modern look |
| Bleed | 2 mm each side (94 × 134 mm artwork) | Standard digital cut tolerance |
| Safe margin | 4 mm inside trim | No critical content (logo, QR, text) in this band |
| QR panel | 72 × 72 mm white panel, x 9 mm, y 33 mm from top-left (outside view) | Contains the symbol **and** its 4-module quiet zone |
| QR symbol | 58.7–60.3 mm (v4: 33 modules × 1.76 mm; v5: 37 × 1.60 mm; v6: 41 × 1.47 mm) | Depends on the website address length — see QR_AND_STICKERS.md and SETUP_GITHUB_PAGES.md |
| Logo | Lamma Car wordmark, 70 mm wide, top centred (y 8–28 mm) | Recognition from a distance |
| CTA pill | 56 × 7.4 mm coral, “امسح الكود · SCAN ME” | Bilingual call to action |
| Navy band | bottom 13 mm: tagline “Find it. Sell it. Easy.” + the record code `7KQ2 M9XH 4D` | Brand + human-readable reference |

## 3. Material (recommended)
| Item | Recommendation |
|---|---|
| Film | Clear, optically clear **polyester (PET) 75–100 µm** with print-receptive back side; alternative: optically clear cast PVC ≥ 50 µm |
| Adhesive | **Clear, face-applied** (“reverse-mount / inside-glass”) **removable acrylic PSA** rated for glass; UV-stable (non-yellowing); service temperature at least −10 °C to +80 °C (parked cars in Egyptian summer exceed 70 °C behind glass) |
| Liner | Silicone-coated paper liner with back-slit for easy application |
| Why removable | Owner can remove the sticker on resale/replacement without residue or damage to heater lines; “permanent” adhesives risk tearing defroster grid lines on removal |

## 4. Printing method
**Preferred: UV-LED inkjet with white channel (CMYK + W)** — e.g. Roland, Mimaki, Epson UV printers — printing on the non-adhesive (back) side of the film.

Print order (all layers mirrored, provided in the production PDF):
1. **CMYK artwork** (page 1 / “Print — CMYK, mirrored”).
2. **White underlay**, spot colour `White`, **two passes** (page 2) — target opacity high enough that a black/white test pattern behind the panel is not visible.
3. **Cut** on the `CutContour` line (page 3) — trim 90 × 130 mm, R6.

Alternative: screen printing (CMYK or spot colours + 2 × white) for large runs — needs a **vector** logo (pending).

Colour: brand colours are provided as starting CMYK values — Navy C72 M62 Y45 K72 · Coral C0 M66 Y72 K0 · Lavender C45 M55 Y0 K0 · Cream C0 M2 Y6 K0. **The QR modules are printed in 100 % K only** (single ink: no registration blur, maximum contrast). Confirm all colours with the printer's ICC profile and a physical proof; seen through glass and tint, colours shift darker.

Spot colour names are configurable (`STICKER_WHITE_SPOT_NAME`, `STICKER_CUT_SPOT_NAME`) to match the printer's RIP (e.g. `RDG_WHITE` for Roland VersaWorks).

## 5. Typography on the sticker
English: Manrope ExtraBold (tagline, CTA), Manrope Bold (code). Arabic: Alexandria Bold (CTA). Text is converted to outlines in PDF/SVG so the printer needs no fonts. Minimum text height ≈ 2.6 mm cap height.

## 6. Readability through glass
- **Contrast:** opaque white behind the code prevents back-lighting from the cabin washing out the modules; 100 % K modules on white.
- **Error correction H (30 %)** tolerates partial occlusion (dirt, defroster lines).
- **Quiet zone:** 4 modules of pure white inside the panel; coral corner brackets sit outside the quiet zone.
- **Reflections:** glass reflects sky; a matte print surface does not help because the viewer sees the print through glass. Mitigation is placement (lower corner, away from the brake light) and user behaviour (scan at a slight angle). Must be tested (checklist 9.3).
- **Windshield angle:** rear windows are inclined 25–70° from vertical; a QR read at an angle appears foreshortened vertically. A 59 mm symbol at 60° inclination still projects ≈ 30 mm tall, within decoding range at ≤ 0.5–0.8 m (estimate). Must be tested on steep fastback/hatchback glass.
- **Estimated scan distance** (rule of thumb distance ≈ 10 × symbol size, adjusted for 1.6–1.76 mm modules and current phone cameras): **comfortable 0.3–0.8 m, possible up to ~1.2 m in good light**. Unvalidated estimate.

## 7. Defroster (heater) lines
Heater grid lines are printed on the **inside** surface of most rear windows — exactly where the sticker is applied. From outside, a line crossing the code hides a strip of modules.
1. **Preferred placement:** a zone without heater lines (many rear windows have a clear band near the lower or upper edge or in a corner). Lower passenger-side corner (right side when viewed from behind in Egypt) is recommended for kerbside scanning, subject to the line layout of each car.
2. If lines must cross the sticker: align so lines run **horizontally** across the symbol and **not through the three finder patterns** (top-left, top-right, bottom-left squares, as seen from outside). With ~25–30 mm line pitch, 2 lines may cross a 59 mm symbol, hiding ≈ 6–10 % of modules — within ECC-H capacity in theory. **Must be tested.**
3. Adhesive bridges over the raised lines; use a soft felt squeegee only, never a blade or hard scraper on heater lines; small bubbles along lines can be pushed out — do not puncture near lines.

## 8. Tinted glass
- **Factory privacy glass** (tint inside the glass): reduces light reaching the print → lower contrast, worse at night. The white underlay helps; test 9.5.
- **Aftermarket tint film** (on the inside surface): the sticker would adhere to the film; removal can lift the film. Recommendation: apply only where there is no film, or accept the risk with the owner's consent. Very dark films (VLT < 20 %) may make the code unreadable — test 9.5.

## 9. Physical testing checklist
Record for every test: date, tester, sample/batch, car make/model/year, glass type, phone model + OS + camera app, result, photo. **Pass = decode within 3 s, first attempt, ≥ 9 of 10 tries** unless stated.

### 9.1 Indoor installation
- [ ] Clean glass with isopropyl alcohol (70 %), dry; temperature 10–35 °C
- [ ] Peel liner partially (hinge method), align on the chosen zone, squeegee from centre outward
- [ ] Inspect from outside: artwork reads correctly (not mirrored), no white visible at edges, no bubbles over QR
- [ ] Inspect from inside: plain white panel, edges sealed
- [ ] Time to install by one trained person: ______ (target ≤ 3 min)

### 9.2 Outdoor QR scanning
- [ ] iPhone (current + 3-year-old model), native Camera app
- [ ] Android (Samsung + one budget device), native camera / Google Lens
- [ ] Opens the correct `/q/<code>` page; the code printed on the sticker matches the record code (file name in `records/`) and the code shown at the bottom of the contact page

### 9.3 Lighting conditions
- [ ] Direct midday sun on the glass  - [ ] Sun behind the scanner (reflection on glass)
- [ ] Overcast / shade  - [ ] Dusk  - [ ] Night under street light  - [ ] Night with phone flash (check flash glare on glass)

### 9.4 Distances and angles
| Distance | 0.3 m | 0.5 m | 0.8 m | 1.0 m | 1.5 m |
|---|---|---|---|---|---|
| Straight on | | | | | |
| 30° side angle | | | | | |
| Standing (looking down at inclined glass) | | | | | |
Record the maximum reliable distance → use it in marketing/instructions.

### 9.5 Tinted glass
- [ ] Clear glass  - [ ] Factory privacy glass  - [ ] Aftermarket film ~35 % VLT  - [ ] ~20 % VLT  - [ ] ~5 % VLT (expected to fail — document)

### 9.6 Defroster-line interference
- [ ] Sticker on a line-free zone (control)
- [ ] 1 line crossing the symbol, away from finder patterns
- [ ] 2 lines crossing  - [ ] line through one finder pattern (expected worst case)
- [ ] Defroster switched ON for 15 min: no adhesive failure, no discoloration, no heater-line damage

### 9.7 Adhesive and removal performance
- [ ] 24 h dwell: no edge lift
- [ ] Heat: car parked in sun ≥ 4 h at ≥ 40 °C ambient (cabin ≥ 70 °C): no lift, no bubbling, no ink cracking
- [ ] Car wash (exterior) ×3 and interior glass cleaning ×3: no damage
- [ ] 30-day and 90-day checks: colour fade, yellowing, edge lift
- [ ] Removal at 20–30 °C: peels without residue; **heater lines intact and defroster still works**
- [ ] Re-application of a new sticker on the same spot

## 10. Production files (in `sticker/`)
| File | Content |
|---|---|
| `lamma-car-sticker-90x130-proof.pdf` | Reading orientation (outside view), RGB, crop marks, sample code — for approval |
| `lamma-car-sticker-90x130-production.pdf` | p1 CMYK mirrored · p2 White spot mirrored · p3 CutContour spot mirrored; page 98 × 138 mm (4 mm margin around bleed) |
| `lamma-car-sticker-90x130-outside.png` | 600 dpi, 2220 × 3165 px incl. bleed, reading orientation |
| `lamma-car-sticker-90x130-outside.svg` / `-mirrored.svg` | Editable vector (mm units). Text is outlined. Logo is the embedded original raster (vector not supplied). |

The master files encode `https://lamma-car.example/q/TESTCARD01` and show “SAMPLE” instead of a code; they are design references. Real per-record files come from the **Add record** or **Make sticker files** GitHub Actions (see QR_AND_STICKERS.md) and use the address in `site.json`.

## 11. Cutting & finishing
Kiss-cut on the CutContour (90 × 130, R6) on sheets or rolls; supply individually cut or 4-up sheets with backing liner; pack flat, protected from scratches on the print side. Optional: add a clear overlaminate on the cabin side to protect the white layer.

## 12. Open items affecting print
Vector logo · production domain (affects QR size) · Arabic tagline (only English is approved) · legal check of rear-window sticker rules in Egypt · printer ICC/spot names. See the open items in the README of the delivery.
