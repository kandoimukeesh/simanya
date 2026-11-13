/* ============================================================
   home.js — the Home tab (dashboard stats + alerts) and the
   More menu (navigation hub to Item Master/Suppliers/Customers/
   Dashboard/Settings/Backup).
   ============================================================ */

SCREENS.home = async (view) => {
  setTitle(SETTINGS.businessName || 'StockBill');
  const [batches, vendorInvoices, customerInvoices, suppliers, pendingDeliveries] = await Promise.all([
    listInventory({ inStockOnly: true }), listVendorInvoices(), listCustomerInvoices(), listSuppliers(), listPendingDeliveryLines()
  ]);
  const overdueDeliveries = pendingDeliveries.filter(p => p.line.expectedDeliveryDate < todayISO());
  const unitsInStock = batches.reduce((s, b) => s + (b.qtyRemaining || 0), 0);
  const stockValue = batches.reduce((s, b) => s + (b.qtyRemaining || 0) * (b.costPrice || 0), 0);
  const agingCritical = batches.filter(b => daysSince(b.purchaseDate) >= SETTINGS.agingCriticalDays);
  const agingWarn = batches.filter(b => daysSince(b.purchaseDate) >= SETTINGS.agingWarnDays && daysSince(b.purchaseDate) < SETTINGS.agingCriticalDays);

  let payable = 0, overdueCount = 0;
  for (const vi of vendorInvoices) {
    const costTotal = await getVendorInvoiceCostTotal(vi.invoiceKey);
    const bal = vendorInvoiceBalance(vi, costTotal);
    payable += bal;
    if (bal > 0 && daysSince(vi.invoiceDate) > SETTINGS.vendorCreditDays) overdueCount++;
  }

  const today = todayISO();
  const todaysSales = customerInvoices.filter(ci => ci.date === today);
  const todaysAmount = todaysSales.reduce((s, c) => s + (c.finalAmount || 0), 0);

  let receivable = 0;
  for (const ci of customerInvoices) receivable += customerInvoiceBalance(ci);

  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${unitsInStock}</div><div class="lbl">Units in stock</div></div>
      <div class="stat"><div class="num">${fmtMoney(stockValue)}</div><div class="lbl">Stock value (cost)</div></div>
      <div class="stat"><div class="num">${fmtMoney(payable)}</div><div class="lbl">Vendor payable</div></div>
      <div class="stat"><div class="num">${fmtMoney(receivable)}</div><div class="lbl">Customer receivable</div></div>
    </div>

    <div class="section-title">Quick actions</div>
    <div class="btn-row" style="margin-bottom:6px">
      <button class="btn" id="qaCapture">${icon('box',16)} Purchase Entry</button>
      <button class="btn secondary" id="qaSell">${icon('invoice',16)} New Sale</button>
    </div>

    <div class="section-title">Today</div>
    <div class="card row between">
      <div><div style="font-weight:700">${todaysSales.length} sale${todaysSales.length===1?'':'s'}</div><div class="sub" style="color:var(--text-muted);font-size:13px">${fmtMoney(todaysAmount)} billed today</div></div>
      <button class="btn ghost sm" id="viewSalesToday">View</button>
    </div>

    ${pendingDeliveries.length ? `
    <div class="section-title">Delivery Pending</div>
    <div class="card row between" id="goDeliveries">
      <div><div style="font-weight:700">${pendingDeliveries.length} item${pendingDeliveries.length===1?'':'s'} pending</div><div class="sub" style="color:${overdueDeliveries.length?'var(--danger)':'var(--text-muted)'};font-size:13px">${overdueDeliveries.length ? `${overdueDeliveries.length} overdue · ` : ''}${fmtMoney(pendingDeliveries.reduce((s,p)=>s+Number(p.line.sellAmount||0),0))} total value</div></div>
      <button class="btn ghost sm">View</button>
    </div>
    ` : ''}

    ${(overdueCount || agingWarn.length || agingCritical.length || lastBackupText().warn) ? `
    <div class="section-title">Alerts</div>
    ${overdueCount ? `<div class="card row between"><div class="row">${icon('warning',16)} <b>${overdueCount}</b>&nbsp;vendor invoice${overdueCount===1?'':'s'} overdue</div><button class="btn ghost sm" id="goVendors">View</button></div>` : ''}
    ${agingCritical.length ? `<div class="card row between"><div class="row"><span class="dot danger"></span> <b>${agingCritical.length}</b>&nbsp;batch${agingCritical.length===1?'':'es'} in stock ${SETTINGS.agingCriticalDays}+ days</div><button class="btn ghost sm" id="goAging1">View</button></div>` : ''}
    ${agingWarn.length ? `<div class="card row between"><div class="row"><span class="dot warn"></span> <b>${agingWarn.length}</b>&nbsp;batch${agingWarn.length===1?'':'es'} ageing ${SETTINGS.agingWarnDays}+ days</div><button class="btn ghost sm" id="goAging2">View</button></div>` : ''}
    ${lastBackupText().warn ? `<div class="card row between"><div class="row">${icon('backup',16)} ${esc(lastBackupText().text)} — back up your data</div><button class="btn ghost sm" id="goBackup">Back up</button></div>` : ''}
    ` : ''}

    <div class="section-title">Overview</div>
    <div class="card"><div class="row between"><span>Vendors</span><b>${suppliers.length}</b></div></div>
  `;
  $('#qaCapture').onclick = () => startCaptureFlow();
  $('#qaSell').onclick = () => startSaleFlow();
  $('#viewSalesToday').onclick = () => Nav.setRoot('sell', { tab: 'history' });
  $('#goDeliveries')?.addEventListener('click', () => Nav.push('deliveryPending'));
  $('#goVendors')?.addEventListener('click', () => Nav.setRoot('vendors'));
  $('#goAging1')?.addEventListener('click', () => Nav.setRoot('inventory', { agingOnly: true }));
  $('#goAging2')?.addEventListener('click', () => Nav.setRoot('inventory', { agingOnly: true }));
  $('#goBackup')?.addEventListener('click', () => Nav.push('backup'));
};

/* ---------- MORE (navigation hub) ---------- */
SCREENS.more = async (view) => {
  setTitle('More');
  removeFab();
  view.innerHTML = `
    <div class="section-title">Manage</div>
    <div class="card" style="padding:0">
      <div class="list-item" id="mItems"><div class="avatar">${icon('tag')}</div><div class="main"><div class="title">Item Master</div><div class="sub">SKUs — vendor + type + code, cost/wholesale/sell price</div></div></div>
      <div class="list-item" id="mItemTypes"><div class="avatar">${icon('tag')}</div><div class="main"><div class="title">Item Types</div><div class="sub">The 3-letter code used in every SKU</div></div></div>
      <div class="list-item" id="mSuppliers"><div class="avatar">${icon('factory')}</div><div class="main"><div class="title">Vendors</div><div class="sub">Master list, vendor code, search & add</div></div></div>
      <div class="list-item" id="mCustomers"><div class="avatar">${icon('person')}</div><div class="main"><div class="title">Customers</div><div class="sub">Master list, loyalty points & transactions</div></div></div>
      <div class="list-item" id="mReports"><div class="avatar">${icon('chart')}</div><div class="main"><div class="title">Dashboard</div><div class="sub">Daily view · weekly/monthly · supplier/customer</div></div></div>
    </div>
    <div class="section-title">Billing</div>
    <div class="card" style="padding:0">
      <div class="list-item" id="mDeliveries"><div class="avatar">${icon('box')}</div><div class="main"><div class="title">Delivery Pending</div><div class="sub">Date-wise tailoring deliveries, status & WhatsApp updates</div></div></div>
      <div class="list-item" id="mNotes"><div class="avatar">${icon('doc')}</div><div class="main"><div class="title">Credit / Debit Notes</div><div class="sub">Every CN and DN together, newest first</div></div></div>
    </div>
    <div class="section-title">Data & Settings</div>
    <div class="card" style="padding:0">
      <div class="list-item" id="mSettings"><div class="avatar">${icon('settings')}</div><div class="main"><div class="title">Settings</div><div class="sub">Business info, markup, loyalty programme</div></div></div>
      <div class="list-item" id="mBackup"><div class="avatar">${icon('backup')}</div><div class="main"><div class="title">Backup & Restore</div><div class="sub">Export / import all data</div></div></div>
    </div>
  `;
  $('#mItems').onclick = () => Nav.push('itemsList');
  $('#mItemTypes').onclick = () => Nav.push('itemTypesList');
  $('#mSuppliers').onclick = () => Nav.push('suppliersList');
  $('#mCustomers').onclick = () => Nav.push('customersList');
  $('#mReports').onclick = () => Nav.push('reports');
  $('#mDeliveries').onclick = () => Nav.push('deliveryPending');
  $('#mNotes').onclick = () => Nav.push('creditDebitNotes');
  $('#mSettings').onclick = () => Nav.push('settings');
  $('#mBackup').onclick = () => Nav.push('backup');
};
