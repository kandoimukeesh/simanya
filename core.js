/* ============================================================
   core.js — shared shell: DOM helpers, navigation, sheets/toasts,
   and the PIN lock.

   This file is infrastructure used by every feature module. It does
   NOT contain any screen or business logic for a specific module —
   those live in their own files (home.js, items.js, inventory.js,
   vendors.js, sell.js, dashboard.js, backup.js, settings.js,
   suppliers.js, customers.js) so that changing one feature only
   touches one file.
   ============================================================ */

/* ---------- tiny DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- icon set ----------
   A small hand-drawn line-icon set (no emoji, no external icon font —
   stays fully offline and renders identically everywhere) used by every
   screen module via icon('name'). Icons inherit color from their
   container (stroke/fill: currentColor) so they pick up the gold/ink
   theme automatically. */
const ICONS = {
  home: `<path d="M4 11 12 4 20 11"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>`,
  box: `<rect x="4" y="8" width="16" height="12" rx="1.5"/><path d="M4 8l8-4 8 4"/><path d="M12 8v12"/>`,
  invoice: `<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
  factory: `<path d="M3 21V11l5 3v-4l5 3V9l6 4v8"/><path d="M3 21h16"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  back: `<polyline points="15,18 9,12 15,6"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><g stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="21.5" y2="12"/><line x1="5.1" y1="5.1" x2="7.2" y2="7.2"/><line x1="16.8" y1="16.8" x2="18.9" y2="18.9"/><line x1="5.1" y1="18.9" x2="7.2" y2="16.8"/><line x1="16.8" y1="7.2" x2="18.9" y2="5.1"/></g>`,
  tag: `<polygon points="4,10 11,3 20,3 20,12 13,19"/><circle cx="15.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/>`,
  person: `<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>`,
  chart: `<rect x="4" y="12" width="3.5" height="8" fill="currentColor" stroke="none"/><rect x="10.2" y="7" width="3.5" height="13" fill="currentColor" stroke="none"/><rect x="16.4" y="3" width="3.5" height="17" fill="currentColor" stroke="none"/>`,
  backup: `<path d="M12 3v12"/><polyline points="7,10 12,15 17,10"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>`,
  lock: `<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  close: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
  star: `<polygon points="12,3 14.7,9.2 21.5,9.8 16.3,14.2 17.9,21 12,17.3 6.1,21 7.7,14.2 2.5,9.8 9.3,9.2" fill="currentColor" stroke="none"/>`,
  doc: `<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>`,
  warning: `<path d="M12 3 22 20H2Z"/><line x1="12" y1="9" x2="12" y2="13.5"/><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/>`,
  undo: `<path d="M8 7 3 12l5 5"/><path d="M3 12h11a6 6 0 0 1 0 12h-1"/>`,
  up: `<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6,11 12,5 18,11"/>`,
  down: `<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6,13 12,19 18,13"/>`,
};
function icon(name, size = 20) {
  return `<svg class="ico-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

let SETTINGS = null; // populated by data.js's loadSettings(), read everywhere

/* ---------- formatting helpers ---------- */
function fmtMoney(n) {
  const v = Number(n || 0);
  return `${SETTINGS?.currencySymbol || '₹'}${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
// Compact Indian-style money for tight spaces (chart value labels): ₹45k, ₹1.2L, ₹2.3Cr.
function fmtCompact(n) {
  const v = Number(n || 0);
  const sym = SETTINGS?.currencySymbol || '₹';
  const av = Math.abs(v);
  if (av >= 1e7) return sym + (v / 1e7).toFixed(av % 1e7 === 0 ? 0 : 1) + 'Cr';
  if (av >= 1e5) return sym + (v / 1e5).toFixed(av % 1e5 === 0 ? 0 : 1) + 'L';
  if (av >= 1e3) return sym + (v / 1e3).toFixed(av % 1e3 === 0 ? 0 : 1) + 'k';
  return sym + Math.round(v);
}
// Renders a small, elegant inline-SVG bar chart (no external chart library —
// stays fully offline). `items` is [{ label, value }]; set highlightIndex to
// draw one bar (e.g. "today" or the current month) in the ink/dark accent.
function renderBarChart(items, { highlightIndex = -1, height = 108 } = {}) {
  const W = 300, H = height, padBottom = 18, padTop = 16;
  const n = Math.max(1, items.length);
  const maxVal = Math.max(1, ...items.map(d => Number(d.value) || 0));
  const unit = W / n;
  const barW = unit * 0.56;
  const bars = items.map((d, i) => {
    const x = i * unit + (unit - barW) / 2;
    const v = Number(d.value) || 0;
    const barH = Math.round(((H - padBottom - padTop) * v) / maxVal);
    const y = H - padBottom - Math.max(barH, v > 0 ? 2 : 0);
    const isHi = i === highlightIndex;
    return `<rect class="bar${isHi ? ' today' : ''}" x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${Math.max(barH, v > 0 ? 2 : 0)}" rx="2"></rect>` +
      (v > 0 ? `<text class="bar-value" x="${(x + barW / 2).toFixed(1)}" y="${Math.max(10, y - 4)}" text-anchor="middle">${fmtCompact(v)}</text>` : '') +
      `<text class="bar-label" x="${(x + barW / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(d.label)}</text>`;
  }).join('');
  return `<svg class="bar-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">` +
    `<line class="baseline" x1="0" y1="${H - padBottom}" x2="${W}" y2="${H - padBottom}"></line>${bars}</svg>`;
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysSince(dateStr) {
  if (!dateStr) return 0;
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayISO() + 'T00:00:00');
  return Math.max(0, Math.round((b - a) / 86400000));
}
function ddmmyyyy(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}
function invoiceKeyOf(supplierId, invoiceNumber) {
  return supplierId + '::' + String(invoiceNumber || '').trim().toUpperCase();
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function objectUrl(blob) { return blob ? URL.createObjectURL(blob) : ''; }

// Shares a file via the phone's native share sheet (so it can go straight to
// WhatsApp, Drive, email, etc.) when available, falling back to a plain
// browser download otherwise. Used by backup exports and by pdf.js's
// invoice/credit-note PDFs. Returns 'shared' | 'downloaded' | 'cancelled'
// (the caller decides what follow-up — a toast, saving a timestamp — to do).
async function shareOrDownloadFile(blob, filename, { title, text } = {}) {
  const canShareFiles = !!(navigator.canShare && navigator.share);
  if (canShareFiles) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || filename, text: text || '' });
        return 'shared';
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // otherwise fall through to the plain download below
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  return 'downloaded';
}

function toast(msg, ms = 2400) {
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- sheet (bottom modal) ---------- */
function openSheet(innerHTML, { onMount } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet"><div class="sheet-handle"></div>${innerHTML}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
  $('#modalRoot').appendChild(backdrop);
  if (onMount) onMount(backdrop.querySelector('.sheet'));
  return backdrop;
}
function closeSheet() { $$('.sheet-backdrop').forEach(n => n.remove()); }

/* ---------- generic "search existing or add new" picker sheet ----------
   Used by supplier pick (inventory.js), customer pick (sell.js), item/SKU
   pick (inventory.js + sell.js's line-item search), and anywhere else that
   needs a dynamic type-to-search-then-pick list.
   `searchText` picks what field of each item the typed query matches
   against — defaults to `.name` (suppliers/customers); pass a function to
   search something else (e.g. an item's description + SKU code). Pass
   `onAddNew: null` to hide the "+ Add new" button entirely (e.g. when
   picking an existing SKU to bill and new ones are only ever created
   from the Item Master screen). */
function openSearchOrAddSheet({ title, items, renderItem, onPick, onAddNew, searchText, placeholder, emptyHint }) {
  const getText = searchText || ((i) => i.name || '');
  const sheet = openSheet(`
    <h2>${esc(title)}</h2>
    <input id="q" placeholder="${esc(placeholder || 'Search or type new name…')}" />
    <div class="search-list" id="list"></div>
    ${onAddNew ? `<button class="btn" id="addNewBtn" style="margin-top:10px">+ Add new</button>` : ''}
  `);
  const listEl = $('#list', sheet);
  function draw(q) {
    const ft = (q || '').toLowerCase();
    const rows = items.filter(i => !ft || getText(i).toLowerCase().includes(ft));
    listEl.innerHTML = rows.length ? rows.map(i => `<div class="list-item" data-id="${i.id}">${renderItem(i)}</div>`).join('') : `<div class="empty" style="padding:16px">${esc(emptyHint || 'No match.')}</div>`;
    $$('.list-item', listEl).forEach(el => el.onclick = () => { closeSheet(); onPick(items.find(i => i.id === el.dataset.id)); });
  }
  draw('');
  $('#q', sheet).oninput = (e) => draw(e.target.value);
  if (onAddNew) $('#addNewBtn', sheet).onclick = () => { const prefill = $('#q', sheet).value; closeSheet(); onAddNew(prefill); };
}

/* ---------- Navigation (stack based) ---------- */
const Nav = {
  stack: [{ name: 'home', params: {} }],
  push(name, params = {}) { this.stack.push({ name, params }); render(); },
  pop() { if (this.stack.length > 1) { this.stack.pop(); render(); } },
  setRoot(name, params = {}) { this.stack = [{ name, params }]; render(); },
  current() { return this.stack[this.stack.length - 1]; },
  rootName() { return this.stack[0].name; }
};
const ROOT_ROUTES = ['home', 'inventory', 'sell', 'vendors', 'more'];

function setTitle(t) { $('#pageTitle').textContent = t; }

// Every screen module registers itself into this shared object, e.g. SCREENS.sell = async (view, params) => {...}
const SCREENS = {};

async function render() {
  const { name, params } = Nav.current();
  $('#backBtn').style.visibility = Nav.stack.length > 1 ? 'visible' : 'hidden';
  $$('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.route === Nav.rootName()));
  const view = $('#view');
  view.innerHTML = '<div class="empty">Loading…</div>';
  const fn = SCREENS[name] || SCREENS.home;
  await fn(view, params);
  view.scrollTop = 0;
}

function addFab(icon, onClick) {
  removeFab();
  const b = document.createElement('button');
  b.className = 'fab'; b.id = 'globalFab'; b.textContent = icon;
  b.onclick = onClick;
  $('#app').appendChild(b);
}
function removeFab() { $('#globalFab')?.remove(); }

// A plain camera-photo helper is still useful for optional reference
// photos (e.g. alteration photos on a sale) even though tag-OCR capture
// is gone. Returns { blob } or null if cancelled/unavailable.
async function openCamera({ hint = 'Take a photo', guides = false } = {}) {
  return new Promise(async (resolve) => {
    const modal = document.createElement('div');
    modal.className = 'camera-modal';
    modal.innerHTML = `
      <div class="camera-topbar"><button id="camClose">${icon('close', 14)} Close</button><span></span></div>
      <video id="camVideo" autoplay playsinline muted></video>
      <div class="capture-hint">${esc(hint)}</div>
      <div class="camera-controls">
        <div style="width:50px"></div>
        <button class="shutter-btn" id="camShutter"></button>
        <div style="width:50px"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const video = $('#camVideo', modal);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
    } catch (err) {
      modal.remove();
      toast('Camera unavailable: ' + err.message);
      resolve(null);
      return;
    }
    function cleanup() { stream.getTracks().forEach(t => t.stop()); modal.remove(); }
    $('#camClose', modal).onclick = () => { cleanup(); resolve(null); };
    $('#camShutter', modal).onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob((blob) => { cleanup(); resolve({ blob, canvas }); }, 'image/jpeg', 0.85);
    };
  });
}

/* ============================================================
   PIN LOCK
   ============================================================ */
function showPinLock(correctPin, onUnlock) {
  let entered = '';
  const wrap = document.createElement('div');
  wrap.className = 'pin-screen';
  function draw() {
    wrap.innerHTML = `
      <div style="color:var(--gold-deep)">${icon('lock', 40)}</div>
      <h2>Enter PIN</h2>
      <div class="pin-dots">${Array.from({length: correctPin.length}).map((_,i)=>`<div class="pin-dot ${i<entered.length?'filled':''}"></div>`).join('')}</div>
      <div class="pin-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="pin-key" data-n="${n}">${n}</button>`).join('')}
        <div></div><button class="pin-key" data-n="0">0</button><button class="pin-key" data-n="back">⌫</button>
      </div>
    `;
    $$('.pin-key', wrap).forEach(b => b.onclick = () => {
      if (b.dataset.n === 'back') entered = entered.slice(0, -1);
      else if (entered.length < correctPin.length) entered += b.dataset.n;
      if (entered.length === correctPin.length) {
        if (entered === correctPin) { wrap.remove(); onUnlock(); }
        else { toast('Wrong PIN'); entered = ''; draw(); }
      } else draw();
    });
  }
  draw();
  document.body.appendChild(wrap);
}

/* ============================================================
   BOOT (invoked from main.js, after every module has loaded)
   ============================================================ */
async function boot() {
  await loadSettings();
  $('#backBtn').innerHTML = icon('back', 19);
  $('#settingsBtn').innerHTML = icon('settings', 19);
  $$('.navbtn').forEach(b => { b.innerHTML = `${icon(b.dataset.icon, 21)}<span>${esc(b.textContent)}</span>`; });
  $('#backBtn').onclick = () => Nav.pop();
  $('#settingsBtn').onclick = () => Nav.push('settings');
  $$('.navbtn').forEach(b => b.onclick = () => Nav.setRoot(b.dataset.route));
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  const start = () => render();
  if (SETTINGS.pinLock) showPinLock(SETTINGS.pinLock, start); else start();
}
