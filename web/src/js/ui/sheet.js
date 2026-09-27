// Floating Liquid Glass bottom sheets: spring presentation, the page behind scales
// back (iOS card modal), drag-to-dismiss with velocity, stacking, back-button aware.
import { nav } from '../core/nav.js';
import { haptic } from '../core/native.js';
import { $, esc, reducedMotion } from '../core/util.js';
import { SPR, animate, runSpring } from './spring.js';
import { icon } from './icons.js';

const open = [];
let onPresentChange = () => {};
export const onPresentationChange = fn => { onPresentChange = fn; };
export const sheetsOpen = () => open.length;
export const topSheet = () => open[open.length - 1];

function present() {
  const n = open.length;
  const app = $('#app');
  app.classList.toggle('presented', n === 1);
  app.classList.toggle('presented-2', n >= 2);
  document.body.classList.toggle('presenting', n > 0);
  $('#scrim').classList.toggle('on', n > 0);
  open.forEach((s, i) => {
    const behind = i < n - 1;
    s.el.classList.toggle('behind', behind);
    if (s.dragging || s.closing || !s.shown) return;
    const target = behind ? `translate3d(0,${-12 - (n - 2 - i) * 8}px,0) scale(${(0.955 - (n - 2 - i) * 0.03).toFixed(3)})` : 'translate3d(0,0,0)';
    if (s.el.style.transform !== target) {
      animate(s.el, [{ transform: s.el.style.transform || 'none' }, { transform: target }], { duration: 480, easing: SPR.soft.easing });
    }
    s.el.style.transform = target;
  });
  onPresentChange(n);
}

export function initSheets() {
  $('#scrim').addEventListener('click', () => topSheet()?.dismiss());
}

/**
 * openSheet({ title, subtitle, content (string|Node), size: 'auto'|'full', className,
 *             headRight (html), dismissible, onClose, onOpen })
 */
