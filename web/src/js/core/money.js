// Money is stored as integer minor units (paise/cents) — no floating point drift.

export const CURRENCIES = [
  ['INR', '🇮🇳'], ['USD', '🇺🇸'], ['EUR', '🇪🇺'], ['GBP', '🇬🇧'], ['AED', '🇦🇪'], ['SAR', '🇸🇦'],
  ['CAD', '🇨🇦'], ['AUD', '🇦🇺'], ['SGD', '🇸🇬'], ['PKR', '🇵🇰'], ['BDT', '🇧🇩'], ['NPR', '🇳🇵'],
  ['LKR', '🇱🇰'], ['JPY', '🇯🇵'], ['CNY', '🇨🇳'], ['MYR', '🇲🇾'], ['IDR', '🇮🇩'], ['PHP', '🇵🇭'],
  ['THB', '🇹🇭'], ['ZAR', '🇿🇦'], ['NGN', '🇳🇬'], ['KES', '🇰🇪'], ['BRL', '🇧🇷'], ['MXN', '🇲🇽'],
  ['CHF', '🇨🇭'], ['KRW', '🇰🇷'], ['QAR', '🇶🇦'], ['KWD', '🇰🇼'], ['OMR', '🇴🇲'], ['BHD', '🇧🇭'],
  ['NZD', '🇳🇿'], ['HKD', '🇭🇰'], ['TRY', '🇹🇷'], ['EGP', '🇪🇬'], ['VND', '🇻🇳'], ['SEK', '🇸🇪'],
];

const REGION_CURRENCY = {
  IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SA: 'SAR', CA: 'CAD', AU: 'AUD', SG: 'SGD', PK: 'PKR',
  BD: 'BDT', NP: 'NPR', LK: 'LKR', JP: 'JPY', CN: 'CNY', MY: 'MYR', ID: 'IDR', PH: 'PHP', TH: 'THB',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', BR: 'BRL', MX: 'MXN', CH: 'CHF', KR: 'KRW', QA: 'QAR', KW: 'KWD',
  OM: 'OMR', BH: 'BHD', NZ: 'NZD', HK: 'HKD', TR: 'TRY', EG: 'EGP', VN: 'VND', SE: 'SEK',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
};

export function guessCurrency() {
  const langs = [...(navigator.languages || []), navigator.language || ''];
  for (const l of langs) {
    const region = (l.split('-')[1] || '').toUpperCase();
    if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Kolkata|Calcutta/.test(tz)) return 'INR';
    if (/Dubai/.test(tz)) return 'AED';
    if (/Karachi/.test(tz)) return 'PKR';
    if (/London/.test(tz)) return 'GBP';
    if (/^Europe\//.test(tz)) return 'EUR';
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix)/.test(tz)) return 'USD';
  } catch {}
  return 'USD';
}

export function currencyName(code) {
  try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'currency' }).of(code); } catch { return code; }
}

const M = {
  code: 'INR',
  locale: 'en-IN',
  decimals: 2,
  factor: 100,
  symbol: '₹',
  symbolFirst: true,
  whole: null,
  full: null,
  compact: null,
  plain: null,
  group: ',',
  decimal: '.',
};

function pickLocale(code) {
  const nav = navigator.language || 'en-US';
  if (code === 'INR' && !/-IN$/i.test(nav)) return 'en-IN';
  try { return Intl.NumberFormat.supportedLocalesOf([nav]).length ? nav : 'en-US'; } catch { return 'en-US'; }
}

export function setCurrency(code) {
  let locale = pickLocale(code);
  let base;
  try { base = new Intl.NumberFormat(locale, { style: 'currency', currency: code }); }
  catch { code = 'USD'; locale = 'en-US'; base = new Intl.NumberFormat(locale, { style: 'currency', currency: code }); }
  const decimals = base.resolvedOptions().maximumFractionDigits;
  const parts = base.formatToParts(1234567.5);
  const idxCur = parts.findIndex(p => p.type === 'currency');
  const idxInt = parts.findIndex(p => p.type === 'integer');
  Object.assign(M, {
    code, locale, decimals,
    factor: 10 ** decimals,
    symbol: parts[idxCur]?.value || code,
    symbolFirst: idxCur < idxInt,
    group: parts.find(p => p.type === 'group')?.value || ',',
    decimal: parts.find(p => p.type === 'decimal')?.value || '.',
    whole: new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    full: new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    compact: new Intl.NumberFormat(locale, { style: 'currency', currency: code, notation: 'compact', maximumFractionDigits: 1 }),
    plain: new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: decimals }),
  });
}
setCurrency('INR');

