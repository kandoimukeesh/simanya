/* ============================================================
   items.js — the Item / SKU Master: created and edited manually
   by the user. Every purchase batch (inventory.js) and every bill
   line (sell.js) refers to one of these records.

   SKU = Vendor Code (3 letters, from the item's vendor) + Item Type
   Code (3 letters) + a 6-character alphanumeric free-text code —
   all composed automatically as the user picks/types each part.
   Also holds the lightweight Item Types master (the 3-letter
   middle segment of the SKU) and its own picker/management screen.
   ============================================================ */

SCREENS.itemsList = async (view) => {
  setTitle('Item Master');
  const [items, suppliers, itemTypes] = await Promise.all([listItems(), listSuppliers(), listItemTypes()]);
  const supplierById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const typeById = Object.fromEntries(itemTypes.map(t => [t.id, t]));
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
    wrap.innerHTML = rows.length ? rows.map(i => {
      const isService = itemCategory(i) === 'service';
      return `
      <div class="list-item" data-id="${i.id}">
        <div class="avatar">${esc((i.description[0] || '?').toUpperCase())}</div>
        <div class="main"><div class="title">${esc(i.description)}</div>
          <div class="sub"><span class="tag">${esc(i.sku)}</span> ${isService ? `<span class="badge neutral" style="font-weight:400">Service / Raw material</span>` : ''}</div>
        </div>
        <div class="end"><div style="font-weight:700">${fmtMoney(i.sellPrice)}</div><div class="sub">cost ${fmtMoney(i.costPrice)}</div></div>
      </div>
    `; }).join('') : `<div class="empty"><div class="big" style="color:var(--gold-deep)">${icon('tag',40)}</div>No SKUs yet.<br>Tap the + button to create one.</div>`;
    $$('.list-item', wrap).forEach(el => el.onclick = () => openItemForm(items.find(i => i.id === el.dataset.id), () => render()));
  }
  draw('');
  $('#searchBox').oninput = (e) => draw(e.target.value);
  addFab('+', () => openItemForm(null, () => render()));
};

