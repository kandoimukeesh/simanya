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
  const [batches, items, suppliers] = await Promise.all([listInventory({ inStockOnly: true }), listItems(), listSuppliers()]);
  const itemById = Object.fromEntries(items.map(i => [i.id, i]));
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));

  // group remaining stock by item
  const groups = {};
  for (const b of batches) {
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
    wrap.innerHTML = rows.map(g => {
      const it = itemById[g.itemId] || { sku: '—', description: 'Unknown item', sellPrice: null };
      const age = daysSince(g.oldest);
      const ageBadge = age >= SETTINGS.agingCriticalDays ? 'danger' : age >= SETTINGS.agingWarnDays ? 'warn' : 'ok';
      const supplierNames = [...new Set(g.batches.map(b => supplierById[b.supplierId]?.name).filter(Boolean))];
      return `
      <div class="card">
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
        <div class="sub" style="margin-top:4px">Sell ${fmtMoney(it.sellPrice)} · Avg cost ${fmtMoney(round2(g.batches.reduce((s,b)=>s+b.qtyRemaining*b.costPrice,0) / (g.qty||1)))}</div>
      </div>`;
    }).join('');
  }
  renderGroups('');
  $('#searchBox').oninput = (e) => renderGroups(e.target.value);

  addFab('+', () => startCaptureFlow());
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
    const items = await listItems({ activeOnly: true });
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
