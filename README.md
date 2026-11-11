# StockBill — Apparel Inventory & Billing (installable web app)

A reusable, configurable inventory + billing tool for apparel shops, built to run on iOS and
Android phones as an installable web app (PWA). All data stays on the phone — no server, no
account, works offline once installed.

Styled as **"Noir & Gold"** — a black-and-gold boutique look drawn from your own Seema Kandoi
monogram, with a hand-drawn line-icon set throughout (no emoji, no clip-art), and home-screen
icons rebuilt with proper safe-zone padding so they display correctly (uncropped) on every Android
launcher shape.

## What's inside

- **Item / SKU Master** — create and maintain your own SKUs manually (code, description, cost
  price, sell price). No camera or OCR tag-scanning anywhere in the app — every SKU, purchase, and
  bill line is entered by typing or by searching.
- **Purchase Entry & Stock (batch/lot inventory)** — pick/add a supplier, enter the mandatory
  invoice number + date, then add purchase lines by **searching the Item Master** and typing a
  quantity + cost price. Each line becomes one stock "batch." Stock on hand per SKU is the sum of
  its batches' remaining quantity (not tracked piece-by-piece), and sales consume the **oldest
  batch first (FIFO)** — which is also what drives the ageing display.
- **Vendor billing** — per supplier invoice: enter the bill amount, log payments (mode + amount),
  apply a final-settlement discount/adjustment, record returns to the vendor (type a quantity per
  batch — no scanning), and see the running balance and days overdue against your configured
  credit period.
- **Customer billing** — search/add a customer (phone, Instagram ID, delivery address), then bill
  by **typing to search** the Item Master (or add a one-off manual line). Attach up to 3 photos for
  alteration notes, and the bill number auto-generates as `DDMMYYYY` + a daily sequence + `T`
  (Trading) or `D` (Tailoring/Designing). Download or WhatsApp-share any invoice as a PDF, straight
  from its detail screen.
- **Loyalty Programme** — every completed sale earns points automatically (a configurable % of the
  bill amount). Points can be redeemed as a bill discount at a configurable ₹-per-point value,
  capped at a configurable % of the current bill so redemption never wipes out a sale. Every
  earn/redeem/return-adjustment is kept in a per-customer ledger.
- **Customer returns & Credit Notes** — recording a return against a bill (qty-based, no scanning)
  always issues a numbered Credit Note — a running ₹ credit, separate from Loyalty points, that can
  later be applied toward any future bill for that customer (in full or split across several), and
  claws back the Loyalty points that were earned on the returned amount. Each Credit Note can be
  downloaded/shared as its own PDF too.
- **Customer-wise transaction view** — tap any customer to see their profile, points balance +
  ledger, every Credit Note they've been issued, and every bill they've ever been billed, with
  running balances.
- **Dashboard** — a **Daily** tab (Cash collected / Credit / Total Sales / Total Purchase-payment
  for any chosen date, with a payment-mode breakdown); an **Overview** tab with MTD (month-to-date)
  and YTD (financial-year-to-date, April–March) sales totals, a last-14-days daily sales chart, and
  an April–March monthly sales chart, alongside ageing and outstanding registers; plus By Supplier
  and By Customer views filterable by Weekly / Monthly / Custom date range.
- **Ageing alerts, outstanding payables/receivables, full + incremental JSON backup & restore,
  optional PIN lock.**

Everything above — markup %, Loyalty Programme rates, credit period, ageing thresholds — is
configurable from **Settings**.

## Install on your phone without the Play Store

This app is a Progressive Web App (PWA): a normal website that installs like a native app.

1. Host this folder somewhere with HTTPS (see below) or open it from your synced/shared folder on
   the phone's browser.
2. Open the link in Chrome (Android) or Safari (iPhone).
3. Android (Chrome): tap the ⋮ menu → **"Add to Home screen" / "Install app"**.
   iPhone (Safari): tap the Share icon → **"Add to Home Screen"**.
4. It now opens full-screen from your home screen like a native app, with your own icon, and works
   fully offline after the first load — no Play Store, no account.

Your own logo becomes the home-screen icon automatically once you drop your logo files into the
`icons/` folder (replacing `icon-192.png` / `icon-512.png`) and re-install — just send a logo image
and the icons/manifest can be regenerated for you.

### Fastest hosting option — Netlify Drop (no account needed)

1. Go to **https://app.netlify.com/drop** on your computer.
2. Drag this whole folder onto the page.
3. It gives you a live `https://something.netlify.app` link in seconds — open that on your phone
   and install as above.

### Alternative — GitHub Pages

1. Create a new GitHub repo and upload all files in this folder.
2. Repo Settings → Pages → deploy from the `main` branch, root folder.
3. GitHub gives you a `https://<you>.github.io/<repo>/` URL — open and install it the same way.

### Testing locally on a computer first (optional)

If you have Python installed:
```
python3 -m http.server 8000
```
then open `http://localhost:8000` in a desktop browser — `localhost` is treated as secure, so
install/offline behavior can be checked there too before deploying anywhere.

## First-time setup in the app

1. Open **Settings** and set your business name, currency symbol, default markup %, vendor credit
   period, and ageing thresholds.
2. Set up the **Loyalty Programme**: points-earned % of bill amount, ₹ value per point, and the
   max % of a bill redeemable with points.
3. Go to **Item Master** (via More ▸ Item Master) and create your SKUs — or just create them inline
   the first time you enter a purchase or a bill.
4. Optional: set a PIN to lock the app on this phone.
5. Go to **Backup & Restore** occasionally and export a backup (full the first time, then "changes
   since last backup" for quick incremental exports afterward) and save it somewhere safe, like
   Google Drive — since all data lives only on this device, a backup is your safety net. Backups
   are always safe to restore more than once: matching records are overwritten by their own ID, so
   nothing is ever duplicated or lost by importing the same file twice.

## Data model notes

- **Batch/lot inventory**: a purchase invoice line is one "batch" (SKU + quantity + cost). Stock on
  hand for a SKU is the total remaining quantity across its batches. There is no per-physical-piece
  tracking — if you need to know exactly which units came from which invoice, the batch/ageing view
  under Inventory shows that breakdown.
- **Overselling is allowed, not blocked** — if a sale's quantity exceeds what's recorded in stock,
  it still completes (so billing is never held up at the counter) but is flagged so you can correct
  stock afterward with a fresh purchase entry.
- **Everything is keyed by a stable internal ID**, which is what makes backups safe to repeat or
  layer (a full export followed by several incremental ones) without ever creating duplicate rows.
