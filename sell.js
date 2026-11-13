/* ============================================================
   sell.js — Module C: Customer Billing.
   Pick/add a customer, type-to-search an SKU from the Item Master
   to bill it (no scanning), the invoice detail sheet with payments,
   final-settlement discount/adjustment, qty-aware customer returns,
   and the Loyalty Programme (points earned + capped redemption).
   ============================================================ */

SCREENS.sell = async (view, params) => {
  setTitle('Sell');
  const tab = params.tab || 'new';
  view.innerHTML = `
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn ${tab==='new'?'':'secondary'}" id="tabNew">New Sale</button>
      <button class="btn ${tab==='history'?'':'secondary'}" id="tabHist">Past Bills</button>
    </div>
    <div id="sellBody"></div>
  `;
  $('#tabNew').onclick = () => Nav.setRoot('sell', { tab: 'new' });
  $('#tabHist').onclick = () => Nav.setRoot('sell', { tab: 'history' });
  removeFab();
  if (tab === 'new') {
    $('#sellBody').innerHTML = `
      <div class="card" style="text-align:center;padding:30px 16px">
        <div style="color:var(--gold-deep)">${icon('invoice',44)}</div>
        <p>Bill a customer by searching items from your Item Master.</p>
        <button class="btn" id="startSale">Start New Sale</button>
      </div>`;
    $('#startSale').onclick = () => startSaleFlow();
  } else {
    let invoices = await listCustomerInvoices();
    if (params.customerId) invoices = invoices.filter(ci => ci.customerId === params.customerId);
    const customers = Object.fromEntries((await listCustomers()).map(c => [c.id, c]));
    if (!invoices.length) { $('#sellBody').innerHTML = `<div class="empty">No sales yet.</div>`; return; }
    $('#sellBody').innerHTML = invoices.map(ci => {
      const bal = customerInvoiceBalance(ci);
      const net = customerInvoiceNet(ci);
      return `<div class="list-item" data-id="${ci.id}">
        <div class="avatar">${(customers[ci.customerId]?.name || '?')[0]?.toUpperCase()}</div>
        <div class="main"><div class="title">${esc(customers[ci.customerId]?.name || 'Customer')}</div>
        <div class="sub"><span class="tag">${esc(ci.billNumber)}</span> · ${fmtDate(ci.date)}</div></div>
        <div class="end"><div style="font-weight:700">${fmtMoney(ci.finalAmount)}</div><div class="sub" style="color:${net>0?'var(--danger)':net<0?'var(--warn)':'var(--success)'}">${net>0?fmtMoney(bal)+' due':net<0?fmtMoney(Math.abs(net))+' refund':'Paid'}</div></div>
      </div>`;
    }).join('');
    $$('.list-item', $('#sellBody')).forEach(el => el.onclick = () => Nav.push('customerInvoiceDetail', { id: el.dataset.id }));
  }
};

SCREENS.customerInvoiceDetail = async (view, params) => {
  const ci = await DB.get('customerInvoices', params.id);
  const customer = await DB.get('customers', ci.customerId);
  drawCustomerInvoiceDetail(ci, customer, view);
};

