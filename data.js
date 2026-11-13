/* ============================================================
   data.js — the data/business-rules layer. No UI code lives here.

   This is the one file worth checking whenever a number looks wrong
   (a balance, a total, an ageing figure, a loyalty-points balance) —
   every screen module reads its figures from here rather than
   computing them inline, so a fix here fixes it everywhere at once.
   ============================================================ */

const DEFAULT_SETTINGS = {
  businessName: 'My Apparel Store',
  currencySymbol: '₹',
  markupPercent: 40,
  wholesaleMarkupPercent: 20, // used to suggest a Wholesale Price for a new SKU, same pattern as markupPercent
  vendorCreditDays: 30,
  agingWarnDays: 60,
  agingCriticalDays: 90,
  pinLock: '',
  // Loyalty programme — see settings.js for the explanation shown to the user.
  loyaltyAccrualPercent: 2,       // points earned = % of bill amount
  loyaltyRedemptionValue: 1,      // ₹ value of one point when redeemed
  loyaltyRedemptionCapPercent: 10, // max % of a bill payable using points
  loyaltyEligibleSaleTypes: ['trading'], // which saleType(s) earn/redeem loyalty — Tailoring excluded by default
  lastBackupAt: null
};

/* ---------- settings ---------- */
async function loadSettings() {
  let s = await DB.get('settings', 'app');
  if (!s) { s = { id: 'app', ...DEFAULT_SETTINGS }; await DB.put('settings', s); }
  SETTINGS = { ...DEFAULT_SETTINGS, ...s };
  return SETTINGS;
}
async function saveSettings(patch) {
  SETTINGS = { ...SETTINGS, ...patch };
  await DB.put('settings', { id: 'app', ...SETTINGS });
}

/* ---------- suppliers ----------
   Every supplier carries a 3-letter Vendor Code (e.g. "Sargam Sarees" -> SRG),
   set at creation, typed or chosen by the user, and checked for duplicates —
   it's the first segment of every SKU composed under this vendor. */
async function listSuppliers() { const rows = await DB.all('suppliers'); return rows.sort((a, b) => a.name.localeCompare(b.name)); }
async function findSupplierByVendorCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const rows = await DB.all('suppliers');
  return rows.find(s => (s.vendorCode || '').toUpperCase() === c) || null;
}
function validateVendorCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error('Vendor code must be exactly 3 letters (e.g. SRG)');
  return c;
}
async function addSupplier(data) {
  const vendorCode = validateVendorCode(data.vendorCode);
  const dup = await findSupplierByVendorCode(vendorCode);
  if (dup) throw new Error(`Vendor code "${vendorCode}" is already used by ${dup.name}`);
  const row = { id: uid('sup'), name: data.name.trim(), phone: data.phone || '', notes: data.notes || '', vendorCode };
  await DB.put('suppliers', row);
  return row;
}
async function updateSupplier(existing, patch) {
  const row = { ...existing, ...patch };
  if (patch.vendorCode != null) {
    row.vendorCode = validateVendorCode(patch.vendorCode);
    const dup = await findSupplierByVendorCode(row.vendorCode);
    if (dup && dup.id !== existing.id) throw new Error(`Vendor code "${row.vendorCode}" is already used by ${dup.name}`);
  }
  await DB.put('suppliers', row);
  return row;
}

/* ---------- customers ---------- */
async function listCustomers() { const rows = await DB.all('customers'); return rows.sort((a, b) => a.name.localeCompare(b.name)); }
async function addCustomer(data) {
  const row = {
    id: uid('cus'), name: data.name.trim(), phone: data.phone || '', instaId: data.instaId || '', address: data.address || '',
    pointsBalance: 0, loyaltyLedger: []
  };
  await DB.put('customers', row);
  return row;
}

/* ============================================================
   ITEM TYPES — the 3-letter middle segment of every SKU, created
   inline from Item Master (e.g. "Kurta Pant" -> KPN). Code must be
   unique; description is manually typed and free-form.
   ============================================================ */
async function listItemTypes() { const rows = await DB.all('itemTypes'); return rows.sort((a, b) => a.description.localeCompare(b.description)); }
async function findItemTypeByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const rows = await DB.byIndex('itemTypes', 'code', c);
  return rows[0] || null;
}
function validateItemTypeCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error('Item Type code must be exactly 3 letters (e.g. KPN)');
  return c;
}
async function addItemType(data) {
  const code = validateItemTypeCode(data.code);
  const dup = await findItemTypeByCode(code);
  if (dup) throw new Error(`Item Type code "${code}" already exists (${dup.description})`);
  const description = String(data.description || '').trim();
  if (!description) throw new Error('Item Type description is required');
  const row = { id: uid('ityp'), code, description };
  await DB.put('itemTypes', row);
  return row;
}
async function updateItemType(existing, patch) {
  const row = { ...existing, ...patch };
  if (patch.code != null) {
    row.code = validateItemTypeCode(patch.code);
    const dup = await findItemTypeByCode(row.code);
    if (dup && dup.id !== existing.id) throw new Error(`Item Type code "${row.code}" already exists (${dup.description})`);
  }
  await DB.put('itemTypes', row);
  return row;
}

