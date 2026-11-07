# Managing records — the complete operating process

Everything is done on **github.com** in your **private** repository, under the **Actions** tab. You never need to edit files or write code.

A **record** = one person = one phone number = one QR code. Its 10-character **code** (e.g. `7KQ2M9XH4D`) is printed on the sticker and never changes.

## What is public
For an **active** record, anyone who scans the sticker (or has its address) sees exactly:
- the **display name** (first name, or first name + last initial),
- the **mobile number**,
- a **Call** button and a **WhatsApp** button.

Nothing else: no vehicle details, no full name, no consent information. The page title, link previews and search engines never get the name or number. For **hidden** and **retired** records the page shows only "This sticker isn't active".

Everything else — the `records` folder, the consent dates, the history — stays in the private repository, visible only to people you add as collaborators.

## Before you add anyone: consent
1. Explain to the person exactly what will be public (display name + mobile number, on a page anyone with the QR can open).
2. Get their **signed** agreement (paper or e-signature) with the date.
3. Keep the signed form **outside GitHub** (locked cabinet or private drive), labelled with the record code once you have it.
4. Only then fill in the form below. The form will not accept a record without the consent box ticked and a consent date.

## 1. Add a person (and generate their QR)
1. Repository → **Actions** → **Add record** (left) → **Run workflow** (right).
2. Fill in:
   - **Display name** — e.g. `Ahmed M.` or `أحمد م.`. Not the full name. Letters only, max 30 characters.
   - **Egyptian mobile number** — starting with 010, 011, 012 or 015. You can type `01xxxxxxxxx`, `+201xxxxxxxxx`, spaces, or Arabic digits — it is saved as `+201xxxxxxxxx`. Landlines and foreign numbers are refused.
   - **Tick the consent box.**
   - **Consent date** — e.g. `2026-11-07`.
3. Click **Run workflow**. After 1–3 minutes the run shows a green tick ✅.
   - Open the run: the summary shows the **new code** and the **page address**.
   - The page is live about 2 minutes later.
4. If the run is red ❌, open it: the summary says what to fix (it never repeats the name or number). Nothing was saved. Run the form again.

## 2. Download and print the sticker
1. Open the green **Add record** run → scroll to **Artifacts** → download **sticker-files-<CODE>** (a zip).
2. Open `<CODE>-1-proof.pdf` and scan it from the screen with your phone: it must open the right page.
3. Send the printer `<CODE>-2-print-cmyk.pdf`, `<CODE>-3-print-white.pdf` and `<CODE>-4-cut.pdf` with [STICKER_PRINT_SPECIFICATIONS.md](STICKER_PRINT_SPECIFICATIONS.md).
4. Install the sticker on the **inside** of the rear window, then scan it from outside.

The sticker files contain only the QR code and the code — no name or number. Lost the zip, or need a reprint? **Actions → Make sticker files** → enter the code → download **sticker-files**. See [QR_AND_STICKERS.md](QR_AND_STICKERS.md).

## 3. Change a person's name or number
**Actions → Manage record → Run workflow**:
- **Record code**: the code (e.g. `7KQ2M9XH4D`; lower case is fine).
- **What to do**: `update-details`.
- Fill in the new display name and/or the new mobile number (leave the other empty to keep it).
- **Tick the consent box** and enter the date the person agreed to the new details (get a new signature first).

The same sticker keeps working — no reprint needed.

## 4. Hide a record temporarily — and reactivate it
- **Hide**: Manage record → code → `hide`. The page shows "not active"; the name and number stay in the private record. Use for a short pause (e.g. the person is travelling, or while a question is being clarified).
- **Reactivate**: Manage record → code → `reactivate`. The contact page is back. (Only hidden records can be reactivated.)

## 5. Retire a record
Manage record → code → `retire`. This:
- erases the display name, number and consent from the current record,
- makes the page show "not active",
- keeps the code reserved forever (it is never given to someone else).

Retiring cannot be undone. If the same person wants the service again later, use **Add record** (new code, new sticker, new consent).

## 6. Consent withdrawal
When a person withdraws consent (by phone, message or in person):
1. **Immediately**: Manage record → `retire` (or `hide` first if you must confirm the request — but retire as soon as it is confirmed).
2. Note the date of withdrawal on their signed form (offline).
3. Ask them to remove the sticker, or remove it yourself.
4. Tell them the page stops showing their details within ~10 minutes, and that copies others already made (call logs, screenshots, WhatsApp chats) cannot be recalled.

## 7. Deletion request ("delete everything about me")
Retiring removes the data from the **current** files and from the website, but **older versions remain in the repository history**. To delete those too, follow **"Complete deletion"** in [PRIVACY_AND_PUBLIC_DATA.md](PRIVACY_AND_PUBLIC_DATA.md). It needs a computer with Git (about 30 minutes, or ask a technical helper), and deleting the related workflow runs.

## Record file reference (for information)
You normally never edit these files, but this is what the forms write in `records/<CODE>.json`:

| Field | Values |
|---|---|
| `status` | `active` (page visible), `hidden` (paused), `retired` (closed, data erased) |
| `name` | display name only — e.g. `"Ahmed M."` — empty `""` when retired |
| `phone` | `"+201XXXXXXXXX"` (010/011/012/015) — empty `""` when retired |
| `consent_confirmed` | `true` for active/hidden |
| `consent_date` | `"YYYY-MM-DD"` for active/hidden |

Any other field is refused. If someone edits a file by hand and makes a mistake, the **Publish website** run fails, explains the problem, and the live site stays unchanged.
