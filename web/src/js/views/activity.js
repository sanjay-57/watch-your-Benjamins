import { $, esc, debounce } from '../core/util.js';
import { money, plainNumber, fromMinor } from '../core/money.js';
import { fmtMonth, thisMonth } from '../core/dates.js';
import { store, account, category, methodOf, monthsWithData } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { openMenu } from '../ui/overlays.js';
import { groupByDay, dayGroupHTML, emptyState } from './common.js';

export const F = { q: '', type: 'all', method: 'all', month: 'all', cat: null, acct: null, limit: 150 };

export function setActivityFilter(patch) {
  Object.assign(F, { q: '', type: 'all', method: 'all', month: 'all', cat: null, acct: null, limit: 150 }, patch);
}

function hay(t) {
  const c = category(t.categoryId), a = account(t.accountId), b = account(t.toAccountId);
  return `${t.note} ${c?.name || ''} ${a?.name || ''} ${b?.name || ''} ${plainNumber(t.amount)} ${fromMinor(Math.abs(t.amount))} ${t.type}`.toLowerCase();
}

function filtered() {
  const q = F.q.trim().toLowerCase();
  return store.txs.filter(t => {
    if (F.type !== 'all' && t.type !== F.type) return false;
    if (F.method !== 'all') {
      const m = methodOf(t.accountId);
      if (t.type === 'transfer') { if (m !== F.method && methodOf(t.toAccountId) !== F.method) return false; }
      else if (m !== F.method) return false;
    }
    if (F.month !== 'all' && !t.date.startsWith(F.month)) return false;
    if (F.cat && t.categoryId !== F.cat) return false;
    if (F.acct && t.accountId !== F.acct && t.toAccountId !== F.acct) return false;
    if (q && !hay(t).includes(q)) return false;
    return true;
  });
}

function listHTML(list) {
  if (!list.length) {
    const any = store.txs.length;
    return `<div class="glass" style="border-radius:var(--r-lg);margin-top:14px">${any
      ? emptyState({ emoji: '🔎', title: 'No matches', text: 'Try a different search or clear the filters.', action: 'Clear filters', act: 'clear' })
      : emptyState({ emoji: '🧾', title: 'Nothing logged yet', text: 'Your expenses, income and transfers will appear here, grouped by day.', action: 'Add transaction', act: 'add' })}</div>`;
  }
  const shown = list.slice(0, F.limit);
  let out = '';
  let month = null;
  const monthTotals = new Map();
  for (const t of list) {
    const mk = t.date.slice(0, 7);
    const m = monthTotals.get(mk) || { spent: 0, earned: 0 };
    if (t.type === 'expense') m.spent += t.amount;
    else if (t.type === 'income') m.earned += t.amount;
    monthTotals.set(mk, m);
  }
  for (const g of groupByDay(shown)) {
    const mk = g.date.slice(0, 7);
    if (mk !== month) {
      month = mk;
      const m = monthTotals.get(mk);
      out += `<div class="month-h"><h3>${esc(fmtMonth(mk, { year: mk.slice(0, 4) !== thisMonth().slice(0, 4) }))}</h3><span class="amt">${m.spent ? '−' + esc(money(m.spent)) : ''}${m.spent && m.earned ? ' · ' : ''}${m.earned ? '+' + esc(money(m.earned)) : ''}</span></div>`;
    }
    out += dayGroupHTML(g);
  }
  if (list.length > F.limit) out += `<div id="act-more" style="height:60px;display:grid;place-items:center" class="t-foot t3">Loading more…</div>`;
  return out;
}

function summaryHTML(list) {
  let spent = 0, earned = 0;
  for (const t of list) { if (t.type === 'expense') spent += t.amount; else if (t.type === 'income') earned += t.amount; }
  return `
    <div class="cell2"><div class="k">Entries</div><div class="v">${list.length}</div></div>
    <div class="cell2"><div class="k">Spent</div><div class="v amt">${esc(money(spent))}</div></div>
    <div class="cell2"><div class="k">Received</div><div class="v amt pos">${esc(money(earned))}</div></div>`;
}

