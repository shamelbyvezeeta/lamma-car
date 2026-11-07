# QR codes and stickers

## The QR address (unchanged since v1)
Each QR code contains exactly:
```
<public_base_url>/q/<CODE>        e.g.  https://lamma-car.github.io/car/q/7KQ2M9XH4D
```
- `<CODE>` = 10 characters from `0-9 A-Z` without I, L, O, U, generated at random by **Add record**. It is the record's file name in `records/` and is never reused, even after retirement.
- The address is **permanent**. Changing a person's name or number does not change it — the sticker never needs reprinting for that.
- Typed by hand, lower case and look-alike letters (`o`→`0`, `i`/`l`→`1`) are corrected automatically.
- QR error correction level **H** (≈30 % of the symbol can be covered and it still decodes — useful if rear-window heater lines cross it).

The QR contains only the address — **not** the name or number.

## Getting the print files
- **New person:** the **Add record** run → *Artifacts* → **sticker-files-<CODE>**.
- **Any time / reprint:** **Actions → Make sticker files → Run workflow** → enter one or more codes separated by commas (or leave empty for all active and hidden records) → download **sticker-files** from the run.

Artifacts are kept for 30–90 days (visible only to repository collaborators). The files are recreated identically for the same code.

## What's in the zip
| File | Use |
|---|---|
| `READ-ME-FIRST.txt` | Short explanation for you and the printer |
| `<CODE>-1-proof.pdf` | **Check this**: the sticker as seen from outside. Scan it from the screen — it must open the right page. Not for production. |
| `<CODE>-2-print-cmyk.pdf` | Printer: colour layer, mirrored |
| `<CODE>-3-print-white.pdf` | Printer: white ink layer (spot colour `White`), after colour, 2 passes |
| `<CODE>-4-cut.pdf` | Printer: cut line (spot colour `CutContour`), 90 × 130 mm, 6 mm corners |
| `<CODE>-qr.svg`, `-qr.png` | The QR code alone |
| `ALL-A4-sheets-…pdf` | When several codes are included: same four file types, 4 stickers per A4 page |

None of these files contains a name or phone number.

## Sticker design
Unchanged: 90 × 130 mm, Lamma Car logo, QR panel 72 × 72 mm, "امسح الكود · SCAN ME", tagline band with the code (`7KQ2 M9XH 4D`), reverse printing on clear film with white underlay. Full specification: [STICKER_PRINT_SPECIFICATIONS.md](STICKER_PRINT_SPECIFICATIONS.md).

The code under the QR also appears at the bottom of the contact page ("Lamma Car · 7KQ2 M9XH 4D"), so a person scanning can check the page belongs to that sticker.

## Replacing a sticker
- **Damaged or lost sticker, same person:** reprint with *Make sticker files* (same code, same page).
- **Sticker may be misused (e.g. stolen) or the person changes:** retire the record and create a new one with **Add record** (new code, new sticker, new consent).

## Not yet verified
Physical printing, installation and scanning through real windows have **not** been tested. Use the checklist in STICKER_PRINT_SPECIFICATIONS.md §9 on the first samples.
