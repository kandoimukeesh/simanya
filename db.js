/* ============================================================
   db.js — IndexedDB wrapper for the Apparel Inventory & Billing app
   Fully offline, on-device storage. No server, no network required.

   v3 schema change: the old per-piece "inventoryItems" (one record
   per physical tag, OCR-decoded) is replaced by "inventoryBatches"
   (one record per purchase-invoice line: an item/SKU + a quantity),
   and a new "items" store holds the manually-created SKU master.
   Upgrading from the old v1 database wipes the old transactional
   stores (inventory/vendor invoices/customer invoices) since their
   shape changed completely — suppliers and customers are kept.

   v3 schema change: adds the "creditNotes" store — a customer return
   now issues a numbered ₹ credit note (separate from Loyalty points)
   that can be applied toward one or more future bills. Purely
   additive; no existing data is touched.
   ============================================================ */

const DB_NAME = 'apparelBizDB';
const DB_VERSION = 3;

const STORES = {
  settings:        { keyPath: 'id' },
  suppliers:       { keyPath: 'id', indexes: [['name', 'name', { unique: false }]] },
  customers:       { keyPath: 'id', indexes: [['name', 'name', { unique: false }], ['phone', 'phone', { unique: false }]] },
  items:           { keyPath: 'id', indexes: [['sku', 'sku', { unique: true }], ['description', 'description', { unique: false }]] },
  inventoryBatches:{ keyPath: 'id', indexes: [
                        ['itemId', 'itemId', { unique: false }],
                        ['supplierId', 'supplierId', { unique: false }],
                        ['status', 'status', { unique: false }],
                        ['invoiceKey', 'invoiceKey', { unique: false }]
                      ] },
  vendorInvoices:  { keyPath: 'id', indexes: [['supplierId', 'supplierId', { unique: false }], ['invoiceKey', 'invoiceKey', { unique: true }]] },
  customerInvoices:{ keyPath: 'id', indexes: [['customerId', 'customerId', { unique: false }], ['billNumber', 'billNumber', { unique: true }], ['date', 'date', { unique: false }]] },
  // v3 (schema v3): a customer return issues one of these — a running ₹ credit,
  // separate from Loyalty points, that can later be applied (in full or in part,
  // across one or more future bills) toward that customer's next purchase(s).
  creditNotes:     { keyPath: 'id', indexes: [
                        ['customerId', 'customerId', { unique: false }],
                        ['invoiceId', 'invoiceId', { unique: false }],
                        ['status', 'status', { unique: false }]
                      ] },
  counters:        { keyPath: 'id' }
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const upgradeTx = e.target.transaction;

      Object.entries(STORES).forEach(([name, cfg]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(([idxName, keyPath, opts]) => store.createIndex(idxName, keyPath, opts));
        }
      });

      // Coming from the old per-piece/OCR schema (v1): the shape of
      // inventory + invoices changed completely, so start those clean.
      // Suppliers and customers are untouched.
      if (e.oldVersion > 0 && e.oldVersion < 2) {
        ['vendorInvoices', 'customerInvoices'].forEach(n => {
          if (db.objectStoreNames.contains(n)) upgradeTx.objectStore(n).clear();
        });
        if (db.objectStoreNames.contains('inventoryItems')) db.deleteObjectStore('inventoryItems');
        if (db.objectStoreNames.contains('customerPayments')) db.deleteObjectStore('customerPayments');
      }
      // v2 -> v3: purely additive (the new `creditNotes` store, created above by
      // the generic loop) — no existing data is touched or cleared.
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async put(storeName, obj) {
    // Stamp every write with createdAt/updatedAt so an incremental backup
    // can later filter "what changed since my last export".
    if (obj && typeof obj === 'object') {
      if (obj.createdAt == null) obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
    }
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put(obj);
      r.onsuccess = () => resolve(obj);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.delete(id);
      r.onsuccess = () => resolve(true);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async all(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async byIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const r = idx.getAll(value);
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    await Promise.all(names.map(n => new Promise((resolve, reject) => {
      const req = db.transaction(n, 'readwrite').objectStore(n).clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    })));
  },

  async exportAll() {
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    const out = {};
    for (const n of names) out[n] = await DB.all(n);
    out.__exportedAt = new Date().toISOString();
    out.__version = DB_VERSION;
    return out;
  },

  // Only records touched since `sinceMs` (by updatedAt) — for the "export
  // changes since last backup" option. Every store is still included (even
  // if empty) so an incremental file imports cleanly like a full one.
  async exportSince(sinceMs) {
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    const out = {};
    for (const n of names) {
      const rows = await DB.all(n);
      out[n] = sinceMs ? rows.filter(r => (r && r.updatedAt || 0) > sinceMs) : rows;
    }
    out.__exportedAt = new Date().toISOString();
    out.__version = DB_VERSION;
    out.__incremental = true;
    out.__since = sinceMs || null;
    return out;
  },

  // Always upserts by id (store.put), so importing the same backup twice,
  // or an incremental file on top of a full one, never creates duplicates.
  async importAll(data, { replace = false } = {}) {
    if (replace) await DB.clearAll();
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    for (const n of names) {
      const rows = data[n];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) await DB.put(n, row);
    }
  }
};

function uid(prefix = '') {
  return (prefix ? prefix + '_' : '') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

async function nextSeq(id) {
  const store = await tx('counters', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => {
      const cur = r.result ? r.result.value : 0;
      const next = cur + 1;
      const w = store.put({ id, value: next });
      w.onsuccess = () => resolve(next);
      w.onerror = (e) => reject(e.target.error);
    };
    r.onerror = (e) => reject(e.target.error);
  });
}

window.DB = DB;
window.uid = uid;
window.nextSeq = nextSeq;
