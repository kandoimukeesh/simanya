/* ============================================================
   inventory.js — Module A: Purchase Entry & Stock.
   Pick/add a supplier, enter the mandatory invoice number + date,
   then add purchase lines by searching the Item Master and typing
   a quantity + cost price (no camera/OCR — SKUs are manual).
   Each line becomes one "batch": item + qty + cost, consumed
   oldest-first (FIFO) by sales. Also the stock-on-hand/ageing view.
   ============================================================ */

SCREENS.inventory = async (view, params) => {
  setTitle('Inventory');
  // Only Trading items ever carry stock — Service/Raw-material SKUs are never
  // batched, so they simply never appear here.
  const [batches, items, suppliers] = await Promise.all([listInventory({ inStockOnly: true }), listItems({ category: 'trading' }), listSuppliers()]);
  const itemById = Object.fromEntries(items.map(i => [i.id, i]));
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));

  // group remaining stock by item
  const groups = {};
  for (const b of batches) {
    if (!itemById[b.itemId]) continue;
    if (!groups[b.itemId]) groups[b.itemId] = { itemId: b.itemId, qty: 0, oldest: b.purchaseDate, batches: [] };
    const g = groups[b.itemId];
    g.qty += b.qtyRemaining;
    g.batches.push(b);
    if (b.purchaseDate < g.oldest) g.oldest = b.purchaseDate;
  }
  let groupList = Object.values(groups);
  if (params.agingOnly) groupList = groupList.filter(g => daysSince(g.oldest) >= SETTINGS.agingWarnDays);
  groupList.sort((a, b) => a.oldest.localeCompare(b.oldest));

  view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input id="searchBox" placeholder="Search SKU, description, supplier…" />
    </div>
    <div id="groupsWrap"></div>
  `;
  const wrap = $('#groupsWrap');

  function renderGroups(filterText) {
    const ft = (filterText || '').toLowerCase();
    const rows = groupList.filter(g => {
      if (!ft) return true;
      const it = itemById[g.itemId];
      const sup = g.batches.some(b => (supplierById[b.supplierId]?.name || '').toLowerCase().includes(ft));
      return sup || (it && (it.sku.toLowerCase().includes(ft) || it.description.toLowerCase().includes(ft)));
    });
    if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('box',40)}</div>No stock on hand.<br>Tap the + button to record a purchase.</div>`; return; }
    wrap.innerHTML = rows.map((g, gi) => {
      const it = itemById[g.itemId] || { sku: '—', description: 'Unknown item', sellPrice: null };
      const age = daysSince(g.oldest);
      const ageBadge = age >= SETTINGS.agingCriticalDays ? 'danger' : age >= SETTINGS.agingWarnDays ? 'warn' : 'ok';
      const supplierNames = [...new Set(g.batches.map(b => supplierById[b.supplierId]?.name).filter(Boolean))];
      return `
      <div class="card" data-gi="${gi}">
        <div class="row between">
          <div>
            <div style="font-weight:700">${esc(it.description)}</div>
            <div class="sub" style="color:var(--text-muted);font-size:13px"><span class="tag">${esc(it.sku)}</span>${supplierNames.length ? ' · ' + esc(supplierNames.join(', ')) : ''}</div>
          </div>
          <div class="end">
            <div style="font-weight:700">${g.qty} in stock</div>
            <span class="badge ${ageBadge}">oldest ${age}d</span>
          </div>
        </div>
        <div class="sub avgCostLine" data-itemid="${g.itemId}" style="margin-top:4px">Sell ${fmtMoney(it.sellPrice)} · Avg cost …</div>
      </div>`;
    }).join('');
    // Avg cost needs the invoice's other-charges allocation (async) — fill in after paint.
    $$('.avgCostLine', wrap).forEach(async (el) => {
      const it = itemById[el.dataset.itemid];
      const avg = await stockAvgLandedCost(el.dataset.itemid);
      el.textContent = `Sell ${fmtMoney(it?.sellPrice)} · Avg cost (landed) ${fmtMoney(avg)}`;
    });
    $$('.card[data-gi]', wrap).forEach(el => el.onclick = () => Nav.push('itemInventoryDetail', { itemId: rows[parseInt(el.dataset.gi, 10)].itemId }));
  }
  renderGroups('');
  $('#searchBox').oninput = (e) => renderGroups(e.target.value);

  addFab('+', () => startCaptureFlow());
};

