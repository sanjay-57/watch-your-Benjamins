// Shared render helpers for views and sheets.
import { html, raw, esc, hexToRgb } from '../core/util.js';
import { noteInk } from '../ui/notes.js';
import { money } from '../core/money.js';
import { fmtDay, fmtTime } from '../core/dates.js';
import { account, category, CARD_THEMES, LIGHT_CARDS } from '../core/store.js';
import { icon } from '../ui/icons.js';

export const METHOD = {
  cash: { label: 'Cash', icon: 'cash', rgb: 'var(--m-cash-rgb)' },
  upi: { label: 'GPay / UPI', icon: 'upi', rgb: 'var(--m-upi-rgb)' },
  bank: { label: 'Bank', icon: 'bank', rgb: 'var(--m-upi-rgb)' },
  card: { label: 'Credit card', icon: 'card', rgb: 'var(--m-card-rgb)' },
};

export const acctIcon = a => METHOD[a?.type]?.icon || 'wallet';
export function acctRGB(a) {
  if (!a) return '126 138 128';
  if (a.type === 'card') return hexToRgb((CARD_THEMES[a.theme] || CARD_THEMES.greenback)[0]);
  return METHOD[a.type]?.rgb || 'var(--accent-rgb)';
}
/** Glyph colour for a fixed (non-theme) background: cards carry their own ink. */
export const acctOn = a => (a?.type === 'card' ? (LIGHT_CARDS.has(a.theme) ? '#0f1a13' : '#f7f5ea') : 'var(--on-color)');
export const acctGlyph = (a, cls = '') => raw(`<span class="mglyph ${cls}" style="--c:${acctRGB(a)};--on:${acctOn(a)}">${icon(acctIcon(a))}</span>`);
export const catRGB = c => hexToRgb(noteInk(c?.color || '#7E8A80'));

export function acctSub(a, bal) {
  if (a.type === 'card') return a.last4 ? `•••• ${a.last4}` : 'Credit card';
  if (a.type === 'cash') return 'In hand';
  if (a.type === 'bank') return 'Bank account';
  return 'UPI · linked bank';
}

/** Title for a transaction row. */
export function txTitle(t) {
  if (t.note) return t.note;
  if (t.type === 'transfer') {
    const to = account(t.toAccountId);
    if (to?.type === 'card') return `${to.name} bill payment`;
    const from = account(t.accountId);
    if (from?.type !== 'cash' && to?.type === 'cash') return 'Cash withdrawal';
    return 'Transfer';
  }
  if (t.type === 'adjust') return 'Balance adjustment';
  return category(t.categoryId)?.name || 'Transaction';
}

export function txAmount(t, { signed = true } = {}) {
  if (t.type === 'expense') return money(-t.amount);
  if (t.type === 'income') return money(t.amount, { sign: signed ? 'always' : 'auto' });
  if (t.type === 'adjust') return money(t.amount, { sign: 'always' });
  return money(t.amount);
}

export function txBadge(t, ring = 'var(--bg)') {
  const a = account(t.accountId);
  if (t.type === 'transfer') {
    return `<span class="ebadge" style="--c:var(--xfer-rgb)"><svg class="i" style="color:var(--xfer)"><use href="#i-transfer"/></svg></span>`;
  }
  if (t.type === 'adjust') {
    return `<span class="ebadge" style="--c:126 138 128"><svg class="i" style="color:var(--t2)"><use href="#i-adjust"/></svg></span>`;
  }
  const c = category(t.categoryId);
  return `<span class="ebadge" style="--c:${catRGB(c)}">${esc(c?.emoji || '🏷️')}<span class="m" style="--mc:${acctRGB(a)};--on:${acctOn(a)};--ring:${ring}">${icon(acctIcon(a))}</span></span>`;
}

export function txMeta(t) {
  const a = account(t.accountId);
  if (t.type === 'transfer') {
    const to = account(t.toAccountId);
    return `<span class="ellip">${esc(a?.name || '?')}</span>${icon('chev-r', 'xs')}<span class="ellip">${esc(to?.name || '?')}</span>`;
  }
  const c = category(t.categoryId);
  const first = t.type === 'adjust' ? 'Adjustment' : (t.note ? c?.name : null);
  return `${first ? `<span class="ellip">${esc(first)}</span><i class="dot"></i>` : ''}<span class="ellip">${esc(a?.name || '?')}</span>${t.recurringId ? `<i class="dot"></i>${icon('repeat', 'xs')}` : ''}`;
}

let flashId = null;
export const flashTx = id => { flashId = id; };

/** A swipeable transaction row. opts.sub: override right-hand sub text */
export function txRow(t, { sub, ring } = {}) {
  const f = t.id === flashId;
  if (f) flashId = null;
  return `<div class="tx-swipe" data-id="${esc(t.id)}">
    <div class="tx-actions" aria-hidden="true"><button data-act="swipe-del" tabindex="-1">${icon('trash', 'sm')}Delete</button></div>
    <button class="tx ${t.type}${f ? ' flash' : ''}" data-act="open-tx" data-id="${esc(t.id)}">
      ${txBadge(t, ring)}
      <span class="main"><span class="title ellip" style="display:block">${esc(txTitle(t))}</span><span class="meta">${txMeta(t)}</span></span>
      <span class="amt-col"><span class="amount amt">${esc(txAmount(t))}</span><span class="sub-amt">${esc(sub ?? fmtTime(t.time))}</span></span>
    </button>
  </div>`;
}

/** Group transactions by day → [{date, items, spent, earned}] */
export function groupByDay(list) {
  const out = [];
  let cur = null;
  for (const t of list) {
    if (!cur || cur.date !== t.date) { cur = { date: t.date, items: [], spent: 0, earned: 0 }; out.push(cur); }
    cur.items.push(t);
    if (t.type === 'expense') cur.spent += t.amount;
    else if (t.type === 'income') cur.earned += t.amount;
  }
  return out;
}

export function dayGroupHTML(g, opts) {
  const tot = g.spent ? money(-g.spent) : g.earned ? money(g.earned, { sign: 'always' }) : '';
  return `<div class="tx-day">
    <div class="tx-day-h"><span>${esc(fmtDay(g.date))}</span><span class="num amt">${esc(tot)}</span></div>
    <div class="glass group">${g.items.map(t => txRow(t, opts)).join('')}</div>
  </div>`;
}

export function emptyState({ emoji = '✨', title, text, action = '', act = '' }) {
  return `<div class="empty">
    <div class="orb glass">${emoji}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action ? `<button class="btn md glass tint btn-primary press" data-act="${esc(act)}" style="margin-top:8px">${esc(action)}</button>` : ''}
  </div>`;
}

export { html, raw, esc };