/* ============================================================
   ITEM / SKU MASTER — created manually by the user. Every purchase
   batch and every bill line refers to one of these by id.

   SKU = Vendor Code (3 letters, from the chosen supplier) +
         Item Type Code (3 letters, from the chosen item type) +
         a 6-character alphanumeric free-text code (manually typed,
         auto-capitalised). Each item also carries a `category`:
         'trading' (stock-tracked) or 'service' (raw material /
         service charges — never gets batches, never shows "in
         stock", skipped entirely by FIFO consumption).
   ============================================================ */
function validateFreeCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) throw new Error('The free-text code must be exactly 6 alphanumeric characters');
  return c;
}
function composeSku(vendorCode, itemTypeCode, freeCode) {
  return `${vendorCode}${itemTypeCode}${freeCode}`;
}
async function listItems(filter = {}) {
  let rows = await DB.all('items');
  if (filter.activeOnly) rows = rows.filter(r => r.active !== false);
  if (filter.category) rows = rows.filter(r => itemCategory(r) === filter.category);
  return rows.sort((a, b) => a.description.localeCompare(b.description));
}
async function getItem(id) { return DB.get('items', id); }
async function findItemBySku(sku) {
  const rows = await DB.byIndex('items', 'sku', String(sku || '').trim().toUpperCase());
  return rows[0] || null;
}
// Old records (created before v4) never had a category — treat them as 'trading'
// so existing stock keeps behaving exactly as it did before this release.
function itemCategory(item) { return item && item.category === 'service' ? 'service' : 'trading'; }

async function addItem(data) {
  const vendor = data.vendor; // full supplier row
  const itemType = data.itemType; // full itemTypes row
  if (!vendor || !vendor.vendorCode) throw new Error('Pick a vendor first');
  if (!itemType || !itemType.code) throw new Error('Pick an item type first');
  const freeCode = validateFreeCode(data.freeCode);
  const sku = composeSku(vendor.vendorCode, itemType.code, freeCode);
  if (await findItemBySku(sku)) throw new Error(`SKU "${sku}" already exists`);
  const description = String(data.description || '').trim();
  if (!description) throw new Error('Description is required');
  const costPrice = Number(data.costPrice) || 0;
  const row = {
    id: uid('item'), sku, description,
    vendorId: vendor.id, itemTypeId: itemType.id, freeCode,
    category: data.category === 'service' ? 'service' : 'trading',
    costPrice,
    wholesalePrice: data.wholesalePrice != null && data.wholesalePrice !== '' ? Number(data.wholesalePrice) : round2(costPrice * (1 + (SETTINGS.wholesaleMarkupPercent || 0) / 100)),
    sellPrice: data.sellPrice != null && data.sellPrice !== '' ? Number(data.sellPrice) : round2(costPrice * (1 + (SETTINGS.markupPercent || 0) / 100)),
    active: true
  };
  await DB.put('items', row);
  return row;
}
// patch may include { vendor, itemType, freeCode } (full rows) to recompose the SKU,
// or just the price/description/category/active fields.
async function updateItem(item, patch) {
  const row = { ...item, ...patch };
  delete row.vendor; delete row.itemType; // not real item fields — just carriers for recomposing below
  const vendor = patch.vendor || null;
  const itemType = patch.itemType || null;
  if (vendor || itemType || patch.freeCode != null) {
    const vendorCode = vendor ? vendor.vendorCode : null;
    const typeCode = itemType ? itemType.code : null;
    const freeCode = patch.freeCode != null ? validateFreeCode(patch.freeCode) : item.freeCode;
    if (vendor) row.vendorId = vendor.id;
    if (itemType) row.itemTypeId = itemType.id;
    row.freeCode = freeCode;
    // Only recompose the SKU if we actually have all three parts available (either
    // freshly picked or already on the existing record).
    const resolvedVendorCode = vendorCode || (await DB.get('suppliers', row.vendorId))?.vendorCode;
    const resolvedTypeCode = typeCode || (await DB.get('itemTypes', row.itemTypeId))?.code;
    if (resolvedVendorCode && resolvedTypeCode && freeCode) {
      const newSku = composeSku(resolvedVendorCode, resolvedTypeCode, freeCode);
      if (newSku !== item.sku) {
        const dup = await findItemBySku(newSku);
        if (dup && dup.id !== item.id) throw new Error(`SKU "${newSku}" already exists`);
      }
      row.sku = newSku;
    }
  }
  if (patch.category != null) row.category = patch.category === 'service' ? 'service' : 'trading';
  await DB.put('items', row);
  return row;
}

