// Liquid Glass engine
//  1. Refraction: per-element SVG displacement maps (rounded-rect lens bezel) used via
//     `backdrop-filter: url(#…)`. Chromium only (Android WebView, Chrome, Edge). Safari/iOS
//     gracefully keep the frosted material.
//  2. Light: device tilt / pointer drives --lx/--ly on `.tilt` elements (specular rims, card sheen).
import { clamp } from '../core/util.js';

const NS = 'http://www.w3.org/2000/svg';
let defs = null;
let seq = 0;
const filters = new Map(); // key → id
const attached = new Map(); // el → {opts, ro, update}
let mode = 'liquid';

export const refractionSupported = (() => {
  const ua = navigator.userAgent;
  const chromium = /Chrome\/\d+|Chromium\/\d+/.test(ua) && !/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua);
  let ok = false;
  try { ok = CSS.supports('backdrop-filter', 'url(#x) blur(1px)'); } catch {}
  return chromium && ok;
})();
if (refractionSupported) document.documentElement.classList.add('blink'); // see glass.css

function svgDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';
  defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const setAttrs = (node, attrs) => { for (const k in attrs) node.setAttribute(k, attrs[k]); return node; };
const make = (tag, attrs) => setAttrs(document.createElementNS(NS, tag), attrs);

/** Displacement map for a rounded rect: pixels in the bezel sample inward (lens edge). */
function displacementMap(w, h, radius, bezel) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2, hh = h / 2;
  const r = Math.min(radius, hw, hh);
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - hh;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const out = Math.hypot(ox, oy);
      const depth = -(out + Math.min(Math.max(qx, qy), 0) - r); // distance inside the edge
      let dx = 0, dy = 0;
      if (depth > 0 && depth < bezel) {
        let nx, ny;
        if (qx > 0 && qy > 0) { nx = ox / (out || 1); ny = oy / (out || 1); }
        else if (qx > qy) { nx = 1; ny = 0; }
        else { nx = 0; ny = 1; }
        nx *= px < 0 ? -1 : 1;
        ny *= py < 0 ? -1 : 1;
        const t = 1 - depth / bezel;          // 0 at inner edge of bezel → 1 at the rim
        const mag = 1 - Math.sqrt(1 - t * t); // circular (convex lens) profile
        dx = -nx * mag;
        dy = -ny * mag;
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + dx * 127;
      d[i + 1] = 128 + dy * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function buildFilter(id, w, h, href, scale, dispersion) {
  const f = make('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  const img = make('feImage', { x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' });
  img.setAttribute('href', href);
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
  f.appendChild(img);
  if (!dispersion) {
    f.appendChild(make('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale, xChannelSelector: 'R', yChannelSelector: 'G' }));
  } else {
    // chromatic dispersion: R/G/B refract by slightly different amounts
    const ch = [['r', scale, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['g', scale * 0.93, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['b', scale * 0.86, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0']];
    for (const [k, s, m] of ch) {
      f.appendChild(make('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + k }));
      f.appendChild(make('feColorMatrix', { in: 'd' + k, type: 'matrix', values: m, result: 'c' + k }));
    }
    f.appendChild(make('feBlend', { in: 'cr', in2: 'cg', mode: 'screen', result: 'rg' }));
    f.appendChild(make('feBlend', { in: 'rg', in2: 'cb', mode: 'screen' }));
  }
  svgDefs().appendChild(f);
}

function filterFor(w, h, r, o) {
  const key = `${w}x${h}r${r}b${o.bezel}s${o.scale}d${+o.dispersion}`;
  let id = filters.get(key);
  if (!id) {
    id = 'lg' + ++seq;
    buildFilter(id, w, h, displacementMap(w, h, r, o.bezel), o.scale, o.dispersion);
    filters.set(key, id);
  }
  return id;
}

/**
 * Give an element real refraction. opts: {bezel, scale, blur, saturate, brightness, dispersion, radius}
 * Safe to call on any browser (no-op where unsupported).
 */
export function liquid(el, opts = {}) {
  if (!refractionSupported || !el || attached.has(el)) return;
  const o = { bezel: 18, scale: 48, blur: 2, saturate: 175, brightness: 1.06, dispersion: false, ...opts };
  const update = () => {
    if (mode !== 'liquid') { el.style.backdropFilter = ''; return; }
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    const r = o.radius ?? Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    const id = filterFor(w, h, Math.round(r), o);
    el.style.backdropFilter = `blur(${o.blur}px) url(#${id}) saturate(${o.saturate}%) brightness(${o.brightness})`;
  };
  const ro = new ResizeObserver(update);
  ro.observe(el);
  attached.set(el, { ro, update });
  update();
}

export function unliquid(el) {
  const a = attached.get(el);
  if (!a) return;
  a.ro.disconnect();
  el.style.backdropFilter = '';
  attached.delete(el);
}

/** 'liquid' | 'frosted' | 'solid' */
export function setGlassMode(m) {
  mode = m;
  for (const [el, a] of attached) { if (!el.isConnected) { a.ro.disconnect(); attached.delete(el); continue; } a.update(); }
}

// ---------------------------------------------------------------- light / tilt
const tiltEls = document.getElementsByClassName('tilt'); // live collection
let tx = 0, ty = 0, cx = 0, cy = 0, running = false, lightOn = true, lastT = 0;

function paint(now) {
  // Same glide at 60, 90 or 120 Hz: 10% of the way per 60 Hz frame, scaled by elapsed time.
  const k = 1 - Math.pow(0.9, clamp((now - lastT) / (1000 / 60), 0, 4));
  lastT = now;
  cx += (tx - cx) * k;
  cy += (ty - cy) * k;
  const x = cx.toFixed(3), y = cy.toFixed(3);
  for (let i = 0; i < tiltEls.length; i++) {
    const s = tiltEls[i].style;
    s.setProperty('--lx', x);
    s.setProperty('--ly', y);
  }
  if (Math.abs(tx - cx) > 0.004 || Math.abs(ty - cy) > 0.004) requestAnimationFrame(paint);
  else running = false;
}

function start() {
  if (running) return;
  running = true;
  lastT = performance.now();
  requestAnimationFrame(paint);
}

function aim(x, y) {
  if (!lightOn) return;
  x = clamp(x, -1, 1);
  y = clamp(y, -1, 1);
  if (Math.abs(x - tx) < 0.025 && Math.abs(y - ty) < 0.025) return; // dead-band against sensor jitter
  tx = x;
  ty = y;
  start();
}

export function setLight(on) {
  lightOn = on;
  if (!on) { tx = ty = 0; start(); }
}

export function initLight() {
  let base = null;
  window.addEventListener('deviceorientation', e => {
    if (e.gamma == null || e.beta == null) return;
    if (!base) base = { b: e.beta };
    // slowly re-centre so the "neutral" pose follows how the phone is held
    base.b += (e.beta - base.b) * 0.01;
    aim(e.gamma / 30, (e.beta - base.b) / 22);
  }, { passive: true });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', e => aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1), { passive: true });
  }
}
