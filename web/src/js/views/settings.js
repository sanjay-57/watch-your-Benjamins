import { $, esc, initials, debounce } from '../core/util.js';
import { money, currencyName, cur, decimalsOf } from '../core/money.js';
import { fmtShortDate, todayKey, keyOf } from '../core/dates.js';
import {
  store, setSettings, exportData, parseBackup, replaceAll, eraseAll, stats, account, category, changeCurrency,
} from '../core/store.js';
import { storageBytes, isPersisted, requestPersist } from '../core/db.js';
import { haptic, saveFile, shareFile, pickTextFile, platform, isStandalone, isIOSDevice, info as nativeInfo } from '../core/native.js';
import { openSheet } from '../ui/sheet.js';
import { toast, confirmDialog } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';
import { openCurrencyPicker, openCategoriesManager, openBudgetSheet, openRecurringManager } from './manage.js';
import { openPresetManager } from './presets.js';
import { openAutoLogSheet, autoLogSummary, smsSupported } from './autolog.js';
import { openBackupSheet, backupSummary, backupSupported, backupNow } from './backup.js';
import { setupLock, disableLock } from './lock.js';
import { NOTES, currentNote } from '../ui/notes.js';

const seg = (name, value, opts) => `<div class="seg" data-seg="${name}" style="height:36px;min-width:200px">
  <span class="seg-thumb"></span>${opts.map(([k, l]) => `<button data-v="${k}" aria-pressed="${value === k}">${l}</button>`).join('')}</div>`;

const sw = (name, on) => `<button class="switch" role="switch" aria-checked="${!!on}" data-switch="${name}"></button>`;

