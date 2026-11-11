/* ============================================================
   dashboard.js — the Dashboard/Reports screen: Daily, Overview, By
   Supplier, and By Customer tabs. Daily shows today's (or any day's)
   Cash / Credit / Total Sales / Total Purchase-payment view. The
   other tabs are filterable by Weekly / Monthly / Custom period.
   Every figure is read from data.js's helpers (vendorInvoiceBalance,
   customerInvoiceBalance, etc.) so it always agrees with the
   Vendors/Sell screens.
   ============================================================ */

// India business year: 1 Apr → 31 Mar. Returns the fiscal year that contains dateISO.
function fyRange(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // Apr = month index 3
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, startYear, label: `FY ${startYear}-${String(startYear + 1).slice(2)}` };
}
function monthStartISO(dateISO) { return dateISO.slice(0, 7) + '-01'; }
function sumSalesInRange(customerInvoices, from, to) {
  return round2(customerInvoices.filter(ci => inRange(ci.date, from, to)).reduce((s, c) => s + (c.finalAmount || 0), 0));
}
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Last `days` days (inclusive of today) as a daily sales series for the bar chart.
function dailySalesSeries(customerInvoices, days = 14) {
  const today = todayISO();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, label: String(d.getDate()), value: sumSalesInRange(customerInvoices, iso, iso) });
  }
  return out;
}
// The 12 months of the fiscal year (Apr → Mar) containing today, as a monthly sales series.
function fyMonthlySalesSeries(customerInvoices) {
  const today = todayISO();
  const { startYear } = fyRange(today);
  const out = [];
  for (let m = 0; m < 12; m++) {
    const calMonth = (3 + m) % 12; // 3=Apr ... wraps to Jan(0)/Feb(1)/Mar(2)
    const calYear = startYear + (3 + m >= 12 ? 1 : 0);
    const from = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const to = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    out.push({ label: MONTH_ABBR[calMonth], from, to, value: sumSalesInRange(customerInvoices, from, to) });
  }
  return out;
}

function periodRange(period, customFrom, customTo) {
  const today = todayISO();
  if (period === 'week') { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 6); return { from: d.toISOString().slice(0, 10), to: today }; }
  if (period === 'month') { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 29); return { from: d.toISOString().slice(0, 10), to: today }; }
  return { from: customFrom || today, to: customTo || today };
}
function inRange(dateStr, from, to) { return dateStr && dateStr >= from && dateStr <= to; }