const TYPE_CHIPS = [['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];
const METHOD_CHIPS = [['cash', 'Cash', 'cash'], ['upi', 'GPay/UPI', 'upi'], ['card', 'Cards', 'card']];

function chipsHTML() {
  const extra = [];
  if (F.cat) { const c = category(F.cat); extra.push(`<button class="chip on" data-act="clear-cat">${esc(c?.emoji || '')} ${esc(c?.name || 'Category')} ${icon('close', 'xs')}</button>`); }
  if (F.acct) { const a = account(F.acct); extra.push(`<button class="chip on" data-act="clear-acct">${esc(a?.name || 'Account')} ${icon('close', 'xs')}</button>`); }
  return `${extra.join('')}
    <button class="chip ${F.month !== 'all' ? 'on' : ''}" data-act="month">${icon('calendar')}${esc(F.month === 'all' ? 'All time' : fmtMonth(F.month, { short: true }))}${icon('chev-d', 'xs')}</button>
    ${TYPE_CHIPS.map(([k, l]) => `<button class="chip" data-type="${k}" aria-pressed="${F.type === k}">${l}</button>`).join('')}
    <span style="width:1px;flex:none;background:var(--sep);margin:6px 2px"></span>
    ${METHOD_CHIPS.map(([k, l, ic]) => `<button class="chip" data-method="${k}" aria-pressed="${F.method === k}">${icon(ic)}${l}</button>`).join('')}`;
}

let io = null;

export function renderActivity(root) {
  const list = filtered();
  root.innerHTML = `
  <div class="scroller" data-scroller>
    <div class="page enter">
      <header class="lt" style="--n:0"><div><span class="eyebrow">${store.txs.length} transactions</span><h1>Activity</h1></div></header>
      <label class="searchbar glass" style="--n:1">${icon('search', 'sm')}<input id="act-q" type="search" placeholder="Search notes, categories, amounts" value="${esc(F.q)}" autocomplete="off" enterkeyhint="search">${F.q ? `<button class="icon-btn sm" data-act="clear-q" aria-label="Clear">${icon('x-circle', 'sm')}</button>` : ''}</label>
      <div class="chips" id="act-chips" style="--n:2;margin-top:12px">${chipsHTML()}</div>
      <div class="act-sum glass" id="act-sum" style="--n:3;margin-top:12px">${summaryHTML(list)}</div>
      <div class="tx-list" id="act-list" style="--n:4">${listHTML(list)}</div>
    </div>
  </div>
  <div class="topbar"><div class="topbar-title">Activity</div></div>`;
  observeMore(root);
}

function refreshResults(root) {
  const list = filtered();
  $('#act-sum', root).innerHTML = summaryHTML(list);
  $('#act-list', root).innerHTML = listHTML(list);
  $('#act-chips', root).innerHTML = chipsHTML();
  observeMore(root);
}

function observeMore(root) {
  io?.disconnect();
  const more = $('#act-more', root);
  if (!more) return;
  io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) {
      F.limit += 200;
      const sc = root.querySelector('[data-scroller]');
      const y = sc.scrollTop;
      $('#act-list', root).innerHTML = listHTML(filtered());
      sc.scrollTop = y;
      observeMore(root);
    }
  }, { root: root.querySelector('[data-scroller]'), rootMargin: '600px' });
  io.observe(more);
}

/** Wire Activity-specific events once (called by the app controller). */
export function bindActivity(root, { onAdd }) {
  const search = debounce(() => { F.limit = 150; refreshResults(root); }, 140);
  root.addEventListener('input', e => {
    if (e.target.id !== 'act-q') return;
    F.q = e.target.value;
    search();
  });
  root.addEventListener('keydown', e => { if (e.target.id === 'act-q' && e.key === 'Enter') e.target.blur(); });
  root.addEventListener('click', e => {
    const tb = e.target.closest('[data-type]');
    if (tb && root.contains(tb) && tb.closest('#act-chips')) { F.type = tb.dataset.type; F.limit = 150; return refreshResults(root); }
    const mb = e.target.closest('[data-method]');
    if (mb) { F.method = F.method === mb.dataset.method ? 'all' : mb.dataset.method; F.limit = 150; return refreshResults(root); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'clear-q') { F.q = ''; const i = $('#act-q', root); i.value = ''; refreshResults(root); e.target.closest('[data-act]').remove(); return; }
    if (act === 'clear-cat') { F.cat = null; return refreshResults(root); }
    if (act === 'clear-acct') { F.acct = null; return refreshResults(root); }
    if (act === 'clear') { setActivityFilter({}); const i = $('#act-q', root); if (i) i.value = ''; return refreshResults(root); }
    if (act === 'month') {
      const months = monthsWithData();
      openMenu(e.target.closest('[data-act]'), [
        { label: 'All time', icon: F.month === 'all' ? 'check' : '', onSelect: () => { F.month = 'all'; refreshResults(root); } },
        '-',
        ...months.slice(0, 18).map(mk => ({ label: fmtMonth(mk), icon: F.month === mk ? 'check' : '', onSelect: () => { F.month = mk; F.limit = 150; refreshResults(root); } })),
      ], { align: 'start' });
    }
  });
}