function csv() {
  const rows = [['Date', 'Time', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Note']];
  for (const t of [...store.txs].reverse()) {
    rows.push([t.date, t.time, t.type, (t.type === 'expense' ? -t.amount : t.amount) / cur().factor, store.settings.currency,
      account(t.accountId)?.name || '', account(t.toAccountId)?.name || '', category(t.categoryId)?.name || '', t.note]);
  }
  // text cells that start like a formula are prefixed so spreadsheets don't execute them
  const cell = (v, i) => {
    let s = String(v ?? '');
    if (i !== 3 && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

export function openSettings({ onThemeChange, restartOnboarding } = {}) {
  const body = document.createElement('div');
  const sheet = openSheet({ title: 'Settings', content: body, size: 'full', onClose: () => unsub() });
  // re-render after controls finish animating (switch thumbs, segment thumbs)
  const later = debounce(() => { if (body.isConnected) render(); }, 380);
  const unsub = store.subscribe(() => later());
  let persisted = null;
  isPersisted().then(p => { persisted = p; render(); });

  function render() {
    const s = store.settings;
    const st = stats();
    const kb = Math.max(1, Math.round(storageBytes() / 1024));
    const lastB = s.lastBackup ? fmtShortDate(keyOf(new Date(s.lastBackup))) : 'never';
    const ni = nativeInfo();
    body.innerHTML = `
      <div class="set-hero glass">
        <span class="avatar">${esc(initials(s.name)) || icon('user')}</span>
        <div class="grow"><h3 class="ellip">${esc(s.name || 'You')}</h3><p>${st.txCount} transactions${st.firstDate ? ` since ${esc(fmtShortDate(st.firstDate))}` : ''}</p></div>
        <button class="btn sm btn-plain press" data-act="name">Edit</button>
      </div>
      ${s.demo ? `<div class="demo-banner glass"><span class="mglyph" style="--c:var(--warn-rgb)">${icon('sparkles')}</span><div class="grow"><div class="t-headline">You’re exploring sample data</div><div class="t-foot t2">Start fresh when you’re ready to track your own money.</div></div><button class="btn sm glass tint press" style="--tint:var(--warn-rgb)" data-act="fresh">Start fresh</button></div>` : ''}
      ${platform === 'web' && !isStandalone ? `<div class="demo-banner glass" style="--tint:var(--accent-rgb)"><span class="mglyph" style="--c:var(--accent-rgb)">${icon('download')}</span><div class="grow"><div class="t-headline">Install the app</div><div class="t-foot t2">${isIOSDevice ? 'Tap Share, then “Add to Home Screen”. Install first — Safari tabs keep separate data.' : 'Use your browser menu → “Install app” for a full-screen, offline app.'}</div></div></div>` : ''}

      <div class="caps" style="padding:6px 6px 8px">General</div>
      <div class="glass group">
        <button class="cell" data-act="currency"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('globe')}</span><span class="label">Currency</span><span class="value">${esc(s.currency)} · ${esc(cur().symbol)}</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="budget"><span class="cell-icon" style="--c:var(--warn-rgb)">${icon('target')}</span><span class="label">Monthly budget</span><span class="value amt">${s.budget ? esc(money(s.budget)) : 'Off'}</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="categories"><span class="cell-icon" style="--c:var(--m-upi-rgb)">${icon('grid')}</span><span class="label">Categories</span><span class="value">${store.categories.length}</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="quickbtns"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('zap')}</span><span class="label">Quick buttons</span><span class="value">${store.presets.length}</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="recurring"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('repeat')}</span><span class="label">Recurring payments</span><span class="value">${store.recurring.filter(r => r.active).length || 'None'}</span>${icon('chev-r', 'chev')}</button>
        ${smsSupported ? `<button class="cell" data-act="autolog"><span class="cell-icon" style="--c:var(--m-upi-rgb)">${icon('upi')}</span><span class="label">Auto-log UPI<small>From your IOB SMS alerts</small></span><span class="value">${esc(autoLogSummary())}</span>${icon('chev-r', 'chev')}</button>` : ''}
      </div>

      <div class="caps" style="padding:22px 6px 8px">Appearance</div>
      <div class="glass group">
        <div class="cell" style="flex-wrap:wrap"><span class="cell-icon" style="--c:var(--m-card-rgb)">${icon('wallet')}</span><span class="label">Banknote<small>Colours printed from a real note</small></span>
          <div class="note-pick">${Object.entries(NOTES).map(([k, n]) => `<button class="press" data-note="${k}" aria-label="${esc(n.name)} theme" aria-pressed="${(NOTES[s.note] ? s.note : 'dollar') === k}"><span class="bill" style="--n-bg:${n.bg};--n-ink:${n.ink}">${esc(n.face)}</span>${esc(n.name)}</button>`).join('')}</div></div>
        <div class="cell"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('moon')}</span><span class="label">Theme</span>${seg('theme', s.theme, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
        <div class="cell"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('palette')}</span><span class="label">Accent</span>
          <div class="swatches">${currentNote().accents.map(([k, nm, dk, lt]) => `<button class="swatch" data-acc="${k}" aria-label="${nm}" aria-pressed="${(currentNote().accents.some(x => x[0] === s.accent) ? s.accent : 'greenback') === k}" style="--c:${document.documentElement.dataset.theme === 'light' ? lt : dk}"></button>`).join('')}</div></div>
        <div class="cell" style="flex-wrap:wrap"><span class="cell-icon" style="--c:var(--m-upi-rgb)">${icon('droplet')}</span><span class="label">Glass</span>${seg('glass', s.glass, [['liquid', 'Liquid'], ['frosted', 'Frosted'], ['solid', 'Solid']])}</div>
        <div class="cell"><span class="cell-icon" style="--c:var(--warn-rgb)">${icon('zap')}</span><span class="label">Reduce motion<small>Calmer animations, static background</small></span>${sw('motion', s.motion === 'reduced')}</div>
      </div>
      <div class="group-foot">“Liquid” adds real light refraction on Android. “Solid” is fastest on older phones.</div>

      <div class="caps" style="padding:22px 6px 8px">Privacy & feel</div>
      <div class="glass group">
        <div class="cell"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('eye-off')}</span><span class="label">Hide amounts on launch<small>Tap the eye on Home to reveal</small></span>${sw('hide', s.hideOnLaunch)}</div>
        <div class="cell"><span class="cell-icon" style="--c:var(--spend-rgb)">${icon('haptic')}</span><span class="label">Haptics</span>${sw('haptics', s.haptics)}</div>
        <div class="cell"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('lock')}</span><span class="label">App lock<small>4-digit passcode when opening</small></span>${sw('lock', !!s.lock)}</div>
      </div>

      <div class="caps" style="padding:22px 6px 8px">Your data</div>
      <div class="glass group">
        ${backupSupported ? `<button class="cell" data-act="autobackup"><span class="cell-icon" style="--c:var(--warn-rgb)">${icon('database')}</span><span class="label">Automatic backup<small>Saved to a folder you choose</small></span><span class="value">${esc(backupSummary())}</span>${icon('chev-r', 'chev')}</button>` : ''}
        <button class="cell" data-act="backup"><span class="cell-icon" style="--c:var(--accent-rgb)">${icon('download')}</span><span class="label">Back up now<small>Last backup: ${esc(lastB)}</small></span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="share-backup"><span class="cell-icon" style="--c:var(--m-cash-rgb)">${icon('share')}</span><span class="label">Send backup<small>WhatsApp, Drive, email…</small></span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="restore"><span class="cell-icon" style="--c:var(--xfer-rgb)">${icon('upload')}</span><span class="label">Restore from backup</span>${icon('chev-r', 'chev')}</button>
        <button class="cell" data-act="csv"><span class="cell-icon" style="--c:var(--pos-rgb)">${icon('file')}</span><span class="label">Export CSV<small>Opens in Excel / Sheets</small></span>${icon('chev-r', 'chev')}</button>
        <div class="cell"><span class="cell-icon" style="--c:var(--spend-rgb)">${icon('database')}</span><span class="label">On-device storage<small>${st.txCount} entries · ${kb} KB · ${platform !== 'web' ? 'private app storage' : persisted ? 'protected from cleanup' : 'standard'}</small></span>${platform === 'web' && persisted === false ? '<button class="btn sm btn-plain press" data-act="persist">Protect</button>' : ''}</div>
        <button class="cell danger" data-act="erase"><span class="cell-icon" style="--c:var(--neg-rgb)">${icon('trash')}</span><span class="label">Erase all data</span></button>
      </div>
      <div class="group-foot">Everything lives only on this phone. Back up regularly — uninstalling the app deletes its data.</div>

      <div class="about">
        <div style="font:700 15px var(--font-display);color:var(--t2)">Watch Your Benjamins</div>
        v${esc(typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1')}${ni.platform !== 'web' ? ` · ${esc(ni.platform)}` : ''} · offline · no ads · no tracking<br>
        Made with ${icon('heart', 'xs')} and a lot of glass.
      </div>`;
    body.querySelectorAll('[data-seg]').forEach(el => {
      const btn = el.querySelector('[aria-pressed="true"]');
      const th = el.querySelector('.seg-thumb');
      requestAnimationFrame(() => { if (!btn) return; th.style.width = btn.offsetWidth + 'px'; th.style.transform = `translate3d(${btn.offsetLeft}px,0,0)`; });
    });
  }

  body.addEventListener('click', async e => {
    const segBtn = e.target.closest('[data-seg] [data-v]');
    if (segBtn) {
      const segEl = segBtn.closest('[data-seg]');
      const name = segEl.dataset.seg;
      const v = segBtn.dataset.v;
      segEl.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', b === segBtn));
      const th = segEl.querySelector('.seg-thumb');
      th.style.width = segBtn.offsetWidth + 'px';
      th.style.transform = `translate3d(${segBtn.offsetLeft}px,0,0)`;
      haptic('selection');
      if (name === 'theme') onThemeChange?.(() => setSettings({ theme: v }), e.clientX, e.clientY);
      else if (name === 'glass') setSettings({ glass: v });
      return;
    }
    const note = e.target.closest('.note-pick [data-note]');
    if (note) {
      if (note.dataset.note === store.settings.note) return;
      body.querySelectorAll('.note-pick [data-note]').forEach(b => b.setAttribute('aria-pressed', b === note));
      haptic('selection');
      onThemeChange?.(() => setSettings({ note: note.dataset.note }), e.clientX, e.clientY);
      return;
    }
    const acc = e.target.closest('[data-acc]');
    if (acc) {
      body.querySelectorAll('[data-acc]').forEach(b => b.setAttribute('aria-pressed', b === acc));
      haptic('selection');
      setSettings({ accent: acc.dataset.acc });
      return;
    }
    const swb = e.target.closest('[data-switch]');
    if (swb) {
      const k = swb.dataset.switch;
      const on = swb.getAttribute('aria-checked') !== 'true';
      if (k !== 'lock') swb.setAttribute('aria-checked', on);
      haptic('selection');
      if (k === 'motion') setSettings({ motion: on ? 'reduced' : 'full' });
      else if (k === 'hide') setSettings({ hideOnLaunch: on });
      else if (k === 'haptics') setSettings({ haptics: on });
      else if (k === 'lock') { if (on) setupLock(); else disableLock(); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const s = store.settings;
    if (act === 'name') editName();
    else if (act === 'currency') openCurrencyPicker({ current: s.currency, onPick: code => {
      if (code === s.currency) return;
      changeCurrency(code, decimalsOf(s.currency), decimalsOf(code));
      toast(`Currency: ${code}`, { sub: store.txs.length ? 'Amounts keep their numbers — no exchange rate applied' : currencyName(code), icon: 'globe' });
    } });
    else if (act === 'budget') openBudgetSheet();
    else if (act === 'categories') openCategoriesManager();
    else if (act === 'recurring') openRecurringManager();
    else if (act === 'autolog') openAutoLogSheet();
    else if (act === 'quickbtns') openPresetManager();
    else if (act === 'autobackup') openBackupSheet();
    else if (act === 'backup' || act === 'share-backup') {
      await backupNow({ share: act === 'share-backup' });
    } else if (act === 'restore') {
      const f = await pickTextFile('.json,application/json,text/plain');
      if (!f) return;
      const p = parseBackup(f.text);
      if (!p.ok) { toast('Can’t restore', { sub: p.error, icon: 'alert', tone: 'neg' }); return; }
      const ok = await confirmDialog({
        title: 'Replace all data?',
        message: `This backup has ${p.summary.txs} transactions and ${p.summary.accounts} accounts${p.summary.exportedAt ? ` (saved ${new Date(p.summary.exportedAt).toLocaleDateString()})` : ''}. Your current data on this phone will be replaced.`,
        confirm: 'Restore', destructive: true, icon: 'upload',
      });
      if (!ok) return;
      replaceAll({ ...p.data, settings: { ...p.data.settings, onboarded: true, lock: store.settings.lock } }, { keepSettings: true });
      haptic('success');
      toast('Backup restored', { sub: `${p.summary.txs} transactions`, icon: 'check-circle', tone: 'pos' });
    } else if (act === 'csv') {
      const r = await shareFile(`benjamins-${todayKey()}.csv`, 'text/csv', csv());
      if (!r.ok && r.error !== 'cancelled') toast('Export failed', { icon: 'alert', tone: 'neg' });
    } else if (act === 'persist') {
      persisted = await requestPersist();
      toast(persisted ? 'Storage protected' : 'Your browser declined', { icon: persisted ? 'shield' : 'info' });
      render();
    } else if (act === 'erase' || act === 'fresh') {
      const ok = await confirmDialog({
        title: act === 'fresh' ? 'Clear sample data?' : 'Erase everything?',
        message: act === 'fresh' ? 'The sample transactions will be removed and you’ll set up your own accounts.' : 'All transactions, accounts and settings on this phone will be permanently deleted. Consider backing up first.',
        confirm: act === 'fresh' ? 'Start fresh' : 'Erase', destructive: true, icon: 'trash',
      });
      if (!ok) return;
      sheet.close();
      await eraseAll();
      haptic('success');
      restartOnboarding?.();
    }
  });

  function editName() {
    const s2 = openSheet({
      title: 'Your name',
      content: `<div class="form"><label class="field">${icon('user', 'sm')}<input id="nm" maxlength="40" placeholder="Name" value="${esc(store.settings.name)}" autocomplete="given-name"></label>
        <button class="btn block glass tint btn-primary press" data-act="ok">Save</button></div>`,
    });
    const inp = $('#nm', s2.body);
    setTimeout(() => inp.focus(), 350);
    const done = () => { setSettings({ name: inp.value.trim() }); s2.close(); haptic('success'); };
    s2.body.addEventListener('click', e => { if (e.target.closest('[data-act="ok"]')) done(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  }

  render();
  return sheet;
}
