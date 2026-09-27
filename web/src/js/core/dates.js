// Dates are stored as local calendar keys 'YYYY-MM-DD' (immune to timezone drift).
import { cur } from './money.js';

const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => keyOf(new Date());
export const parseKey = k => {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const monthOf = k => String(k).slice(0, 7);
export const thisMonth = () => todayKey().slice(0, 7);
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
export function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const daysInMonth = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const isValidKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(parseKey(k)) === k;
export const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
/** Clamp a day-of-month into a given month: dateInMonth('2026-02', 31) → '2026-02-28' */
export const dateInMonth = (mk, day) => `${mk}-${pad(Math.min(day, daysInMonth(mk)))}`;

const cache = new Map();
function dtf(opts) {
  const key = cur().locale + JSON.stringify(opts);
  if (!cache.has(key)) {
    try { cache.set(key, new Intl.DateTimeFormat(cur().locale, opts)); }
    catch { cache.set(key, new Intl.DateTimeFormat('en-US', opts)); }
  }
  return cache.get(key);
}

export function fmtDay(k, { relative = true, weekday = true } = {}) {
  const t = todayKey();
  if (relative) {
    if (k === t) return 'Today';
    if (k === addDays(t, -1)) return 'Yesterday';
    if (k === addDays(t, 1)) return 'Tomorrow';
  }
  const d = parseKey(k);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return dtf({ weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }).format(d);
}
export const fmtShortDate = k => dtf({ day: 'numeric', month: 'short' }).format(parseKey(k));
export const fmtMonth = (mk, { short = false, year = true } = {}) =>
  dtf({ month: short ? 'short' : 'long', year: year ? 'numeric' : undefined }).format(parseKey(mk + '-01'));
export const weekdayShort = i => dtf({ weekday: 'short' }).format(new Date(2024, 0, 7 + i)); // 2024-01-07 is a Sunday

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return dtf({ hour: 'numeric', minute: '2-digit' }).format(d);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

export const ordinal = n => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
