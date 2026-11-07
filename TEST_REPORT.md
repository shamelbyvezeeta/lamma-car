# Test status — Lamma Car v3.0.0 (contact-only)

**Automated tests were updated but NOT executed for this version**, as instructed. No test result is claimed.

## What was done instead (static checks only)
- `node --check` on every JavaScript file in `tools/`, `web/js/` and `tests/` — no syntax errors.
- Every tool module loads without errors (this also compiles the display-name and phone patterns).
- `actionlint` 1.7.12 on all five workflows — no findings.
- All JSON files (`records/*.json`, `site.json`, `package.json`) parse.
- Arabic and English text dictionaries have identical keys, and every key used by the page templates exists.
- Search for leftover vehicle fields/wording in tools, workflows and data — none.

## Updated automated tests (`tests/static.test.js`) — to run before deployment
`npm ci && npm test` (needs Google Chrome and poppler-utils). They cover:
- phone rules: Egyptian mobiles (010/011/012/015) in all accepted spellings incl. Arabic-Indic digits → `+201XXXXXXXXX`; landlines, other prefixes and foreign numbers refused; display-name rule
- build: one Arabic and English page per code; no private source (`records/`, `site.json`, any `.json`) in the published folder
- QR address `/q/<CODE>` → 301 → 200; Arabic default, English available
- active page body contains only the name, number, `tel:` and `wa.me` links; no vehicle words, images or other links; title/description free of personal data
- each page shows only its own person; hidden and retired pages show no name or number; a number appears only on its own active page
- bilingual 404 for invalid codes; lower-case codes redirected; no overflow at 390 px; assets and fonts load
- validation: unknown fields, missing/false/quoted consent, bad or future dates, landlines, full names, retired records with data; **error messages never contain the submitted name or number**; invalid data blocks publishing
- Add record / Manage record: unique codes, normalisation, consent required, hide → reactivate → update → retire (erases) → no reuse; Actions mode reads values from the event file, masks them and prints no personal data; workflows never pass form values through `env:`/`run:`
- stickers: files per non-retired code, no personal data inside, QR decodes to the right page, mirrored layer reads correctly when flipped

## Not verified
- Running the workflows on GitHub, publishing from a private GitHub Pro repository, the live site.
- Real phones (Call / WhatsApp buttons on iOS and Android).
- Physical sticker printing, installation and scanning through glass (STICKER_PRINT_SPECIFICATIONS.md §9).
