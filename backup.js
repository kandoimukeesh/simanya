/* ============================================================
   backup.js — Backup & Restore screen.
   Everything about exporting/importing/wiping local data lives here.
   ============================================================ */

function lastBackupText() {
  if (!SETTINGS.lastBackupAt) return { text: 'Never backed up yet', warn: true };
  const days = Math.floor((Date.now() - SETTINGS.lastBackupAt) / 86400000);
  const text = days === 0 ? 'Backed up today' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago`;
  return { text, warn: days >= 7 };
}

SCREENS.backup = async (view) => {
  setTitle('Backup & Restore');
  removeFab();
  const lb = lastBackupText();
  const canShareFiles = !!(navigator.canShare && navigator.share);
  view.innerHTML = `
    <div class="card">
      <div class="row between" style="margin-bottom:8px">
        <span>${lb.text}</span>
        <span class="badge ${lb.warn ? 'warn' : 'ok'}">${lb.warn ? 'Back up now' : 'Up to date'}</span>
      </div>
      <p>All your data lives only on this device — export a backup regularly and save it somewhere safe, like Google Drive.
      ${canShareFiles ? ' Tapping export opens your phone\'s normal share sheet, so you can send it straight to Drive, Files, or email in one more tap.' : ''}</p>
      <button class="btn" id="doExport">${icon('down',14)} Export full backup (.json)</button>
      <button class="btn secondary" id="doExportDelta" style="margin-top:8px" ${SETTINGS.lastBackupAt ? '' : 'disabled'}>${icon('down',14)} Export changes since last backup</button>
      ${!SETTINGS.lastBackupAt ? '<p class="helptext">Do one full export first — after that, "changes since last backup" stays small and quick.</p>' : ''}
    </div>
    <div class="card">
      <p>Restore from a previously exported backup file (full or incremental — either kind merges safely). Matching IDs are overwritten with the file's data; nothing already saved under a different ID is ever lost or duplicated.</p>
      <input type="file" id="importFile" accept="application/json" />
      <button class="btn secondary" id="doImport" style="margin-top:10px">${icon('up',14)} Import backup</button>
    </div>
    <div class="card">
      <p style="color:var(--danger)">Danger zone: permanently erase all data on this device.</p>
      <button class="btn danger" id="doWipe">Erase all data</button>
    </div>
  `;
  $('#doExport').onclick = async () => {
    const data = await DB.exportAll();
    const filename = `stockbill-backup-${todayISO()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const outcome = await shareOrDownloadFile(blob, filename, { title: 'StockBill backup', text: `StockBill data backup — ${todayISO()}` });
    if (outcome === 'cancelled') return;
    await saveSettings({ lastBackupAt: Date.now() });
    if (outcome === 'shared') toast('Backup shared');
    Nav.setRoot('backup');
  };
  $('#doExportDelta').onclick = async () => {
    if (!SETTINGS.lastBackupAt) { toast('Do a full export first'); return; }
    const data = await DB.exportSince(SETTINGS.lastBackupAt);
    const rowCount = Object.keys(data).filter(k => !k.startsWith('__')).reduce((s, k) => s + (data[k]?.length || 0), 0);
    if (!rowCount) { toast('Nothing has changed since your last backup'); return; }
    const filename = `stockbill-incremental-${todayISO()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const outcome = await shareOrDownloadFile(blob, filename, { title: 'StockBill incremental backup', text: `StockBill changes since last backup — ${todayISO()} (${rowCount} record${rowCount===1?'':'s'})` });
    if (outcome === 'cancelled') return;
    await saveSettings({ lastBackupAt: Date.now() });
    toast(outcome === 'shared' ? 'Incremental backup shared' : `Exported ${rowCount} changed record${rowCount===1?'':'s'}`);
    Nav.setRoot('backup');
  };
  $('#doImport').onclick = async () => {
    const f = $('#importFile').files[0];
    if (!f) { toast('Choose a backup file first'); return; }
    const text = await f.text();
    try {
      const data = JSON.parse(text);
      await DB.importAll(data);
      toast('Backup imported');
      await loadSettings();
      Nav.setRoot('home');
    } catch (e) { toast('Invalid backup file'); }
  };
  $('#doWipe').onclick = async () => {
    if (!confirm('This will permanently delete ALL inventory, suppliers, customers and invoices on this device. Continue?')) return;
    await DB.clearAll();
    await loadSettings();
    toast('All data erased');
    Nav.setRoot('home');
  };
};