/* ============================================================
   VENDOR INVOICES (Module B) — bill amount, payments, discounts/
   adjustments applied at final settlement, and returns to vendor.
   ============================================================ */
async function ensureVendorInvoice(supplierId, invoiceNumber, invoiceDate) {
  const key = invoiceKeyOf(supplierId, invoiceNumber);
  const rows = await DB.byIndex('vendorInvoices', 'invoiceKey', key);
  if (rows[0]) return rows[0];
  const row = { id: uid('vinv'), invoiceKey: key, supplierId, invoiceNumber: invoiceNumber.trim(), invoiceDate, billAmount: null, payments: [], adjustments: [], returns: [], otherCharges: [] };
  await DB.put('vendorInvoices', row);
  return row;
}
async function listVendorInvoices() { return DB.all('vendorInvoices'); }

// Gross cost of everything ever received under this invoice (regardless of later returns).
async function getVendorInvoiceCostTotal(invoiceKey) {
  const batches = await DB.byIndex('inventoryBatches', 'invoiceKey', invoiceKey);
  return round2(batches.reduce((sum, b) => sum + (b.costPrice || 0) * (b.qtyReceived || 0), 0));
}
function vendorInvoicePaid(vi) { return (vi.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0); }
function vendorInvoiceReturnsCredit(vi) { return (vi.returns || []).reduce((s, r) => s + Number(r.creditAmount || 0), 0); }
function vendorInvoiceAdjustmentTotal(vi) { return (vi.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0); }

// Signed net amount still owed to the vendor: positive = we owe them, negative = they owe us a refund/credit.
function vendorInvoiceNet(vi, costTotal) {
  const billBase = (vi.billAmount != null) ? vi.billAmount : costTotal;
  return round2(billBase - vendorInvoiceReturnsCredit(vi) - vendorInvoiceAdjustmentTotal(vi) - vendorInvoicePaid(vi));
}
// Non-negative "balance due" — this is what every list/dashboard screen shows.
function vendorInvoiceBalance(vi, costTotal) { return Math.max(0, vendorInvoiceNet(vi, costTotal)); }

async function addVendorAdjustment(vi, amount, note) {
  vi.adjustments = vi.adjustments || [];
  vi.adjustments.push({ id: uid('adj'), amount: round2(amount), note: note || '', date: todayISO() });
  await DB.put('vendorInvoices', vi);
  return vi;
}

/* ---------- other charges on a purchase invoice (landed-cost allocation) ----------
   "Any other charges applicable" on a purchase invoice (freight, handling, etc.) —
   spread EQUALLY PER UNIT across every piece received under that invoice, so each
   SKU's landed cost = its own cost price + (total other charges / total pieces on
   that invoice). This only affects inventory valuation shown in Inventory — it does
   NOT change the Bill Amount / vendor payable above (if the vendor themselves billed
   you for it, add that to Bill Amount separately). */
async function addVendorOtherCharge(vi, amount, note) {
  const amt = round2(Number(amount) || 0);
  if (!amt) throw new Error('Enter a non-zero amount');
  vi.otherCharges = vi.otherCharges || [];
  vi.otherCharges.push({ id: uid('oc'), amount: amt, note: note || '', date: todayISO() });
  await DB.put('vendorInvoices', vi);
  return vi;
}
function vendorInvoiceOtherChargesTotal(vi) { return round2((vi.otherCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0)); }

// The per-unit ₹ allocation of a purchase invoice's "other charges", spread equally
// across every piece ever received on it (qtyReceived, not qtyRemaining — the
// allocation is fixed at receipt time regardless of later sales/returns).
async function getVendorInvoiceAllocation(invoiceKey) {
  const [batches, rows] = await Promise.all([
    DB.byIndex('inventoryBatches', 'invoiceKey', invoiceKey),
    DB.byIndex('vendorInvoices', 'invoiceKey', invoiceKey)
  ]);
  const vi = rows[0] || null;
  const totalPieces = batches.reduce((s, b) => s + (b.qtyReceived || 0), 0);
  const otherChargesTotal = vi ? vendorInvoiceOtherChargesTotal(vi) : 0;
  const perUnitAllocation = totalPieces > 0 ? round2(otherChargesTotal / totalPieces) : 0;
  return { vi, totalPieces, otherChargesTotal, perUnitAllocation };
}
// A batch's landed cost = its own purchase cost + the invoice's per-unit allocation.
function batchLandedCost(batch, perUnitAllocation) { return round2((batch.costPrice || 0) + (perUnitAllocation || 0)); }