SCREENS.reports = async (view) => {
  setTitle('Dashboard');
  removeFab();
  const [batches, vendorInvoices, customerInvoices, suppliers, customers, items] = await Promise.all([
    listInventory({}), listVendorInvoices(), listCustomerInvoices(), listSuppliers(), listCustomers(), listItems()
  ]);
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const customerById = Object.fromEntries(customers.map(c => [c.id, c]));
  const itemById = Object.fromEntries(items.map(i => [i.id, i]));

  function costTotalFor(invoiceKey) {
    return round2(batches.filter(b => b.invoiceKey === invoiceKey).reduce((s, b) => s + (b.costPrice || 0) * (b.qtyReceived || 0), 0));
  }

  let tab = 'daily';
  let period = 'week';
  let customFrom = todayISO(), customTo = todayISO();
  let dailyDate = todayISO();

  view.innerHTML = `
    <div class="btn-row" style="margin-bottom:10px">
      <button class="btn sm" id="tabDaily" style="flex:1">Daily</button>
      <button class="btn sm secondary" id="tabOverview" style="flex:1">Overview</button>
      <button class="btn sm secondary" id="tabSupplier" style="flex:1">By Supplier</button>
      <button class="btn sm secondary" id="tabCustomer" style="flex:1">By Customer</button>
    </div>
    <div id="periodBar"></div>
    <div id="reportBody"></div>
  `;
  const tabBtns = { daily: $('#tabDaily'), overview: $('#tabOverview'), supplier: $('#tabSupplier'), customer: $('#tabCustomer') };

  function drawPeriodBar() {
    if (tab === 'daily') {
      $('#periodBar').innerHTML = `<label>Date</label><input type="date" id="dailyDate" value="${dailyDate}" max="${todayISO()}" />`;
      $('#dailyDate').onchange = (e) => { dailyDate = e.target.value || todayISO(); drawBody(); };
      return;
    }
    if (tab === 'overview') { $('#periodBar').innerHTML = ''; return; }
    $('#periodBar').innerHTML = `
      <div class="btn-row" style="margin-bottom:10px">
        <button class="btn sm ${period==='week'?'':'secondary'}" id="pWeek" style="flex:1">Weekly</button>
        <button class="btn sm ${period==='month'?'':'secondary'}" id="pMonth" style="flex:1">Monthly</button>
        <button class="btn sm ${period==='custom'?'':'secondary'}" id="pCustom" style="flex:1">Custom</button>
      </div>
      ${period === 'custom' ? `<div class="grid-2" style="margin-bottom:10px">
        <div><label>From</label><input type="date" id="customFrom" value="${customFrom}" /></div>
        <div><label>To</label><input type="date" id="customTo" value="${customTo}" /></div>
      </div>` : ''}
    `;
    $('#pWeek').onclick = () => { period = 'week'; drawPeriodBar(); drawBody(); };
    $('#pMonth').onclick = () => { period = 'month'; drawPeriodBar(); drawBody(); };
    $('#pCustom').onclick = () => { period = 'custom'; drawPeriodBar(); drawBody(); };
    $('#customFrom')?.addEventListener('change', (e) => { customFrom = e.target.value; drawBody(); });
    $('#customTo')?.addEventListener('change', (e) => { customTo = e.target.value; drawBody(); });
  }

  function drawBody() {
    Object.entries(tabBtns).forEach(([k, b]) => b.className = `btn sm ${k === tab ? '' : 'secondary'}`);
    const body = $('#reportBody');
    if (tab === 'daily') { body.innerHTML = renderDaily(dailyDate); return; }
    if (tab === 'overview') { body.innerHTML = renderOverview(); return; }
    const { from, to } = periodRange(period, customFrom, customTo);
    if (tab === 'supplier') { body.innerHTML = renderSupplierWise(from, to); return; }
    if (tab === 'customer') {
      body.innerHTML = renderCustomerWise(from, to);
      $$('.card[data-cid]', body).forEach(el => el.onclick = () => Nav.push('customerDetail', { customerId: el.dataset.cid }));
      return;
    }
  }

  function renderDaily(day) {
    const salesToday = customerInvoices.filter(ci => ci.date === day);
    const totalSales = round2(salesToday.reduce((s, c) => s + (c.finalAmount || 0), 0));

    // Cash/other collections received TODAY, across every invoice (today's bills or older dues settled today).
    const custPayModeTotals = {};
    let cashCollected = 0;
    for (const ci of customerInvoices) {
      for (const p of (ci.paymentHistory || [])) {
        if (p.date !== day) continue;
        custPayModeTotals[p.mode] = round2((custPayModeTotals[p.mode] || 0) + Number(p.amount || 0));
        if (p.mode === 'Cash') cashCollected = round2(cashCollected + Number(p.amount || 0));
      }
    }
    const totalCollectedToday = round2(Object.values(custPayModeTotals).reduce((s, v) => s + v, 0));
    // "Credit" = the still-unpaid portion of TODAY's own sales (i.e. billed today but not yet collected).
    const creditToday = round2(salesToday.reduce((s, ci) => s + customerInvoiceBalance(ci), 0));

    // Payments made OUT to vendors today.
    const vendPayModeTotals = {};
    let totalPurchasePayment = 0;
    for (const vi of vendorInvoices) {
      for (const p of (vi.payments || [])) {
        if (p.date !== day) continue;
        vendPayModeTotals[p.mode] = round2((vendPayModeTotals[p.mode] || 0) + Number(p.amount || 0));
        totalPurchasePayment = round2(totalPurchasePayment + Number(p.amount || 0));
      }
    }
    // New stock received today (informational — separate from what was PAID today).
    const purchasedToday = batches.filter(b => b.purchaseDate === day);
    const purchaseValueToday = round2(purchasedToday.reduce((s, b) => s + (b.qtyReceived || 0) * (b.costPrice || 0), 0));

    return `
      <div class="stat-grid">
        <div class="stat"><div class="num">${fmtMoney(cashCollected)}</div><div class="lbl">Cash collected</div></div>
        <div class="stat"><div class="num" style="color:${creditToday>0?'var(--warn)':'inherit'}">${fmtMoney(creditToday)}</div><div class="lbl">Credit (today's bills)</div></div>
        <div class="stat"><div class="num">${fmtMoney(totalSales)}</div><div class="lbl">Total sales (${salesToday.length} bill${salesToday.length===1?'':'s'})</div></div>
        <div class="stat"><div class="num">${fmtMoney(totalPurchasePayment)}</div><div class="lbl">Total purchase payment</div></div>
      </div>
      <div class="section-title">Customer receipts by mode</div>
      ${Object.keys(custPayModeTotals).length ? `<div class="card">${Object.entries(custPayModeTotals).map(([mode, amt]) => `<div class="row between"><span>${esc(mode)}</span><b>${fmtMoney(amt)}</b></div>`).join('')}<div class="divider"></div><div class="row between"><span>Total received</span><b>${fmtMoney(totalCollectedToday)}</b></div></div>` : '<div class="empty">No payments received on this date.</div>'}
      <div class="section-title">Vendor payments by mode</div>
      ${Object.keys(vendPayModeTotals).length ? `<div class="card">${Object.entries(vendPayModeTotals).map(([mode, amt]) => `<div class="row between"><span>${esc(mode)}</span><b>${fmtMoney(amt)}</b></div>`).join('')}</div>` : '<div class="empty">No vendor payments made on this date.</div>'}
      <div class="section-title">Stock received on this date</div>
      <div class="card row between"><span>${purchasedToday.reduce((s,b)=>s+(b.qtyReceived||0),0)} units received</span><b>${fmtMoney(purchaseValueToday)}</b></div>
    `;
  }

  function renderOverview() {
    const today = todayISO();
    const mtdSales = sumSalesInRange(customerInvoices, monthStartISO(today), today);
    const fy = fyRange(today);
    const ytdSales = sumSalesInRange(customerInvoices, fy.from, today);
    const dailySeries = dailySalesSeries(customerInvoices, 14);
    const monthlySeries = fyMonthlySalesSeries(customerInvoices);
    const currentMonthIdx = monthlySeries.findIndex(m => inRange(today, m.from, m.to));

    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    batches.filter(b => (b.qtyRemaining || 0) > 0).forEach(b => {
      const d = daysSince(b.purchaseDate);
      const q = b.qtyRemaining;
      if (d <= 30) buckets['0-30'] += q; else if (d <= 60) buckets['31-60'] += q; else if (d <= 90) buckets['61-90'] += q; else buckets['90+'] += q;
    });
    const payableRows = vendorInvoices.map(vi => {
      const costTotal = costTotalFor(vi.invoiceKey);
      const bal = vendorInvoiceBalance(vi, costTotal);
      return { name: supplierById[vi.supplierId]?.name || '—', invNo: vi.invoiceNumber, bal, overdue: daysSince(vi.invoiceDate) > SETTINGS.vendorCreditDays };
    }).filter(r => r.bal > 0);
    const receivableRows = customerInvoices.map(ci => ({ name: customerById[ci.customerId]?.name || '—', billNo: ci.billNumber, bal: customerInvoiceBalance(ci) })).filter(r => r.bal > 0);
    const totalSales = customerInvoices.reduce((s, c) => s + (c.finalAmount || 0), 0);
    const totalPurchaseCost = batches.reduce((s, b) => s + (b.qtyReceived || 0) * (b.costPrice || 0), 0);
    return `
      <div class="section-title" style="margin-top:0">This month &amp; this year</div>
      <div class="stat-grid">
        <div class="stat"><div class="num">${fmtMoney(mtdSales)}</div><div class="lbl">MTD sales (this month)</div></div>
        <div class="stat"><div class="num">${fmtMoney(ytdSales)}</div><div class="lbl">YTD sales (${fy.label})</div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Daily sales — last 14 days</div>
        <div class="chart-sub">${fmtDate(dailySeries[0].date)} – ${fmtDate(today)}</div>
        ${renderBarChart(dailySeries, { highlightIndex: dailySeries.length - 1 })}
      </div>
      <div class="chart-card">
        <div class="chart-title">Monthly sales — ${fy.label}</div>
        <div class="chart-sub">April to March, current financial year</div>
        ${renderBarChart(monthlySeries, { highlightIndex: currentMonthIdx })}
      </div>
      <div class="section-title">Ageing (in-stock units)</div>
      <div class="card"><div class="grid-2">
        ${Object.entries(buckets).map(([k, v]) => `<div class="row between"><span>${k} days</span><b>${v}</b></div>`).join('')}
      </div></div>
      <div class="section-title">Registers</div>
      <div class="card row between"><span>Total purchase cost (all-time)</span><b>${fmtMoney(totalPurchaseCost)}</b></div>
      <div class="card row between"><span>Total sales billed (all-time)</span><b>${fmtMoney(totalSales)}</b></div>
      <div class="section-title">Outstanding to vendors</div>
      ${payableRows.length ? payableRows.map(r => `<div class="card row between"><span>${esc(r.name)} · ${esc(r.invNo)}</span><b style="color:${r.overdue ? 'var(--danger)' : 'var(--warn)'}">${fmtMoney(r.bal)}</b></div>`).join('') : '<div class="empty">Nothing outstanding.</div>'}
      <div class="section-title">Outstanding from customers</div>
      ${receivableRows.length ? receivableRows.map(r => `<div class="card row between"><span>${esc(r.name)} · ${esc(r.billNo)}</span><b style="color:var(--danger)">${fmtMoney(r.bal)}</b></div>`).join('') : '<div class="empty">Nothing outstanding.</div>'}
    `;
  }

  function renderSupplierWise(from, to) {
    const inPeriod = batches.filter(b => inRange(b.purchaseDate, from, to));
    const bySupplier = {};
    for (const b of inPeriod) {
      const g = (bySupplier[b.supplierId] ||= { units: 0, cost: 0, sellValue: 0 });
      g.units += b.qtyReceived || 0;
      g.cost += (b.qtyReceived || 0) * (b.costPrice || 0);
      g.sellValue += (b.qtyReceived || 0) * (itemById[b.itemId]?.sellPrice || 0);
    }
    let paymentsBySupplier = {};
    for (const vi of vendorInvoices) {
      for (const p of (vi.payments || [])) {
        if (inRange(p.date, from, to)) paymentsBySupplier[vi.supplierId] = (paymentsBySupplier[vi.supplierId] || 0) + Number(p.amount || 0);
      }
    }
    const supplierIds = new Set([...Object.keys(bySupplier), ...Object.keys(paymentsBySupplier)]);
    if (!supplierIds.size) return `<div class="empty">No purchase activity in this period.</div>`;
    const totalCost = Object.values(bySupplier).reduce((s, b) => s + b.cost, 0);
    const totalUnits = Object.values(bySupplier).reduce((s, b) => s + b.units, 0);
    return `
      <div class="stat-grid" style="margin-bottom:6px">
        <div class="stat"><div class="num">${totalUnits}</div><div class="lbl">Units purchased</div></div>
        <div class="stat"><div class="num">${fmtMoney(totalCost)}</div><div class="lbl">Purchase cost</div></div>
      </div>
      ${[...supplierIds].map(sid => {
        const g = bySupplier[sid] || { units: 0, cost: 0, sellValue: 0 };
        const paid = paymentsBySupplier[sid] || 0;
        return `<div class="card">
          <div class="row between"><b>${esc(supplierById[sid]?.name || 'Unknown')}</b><span class="badge neutral">${g.units} units</span></div>
          <div class="grid-3" style="text-align:center;margin-top:8px">
            <div><div class="sub">Cost</div><b>${fmtMoney(g.cost)}</b></div>
            <div><div class="sub">Sell value (est.)</div><b>${fmtMoney(g.sellValue)}</b></div>
            <div><div class="sub">Paid (period)</div><b>${fmtMoney(paid)}</b></div>
          </div>
        </div>`;
      }).join('')}
    `;
  }

  function renderCustomerWise(from, to) {
    const inPeriod = customerInvoices.filter(ci => inRange(ci.date, from, to));
    const byCustomer = {};
    for (const ci of inPeriod) {
      const b = (byCustomer[ci.customerId] ||= { bills: 0, billed: 0, paid: 0, balance: 0 });
      b.bills++; b.billed += ci.finalAmount || 0; b.paid += ci.amountPaid || 0;
      b.balance += customerInvoiceBalance(ci);
    }
    const ids = Object.keys(byCustomer);
    if (!ids.length) return `<div class="empty">No sales in this period.</div>`;
    const totalBilled = ids.reduce((s, id) => s + byCustomer[id].billed, 0);
    const totalBills = ids.reduce((s, id) => s + byCustomer[id].bills, 0);
    return `
      <div class="stat-grid" style="margin-bottom:6px">
        <div class="stat"><div class="num">${totalBills}</div><div class="lbl">Bills raised</div></div>
        <div class="stat"><div class="num">${fmtMoney(totalBilled)}</div><div class="lbl">Total billed</div></div>
      </div>
      ${ids.map(id => {
        const b = byCustomer[id];
        return `<div class="card" data-cid="${id}">
          <div class="row between"><b>${esc(customerById[id]?.name || 'Unknown')}</b><span class="badge neutral">${b.bills} bill${b.bills===1?'':'s'}</span></div>
          <div class="grid-3" style="text-align:center;margin-top:8px">
            <div><div class="sub">Billed</div><b>${fmtMoney(b.billed)}</b></div>
            <div><div class="sub">Paid</div><b>${fmtMoney(b.paid)}</b></div>
            <div><div class="sub">Balance</div><b style="color:${b.balance>0?'var(--danger)':'var(--success)'}">${fmtMoney(b.balance)}</b></div>
          </div>
        </div>`;
      }).join('')}
    `;
  }

  tabBtns.daily.onclick = () => { tab = 'daily'; drawPeriodBar(); drawBody(); };
  tabBtns.overview.onclick = () => { tab = 'overview'; drawPeriodBar(); drawBody(); };
  tabBtns.supplier.onclick = () => { tab = 'supplier'; drawPeriodBar(); drawBody(); };
  tabBtns.customer.onclick = () => { tab = 'customer'; drawPeriodBar(); drawBody(); };
  drawPeriodBar();
  drawBody();
};
