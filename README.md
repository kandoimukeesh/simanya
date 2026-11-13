# StockBill — Apparel Inventory & Billing (installable web app)

A reusable, configurable inventory + billing tool for apparel shops, built to run on iOS and
Android phones as an installable web app (PWA). All data stays on the phone — no server, no
account, works offline once installed.

Styled as **"Noir & Gold"** — a black-and-gold boutique look drawn from your own Seema Kandoi
monogram, with a hand-drawn line-icon set throughout (no emoji, no clip-art), and home-screen
icons rebuilt with proper safe-zone padding so they display correctly (uncropped) on every Android
launcher shape.

## What's inside

- **Item / SKU Master** — every SKU is composed automatically from three parts: a 3-letter
  **Vendor Code** (set when you create the vendor, duplicate-checked), a 3-letter **Item Type
  code** (e.g. "Kurta Pant" → `KPN`, duplicate-checked, managed under More ▸ Item Types), and a
  6-character alphanumeric free-text code you type (auto-capitalised). Each SKU carries Cost
  Price, Wholesale Price and Selling Price (Wholesale/Selling auto-suggest from Cost using your
  configured markup %, fully overridable), and is tagged **Trading Item** or **Raw material /
  Service Charges** — service items skip stock-tracking entirely (no batches, no "in stock",
  never consumed by FIFO). No camera or OCR tag-scanning anywhere in the app.
- **Vendors (purchasing lives here)** — there's no separate "Purchase" tab: recording a purchase
  starts from the Vendors tab (or from inside a vendor's own page). Pick/add a vendor, enter the
  mandatory invoice number + date, then add purchase lines by **searching the Item Master** and
  typing a quantity + cost price (Trading items only — service items never show up here). Each
  line becomes one stock "batch," consumed **oldest-first (FIFO)** by sales. A purchase invoice
  can also carry **any other charges applicable** (freight, handling, …) — spread **equally per
  unit** across every piece received on that invoice, so each SKU's landed cost = its own cost +
  that per-unit allocation. Vendor billing itself (bill amount, payments, final-settlement
  discount/adjustment) stays on the same screen, and a **Debit Note** is issued automatically
  every time stock is returned to a vendor.
- **Inventory** — stock on hand per SKU (Trading items only), with **Avg Cost shown as the
  landed cost** (purchase cost + allocated other-charges), and an invoice-wise batch breakdown
  tapping through to each batch's own purchase cost, allocated charge, landed cost and remaining
  quantity.
- **Customer billing** — search/add a customer, then bill by **typing to search** the Item Master
  (description or SKU) or add a one-off manual/"additional charge" line. Selling Price
  auto-populates and is editable per line and at the overall/final-amount level. Stock on hand is
  shown to you while billing but never printed on the customer-facing invoice. Each line has its
  own optional **Additional information** note, and — for Tailoring bills — its own **Expected
  Delivery Date**. A tailoring/alteration charge can also be **added onto an already-finalized
  bill** (e.g. an alteration on an item sold earlier), tagging that bill directly. Attach up to 3
  photos for alteration notes, and the bill number auto-generates as `DDMMYYYY` + a daily
  sequence + `T` (Trading) or `D` (Tailoring). Download or WhatsApp-share any invoice as a PDF.
- **Tailoring / Delivery tracking** — every tailoring line carries an 8-stage status (Pending →
  Designing → Cutting → Tailoring → Fitting → Ready for Trial → Complete → Delivered), each
  date-stamped. The **Delivery Pending** panel (More ▸ Delivery Pending, also surfaced on Home)
  groups every not-yet-delivered item **date-wise**, showing item count and ₹ value per date, and
  taps straight through to that bill. Update a status and optionally send the customer a short,
  light **WhatsApp** update — pick English / हिंदी / বাংলা right before sending.
- **Loyalty Programme** — configurable per billing type under Settings (Trading / Tailoring) —
  Tailoring is excluded by default. Eligible sales earn points automatically (a configurable % of
  the bill amount); points redeem as a bill discount at a configurable ₹-per-point value, capped
  at a configurable % of the current bill. Every earn/redeem/return-adjustment is kept in a
  per-customer ledger.
- **Customer returns, Credit Notes & Debit Notes** — a customer return always issues a numbered
  Credit Note (claws back Loyalty points proportionally); a vendor return always issues a numbered
  Debit Note. **More ▸ Credit / Debit Notes** lists both together, newest first.
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