// returnLines: [{ batch, qty }] — batch is a full inventoryBatches record, qty is how
// many units of that batch are being returned (can be less than qtyRemaining).
// Every return to a vendor issues a formal numbered Debit Note (the vendor-side
// mirror of a customer Credit Note) — see the DEBIT NOTES section below.
async function addVendorReturn(vi, returnLines, note) {
  const creditAmount = round2(returnLines.reduce((s, r) => s + r.qty * (r.batch.costPrice || 0), 0));
  const dnId = uid('dn');
  const dnNumber = await generateDNNumber();
  vi.returns = vi.returns || [];
  vi.returns.push({
    id: uid('ret'), date: todayISO(), creditAmount, note: note || '',
    dnId, dnNumber,
    lines: returnLines.map(r => ({ batchId: r.batch.id, itemId: r.batch.itemId, qty: r.qty, costPrice: r.batch.costPrice }))
  });
  await DB.put('vendorInvoices', vi);
  for (const r of returnLines) {
    const batch = r.batch;
    batch.qtyRemaining = Math.max(0, (batch.qtyRemaining || 0) - r.qty);
    if (batch.qtyRemaining === 0) batch.status = 'returned_to_vendor';
    await DB.put('inventoryBatches', batch);
  }
  const debitNote = {
    id: dnId, dnNumber, supplierId: vi.supplierId,
    vendorInvoiceId: vi.id, invoiceNumber: vi.invoiceNumber,
    date: todayISO(), note: note || '', amount: creditAmount,
    lines: returnLines.map(r => ({ itemId: r.batch.itemId, qty: r.qty, costPrice: r.batch.costPrice })),
    status: 'issued'
  };
  await DB.put('debitNotes', debitNote);
  return { vi, debitNote };
}

/* ============================================================
   INVENTORY (Module A) — batch/lot quantity tracking.
   One record per purchase-invoice line: an SKU + a quantity + a
   cost price. Stock on hand for an item = sum of qtyRemaining
   across its batches. Sales consume the OLDEST batch first (FIFO),
   which is also what drives the ageing display.
   ============================================================ */
async function addInventoryBatch({ itemId, supplierId, invoiceNumber, invoiceDate, qty, costPrice }) {
  const row = {
    id: uid('batch'), itemId, supplierId,
    invoiceNumber, invoiceDate, invoiceKey: invoiceKeyOf(supplierId, invoiceNumber),
    qtyReceived: Number(qty), qtyRemaining: Number(qty), costPrice: Number(costPrice),
    purchaseDate: invoiceDate || todayISO(), status: 'active'
  };
  await DB.put('inventoryBatches', row);
  return row;
}
async function listInventory(filter = {}) {
  let rows = await DB.all('inventoryBatches');
  if (filter.itemId) rows = rows.filter(r => r.itemId === filter.itemId);
  if (filter.supplierId) rows = rows.filter(r => r.supplierId === filter.supplierId);
  if (filter.invoiceKey) rows = rows.filter(r => r.invoiceKey === filter.invoiceKey);
  if (filter.inStockOnly) rows = rows.filter(r => (r.qtyRemaining || 0) > 0);
  return rows.sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || ''));
}
async function stockOnHand(itemId) {
  const batches = await listInventory({ itemId, inStockOnly: true });
  return batches.reduce((s, b) => s + (b.qtyRemaining || 0), 0);
}
// Quantity-weighted average LANDED cost (purchase cost + its invoice's allocated
// other-charges per unit) across an item's remaining batches — what the SKU-level
// Inventory view shows as "Avg Cost".
async function stockAvgLandedCost(itemId) {
  const batches = await listInventory({ itemId, inStockOnly: true });
  if (!batches.length) return 0;
  const allocCache = {};
  let qtySum = 0, costSum = 0;
  for (const b of batches) {
    if (allocCache[b.invoiceKey] === undefined) {
      allocCache[b.invoiceKey] = (await getVendorInvoiceAllocation(b.invoiceKey)).perUnitAllocation;
    }
    const landed = batchLandedCost(b, allocCache[b.invoiceKey]);
    qtySum += b.qtyRemaining || 0;
    costSum += (b.qtyRemaining || 0) * landed;
  }
  return qtySum > 0 ? round2(costSum / qtySum) : 0;
}
// Oldest-batch-first consumption for a sale. Returns { qty, costTotal, lines, shortBy }.
// Allows over-selling (shortBy > 0) rather than blocking a bill — just flags it so the
// register can warn the user; stock can be corrected later via a fresh purchase entry.
async function consumeStockFIFO(itemId, qty) {
  let remaining = qty;
  const lines = [];
  const batches = await listInventory({ itemId, inStockOnly: true });
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.qtyRemaining);
    if (take <= 0) continue;
    b.qtyRemaining -= take;
    if (b.qtyRemaining === 0) b.status = 'depleted';
    await DB.put('inventoryBatches', b);
    lines.push({ batchId: b.id, qty: take, costPrice: b.costPrice });
    remaining -= take;
  }
  const costTotal = round2(lines.reduce((s, l) => s + l.qty * l.costPrice, 0));
  return { qty, costTotal, lines, shortBy: round2(remaining) };
}
// A resellable customer return re-enters stock as a brand-new batch (ageing restarts,
// which is reasonable since it's back in rotation today) rather than trying to reverse
// a possibly multi-batch FIFO sale.
async function restockReturnedItem(itemId, qty, costPrice, supplierId) {
  return addInventoryBatch({ itemId, supplierId: supplierId || null, invoiceNumber: 'RETURN', invoiceDate: todayISO(), qty, costPrice });
}

