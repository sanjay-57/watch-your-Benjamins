// Liquid tab bar: a glass droplet springs between tabs, stretching with velocity;
// press-and-drag across the bar to scrub tabs (iOS 26 style) with selection haptics.
import { $, $$, clamp } from '../core/util.js';
import { haptic } from '../core/native.js';
import { runSpring } from './spring.js';
import { liquid } from './glass.js';

let bar, drop, tabs, onSelect = () => {};
let current = 'home';
let x = 0, w = 0, spring = null, vel = 0;
let lifted = false;

function geom(name) {
  const t = tabs.find(b => b.dataset.tab === name) || tabs[0];
  return { x: t.offsetLeft, w: t.offsetWidth };
}

function paint(px, v = 0, scaleBoost = 1) {
  x = px;
  const stretch = clamp(Math.abs(v) / 2600, 0, 0.32);
  const sx = (1 + stretch) * scaleBoost;
  const sy = (1 - stretch * 0.45) * scaleBoost;
  drop.style.width = w + 'px';
  drop.style.transform = `translate3d(${px}px,0,0) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
}

function glide(to, { velocity = vel, boost = 1 } = {}) {
  spring?.stop();
  spring = runSpring({
    from: x, to, velocity, stiffness: 420, damping: 32, restDelta: 0.3, restSpeed: 6,
    onUpdate: (px, v) => { vel = v; paint(px, v, boost); },
  });
}

export function initTabbar(select) {
  onSelect = select;
  bar = $('#tabbar');
  drop = $('#tabdrop');
  tabs = $$('.tab', bar);
  const g = geom(current);
  w = g.w;
  paint(g.x);

  // liquid refraction on the bar and the add button (Chromium)
  liquid(bar, { bezel: 20, scale: 56, blur: 3, dispersion: true });
  liquid($('#fab'), { bezel: 18, scale: 50, blur: 3, dispersion: true, saturate: 190 });

  new ResizeObserver(() => { const gg = geom(current); w = gg.w; spring?.stop(); paint(gg.x); }).observe(bar);

  // tap / drag scrubbing
  let pid = null, startX = 0, moved = false, hovered = null;
  const tabAt = cx => {
    const r = bar.getBoundingClientRect();
    const rel = cx - r.left;
    return tabs.reduce((best, t) => (Math.abs(t.offsetLeft + t.offsetWidth / 2 - rel) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - rel) ? t : best), tabs[0]);
  };
  bar.addEventListener('pointerdown', e => {
    if (pid !== null) return;
    pid = e.pointerId;
    startX = e.clientX;
    moved = false;
    hovered = tabAt(e.clientX);
    bar.setPointerCapture?.(e.pointerId);
  });
  bar.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    if (!moved && Math.abs(e.clientX - startX) > 8) {
      moved = true;
      lifted = true;
      bar.classList.add('lifting');
      haptic('light');
    }
    if (!moved) return;
    const r = bar.getBoundingClientRect();
    const target = clamp(e.clientX - r.left - w / 2, 4, r.width - w - 4);
    spring?.stop();
    const dt = 16;
    vel = ((target - x) / dt) * 1000 * 0.5;
    paint(target, vel, 1.12);
    const t = tabAt(e.clientX);
    if (t !== hovered) { hovered = t; haptic('selection'); }
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    const t = moved ? hovered : tabAt(e.clientX);
    if (lifted) { lifted = false; bar.classList.remove('lifting'); }
    if (t) {
      if (t.dataset.tab === current) { glide(geom(current).x); onSelect(current, { reselect: !moved }); }
      else onSelect(t.dataset.tab, {});
    }
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', e => { if (e.pointerId === pid) { pid = null; lifted = false; bar.classList.remove('lifting'); glide(geom(current).x); } });
  // keyboard
  bar.addEventListener('keydown', e => {
    const i = tabs.findIndex(t => t.dataset.tab === current);
    if (e.key === 'ArrowRight') onSelect(tabs[(i + 1) % tabs.length].dataset.tab, {});
    if (e.key === 'ArrowLeft') onSelect(tabs[(i - 1 + tabs.length) % tabs.length].dataset.tab, {});
  });
  bar.addEventListener('click', e => {
    // keyboard activation (Enter/Space) produces click without pointer events
    if (e.detail === 0) { const t = e.target.closest('.tab'); if (t) onSelect(t.dataset.tab, {}); }
  });
}

/** Move the droplet + selection state to `name`. */
export function setActiveTab(name) {
  const changed = name !== current;
  current = name;
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
  }
  const g = geom(name);
  w = g.w;
  glide(g.x, { velocity: changed ? vel : 0 });
}