function drawCustomerInvoiceDetail(ci, customer, view) {
  setTitle(ci.billNumber);
  removeFab();
  const returnsCredit = customerInvoiceReturnsCredit(ci);
  const adjTotal = customerInvoiceAdjustmentTotal(ci);
  const net = customerInvoiceNet(ci);
  const bal = customerInvoiceBalance(ci);
  view.innerHTML = `
    <div class="card">
      <div class="row between"><b>${esc(customer?.name || '')}</b><span class="tag">${esc(ci.billNumber)}</span></div>
      <div class="sub">${esc(customer?.phone || '')} ${customer?.instaId ? ' · @' + esc(customer.instaId) : ''}</div>
      <div class="sub">${customer?.address ? esc(customer.address) : ''}</div>
    </div>
    <div class="section-title">Items (${ci.lines.length})</div>
    ${ci.lines.map((l, idx) => `
      <div class="line-item" data-lineidx="${idx}">
        <div class="row between">
          <span>Item ${idx+1} · <span class="tag">${esc(l.sku || 'manual')}</span> ${esc(l.description || '')} × ${l.qty}</span>
          <b>${fmtMoney(l.sellAmount)}</b>
        </div>
        ${l.note ? `<div class="sub" style="margin-top:2px">${icon('doc',12)} ${esc(l.note)}</div>` : ''}
        ${l.expectedDeliveryDate ? `
          <div class="row between" style="margin-top:6px">
            <div class="sub">${icon('box',12)} Due ${fmtDate(l.expectedDeliveryDate)} · <span class="badge ${l.deliveryStatus === 'Delivered' ? 'ok' : l.deliveryStatus === 'Complete' ? 'ok' : 'warn'}">${esc(l.deliveryStatus || 'Pending')}</span></div>
            <button class="btn ghost sm deliveryUpdateBtn" data-lineidx="${idx}">Update</button>
          </div>` : ''}
      </div>`).join('')}
    <button class="btn ghost sm" id="addTailorLine" style="width:100%;margin:6px 0">${icon('box',14)} Add tailoring / alteration item to this bill</button>
    <div class="card">
      <div class="row between"><span>Subtotal</span><b>${fmtMoney(ci.subtotal)}</b></div>
      <div class="row between"><span>Final amount</span><b>${fmtMoney(ci.finalAmount)}</b></div>
      ${returnsCredit ? `<div class="row between"><span>Returns credit</span><b>-${fmtMoney(returnsCredit)}</b></div>` : ''}
      ${adjTotal ? `<div class="row between"><span>Discount/adjustment</span><b>-${fmtMoney(adjTotal)}</b></div>` : ''}
      <div class="row between"><span>Paid</span><b>${fmtMoney(ci.amountPaid || 0)}</b></div>
      <div class="row between"><span>${net < 0 ? 'Refund due' : 'Balance'}</span><b style="color:${net>0?'var(--danger)':net<0?'var(--warn)':'var(--success)'}">${fmtMoney(Math.abs(net))}</b></div>
    </div>
    ${ci.loyaltyPointsRedeemed ? `<div class="card row between"><span>Loyalty points redeemed</span><b>-${ci.loyaltyPointsRedeemed}</b></div>` : ''}
    ${ci.loyaltyPointsEarned ? `<div class="card row between"><span>${icon('star',14)} Loyalty points earned</span><b>${ci.loyaltyPointsEarned}</b></div>` : ''}
    ${(ci.creditNotesApplied || []).length ? `<div class="card"><div class="sub" style="margin-bottom:4px">Credit note(s) applied</div>${ci.creditNotesApplied.map(c => `<div class="row between"><span>${esc(c.cnNumber)}</span><b>-${fmtMoney(c.amountApplied)}</b></div>`).join('')}</div>` : ''}
    <div class="btn-row">
      ${bal > 0 ? `<button class="btn" id="collectPay">Record payment</button>` : ''}
      <button class="btn secondary" id="applyAdj">Discount / adjustment</button>
    </div>
    <button class="btn ghost" id="sharePdf" style="margin-top:8px;width:100%">${icon('doc',14)} Download / share invoice PDF</button>
    ${(ci.adjustments || []).length ? `<div class="section-title">Adjustments</div>${ci.adjustments.map(a => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${fmtDate(a.date)} · ${esc(a.note || '—')}</span><b>${fmtMoney(a.amount)}</b></div>`).join('')}` : ''}
    <div class="section-title">Returns</div>
    ${(ci.returns || []).length ? ci.returns.map(r => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${fmtDate(r.date)} · ${r.lines.reduce((s,l)=>s+l.qty,0)} unit${r.lines.reduce((s,l)=>s+l.qty,0)===1?'':'s'} · ${esc(r.condition)}${r.note ? ' · ' + esc(r.note) : ''}<br><span class="tag">${esc(r.cnNumber || '')}</span>${r.pointsClawedBack ? ` · loyalty -${r.pointsClawedBack} pts` : ''}</span><b>${fmtMoney(r.creditAmount)}</b></div>`).join('') : '<div class="sub" style="margin-bottom:8px">No returns yet.</div>'}
    <button class="btn secondary" id="recordReturn">${icon('undo',14)} Record return</button>
    ${ci.photos?.length ? `<div class="section-title">Alteration photos</div><div class="thumb-row">${ci.photos.map(p => `<img class="thumb" style="width:90px;height:90px" src="${objectUrl(p)}" />`).join('')}</div>` : ''}
  `;
  $('#sharePdf').onclick = async () => {
    toast('Preparing PDF…', 1200);
    try {
      const { blob, filename } = await buildInvoicePdf(ci, customer);
      const outcome = await sharePdf(blob, filename, `Invoice ${ci.billNumber}`);
      if (outcome !== 'cancelled') toast(outcome === 'shared' ? 'Invoice shared' : 'Invoice downloaded');
    } catch (err) {
      toast('Could not generate PDF: ' + (err.message || err));
    }
  };
  $('#collectPay')?.addEventListener('click', () => {
    const sheet = openSheet(`
      <h2>Record payment</h2>
      <label>Amount</label><input id="amt" type="number" value="${bal}" />
      <label>Mode</label><select id="mode"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Other</option></select>
      <button class="btn" id="save" style="margin-top:10px">Save</button>
    `);
    $('#save', sheet).onclick = async () => {
      const amt = parseFloat($('#amt', sheet).value) || 0;
      ci.amountPaid = round2((ci.amountPaid || 0) + amt);
      ci.paymentHistory = ci.paymentHistory || [];
      ci.paymentHistory.push({ amount: amt, mode: $('#mode', sheet).value, date: todayISO() });
      await DB.put('customerInvoices', ci);
      closeSheet(); render();
    };
  });
  $('#applyAdj').onclick = () => {
    const sheet = openSheet(`
      <h2>Discount / adjustment</h2>
      <p class="helptext">A positive amount reduces what the customer owes. Use a negative amount to increase it.</p>
      <label>Amount</label><input id="adjAmt" type="number" inputmode="decimal" placeholder="0" />
      <label>Note</label><input id="adjNote" placeholder="e.g. settlement discount" />
      <button class="btn" id="saveAdj" style="margin-top:10px">Apply</button>
    `);
    $('#saveAdj', sheet).onclick = async () => {
      const amt = parseFloat($('#adjAmt', sheet).value);
      if (!amt) { toast('Enter a non-zero amount'); return; }
      await addCustomerAdjustment(ci, amt, $('#adjNote', sheet).value.trim());
      toast('Adjustment applied');
      closeSheet(); render();
    };
  };
  $('#recordReturn').onclick = () => {
    openCustomerReturnFlow(ci, customer, ci.lines, async () => {
      const fresh = await DB.get('customerInvoices', ci.id);
      const freshCustomer = await DB.get('customers', customer.id);
      drawCustomerInvoiceDetail(fresh, freshCustomer, view);
    });
  };
  $('#addTailorLine').onclick = () => {
    openTailoringAddFlow(ci, customer, async () => {
      const fresh = await DB.get('customerInvoices', ci.id);
      drawCustomerInvoiceDetail(fresh, customer, view);
    });
  };
  $$('.deliveryUpdateBtn', view).forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    openDeliveryStatusSheet(ci, customer, parseInt(btn.dataset.lineidx, 10), async () => {
      const fresh = await DB.get('customerInvoices', ci.id);
      drawCustomerInvoiceDetail(fresh, customer, view);
    });
  });
}

// Lets a tailoring charge (any Item Master SKU, usually category 'service') be
// added onto an ALREADY-FINALIZED invoice — the "alteration on an already-sold
// item" flow. Shows the item's own cost/price if one is associated, editable here.
function openTailoringAddFlow(ci, customer, onDone) {
  async function pickStep() {
    const items = await listItems({ activeOnly: true });
    openSearchOrAddSheet({
      title: 'Search tailoring / item to add',
      items,
      searchText: (i) => `${i.sku} ${i.description}`,
      placeholder: 'Type SKU or description…',
      emptyHint: 'No match found.',
      onAddNew: null,
      renderItem: (i) => `<div class="avatar">${esc((i.description[0]||'?').toUpperCase())}</div><div class="main"><div class="title">${esc(i.description)}</div><div class="sub"><span class="tag">${esc(i.sku)}</span></div></div><div class="end"><b>${fmtMoney(i.sellPrice)}</b></div>`,
      onPick: (item) => detailStep(item)
    });
  }
  function detailStep(item) {
    const sheet = openSheet(`
      <h2>${esc(item.description)}</h2>
      <p class="helptext"><span class="tag">${esc(item.sku)}</span>${item.costPrice ? ` · cost ${fmtMoney(item.costPrice)}` : ''}</p>
      <div class="grid-2">
        <div><label>Quantity *</label><input id="qty" type="number" min="1" value="1" /></div>
        <div><label>Charge (total) *</label><input id="sell" type="number" inputmode="decimal" value="${item.sellPrice || 0}" /></div>
      </div>
      <label style="margin-top:8px">Additional information (optional)</label>
      <input id="note" placeholder="e.g. alteration note" />
      <label style="margin-top:8px">Expected delivery date</label>
      <input id="deliveryDate" type="date" value="${todayISO()}" style="max-width:160px" />
      <button class="btn" id="addLine" style="margin-top:14px">Add to this bill</button>
    `);
    $('#addLine', sheet).onclick = async () => {
      const qty = parseInt($('#qty', sheet).value, 10);
      const sellAmount = parseFloat($('#sell', sheet).value);
      if (!qty || qty <= 0) { toast('Enter a valid quantity'); return; }
      if (isNaN(sellAmount) || sellAmount < 0) { toast('Enter a valid amount'); return; }
      const line = { itemId: item.id, sku: item.sku, description: item.description, qty, sellAmount, note: $('#note', sheet).value.trim(), expectedDeliveryDate: $('#deliveryDate', sheet).value || todayISO() };
      setLineDeliveryStatus(line, 'Pending');
      await addTailoringLineToInvoice(ci, line);
      toast('Tailoring item added to bill');
      closeSheet();
      onDone && onDone();
    };
  }
  pickStep();
}

// Advance a line's delivery status (date-stamped) and optionally send the
// customer a short WhatsApp update — language chosen right here, at send time.
function openDeliveryStatusSheet(ci, customer, lineIdx, onDone) {
  const line = ci.lines[lineIdx];
  let lang = 'en';
  const sheet = openSheet(`
    <h2>Update delivery status</h2>
    <p class="helptext">${esc(line.description || '')} · Item ${lineIdx+1} of bill ${esc(ci.billNumber)}</p>
    <label>Status</label>
    <select id="statusSel">${DELIVERY_STATUSES.map(s => `<option value="${esc(s)}" ${s===(line.deliveryStatus||'Pending')?'selected':''}>${esc(s)}</option>`).join('')}</select>
    <button class="btn" id="saveStatus" style="margin-top:10px">Save status</button>
    ${(line.statusHistory||[]).length ? `<div class="section-title">History</div>${line.statusHistory.map(h => `<div class="row between" style="padding:4px 0;border-bottom:1px solid var(--border)"><span>${esc(h.status)}</span><span class="sub">${fmtDate(h.date)}</span></div>`).join('')}` : ''}
    <div class="divider"></div>
    <div class="section-title" style="margin-top:0">${icon('invoice',13)} Notify customer on WhatsApp</div>
    <p class="helptext">A short message is sent for the status currently selected above. Pick a language just before sending.</p>
    <div class="btn-row">
      <button class="btn ${lang==='en'?'':'secondary'} sm langBtn" data-lang="en">English</button>
      <button class="btn ${lang==='hi'?'':'secondary'} sm langBtn" data-lang="hi">हिंदी</button>
      <button class="btn ${lang==='bn'?'':'secondary'} sm langBtn" data-lang="bn">বাংলা</button>
    </div>
    <button class="btn secondary" id="sendWa" style="margin-top:10px">${icon('invoice',14)} Send WhatsApp update</button>
  `);
  $$('.langBtn', sheet).forEach(btn => btn.onclick = () => { lang = btn.dataset.lang; $$('.langBtn', sheet).forEach(b => b.className = `btn ${b.dataset.lang===lang?'':'secondary'} sm langBtn`); });
  $('#saveStatus', sheet).onclick = async () => {
    setLineDeliveryStatus(line, $('#statusSel', sheet).value);
    await DB.put('customerInvoices', ci);
    toast('Status updated');
    closeSheet();
    onDone && onDone();
  };
  $('#sendWa', sheet).onclick = () => {
    const status = $('#statusSel', sheet).value;
    const msg = buildDeliveryWaMessage(lang, status, { name: customer?.name, item: line.description, bill: ci.billNumber });
    window.open(waLinkFor(customer?.phone, msg), '_blank');
  };
}

// lines: the invoice's own cart lines. Each gets a qty-to-return input (capped at that
// line's own qty) so a partial-quantity return works; condition toggles Resellable
// (restocks a fresh batch) vs Damaged (write-off, no restock). `customer` is needed so
// the return can issue its Credit Note and claw back Loyalty points against the right row.
function openCustomerReturnFlow(ci, customer, lines, onDone) {
  const qtyByIdx = {};
  let condition = 'resellable';

  function totalSelected() { return Object.values(qtyByIdx).reduce((s, q) => s + (q || 0), 0); }

  function draw() {
    const sheet = openSheet(`
      <h2>Record return</h2>
      <p class="helptext">Enter how many units of each line are being returned.</p>
      <div class="search-list" id="lineList">
        ${lines.map((l, idx) => `
          <div class="line-item">
            <div class="row between"><div><div style="font-weight:700">${esc(l.description || 'manual')}</div><div class="sub"><span class="tag">${esc(l.sku||'—')}</span> · ${fmtMoney(l.sellAmount / l.qty)} ea · billed qty ${l.qty}</div></div></div>
            <label style="margin-top:6px">Qty to return (max ${l.qty})</label>
            <input type="number" class="retQty" data-idx="${idx}" min="0" max="${l.qty}" value="${qtyByIdx[idx] || 0}" />
          </div>`).join('')}
      </div>
      <label style="margin-top:10px">Condition</label>
      <div class="btn-row">
        <button class="btn ${condition==='resellable'?'':'secondary'} sm" id="condResell">Resellable</button>
        <button class="btn ${condition==='damaged'?'':'secondary'} sm" id="condDamaged">Damaged</button>
      </div>
      <label style="margin-top:10px">Note</label>
      <input id="retNote" placeholder="optional" />
      <button class="btn" id="confirmReturn" style="margin-top:12px" ${totalSelected() ? '' : 'disabled'}>Record return (${totalSelected()} unit${totalSelected()===1?'':'s'})</button>
    `);
    $$('.retQty', sheet).forEach(inp => inp.oninput = () => {
      const l = lines[parseInt(inp.dataset.idx, 10)];
      let q = parseInt(inp.value, 10) || 0;
      q = Math.max(0, Math.min(q, l.qty));
      inp.value = q;
      qtyByIdx[inp.dataset.idx] = q;
      $('#confirmReturn', sheet).textContent = `Record return (${totalSelected()} unit${totalSelected()===1?'':'s'})`;
      $('#confirmReturn', sheet).disabled = totalSelected() === 0;
    });
    $('#condResell', sheet).onclick = () => { condition = 'resellable'; closeSheet(); draw(); };
    $('#condDamaged', sheet).onclick = () => { condition = 'damaged'; closeSheet(); draw(); };
    $('#confirmReturn', sheet).onclick = async () => {
      const returnLines = lines
        .map((l, idx) => ({ line: l, qty: qtyByIdx[idx] || 0 }))
        .filter(r => r.qty > 0);
      if (!returnLines.length) return;
      const { creditNote } = await addCustomerReturn(ci, customer, returnLines, condition, $('#retNote', sheet).value.trim());
      toast(`Return recorded — Credit Note ${creditNote.cnNumber} issued for ${fmtMoney(creditNote.amount)}${creditNote.pointsClawedBack ? ` · loyalty -${creditNote.pointsClawedBack} pts` : ''}`, 4000);
      closeSheet();
      onDone && onDone();
    };
  }
  draw();
}

/* ---------- new-sale flow ---------- */
async function startSaleFlow() {
  const customers = await listCustomers();
  openSearchOrAddSheet({
    title: 'Select customer',
    items: customers,
    renderItem: (c) => `<div class="avatar">${esc(c.name[0]?.toUpperCase())}</div><div class="main"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.phone||c.instaId||'')}${c.pointsBalance ? ` · ${icon('star',11)} ${c.pointsBalance} pts` : ''}</div></div>`,
    onPick: (c) => saleFlowChooseType(c),
    onAddNew: (prefill) => openCustomerForm({ name: prefill }, (row) => saleFlowChooseType(row))
  });
}

function saleFlowChooseType(customer) {
  const sheet = openSheet(`
    <h2>Sale type</h2>
    <p class="helptext">This sets the bill number suffix.</p>
    <div class="btn-row">
      <button class="btn" id="typeTrading">Trading (T)</button>
      <button class="btn secondary" id="typeTailoring">Tailoring / Designing (D)</button>
    </div>
  `);
  $('#typeTrading', sheet).onclick = () => { closeSheet(); runSaleCart(customer, 'trading'); };
  $('#typeTailoring', sheet).onclick = () => { closeSheet(); runSaleCart(customer, 'tailoring'); };
}

async function runSaleCart(customer, saleType) {
  const cart = []; // {itemId, sku, description, qty, sellAmount, note, expectedDeliveryDate, deliveryStatus, statusHistory}
  const photos = [];
  let redeemPts = 0;
  let cnApply = 0;
  const customerFresh = (await DB.get('customers', customer.id)) || customer;
  const openCNs = await listOpenCreditNotesForCustomer(customer.id);

  function cartSheet() {
    const subtotal = cart.reduce((s, l) => s + l.sellAmount, 0);
    const maxRedeemValue = maxRedeemableValue(customerFresh, subtotal);
    const maxRedeemPts = SETTINGS.loyaltyRedemptionValue > 0 ? Math.floor(maxRedeemValue / SETTINGS.loyaltyRedemptionValue) : 0;
    const cnTotalAvailable = round2(openCNs.reduce((s, c) => s + c.balanceRemaining, 0));
    const cnMax = round2(Math.min(cnTotalAvailable, subtotal));
    cnApply = Math.min(cnApply, cnMax);
    const sheet = openSheet(`
      <h2>Sale for ${esc(customer.name)}</h2>
      <div id="lines">${cart.length ? cart.map((l, idx) => `
        <div class="line-item" data-idx="${idx}">
          <div class="row between">
            <div><div style="font-weight:700">Item ${idx+1} · ${esc(l.description)}</div><div class="sub"><span class="tag">${esc(l.sku || 'manual')}</span> × ${l.qty}</div></div>
            <button class="btn danger sm removeLine" data-idx="${idx}">${icon('close',12)}</button>
          </div>
          <label style="margin:8px 0 2px">Sell amount (total for ${l.qty})</label>
          <input type="number" class="sellEdit" data-idx="${idx}" value="${l.sellAmount}" />
          <label style="margin:6px 0 2px">Additional information (optional)</label>
          <input class="noteEdit" data-idx="${idx}" value="${esc(l.note || '')}" placeholder="e.g. neckline alteration note" />
          ${saleType === 'tailoring' ? `
          <label style="margin:6px 0 2px">Expected delivery date</label>
          <input type="date" class="deliveryEdit" data-idx="${idx}" value="${l.expectedDeliveryDate || todayISO()}" style="max-width:160px" />
          ` : ''}
        </div>`).join('') : '<div class="empty">No items added yet.</div>'}</div>
      <button class="btn secondary" id="addItem" style="margin-top:8px">${icon('search',14)} Add item</button>
      <button class="btn secondary" id="manualLine" style="margin-top:8px">+ Add manual line</button>
      <button class="btn secondary" id="chargeLine" style="margin-top:8px">${icon('invoice',14)} Additional charge applicable</button>

      <div class="divider"></div>
      <div class="row between"><span>Subtotal</span><b id="subtotalDisp">${fmtMoney(subtotal)}</b></div>
      <label>Final amount (editable — rounding / discount)</label>
      <input id="finalAmt" type="number" value="${subtotal}" />

      ${openCNs.length ? `
      <div class="divider"></div>
      <div class="section-title" style="margin-top:0">${icon('invoice',13)} Credit notes available</div>
      <p class="helptext">${esc(customer.name)} has ${fmtMoney(cnTotalAvailable)} in open credit note${openCNs.length===1?'':'s'} from past returns (${openCNs.map(c=>esc(c.cnNumber)).join(', ')}).</p>
      <label>Credit note value to apply (max ${fmtMoney(cnMax)})</label>
      <input id="cnApply" type="number" min="0" max="${cnMax}" value="${cnApply}" />
      ` : ''}

      ${(customerFresh.pointsBalance > 0) ? `
      <div class="divider"></div>
      <div class="section-title" style="margin-top:0">${icon('star',13)} Loyalty redemption</div>
      <p class="helptext">${esc(customer.name)} has <b>${customerFresh.pointsBalance} pts</b> (worth ${fmtMoney(customerFresh.pointsBalance * SETTINGS.loyaltyRedemptionValue)}). Max redeemable on this bill: <b>${fmtMoney(maxRedeemValue)}</b> (${maxRedeemPts} pts).</p>
      <label>Points to redeem</label>
      <input id="redeemPts" type="number" min="0" max="${maxRedeemPts}" value="${redeemPts}" />
      ` : ''}

      <div class="section-title" style="margin-top:14px">Photos (max 3, for alterations)</div>
      <div class="thumb-row" id="photoRow">${photos.map((p, i) => `<div class="thumb-wrap"><img class="thumb" src="${objectUrl(p)}" /><button class="thumb-remove" data-i="${i}">${icon('close',12)}</button></div>`).join('')}</div>
      ${photos.length < 3 ? `<button class="btn ghost sm" id="addPhoto" style="margin-top:6px">+ Add photo</button>` : ''}

      <button class="btn" id="completeSale" style="margin-top:16px" ${cart.length ? '' : 'disabled'}>Complete sale</button>
    `, {});
    function syncTotals() {
      const st = cart.reduce((s, l) => s + l.sellAmount, 0);
      $('#subtotalDisp', sheet).textContent = fmtMoney(st);
      $('#finalAmt', sheet).value = st;
    }
    $$('.sellEdit', sheet).forEach(inp => inp.oninput = () => { cart[inp.dataset.idx].sellAmount = parseFloat(inp.value) || 0; syncTotals(); });
    $$('.noteEdit', sheet).forEach(inp => inp.oninput = () => { cart[inp.dataset.idx].note = inp.value; });
    $$('.deliveryEdit', sheet).forEach(inp => inp.oninput = () => { cart[inp.dataset.idx].expectedDeliveryDate = inp.value; });
    $$('.removeLine', sheet).forEach(btn => btn.onclick = () => { cart.splice(btn.dataset.idx, 1); closeSheet(); cartSheet(); });
    $('#redeemPts', sheet)?.addEventListener('input', (e) => { redeemPts = Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, maxRedeemPts)); e.target.value = redeemPts; });
    $('#cnApply', sheet)?.addEventListener('input', (e) => { cnApply = Math.max(0, Math.min(parseFloat(e.target.value) || 0, cnMax)); e.target.value = cnApply; });
    $('#addItem', sheet).onclick = () => { closeSheet(); pickItemForSale(); };
    $('#manualLine', sheet).onclick = () => {
      closeSheet();
      openManualLineForm((line) => { cart.push(line); cartSheet(); });
    };
    $('#chargeLine', sheet).onclick = () => {
      closeSheet();
      openManualLineForm((line) => { cart.push(line); cartSheet(); }, { heading: 'Additional charge', descPlaceholder: 'e.g. Delivery charge / Packing charge', presets: ['Delivery charge', 'Packing charge', 'Alteration charge', 'Handling charge'] });
    };
    $('#addPhoto', sheet)?.addEventListener('click', async () => {
      const shot = await openCamera({ hint: 'Photo for alteration reference', guides: false });
      if (shot) { photos.push(shot.blob); closeSheet(); cartSheet(); }
    });
    $$('.thumb-remove', sheet).forEach(btn => btn.onclick = () => { photos.splice(btn.dataset.i, 1); closeSheet(); cartSheet(); });
    $('#completeSale', sheet).onclick = async () => {
      const finalAmount = parseFloat($('#finalAmt', sheet).value) || subtotal;
      const cnToApply = Math.min(cnApply, cnMax, finalAmount);
      closeSheet();
      await finalizeSale(customer, saleType, cart, photos, subtotal, finalAmount, redeemPts, cnToApply);
    };
  }

  async function pickItemForSale() {
    const items = await listItems({ activeOnly: true });
    openSearchOrAddSheet({
      title: 'Search item to bill',
      items,
      searchText: (i) => `${i.sku} ${i.description}`,
      placeholder: 'Type SKU or description…',
      emptyHint: 'No match found.',
      onAddNew: null,
      renderItem: (i) => `<div class="avatar">${esc((i.description[0]||'?').toUpperCase())}</div><div class="main"><div class="title">${esc(i.description)}</div><div class="sub"><span class="tag">${esc(i.sku)}</span></div></div><div class="end"><b>${fmtMoney(i.sellPrice)}</b></div>`,
      onPick: (item) => qtyPriceStep(item)
    });
  }

  async function qtyPriceStep(item) {
    const isService = itemCategory(item) === 'service';
    const onHand = isService ? null : await stockOnHand(item.id);
    const sheet = openSheet(`
      <h2>${esc(item.description)}</h2>
      <p class="helptext"><span class="tag">${esc(item.sku)}</span>${isService ? ' · Service / Raw material (not stock-tracked)' : ` · ${onHand} in stock`}</p>
      <div class="grid-2">
        <div><label>Quantity *</label><input id="qty" type="number" inputmode="numeric" min="1" value="1" /></div>
        <div><label>Sell amount (total) *</label><input id="sell" type="number" inputmode="decimal" value="${item.sellPrice || 0}" /></div>
      </div>
      <label style="margin-top:8px">Additional information (optional)</label>
      <input id="note" placeholder="e.g. neckline alteration note" />
      ${saleType === 'tailoring' ? `<label style="margin-top:8px">Expected delivery date</label><input id="deliveryDate" type="date" value="${todayISO()}" style="max-width:160px" />` : ''}
      <button class="btn" id="addLine" style="margin-top:14px">Add to bill</button>
    `);
    $('#qty', sheet).oninput = () => {
      const qty = parseInt($('#qty', sheet).value, 10) || 1;
      $('#sell', sheet).value = round2(qty * (item.sellPrice || 0));
    };
    $('#addLine', sheet).onclick = () => {
      const qty = parseInt($('#qty', sheet).value, 10);
      const sellAmount = parseFloat($('#sell', sheet).value);
      if (!qty || qty <= 0) { toast('Enter a valid quantity'); return; }
      if (isNaN(sellAmount) || sellAmount < 0) { toast('Enter a valid sell amount'); return; }
      const line = { itemId: item.id, sku: item.sku, description: item.description, qty, sellAmount, note: $('#note', sheet).value.trim() };
      if (saleType === 'tailoring') { line.expectedDeliveryDate = $('#deliveryDate', sheet).value || todayISO(); setLineDeliveryStatus(line, 'Pending'); }
      closeSheet();
      cart.push(line);
      cartSheet();
    };
  }

  cartSheet();
}

