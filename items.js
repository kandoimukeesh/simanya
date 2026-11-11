/* ============================================================
   items.js — the Item / SKU Master: created and edited manually
   by the user. Every purchase batch (inventory.js) and every bill
   line (sell.js) refers to one of these records.
   ============================================================ */

SCREENS.itemsList = async (view) => {
  setTitle('Item Master');
  const items = await listItems();
  view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input id="searchBox" placeholder="Search SKU or description…" />
    </div>
    <div id="itemsWrap"></div>
  `;
  const wrap = $('#itemsWrap');
  function draw(filterText) {
    const ft = (filterText || '').toLowerCase();
    const rows = items.filter(i => !ft || i.sku.toLowerCase().includes(ft) || i.description.toLowerCase().includes(ft));
    wrap.innerHTML = rows.length ? rows.map(i => `
      <div class="list-item" data-id="${i.id}">
        <div class="avatar">${esc((i.description[0] || '?').toUpperCase())}</div>
        <div class="main"><div class="title">${esc(i.description)}</div><div class="sub"><span class="tag">${esc(i.sku)}</span></div></div>
        <div class="end"><div style="font-weight:700">${fmtMoney(i.sellPrice)}</div><div class="sub">cost ${fmtMoney(i.costPrice)}</div></div>
      </div>
    `).join('') : `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('tag',40)}</div>No SKUs yet.<br>Tap the + button to create one.</div>`;
    $$('.list-item', wrap).forEach(el => el.onclick = () => openItemForm(items.find(i => i.id === el.dataset.id), () => render()));
  }
  draw('');
  $('#searchBox').oninput = (e) => draw(e.target.value);
  addFab('+', () => openItemForm(null, () => render()));
};

// onDone receives the saved item row — used both from this screen and from
// the "+ Add new" shortcut when searching for an item during purchase/billing.
function openItemForm(existing, onDone) {
  const isEdit = !!(existing && existing.id);
  const sheet = openSheet(`
    <h2>${isEdit ? 'Edit SKU' : 'New SKU'}</h2>
    <label>SKU code *</label><input id="sku" value="${esc(existing?.sku || '')}" style="text-transform:uppercase" placeholder="e.g. SAREE-001" />
    <label>Description *</label><input id="description" value="${esc(existing?.description || '')}" placeholder="e.g. Banarasi Silk Saree — Maroon" />
    <div class="grid-2">
      <div><label>Cost price</label><input id="costPrice" type="number" inputmode="decimal" value="${existing?.costPrice ?? ''}" /></div>
      <div><label>Sell price</label><input id="sellPrice" type="number" inputmode="decimal" value="${existing?.sellPrice ?? ''}" /></div>
    </div>
    ${isEdit ? `<div class="row between" style="margin-top:10px"><span>Active (shown when searching)</span><input type="checkbox" id="active" ${existing.active !== false ? 'checked' : ''} style="width:auto" /></div>` : ''}
    <button class="btn" id="save" style="margin-top:14px">Save</button>
  `);
  $('#costPrice', sheet).oninput = () => {
    if (!$('#sellPrice', sheet).dataset.touched) {
      $('#sellPrice', sheet).value = round2((parseFloat($('#costPrice', sheet).value) || 0) * (1 + SETTINGS.markupPercent / 100));
    }
  };
  $('#sellPrice', sheet).oninput = () => { $('#sellPrice', sheet).dataset.touched = '1'; };
  $('#save', sheet).onclick = async () => {
    const sku = $('#sku', sheet).value.trim();
    const description = $('#description', sheet).value.trim();
    if (!sku || !description) { toast('SKU and description are required'); return; }
    try {
      let row;
      if (isEdit) {
        row = await updateItem(existing, {
          sku, description,
          costPrice: parseFloat($('#costPrice', sheet).value) || 0,
          sellPrice: parseFloat($('#sellPrice', sheet).value) || 0,
          active: $('#active', sheet).checked
        });
      } else {
        row = await addItem({ sku, description, costPrice: $('#costPrice', sheet).value, sellPrice: $('#sellPrice', sheet).value });
      }
      closeSheet();
      onDone && onDone(row);
    } catch (err) {
      toast(err.message || 'Could not save SKU');
    }
  };
}
