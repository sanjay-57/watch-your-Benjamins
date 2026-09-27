// Small DOM + template helpers (no framework — keeps the bundle tiny).

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

export function uid() {
  try { if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16); } catch {}
  const a = new Uint8Array(8);
  try { crypto.getRandomValues(a); } catch { for (let i = 0; i < 8; i++) a[i] = Math.random() * 256; }
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));
const fmtVal = v => v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmtVal).join('') : esc(v);

/** Tagged template: interpolations are HTML-escaped unless wrapped in raw() / nested html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += fmtVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/** Delegated event listener. */
export function on(root, type, selector, fn, opts) {
  const h = e => {
    const t = e.target.closest?.(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(type, h, opts);
  return () => root.removeEventListener(type, h, opts);
}

export function el(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = String(htmlStr).trim();
  return t.content.firstElementChild;
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function throttleRaf(fn) {
  let queued = false, lastArgs;
  return (...a) => {
    lastArgs = a;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

/** Adds `.is-pressed` for touch devices where :active is flaky, and runs fn on tap. */
export function pressable(node) {
  const down = () => node.classList.add('is-pressed');
  const up = () => node.classList.remove('is-pressed');
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointerleave', up);
  node.addEventListener('pointercancel', up);
}

export const cssVar = (name, value, node = document.documentElement) => node.style.setProperty(name, value);

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced';

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