export function openSheet(opts = {}) {
  const { title = '', subtitle = '', content = '', foot = null, size = 'auto', className = '', headRight = '', dismissible = true, onClose, onOpen, head = true, label } = opts;
  const el = document.createElement('div');
  el.className = `sheet glass-strong ${size === 'full' ? 'full' : ''} ${className}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label || title || 'Sheet');
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="grabber" aria-hidden="true"></div>
    ${head ? `<div class="sheet-head">
      <div class="grow"><h2 class="ellip">${esc(title)}</h2>${subtitle ? `<span class="sub ellip">${esc(subtitle)}</span>` : ''}</div>
      <div class="row" style="gap:8px">${headRight}<button class="icon-btn sm plain press" data-close aria-label="Close">${icon('close')}</button></div>
    </div>` : ''}
    <div class="sheet-body"></div>`;
  const body = el.querySelector('.sheet-body');
  if (content instanceof Node) body.append(content);
  else body.innerHTML = String(content);
  if (foot) {
    const f = document.createElement('div');
    f.className = 'sheet-foot';
    if (foot instanceof Node) f.append(foot); else f.innerHTML = String(foot);
    el.append(f);
  }

  const api = {
    el, body, dismissible, dragging: false, closing: false, shown: false,
    close, dismiss: () => { if (api.dismissible) close(); else rubber(); },
    setTitle(t, sub) {
      const h = el.querySelector('.sheet-head h2'); if (h) h.textContent = t;
      const s = el.querySelector('.sheet-head .sub'); if (s && sub != null) s.textContent = sub;
    },
  };
  const prevFocus = document.activeElement;
  $('#sheets').append(el);
  open.push(api);
  // back button / gesture always closes (dismissible only guards scrim taps and drags)
  const token = nav.push({ close: ({ fromBack }) => close({ fromBack }) });
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });

  const h = el.offsetHeight;
  el.style.transform = `translate3d(0,${h + 40}px,0)`;
  present();
  requestAnimationFrame(() => {
    api.shown = true;
    el.style.transform = 'translate3d(0,0,0)';
    animate(el, [{ transform: `translate3d(0,${h + 40}px,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: SPR.sheet.duration, easing: SPR.sheet.easing });
    el.focus({ preventScroll: true });
  });
  haptic('light');
  attachDrag(api);
  onOpen?.(api);
  return api;

  function rubber() {
    haptic('warning');
    animate(el, [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,18px,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: 420, easing: SPR.spring.easing });
  }

  async function close({ fromBack = false } = {}) {
    if (api.closing) return;
    api.closing = true;
    nav.remove(token, fromBack);
    const i = open.indexOf(api);
    if (i >= 0) open.splice(i, 1);
    present();
    const from = el.style.transform || 'translate3d(0,0,0)';
    const to = `translate3d(0,${el.offsetHeight + 60}px,0)`;
    const a = animate(el, [{ transform: from }, { transform: to }], { duration: reducedMotion() ? 1 : 300, easing: 'cubic-bezier(.4,0,.85,.35)', fill: 'forwards' });
    try { await a.finished; } catch {}
    el.remove();
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') { try { prevFocus.focus({ preventScroll: true }); } catch {} }
    onClose?.();
  }
}

function attachDrag(api) {
  const { el, body } = api;
  let active = false, decided = false, fromHead = false;
  let startY = 0, lastY = 0, lastT = 0, vel = 0, dy = 0, spring = null;

  const begin = (y, t, head) => {
    active = true; decided = head; fromHead = head;
    startY = lastY = y; lastT = t; vel = 0; dy = 0;
    spring?.stop();
  };
  const move = (y, t, e) => {
    const d = y - startY;
    if (!decided) {
      if (Math.abs(d) < 6) return;
      if (d < 0 || body.scrollTop > 0) { active = false; return; }
      decided = true;
    }
    if (e?.cancelable) e.preventDefault();
    const dt = Math.max(1, t - lastT);
    vel = ((y - lastY) / dt) * 1000 * 0.7 + vel * 0.3;
    lastY = y; lastT = t;
    dy = d > 0 ? d : -Math.pow(-d, 0.7);
    api.dragging = true;
    el.style.transform = `translate3d(0,${dy}px,0)`;
  };
  const end = () => {
    if (!active) return;
    active = false;
    if (!api.dragging) return;
    api.dragging = false;
    const h = el.offsetHeight;
    if (api.dismissible && (dy > h * 0.28 || (vel > 650 && dy > 16))) { haptic('light'); api.close(); return; }
    if (!api.dismissible && dy > 60) haptic('warning');
    spring = runSpring({
      from: dy, to: 0, velocity: vel, stiffness: 420, damping: 34, restDelta: 0.4, restSpeed: 8,
      onUpdate: x => { el.style.transform = `translate3d(0,${x}px,0)`; },
      onComplete: () => { el.style.transform = 'translate3d(0,0,0)'; },
    });
  };

  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || api.closing) return;
    const t = e.target;
    const head = !!t.closest('.grabber, .sheet-head');
    if (!head) {
      if (!t.closest('.sheet-body') || body.scrollTop > 0) return;
      if (t.closest('input, textarea, select, .hscroll, .keypad, [data-nodrag]')) return;
    }
    if (t.closest('button, input') && head && t.closest('.sheet-head button')) return;
    begin(e.touches[0].clientY, e.timeStamp, head);
  }, { passive: true });
  el.addEventListener('touchmove', e => { if (active) move(e.touches[0].clientY, e.timeStamp, e); }, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  // mouse / pen: drag by the grabber or header
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || !e.target.closest('.grabber, .sheet-head') || e.target.closest('button')) return;
    begin(e.clientY, e.timeStamp, true);
    const mv = ev => move(ev.clientY, ev.timeStamp, ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); end(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}

/** Close every open sheet (e.g. before a full data reset). */
export function closeAllSheets() {
  for (const s of [...open].reverse()) s.close();
}