export const cur = () => M;
export const toMinor = n => Math.round(Number(n) * M.factor);
export const fromMinor = m => m / M.factor;

/**
 * Format minor units.
 * opts.sign: 'auto' (− for negatives) | 'always' (+/−) | 'never'
 * opts.compact: use 1.2K / 1.2L style above 10k
 * opts.decimals: 'auto' (only when non-zero) | 'always' | 'never'
 */
export function money(minor, opts = {}) {
  const m = Math.round(minor || 0);
  const abs = Math.abs(m);
  let s;
  if (opts.compact && abs >= 10000 * M.factor) s = M.compact.format(abs / M.factor);
  else if (opts.decimals === 'always') s = M.full.format(abs / M.factor);
  else if (opts.decimals === 'never' || abs % M.factor === 0) s = M.whole.format(Math.round(abs / M.factor));
  else s = M.full.format(abs / M.factor);
  const sign = opts.sign || 'auto';
  if (sign === 'never') return s;
  if (m < 0) return '−' + s;
  if (sign === 'always' && m > 0) return '+' + s;
  return s;
}

/** Number without currency symbol, e.g. for keypad display. */
export const plainNumber = minor => M.plain.format(Math.abs(minor) / M.factor);

// rough local-price scale relative to Indian prices (sample data & default quick buttons)
export const PRICE_SCALE = {
  INR: 1, PKR: 3, NPR: 1.6, LKR: 3.6, BDT: 1.4, USD: 0.034, CAD: 0.045, AUD: 0.05, NZD: 0.055, SGD: 0.045,
  EUR: 0.031, GBP: 0.027, CHF: 0.03, AED: 0.12, SAR: 0.12, QAR: 0.12, KWD: 0.01, OMR: 0.013, BHD: 0.013,
  JPY: 5, CNY: 0.22, HKD: 0.26, KRW: 45, MYR: 0.15, IDR: 520, PHP: 1.9, THB: 1.1, VND: 800, ZAR: 0.6,
  NGN: 40, KES: 4.2, BRL: 0.17, MXN: 0.6, TRY: 1.1, EGP: 1.5, SEK: 0.34,
};

/** An Indian price (₹, major units) as a sensible local amount in minor units of `code`. */
export function localPrice(inr, code) {
  const factor = 10 ** decimalsOf(code);
  if (code === 'INR') return Math.round(inr * factor);
  const v = inr * (PRICE_SCALE[code] ?? 1);
  const step = v >= 5000 ? 100 : v >= 1000 ? 50 : v >= 100 ? 10 : v >= 20 ? 1 : v >= 2 ? 0.5 : 0.1;
  return Math.max(Math.round(step * factor), Math.round(Math.round(v / step) * step * factor));
}

/** Decimal places a currency uses (JPY 0, INR 2, KWD 3). */
export function decimalsOf(code) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch { return 2; }
}

/** Parse a user-typed amount ("1,23,456.50", "1.234,5", Arabic-Indic digits) into minor units; null if invalid. */
export function parseAmount(str) {
  if (str == null) return null;
  let s = String(str).trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s  '’]/g, '')
    .replace(M.symbol, '')
    .replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  let decSep = null;
  if (hasDot && hasComma) decSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const count = s.split(sep).length - 1;
    const tail = s.slice(s.lastIndexOf(sep) + 1);
    // one separator + 3 trailing digits is grouping unless it is this locale's decimal mark
    if (count > 1 || (tail.length === 3 && (sep !== M.decimal || M.decimals === 0))) decSep = null;
    else decSep = sep;
  }
  if (decSep) {
    const i = s.lastIndexOf(decSep);
    s = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, '');
  } else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * M.factor);
}

/** Amount -> string suitable for an <input> value. */
export const toInput = minor => (minor ? String(fromMinor(minor)) : '');
