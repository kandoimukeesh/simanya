/* ============================================================
   vendors.js — Module B: Vendor Billing.
   Vendor list (payable summary), per-supplier invoice list, and
   the invoice detail sheet: bill amount, payments, final-settlement
   discount/adjustment, and returns to vendor (manual qty checklist
   against the invoice's own batches — no scanning).
   ============================================================ */

SCREENS.vendors = async (view) => {
  setTitle('Vendors & Billing');
  removeFab();
  const [suppliers, vendorInvoices] = await Promise.all([listSuppliers(), listVendorInvoices()]);
  if (!suppliers.length) {
    view.innerHTML = `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('factory',40)}</div>No suppliers yet.<br>Add one from Inventory.</div>`;
    return;
  }
  const bySupplier = {};
  for (const vi of vendorInvoices) (bySupplier[vi.supplierId] ||= []).push(vi);

  const rows = [];
  for (const s of suppliers) {
    const invs = bySupplier[s.id] || [];
    let totalBal = 0, overdue = 0;
    for (const vi of invs) {
      const costTotal = await getVendorInvoiceCostTotal(vi.invoiceKey);
      const bal = vendorInvoiceBalance(vi, costTotal);
      totalBal += bal;
      if (bal > 0 && daysSince(vi.invoiceDate) > SETTINGS.vendorCreditDays) overdue++;
    }
    rows.push({ supplier: s, invCount: invs.length, totalBal, overdue });
  }
  view.innerHTML = rows.map(r => `
    <div class="list-item" data-id="${r.supplier.id}">
      <div class="avatar">${esc(r.supplier.name[0]?.toUpperCase() || '?')}</div>
      <div class="main">
        <div class="title">${esc(r.supplier.name)}</div>
        <div class="sub">${r.invCount} invoice${r.invCount === 1 ? '' : 's'}${r.overdue ? ` · ${r.overdue} overdue` : ''}</div>
      </div>
      <div class="end">
        <div style="font-weight:700;color:${r.totalBal > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtMoney(r.totalBal)}</div>
        <div class="sub">${r.totalBal > 0 ? 'due' : 'settled'}</div>
      </div>
    </div>
  `).join('');
  $$('.list-item', view).forEach(el => el.onclick = () => Nav.push('supplierDetail', { supplierId: el.dataset.id }));
};

SCREENS.supplierDetail = async (view, params) => {
  const supplier = await DB.get('suppliers', params.supplierId);
  setTitle(supplier?.name || 'Supplier');
  removeFab();
  const vendorInvoices = (await listVendorInvoices()).filter(v => v.supplierId === params.supplierId).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const rowsHtml = [];
  for (const vi of vendorInvoices) {
    const costTotal = await getVendorInvoiceCostTotal(vi.invoiceKey);
    const bal = vendorInvoiceBalance(vi, costTotal);
    const net = vendorInvoiceNet(vi, costTotal);
    const days = daysSince(vi.invoiceDate);
    const overdue = bal > 0 && days > SETTINGS.vendorCreditDays;
    const statusLabel = overdue ? 'Overdue' : net < 0 ? 'Refund due' : bal > 0 ? 'Pending' : 'Settled';
    const statusClass = overdue ? 'danger' : net < 0 ? 'warn' : bal > 0 ? 'warn' : 'ok';
    rowsHtml.push(`
      <div class="card" data-id="${vi.id}">
        <div class="row between">
          <div><div style="font-weight:700">Invoice # ${esc(vi.invoiceNumber)}</div><div class="sub" style="color:var(--text-muted);font-size:13px">${fmtDate(vi.invoiceDate)} · ${days} days ago</div></div>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="grid-3" style="margin-top:10px;text-align:center">
          <div><div class="sub">Total purchased</div><b>${fmtMoney(costTotal)}</b></div>
          <div><div class="sub">Bill amt</div><b>${vi.billAmount != null ? fmtMoney(vi.billAmount) : '—'}</b></div>
          <div><div class="sub">${net < 0 ? 'Refund due' : 'Balance'}</div><b style="color:${net > 0 ? 'var(--danger)' : net < 0 ? 'var(--warn)' : 'var(--success)'}">${fmtMoney(Math.abs(net))}</b></div>
        </div>
      </div>
    `);
  }
  view.innerHTML = `
    <div class="card row between">
      <div><div class="sub">Phone</div><b>${esc(supplier?.phone || '—')}</b></div>
      <button class="btn ghost sm" id="editSup">Edit</button>
    </div>
    <div class="section-title">Purchase invoices</div>
    ${rowsHtml.length ? rowsHtml.join('') : `<div class="empty">No invoices yet.</div>`}
  `;
  $('#editSup').onclick = () => openSupplierForm(supplier, () => render());
  $$('.card[data-id]', view).forEach(el => el.onclick = () => openVendorInvoiceSheet(el.dataset.id));
};

