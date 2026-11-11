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
  vendorCreditDays: 30,
  agingWarnDays: 60,
  agingCriticalDays: 90,
  pinLock: '',
  // Loyalty programme — see settings.js for the explanation shown to the user.
  loyaltyAccrualPercent: 2,       // points earned = % of bill amount
  loyaltyRedemptionValue: 1,      // ₹ value of one point when redeemed
  loyaltyRedemptionCapPercent: 10, // max % of a bill payable using points
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

/* ---------- suppliers ---------- */
async function listSuppliers() { const rows = await DB.all('suppliers'); return rows.sort((a, b) => a.name.localeCompare(b.name)); }
async function addSupplier(data) {
  const row = { id: uid('sup'), name: data.name.trim(), phone: data.phone || '', notes: data.notes || '' };
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
   ITEM / SKU MASTER — created manually by the user. Every purchase
   batch and every bill line refers to one of these by id.
   ============================================================ */
async function listItems(filter = {}) {
  let rows = await DB.all('items');
  if (filter.activeOnly) rows = rows.filter(r => r.active !== false);
  return rows.sort((a, b) => a.description.localeCompare(b.description));
}
async function getItem(id) { return DB.get('items', id); }
async function findItemBySku(sku) {
  const rows = await DB.byIndex('items', 'sku', String(sku || '').trim().toUpperCase());
  return rows[0] || null;
}
async function addItem(data) {
  const sku = String(data.sku || '').trim().toUpperCase();
  if (sku && await findItemBySku(sku)) throw new Error(`SKU "${sku}" already exists`);
  const row = {
    id: uid('item'), sku, description: data.description.trim(),
    costPrice: Number(data.costPrice) || 0, sellPrice: Number(data.sellPrice) || 0,
    active: true
  };
  await DB.put('items', row);
  return row;
}
async function updateItem(item, patch) {
  const row = { ...item, ...patch };
  if (patch.sku != null) row.sku = String(patch.sku).trim().toUpperCase();
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
  const row = { id: uid('vinv'), invoiceKey: key, supplierId, invoiceNumber: invoiceNumber.trim(), invoiceDate, billAmount: null, payments: [], adjustments: [], returns: [] };
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

// returnLines: [{ batch, qty }] — batch is a full inventoryBatches record, qty is how
// many units of that batch are being returned (can be less than qtyRemaining).
async function addVendorReturn(vi, returnLines, note) {
  const creditAmount = round2(returnLines.reduce((s, r) => s + r.qty * (r.batch.costPrice || 0), 0));
  vi.returns = vi.returns || [];
  vi.returns.push({
    id: uid('ret'), date: todayISO(), creditAmount, note: note || '',
    lines: returnLines.map(r => ({ batchId: r.batch.id, itemId: r.batch.itemId, qty: r.qty, costPrice: r.batch.costPrice }))
  });
  await DB.put('vendorInvoices', vi);
  for (const r of returnLines) {
    const batch = r.batch;
    batch.qtyRemaining = Math.max(0, (batch.qtyRemaining || 0) - r.qty);
    if (batch.qtyRemaining === 0) batch.status = 'returned_to_vendor';
    await DB.put('inventoryBatches', batch);
  }
  return vi;
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
  // those exact points on a later bill in the meantime).
  const pointsToClawBack = Math.min(
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
   LOYALTY PROGRAMME — simple % accrual + capped-redemption.
   ============================================================ */
// Call once, when a sale is finalized. Returns the points earned.
async function accrueLoyaltyPoints(customer, ci) {
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
