// Persistence: IndexedDB is the source of truth; a localStorage snapshot gives an
// instant first paint (and is the fallback store when IndexedDB is unavailable).

const DB_NAME = 'benjamins';
const DB_VERSION = 1;
const SNAP_KEY = 'wyb:snap:v1';
const UI_KEY = 'wyb:ui';
const SNAP_MAX_CHARS = 2_400_000; // ~4.8 MB UTF-16 — beyond this the snapshot keeps only recent txs

let idb = null;
let idbFailed = false;

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function txDone(t) {
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });
}

export async function openIDB() {
  if (idb) return idb;
  if (idbFailed || !('indexedDB' in self)) throw new Error('IndexedDB unavailable');
  idb = await new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
    const timer = setTimeout(() => rej(new Error('IndexedDB open timeout')), 5000);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath: 'id' });
    };
    r.onsuccess = () => { clearTimeout(timer); res(r.result); };
    r.onerror = () => { clearTimeout(timer); rej(r.error); };
    r.onblocked = () => { clearTimeout(timer); rej(new Error('IndexedDB blocked')); };
  }).catch(e => { idbFailed = true; throw e; });
  idb.onversionchange = () => { idb.close(); idb = null; };
  return idb;
}

export const idbAvailable = () => !!idb;

const META_KEYS = ['settings', 'accounts', 'categories', 'recurring', 'presets', 'rev'];

export async function loadIDB() {
  const db = await openIDB();
  const t = db.transaction(['kv', 'tx'], 'readonly');
  const kv = t.objectStore('kv');
  const [vals, txs] = await Promise.all([
    Promise.all(META_KEYS.map(k => req(kv.get(k)))),
    req(t.objectStore('tx').getAll()),
  ]);
  const out = { txs };
  META_KEYS.forEach((k, i) => { out[k] = vals[i]; });
  if (out.settings == null && !txs.length) return null; // empty database
  return out;
}

/** Apply an incremental change set: { txPut:[tx], txDel:[id], meta:[key], all:bool } */
export async function writeIDB(changes, S) {
  const db = await openIDB();
  const t = db.transaction(['kv', 'tx'], 'readwrite');
  const kv = t.objectStore('kv'), tx = t.objectStore('tx');
  if (changes.all) {
    tx.clear();
    for (const x of S.txs) tx.put(x);
    for (const k of META_KEYS) kv.put(k === 'rev' ? S.rev : S[k], k);
  } else {
    for (const x of changes.txPut || []) tx.put(x);
    for (const id of changes.txDel || []) tx.delete(id);
    for (const k of changes.meta || []) kv.put(S[k], k);
    kv.put(S.rev, 'rev');
  }
  await txDone(t);
}

export async function clearIDB() {
  try {
    const db = await openIDB();
    const t = db.transaction(['kv', 'tx'], 'readwrite');
    t.objectStore('kv').clear();
    t.objectStore('tx').clear();
    await txDone(t);
  } catch {}
}

// ---------------------------------------------------------------- localStorage snapshot
export function readSnapshot() {
  try {
    const s = localStorage.getItem(SNAP_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

/** Returns false if the full state could not be stored (quota) — caller may warn. */
export function writeSnapshot(S) {
  const pick = { settings: S.settings, accounts: S.accounts, categories: S.categories, recurring: S.recurring, presets: S.presets, rev: S.rev, txs: S.txs, partial: false };
  let json = JSON.stringify(pick);
  // partial snapshots must end on a whole day so the IndexedDB merge can't drop same-day txs
  const cut = n => {
    const part = S.txs.slice(0, n);
    const last = part[part.length - 1]?.date;
    const whole = part.filter(t => t.date > last);
    return whole.length ? whole : part;
  };
  if (json.length > SNAP_MAX_CHARS && idb) {
    pick.txs = cut(1500);
    pick.partial = true;
    json = JSON.stringify(pick);
  }
  try { localStorage.setItem(SNAP_KEY, json); return true; }
  catch {
    if (!pick.partial && idb) {
      try { pick.txs = cut(500); pick.partial = true; localStorage.setItem(SNAP_KEY, JSON.stringify(pick)); return true; } catch {}
    }
    return false;
  }
}

export function clearSnapshot() {
  try { localStorage.removeItem(SNAP_KEY); } catch {}
}

/** UI prefs read by the pre-paint boot script in index.html. */
export function writeUI(ui) {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {}
}

export function storageBytes() {
  try { return (localStorage.getItem(SNAP_KEY) || '').length * 2; } catch { return 0; }
}

export async function requestPersist() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}

export async function isPersisted() {
  try { return !!(await navigator.storage?.persisted?.()); } catch { return false; }
}