function openVendorInvoiceSheet(vendorInvoiceId) {
  DB.get('vendorInvoices', vendorInvoiceId).then(async (vi) => {
    const costTotal = await getVendorInvoiceCostTotal(vi.invoiceKey);
    drawVendorInvoiceSheet(vi, costTotal);
  });
}

function drawVendorInvoiceSheet(vi, costTotal) {
  const paid = vendorInvoicePaid(vi);
  const returnsCredit = vendorInvoiceReturnsCredit(vi);
  const adjTotal = vendorInvoiceAdjustmentTotal(vi);
  const net = vendorInvoiceNet(vi, costTotal);

  const sheet = openSheet(`
    <h2>Invoice ${esc(vi.invoiceNumber)}</h2>
    <div class="grid-3" style="text-align:center;margin-bottom:6px">
      <div><div class="sub">Total purchased</div><b>${fmtMoney(costTotal)}</b></div>
      <div><div class="sub">Paid</div><b>${fmtMoney(paid)}</b></div>
      <div><div class="sub">${net < 0 ? 'Refund due' : 'Balance'}</div><b style="color:${net>0?'var(--danger)':net<0?'var(--warn)':'var(--success)'}">${fmtMoney(Math.abs(net))}</b></div>
    </div>
    ${(returnsCredit || adjTotal) ? `<p class="helptext" style="margin-bottom:10px">${returnsCredit ? `Returns credit: <b>${fmtMoney(returnsCredit)}</b>. ` : ''}${adjTotal ? `Discount/adjustment: <b>${fmtMoney(adjTotal)}</b>.` : ''}</p>` : ''}

    <label>Bill amount (vendor's invoice total)</label>
    <input id="billAmt" type="number" inputmode="decimal" value="${vi.billAmount ?? costTotal}" />
    <button class="btn secondary sm" id="saveBillAmt" style="margin-top:8px;width:100%">Save bill amount</button>

    <div class="divider"></div>
    <div class="section-title" style="margin-top:0">Record a payment</div>
    <div class="grid-2">
      <div><label>Amount</label><input id="payAmt" type="number" inputmode="decimal" placeholder="0" /></div>
      <div><label>Mode</label><select id="payMode"><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option><option>Other</option></select></div>
    </div>
    <label>Date</label>
    <input id="payDate" type="date" value="${todayISO()}" />
    <button class="btn" id="addPayment" style="margin-top:10px">Add payment</button>

    <div class="divider"></div>
    <div class="section-title" style="margin-top:0">Payment history</div>
    <div id="payHistory">${(vi.payments || []).length ? vi.payments.map(p => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${fmtDate(p.date)} · ${esc(p.mode)}</span><b>${fmtMoney(p.amount)}</b></div>`).join('') : '<div class="sub">No payments yet.</div>'}</div>

    <div class="divider"></div>
    <div class="section-title" style="margin-top:0">Discount / final settlement adjustment</div>
    <p class="helptext">A positive amount reduces what you owe (e.g. a discount agreed at settlement). Use a negative amount to increase it.</p>
    <div class="grid-2">
      <div><label>Amount</label><input id="adjAmt" type="number" inputmode="decimal" placeholder="0" /></div>
      <div><label>Note</label><input id="adjNote" placeholder="e.g. settlement discount" /></div>
    </div>
    <button class="btn secondary" id="addAdj" style="margin-top:8px">Apply adjustment</button>
    ${(vi.adjustments || []).length ? `<div style="margin-top:8px">${vi.adjustments.map(a => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${fmtDate(a.date)} · ${esc(a.note || '—')}</span><b>${fmtMoney(a.amount)}</b></div>`).join('')}</div>` : ''}

    <div class="divider"></div>
    <div class="section-title" style="margin-top:0">Returns to vendor</div>
    ${(vi.returns || []).length ? `<div style="margin-bottom:8px">${vi.returns.map(r => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${fmtDate(r.date)} · ${r.lines.length} line${r.lines.length===1?'':'s'}${r.note ? ' · ' + esc(r.note) : ''}</span><b>${fmtMoney(r.creditAmount)}</b></div>`).join('')}</div>` : '<div class="sub" style="margin-bottom:8px">No returns yet.</div>'}
    <button class="btn secondary" id="recordReturn">+ Record return</button>
  `);
  $('#saveBillAmt', sheet).onclick = async () => {
    vi.billAmount = parseFloat($('#billAmt', sheet).value) || 0;
    await DB.put('vendorInvoices', vi);
    toast('Bill amount saved');
    closeSheet(); render();
  };
  $('#addPayment', sheet).onclick = async () => {
    const amt = parseFloat($('#payAmt', sheet).value);
    if (!amt || amt <= 0) { toast('Enter a valid amount'); return; }
    vi.payments = vi.payments || [];
    vi.payments.push({ id: uid('pay'), amount: amt, mode: $('#payMode', sheet).value, date: $('#payDate', sheet).value || todayISO() });
    await DB.put('vendorInvoices', vi);
    toast('Payment recorded');
    closeSheet(); render();
  };
  $('#addAdj', sheet).onclick = async () => {
    const amt = parseFloat($('#adjAmt', sheet).value);
    if (!amt) { toast('Enter a non-zero amount'); return; }
    await addVendorAdjustment(vi, amt, $('#adjNote', sheet).value.trim());
    toast('Adjustment applied');
    closeSheet(); render();
  };
  $('#recordReturn', sheet).onclick = async () => {
    const [eligible, items] = await Promise.all([
      listInventory({ invoiceKey: vi.invoiceKey, inStockOnly: true }),
      listItems()
    ]);
    closeSheet();
    openVendorReturnFlow(vi, eligible, items, async () => {
      const freshTotal = await getVendorInvoiceCostTotal(vi.invoiceKey);
      const fresh = await DB.get('vendorInvoices', vi.id);
      drawVendorInvoiceSheet(fresh, freshTotal);
    });
  };
}

// eligibleBatches: this invoice's remaining-stock batches. Each gets a qty-to-return
// input (defaults to 0, capped at qtyRemaining) so a partial-quantity return works.
function openVendorReturnFlow(vi, eligibleBatches, items, onDone) {
  const itemById = Object.fromEntries(items.map(i => [i.id, i]));
  const qtyById = {};

  function totalSelected() { return Object.values(qtyById).reduce((s, q) => s + (q || 0), 0); }

  function draw() {
    const sheet = openSheet(`
      <h2>Return to vendor</h2>
      <p class="helptext">Enter how many units of each line are being returned.</p>
      <div class="search-list" id="eligList">
        ${eligibleBatches.length ? eligibleBatches.map(b => {
          const it = itemById[b.itemId] || { description: 'Unknown item', sku: '—' };
          return `
          <div class="line-item">
            <div class="row between">
              <div><div style="font-weight:700">${esc(it.description)}</div><div class="sub"><span class="tag">${esc(it.sku)}</span> · ${fmtMoney(b.costPrice)} ea · ${b.qtyRemaining} in stock</div></div>
            </div>
            <label style="margin-top:6px">Qty to return (max ${b.qtyRemaining})</label>
            <input type="number" class="retQty" data-id="${b.id}" min="0" max="${b.qtyRemaining}" value="${qtyById[b.id] || 0}" />
          </div>`;
        }).join('') : '<div class="empty">No in-stock units left under this invoice.</div>'}
      </div>
      <label style="margin-top:10px">Note</label>
      <input id="retNote" placeholder="optional" />
      <button class="btn" id="confirmReturn" style="margin-top:12px" ${totalSelected() ? '' : 'disabled'}>Record return (${totalSelected()} unit${totalSelected()===1?'':'s'})</button>
    `);
    $$('.retQty', sheet).forEach(inp => inp.oninput = () => {
      const b = eligibleBatches.find(x => x.id === inp.dataset.id);
      let q = parseInt(inp.value, 10) || 0;
      q = Math.max(0, Math.min(q, b.qtyRemaining));
      inp.value = q;
      qtyById[inp.dataset.id] = q;
      $('#confirmReturn', sheet).textContent = `Record return (${totalSelected()} unit${totalSelected()===1?'':'s'})`;
      $('#confirmReturn', sheet).disabled = totalSelected() === 0;
    });
    $('#confirmReturn', sheet).onclick = async () => {
      const returnLines = eligibleBatches
        .filter(b => qtyById[b.id] > 0)
        .map(b => ({ batch: b, qty: qtyById[b.id] }));
      if (!returnLines.length) return;
      await addVendorReturn(vi, returnLines, $('#retNote', sheet).value.trim());
      toast('Return recorded');
      closeSheet();
      onDone && onDone();
    };
  }
  draw();
}