/* ============================================================
   CUSTOMER INVOICES (Module C) — bill numbering, discounts/
   adjustments applied at final settlement, loyalty points, and
   customer returns.
   ============================================================ */
async function nextDailySeq(dateKey) { return nextSeq('billseq_' + dateKey); }
async function generateBillNumber(saleType) {
  const dk = todayISO();
  const seq = await nextDailySeq(dk);
  const suffix = saleType === 'tailoring' ? 'D' : 'T';
  return `${ddmmyyyy(dk)}${String(seq).padStart(2, '0')}${suffix}`;
}
async function listCustomerInvoices() { const rows = await DB.all('customerInvoices'); return rows.sort((a, b) => b.createdAt - a.createdAt); }

function customerInvoiceReturnsCredit(ci) { return (ci.returns || []).reduce((s, r) => s + Number(r.creditAmount || 0), 0); }
function customerInvoiceAdjustmentTotal(ci) { return (ci.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0); }

// Signed net: positive = still due FROM the customer, negative = refund due TO the customer.
function customerInvoiceNet(ci) {
  return round2((ci.finalAmount || 0) - customerInvoiceReturnsCredit(ci) - customerInvoiceAdjustmentTotal(ci) - (ci.amountPaid || 0));
}
// Non-negative "balance due" — this is what every list/dashboard screen shows.
function customerInvoiceBalance(ci) { return Math.max(0, customerInvoiceNet(ci)); }

async function addCustomerAdjustment(ci, amount, note) {
  ci.adjustments = ci.adjustments || [];
  ci.adjustments.push({ id: uid('adj'), amount: round2(amount), note: note || '', date: todayISO() });
  await DB.put('customerInvoices', ci);
  return ci;
}

// returnLines: [{ line, qty }] — line is one of ci.lines (by reference), qty is how many
// of that line's units are being returned (can be less than line.qty for a partial return).
// condition: 'resellable' restocks a fresh batch; anything else is a write-off (no restock).
//
// Every return issues a numbered Credit Note (a running ₹ credit, separate from Loyalty
// points) referencing this bill — see the CREDIT NOTES section below — and claws back
// Loyalty points proportional to the returned amount, since those points were earned on
// money that's no longer actually billed. `customer` is the customer row (by reference);
// callers persist it via this function, no separate DB.put needed by the caller.
async function addCustomerReturn(ci, customer, returnLines, condition, note) {
  const creditAmount = round2(returnLines.reduce((s, r) => s + (r.qty * (r.line.sellAmount / r.line.qty)), 0));
  const cnId = uid('cn');
  const cnNumber = await generateCNNumber();

  // Claw back points earned on the returned portion of the bill, capped so the
  // customer's balance never goes negative (e.g. if they already redeemed/spent
  // those exact points on a later bill in the meantime). Nothing to claw back if
  // this billing type never earns Loyalty points in the first place.
  const pointsToClawBack = !isLoyaltyEligible(ci.saleType) ? 0 : Math.min(
    customer.pointsBalance || 0,
    Math.round(creditAmount * (SETTINGS.loyaltyAccrualPercent || 0) / 100)
  );
  customer.pointsBalance = Math.max(0, (customer.pointsBalance || 0) - pointsToClawBack);
  customer.loyaltyLedger = customer.loyaltyLedger || [];
  if (pointsToClawBack > 0) {
    customer.loyaltyLedger.push({ id: uid('loy'), type: 'return_adjustment', points: -pointsToClawBack, invoiceId: ci.id, billNumber: ci.billNumber, cnNumber, date: todayISO() });
  }
  await DB.put('customers', customer);

  ci.returns = ci.returns || [];
  ci.returns.push({
    id: uid('ret'), date: todayISO(), creditAmount, condition, note: note || '',
    cnId, cnNumber, pointsClawedBack: pointsToClawBack,
    lines: returnLines.map(r => ({ itemId: r.line.itemId, description: r.line.description, qty: r.qty }))
  });
  await DB.put('customerInvoices', ci);

  if (condition === 'resellable') {
    for (const r of returnLines) {
      if (!r.line.itemId) continue;
      const unitCost = r.line.qty ? (r.line.costTotal || 0) / r.line.qty : 0;
      await restockReturnedItem(r.line.itemId, r.qty, round2(unitCost));
    }
  }

  const creditNote = {
    id: cnId, cnNumber, customerId: customer.id,
    invoiceId: ci.id, billNumber: ci.billNumber,
    date: todayISO(), condition, note: note || '',
    amount: creditAmount, balanceRemaining: creditAmount,
    pointsClawedBack: pointsToClawBack,
    applications: [], status: 'open'
  };
  await DB.put('creditNotes', creditNote);

  return { ci, customer, creditNote };
}

