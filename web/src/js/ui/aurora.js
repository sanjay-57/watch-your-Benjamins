// Aurora background painted into a tiny canvas that the GPU upscales for free.
// (Four full-screen CSS blobs cost ~130 MB of tile memory on a 1440p phone; this costs ~50 KB.)
import { reducedMotion } from '../core/util.js';

const BLOBS = [
  // colour var, base x/y (0..1 of width/height), radius (× max(w,h)), drift amplitude, period (s), phase
  { v: '--au1', x: 0.05, y: 0.02, r: 0.62, ax: 0.18, ay: 0.12, p: 34, ph: 0 },
  { v: '--au2', x: 1.02, y: 0.32, r: 0.55, ax: 0.2, ay: 0.14, p: 42, ph: 1.7 },
  { v: '--au3', x: 0.08, y: 1.04, r: 0.58, ax: 0.22, ay: 0.16, p: 38, ph: 3.1 },
  { v: '--au4', x: 0.95, y: 0.9, r: 0.62, ax: 0.18, ay: 0.18, p: 47, ph: 4.4 },
];

const all = new Set();
let palette = null;

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const rgb = v => cs.getPropertyValue(v).trim().split(/\s+/).map(Number);
  palette = {
    bg: cs.getPropertyValue('--bg').trim() || '#07120c',
    o: parseFloat(cs.getPropertyValue('--au-o')) || 0.6,
    c: BLOBS.map(b => rgb(b.v)),
  };
}

function draw(a, t) {
  const { ctx, w, h } = a;
  const { bg, o, c } = palette;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const m = Math.max(w, h);
  BLOBS.forEach((b, i) => {
    const k = (t / b.p) * Math.PI * 2 + b.ph;
    const x = (b.x + Math.sin(k) * b.ax) * w;
    const y = (b.y + Math.cos(k * 0.8) * b.ay) * h;
    const r = b.r * m * (1 + Math.sin(k * 1.3) * 0.08);
    const [R, G, B] = c[i];
    const g = a.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${R},${G},${B},${0.92 * o})`);
    g.addColorStop(0.26, `rgba(${R},${G},${B},${0.62 * o})`);
    g.addColorStop(0.52, `rgba(${R},${G},${B},${0.3 * o})`);
    g.addColorStop(0.74, `rgba(${R},${G},${B},${0.1 * o})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function size(a) {
  const r = a.host.getBoundingClientRect();
  const W = Math.max(1, r.width || innerWidth), H = Math.max(1, r.height || innerHeight);
  // ~1 canvas px per 5 CSS px: soft gradients upscale invisibly
  a.w = a.canvas.width = Math.max(48, Math.round(W / 5));
  a.h = a.canvas.height = Math.max(48, Math.round(H / 5));
}

let raf = 0, last = 0;
const t0 = performance.now() - 12000;
function loop(now) {
  raf = 0;
  if (document.hidden) return;
  if (now - last >= 40) { // ~25 fps is plenty for a slow drift
    last = now;
    for (const a of all) if (!a.host.classList.contains('paused') && a.host.isConnected && a.host.offsetParent !== null) draw(a, (now - t0) / 1000);
  }
  if (!reducedMotion()) raf = requestAnimationFrame(loop);
}

function kick() {
  if (!raf && !reducedMotion()) raf = requestAnimationFrame(loop);
}

/** Mount an animated aurora canvas inside `host` (an .aurora element). Returns an unmount fn. */
export function mountAurora(host) {
  if (!palette) readPalette();
  host.querySelectorAll('.au').forEach(n => n.remove());
  const canvas = document.createElement('canvas');
  canvas.className = 'au-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const a = { host, canvas, ctx: canvas.getContext('2d'), w: 0, h: 0 };
  size(a);
  draw(a, (performance.now() - t0) / 1000);
  all.add(a);
  kick();
  return () => { all.delete(a); canvas.remove(); };
}

/** Re-read theme colours (call after theme changes). */
export function refreshAurora() {
  readPalette();
  const t = (performance.now() - t0) / 1000;
  for (const a of all) draw(a, t);
  kick();
}

addEventListener('resize', () => { for (const a of all) { size(a); } refreshAurora(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