// onDone receives the saved item row — used both from this screen and from the
// "+ Add new" shortcut when searching for an item during purchase/billing.
function openItemForm(existing, onDone) {
  const isEdit = !!(existing && existing.id);
  const st = {
    vendor: null, itemType: null,
    freeCode: existing?.freeCode || '',
    description: existing?.description || '',
    costPrice: existing?.costPrice ?? '',
    wholesalePrice: existing?.wholesalePrice ?? '',
    sellPrice: existing?.sellPrice ?? '',
    category: existing && existing.category === 'service' ? 'service' : 'trading',
    active: existing ? existing.active !== false : true,
    wholesaleTouched: isEdit, sellTouched: isEdit // don't auto-overwrite an existing item's saved prices
  };

  async function init() {
    if (isEdit) {
      [st.vendor, st.itemType] = await Promise.all([
        existing.vendorId ? DB.get('suppliers', existing.vendorId) : null,
        existing.itemTypeId ? DB.get('itemTypes', existing.itemTypeId) : null
      ]);
    }
    draw();
  }

  function draw() {
    const sku = (st.vendor && st.itemType && /^[A-Z0-9]{6}$/.test(st.freeCode))
      ? composeSku(st.vendor.vendorCode, st.itemType.code, st.freeCode)
      : (existing?.sku || '—— pick vendor, item type & a 6-char code ——');
    const sheet = openSheet(`
      <h2>${isEdit ? 'Edit SKU' : 'New SKU'}</h2>
      <label>Vendor *</label>
      <button class="btn secondary" id="pickVendor" style="width:100%;text-align:left">${st.vendor ? `${esc(st.vendor.name)} <span class="tag">${esc(st.vendor.vendorCode)}</span>` : 'Select vendor…'}</button>
      <label style="margin-top:10px">Item type *</label>
      <button class="btn secondary" id="pickType" style="width:100%;text-align:left">${st.itemType ? `${esc(st.itemType.description)} <span class="tag">${esc(st.itemType.code)}</span>` : 'Select item type…'}</button>
      <label style="margin-top:10px">Free code * — 6 alphanumeric characters</label>
      <input id="freeCode" value="${esc(st.freeCode)}" maxlength="6" style="text-transform:uppercase;max-width:160px" placeholder="e.g. 000123" />
      <p class="helptext">SKU: <b>${esc(sku)}</b></p>

      <label style="margin-top:4px">Description *</label><input id="description" value="${esc(st.description)}" placeholder="e.g. Kurta Pant — Maroon" />

      <div class="grid-3">
        <div><label>Cost price</label><input id="costPrice" type="number" inputmode="decimal" value="${st.costPrice}" /></div>
        <div><label>Wholesale price</label><input id="wholesalePrice" type="number" inputmode="decimal" value="${st.wholesalePrice}" /></div>
        <div><label>Selling price</label><input id="sellPrice" type="number" inputmode="decimal" value="${st.sellPrice}" /></div>
      </div>

      <label style="margin-top:10px">Category</label>
      <div class="btn-row">
        <button class="btn ${st.category==='trading'?'':'secondary'} sm" id="catTrading">Trading Item</button>
        <button class="btn ${st.category==='service'?'':'secondary'} sm" id="catService">Raw material / Service Charges</button>
      </div>

      ${isEdit ? `<div class="row between" style="margin-top:10px"><span>Active (shown when searching)</span><input type="checkbox" id="active" ${st.active ? 'checked' : ''} style="width:auto" /></div>` : ''}
      <button class="btn" id="save" style="margin-top:14px">Save</button>
    `);

    $('#pickVendor', sheet).onclick = async () => {
      const suppliers = await listSuppliers();
      closeSheet();
      openSearchOrAddSheet({
        title: 'Select vendor',
        items: suppliers,
        searchText: (s) => `${s.name} ${s.vendorCode || ''}`,
        renderItem: (s) => `<div class="avatar">${esc(s.name[0]?.toUpperCase())}</div><div class="main"><div class="title">${esc(s.name)}</div><div class="sub"><span class="tag">${esc(s.vendorCode||'')}</span></div></div>`,
        onPick: (s) => { st.vendor = s; draw(); },
        onAddNew: (prefill) => openSupplierForm({ name: prefill }, (row) => { st.vendor = row; draw(); })
      });
    };
    $('#pickType', sheet).onclick = async () => {
      const types = await listItemTypes();
      closeSheet();
      openSearchOrAddSheet({
        title: 'Select item type',
        items: types,
        searchText: (t) => `${t.description} ${t.code}`,
        renderItem: (t) => `<div class="avatar">${esc(t.code[0])}</div><div class="main"><div class="title">${esc(t.description)}</div><div class="sub"><span class="tag">${esc(t.code)}</span></div></div>`,
        emptyHint: 'No match. Tap "Add new" to create this item type.',
        onPick: (t) => { st.itemType = t; draw(); },
        onAddNew: (prefill) => openItemTypeForm(prefill, (row) => { st.itemType = row; draw(); })
      });
    };
    $('#freeCode', sheet).oninput = (e) => { st.freeCode = e.target.value.toUpperCase(); e.target.value = st.freeCode; $('p.helptext', sheet).innerHTML = `SKU: <b>${esc((st.vendor && st.itemType && /^[A-Z0-9]{6}$/.test(st.freeCode)) ? composeSku(st.vendor.vendorCode, st.itemType.code, st.freeCode) : '—— pick vendor, item type & a 6-char code ——')}</b>`; };
    $('#description', sheet).oninput = (e) => { st.description = e.target.value; };
    $('#costPrice', sheet).oninput = (e) => {
      st.costPrice = e.target.value;
      if (!st.wholesaleTouched) { st.wholesalePrice = round2((parseFloat(st.costPrice) || 0) * (1 + SETTINGS.wholesaleMarkupPercent / 100)); $('#wholesalePrice', sheet).value = st.wholesalePrice; }
      if (!st.sellTouched) { st.sellPrice = round2((parseFloat(st.costPrice) || 0) * (1 + SETTINGS.markupPercent / 100)); $('#sellPrice', sheet).value = st.sellPrice; }
    };
    $('#wholesalePrice', sheet).oninput = (e) => { st.wholesalePrice = e.target.value; st.wholesaleTouched = true; };
    $('#sellPrice', sheet).oninput = (e) => { st.sellPrice = e.target.value; st.sellTouched = true; };
    $('#catTrading', sheet).onclick = () => { st.category = 'trading'; closeSheet(); draw(); };
    $('#catService', sheet).onclick = () => { st.category = 'service'; closeSheet(); draw(); };
    $('#active', sheet)?.addEventListener('change', (e) => { st.active = e.target.checked; });

    $('#save', sheet).onclick = async () => {
      if (!st.description.trim()) { toast('Description is required'); return; }
      try {
        let row;
        if (isEdit) {
          row = await updateItem(existing, {
            description: st.description.trim(),
            vendor: st.vendor || undefined, itemType: st.itemType || undefined, freeCode: st.freeCode || undefined,
            costPrice: parseFloat(st.costPrice) || 0,
            wholesalePrice: parseFloat(st.wholesalePrice) || 0,
            sellPrice: parseFloat(st.sellPrice) || 0,
            category: st.category,
            active: st.active
          });
        } else {
          row = await addItem({
            description: st.description.trim(),
            vendor: st.vendor, itemType: st.itemType, freeCode: st.freeCode,
            costPrice: st.costPrice, wholesalePrice: st.wholesalePrice, sellPrice: st.sellPrice,
            category: st.category
          });
        }
        closeSheet();
        onDone && onDone(row);
      } catch (err) {
        toast(err.message || 'Could not save SKU');
      }
    };
  }

  init();
}

