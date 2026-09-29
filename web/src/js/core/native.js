// One API over three hosts: Android shell (window.WYBNative), iOS shell
// (webkit.messageHandlers.wyb) and the plain web/PWA. See docs/NATIVE_BRIDGE.md.

const A = window.WYBNative;
const iosHandler = window.webkit?.messageHandlers?.wyb;
export const platform = A ? 'android' : iosHandler ? 'ios' : 'web';
export const isNative = platform !== 'web';
const ua = navigator.userAgent;
export const isIOSDevice = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = isNative || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const post = msg => { try { iosHandler.postMessage(msg); } catch (e) { console.warn('bridge', e); } };
const call = (fn, ...args) => { try { return A[fn](...args); } catch (e) { console.warn('bridge', fn, e); } };

// ---------------------------------------------------------------- native → JS events
const handlers = {};
window.__wyb = {
  emit(type, data) {
    for (const fn of handlers[type] || []) { try { fn(data || {}); } catch (e) { console.error(e); } }
  },
};
export function onNative(type, fn) {
  (handlers[type] ||= []).push(fn);
  return () => { handlers[type] = handlers[type].filter(f => f !== fn); };
}

// ---------------------------------------------------------------- haptics
let hapticsOn = true;
export const setHaptics = on => { hapticsOn = on; };
const VIB = { light: 8, selection: 4, medium: 14, heavy: 24, success: [10, 70, 16], warning: [18, 90, 18], error: [22, 60, 22, 60, 22] };

function iosWebTick() {
  // iOS 18+ Safari: toggling a native <input switch> produces a system haptic.
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {}
}

export function haptic(kind = 'light') {
  if (!hapticsOn) return;
  if (A) return void call('haptic', kind);
  if (iosHandler) return void post({ cmd: 'haptic', kind });
  if (navigator.vibrate && !isIOSDevice) { try { navigator.vibrate(VIB[kind] ?? 8); } catch {} return; }
  if (isIOSDevice) {
    iosWebTick();
    if (kind === 'success' || kind === 'error' || kind === 'warning') setTimeout(iosWebTick, 90);
  }
}

// ---------------------------------------------------------------- misc bridge calls
export function info() {
  if (A) { try { return JSON.parse(A.getInfo()); } catch {} }
  if (iosHandler) return { platform: 'ios', ...(window.__WYB_IOS || {}) };
  return { platform: 'web' };
}

export function ready() {
  if (A) call('ready');
  else if (iosHandler) post({ cmd: 'ready' });
}

