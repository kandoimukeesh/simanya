# StockBill — Requirement & Change-Request Document

**Purpose of this file:** this is the living spec of what StockBill currently does. When you want a change or a new feature, copy the relevant section below, edit it to describe what you want, and send it back. Because the app is split into one file per module (see "Codebase map"), a request scoped to one module normally means I only touch that module's file.

**How to use this for a change request:**
1. Find the module section below that the change belongs to (Item Master, Item Types, Vendors & Purchasing, Inventory, Customer Billing, Delivery Tracking, Loyalty Programme, Credit Notes & Debit Notes, Customers, Dashboard, Settings, or Backup).
2. Copy that section's "Current behaviour" bullets into your message.
3. Under it, add a new "Requested change" block using the template at the very bottom of this document.
4. If the change touches more than one module (e.g. a new field that appears in both Inventory and Customer Billing), just list it under each module it affects.

Last updated: 2026-11-13 (v7 — Item Master SKU composition from Vendor Code + Item Type + free code; Wholesale Price; Trading vs Service/Raw-material category with stock-tracking skip; Purchase Entry moved under Vendors; purchase-invoice "other charges" landed-cost allocation; Inventory SKU-level batch breakdown; per-line note + delivery date + Item-no on bills; tailoring-on-an-existing-bill; Loyalty Programme gated by billing type (Tailoring excluded by default); Debit Notes + a combined Credit/Debit Notes panel; the Delivery Pending panel with 8-stage status tracking and WhatsApp updates in English/Hindi/Bengali).

---

## Codebase map (what file owns what)

