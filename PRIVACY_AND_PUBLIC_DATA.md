# Privacy and public data

## What is where
| Place | Who can see it | Contains |
|---|---|---|
| **Public website** (GitHub Pages) | Anyone with a page address (e.g. by scanning the sticker) | For **active** records only: display name + mobile number, Call and WhatsApp links. Nothing for hidden/retired records. No list of people or codes. |
| **Private repository** (GitHub Pro) | Only you and collaborators you add | `records/` (display name, number, status, consent date), full change history |
| **GitHub Actions runs** | Repository collaborators | Logs (never contain names or numbers), run summaries (codes only), and the form values submitted with each run |
| **Workflow artifacts** | Repository collaborators | Sticker files (QR + code only, no personal data); the published site package (kept 1 day) |
| **Outside GitHub** (your office) | Lamma Car staff | Signed consent forms, withdrawal notes, any other customer information |

**GitHub Pages sites are public even when the repository is private** (GitHub Pro cannot restrict who views the site). That is intended: the contact page must open for anyone who scans the sticker. Page addresses use random codes, are excluded from search engines (`noindex`, `robots.txt`) and are never listed, but they are not secret or password-protected.

## Built-in protections
| Protection | Effect |
|---|---|
| Private repository | `records/`, consent dates and history are not public |
| Only `_site` is published | The build copies design files and generated pages only — never `records/`, `site.json`, tools or docs |
| Field allow-list | Only `status`, `name`, `phone`, `consent_confirmed`, `consent_date` are accepted |
| Display name rule | First name or first name + last initial; letters only; no numbers, e-mails or links |
| Egyptian mobile rule | 010/011/012/015 only, stored as `+201XXXXXXXXX` |
| Mandatory consent | Active and hidden records need `consent_confirmed: true` and a consent date |
| Retirement erases | Retired records must have empty name and number |
| Hidden/retired pages | Show no name and no number |
| No personal data in logs | Form values are read from the run's event file (not printed), masked with `::add-mask::`, and every error message mentions only the code and field name |
| No personal data in titles/previews | Page titles and descriptions are generic; `referrer` is not sent when someone taps WhatsApp |
| Checks before publishing | If anything fails, nothing is published and the live site stays as it was |

These checks prevent mistakes; they cannot prove the person really agreed. That responsibility stays with Lamma Car staff.

## Risks to explain to each person
- Anyone who sees the car can scan the sticker and see the display name and number — including people with bad intentions (unwanted calls, spam, scams, harassment).
- People who called or messaged keep the number in their call log or WhatsApp even after the record is retired.
- Someone could stick a fake QR over the real one. The code printed on the sticker should match the code at the bottom of the page.

## Consent withdrawal
See [MANAGING_RECORDS.md §6](MANAGING_RECORDS.md). In short: **Manage record → retire** as soon as the withdrawal is confirmed, note it on the paper form, remove the sticker.

## Complete deletion (including history)
A normal change — retiring, or even deleting the file — removes the data from the **current** files and the website, but **not** from the repository history: every earlier version of `records/<CODE>.json` still contains the name and number, and so do the **Add record / Manage record runs**, which keep the values submitted in their form. Do **not** tell the person their data is fully deleted until all steps below are done.

**Step 1 — Retire** (Actions → Manage record → `retire`). The website stops showing the data within minutes.

**Step 2 — Delete the related workflow runs.** Actions → **Add record** and **Manage record** → open each run for that code (the run summary shows the code) → **⋯ → Delete workflow run**.

**Step 3 — Remove the data from Git history** (needs a computer with Git and [git-filter-repo](https://github.com/newren/git-filter-repo); a technical helper can do this in ~30 minutes):
```bash
git clone --mirror https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
cd YOUR-REPO.git
# replacements.txt — one line per value to erase (write every spelling of the number that was ever saved)
#   +201XXXXXXXXX==>[removed]
#   01XXXXXXXXX==>[removed]
#   Display Name==>[removed]
git filter-repo --replace-text ../replacements.txt
git log --all -p | grep -c "XXXXXXXXX"        # must print 0 (use the real digits)
git push --force --all && git push --force --tags
```
Then delete `replacements.txt`. Notes: this rewrites the history of every branch, so commit IDs change; anyone with an old copy must delete it and clone again. GitHub may refuse to update some hidden references (for example pull-request refs); that is expected.

**Step 4 — Ask GitHub Support** to remove cached views of the old commits and to run garbage collection on the repository. Until then, old commits may remain reachable by their exact ID for people with access. (GitHub documents this in "Removing sensitive data from a repository".)

**Step 5 — Republish and check caches.** The force-push triggers **Publish website**; if not, run it manually. GitHub Pages caches pages for up to ~10 minutes. Pages are marked `noindex, noarchive` and excluded in `robots.txt`, so search engines should not hold copies. Copies outside your control — phones' browser history, screenshots, call logs, WhatsApp chats — cannot be erased; say so in your reply to the person.

**Step 6 — Other copies.** Delete or update any downloaded ZIPs, bundles or backups that contain the record, and destroy or archive the signed consent form according to your retention policy.

## Legal
Publishing a person's name and phone number is processing of personal data under Egypt's Personal Data Protection Law (Law No. 151 of 2020). Have a legal adviser confirm the consent wording, the withdrawal and deletion procedure above, and retention periods for consent forms.
