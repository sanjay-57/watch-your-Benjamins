// Benjamins — app controller.
import { $, clamp, throttleRaf, debounce, reducedMotion } from './core/util.js';
import { setCurrency } from './core/money.js';
import { todayKey, thisMonth } from './core/dates.js';
import { store, bootFromSnapshot, syncWithIDB, processRecurring, flush, syncUIPrefs, deleteTx, restoreTx, activeAccounts, cardInfo, account, category, usePreset, preset, removePreset, addPreset } from './core/store.js';
import * as native from './core/native.js';
import { nav } from './core/nav.js';
import { injectSprite } from './ui/icons.js';
import { installEasings, SPR, animate } from './ui/spring.js';
import { initSheets, onPresentationChange } from './ui/sheet.js';
import { initTabbar, setActiveTab } from './ui/tabbar.js';
import { setGlassMode, initLight, setLight } from './ui/glass.js';
import { mountAurora, refreshAurora, holdAurora } from './ui/aurora.js';
import { applyEngraving } from './ui/engrave.js';
import { attachSwipe, closeOpenRow } from './ui/swipe.js';
import { toast, alertDialog, openMenu } from './ui/overlays.js';
import { icon } from './ui/icons.js';
import { renderHome } from './views/home.js';
import { renderActivity, bindActivity, setActivityFilter } from './views/activity.js';
import { renderInsights, bindInsights } from './views/insights.js';
import { renderWallet } from './views/wallet.js';
import { openTxSheet } from './views/txsheet.js';
import { openAccountDetail, openAccountEditor, openBudgetSheet, openRecurringManager } from './views/manage.js';
import { openSettings } from './views/settings.js';
import { openPresetManager } from './views/presets.js';
import { money } from './core/money.js';
import { showOnboarding } from './views/onboarding.js';
import { showLock } from './views/lock.js';

const root = document.documentElement;
const VIEWS = { home: renderHome, activity: renderActivity, insights: renderInsights, wallet: renderWallet };
const sections = {};
const dirty = new Set(Object.keys(VIEWS));
let active = 'home';
let lastDay = todayKey();
let nativeDark = null;
let onboarding = null;

// ---------------------------------------------------------------- settings → DOM
const systemDark = () => (nativeDark != null ? nativeDark : matchMedia('(prefers-color-scheme: dark)').matches);

const ACCENTS = ['greenback', 'seal', 'jade', 'khaki'];
const NOTES = ['dollar', 'dirham', 'rupee'];
let presenting = 0;
let lastLook = '';
function syncBars() {
  // while a sheet is up the page sits on a black frame → light status-bar icons
  const theme = root.dataset.theme;
  const cs = getComputedStyle(root);
  if (presenting) native.setTheme('dark', cs.getPropertyValue('--present-bg').trim() || '#030805');
  else native.setTheme(theme, cs.getPropertyValue('--bg').trim() || (theme === 'dark' ? '#07120c' : '#f2f0e6'));
}

function applySettings() {
  const s = store.settings;
  setCurrency(s.currency);
  const theme = s.theme === 'system' ? (systemDark() ? 'dark' : 'light') : s.theme;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  root.dataset.accent = ACCENTS.includes(s.accent) ? s.accent : 'greenback';
  root.dataset.note = NOTES.includes(s.note) ? s.note : 'dollar';
  root.dataset.glass = s.glass;
  root.dataset.motion = s.motion;
  const look = theme + root.dataset.note + s.glass + s.motion;
  if (look !== lastLook) { lastLook = look; refreshAurora(); applyEngraving(); }
  syncBars();
  native.setHaptics(s.haptics !== false);
  setGlassMode(s.glass);
  setLight(s.motion !== 'reduced');
}

function markAllDirty() { for (const k in VIEWS) dirty.add(k); }

// ---------------------------------------------------------------- rendering
function render(name, { enter = false } = {}) {
  const sec = sections[name];
  const old = sec.querySelector('[data-scroller]');
  const y = old ? old.scrollTop : 0;
  VIEWS[name](sec);
  dirty.delete(name);
  if (!enter) sec.querySelector('.page.enter')?.classList.remove('enter');
  const sc = sec.querySelector('[data-scroller]');
  if (sc) {
    sc.scrollTop = y;
    bindScroll(sc, sec);
  }
}