function openManualLineForm(onAdd, { heading, descPlaceholder, presets } = {}) {
  const sheet = openSheet(`
    <h2>${esc(heading || 'Manual line item')}</h2>
    <p class="helptext">For a one-off item/charge that isn't in your Item Master.</p>
    ${presets?.length ? `<div class="btn-row" style="flex-wrap:wrap">${presets.map(p => `<button class="btn ghost sm presetBtn" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
    <label>Description</label><input id="description" placeholder="${esc(descPlaceholder || 'e.g. Alteration charge')}" />
    <div class="grid-2">
      <div><label>Quantity</label><input id="qty" type="number" min="1" value="1" /></div>
      <div><label>Sell amount (total)</label><input id="sell" type="number" /></div>
    </div>
    <label>Additional information (optional)</label><input id="note" placeholder="optional" />
    <button class="btn" id="add" style="margin-top:10px">Add</button>
  `);
  $$('.presetBtn', sheet).forEach(btn => btn.onclick = () => { $('#description', sheet).value = btn.dataset.v; });
  $('#add', sheet).onclick = () => {
    const description = $('#description', sheet).value.trim() || 'Manual item';
    const qty = parseInt($('#qty', sheet).value, 10) || 1;
    const sellAmount = parseFloat($('#sell', sheet).value) || 0;
    const note = $('#note', sheet).value.trim();
    closeSheet();
    onAdd({ itemId: null, sku: null, description, qty, sellAmount, note });
  };
}

async function finalizeSale(customer, saleType, cart, photos, subtotal, finalAmount, redeemPts, creditNoteAmountToApply) {
  const billNumber = await generateBillNumber(saleType);
  const ci = {
    id: uid('cinv'), billNumber, customerId: customer.id, saleType, date: todayISO(),
    lines: cart, subtotal, finalAmount, amountPaid: 0, adjustments: [], returns: [], loyaltyPointsEarned: 0, photos, createdAt: Date.now()
  };

  // Consume stock FIFO for each line that refers to a real, stock-tracked (Trading)
  // SKU — manual lines have no itemId, and Service/Raw-material items never get
  // batches in the first place, so both are skipped entirely.
  let shortCount = 0;
  for (const line of cart) {
    if (!line.itemId) continue;
    const item = await getItem(line.itemId);
    if (item && itemCategory(item) === 'service') continue;
    const consumed = await consumeStockFIFO(line.itemId, line.qty);
    line.costTotal = consumed.costTotal;
    if (consumed.shortBy > 0) shortCount++;
  }

  const customerFresh = (await DB.get('customers', customer.id)) || { id: customer.id, pointsBalance: 0, loyaltyLedger: [] };

  // Apply any open Credit Note balance first (from a past return), capped defensively
  // at the bill's own amount so a bill can never go negative through credit alone.
  let cnApplied = 0;
  const cnToApply = round2(Math.max(0, Math.min(Number(creditNoteAmountToApply) || 0, finalAmount)));
  if (cnToApply > 0) {
    const cnResult = await applyCreditNotes(customerFresh.id, cnToApply, ci);
    if (cnResult.applied > 0) {
      ci.creditNotesApplied = cnResult.lines;
      await addCustomerAdjustment(ci, cnResult.applied, `Credit note(s) applied: ${cnResult.lines.map(l => l.cnNumber).join(', ')}`);
      cnApplied = cnResult.applied;
    }
  }

  // Redeem against the balance as it stood BEFORE this bill's own points are earned
  // (so a customer can't redeem points they just earned on the same bill).
  if (redeemPts > 0) {
    try {
      await redeemLoyaltyPoints(ci, customerFresh, redeemPts);
      ci.loyaltyPointsRedeemed = redeemPts;
    }
    catch (err) { toast(err.message || 'Could not redeem points'); }
  }
  const pointsEarned = await accrueLoyaltyPoints(customerFresh, ci);

  await DB.put('customerInvoices', ci);

  toast(`Bill ${billNumber} created — ${fmtMoney(finalAmount)}${cnApplied ? ` · credit note -${fmtMoney(cnApplied)}` : ''}${pointsEarned ? ` · +${pointsEarned} pts` : ''}${shortCount ? ' · some items oversold stock, check inventory' : ''}`, 3500);
  Nav.setRoot('sell', { tab: 'history' });
  setTimeout(() => Nav.push('customerInvoiceDetail', { id: ci.id }), 50);
}
