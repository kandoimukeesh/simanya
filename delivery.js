/* ============================================================
   delivery.js — the Delivery Pending panel: date-wise upcoming
   tailoring deliveries (No. of items + value per date), click
   through to the bill, update status, and notify the customer on
   WhatsApp — all the per-line mechanics live in data.js
   (listPendingDeliveryLines, setLineDeliveryStatus, the WhatsApp
   message builder); this file is purely the screen.
   ============================================================ */

SCREENS.deliveryPending = async (view) => {
  setTitle('Delivery Pending');
  removeFab();
  const pending = await listPendingDeliveryLines();
  const groups = groupPendingDeliveriesByDate(pending);
  const overdue = pending.filter(p => p.line.expectedDeliveryDate < todayISO());

  if (!pending.length) {
    view.innerHTML = `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('box',40)}</div>No pending deliveries.<br>Every tailoring item is marked Delivered.</div>`;
    return;
  }

  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${pending.length}</div><div class="lbl">Items pending</div></div>
      <div class="stat"><div class="num" style="color:${overdue.length?'var(--danger)':'inherit'}">${overdue.length}</div><div class="lbl">Overdue</div></div>
      <div class="stat"><div class="num">${fmtMoney(pending.reduce((s,p)=>s+Number(p.line.sellAmount||0),0))}</div><div class="lbl">Total value</div></div>
    </div>
    <div class="section-title">By expected delivery date</div>
    <div id="groupsWrap">${groups.map((g, gi) => `
      <div class="card" data-gi="${gi}">
        <div class="row between">
          <div><div style="font-weight:700">${fmtDate(g.date)}${g.date < todayISO() ? ' <span class="badge danger">Overdue</span>' : ''}</div><div class="sub">${g.items.length} item${g.items.length===1?'':'s'}</div></div>
          <div style="font-weight:700">${fmtMoney(g.value)}</div>
        </div>
      </div>
    `).join('')}</div>
    <div id="detailWrap"></div>
  `;
  $$('#groupsWrap .card', view).forEach(el => el.onclick = () => drawGroupDetail(groups[parseInt(el.dataset.gi, 10)]));

  function drawGroupDetail(group) {
    const wrap = $('#detailWrap', view);
    wrap.innerHTML = `
      <div class="section-title">${fmtDate(group.date)} — ${group.items.length} item${group.items.length===1?'':'s'}</div>
      ${group.items.map((p, i) => `
        <div class="list-item" data-i="${i}">
          <div class="avatar">${(p.customer?.name || '?')[0]?.toUpperCase()}</div>
          <div class="main">
            <div class="title">${esc(p.customer?.name || 'Customer')}</div>
            <div class="sub"><span class="tag">${esc(p.ci.billNumber)}</span> ${esc(p.line.description || '')} · <span class="badge warn">${esc(p.line.deliveryStatus || 'Pending')}</span></div>
          </div>
          <div class="end"><b>${fmtMoney(p.line.sellAmount)}</b></div>
        </div>
      `).join('')}
    `;
    $$('.list-item', wrap).forEach(el => el.onclick = () => {
      const p = group.items[parseInt(el.dataset.i, 10)];
      Nav.push('customerInvoiceDetail', { id: p.ci.id });
    });
    wrap.scrollIntoView({ behavior: 'smooth' });
  }
};
