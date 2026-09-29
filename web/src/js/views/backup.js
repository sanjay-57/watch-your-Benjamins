// Backups. Android: an automatic copy into a folder the user picks (daily / weekly / monthly,
// newest 10 kept), written when the app opens and the last copy is due. Everywhere: a reminder on
// Home when there has been no backup for a while, because uninstalling the app deletes its data.
import { $, esc } from '../core/util.js';
import { fmtShortDate, todayKey, keyOf } from '../core/dates.js';
import { store, setSettings, exportData, isReady } from '../core/store.js';
import { haptic, saveFile, shareFile, backupSupported, backupFolder, pickBackupFolder, writeBackupFile } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';

export { backupSupported };

const DAY = 86400000;
const EVERY = [[1, 'Daily'], [7, 'Weekly'], [30, 'Monthly']];

// ---------------------------------------------------------------- manual backup (Settings + Home reminder)
/** Save (or share) a backup file; stamps lastBackup on success. Resolves the bridge result. */
export async function backupNow({ share = false } = {}) {
  const name = `benjamins-backup-${todayKey()}.json`;
  const json = JSON.stringify(exportData());
  const r = share ? await shareFile(name, 'application/json', json) : await saveFile(name, 'application/json', json);
  if (r.ok) {
    setSettings({ lastBackup: Date.now() });
    if (!share) toast('Backup saved', { sub: r.name || name, icon: 'check-circle', tone: 'pos' });
  } else if (r.error !== 'cancelled') toast('Backup failed', { sub: r.error, icon: 'alert', tone: 'neg' });
  return r;
}

// ---------------------------------------------------------------- automatic backup (Android)
let running = false;

/** Write a backup into the chosen folder if one is due (or `force`). Resolves true when written. */
export async function runAutoBackup({ force = false } = {}) {
  const b = store.settings.autoBackup;
  if (!backupSupported || !b.on || running || !isReady() || (store.settings.demo && !force)) return false; // sample data is only backed up on request
  if (!force && Date.now() - b.last < b.every * DAY) return false;
  if (!store.txs.length && !force) return false;
  if (!backupFolder().set) {
    if (force) toast('Choose a backup folder first', { icon: 'alert', tone: 'warn' });
    return false;
  }
  running = true;
  try {
    const r = await writeBackupFile(`benjamins-auto-${todayKey()}.json`, JSON.stringify(exportData()));
    if (r.ok) {
      const now = Date.now();
      setSettings({ lastBackup: now, autoBackup: { ...store.settings.autoBackup, last: now } });
      if (force) toast('Backup saved', { sub: r.name, icon: 'check-circle', tone: 'pos' });
      return true;
    }
    toast('Automatic backup failed', { sub: `${r.error || 'unknown error'}. Check the folder in Settings`, icon: 'alert', tone: 'warn', duration: 6000 });
    return false;
  } finally {
    running = false;
  }
}

export function backupSummary() {
  const b = store.settings.autoBackup;
  if (!b.on) return 'Off';
  return EVERY.find(e => e[0] === b.every)?.[1] || 'On';
}

// ---------------------------------------------------------------- reminder (Home)
const SNOOZE_KEY = 'wyb-backup-snooze';
const snoozedUntil = () => { try { return +localStorage.getItem(SNOOZE_KEY) || 0; } catch { return 0; } };
export function snoozeBackupReminder(days = 7) { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * DAY)); } catch {} }

/** {days, never} when a reminder should show on Home, else null. */
export function backupNudge() {
  const s = store.settings;
  if (s.demo || store.txs.length < 10 || Date.now() < snoozedUntil()) return null;
  if (backupSupported && s.autoBackup.on && backupFolder().set) return null; // handled automatically
  const last = s.lastBackup || 0;
  if (!last) return Date.now() - (s.createdAt || 0) > 7 * DAY ? { never: true } : null;
  const days = Math.floor((Date.now() - last) / DAY);
  return days >= 14 ? { days } : null;
}

