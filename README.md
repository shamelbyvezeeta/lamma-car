# Records

One file per person and QR sticker. **The file name is the code** printed in the QR (e.g. `7KQ2M9XH4D.json` → page `…/q/7KQ2M9XH4D`).

Use the GitHub Actions forms — you don't need to edit these files:
- **Actions → Add record**: new person (display name, Egyptian mobile, consent).
- **Actions → Manage record**: change name/number, hide, reactivate, retire.

Fields: `status` (`active` / `hidden` / `retired`), `name` (display name only, e.g. "Ahmed M."), `phone` (Egyptian mobile 010/011/012/015), `consent_confirmed` (`true`), `consent_date` (`YYYY-MM-DD`). Nothing else is allowed.

- `_TEMPLATE.json` is an example and is never published.
- `TESTCARD01.json` is a fictional, hidden sample used to check the first deployment. Delete it (or retire it) before launch.

🔒 This folder must stay in a **private** repository. Only the display name and number of **active** records appear on the public website. Signed consent forms are kept outside GitHub. Full guide: [docs/MANAGING_RECORDS.md](../docs/MANAGING_RECORDS.md)