/* ============================================================
   ITEM TYPES — management screen (More ▸ Item Types) + the small
   inline add/edit form reused from the Item Master vendor-style picker.
   ============================================================ */
SCREENS.itemTypesList = async (view) => {
  setTitle('Item Types');
  const types = await listItemTypes();
  view.innerHTML = types.length ? types.map(t => `
    <div class="list-item" data-id="${t.id}"><div class="avatar">${esc(t.code[0])}</div>
    <div class="main"><div class="title">${esc(t.description)}</div><div class="sub"><span class="tag">${esc(t.code)}</span></div></div></div>
  `).join('') : `<div class="empty">No item types yet.<br>Tap + to create one (e.g. "Kurta Pant" → KPN).</div>`;
  $$('.list-item', view).forEach(el => el.onclick = () => openItemTypeForm(null, () => render(), types.find(t => t.id === el.dataset.id)));
  addFab('+', () => openItemTypeForm(null, () => render()));
};

// prefillDescription: a typed search query carried over from an "Add new" shortcut.
// existing: pass to edit an existing item type instead of creating one.
function openItemTypeForm(prefillDescription, onDone, existing) {
  const isEdit = !!(existing && existing.id);
  const sheet = openSheet(`
    <h2>${isEdit ? 'Edit item type' : 'New item type'}</h2>
    <label>Description *</label><input id="description" value="${esc(existing?.description || prefillDescription || '')}" placeholder="e.g. Kurta Pant" />
    <label>Code * — 3 letters</label><input id="code" value="${esc(existing?.code || '')}" maxlength="3" style="text-transform:uppercase;max-width:120px" placeholder="e.g. KPN" />
    <button class="btn" id="save" style="margin-top:10px">Save</button>
  `);
  $('#save', sheet).onclick = async () => {
    try {
      let row;
      if (isEdit) {
        row = await updateItemType(existing, { description: $('#description', sheet).value.trim(), code: $('#code', sheet).value });
      } else {
        row = await addItemType({ description: $('#description', sheet).value.trim(), code: $('#code', sheet).value });
      }
      closeSheet();
      onDone && onDone(row);
    } catch (err) {
      toast(err.message || 'Could not save item type');
    }
  };
}
