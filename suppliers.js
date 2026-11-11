/* ============================================================
   suppliers.js — Suppliers master list + the add/edit form.
   (Vendor billing itself — invoices, payments, returns — lives
   in vendors.js; this file is just the supplier directory.)
   ============================================================ */

SCREENS.suppliersList = async (view) => {
  setTitle('Suppliers');
  const suppliers = await listSuppliers();
  view.innerHTML = suppliers.length ? suppliers.map(s => `
    <div class="list-item" data-id="${s.id}"><div class="avatar">${esc(s.name[0]?.toUpperCase())}</div>
    <div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${esc(s.phone || '')}</div></div></div>
  `).join('') : `<div class="empty">No suppliers yet.</div>`;
  $$('.list-item', view).forEach(el => el.onclick = () => Nav.push('supplierDetail', { supplierId: el.dataset.id }));
  addFab('+', () => openSupplierForm(null, () => render()));
};

function openSupplierForm(existing, onDone) {
  const isEdit = !!(existing && existing.id);
  const sheet = openSheet(`
    <h2>${isEdit ? 'Edit supplier' : 'Add supplier'}</h2>
    <label>Name *</label><input id="name" value="${esc(existing?.name || '')}" />
    <label>Phone</label><input id="phone" value="${esc(existing?.phone || '')}" />
    <label>Notes</label><textarea id="notes">${esc(existing?.notes || '')}</textarea>
    <button class="btn" id="save" style="margin-top:10px">Save</button>
  `);
  $('#save', sheet).onclick = async () => {
    const name = $('#name', sheet).value.trim();
    if (!name) { toast('Name is required'); return; }
    let row;
    if (isEdit) {
      row = { ...existing, name, phone: $('#phone', sheet).value, notes: $('#notes', sheet).value };
      await DB.put('suppliers', row);
    } else {
      row = await addSupplier({ name, phone: $('#phone', sheet).value, notes: $('#notes', sheet).value });
    }
    closeSheet();
    onDone && onDone(row);
  };
}