// ---------------------------------------------------------------- settings sheet (Android)
export function openBackupSheet() {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Automatic backup', subtitle: 'Saved into a folder you choose', content: body, size: 'full' });

  function render() {
    const b = store.settings.autoBackup;
    const f = backupFolder();
    const last = store.settings.lastBackup;
    body.innerHTML = `
      <div class="demo-banner glass" style="--tint:var(--accent-rgb)"><span class="mglyph" style="--c:var(--accent-rgb)">${icon('database')}</span>
        <div class="grow"><div class="t-headline">Don’t lose your data</div>
        <div class="t-foot t2">Your data lives only on this phone, and uninstalling the app deletes it. Pick a folder (Drive, Downloads, an SD card…) and a copy is saved there automatically. Only the newest 10 are kept. Nothing goes online from this app.</div></div></div>

      <div class="caps" style="padding:18px 6px 8px">Where and when</div>
      <div class="glass group">
        <div class="cell"><span class="cell-icon" style="--c:var(--m-cash-rgb)">${icon('file')}</span><span class="label">Folder<small>${f.set ? esc(f.name) : 'Not chosen yet'}</small></span>
          <button class="btn sm btn-plain press" data-act="pick">${f.set ? 'Change' : 'Choose'}</button></div>
        <div class="cell" style="flex-wrap:wrap"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('calendar')}</span><span class="label">How often</span>
          <div class="chip-wrap" style="margin-left:auto">${EVERY.map(([d, l]) => `<button class="chip" data-every="${d}" aria-pressed="${b.every === d}">${l}</button>`).join('')}</div></div>
        <div class="cell"><span class="cell-icon" style="--c:var(--warn-rgb)">${icon('download')}</span><span class="label">Automatic backup<small>${b.on && f.set ? 'Saved when you open the app and one is due' : 'Off'}</small></span>
          <button class="switch" role="switch" aria-checked="${b.on && f.set}" data-switch="on"></button></div>
      </div>
      ${b.on && !f.set ? '<div class="group-foot" style="color:var(--warn)">The folder is missing or access was removed. Choose it again.</div>' : ''}

      <div class="caps" style="padding:22px 6px 8px">Status</div>
      <div class="glass group">
        <div class="cell"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('check-circle')}</span><span class="label">Last backup<small>${last ? esc(fmtShortDate(keyOf(new Date(last)))) : 'Never'}</small></span></div>
        ${f.set ? `<button class="cell" data-act="now"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('upload')}</span><span class="label">Back up now</span></button>` : ''}
      </div>
      <div class="group-foot">Restore any copy from Settings → Restore from backup.</div>`;
  }

  body.addEventListener('click', async e => {
    const b = store.settings.autoBackup;
    const ev = e.target.closest('[data-every]');
    if (ev) { haptic('selection'); setSettings({ autoBackup: { ...b, every: +ev.dataset.every } }); render(); return; }
    if (e.target.closest('[data-act="pick"]') || (e.target.closest('[data-switch="on"]') && !b.on && !backupFolder().set)) {
      const r = await pickBackupFolder();
      if (r.ok && r.set) {
        haptic('success');
        setSettings({ autoBackup: { ...store.settings.autoBackup, on: true } });
        toast('Folder set', { sub: r.name, icon: 'check-circle', tone: 'pos' });
        runAutoBackup({ force: true });
      } else if (r.error && r.error !== 'cancelled') toast('Couldn’t use that folder', { sub: r.error, icon: 'alert', tone: 'warn' });
      render();
      return;
    }
    if (e.target.closest('[data-switch="on"]')) {
      haptic('selection');
      const on = !b.on;
      setSettings({ autoBackup: { ...b, on } }); // the folder is kept, so turning it back on is one tap
      render();
      return;
    }
    if (e.target.closest('[data-act="now"]')) { await runAutoBackup({ force: true }); render(); }
  });

  render();
  return sheet;
}
