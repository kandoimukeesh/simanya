# StockBill — Requirement & Change-Request Document

**Purpose of this file:** this is the living spec of what StockBill currently does. When you want a change or a new feature, copy the relevant section below, edit it to describe what you want, and send it back. Because the app is split into one file per module (see "Codebase map"), a request scoped to one module normally means I only touch that module's file.

**How to use this for a change request:**
1. Find the module section below that the change belongs to (Item Master, Inventory, Vendor Billing, Customer Billing, Loyalty Programme, Credit Notes, Customers, Dashboard, Settings, or Backup).
2. Copy that section's "Current behaviour" bullets into your message.
3. Under it, add a new "Requested change" block using the template at the very bottom of this document.
4. If the change touches more than one module (e.g. a new field that appears in both Inventory and Customer Billing), just list it under each module it affects.

Last updated: 2026-11-11 (v5 — "Noir & Gold" visual redesign + hand-drawn line icons + fixed app-icon safe-zone padding, and a Dashboard Overview rebuild with MTD/YTD sales and daily/monthly sales charts).

---

## Codebase map (what file owns what)

| File | Owns |
|---|---|
| `core.js` | Shared shell: navigation, sheets/toasts, the generic search-or-add picker, a plain reference-photo camera helper, the share-or-download helper (native share sheet with a download fallback — used by backups and PDFs alike), PIN lock, the hand-drawn line-icon set (`icon()`), and the inline-SVG bar-chart helper (`renderBarChart()`) used by the Dashboard. Infrastructure only — no business rules. |
| `styles.css` | **The only file that should need editing for a look/color/theme change.** Theme: "Noir & Gold" — a black-ink + warm-gold palette on ivory (true black+gold in dark mode), matching the Seema Kandoi monogram. No other module file references raw colors — only these CSS variables. |
| `data.js` | All business rules and data calculations: settings, suppliers, customers, Item Master, vendor invoice math, inventory batches/FIFO, customer invoice math, the Loyalty Programme, and Credit Notes. **This is the file to check first whenever a number looks wrong.** |
| `db.js` | On-device storage (IndexedDB) — stores, schema upgrades, and the backup export/import helpers (including incremental export). Rarely needs changes. |
| `pdf.js` | Builds the downloadable/shareable invoice PDF and credit-note PDF (using the vendored `lib/jspdf.umd.min.js`, so it works fully offline). |
| `items.js` | **Item / SKU Master.** Manually created and edited SKUs: code, description, cost price, sell price. |
| `inventory.js` | **Module A — Purchase Entry & Stock.** Supplier pick/add, invoice number + date entry, adding purchase lines by searching the Item Master and typing a quantity + cost, and the batch/lot stock-on-hand + ageing view. |
| `vendors.js` | **Module B — Vendor Billing.** Vendor list, per-supplier invoice list, bill amount, payments, discount/adjustment, returns to vendor (qty checklist against the invoice's own batches). |
| `sell.js` | **Module C — Customer Billing.** Customer pick/add, type-to-search billing against the Item Master, bill numbering, payments, discount/adjustment, Loyalty redemption + Credit Note application at billing time, customer returns, and the invoice PDF download/share button. |
| `customers.js` | The customer master-list screen, add/edit form, and the **customer-wise transaction view** (profile, loyalty ledger, open/used Credit Notes, every bill). |
| `suppliers.js` | The supplier master-list screen and add/edit form. |
| `dashboard.js` | The Dashboard: **Daily** (Cash / Credit / Total Sales / Total Purchase-payment for a chosen date), Overview, By Supplier, and By Customer tabs (the latter two with Weekly/Monthly/Custom period filter). |
| `settings.js` | The Settings screen: business info, markup %, credit/ageing thresholds, the Loyalty Programme setup, PIN. |
| `home.js` | The Home tab (summary stats, alerts) and the "More" menu. |
| `backup.js` | Export (full and incremental)/import/wipe all data. |

---

## Item / SKU Master

**Current behaviour:**
- SKUs are created and maintained **manually** by you — there is no camera/OCR tag-scanning anywhere in the app anymore.
- Each SKU has: a code (e.g. `SAREE-001`), a description, a cost price, and a sell price.
- When you type a cost price for a new SKU, the sell price is auto-suggested using the markup % set in Settings — you can always overwrite it.
- A SKU code must be unique; trying to reuse one shows an error instead of saving.
- SKUs can be marked inactive so they stop appearing when searching to bill or purchase, without deleting their history.
- New SKUs can also be created inline, right from the search box, while entering a purchase or a sale (tap "+ Add new").

**Requested change (template — copy for new requests):**
```
Module: Item / SKU Master
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Module A — Purchase Entry & Stock (batch/lot inventory)

**Current behaviour:**
- Before entering a purchase, you must pick or add a supplier, then enter a mandatory invoice number and invoice date.
- Each purchase line is added by **typing to search** the Item Master for the SKU (or creating one inline), then entering a quantity and a cost price per unit. That line becomes one stock "batch."
- After each line, you're asked "add another SKU to this invoice?" so a whole invoice can be entered in one session.
- Stock on hand for a SKU is the sum of `qtyRemaining` across all its batches — **not** tracked piece-by-piece. Sales, vendor returns, and customer returns all adjust `qtyRemaining` on the relevant batch(es).
- Sales consume the **oldest batch first (FIFO)**, which is also what drives the ageing display.
- The Inventory screen groups stock by SKU, shows total qty in stock, the oldest batch's age (with a warning/critical badge from the thresholds in Settings), the current sell price, and the stock's average cost.
- A sale is allowed to oversell beyond what's recorded in stock (it's flagged, not blocked) — correct it later with a fresh purchase entry if that happens.

**Requested change (template):**
```
Module: Purchase Entry & Stock
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Module B — Vendor Billing

**Current behaviour:**
- Vendors screen lists every supplier with total outstanding balance and an overdue count (based on the configurable vendor credit period in Settings).
- Tapping a supplier shows all their purchase invoices with cost total, bill amount, and balance/refund status (Overdue / Pending / Settled / Refund due).
- Opening an invoice shows: total purchased (sum of batch cost × qty), the vendor's actual bill amount (editable, defaults to cost total), payments recorded against it (amount + mode + date), and the running balance.
- **Discount / final settlement adjustment:** a signed adjustment (positive reduces what you owe, negative increases it) with a note, applicable any time, kept in a running history.
- **Returns to vendor:** from the invoice, "+ Record return" shows every batch still in stock under that invoice with a quantity-to-return input (defaulting to 0, capped at what's left) — no scanning, just type the quantities being returned. Returned units are removed from stock and credited against the invoice balance.
- The balance shown everywhere is: bill amount − returns credit − adjustments − payments made (never shown negative; a negative net instead shows as "Refund due").

**Requested change (template):**
```
Module: Vendor Billing
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Module C — Customer Billing

**Current behaviour:**
- Selecting "New Sale" makes you pick or add a customer (name, phone, Instagram handle, address), then choose the sale type — Trading (T) or Tailoring/Designing (D) — which sets the bill number's suffix.
- Bill numbers are auto-generated as `DDMMYYYY` + a daily running sequence + the T/D suffix (e.g. `28082026 01 T`).
- Items are added to the cart by **typing to search** the Item Master by SKU code or description — pick the item, enter a quantity, and the sell amount is pre-filled (qty × the SKU's sell price) but can be overridden. A manual free-text line (no SKU) is also available for one-off items.
- Up to 3 photos can be attached per sale (for alteration reference).
- Completing a sale consumes stock FIFO per line, then applies any Loyalty redemption, then accrues new Loyalty points — see the Loyalty Programme section below.
- The invoice detail screen shows subtotal, final amount, loyalty points earned on that bill, payments recorded, and balance/refund status.
- **Discount / adjustment:** same mechanism as vendor billing — a signed adjustment with a note, applicable any time, kept in a running history.
- **Customer returns:** "↩️ Record return" shows every line on that bill with a quantity-to-return input (capped at the billed quantity) — no scanning. Each return is marked Resellable (the units go back into stock as a fresh batch) or Damaged (written off), with a note, and always issues a numbered **Credit Note** (see that section below) rather than touching this bill's own figures — this bill's subtotal/final amount never change after the fact.
- **Applying a Credit Note at billing time:** if the customer has any open Credit Note balance (from a past return, on any bill), the sale screen shows it and lets you apply some or all of it to the new bill — shown on that new bill as a "Credit note(s) applied" line, same as a discount.
- The balance shown everywhere is: final amount − returns credit − adjustments (including any Credit Notes applied) − payments received (never shown negative; a negative net instead shows as "Refund due").
- **Download / share the invoice as a PDF**, from the invoice detail screen — your logo + business name, itemized SKU lines, Loyalty points earned/redeemed, and payment/balance status. Opens your phone's native share sheet (so it can go straight to WhatsApp, email, Drive, etc.) with a plain download as a fallback.

**Requested change (template):**
```
Module: Customer Billing
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Loyalty Programme

**Current behaviour (fully configurable in Settings):**
- Every completed sale **automatically earns points**: `points = finalAmount × Points-earned-%` (rounded to the nearest whole point). Default: 2%.
- Each point has a **redemption value in ₹**, set in Settings (default ₹1/point).
- Redemption happens **at billing time**, before the new points for that same bill are earned (so you can never redeem points you just earned on the bill you're redeeming them on).
- The most that can be redeemed on any one bill is capped at a **% of that bill**, set in Settings (default 10%) — whichever is smaller of the customer's points balance or that cap.
  - Worked example (10% cap, ₹1/point): a customer has 500 points (worth ₹500). On a ₹2,500 bill, the most redeemable is ₹250 (250 points) — not the full 500, even though they have enough points.
- **A customer return claws back points**: since the points earned on a bill were based on its full amount, returning part of that bill removes `round(returned amount × Points-earned-%)` points from the customer's balance — capped so it never goes negative (e.g. if those exact points were already redeemed on a later bill in the meantime). This adjustment, and the Credit Note it's tied to, are both recorded.
- Every earn, redeem, and return-adjustment is recorded in that customer's loyalty ledger, visible on their customer-detail screen along with their running points balance.

**Requested change (template):**
```
Module: Loyalty Programme
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Credit Notes

**Current behaviour:**
- A Credit Note is issued **automatically and only** by recording a customer return — there's no way to create one by hand. It's a running ₹ credit, kept separate from Loyalty points, numbered `CN-DDMMYYYY-NN`, and always traceable back to the original bill the return was against.
- Its value is the returned amount (quantity × that line's own unit price); its "balance available" starts equal to that and only ever goes down as it gets applied.
- **It can be applied, in full or split across more than one future bill**, toward any later purchase that same customer makes — whichever bill(s) it's used on shows a "Credit note(s) applied" line, and the Credit Note's own history records every bill it was used against and how much.
- It also records the Loyalty points that were clawed back for that same return, so the two adjustments (₹ credit and points) are always visible together on the one document.
- Each Credit Note can be downloaded/shared as its own PDF (same native-share-or-download mechanism as the invoice PDF) from the customer's transaction view.

**Requested change (template):**
```
Module: Credit Notes
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Customers (master list + transaction view)

**Current behaviour:**
- The Customers list is searchable by name/phone/Instagram handle and shows each customer's current points balance at a glance.
- Tapping a customer opens their **transaction view**: profile details, total bills / total billed / balance due / refund due at a glance, points balance with its ₹ value, a loyalty earn/redeem/return-adjustment history, every Credit Note they've ever been issued (open or fully applied, each downloadable as its own PDF), and a list of every one of their bills (tap any bill to open its full detail).

**Requested change (template):**
```
Module: Customers
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Dashboard

**Current behaviour:**
- Four tabs: **Daily**, **Overview**, **By Supplier**, and **By Customer**.
- **Daily** (defaults to today, any date can be picked): Cash collected, Credit (the still-unpaid portion of that day's own bills), Total Sales billed that day, and Total Purchase-payment made to vendors that day — plus a breakdown of customer receipts and vendor payments by payment mode, and units/value of stock received that day.
- **Overview**: **MTD sales** (month-to-date, calendar month) and **YTD sales** (financial-year-to-date, 1 April–31 March — the Indian business year) as two stat cards; a **daily sales chart** (last 14 days, today's bar highlighted); a **monthly sales chart** (the current financial year's 12 months, April→March, current month highlighted, future months shown empty); then (all-time) ageing buckets for in-stock units, total purchase cost, total sales billed, outstanding-to-vendors list, outstanding-from-customers list. Both charts are hand-drawn inline SVG (no charting library, so they work fully offline) and read `finalAmount` from customer invoices — the same figure used everywhere else.
- **By Supplier** and **By Customer** are filterable by **Weekly** (last 7 days), **Monthly** (last 30 days), or a **Custom** date range.
- By Supplier shows, per supplier in the period: units purchased, purchase cost, an estimated sell value, and payments made in that period.
- By Customer shows, per customer in the period: bills raised, amount billed, amount paid, and balance due (returns/adjustments already netted in) — tap a customer card to open their full transaction view.

**Requested change (template):**
```
Module: Dashboard
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Settings

**Current behaviour:**
- Business name, currency symbol.
- Default markup % over cost — used only to suggest a sell price when you create a new SKU.
- Vendor credit period (days before a vendor bill counts as overdue).
- Ageing warning/critical thresholds (days) for in-stock units.
- **Loyalty Programme setup:** points-earned % of bill amount, ₹ value per redeemed point, and the maximum % of a bill that can be paid using points.
- Optional numeric PIN lock on app open.

**Requested change (template):**
```
Module: Settings
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Backup & Data

**Current behaviour:**
- All data is stored fully on-device (offline-first), nothing is sent to a server.
- **Full export**: one-tap export of everything, using your phone's native Share sheet (so you can send the backup file straight to Google Drive, email, Files, etc.) with a fallback plain download if Share isn't supported.
- **Incremental export** ("Export changes since last backup"): exports only the records touched since the last backup timestamp, so repeat backups stay small. Enabled only after at least one full export has been done.
- Both export kinds are restored the same way, and both are safe to import repeatedly or out of order — every record is matched and overwritten by its own internal ID (never duplicated), so importing the same file twice, or an incremental file on top of a full one, never creates duplicate rows and never loses data.
- A "wipe all data" option exists for a full reset.
- Home screen nudges you to back up if it's been a while since the last one.
- Exporting is non-destructive — your live data stays on the device and keeps growing; the export is just a copy.

**Requested change (template):**
```
Module: Backup & Data
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## General / cross-cutting change request template

Use this if a request doesn't fit neatly into one module above, or spans several:

```
Title:
Modules affected:
What should change:
Why / when this matters:
Anything that should NOT change:
Priority (nice-to-have / needed soon / urgent):
```