| File | Owns |
|---|---|
| `core.js` | Shared shell: navigation, sheets/toasts, the generic search-or-add picker, a plain reference-photo camera helper, the share-or-download helper (native share sheet with a download fallback — used by backups and PDFs alike), PIN lock, the hand-drawn line-icon set (`icon()`), and the inline-SVG bar-chart helper (`renderBarChart()`) used by the Dashboard. Infrastructure only — no business rules. |
| `styles.css` | **The only file that should need editing for a look/color/theme change.** Theme: "Noir & Gold" — a black-ink + warm-gold palette on ivory (true black+gold in dark mode), matching the Seema Kandoi monogram. No other module file references raw colors — only these CSS variables. |
| `data.js` | All business rules and data calculations: settings, vendors (incl. vendor code), Item Types, Item Master (incl. SKU composition), vendor invoice math (incl. other-charges allocation), inventory batches/FIFO (category-aware), customer invoice math, the Loyalty Programme (sale-type gated), Credit Notes, Debit Notes, and Delivery tracking (statuses + WhatsApp message templates). **This is the file to check first whenever a number looks wrong.** |
| `db.js` | On-device storage (IndexedDB) — stores, schema upgrades, and the backup export/import helpers (including incremental export). Rarely needs changes. |
| `pdf.js` | Builds the downloadable/shareable invoice PDF and credit-note PDF (using the vendored `lib/jspdf.umd.min.js`, so it works fully offline). |
| `items.js` | **Item / SKU Master** (vendor + item type + free code composition, category, cost/wholesale/sell price) and the **Item Types** master list (the 3-letter middle segment of every SKU). |
| `inventory.js` | Stock on hand per SKU (Trading items only), ageing, and the SKU-level **invoice-wise batch breakdown** (purchase cost / allocated other-charge / landed cost / qty remaining per batch). Purchase-entry *data entry* itself now starts from `vendors.js` (see below) but the session-flow code (`startCaptureFlow`/`runCaptureSession`) still lives in this file. |
| `vendors.js` | **Vendors & Purchasing.** Vendor list, per-vendor invoice list, bill amount, payments, discount/adjustment, "any other charges applicable" on a purchase invoice (landed-cost allocation), and returns to vendor (qty checklist against the invoice's own batches — always issues a Debit Note). |
| `sell.js` | **Customer Billing.** Customer pick/add, type-to-search billing against the Item Master, bill numbering, per-line note + (for Tailoring) expected delivery date, an "additional charge" quick-add, payments, discount/adjustment, Loyalty redemption + Credit Note application at billing time, customer returns, adding a tailoring/alteration item onto an already-finalized bill, per-line delivery-status update + WhatsApp send, and the invoice PDF download/share button. |
| `delivery.js` | The **Delivery Pending** panel: date-wise grouping of every not-yet-delivered tailoring line (item count + ₹ value), tapping through to its bill. |
| `notes.js` | The combined **Credit / Debit Notes** panel (every CN and DN together, newest first). |
| `customers.js` | The customer master-list screen, add/edit form, and the **customer-wise transaction view** (profile, loyalty ledger, open/used Credit Notes, every bill). |
| `suppliers.js` | The vendor master-list screen and add/edit form (name, **vendor code**, phone, notes). |
| `dashboard.js` | The Dashboard: **Daily** (Cash / Credit / Total Sales / Total Purchase-payment for a chosen date), Overview, By Supplier, and By Customer tabs (the latter two with Weekly/Monthly/Custom period filter). |
| `settings.js` | The Settings screen: business info, markup % + wholesale markup %, credit/ageing thresholds, the Loyalty Programme setup (incl. which billing type(s) it applies to), PIN. |
| `home.js` | The Home tab (summary stats, alerts, the Delivery Pending card) and the "More" menu. |
| `backup.js` | Export (full and incremental)/import/wipe all data. |

---

## Item / SKU Master

**Current behaviour:**
- Every SKU is **composed automatically** from three parts, concatenated: `Vendor Code + Item Type Code + a 6-character free-text code` (e.g. vendor `SRG` + item type `KPN` + free code `000123` → SKU `SRGKPN000123`).
  - **Vendor Code**: 3 letters, set when the vendor is created (see Vendors & Purchasing below) — duplicate-checked, so two vendors can never share a code.
  - **Item Type**: a separate small master (code + description), e.g. "Kurta Pant" → `KPN`. Managed under More ▸ Item Types, or created inline (same "+ Add new" pattern as everywhere else) while creating an item. Code is 3 letters, duplicate-checked.
  - **Free code**: 6 characters, alphanumeric only, you type it, auto-capitalised.
- A SKU is unique by construction (the three parts can't repeat together) — trying to reuse an identical combination shows an error instead of saving.
- Each item has **Cost Price**, **Wholesale Price**, and **Selling Price**. Wholesale and Selling both auto-suggest from Cost Price using two separate markup %s set in Settings (default 20% for Wholesale, 40% for Selling) — both are always overridable, and once you've typed into either price field by hand, it stops auto-updating from Cost Price.
- Every item is tagged **Trading Item** or **Raw material / Service Charges** (the "service" category). Service/Raw-material items are never stock-tracked: they never get purchase batches, never show "in stock," and are skipped entirely by FIFO stock consumption when billed. Use this category for tailoring/alteration charges and other non-stocked line items.
- Items can be marked inactive so they stop appearing when searching to bill or purchase, without deleting their history.
- No camera/OCR tag-scanning anywhere in the app — everything above is typed or picked from a list.

**Requested change (template — copy for new requests):**
```
Module: Item / SKU Master
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Item Types

**Current behaviour:**
- A small master list — just a 3-letter code (duplicate-checked) and a free-text description (e.g. `KPN` / "Kurta Pant").
- Managed under More ▸ Item Types (list + add/edit), or created inline from the Item Master form.
- Exists purely to supply the middle segment of every SKU.

**Requested change (template):**
```
Module: Item Types
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Vendors & Purchasing

**Current behaviour:**
- There is no separate "Purchase" tab — recording a purchase starts from the **Vendors** tab itself (its own `+` button), or from inside a specific vendor's own page (which skips straight to that vendor, invoice-number/date prompt).
- Every vendor carries a **Vendor Code** (3 letters, typed or chosen at vendor creation, duplicate-checked) — see Item / SKU Master above for why.
- Before entering a purchase, you pick or add a vendor, then enter a mandatory invoice number and invoice date.
- Each purchase line is added by **typing to search** the Item Master for the SKU (Trading items only — Service/Raw-material items never appear here) or creating one inline, then entering a quantity and a cost price per unit. That line becomes one stock "batch."
- After each line, you're asked "add another SKU to this invoice?" so a whole invoice can be entered in one session.
- **Any other charges applicable** can be added to a purchase invoice (e.g. freight, handling) — amount + note. These are spread **equally per unit** across every piece ever received on that invoice (total other charges ÷ total pieces = a flat ₹ added to every unit's landed cost), **not** proportional to each line's value. This only affects the landed cost shown in Inventory — it does **not** change the vendor's Bill Amount / payable balance (if the vendor themselves billed you for it, add that to Bill Amount separately).
- The vendor invoice screen also has: bill amount (editable, defaults to cost total), payments (amount + mode + date), a signed discount/final-settlement adjustment with a note, and the running balance (bill amount − returns credit − adjustments − payments; never negative — a negative net shows as "Refund due").
- **Returns to vendor:** "+ Record return" shows every batch still in stock under that invoice with a quantity-to-return input (capped at what's left) — no scanning. Returned units are removed from stock, credited against the invoice balance, and **always issue a numbered Debit Note** (`DN-DDMMYYYY-NN`) — see Credit Notes & Debit Notes below.

**Requested change (template):**
```
Module: Vendors & Purchasing
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Inventory

**Current behaviour:**
- Shows stock on hand grouped by SKU — **Trading items only**; Service/Raw-material items never appear here since they're never stock-tracked.
- Each SKU card shows total qty in stock, the oldest batch's age (with a warning/critical badge from the thresholds in Settings), the current sell price, and **Avg Cost shown as the landed cost** (purchase cost + that batch's invoice's allocated other-charges per unit, quantity-weighted across remaining batches).
- Tapping a SKU opens its **invoice-wise batch breakdown**: for each purchase invoice it came from — purchase cost, the invoice's allocated other-charge per unit, the resulting landed cost, and qty remaining out of qty received.
- Stock on hand for a SKU is the sum of `qtyRemaining` across all its batches — **not** tracked piece-by-piece. Sales, vendor returns, and customer returns all adjust `qtyRemaining` on the relevant batch(es).
- Sales consume the **oldest batch first (FIFO)**, which is also what drives the ageing display.
- A sale is allowed to oversell beyond what's recorded in stock (it's flagged, not blocked) — correct it later with a fresh purchase entry if that happens.

**Requested change (template):**
```
Module: Inventory
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Customer Billing

**Current behaviour:**
- Selecting "New Sale" makes you pick or add a customer (name, phone, Instagram handle, address), then choose the sale type — Trading (T) or Tailoring/Designing (D) — which sets the bill number's suffix.
- Bill numbers are auto-generated as `DDMMYYYY` + a daily running sequence + the T/D suffix (e.g. `28082026 01 T`).
- Items are added to the cart by **typing to search** the Item Master by SKU code or description (Item no. + description + Selling Price shown) — pick the item, enter a quantity, and the sell amount is pre-filled (qty × the SKU's sell price) but can be overridden, both per line and at the overall/final-amount level. Stock on hand is shown to you while picking a Trading item (never printed on the customer-facing invoice/PDF).
- Each line has its own optional **"Additional information"** free-text note.
- On a **Tailoring** bill, each line also gets its own **Expected Delivery Date** (defaults to the invoice date) — see Delivery Tracking below.
- An **"Additional charge applicable"** quick-add button offers common presets (Delivery charge, Packing charge, Alteration charge, Handling charge) alongside the regular manual-line option, for one-off charges that aren't in the Item Master.
- Up to 3 photos can be attached per sale (for alteration reference).
- Completing a sale consumes stock FIFO per line for Trading SKUs only (manual lines and Service/Raw-material SKUs are skipped), then applies any Loyalty redemption, then accrues new Loyalty points if this billing type is Loyalty-eligible — see Loyalty Programme below.
- **Adding a tailoring/alteration item to an already-finalized bill:** from any invoice's detail screen, "+ Add tailoring / alteration item" lets you search the Item Master (typically a Service/Raw-material "tailoring charge" SKU — its own cost/price shown and editable here), set a quantity/charge/note/expected delivery date, and it's appended directly onto that existing bill (its subtotal and final amount increase accordingly) — this is the "alteration on an item already sold" flow, and does not require starting a brand-new sale.
- The invoice detail screen shows each line (with Item no., SKU, description, qty, amount, note, and — if set — its delivery date/status with an inline "Update" control), subtotal, final amount, loyalty points earned on that bill, payments recorded, and balance/refund status.
- **Discount / adjustment:** a signed adjustment with a note, applicable any time, kept in a running history.
- **Customer returns:** "↩️ Record return" shows every line on that bill with a quantity-to-return input (capped at the billed quantity) — no scanning. Each return is marked Resellable (the units go back into stock as a fresh batch) or Damaged (written off), with a note, and always issues a numbered **Credit Note** rather than touching this bill's own figures.
- **Applying a Credit Note at billing time:** if the customer has any open Credit Note balance (from a past return, on any bill), the sale screen shows it and lets you apply some or all of it to the new bill.
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

## Delivery Tracking

**Current behaviour:**
- Any customer-invoice line with an **Expected Delivery Date** (set when added on a Tailoring bill, or when adding a tailoring item to an existing bill) carries its own **8-stage delivery status**: Pending → Designing → Cutting → Tailoring → Fitting → Ready for Trial → Complete → Delivered, each date-stamped in that line's own history as it's updated.
- The **Delivery Pending** panel (More ▸ Delivery Pending, also surfaced as a card on Home whenever anything is pending) groups every not-yet-Delivered line **by its expected delivery date**, showing item count and total ₹ value per date, and flags anything overdue (date already passed). Tapping a date group lists its items; tapping an item opens that bill's detail screen.
- From any invoice detail screen, each delivery-tracked line has an **"Update"** control: change its status (saved immediately, date-stamped), and optionally **send the customer a WhatsApp update** — a short, light message, with the **language (English / हिंदी / বাংলা) chosen right before sending**, never a fixed default and never combined. Opens a `wa.me` link pre-filled with the message, addressed to the customer's saved phone number.

**Requested change (template):**
```
Module: Delivery Tracking
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Loyalty Programme

**Current behaviour (fully configurable in Settings):**
- **Gated by billing type** — Settings has a checkbox per billing type (Trading / Tailoring) for whether it participates in the Loyalty Programme at all. **Tailoring is excluded by default.** A sale on a non-eligible billing type neither earns nor can redeem points, and a return against it never claws back points (since none were ever earned).
- On an eligible sale, points are earned automatically: `points = finalAmount × Points-earned-%` (rounded to the nearest whole point). Default: 2%.
- Each point has a **redemption value in ₹**, set in Settings (default ₹1/point).
- Redemption happens **at billing time**, before the new points for that same bill are earned (so you can never redeem points you just earned on the bill you're redeeming them on).
- The most that can be redeemed on any one bill is capped at a **% of that bill**, set in Settings (default 10%) — whichever is smaller of the customer's points balance or that cap.
  - Worked example (10% cap, ₹1/point): a customer has 500 points (worth ₹500). On a ₹2,500 bill, the most redeemable is ₹250 (250 points) — not the full 500, even though they have enough points.
- **A customer return claws back points**: since the points earned on a bill were based on its full amount, returning part of that bill removes `round(returned amount × Points-earned-%)` points from the customer's balance — capped so it never goes negative, and skipped entirely if that bill's billing type wasn't Loyalty-eligible to begin with.
- Every earn, redeem, and return-adjustment is recorded in that customer's loyalty ledger, visible on their customer-detail screen along with their running points balance.
- The business-wide view — total points outstanding across every customer, the ₹ value that represents as a future discount liability, all-time earned/redeemed/clawed-back totals, and a top-holders list — lives on the **Dashboard ▸ Overview** tab.

**Requested change (template):**
```
Module: Loyalty Programme
What should change:
Why / when this matters:
Anything that should NOT change:
```

---

## Credit Notes & Debit Notes

**Current behaviour:**
- A **Credit Note** is issued automatically and only by recording a customer return — numbered `CN-DDMMYYYY-NN`, a running ₹ credit kept separate from Loyalty points, always traceable back to the original bill. Its "balance available" starts equal to the returned amount and only ever goes down as it's applied, in full or split across more than one future bill, toward any later purchase that same customer makes.
- A **Debit Note** is the vendor-side mirror: issued automatically and only by recording a return to a vendor — numbered `DN-DDMMYYYY-NN`, traceable back to the purchase invoice the return was against.
- **More ▸ Credit / Debit Notes** lists both together in one panel, newest first, searchable by number or party name, each tapping through to the relevant customer's or vendor's own page.
- Each Credit Note can still be downloaded/shared as its own PDF from the customer's transaction view.

**Requested change (template):**
```
Module: Credit Notes & Debit Notes
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
- **Overview**: **MTD sales** (month-to-date, calendar month) and **YTD sales** (financial-year-to-date, 1 April–31 March — the Indian business year) as two stat cards; a **daily sales chart** (last 14 days, today's bar highlighted); a **monthly sales chart** (the current financial year's 12 months, April→March, current month highlighted, future months shown empty); a **Loyalty programme** section — total points outstanding across every customer, the future ₹ discount value that liability represents (points × the redemption ₹-value from Settings), all-time points earned/redeemed/clawed-back-on-returns, and a top-holders list (tap a customer to open their ledger); then (all-time) ageing buckets for in-stock units, total purchase cost, total sales billed, outstanding-to-vendors list, outstanding-from-customers list. The sales charts are hand-drawn inline SVG (no charting library, so they work fully offline) and read `finalAmount` from customer invoices — the same figure used everywhere else.
- **By Supplier** and **By Customer** are filterable by **Weekly** (last 7 days), **Monthly** (last 30 days), or a **Custom** date range.
- By Supplier shows, per vendor in the period: units purchased, purchase cost, an estimated sell value, and payments made in that period.
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
- Default markup % over cost — suggests a **Selling Price** when you create a new SKU.
- Default wholesale markup % over cost — suggests a **Wholesale Price** when you create a new SKU.
- Vendor credit period (days before a vendor bill counts as overdue).
- Ageing warning/critical thresholds (days) for in-stock units.
- **Loyalty Programme setup:** which billing type(s) it applies to (Trading / Tailoring checkboxes — Tailoring unticked by default), points-earned % of bill amount, ₹ value per redeemed point, and the maximum % of a bill that can be paid using points.
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