const scheduleRender = (() => {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (dirty.has(active)) render(active); });
  };
})();

// Scroll-linked custom properties go on the one element that reads each (never on #app or the
// view: an inherited property changed there restyles the whole subtree on every scroll frame),
// and only when the value actually changes.
function setVar(el, name, v) {
  if (el && el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v);
}

function bindScroll(sc, sec) {
  let lastY = sc.scrollTop;
  const dock = $('#dock');
  const update = throttleRaf(() => {
    const y = sc.scrollTop;
    setVar(sec.querySelector('.topbar'), '--p', clamp((y - 30) / 26, 0, 1).toFixed(3));
    setVar(sec.querySelector('.lt h1'), '--pull', clamp(-y / 140, 0, 1).toFixed(3));
    if (sec.dataset.view === active) syncTopbar(sec, y);
    const dy = y - lastY;
    if (y > 160 && dy > 5) dock.classList.add('mini');
    else if (dy < -5 || y < 80) dock.classList.remove('mini');
    lastY = y;
    holdAurora('scroll', true);
    holdAurora('scroll', false, 220);
  });
  sc.addEventListener('scroll', update, { passive: true });
  update();
}

function syncTopbar(sec, y) {
  setVar($('.edge-top'), '--edge-top', clamp(y / 34, 0, 1).toFixed(3));
  setVar($('#topbar'), '--p', clamp((y - 30) / 26, 0, 1).toFixed(3));
  const t = sec.querySelector('.topbar-title')?.textContent || '';
  const title = $('#topbar-title');
  if (title.textContent !== t) title.textContent = t;
}

function showTab(name, opts = {}) {
  if (!VIEWS[name]) return;
  closeOpenRow();
  if (name === active) {
    if (opts.reselect) sections[name].querySelector('[data-scroller]')?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setActiveTab(name);
    return;
  }
  const prev = active;
  active = name;
  sections[prev].hidden = true;
  sections[name].hidden = false;
  if (dirty.has(name)) render(name, { enter: true });
  else {
    const page = sections[name].querySelector('.page');
    if (page) animate(page, [{ transform: 'translate3d(0,12px,0) scale(.992)' }, { transform: 'none' }], { duration: 520, easing: SPR.soft.easing });
  }
  setActiveTab(name);
  nav.setTab(name);
  const sc = sections[name].querySelector('[data-scroller]');
  syncTopbar(sections[name], sc?.scrollTop || 0);
  $('#dock').classList.remove('mini');
  native.haptic('selection');
}

// ---------------------------------------------------------------- actions shared by views
function acctType(type) {
  const list = activeAccounts().filter(a => (type === 'upi' ? a.type === 'upi' || a.type === 'bank' : a.type === type));
  if (list.length === 1) openAccountDetail(list[0].id);
  else showTab('wallet');
}

function payCard(id) {
  const a = account(id);
  const from = activeAccounts().find(x => x.type === 'upi') || activeAccounts().find(x => x.type === 'bank') || activeAccounts().find(x => x.type === 'cash');
  openTxSheet({ preset: { type: 'transfer', accountId: from?.id, toAccountId: id, amount: a ? cardInfo(a).due : 0 } });
}

