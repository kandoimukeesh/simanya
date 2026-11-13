/* ============================================================
   notes.js — the combined Credit Notes / Debit Notes panel (More
   menu): every CN issued to a customer and every DN issued to a
   vendor, together in one list, newest first.
   ============================================================ */

SCREENS.creditDebitNotes = async (view) => {
  setTitle('Credit / Debit Notes');
  removeFab();
  const [creditNotes, debitNotes, customers, suppliers] = await Promise.all([
    listCreditNotes(), listDebitNotes(), listCustomers(), listSuppliers()
  ]);
  const customerById = Object.fromEntries(customers.map(c => [c.id, c]));
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));

  const rows = [
    ...creditNotes.map(cn => ({ type: 'CN', date: cn.date, number: cn.cnNumber, amount: cn.amount, balance: cn.balanceRemaining, party: customerById[cn.customerId]?.name || 'Customer', ref: cn.billNumber, raw: cn })),
    ...debitNotes.map(dn => ({ type: 'DN', date: dn.date, number: dn.dnNumber, amount: dn.amount, balance: null, party: supplierById[dn.supplierId]?.name || 'Vendor', ref: dn.invoiceNumber, raw: dn }))
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!rows.length) {
    view.innerHTML = `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('doc',40)}</div>No credit or debit notes yet.</div>`;
    return;
  }

  view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input id="searchBox" placeholder="Search number or name…" />
    </div>
    <div id="wrap"></div>
  `;
  const wrap = $('#wrap');
  function draw(filterText) {
    const ft = (filterText || '').toLowerCase();
    const filtered = rows.filter(r => !ft || r.number.toLowerCase().includes(ft) || r.party.toLowerCase().includes(ft));
    wrap.innerHTML = filtered.length ? filtered.map(r => `
      <div class="card" data-type="${r.type}" data-id="${r.raw.id}">
        <div class="row between">
          <div><div style="font-weight:700">${esc(r.number)}</div><div class="sub">${fmtDate(r.date)} · ${esc(r.party)}${r.ref ? ' · against ' + esc(r.ref) : ''}</div></div>
          <span class="badge ${r.type === 'CN' ? 'ok' : 'warn'}">${r.type === 'CN' ? 'Credit Note' : 'Debit Note'}</span>
        </div>
        <div class="row between" style="margin-top:6px">
          <div class="sub">Amount</div><b>${fmtMoney(r.amount)}</b>
        </div>
        ${r.balance != null ? `<div class="row between"><div class="sub">Available</div><b style="color:${r.balance>0?'var(--success)':'inherit'}">${fmtMoney(r.balance)}</b></div>` : ''}
      </div>
    `).join('') : `<div class="empty">No match.</div>`;
    $$('.card', wrap).forEach(el => el.onclick = () => {
      if (el.dataset.type === 'CN') Nav.push('customerDetail', { customerId: rows.find(r => r.raw.id === el.dataset.id).raw.customerId });
      else Nav.push('supplierDetail', { supplierId: rows.find(r => r.raw.id === el.dataset.id).raw.supplierId });
    });
  }
  draw('');
  $('#searchBox').oninput = (e) => draw(e.target.value);
};
