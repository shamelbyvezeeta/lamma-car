# Admin User Guide

Sign in at `/admin/login`. Switch language with the button in the top bar (Arabic is the default). Every change you make is recorded in the Activity log.

## Roles
| | Super Admin | Admin | Sales Operator |
|---|---|---|---|
| Customers & vehicles (create/edit), privacy choices | ✓ | ✓ | ✓ |
| Archive/deactivate customers, approve photos | ✓ | ✓ | — |
| Assign stickers | ✓ | ✓ | ✓ |
| Activate / suspend / deactivate stickers | ✓ | ✓ | — |
| Batches, print PDFs, batch exports | ✓ | ✓ | — |
| Record sales | ✓ | ✓ | ✓ |
| Edit any sale | ✓ | ✓ | own sales: status & notes only |
| Reports & exports, activity log | ✓ | ✓ | — |
| Users, settings, print layouts | ✓ | — | — |

## Daily workflow — new owner to live sticker
1. **Customers → New customer.** Name and mobile (010… is converted to +20 automatically). In *Privacy & contact preferences*, record the owner's choice:
   - *Not recorded* — number hidden (default).
   - *Phone private* / *Phone public* — you must select **how consent was given** (in person, call, written form) and can add evidence (e.g. form number). Only choose *Phone public* if the owner explicitly agreed.
2. **Add vehicle** from the customer page: make, model, year, colour, category. *Public listing*: *Unlisted* shows only make/model/year/colour; *Listed for sale* also shows optional details, price (if “show price” is ticked), mileage (if ticked) and description.
3. **Photo (optional):** upload on the vehicle page. It stays hidden until an Admin clicks *Approve for public page*. Location data is removed automatically.
4. **Assign sticker:** take a sticker from stock, type the serial printed on it (e.g. `LC-000123`) in *Rear-window sticker* → *Assign sticker*.
5. **Activate (Admin):** *Activate* on the vehicle or sticker page. The public page is now live. Use *Open public page* to check.
6. **Record the sale:** *Record sale* on the vehicle page (customer, vehicle and sticker are pre-filled). Revenue only counts sales marked **Paid**.
7. Install the sticker following STICKER_PRINT_SPECIFICATIONS §9.1.

## Changing what visitors see
Edit the vehicle or the customer's privacy choice — the public page updates immediately; nothing needs reprinting.

## Suspend, replace, retire
- **Suspend** (temporary, reason required): public page shows “not active”. **Reactivate** restores it.
- **Deactivate** (permanent, reason required): for lost/damaged/replaced stickers. The code is never reused. Then assign a new sticker to the vehicle and activate it.
- A customer set to *Inactive* or *Archived* keeps history, but their pages hide contact details and stickers cannot be activated.

## Batches (Admin)
1. **Batches → New batch**: unique name + quantity → *Generate codes*.
2. Download **Proof** to check; send the printer **Print — CMYK, mirrored**, **Print — white underlay**, and **Cut contour** using the agreed sheet layout.
3. After checking printed stickers: **Release to stock**.
4. **Export CSV** for the printer's or warehouse's records. **Close batch** when it should no longer be used.

## Contact requests
If *message relay* is enabled in Settings and the owner allowed it, visitors can leave a message. Find them in **Contact requests**, call the owner, then *Mark relayed* / *Close*.

## Reports
**Reports & exports**: customers, vehicles, QR codes, batches, sales, revenue by month, activation performance — CSV (Excel-friendly) or PDF. Customer exports include full mobile numbers only for Super Admins.

## Users (Super Admin)
**Users → New user**: name, email, role, temporary password (≥ 12 characters). The user must change it at first sign-in. *Reset password* signs the user out everywhere. Uncheck *Account active* to disable access immediately. The system always keeps at least one active Super Admin.

## Settings (Super Admin)
Public page options (category, photos, extended details), message relay on/off, public support phone/e-mail, default currency and default sticker price, sticker sheet layouts.

## Security habits
Never share accounts. Sign out on shared computers. After 5 wrong passwords an account locks for 15 minutes. If you see unexpected activity, check **Activity log** and contact a Super Admin.