function togglePrivacy(btn) {
  const on = root.dataset.private !== 'true';
  if (on) root.dataset.private = 'true';
  else delete root.dataset.private;
  native.haptic('medium');
  if (btn) {
    btn.innerHTML = icon(on ? 'eye-off' : 'eye');
    btn.setAttribute('aria-label', on ? 'Show amounts' : 'Hide amounts');
    animate(btn, [{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], { duration: 480, easing: SPR.spring.easing });
  }
}

function explainBalance() {
  alertDialog({
    title: 'How your balance works',
    message: 'Total balance = Cash + GPay/bank. Credit cards are tracked separately against their limit, so a card spend doesn’t lower your balance. It goes down only when you pay the card bill (a transfer, so it’s never counted as spending twice).',
    confirm: 'Got it', icon: 'info',
  });
}

function themeSwitch(apply, x = innerWidth / 2, y = innerHeight / 2) {
  const look = () => root.dataset.theme + root.dataset.note;
  const before = look();
  if (!document.startViewTransition || reducedMotion()) return apply();
  let changed = false;
  const vt = document.startViewTransition(() => { apply(); changed = look() !== before; });
  vt.ready.then(() => {
    if (!changed) return;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 720, easing: 'cubic-bezier(.45,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}

function openSettingsSheet() {
  openSettings({ onThemeChange: themeSwitch, restartOnboarding });
}

function onDelete(id) {
  const removed = deleteTx(id);
  if (!removed) return;
  native.haptic('success');
  toast('Transaction deleted', { icon: 'trash', tone: 'neg', action: 'Undo', onAction: () => restoreTx(removed) });
}

/** Long-press (touch) / right-click (mouse) on a transaction → glass context menu. */
function bindLongPress(sec) {
  let timer = 0, fired = false, start = null;
  const open = row => {
    if (row.classList.contains('qchip')) {
      const p = preset(row.dataset.id);
      if (!p) return;
      fired = true;
      native.haptic('medium');
      animate(row, [{ transform: 'scale(1)' }, { transform: 'scale(.93)' }, { transform: 'scale(1)' }], { duration: 360, easing: SPR.spring.easing });
      openMenu(row, [
        { label: 'Edit button', icon: 'edit', onSelect: () => openTxSheet({ mode: 'button', buttonId: p.id }) },
        { label: 'Log with changes…', icon: 'plus', onSelect: () => openTxSheet({ preset: { type: p.type, amount: p.amount, categoryId: p.categoryId, note: p.note || p.label, accountId: p.accountId || undefined, toAccountId: p.toAccountId || undefined } }) },
        { label: 'All quick buttons', icon: 'zap', onSelect: () => openPresetManager() },
        '-',
        { label: 'Delete button', icon: 'trash', danger: true, onSelect: () => {
          const copy = { ...p };
          removePreset(p.id);
          toast('Quick button deleted', { icon: 'trash', tone: 'neg', action: 'Undo', onAction: () => addPreset(copy) });
        } },
      ], { align: 'start' });
      return;
    }
    const t = store.txs.find(x => x.id === row.dataset.id);
    if (!t) return;
    fired = true;
    native.haptic('medium');
    animate(row, [{ transform: 'scale(1)' }, { transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: 360, easing: SPR.spring.easing });
    openMenu(row, [
      { label: 'Edit', icon: 'edit', onSelect: () => openTxSheet({ tx: t }) },
      ...(t.type === 'adjust' ? [] : [{ label: 'Duplicate', icon: 'copy', onSelect: () => openTxSheet({ preset: { ...t, date: todayKey() } }) }]),
      '-',
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => onDelete(t.id) },
    ]);
  };
  sec.addEventListener('touchstart', e => {
    const row = e.target.closest('.tx[data-id], .qchip[data-id]');
    if (!row || e.touches.length !== 1) return;
    fired = false;
    start = [e.touches[0].clientX, e.touches[0].clientY];
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; if (!row.closest('.swiping')) open(row); }, 470);
  }, { passive: true });
  sec.addEventListener('touchmove', e => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - start[0], t.clientY - start[1]) > 8) { clearTimeout(timer); timer = 0; }
  }, { passive: true });
  const cancel = () => { clearTimeout(timer); timer = 0; };
  sec.addEventListener('touchend', cancel);
  sec.addEventListener('touchcancel', cancel);
  sec.addEventListener('contextmenu', e => {
    const row = e.target.closest('.tx[data-id], .qchip[data-id]');
    if (!row) return;
    e.preventDefault();
    if (!fired) { cancel(); open(row); }
  });
  // swallow the click that follows a long-press
  sec.addEventListener('click', e => { if (fired && e.target.closest('.tx, .qchip')) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
}

// one tap on a quick button logs it (double taps within 700 ms are ignored)
const lastQuick = new Map();
function quickLog(el) {
  const id = el.dataset.id, now = Date.now();
  if (now - (lastQuick.get(id) || 0) < 700) return;
  lastQuick.set(id, now);
  const p = preset(id);
  const t = usePreset(id);
  if (!p || !t) { toast('Couldn’t log that', { sub: 'Check the button’s account in Edit', icon: 'alert', tone: 'warn' }); return; }
  native.haptic('success');
  el.classList.remove('logged'); void el.offsetWidth; el.classList.add('logged');
  const c = category(t.categoryId), a = account(t.accountId);
  toast(`${t.type === 'income' ? 'Added' : t.type === 'transfer' ? 'Moved' : 'Logged'} ${money(t.amount)}`, {
    sub: `${t.type === 'transfer' ? '⇄' : c?.emoji || '⚡'} ${p.label} · ${a?.name || ''}`,
    icon: 'zap', tone: t.type === 'income' ? 'pos' : 'accent',
    action: 'Undo',
    onAction: () => { deleteTx(t.id); toast('Removed', { icon: 'undo' }); },
  });
}

function bindView(name, sec) {
  bindLongPress(sec);
  sec.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !sec.contains(el)) return;
    switch (el.dataset.act) {
      case 'open-tx': { const t = store.txs.find(x => x.id === el.dataset.id); if (t) openTxSheet({ tx: t }); break; }
      case 'add': openTxSheet(); break;
      case 'settings': openSettingsSheet(); break;
      case 'privacy': togglePrivacy(el); break;
      case 'explain': explainBalance(); break;
      case 'acct-type': acctType(el.dataset.type); break;
      case 'acct': openAccountDetail(el.dataset.id); break;
      case 'add-acct': openAccountEditor({ type: el.dataset.type || 'card' }); break;
      case 'month-tile': setActivityFilter({ month: thisMonth(), type: el.dataset.type }); dirty.add('activity'); showTab('activity'); break;
      case 'budget': openBudgetSheet(); break;
      case 'pay-card': payCard(el.dataset.id); break;
      case 'recurring': openRecurringManager(); break;
      case 'quick': quickLog(el); break;
      case 'presets': openPresetManager(); break;
      case 'preset-new': openTxSheet({ mode: 'button' }); break;
      case 'see-all': setActivityFilter({}); dirty.add('activity'); showTab('activity'); break;
    }
  });
  attachSwipe(sec, onDelete);
}

