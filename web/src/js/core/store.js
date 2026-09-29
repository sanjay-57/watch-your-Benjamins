// App state, mutations and memoised derived data.
//
// Accounting model
//  • Every account has a signed balance = opening + inflows − outflows.
//  • Cash / UPI / bank balances are money you HAVE (positive).
//  • Credit cards go NEGATIVE as you spend (what you OWE) and are tracked on their
//    own against the card limit; paying the bill is a transfer bank → card, so it's
//    never double-counted as an expense.
//  • Balance = cash + GPay/bank only. Card spends don't touch it; money leaves it
//    only when you actually pay the card bill.
import * as db from './db.js';
import { uid, debounce } from './util.js';
import { CURRENCIES, localPrice, money } from './money.js';
import { todayKey, nowTime, addDays, addMonths, daysInMonth, dateInMonth, dayDiff, isValidKey, keyOf, parseKey } from './dates.js';

export const DEFAULT_CATEGORIES = [
  // expense
  { id: 'food', name: 'Food & Dining', emoji: '🍔', color: '#85BB65', kind: 'expense' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒', color: '#A7C88A', kind: 'expense' },
  { id: 'transport', name: 'Transport', emoji: '🚕', color: '#CDBF86', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#5FA38F', kind: 'expense' },
  { id: 'bills', name: 'Bills & Utilities', emoji: '💡', color: '#8FBFAE', kind: 'expense' },
  { id: 'rent', name: 'Rent & Home', emoji: '🏠', color: '#2E7D4F', kind: 'expense' },
  { id: 'fuel', name: 'Fuel', emoji: '⛽', color: '#B8A86A', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬', color: '#6FB08A', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '📺', color: '#3E6B5C', kind: 'expense' },
  { id: 'health', name: 'Health', emoji: '💊', color: '#9FD47C', kind: 'expense' },
  { id: 'education', name: 'Education', emoji: '📚', color: '#7E9C6E', kind: 'expense' },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: '#8FA886', kind: 'expense' },
  { id: 'personal', name: 'Personal Care', emoji: '💅', color: '#CFE3C4', kind: 'expense' },
  { id: 'gifts', name: 'Gifts & Donations', emoji: '🎁', color: '#D8CFA3', kind: 'expense' },
  { id: 'emi', name: 'EMI & Loans', emoji: '🏦', color: '#6E7B4E', kind: 'expense' },
  { id: 'other', name: 'Other', emoji: '📦', color: '#7E8A80', kind: 'expense' },
  // income
  { id: 'salary', name: 'Salary', emoji: '💼', color: '#85BB65', kind: 'income' },
  { id: 'freelance', name: 'Freelance', emoji: '💻', color: '#5FA38F', kind: 'income' },
  { id: 'business', name: 'Business', emoji: '🏪', color: '#CDBF86', kind: 'income' },
  { id: 'gift_in', name: 'Gifts', emoji: '🎁', color: '#D8CFA3', kind: 'income' },
  { id: 'refund', name: 'Refunds & Cashback', emoji: '↩️', color: '#8FBFAE', kind: 'income' },
  { id: 'interest', name: 'Interest & Returns', emoji: '📈', color: '#9FD47C', kind: 'income' },
  { id: 'other_in', name: 'Other Income', emoji: '💰', color: '#7E8A80', kind: 'income' },
].map((c, i) => ({ ...c, order: i }));

// Card designs — all printed in dollar inks. `paper` and `mint` are light cards (dark text).
export const CARD_THEMES = {
  greenback: ['#2e7d4f', '#123524', '#85bb65'],
  ink: ['#2b3a30', '#07120c', '#3e6b5c'],
  seal: ['#3fa36a', '#1f5a3a', '#cfe3c4'],
  jade: ['#5fa38f', '#1c3a31', '#8fbfae'],
  olive: ['#8a9a5b', '#3f4a2a', '#cdbf86'],
  khaki: ['#cdbf86', '#6e7b4e', '#e3dfcb'],
  paper: ['#f2f0e6', '#cdbf86', '#e3dfcb'],
  mint: ['#cfe3c4', '#85bb65', '#f2f0e6'],
  // dirham & ₹500 inks
  gulf: ['#2f7fa8', '#0b2a3a', '#4fb3c4'],
  dune: ['#e6d3a8', '#c09a55', '#f4efe3'],
  stone: ['#8f8b80', '#2b2a26', '#3fae85'],
  fort: ['#b5654a', '#3a1f16', '#d9a24a'],
};
export const LIGHT_CARDS = new Set(['paper', 'mint', 'khaki', 'dune']);
const LEGACY_CARD = { aurora: 'greenback', sunset: 'khaki', ocean: 'jade', forest: 'seal', midnight: 'ink', rose: 'olive', gold: 'paper', graphite: 'ink' };
// every colour a category may use (all from the dollar)
export const DOLLAR_COLORS = ['#85BB65', '#A7C88A', '#CDBF86', '#5FA38F', '#8FBFAE', '#2E7D4F', '#B8A86A', '#6FB08A', '#3E6B5C', '#9FD47C', '#7E9C6E', '#8FA886', '#CFE3C4', '#D8CFA3', '#6E7B4E', '#7E8A80'];
export const CARD_NETWORKS = { visa: 'VISA', mastercard: 'mastercard', rupay: 'RuPay', amex: 'AMEX', other: '' };

// Default quick buttons (one-tap presets on Home).
// method = preferred kind of account when no specific account is set ('card' → your first card)
const PRESET_SEED = [
  { label: 'Petrol', amount: 500, method: 'card', categoryId: 'fuel' },
  { label: 'Vodafone recharge', amount: 666, method: 'upi', categoryId: 'bills' },
  { label: 'Apple Music', amount: 129, method: 'card', categoryId: 'subscriptions' },
  { label: 'Chai & snacks', amount: 30, method: 'cash', categoryId: 'food' },
  { label: 'Lunch', amount: 150, method: 'upi', categoryId: 'food' },
  { label: 'Auto', amount: 60, method: 'cash', categoryId: 'transport' },
];


const DEFAULT_SETTINGS = {
  name: '',
  currency: 'INR',
  theme: 'system',
  accent: 'greenback',
  note: 'dollar',
  glass: 'liquid',
  motion: 'full',
  haptics: true,
  hideOnLaunch: false,
  budget: 0,
  onboarded: false,
  demo: false,
  lastAcct: { expense: 'gpay', income: 'gpay' },
  lastBackup: 0,
  createdAt: 0,
  lock: null,
  presetsTouched: false,
  autoLog: { on: false, last4: '', accountId: 'gpay', mode: 'auto', credits: true },
  autoBackup: { on: false, every: 7, last: 0 },
  savedFilters: [],
};

function defaultAccounts() {
  const now = Date.now();
  return [
    { id: 'cash', type: 'cash', name: 'Cash', opening: 0, order: 0, createdAt: now },
    { id: 'gpay', type: 'upi', name: 'GPay', opening: 0, order: 1, createdAt: now },
  ];
}

function freshState() {
  return {
    settings: { ...DEFAULT_SETTINGS, lastAcct: { ...DEFAULT_SETTINGS.lastAcct }, createdAt: Date.now() },
    accounts: defaultAccounts(),
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    recurring: [],
    presets: defaultPresets('INR'),
    txs: [],
    rev: 0,
  };
}

let S = freshState();
let version = 1;
let partial = false;
let idbReady = false;
const subs = new Set();

// ---------------------------------------------------------------- normalisation
const cmpTx = (a, b) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 :
  (a.time || '') < (b.time || '') ? 1 : (a.time || '') > (b.time || '') ? -1 :
  (b.createdAt || 0) - (a.createdAt || 0);
const sortTxs = () => S.txs.sort(cmpTx);

const TYPES = ['expense', 'income', 'transfer', 'adjust'];
const ACCT_TYPES = ['cash', 'upi', 'bank', 'card'];
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const str = (v, max = 60) => String(v ?? '').slice(0, max);

function normAccount(a, i = 0) {
  if (!a || !a.id) return null;
  const type = ACCT_TYPES.includes(a.type) ? a.type : 'upi';
  const out = {
    id: str(a.id, 40), type, name: str(a.name || 'Account', 40), opening: int(a.opening),
    order: int(a.order, i), archived: !!a.archived, createdAt: int(a.createdAt, Date.now()),
  };
  if (type === 'card') {
    out.limit = Math.max(0, int(a.limit));
    out.dueDay = a.dueDay ? Math.min(31, Math.max(1, int(a.dueDay))) : 0;
    out.last4 = str(a.last4, 4).replace(/\D/g, '');
    out.network = CARD_NETWORKS[a.network] !== undefined ? a.network : 'other';
    out.theme = CARD_THEMES[a.theme] ? a.theme : LEGACY_CARD[a.theme] || 'greenback';
  }
  return out;
}

function dollarColor(c) {
  const col = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toUpperCase() : '';
  if (DOLLAR_COLORS.includes(col)) return col;
  const def = DEFAULT_CATEGORIES.find(d => d.id === c.id);
  if (def) return def.color;
  let h = 0;
  for (const ch of String(c.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOLLAR_COLORS[h % DOLLAR_COLORS.length];
}

function normCategory(c, i = 0) {
  if (!c || !c.id) return null;
  return {
    id: str(c.id, 40), name: str(c.name || 'Category', 32), emoji: str(c.emoji || '🏷️', 8),
    color: dollarColor(c),
    kind: c.kind === 'income' ? 'income' : 'expense', order: int(c.order, i),
    budget: Math.max(0, int(c.budget)), archived: !!c.archived,
  };
}

function normTx(t, accts = S.accounts, cats = S.categories) {
  if (!t || !TYPES.includes(t.type)) return null;
  let amount = int(t.amount, NaN);
  if (!Number.isFinite(amount)) return null;
  if (t.type !== 'adjust') amount = Math.abs(amount);
  if (amount === 0) return null;
  const ids = new Set(accts.map(a => a.id));
  if (!ids.has(t.accountId)) return null;
  const out = {
    id: t.id ? str(t.id, 40) : uid(),
    type: t.type,
    amount,
    accountId: t.accountId,
    date: isValidKey(t.date) ? t.date : todayKey(),
    time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : nowTime(),
    note: str(t.note, 140).trim(),
    createdAt: int(t.createdAt, Date.now()),
    updatedAt: int(t.updatedAt, Date.now()),
  };
  if (t.type === 'transfer') {
    if (!ids.has(t.toAccountId) || t.toAccountId === t.accountId) return null;
    out.toAccountId = t.toAccountId;
  }
  if (t.type === 'expense' || t.type === 'income') {
    const kind = t.type;
    const ok = cats.some(c => c.id === t.categoryId && c.kind === kind);
    out.categoryId = ok ? t.categoryId : kind === 'income' ? 'other_in' : 'other';
  }
  if (t.recurringId) out.recurringId = str(t.recurringId, 40);
  if (t.ref) out.ref = str(t.ref, 40); // bank reference of an auto-logged payment (dedupe key)
  return out;
}

function normRecurring(r) {
  if (!r || !r.id || !TYPES.includes(r.type) || r.type === 'adjust') return null;
  return {
    id: str(r.id, 40), type: r.type, amount: Math.abs(int(r.amount)), accountId: r.accountId,
    toAccountId: r.toAccountId, categoryId: r.categoryId, note: str(r.note, 140),
    day: Math.min(31, Math.max(1, int(r.day, 1))), next: isValidKey(r.next) ? r.next : todayKey(),
    active: r.active !== false, createdAt: int(r.createdAt, Date.now()),
  };
}

function normAutoLog(a) {
  const last4 = String(a?.last4 ?? '').replace(/\D/g, '').slice(-4);
  return {
    on: !!a?.on && last4.length === 4,
    last4: last4.length === 4 ? last4 : '',
    accountId: str(a?.accountId || DEFAULT_SETTINGS.autoLog.accountId, 40),
    mode: a?.mode === 'ask' ? 'ask' : 'auto', // 'ask' = approve each payment before it is logged
    credits: a?.credits !== false, // also log UPI money received, as income
  };
}

function normAutoBackup(b) {
  return { on: !!b?.on, every: [1, 7, 30].includes(int(b?.every)) ? int(b.every) : 7, last: Math.max(0, int(b?.last)) };
}

const FILTER_TYPES = ['all', 'expense', 'income', 'transfer'];
const FILTER_METHODS = ['all', 'cash', 'upi', 'card'];
/** Saved Activity searches: only the known fields survive, so a bad backup can't break the filter. */
export function normFilter(f = {}) {
  const num = v => (Number.isFinite(Number(v)) && v !== '' && v != null && Number(v) >= 0 ? Math.round(Number(v)) : null);
  return {
    q: str(f.q, 60),
    type: FILTER_TYPES.includes(f.type) ? f.type : 'all',
    method: FILTER_METHODS.includes(f.method) ? f.method : 'all',
    month: f.month === 'all' || /^\d{4}-\d{2}$/.test(f.month || '') ? f.month : 'all',
    cat: f.cat ? str(f.cat, 40) : null,
    acct: f.acct ? str(f.acct, 40) : null,
    from: isValidKey(f.from) ? f.from : '',
    to: isValidKey(f.to) ? f.to : '',
    min: num(f.min),
    max: num(f.max),
  };
}
function normSavedFilters(list) {
  return (Array.isArray(list) ? list : []).filter(x => x && x.id && x.name).slice(0, 12)
    .map(x => ({ id: str(x.id, 40), name: str(x.name, 30), f: normFilter(x.f) }));
}

const pickOne = (v, list, d) => (list.includes(v) ? v : d);
const CUR_CODES = CURRENCIES.map(c => c[0]);
function normSettings(s) {
  const d = DEFAULT_SETTINGS;
  const la = s.lastAcct && typeof s.lastAcct === 'object' ? s.lastAcct : {};
  const lock = s.lock && typeof s.lock.salt === 'string' && typeof s.lock.hash === 'string' ? { salt: s.lock.salt, hash: s.lock.hash } : null;
  return {
    name: str(s.name, 40),
    currency: pickOne(s.currency, CUR_CODES, 'INR'),
    theme: pickOne(s.theme, ['system', 'light', 'dark'], d.theme),
    accent: pickOne(s.accent, ['greenback', 'seal', 'jade', 'khaki'], d.accent),
    note: pickOne(s.note, ['dollar', 'dirham', 'rupee'], d.note),
    glass: pickOne(s.glass, ['liquid', 'frosted', 'solid'], d.glass),
    motion: pickOne(s.motion, ['full', 'reduced'], d.motion),
    haptics: s.haptics !== false,
    hideOnLaunch: !!s.hideOnLaunch,
    budget: Math.max(0, int(s.budget)),
    onboarded: !!s.onboarded,
    demo: !!s.demo,
    lastAcct: { expense: str(la.expense || d.lastAcct.expense, 40), income: str(la.income || d.lastAcct.income, 40) },
    lastBackup: Math.max(0, int(s.lastBackup)),
    createdAt: int(s.createdAt, Date.now()),
    lock,
    presetsTouched: !!s.presetsTouched,
    autoLog: normAutoLog(s.autoLog),
    autoBackup: normAutoBackup(s.autoBackup),
    savedFilters: normSavedFilters(s.savedFilters),
  };
}

function hydrate(data) {
  const st = freshState();
  const settings = normSettings({ ...st.settings, ...(data.settings || {}) });
  let accounts = (Array.isArray(data.accounts) ? data.accounts : []).map(normAccount).filter(Boolean);
  if (!accounts.length) accounts = defaultAccounts();
  let categories = (Array.isArray(data.categories) ? data.categories : []).map(normCategory).filter(Boolean);
  if (!categories.length) categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  // the two fallback categories must always exist (deleted categories reassign to them)
  for (const id of ['other', 'other_in']) {
    if (!categories.some(c => c.id === id)) categories.push({ ...DEFAULT_CATEGORIES.find(d => d.id === id) });
  }
  const seen = new Set();
  const txs = (Array.isArray(data.txs) ? data.txs : []).map(t => normTx(t, accounts, categories))
    .filter(t => t && !seen.has(t.id) && seen.add(t.id));
  const recurring = (Array.isArray(data.recurring) ? data.recurring : []).map(normRecurring).filter(Boolean);
  const presets = Array.isArray(data.presets) ? data.presets.map(normPreset).filter(Boolean) : defaultPresets(settings.currency);
  return { settings, accounts, categories, recurring, presets, txs: txs.sort(cmpTx), rev: int(data.rev) };
}

// ---------------------------------------------------------------- persistence
const snapSoon = debounce(() => {
  if (partial && !idbReady) return;
  const ok = db.writeSnapshot(S);
  if (!ok && !idbReady) emit({ storageFull: true });
}, 350);

// other tabs / the installed PWA re-sync from IndexedDB after we write
const bc = (() => { try { return new BroadcastChannel('benjamins'); } catch { return null; } })();
if (bc) bc.onmessage = e => { if (e.data?.rev > (S.rev || 0)) syncWithIDB(); };

// edits made before IndexedDB finished loading are replayed on top of what it returns
const journal = [];

function persist(changes) {
  snapSoon();
  if (idbReady) {
    db.writeIDB(changes, S).then(() => bc?.postMessage({ rev: S.rev }), err => {
      console.warn('[store] IndexedDB write failed — snapshot keeps data', err);
      idbReady = false;
    });
  } else {
    for (const t of changes.txPut || []) journal.push({ put: t });
    for (const id of changes.txDel || []) journal.push({ del: id });
  }
}

function emit(changes) {
  for (const fn of subs) { try { fn(changes); } catch (e) { console.error(e); } }
}

function commit(changes = {}) {
  S.rev = (S.rev || 0) + 1;
  version++;
  persist(changes);
  emit(changes);
}

export const flush = () => snapSoon.flush();

/** Synchronous boot from the localStorage snapshot (instant first paint). */
export function bootFromSnapshot() {
  const snap = db.readSnapshot();
  if (!snap || !snap.settings) return false;
  S = hydrate(snap);
  partial = !!snap.partial;
  version++;
  return true;
}

/** Reconcile with IndexedDB (authoritative). Returns true if in-memory state changed. */
export async function syncWithIDB() {
  let data;
  try { data = await db.loadIDB(); } catch (e) {
    console.warn('[store] IndexedDB unavailable, using localStorage only', e);
    return false;
  }
  idbReady = true;
  const mine = S.rev || 0;
  if (!data) {
    // empty database: seed it with the full current state so later incremental writes are complete
    await db.writeIDB({ all: true }, S).catch(() => { idbReady = false; });
    partial = false;
    return false;
  }
  const theirs = int(data.rev);
  if (theirs > mine || (theirs === mine && partial)) {
    S = hydrate(data);
    partial = false;
    if (journal.length) {
      for (const j of journal) {
        if (j.put) { const i = S.txs.findIndex(t => t.id === j.put.id); if (i >= 0) S.txs[i] = j.put; else S.txs.push(j.put); }
        else S.txs = S.txs.filter(t => t.id !== j.del);
      }
      journal.length = 0;
      sortTxs();
      S.rev = theirs + 1;
      await db.writeIDB({ all: true }, S).catch(() => {});
    }
    version++;
    snapSoon();
    emit({ all: true });
    return true;
  }
  journal.length = 0;
  if (theirs < mine) {
    if (partial) {
      // merge: recent txs from snapshot + older ones only in IndexedDB
      const have = new Set(S.txs.map(t => t.id));
      const oldest = S.txs.length ? S.txs[S.txs.length - 1].date : '9999';
      for (const t of data.txs || []) if (!have.has(t.id) && t.date < oldest) { const n = normTx(t); if (n) S.txs.push(n); }
      sortTxs();
      partial = false;
      version++;
      emit({ all: true });
    }
    await db.writeIDB({ all: true }, S).catch(() => {});
    snapSoon();
  }
  partial = false;
  return false;
}

export const isReady = () => !partial || idbReady;

// ---------------------------------------------------------------- public API
export const store = {
  get s() { return S; },
  get settings() { return S.settings; },
  get accounts() { return S.accounts; },
  get categories() { return S.categories; },
  get txs() { return S.txs; },
  get recurring() { return S.recurring; },
  get presets() { return S.presets; },
  get version() { return version; },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

export const account = id => S.accounts.find(a => a.id === id);
export const category = id => S.categories.find(c => c.id === id);
export const activeAccounts = () => S.accounts.filter(a => !a.archived).sort((a, b) => a.order - b.order);
export const methodOf = accountId => {
  const t = account(accountId)?.type;
  return t === 'cash' ? 'cash' : t === 'card' ? 'card' : 'upi';
};

// transactions
export function addTx(data) {
  if (!isReady()) return null;
  const t = normTx({ ...data, id: undefined, createdAt: Date.now() });
  if (!t) return null;
  S.txs.push(t);
  sortTxs();
  if (t.type === 'expense' || t.type === 'income') S.settings.lastAcct[t.type] = t.accountId;
  commit({ txPut: [t], meta: ['settings'] });
  return t;
}

export function updateTx(id, patch) {
  const i = S.txs.findIndex(t => t.id === id);
  if (i < 0) return null;
  const t = normTx({ ...S.txs[i], ...patch, id, createdAt: S.txs[i].createdAt, updatedAt: Date.now() });
  if (!t) return null;
  S.txs[i] = t;
  sortTxs();
  commit({ txPut: [t] });
  return t;
}

export function deleteTx(id) {
  const i = S.txs.findIndex(t => t.id === id);
  if (i < 0) return null;
  const [t] = S.txs.splice(i, 1);
  commit({ txDel: [id] });
  return t;
}

export function restoreTx(t) {
  if (!t || S.txs.some(x => x.id === t.id)) return;
  const n = normTx(t);
  if (!n) return;
  S.txs.push(n);
  sortTxs();
  commit({ txPut: [n] });
}

const minutesOf = hhmm => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * Add payments read from bank alerts in one commit. Each item is {id, ref, tx}.
 *  - `ref` already in the ledger → skipped (a re-delivered alert is never counted twice).
 *  - a payment you already logged by hand (same amount/account/type, no reference yet, within
 *    45 minutes) is linked to the alert instead of being added again.
 * Returns {created, matched, done}: `done` are the ids that are safely stored.
 */
export function importAutoTxs(list) {
  if (!isReady()) return { created: [], matched: [], done: [] };
  const known = new Set(S.txs.map(t => t.ref).filter(Boolean));
  const created = [], matched = [], done = [];
  for (const d of list) {
    if (d.ref && known.has(d.ref)) { done.push(d.id); continue; }
    const t = normTx({ ...d.tx, id: undefined, ref: d.ref, createdAt: Date.now() });
    if (!t) continue; // unusable (e.g. account was deleted): stays queued for another try
    const manual = S.txs.find(x => !x.ref && x.type === t.type && x.amount === t.amount && x.accountId === t.accountId
      && x.date === t.date && Math.abs(minutesOf(x.time) - minutesOf(t.time)) <= 45);
    if (manual) {
      manual.ref = t.ref; manual.updatedAt = Date.now();
      matched.push(manual);
    } else {
      S.txs.push(t);
      created.push(t);
    }
    if (t.ref) known.add(t.ref);
    done.push(d.id);
  }
  if (created.length || matched.length) { sortTxs(); commit({ txPut: [...created, ...matched] }); }
  return { created, matched, done };
}

/** An automatically logged payment that looks like the one being entered by hand (else null). */
export function findAutoDuplicate({ type, amount, accountId, date, time }) {
  if (type !== 'expense' && type !== 'income') return null;
  const a = Math.abs(int(amount));
  return S.txs.find(t => t.ref && t.type === type && t.amount === a && t.accountId === accountId && t.date === date
    && Math.abs(minutesOf(t.time) - minutesOf(time)) <= 60) || null;
}

// settings
export function setSettings(patch) {
  Object.assign(S.settings, patch);
  commit({ meta: ['settings'] });
  syncUIPrefs();
}

// ---------------------------------------------------------------- quick buttons (one-tap presets)

export function defaultPresets(code) {
  return PRESET_SEED.map((p, i) => ({
    id: 'p_' + uid().slice(0, 8), type: 'expense', label: p.label, note: p.label,
    amount: localPrice(p.amount, code), method: p.method, accountId: null, toAccountId: null, categoryId: p.categoryId, order: i,
  }));
}

function normPreset(p, i = 0) {
  if (!p || !p.id) return null;
  const amount = Math.abs(int(p.amount));
  if (!amount) return null;
  return {
    id: str(p.id, 40),
    type: ['expense', 'income', 'transfer'].includes(p.type) ? p.type : 'expense',
    label: str(p.label || p.note || 'Quick add', 28),
    note: str(p.note, 140),
    amount,
    method: ['cash', 'upi', 'card'].includes(p.method) ? p.method : null,
    accountId: p.accountId ? str(p.accountId, 40) : null,
    toAccountId: p.toAccountId ? str(p.toAccountId, 40) : null,
    categoryId: p.categoryId ? str(p.categoryId, 40) : null,
    order: int(p.order, i),
  };
}

export const presetList = () => [...S.presets].sort((a, b) => a.order - b.order);
export const preset = id => S.presets.find(p => p.id === id);

/** Which account(s) a quick button will use right now. */
export function resolvePreset(p) {
  const acts = activeAccounts();
  let from = acts.find(a => a.id === p.accountId);
  if (!from && p.method) from = p.method === 'upi' ? acts.find(a => a.type === 'upi') || acts.find(a => a.type === 'bank') : acts.find(a => a.type === p.method);
  if (!from) from = acts.find(a => a.id === S.settings.lastAcct?.[p.type === 'income' ? 'income' : 'expense']) || acts.find(a => a.type !== 'card') || acts[0];
  let to;
  if (p.type === 'transfer') to = (acts.find(a => a.id === p.toAccountId && a.id !== from?.id) || acts.find(a => a.id !== from?.id))?.id;
  return { accountId: from?.id, toAccountId: to };
}

/** One tap: log the quick button as today's transaction. */
export function usePreset(id) {
  const p = preset(id);
  if (!p) return null;
  const r = resolvePreset(p);
  return addTx({ type: p.type, amount: p.amount, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: p.categoryId, note: p.note || p.label, date: todayKey(), time: nowTime() });
}

export function addPreset(p) {
  const n = normPreset({ ...p, id: 'p_' + uid().slice(0, 8), order: S.presets.length ? Math.max(...S.presets.map(x => x.order)) + 1 : 0 });
  if (!n) return null;
  S.presets.push(n);
  S.settings.presetsTouched = true;
  commit({ meta: ['presets', 'settings'] });
  return n;
}
export function updatePreset(id, patch) {
  const i = S.presets.findIndex(p => p.id === id);
  if (i < 0) return null;
  S.presets[i] = normPreset({ ...S.presets[i], ...patch, id }, i);
  S.settings.presetsTouched = true;
  commit({ meta: ['presets', 'settings'] });
  return S.presets[i];
}
export function removePreset(id) {
  S.presets = S.presets.filter(p => p.id !== id);
  S.settings.presetsTouched = true;
  commit({ meta: ['presets', 'settings'] });
}
export function movePreset(id, dir) {
  const list = presetList();
  const i = list.findIndex(p => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((p, k) => { p.order = k; });
  S.settings.presetsTouched = true;
  commit({ meta: ['presets', 'settings'] });
}
/** Restore the default buttons (in the current currency). */
export function resetPresets() {
  S.presets = defaultPresets(S.settings.currency);
  S.settings.presetsTouched = false;
  commit({ meta: ['presets', 'settings'] });
}
/** After onboarding picks a currency, re-price untouched defaults. */
export function repricePresets(code) {
  if (S.settings.presetsTouched) return;
  S.presets = defaultPresets(code);
  commit({ meta: ['presets'] });
}

/** Switch currency; amounts are relabelled (not FX-converted) but keep their face value. */
export function changeCurrency(code, fromDecimals, toDecimals) {
  const k = 10 ** (toDecimals - fromDecimals);
  if (k !== 1) {
    const sc = v => { const r = Math.round(v * k); return v && !r ? Math.sign(v) : r; };
    for (const t of S.txs) t.amount = sc(t.amount);
    for (const a of S.accounts) { a.opening = sc(a.opening || 0); if (a.limit) a.limit = sc(a.limit); }
    for (const c of S.categories) if (c.budget) c.budget = sc(c.budget);
    for (const r of S.recurring) r.amount = sc(r.amount);
    for (const p of S.presets) p.amount = sc(p.amount);
    S.settings.budget = sc(S.settings.budget || 0);
  }
  S.settings.currency = code;
  commit({ all: true });
}

export function syncUIPrefs() {
  const s = S.settings;
  db.writeUI({ theme: s.theme, accent: s.accent, note: s.note, glass: s.glass, motion: s.motion, hide: !!s.hideOnLaunch });
}

// accounts
export function addAccount(a) {
  const n = normAccount({ ...a, id: a.id || (a.type || 'acct') + '_' + uid().slice(0, 8), order: S.accounts.length, createdAt: Date.now() });
  if (!n) return null;
  S.accounts.push(n);
  commit({ meta: ['accounts'] });
  return n;
}

export function updateAccount(id, patch) {
  const i = S.accounts.findIndex(a => a.id === id);
  if (i < 0) return null;
  const n = normAccount({ ...S.accounts[i], ...patch, id });
  S.accounts[i] = n;
  commit({ meta: ['accounts'] });
  return n;
}

export const accountTxCount = id => S.txs.reduce((n, t) => n + (t.accountId === id || t.toAccountId === id ? 1 : 0), 0);

/** Deletes an unused account, archives one with history. Returns 'deleted' | 'archived'. */
export function removeAccount(id) {
  const used = accountTxCount(id) > 0 || S.recurring.some(r => r.accountId === id || r.toAccountId === id);
  if (used) {
    updateAccount(id, { archived: true });
    return 'archived';
  }
  S.accounts = S.accounts.filter(a => a.id !== id);
  commit({ meta: ['accounts'] });
  return 'deleted';
}

/** Reconcile: set the account's current balance by recording an adjustment. */
export function setBalance(id, target) {
  const cur = balances().get(id) || 0;
  const delta = target - cur;
  if (!delta) return null;
  return addTx({ type: 'adjust', amount: delta, accountId: id, note: 'Balance adjustment', date: todayKey(), time: nowTime() });
}

// categories
export function addCategory(c) {
  const n = normCategory({ ...c, id: 'c_' + uid().slice(0, 8), order: S.categories.length });
  S.categories.push(n);
  commit({ meta: ['categories'] });
  return n;
}
export function updateCategory(id, patch) {
  const i = S.categories.findIndex(c => c.id === id);
  if (i < 0) return null;
  S.categories[i] = normCategory({ ...S.categories[i], ...patch, id });
  commit({ meta: ['categories'] });
  return S.categories[i];
}
export function removeCategory(id) {
  const c = category(id);
  if (!c || id === 'other' || id === 'other_in') return false;
  const fallback = c.kind === 'income' ? 'other_in' : 'other';
  const moved = [];
  for (const t of S.txs) if (t.categoryId === id) { t.categoryId = fallback; t.updatedAt = Date.now(); moved.push(t); }
  for (const r of S.recurring) if (r.categoryId === id) r.categoryId = fallback;
  S.categories = S.categories.filter(x => x.id !== id);
  commit({ txPut: moved, meta: ['categories', 'recurring'] });
  return true;
}

// recurring
export function addRecurring(r) {
  const n = normRecurring({ ...r, id: 'r_' + uid().slice(0, 8), createdAt: Date.now() });
  if (!n) return null;
  S.recurring.push(n);
  commit({ meta: ['recurring'] });
  return n;
}
export function updateRecurring(id, patch) {
  const i = S.recurring.findIndex(r => r.id === id);
  if (i < 0) return null;
  S.recurring[i] = normRecurring({ ...S.recurring[i], ...patch, id });
  commit({ meta: ['recurring'] });
  return S.recurring[i];
}
export function removeRecurring(id) {
  S.recurring = S.recurring.filter(r => r.id !== id);
  commit({ meta: ['recurring'] });
}

/** Create any due recurring transactions (catch-up capped at 36 periods each). */
export function processRecurring() {
  const today = todayKey();
  const created = [];
  for (const r of S.recurring) {
    if (!r.active) continue;
    let guard = 0;
    while (r.next <= today && guard++ < 36) {
      const t = normTx({ type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, note: r.note, date: r.next, time: '09:00', recurringId: r.id });
      if (t) { S.txs.push(t); created.push(t); }
      r.next = dateInMonth(addMonths(r.next.slice(0, 7), 1), r.day);
    }
  }
  if (created.length) { sortTxs(); commit({ txPut: created, meta: ['recurring'] }); }
  return created;
}

export function nextOccurrence(day, from = todayKey()) {
  const mk = from.slice(0, 7);
  const d = dateInMonth(mk, day);
  return d > from ? d : dateInMonth(addMonths(mk, 1), day);
}

// whole-state operations
export function replaceAll(data, { keepSettings = false } = {}) {
  const prev = S.settings;
  S = hydrate({ ...data, rev: S.rev });
  if (keepSettings) S.settings = { ...S.settings, ...pickUI(prev) };
  partial = false;
  commit({ all: true });
  syncUIPrefs();
}
const pickUI = s => ({ theme: s.theme, accent: s.accent, note: s.note, glass: s.glass, motion: s.motion, haptics: s.haptics });

export async function eraseAll() {
  const ui = pickUI(S.settings);
  const rev = S.rev || 0;
  S = freshState();
  S.rev = rev;
  Object.assign(S.settings, ui);
  partial = false;
  await db.clearIDB();
  commit({ all: true });
  syncUIPrefs();
}

export function exportData() {
  return {
    app: 'benjamins',
    format: 1,
    version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1',
    exportedAt: new Date().toISOString(),
    currency: S.settings.currency,
    data: { settings: { ...S.settings, lock: null }, accounts: S.accounts, categories: S.categories, recurring: S.recurring, presets: S.presets, txs: S.txs },
  };
}

/** Validate a backup file. Returns {ok, data?, error?, summary?} */
export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t valid JSON.' }; }
  const d = j?.app === 'benjamins' ? j.data : j?.txs ? j : null;
  if (!d || !Array.isArray(d.txs) || !Array.isArray(d.accounts)) return { ok: false, error: 'This doesn’t look like a Benjamins backup.' };
  const h = hydrate(d);
  return { ok: true, data: d, summary: { txs: h.txs.length, accounts: h.accounts.length, dropped: d.txs.length - h.txs.length, exportedAt: j.exportedAt } };
}

// ---------------------------------------------------------------- derived data (memoised per version)
function memo(fn) {
  let v = -1, day = '';
  const cache = new Map();
  return (...args) => {
    const today = todayKey();
    if (v !== version || day !== today) { v = version; day = today; cache.clear(); }
    const k = args.length ? args.join('|') : '_';
    if (!cache.has(k)) cache.set(k, fn(...args));
    return cache.get(k);
  };
}
const inc = (m, k, v) => m.set(k, (m.get(k) || 0) + v);

export const balances = memo(() => {
  const b = new Map();
  for (const a of S.accounts) b.set(a.id, a.opening || 0);
  for (const t of S.txs) {
    if (t.type === 'expense') inc(b, t.accountId, -t.amount);
    else if (t.type === 'income') inc(b, t.accountId, t.amount);
    else if (t.type === 'transfer') { inc(b, t.accountId, -t.amount); inc(b, t.toAccountId, t.amount); }
    else if (t.type === 'adjust') inc(b, t.accountId, t.amount);
  }
  return b;
});

export const totals = memo(() => {
  const b = balances();
  let cash = 0, upi = 0, cardDue = 0, cardCredit = 0, limit = 0, cardAvail = 0;
  for (const a of S.accounts) {
    const v = b.get(a.id) || 0;
    if (a.type === 'card') {
      if (v < 0) cardDue -= v; else cardCredit += v;
      if (!a.archived && a.limit) { limit += a.limit; cardAvail += a.limit + v; }
    }
    else if (a.type === 'cash') cash += v;
    else upi += v;
  }
  const liquid = cash + upi;
  // Cards are kept separate: the balance is only the money you actually have.
  return { cash, upi, liquid, cardDue, cardCredit, limit, cardAvail, balance: liquid };
});

const monthIndex = memo(() => {
  const m = new Map();
  for (const t of S.txs) {
    const k = t.date.slice(0, 7);
    let arr = m.get(k);
    if (!arr) m.set(k, (arr = []));
    arr.push(t);
  }
  return m;
});
export const txsOfMonth = mk => monthIndex().get(mk) || [];
export const monthsWithData = memo(() => [...monthIndex().keys()].sort().reverse());

export const monthStats = memo(mk => {
  const txs = txsOfMonth(mk);
  const dim = daysInMonth(mk);
  const r = {
    mk, txs, income: 0, expense: 0, expCount: 0, incCount: 0,
    byCat: new Map(), incByCat: new Map(), byAcct: new Map(),
    byMethod: { cash: 0, upi: 0, card: 0 },
    byDay: new Array(dim).fill(0), incByDay: new Array(dim).fill(0),
    byWeekday: new Array(7).fill(0), biggest: null,
  };
  for (const t of txs) {
    const day = +t.date.slice(8) - 1;
    if (t.type === 'expense') {
      r.expense += t.amount; r.expCount++;
      inc(r.byCat, t.categoryId, t.amount);
      inc(r.byAcct, t.accountId, t.amount);
      r.byMethod[methodOf(t.accountId)] += t.amount;
      r.byDay[day] += t.amount;
      r.byWeekday[new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, day + 1).getDay()] += t.amount;
      if (!r.biggest || t.amount > r.biggest.amount) r.biggest = t;
    } else if (t.type === 'income') {
      r.income += t.amount; r.incCount++;
      inc(r.incByCat, t.categoryId, t.amount);
      r.incByDay[day] += t.amount;
    }
  }
  r.net = r.income - r.expense;
  return r;
});

/**
 * Running balance (cash + GPay/bank) over the last `days` days, as [x 0..1, value] points for the
 * Home sparkline. Every transaction is its own short, steep step at the moment it happened, so a
 * spend always shows as a drop, even on a day that also had income (a per-day series only shows
 * the day's net). A history younger than the window starts just before its first transaction
 * instead of drawing weeks of flat line with everything crammed into the last pixel.
 */
export function balanceSeries(days) {
  const now = Date.now();
  const today = todayKey();
  const startKey = addDays(today, -(days - 1));
  const from = parseKey(startKey).getTime();
  const cards = new Set(S.accounts.filter(a => a.type === 'card').map(a => a.id));
  const on = id => (id && !cards.has(id) ? 1 : 0);
  const effect = t => {
    if (t.type === 'income' || t.type === 'adjust') return on(t.accountId) * t.amount;
    if (t.type === 'expense') return -on(t.accountId) * t.amount;
    if (t.type === 'transfer') return (on(t.toAccountId) - on(t.accountId)) * t.amount;
    return 0;
  };
  // logged on its own day: the moment it was logged; back-dated or imported: midday on its date
  const when = t => {
    const c = new Date(t.createdAt || 0);
    return Math.min(now, keyOf(c) === t.date ? c.getTime() : parseKey(t.date).getTime() + 43200000);
  };
  let bal = totals().balance;
  const ev = [];
  for (const t of S.txs) {
    const e = effect(t);
    if (t.date > today) { bal -= e; continue; }
    if (t.date < startKey) break;
    if (e) ev.push([when(t), e]);
  }
  if (!ev.length) return [[0, bal], [1, bal]];
  ev.sort((a, b) => a[0] - b[0]);
  const first = ev[0][0];
  const t0 = Math.max(from, first - Math.max((now - first) * 0.15, 3600000));
  const span = Math.max(1, now - t0);
  const ramp = 0.012; // width of one step, as a share of the chart
  let b = ev.reduce((s, [, e]) => s - e, bal); // balance at t0
  const pts = [[0, b]];
  for (const [t, e] of ev) {
    const x = Math.max(0, (t - t0) / span);
    pts.push([Math.max(pts[pts.length - 1][0], x - ramp), b]);
    b += e;
    pts.push([Math.max(pts[pts.length - 1][0], x), b]);
  }
  pts.push([1, b]);
  return pts;
}

export const trend = memo((mk, n) => {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addMonths(mk, -i);
    const s = monthStats(k);
    out.push({ mk: k, income: s.income, expense: s.expense });
  }
  return out;
});

/** Frequent (category, account, amount, note) combos → one-tap quick add. */
export const suggestions = memo(() => {
  const since = addDays(todayKey(), -120);
  const map = new Map();
  for (const t of S.txs) {
    if (t.date < since) break;
    if (t.type !== 'expense') continue;
    const key = `${t.categoryId}|${t.accountId}|${t.amount}|${t.note.toLowerCase()}`;
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { count: 1, t });
  }
  return [...map.values()]
    .filter(e => e.count >= 2 && account(e.t.accountId) && !account(e.t.accountId).archived)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(e => e.t);
});

export const catOrder = memo(kind => {
  const since = addDays(todayKey(), -180);
  const cnt = new Map();
  for (const t of S.txs) {
    if (t.date < since) break;
    if (t.type === kind) inc(cnt, t.categoryId, 1);
  }
  return S.categories
    .filter(c => c.kind === kind && !c.archived)
    .sort((a, b) => (cnt.get(b.id) || 0) - (cnt.get(a.id) || 0) || a.order - b.order);
});

export function cardInfo(a) {
  const bal = balances().get(a.id) || 0;
  const due = Math.max(0, -bal);
  const util = a.limit ? due / a.limit : 0;
  let nextDue = null, daysToDue = null;
  if (a.dueDay) {
    nextDue = nextOccurrence(a.dueDay, addDays(todayKey(), -1));
    daysToDue = dayDiff(todayKey(), nextDue);
  }
  return { bal, due, util, available: a.limit ? a.limit - due : null, nextDue, daysToDue };
}

export const upcoming = memo(() => {
  const out = [];
  const today = todayKey();
  for (const a of S.accounts) {
    if (a.type !== 'card' || a.archived) continue;
    const ci = cardInfo(a);
    if (ci.due > 0 && ci.daysToDue != null && ci.daysToDue <= 10) out.push({ kind: 'card', account: a, days: ci.daysToDue, amount: ci.due, date: ci.nextDue });
  }
  for (const r of S.recurring) {
    if (!r.active) continue;
    const d = dayDiff(today, r.next);
    if (d >= 0 && d <= 5) out.push({ kind: 'recurring', r, days: d, amount: r.amount, date: r.next });
  }
  return out.sort((a, b) => a.days - b.days);
});

/** Transactions touching an account, newest first, with running balance after each. */
// ---------------------------------------------------------------- budgets & forecast
const WARN_AT = 0.8;

/**
 * After an expense is saved: a short warning if it just pushed its category (or the whole month)
 * past 80% or 100% of a budget, else null. Meant for the "Spent ₹X" toast.
 */
export function budgetCrossing(t) {
  if (!t || t.type !== 'expense' || !isReady()) return null;
  const ms = monthStats(t.date.slice(0, 7));
  const check = (label, spent, budget) => {
    if (!(budget > 0)) return null;
    const before = spent - t.amount;
    if (spent > budget && before <= budget) return { over: true, text: `${label}: over budget by ${money(spent - budget)}` };
    if (spent >= budget * WARN_AT && before < budget * WARN_AT) return { over: false, text: `${label} is at ${Math.round((spent / budget) * 100)}% of its budget` };
    return null;
  };
  const c = category(t.categoryId);
  const a = check(`${c?.emoji || ''} ${c?.name || 'Category'}`.trim(), ms.byCat.get(t.categoryId) || 0, c?.budget || 0);
  const b = check('Monthly budget', ms.expense, S.settings.budget);
  const hit = [a, b].filter(Boolean).sort((x, y) => y.over - x.over)[0];
  return hit ? hit.text : null;
}

/** Categories at or past 80% of their monthly budget (this month), worst first. */
export const budgetWatch = memo(() => {
  const ms = monthStats(todayKey().slice(0, 7));
  const out = [];
  for (const c of S.categories) {
    if (c.archived || !(c.budget > 0) || c.kind !== 'expense') continue;
    const spent = ms.byCat.get(c.id) || 0;
    if (spent >= c.budget * WARN_AT) out.push({ category: c, spent, budget: c.budget, pct: Math.round((spent / c.budget) * 100) });
  }
  return out.sort((a, b) => b.pct - a.pct);
});

const FIXED_CATS = new Set(['rent', 'emi', 'bills', 'subscriptions', 'education']);

/**
 * Month-end spending forecast: what is already spent, plus everyday spending at the pace so far
 * for the days left, plus recurring payments still due this month. Fixed bills and recurring
 * payments are kept out of the pace so a big rent payment on day 1 doesn't inflate it.
 */
export const forecast = memo(() => {
  const today = todayKey();
  const mk = today.slice(0, 7);
  const dim = daysInMonth(mk);
  const dayN = +today.slice(8);
  const ms = monthStats(mk);
  if (dayN < 3 || ms.expCount < 2) return null;
  let flex = 0;
  for (const t of ms.txs) if (t.type === 'expense' && !t.recurringId && !FIXED_CATS.has(t.categoryId)) flex += t.amount;
  const daysLeft = dim - dayN;
  let coming = 0;
  for (const r of S.recurring) {
    if (r.active && r.type === 'expense' && r.next > today && r.next.startsWith(mk)) coming += r.amount;
  }
  const proj = Math.round(ms.expense + (flex / dayN) * daysLeft + coming);
  return { proj, spent: ms.expense, dayN, dim, daysLeft, coming };
});

export const accountLedger = memo(id => {
  const list = S.txs.filter(t => t.accountId === id || t.toAccountId === id);
  let bal = balances().get(id) || 0;
  return list.map(t => {
    const after = bal;
    let delta = 0;
    if (t.type === 'expense') delta = -t.amount;
    else if (t.type === 'income' || t.type === 'adjust') delta = t.amount;
    else if (t.type === 'transfer') delta = t.accountId === id ? -t.amount : t.amount;
    bal -= delta;
    return { t, delta, after };
  });
});

export const stats = memo(() => ({ txCount: S.txs.length, accounts: S.accounts.length, firstDate: S.txs.length ? S.txs[S.txs.length - 1].date : null }));
