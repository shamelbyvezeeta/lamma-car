# Prepare and publish Lamma Car on GitHub Pages (private repository, GitHub Pro)

Nothing in this project has been published. Follow these steps when you are ready. Time: about 20 minutes.

## How the pieces fit
- **Private repository** (needs **GitHub Pro** on a personal account, or GitHub Team for an organisation): holds `records/` and history. Not visible to the public.
- **GitHub Pages**: publishes only the generated website. **A Pages site is public even when the repository is private** — that is what lets anyone who scans a sticker open the contact page.
- **GitHub Actions**: checks the records, builds the pages, publishes them, and runs the *Add record* / *Manage record* forms.

## Before you start: choose the address
The address goes into every printed QR code and must keep working as long as stickers exist.

| Address | QR content example | QR module size |
|---|---|---|
| Your own short domain | `https://lamma.car/q/7KQ2M9XH4D` (30 chars) | 1.76 mm — best |
| Free GitHub address, short repository name | `https://lamma-car.github.io/car/q/7KQ2M9XH4D` (44) | 1.60 mm — good |
| Free GitHub address, long names | `https://lamma-mobility.github.io/lamma-car/q/7KQ2M9XH4D` (55) | 1.47 mm — OK |

After stickers are printed: **never rename** the account or repository and never delete the repository. Adding a custom domain later is fine (GitHub redirects the old `github.io` address to it).

## 1. Account and plan
1. Use a GitHub account owned by the business, with **two-factor authentication** turned on (Settings → Password and authentication).
2. Upgrade it to **GitHub Pro** (Settings → Billing and plans). Without Pro (or Team), GitHub Pages cannot publish from a private repository.

## 2. Create the private repository
1. **+ → New repository**. Name: short, e.g. `car`.
2. Visibility: **Private**.
3. Don't add a README, .gitignore or licence. **Create repository**.

## 3. Upload the project
**Option A — browser:** unzip `lamma-car-contact.zip`; on the empty repository page click **uploading an existing file**; drag in **everything inside** the `lamma-car` folder, including the `.github` folder (Mac: press **Cmd + Shift + .** to show hidden folders); **Commit changes**. Check that `.github` appears in the repository.

**Option B — command line (keeps the earlier versions as branches/tags in the private repository):**
```bash
mkdir lamma-car && cd lamma-car && git init -b main
git pull ../lamma-car.bundle main
git fetch ../lamma-car.bundle archive/v1-platform:archive/v1-platform "refs/tags/*:refs/tags/*"
git remote add origin https://github.com/YOUR-ACCOUNT/car.git
git push -u origin main archive/v1-platform --tags
```

## 4. Turn on GitHub Pages
1. Repository → **Settings → Pages**.
2. **Build and deployment → Source: GitHub Actions**.
3. Leave everything else as it is.

## 5. Publish for the first time
1. **Actions** tab → if asked, enable workflows.
2. **Publish website → Run workflow → Run workflow**. Wait for the green tick (1–2 min).
3. The **deploy** step shows your site address. Open it on a phone: you see the Lamma Car home page.
4. Open `<address>/q/TESTCARD01` — you should see **"This sticker isn't active"** (the sample record is a hidden, fictional record). That confirms codes, pages and the 404 page work.
5. Open `<address>/q/ZZZZZZZZZZ` — you should see **"Code not recognised"**.

## 6. Fix the address in site.json
1. Open `site.json` → pencil icon → set `"public_base_url"` to your final address, without a slash at the end, e.g. `"https://lamma-car.github.io/car"`.
2. Optional: `"support_phone"` / `"support_email"` — Lamma Car's own contact, shown only on "not active" and "code not recognised" pages. Leave `""` for none.
3. **Commit changes** (the site republishes).

## 7. Try the full flow with your own number
1. **Actions → Add record**: your own first name, your own mobile number, tick consent, today's date → Run.
2. Open the page address from the run summary: check the name, number, **Call** and **WhatsApp** buttons on your phone.
3. Download the sticker files from the run and scan `-1-proof.pdf` from the screen.
4. **Actions → Manage record** → your code → `retire` (or keep it as a demo).
5. Delete or retire `records/TESTCARD01.json` before launch (Manage record → `TESTCARD01` → `retire`).

## 8. Recommended settings
- Add only the collaborators who need access (Settings → Collaborators), all with two-factor authentication.
- Don't add branch protection that blocks pushes to `main`: the Add/Manage record workflows save to `main`.
- Settings → Actions → General: keep the default ("Allow all actions…" or at least GitHub-created actions).
- Optional custom domain: Settings → Pages → Custom domain → follow the DNS instructions → **Enforce HTTPS** → update `site.json`.

## Troubleshooting
| Problem | Fix |
|---|---|
| Publish fails at "configure-pages" | Pages not enabled (step 4) or the account is not on GitHub Pro |
| Red ❌ on Add/Manage record | Open the run — the summary lists what to fix (never the name/number). Nothing was saved |
| Red ❌ on Publish website | A record file is invalid (usually after a manual edit). The summary names the file and field; the live site is unchanged |
| "Save to repository" fails | A branch protection rule blocks GitHub Actions from pushing to `main` |
| Page still shows old details | Wait ~10 minutes (GitHub Pages cache) and refresh |

## Limits and terms
GitHub documents a 1 GB site limit, a soft 100 GB/month bandwidth limit and a 10-minute deployment timeout — far above Lamma Car's needs (each page is a few KB). GitHub also states Pages is not intended as free hosting to run an online business or e-commerce/SaaS site; Lamma Car's pages are informational contact pages without transactions, and the account is on a paid plan, but you should be aware of the wording. Using your own domain keeps the printed QR codes portable if hosting ever has to change.