// SKU-level detail: avg landed cost + an invoice-wise (batch-wise) breakdown —
// purchase cost, the invoice's allocated other-charge per unit, landed cost, and
// qty remaining for each batch, grouped by the purchase invoice it came from.
SCREENS.itemInventoryDetail = async (view, params) => {
  const item = await getItem(params.itemId);
  setTitle(item?.description || 'Item');
  removeFab();
  const [batches, suppliers] = await Promise.all([listInventory({ itemId: params.itemId }), listSuppliers()]);
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const avgLanded = await stockAvgLandedCost(params.itemId);
  const totalRemaining = batches.reduce((s, b) => s + (b.qtyRemaining || 0), 0);

  const rowsHtml = [];
  for (const b of batches) {
    const { perUnitAllocation, otherChargesTotal } = await getVendorInvoiceAllocation(b.invoiceKey);
    const landed = batchLandedCost(b, perUnitAllocation);
    rowsHtml.push(`
      <div class="card">
        <div class="row between">
          <div><div style="font-weight:700">Invoice ${esc(b.invoiceNumber)}</div><div class="sub">${fmtDate(b.invoiceDate)} · ${esc(supplierById[b.supplierId]?.name || '—')}</div></div>
          <span class="badge ${b.qtyRemaining > 0 ? 'ok' : 'neutral'}">${b.qtyRemaining} left of ${b.qtyReceived}</span>
        </div>
        <div class="grid-3" style="text-align:center;margin-top:8px">
          <div><div class="sub">Purchase cost</div><b>${fmtMoney(b.costPrice)}</b></div>
          <div><div class="sub">Allocated charge</div><b>${perUnitAllocation ? '+' + fmtMoney(perUnitAllocation) : '—'}</b></div>
          <div><div class="sub">Landed cost</div><b>${fmtMoney(landed)}</b></div>
        </div>
        ${otherChargesTotal ? `<div class="sub" style="margin-top:6px">Invoice other charges: ${fmtMoney(otherChargesTotal)} spread over this invoice's pieces</div>` : ''}
      </div>
    `);
  }

  view.innerHTML = `
    <div class="card">
      <div class="row between"><b>${esc(item?.description || '')}</b><span class="tag">${esc(item?.sku || '')}</span></div>
      <div class="sub">${item?.category === 'service' ? 'Service / Raw material' : 'Trading item'}</div>
    </div>
    <div class="stat-grid" style="margin:10px 0">
      <div class="stat"><div class="num">${totalRemaining}</div><div class="lbl">In stock</div></div>
      <div class="stat"><div class="num">${fmtMoney(avgLanded)}</div><div class="lbl">Avg cost (landed)</div></div>
      <div class="stat"><div class="num">${fmtMoney(item?.sellPrice)}</div><div class="lbl">Sell price</div></div>
    </div>
    <div class="section-title">Batches — invoice-wise</div>
    ${rowsHtml.length ? rowsHtml.join('') : '<div class="empty">No purchase history for this SKU.</div>'}
  `;
};

async function startCaptureFlow() {
  const suppliers = await listSuppliers();
  openSearchOrAddSheet({
    title: 'Select supplier',
    items: suppliers,
    renderItem: (s) => `<div class="avatar">${esc(s.name[0]?.toUpperCase())}</div><div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${esc(s.phone||'')}</div></div>`,
    onPick: (s) => captureFlowStep2(s),
    onAddNew: (prefill) => openSupplierForm({ name: prefill }, (row) => captureFlowStep2(row))
  });
}

function captureFlowStep2(supplier) {
  const sheet = openSheet(`
    <h2>Purchase invoice</h2>
    <p class="helptext">Required before adding stock for <b>${esc(supplier.name)}</b>.</p>
    <label>Invoice number *</label><input id="invNo" placeholder="e.g. INV-1042" />
    <label>Invoice date *</label><input id="invDate" type="date" value="${todayISO()}" />
    <button class="btn" id="startCapture" style="margin-top:14px">Add purchase lines</button>
  `);
  $('#startCapture', sheet).onclick = async () => {
    const invoiceNumber = $('#invNo', sheet).value.trim();
    const invoiceDate = $('#invDate', sheet).value;
    if (!invoiceNumber || !invoiceDate) { toast('Invoice number and date are required'); return; }
    await ensureVendorInvoice(supplier.id, invoiceNumber, invoiceDate);
    closeSheet();
    runCaptureSession(supplier, invoiceNumber, invoiceDate);
  };
}

async function runCaptureSession(supplier, invoiceNumber, invoiceDate) {
  let count = 0, totalCost = 0;

  async function pickItemStep() {
    // Service/Raw-material items are never stock-tracked, so they never show up
    // here — only Trading items can be purchased into inventory.
    const items = await listItems({ activeOnly: true, category: 'trading' });
    openSearchOrAddSheet({
      title: 'Search SKU to add',
      items,
      searchText: (i) => `${i.sku} ${i.description}`,
      renderItem: (i) => `<div class="avatar">${esc((i.description[0]||'?').toUpperCase())}</div><div class="main"><div class="title">${esc(i.description)}</div><div class="sub"><span class="tag">${esc(i.sku)}</span></div></div><div class="end"><b>${fmtMoney(i.costPrice)}</b></div>`,
      placeholder: 'Type SKU or description…',
      emptyHint: 'No match. Tap “Add new” to create this SKU.',
      onPick: (item) => qtyCostStep(item),
      onAddNew: (prefill) => openItemForm({ description: prefill }, (item) => qtyCostStep(item))
    });
  }

  function qtyCostStep(item) {
    const sheet = openSheet(`
      <h2>${esc(item.description)}</h2>
      <p class="helptext"><span class="tag">${esc(item.sku)}</span></p>
      <div class="grid-2">
        <div><label>Quantity *</label><input id="qty" type="number" inputmode="numeric" min="1" value="1" /></div>
        <div><label>Cost price (per unit) *</label><input id="cost" type="number" inputmode="decimal" value="${item.costPrice || ''}" /></div>
      </div>
      <button class="btn" id="addLine" style="margin-top:14px">Add to invoice</button>
    `);
    $('#addLine', sheet).onclick = async () => {
      const qty = parseInt($('#qty', sheet).value, 10);
      const cost = parseFloat($('#cost', sheet).value);
      if (!qty || qty <= 0) { toast('Enter a valid quantity'); return; }
      if (cost == null || isNaN(cost) || cost < 0) { toast('Enter a valid cost price'); return; }
      await addInventoryBatch({ itemId: item.id, supplierId: supplier.id, invoiceNumber, invoiceDate, qty, costPrice: cost });
      count++; totalCost += qty * cost;
      closeSheet();
      toast(`${qty} × ${item.description} added · running total ${fmtMoney(totalCost)}`, 1800);
      const again = await confirm(`Added ${qty} × ${item.description} at ${fmtMoney(cost)} each.\n\nRunning total: ${count} line${count===1?'':'s'}, ${fmtMoney(totalCost)}.\n\nAdd another SKU to this invoice?`);
      if (again) pickItemStep(); else finishSession();
    };
  }

  function finishSession() {
    toast(`Purchase entry done: ${count} line(s), ${fmtMoney(totalCost)} total.`, 3000);
    Nav.setRoot('inventory');
  }

  pickItemStep();
}
