/* ============================================================
   customers.js — Customers master list, the add/edit form, and
   the customer-wise transaction view (profile, loyalty ledger,
   and every invoice for that customer). Billing itself — sales,
   payments, returns — lives in sell.js; this file links into it.
   ============================================================ */

SCREENS.customersList = async (view) => {
  setTitle('Customers');
  removeFab();
  const customers = await listCustomers();
  view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input id="searchBox" placeholder="Search name or phone…" />
    </div>
    <div id="custWrap"></div>
  `;
  const wrap = $('#custWrap');
  function draw(filterText) {
    const ft = (filterText || '').toLowerCase();
    const rows = customers.filter(c => !ft || c.name.toLowerCase().includes(ft) || (c.phone || '').includes(ft) || (c.instaId || '').toLowerCase().includes(ft));
    wrap.innerHTML = rows.length ? rows.map(c => `
      <div class="list-item" data-id="${c.id}"><div class="avatar">${esc(c.name[0]?.toUpperCase())}</div>
      <div class="main"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.phone || c.instaId || '')}</div></div>
      ${c.pointsBalance ? `<div class="end"><span class="badge neutral">${icon('star',12)} ${c.pointsBalance} pts</span></div>` : ''}
      </div>
    `).join('') : `<div class="empty">No customers yet.</div>`;
    $$('.list-item', wrap).forEach(el => el.onclick = () => Nav.push('customerDetail', { customerId: el.dataset.id }));
  }
  draw('');
  $('#searchBox').oninput = (e) => draw(e.target.value);
  addFab('+', () => openCustomerForm(null, (row) => Nav.push('customerDetail', { customerId: row.id })));
};

SCREENS.customerDetail = async (view, params) => {
  const customer = await DB.get('customers', params.customerId);
  if (!customer) { view.innerHTML = `<div class="empty">Customer not found.</div>`; return; }
  setTitle(customer.name);
  removeFab();
  const invoices = (await listCustomerInvoices()).filter(ci => ci.customerId === customer.id);
  const creditNotes = await listCreditNotes({ customerId: customer.id });

  let totalBilled = 0, totalBalance = 0, totalRefundDue = 0;
  for (const ci of invoices) {
    totalBilled += ci.finalAmount || 0;
    const net = customerInvoiceNet(ci);
    if (net > 0) totalBalance += net; else totalRefundDue += -net;
  }
  const pointsWorth = round2((customer.pointsBalance || 0) * (SETTINGS.loyaltyRedemptionValue || 0));
  const ledgerSorted = [...(customer.loyaltyLedger || [])].reverse(); // newest first
  const ledgerLabel = { earn: 'Earned', redeem: 'Redeemed', return_adjustment: 'Returned' };
  const cnOpenTotal = round2(creditNotes.reduce((s, c) => s + (c.balanceRemaining || 0), 0));

  view.innerHTML = `
    <div class="card">
      <div class="row between"><b>${esc(customer.name)}</b><button class="btn ghost sm" id="editCust">Edit</button></div>
      <div class="sub">${esc(customer.phone || '—')}${customer.instaId ? ' · @' + esc(customer.instaId) : ''}</div>
      ${customer.address ? `<div class="sub">${esc(customer.address)}</div>` : ''}
    </div>

    <div class="stat-grid" style="margin:10px 0">
      <div class="stat"><div class="num">${invoices.length}</div><div class="lbl">Bills</div></div>
      <div class="stat"><div class="num">${fmtMoney(totalBilled)}</div><div class="lbl">Total billed</div></div>
      <div class="stat"><div class="num" style="color:${totalBalance>0?'var(--danger)':'inherit'}">${fmtMoney(totalBalance)}</div><div class="lbl">Balance due</div></div>
      <div class="stat"><div class="num">${fmtMoney(totalRefundDue)}</div><div class="lbl">Refund due</div></div>
    </div>

    <div class="card row between">
      <div><div style="font-weight:700">${icon('star',16)} ${customer.pointsBalance || 0} pts</div><div class="sub">worth ${fmtMoney(pointsWorth)} at current redemption rate</div></div>
    </div>
    ${ledgerSorted.length ? `
    <div class="section-title">Loyalty history</div>
    ${ledgerSorted.slice(0, 20).map(l => `
      <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${fmtDate(l.date)} · ${ledgerLabel[l.type] || l.type} · ${esc(l.billNumber || '')}${l.cnNumber ? ' · ' + esc(l.cnNumber) : ''}</span>
        <b style="color:${l.points > 0 ? 'var(--success)' : 'var(--warn)'}">${l.points > 0 ? '+' : ''}${l.points}</b>
      </div>`).join('')}
    ` : ''}

    ${creditNotes.length ? `
    <div class="section-title">Credit notes ${cnOpenTotal ? `<span class="badge neutral" style="font-weight:400">${fmtMoney(cnOpenTotal)} available</span>` : ''}</div>
    <div id="cnList">
      ${creditNotes.map(cn => `
      <div class="card" data-id="${cn.id}">
        <div class="row between">
          <div><div style="font-weight:700">${esc(cn.cnNumber)}</div><div class="sub">${fmtDate(cn.date)} · against ${esc(cn.billNumber)} · ${cn.condition === 'resellable' ? 'Resellable' : 'Damaged'}</div></div>
          <span class="badge ${cn.balanceRemaining > 0 ? 'ok' : 'neutral'}">${cn.balanceRemaining > 0 ? 'Open' : 'Fully applied'}</span>
        </div>
        <div class="grid-3" style="text-align:center;margin-top:8px">
          <div><div class="sub">Issued</div><b>${fmtMoney(cn.amount)}</b></div>
          <div><div class="sub">Available</div><b style="color:${cn.balanceRemaining>0?'var(--success)':'inherit'}">${fmtMoney(cn.balanceRemaining)}</b></div>
          <div><div class="sub">Loyalty adj.</div><b>${cn.pointsClawedBack ? '-' + cn.pointsClawedBack : '—'}</b></div>
        </div>
        <button class="btn ghost sm cnPdf" data-id="${cn.id}" style="margin-top:8px;width:100%">${icon('doc',14)} Download / share credit note</button>
      </div>`).join('')}
    </div>
    ` : ''}

    <div class="section-title">Transactions</div>
    <div id="invList">
      ${invoices.length ? invoices.map(ci => {
        const net = customerInvoiceNet(ci);
        return `<div class="list-item" data-id="${ci.id}">
          <div class="avatar">${icon('invoice')}</div>
          <div class="main"><div class="title">${esc(ci.billNumber)}</div><div class="sub">${fmtDate(ci.date)} · ${ci.lines.length} item${ci.lines.length===1?'':'s'}</div></div>
          <div class="end"><div style="font-weight:700">${fmtMoney(ci.finalAmount)}</div><div class="sub" style="color:${net>0?'var(--danger)':net<0?'var(--warn)':'var(--success)'}">${net>0?fmtMoney(net)+' due':net<0?fmtMoney(Math.abs(net))+' refund':'Paid'}</div></div>
        </div>`;
      }).join('') : '<div class="empty">No bills yet.</div>'}
    </div>
  `;
  $('#editCust').onclick = () => openCustomerForm(customer, () => render());
  $$('#invList .list-item', view).forEach(el => el.onclick = () => Nav.push('customerInvoiceDetail', { id: el.dataset.id }));
  $$('.cnPdf', view).forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const cn = creditNotes.find(c => c.id === btn.dataset.id);
    const originalCi = await DB.get('customerInvoices', cn.invoiceId);
    toast('Preparing PDF…', 1200);
    try {
      const { blob, filename } = await buildCreditNotePdf(cn, originalCi, customer);
      const outcome = await sharePdf(blob, filename, `Credit Note ${cn.cnNumber}`);
      if (outcome !== 'cancelled') toast(outcome === 'shared' ? 'Credit note shared' : 'Credit note downloaded');
    } catch (err) {
      toast('Could not generate PDF: ' + (err.message || err));
    }
  });
};

function openCustomerForm(existing, onDone) {
  const isEdit = !!(existing && existing.id);
  const sheet = openSheet(`
    <h2>${isEdit ? 'Edit customer' : 'Add customer'}</h2>
    <label>Name *</label><input id="name" value="${esc(existing?.name || '')}" />
    <label>Phone</label><input id="phone" value="${esc(existing?.phone || '')}" />
    <label>Instagram ID</label><input id="insta" value="${esc(existing?.instaId || '')}" placeholder="@handle" />
    <label>Delivery address</label><textarea id="addr">${esc(existing?.address || '')}</textarea>
    <button class="btn" id="save" style="margin-top:10px">Save</button>
  `);
  $('#save', sheet).onclick = async () => {
    const name = $('#name', sheet).value.trim();
    if (!name) { toast('Name is required'); return; }
    let row;
    if (isEdit) {
      row = { ...existing, name, phone: $('#phone', sheet).value, instaId: $('#insta', sheet).value, address: $('#addr', sheet).value };
      await DB.put('customers', row);
    } else {
      row = await addCustomer({ name, phone: $('#phone', sheet).value, instaId: $('#insta', sheet).value, address: $('#addr', sheet).value });
    }
    closeSheet();
    onDone && onDone(row);
  };
}