let lastThemeKey = '';
export function setTheme(mode, bg) {
  const key = mode + bg;
  if (key === lastThemeKey) return;
  lastThemeKey = key;
  if (A) call('setTheme', mode, bg);
  else if (iosHandler) post({ cmd: 'setTheme', mode, bg });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

let lastCanGoBack = null;
export function setCanGoBack(can) {
  if (!A || can === lastCanGoBack) return;
  lastCanGoBack = can;
  call('setCanGoBack', !!can);
}

export function minimize() { if (A) call('minimize'); }

// ---------------------------------------------------------------- SMS auto-logging (Android only)
// The shell reads IOB UPI-debit alerts and queues them; the page drains the queue into the ledger.
export const smsSupported = !!A && typeof A.getSmsState === 'function';

export function smsState() {
  if (!smsSupported) return { granted: false, on: false, last4: '' };
  try { return JSON.parse(A.getSmsState()); } catch { return { granted: false, on: false, last4: '' }; }
}
/** Tell the shell which account to watch. Nothing is captured unless on && last4 is 4 digits. */
export const setSmsConfig = (on, last4, credits) => { if (smsSupported) call('setSmsConfig', !!on, String(last4 || ''), !!credits); };
export function requestSmsPermission() {
  if (!smsSupported) return Promise.resolve(false);
  return new Promise(res => {
    const off = onNative('smsPermission', d => { off(); res(!!d.granted); });
    call('requestSmsPermission');
  });
}
export function pendingSms() {
  if (!smsSupported) return [];
  try { const l = JSON.parse(A.getPendingSms()); return Array.isArray(l) ? l : []; } catch { return []; }
}
export const ackSms = ids => { if (smsSupported && ids.length) call('ackSms', JSON.stringify(ids)); };

// ---------------------------------------------------------------- automatic backups (Android only)
export const backupSupported = !!A && typeof A.writeBackup === 'function';

/** {set, name?}: the folder chosen for automatic backups (set=false if none or it was deleted). */
export function backupFolder() {
  if (!backupSupported) return { set: false };
  try { return JSON.parse(A.getBackupFolder()); } catch { return { set: false }; }
}
/** Opens the system folder picker; resolves {ok, set?, name?, error?}. */
export function pickBackupFolder() {
  if (!backupSupported) return Promise.resolve({ ok: false, error: 'unsupported' });
  markExternal();
  return new Promise(res => {
    const off = onNative('backupFolder', d => { off(); res(d); });
    call('pickBackupFolder');
  });
}
export const clearBackupFolder = () => { if (backupSupported) call('clearBackupFolder'); };
/** Writes a file into the chosen folder; resolves {ok, name?, error?}. */
export function writeBackupFile(name, content) {
  if (!backupSupported) return Promise.resolve({ ok: false, error: 'unsupported' });
  return new Promise(res => {
    const off = onNative('backupWritten', d => { clearTimeout(t); off(); res(d); });
    const t = setTimeout(() => { off(); res({ ok: false, error: 'timeout' }); }, 60000);
    call('writeBackup', name, content);
  });
}

// ---------------------------------------------------------------- widget / tile / shortcut (Android)
/** 'add' when the app was opened from the widget, tile or launcher shortcut (once), else ''. */
export function takeLaunchAction() {
  if (!A || typeof A.takeLaunchAction !== 'function') return '';
  try { return A.takeLaunchAction() || ''; } catch { return ''; }
}
let lastWidget = '';
/** {title, main, sub}: the text the home-screen widget shows. */
export function setWidgetData(data) {
  if (!A || typeof A.setWidgetData !== 'function') return;
  const json = JSON.stringify(data);
  if (json === lastWidget) return;
  lastWidget = json;
  call('setWidgetData', json);
}

// ---------------------------------------------------------------- external UI flows
// System pickers / share sheets send the app to the background ('pause'); the app lock
// must not trigger when the user comes back from one of those.
let externalUntil = 0;
const markExternal = (ms = 10 * 60000) => { if (A || iosHandler) externalUntil = Date.now() + ms; };
export const inExternalFlow = () => Date.now() < externalUntil;
export const endExternalFlow = () => { externalUntil = 0; };

// ---------------------------------------------------------------- files
let pendingSave = null;
onNative('fileSaved', d => { const p = pendingSave; pendingSave = null; p?.(d); });

// Embedded previews (e.g. inside an iframe viewer) can't start downloads.
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const PREVIEW_ERR = 'Not available in this preview — use the installed app';

function download(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save a file; resolves {ok, name?, error?}. */
export function saveFile(name, mime, content) {
  if (A || iosHandler) {
    markExternal();
    return new Promise(res => {
      pendingSave?.({ ok: false, error: 'superseded' });
      pendingSave = res;
      if (A) call('saveFile', name, mime, content);
      else post({ cmd: 'saveFile', name, mime, content });
      setTimeout(() => { if (pendingSave === res) { pendingSave = null; res({ ok: false, error: 'timeout' }); } }, 180000);
    });
  }
  if (embedded) return Promise.resolve({ ok: false, error: PREVIEW_ERR });
  try { download(name, mime, content); return Promise.resolve({ ok: true, name }); }
  catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
}

/** Share a file via the system share sheet (falls back to download). */
export async function shareFile(name, mime, content) {
  markExternal(3 * 60000);
  if (A) { call('shareFile', name, mime, content); return { ok: true }; }
  if (iosHandler) { post({ cmd: 'shareFile', name, mime, content }); return { ok: true }; }
  try {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return { ok: true };
    }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'cancelled' };
  }
  if (embedded) return { ok: false, error: PREVIEW_ERR };
  download(name, mime, content);
  return { ok: true, downloaded: true };
}

export async function shareText(subject, text) {
  markExternal(3 * 60000);
  if (A) return void call('shareText', subject, text);
  if (iosHandler) return void post({ cmd: 'shareText', subject, text });
  try { if (navigator.share) return void (await navigator.share({ title: subject, text })); } catch {}
  try { await navigator.clipboard.writeText(text); } catch {}
}

/** Open a file picker and resolve with the chosen file's text (or null). */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    markExternal();
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return res(null);
      try { res({ name: f.name, text: await f.text() }); } catch { res(null); }
    });
    input.addEventListener('cancel', () => { input.remove(); res(null); });
    document.body.appendChild(input);
    input.click();
  });
}