// ---------------------------------------------------------------- onboarding
function afterOnboarding() {
  onboarding = null;
  markAllDirty();
  render('home', { enter: true });
  if (!store.txs.length) $('#fab').classList.add('hint');
  if (native.platform === 'web' && native.isIOSDevice && !native.isStandalone) {
    setTimeout(() => toast('Install for the full experience', { sub: 'Share → Add to Home Screen', icon: 'download', duration: 6000 }), 1400);
  }
}

function restartOnboarding() {
  if (active !== 'home') showTab('home');
  markAllDirty();
  render('home');
  onboarding = showOnboarding({ onDone: afterOnboarding });
}

// ---------------------------------------------------------------- lifecycle
let hiddenAt = 0;
function onHide() {
  flush();
  if (!hiddenAt) hiddenAt = Date.now();
}
function onShow() {
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  hiddenAt = 0;
  const external = native.inExternalFlow();
  native.endExternalFlow();
  if (store.settings.lock && store.settings.onboarded && away > 60000 && !external) showLock();
  const created = processRecurring();
  if (created.length) toast(`${created.length} recurring payment${created.length > 1 ? 's' : ''} logged`, { icon: 'repeat' });
  if (todayKey() !== lastDay) { lastDay = todayKey(); markAllDirty(); scheduleRender(); }
}

function registerSW() {
  if (native.platform !== 'web' || !('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const prompt = w => toast('Update ready', { sub: 'A new version of Benjamins is available', icon: 'sparkles', action: 'Reload', duration: 12000, onAction: () => w.postMessage('skip-waiting') });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
    });
  }).catch(() => {});
  // reload only when an *update* takes over — not on the very first install (clients.claim)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