/* ============================================================
   CREDIT NOTES — issued only by a customer return (above), never
   created directly. A Credit Note is a running ₹ credit, separate
   from Loyalty points, that can later be applied — fully or
   partially, against one future bill or split across several — to
   reduce what that customer owes. Always traceable back to the
   invoice the return was recorded against.
   ============================================================ */
async function generateCNNumber() {
  const dk = todayISO();
  const seq = await nextSeq('cnseq_' + dk);
  return `CN-${ddmmyyyy(dk)}-${String(seq).padStart(2, '0')}`;
}
async function listCreditNotes(filter = {}) {
  let rows = await DB.all('creditNotes');
  if (filter.customerId) rows = rows.filter(r => r.customerId === filter.customerId);
  if (filter.openOnly) rows = rows.filter(r => (r.balanceRemaining || 0) > 0.009);
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
async function getCreditNote(id) { return DB.get('creditNotes', id); }
// Oldest-first, since that's the order they should be offered/consumed in at billing time.
async function listOpenCreditNotesForCustomer(customerId) {
  const rows = await listCreditNotes({ customerId, openOnly: true });
  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Oldest-first (FIFO), mirroring consumeStockFIFO's logic but against ₹ balance
// instead of qty. Returns { applied, lines, shortBy }. Does not cap against any
// particular bill's amount — callers decide how much of a bill a CN may cover.
async function applyCreditNotes(customerId, amountToApply, ci) {
  amountToApply = round2(Math.max(0, Number(amountToApply) || 0));
  const result = { applied: 0, lines: [], shortBy: 0 };
  if (amountToApply <= 0) return result;
  const open = (await listCreditNotes({ customerId, openOnly: true })).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let remaining = amountToApply;
  for (const cn of open) {
    if (remaining <= 0.009) break;
    const take = round2(Math.min(remaining, cn.balanceRemaining));
    if (take <= 0) continue;
    cn.balanceRemaining = round2(cn.balanceRemaining - take);
    cn.applications = cn.applications || [];
    cn.applications.push({ id: uid('cnuse'), invoiceId: ci.id, billNumber: ci.billNumber, amountApplied: take, date: todayISO() });
    if (cn.balanceRemaining <= 0.009) cn.status = 'fully_applied';
    await DB.put('creditNotes', cn);
    result.lines.push({ cnId: cn.id, cnNumber: cn.cnNumber, amountApplied: take });
    remaining = round2(remaining - take);
  }
  result.applied = round2(amountToApply - remaining);
  result.shortBy = remaining;
  return result;
}

/* ============================================================
   DEBIT NOTES — the vendor-side mirror of Credit Notes. Issued only
   by addVendorReturn (above), never created directly: every return
   of stock to a vendor gets a formal numbered Debit Note, so there's
   a traceable document for that return just like a customer Credit
   Note. Combined with Credit Notes in one panel (see More menu).
   ============================================================ */
async function generateDNNumber() {
  const dk = todayISO();
  const seq = await nextSeq('dnseq_' + dk);
  return `DN-${ddmmyyyy(dk)}-${String(seq).padStart(2, '0')}`;
}
async function listDebitNotes(filter = {}) {
  let rows = await DB.all('debitNotes');
  if (filter.supplierId) rows = rows.filter(r => r.supplierId === filter.supplierId);
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
async function getDebitNote(id) { return DB.get('debitNotes', id); }

/* ============================================================
   TAILORING / DELIVERY TRACKING — each customer-invoice LINE (not
   the whole invoice) carries its own Expected Delivery Date and an
   8-stage status, so an alteration added later to an already-sold
   item tracks separately from the rest of that bill.
   ============================================================ */
const DELIVERY_STATUSES = ['Pending', 'Designing', 'Cutting', 'Tailoring', 'Fitting', 'Ready for Trial', 'Complete', 'Delivered'];

function lineIsPendingDelivery(line) {
  return !!line.expectedDeliveryDate && line.deliveryStatus && line.deliveryStatus !== 'Delivered';
}
// Advances a line's delivery status and stamps the date, appending to its history.
function setLineDeliveryStatus(line, status) {
  if (!DELIVERY_STATUSES.includes(status)) throw new Error('Unknown delivery status');
  line.deliveryStatus = status;
  line.statusHistory = line.statusHistory || [];
  line.statusHistory.push({ status, date: todayISO() });
}
// Flat list of every pending (not-yet-Delivered) line across all invoices, each
// annotated with its invoice + customer, for the Delivery Pending panel.
async function listPendingDeliveryLines() {
  const [invoices, customers] = await Promise.all([listCustomerInvoices(), listCustomers()]);
  const customerById = Object.fromEntries(customers.map(c => [c.id, c]));
  const out = [];
  for (const ci of invoices) {
    (ci.lines || []).forEach((line, lineIdx) => {
      if (lineIsPendingDelivery(line)) out.push({ ci, line, lineIdx, customer: customerById[ci.customerId] || null });
    });
  }
  return out.sort((a, b) => (a.line.expectedDeliveryDate || '').localeCompare(b.line.expectedDeliveryDate || ''));
}
// Groups the flat pending list by expected delivery date for the panel's date-wise cards.
function groupPendingDeliveriesByDate(pending) {
  const byDate = {};
  for (const p of pending) {
    const d = p.line.expectedDeliveryDate;
    (byDate[d] ||= { date: d, items: [], value: 0 }).items.push(p);
    byDate[d].value += Number(p.line.sellAmount || 0);
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// Adds a tailoring/alteration charge line to an ALREADY-FINALIZED invoice (the
// "alteration on an already-sold item" flow) — bumps subtotal/finalAmount by the
// line's sellAmount but does not re-run FIFO/loyalty (service items skip stock,
// and Tailoring-type charges are loyalty-ineligible by design anyway).
async function addTailoringLineToInvoice(ci, line) {
  ci.lines = ci.lines || [];
  ci.lines.push(line);
  ci.subtotal = round2((ci.subtotal || 0) + (line.sellAmount || 0));
  ci.finalAmount = round2((ci.finalAmount || 0) + (line.sellAmount || 0));
  await DB.put('customerInvoices', ci);
  return ci;
}

/* ---------- WhatsApp delivery-status messages (short & light, per language) ----------
   Chosen by the user at send time (a toggle right before sending) — never combined,
   never a fixed default. {name} / {item} / {bill} are substituted by the caller. */
const DELIVERY_WA_MESSAGES = {
  en: {
    Pending:        "Hi {name}! 👋 Your order ({item}, bill {bill}) is in our queue — the fabric's excited, we promise it won't wait long!",
    Designing:      "Hi {name}! ✏️ Your {item} is on the design table right now — our tailors are channeling their inner fashion genius.",
    Cutting:        "Hi {name}! ✂️ Scissors are out — {item} is being cut as we speak. No turning back now (literally)!",
    Tailoring:      "Hi {name}! 🪡 {item} is being stitched together with love (and a LOT of thread).",
    Fitting:        "Hi {name}! 📏 {item} is in fitting — almost ready to make you look amazing.",
    'Ready for Trial': "Hi {name}! 🙌 {item} is ready for a trial! Swing by whenever you like to try it on.",
    Complete:       "Hi {name}! ✅ {item} is all done and looking sharp — just waiting for you to pick it up!",
    Delivered:      "Hi {name}! 🎉 {item} has been delivered. Thank you for shopping with us — wear it well!"
  },
  hi: {
    Pending:        "नमस्ते {name}! 👋 आपका ऑर्डर ({item}, बिल {bill}) हमारी लिस्ट में है — कपड़ा थोड़ा बेसब्र है, पर इंतज़ार लंबा नहीं होगा!",
    Designing:      "नमस्ते {name}! ✏️ आपका {item} डिज़ाइन टेबल पर है — हमारे कारीगर अपने फैशन दिमाग का पूरा इस्तेमाल कर रहे हैं।",
    Cutting:        "नमस्ते {name}! ✂️ कैंची चल पड़ी है — {item} अभी कट रहा है। अब पीछे मुड़ना नहीं (सच में)!",
    Tailoring:      "नमस्ते {name}! 🪡 {item} को प्यार से (और ढेर सारे धागे से) सिला जा रहा है।",
    Fitting:        "नमस्ते {name}! 📏 {item} फिटिंग में है — आपको शानदार दिखाने के लिए बस थोड़ा और समय।",
    'Ready for Trial': "नमस्ते {name}! 🙌 {item} ट्रायल के लिए तैयार है! जब मन हो आ जाइए आज़माने।",
    Complete:       "नमस्ते {name}! ✅ {item} पूरी तरह तैयार है और बढ़िया लग रहा है — बस आपके आने का इंतज़ार है!",
    Delivered:      "नमस्ते {name}! 🎉 {item} डिलीवर हो गया है। हमारे साथ खरीदारी के लिए धन्यवाद — खूब पहनिए!"
  },
  bn: {
    Pending:        "হ্যালো {name}! 👋 আপনার অর্ডার ({item}, বিল {bill}) আমাদের লাইনে আছে — কাপড়টা একটু অধীর, কিন্তু বেশিদিন অপেক্ষা করাবে না!",
    Designing:      "হ্যালো {name}! ✏️ আপনার {item} এখন ডিজাইন টেবিলে — আমাদের দর্জিরা তাদের ফ্যাশন-মস্তিষ্ক পুরোপুরি কাজে লাগাচ্ছেন।",
    Cutting:        "হ্যালো {name}! ✂️ কাঁচি চলছে — {item} এখন কাটা হচ্ছে। এখন আর পেছনে ফেরা নেই (সত্যিই)!",
    Tailoring:      "হ্যালো {name}! 🪡 {item} ভালোবাসা (আর অনেক সুতো) দিয়ে সেলাই হচ্ছে।",
    Fitting:        "হ্যালো {name}! 📏 {item} ফিটিংয়ে আছে — আপনাকে চমৎকার দেখানোর জন্য প্রায় তৈরি।",
    'Ready for Trial': "হ্যালো {name}! 🙌 {item} ট্রায়ালের জন্য তৈরি! যখন ইচ্ছা চলে আসুন ট্রাই করতে।",
    Complete:       "হ্যালো {name}! ✅ {item} সম্পূর্ণ তৈরি এবং দেখতে ঝকঝকে — শুধু আপনার নেওয়ার অপেক্ষা!",
    Delivered:      "হ্যালো {name}! 🎉 {item} ডেলিভারি হয়ে গেছে। আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ — ভালোভাবে পরুন!"
  }
};
function buildDeliveryWaMessage(lang, status, { name, item, bill }) {
  const tmpl = (DELIVERY_WA_MESSAGES[lang] && DELIVERY_WA_MESSAGES[lang][status]) || DELIVERY_WA_MESSAGES.en[status] || '';
  return tmpl.replace('{name}', name || '').replace('{item}', item || '').replace('{bill}', bill || '');
}
// Builds a wa.me deep-link for a customer's phone — assumes a 10-digit Indian
// mobile if no country code is already present (defaults to +91).
function waLinkFor(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/* ============================================================
   LOYALTY PROGRAMME — simple % accrual + capped-redemption.
   Gated by sale type: only billing types listed in
   SETTINGS.loyaltyEligibleSaleTypes earn or redeem points (Tailoring
   is excluded by default — see Settings).
   ============================================================ */
function isLoyaltyEligible(saleType) {
  const list = SETTINGS.loyaltyEligibleSaleTypes || ['trading'];
  return list.includes(saleType);
}
// Call once, when a sale is finalized. Returns the points earned (0 if this
// billing type doesn't participate in the Loyalty programme).
async function accrueLoyaltyPoints(customer, ci) {
  if (!isLoyaltyEligible(ci.saleType)) { ci.loyaltyPointsEarned = 0; return 0; }
  const points = Math.round((ci.finalAmount || 0) * (SETTINGS.loyaltyAccrualPercent || 0) / 100);
  if (points > 0) {
    customer.pointsBalance = (customer.pointsBalance || 0) + points;
    customer.loyaltyLedger = customer.loyaltyLedger || [];
    customer.loyaltyLedger.push({ id: uid('loy'), type: 'earn', points, invoiceId: ci.id, billNumber: ci.billNumber, date: todayISO() });
    await DB.put('customers', customer);
  }
  ci.loyaltyPointsEarned = points;
  return points;
}
// The most a customer could redeem against a given bill amount right now, in ₹.
function maxRedeemableValue(customer, billAmount) {
  const byBalance = (customer.pointsBalance || 0) * (SETTINGS.loyaltyRedemptionValue || 0);
  const byCap = round2((billAmount || 0) * (SETTINGS.loyaltyRedemptionCapPercent || 0) / 100);
  return round2(Math.min(byBalance, byCap));
}
// Redeems `points` against this bill as a discount adjustment, capped the same way.
// Throws if the request exceeds what's redeemable so the UI can show a clear error.
async function redeemLoyaltyPoints(ci, customer, points) {
  if (!isLoyaltyEligible(ci.saleType)) throw new Error('Loyalty points cannot be redeemed on this billing type');
  points = Math.floor(Number(points) || 0);
  if (points <= 0) throw new Error('Enter how many points to redeem');
  if (points > (customer.pointsBalance || 0)) throw new Error(`Only ${customer.pointsBalance || 0} points available`);
  const discountValue = round2(points * (SETTINGS.loyaltyRedemptionValue || 0));
  const cap = maxRedeemableValue(customer, ci.finalAmount || 0);
  if (discountValue > cap + 0.01) throw new Error(`Max redeemable on this bill is ₹${cap} (${Math.floor(cap / (SETTINGS.loyaltyRedemptionValue || 1))} pts)`);
  await addCustomerAdjustment(ci, discountValue, `Loyalty redemption: ${points} pts`);
  customer.pointsBalance = (customer.pointsBalance || 0) - points;
  customer.loyaltyLedger = customer.loyaltyLedger || [];
  customer.loyaltyLedger.push({ id: uid('loy'), type: 'redeem', points, invoiceId: ci.id, billNumber: ci.billNumber, date: todayISO() });
  await DB.put('customers', customer);
  return { ci, customer, discountValue };
}