// ---------------------------------------------------------------- boot
function boot() {
  injectSprite();
  installEasings();
  initSheets();
  const info = native.info();
  if (typeof info.dark === 'boolean') nativeDark = info.dark;

  bootFromSnapshot();
  if (store.settings.hideOnLaunch) root.dataset.private = 'true';
  mountAurora($('#aurora'));
  applySettings();

  for (const name of Object.keys(VIEWS)) {
    sections[name] = document.getElementById('view-' + name);
    bindView(name, sections[name]);
  }
  bindActivity(sections.activity, { onAdd: () => openTxSheet() });
  bindInsights(sections.insights, {
    rerender: () => render('insights'),
    showCategory: (cat, mk) => { setActivityFilter({ cat, month: mk }); dirty.add('activity'); showTab('activity'); },
  });

  initTabbar((name, opts) => showTab(name, opts));
  nav.onTab((name, opts) => showTab(name, opts));
  $('#fab').addEventListener('click', () => { $('#fab').classList.remove('hint'); openTxSheet(); });
  initLight();

  render('home', { enter: true });
  if (!store.settings.onboarded) onboarding = showOnboarding({ onDone: afterOnboarding });
  else if (store.settings.lock) showLock();
  requestAnimationFrame(() => requestAnimationFrame(() => native.ready()));

  store.subscribe(ch => {
    if (ch.storageFull) { toast('Storage is full', { sub: 'Export a backup and free some space', icon: 'alert', tone: 'warn' }); return; }
    applySettings();
    markAllDirty();
    scheduleRender();
    if (store.txs.length) $('#fab').classList.remove('hint');
  });

  syncWithIDB().then(changed => {
    if (changed) {
      applySettings();
      if (store.settings.onboarded && onboarding) { onboarding.el.remove(); onboarding = null; }
      markAllDirty();
      scheduleRender();
    }
    const created = processRecurring();
    if (created.length) toast(`${created.length} recurring payment${created.length > 1 ? 's' : ''} logged`, { icon: 'repeat' });
  });

  // lifecycle + system theme
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
  window.addEventListener('pagehide', flush);
  native.onNative('pause', onHide);
  native.onNative('resume', onShow);
  native.onNative('systemTheme', d => { nativeDark = !!d.dark; if (store.settings.theme === 'system') applySettings(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (nativeDark == null && store.settings.theme === 'system') applySettings(); });

  // keyboard insets (Android shell pushes them; iOS/web use visualViewport)
  const setKb = px => root.style.setProperty('--kb', Math.max(0, Math.round(px)) + 'px');
  // the Android shell doesn't auto-scroll focused fields above the keyboard — do it here
  const keepFocusVisible = () => {
    const el = document.activeElement;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }), 80);
  };
  native.onNative('insets', d => { setKb(d.ime || 0); if (d.ime > 0) keepFocusVisible(); });
  document.addEventListener('focusin', () => { if (parseFloat(root.style.getPropertyValue('--kb')) > 0) keepFocusVisible(); });
  onPresentationChange(n => { presenting = n; syncBars(); holdAurora('sheet', n > 0); });
  if (native.platform === 'web' && native.isIOSDevice && native.isStandalone) root.classList.add('ios-pwa');
  if (window.visualViewport && native.platform !== 'android') {
    const vv = window.visualViewport;
    const upd = () => setKb(innerHeight - vv.height - vv.offsetTop > 80 ? innerHeight - vv.height - vv.offsetTop : 0);
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
  }

  // re-layout charts on size changes
  window.addEventListener('resize', debounce(() => { markAllDirty(); render(active); }, 250));

  // desktop niceties
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') { if (nav.depth) { e.preventDefault(); nav.back(); } return; }
    if (typing || nav.depth || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.lock, .onb')) return;
    if (e.key === 'n' || e.key === '+') { e.preventDefault(); openTxSheet(); }
    const tabs = ['home', 'activity', 'insights', 'wallet'];
    if (/^[1-4]$/.test(e.key)) showTab(tabs[+e.key - 1]);
  });
  // iOS: make :active styles work on touch
  document.addEventListener('touchstart', () => {}, { passive: true });

  registerSW();
  syncUIPrefs();
}

boot();
