// Toasts, dialogs and popover menus — all Liquid Glass, all back-button aware.
import { nav } from '../core/nav.js';
import { haptic } from '../core/native.js';
import { $, esc, clamp } from '../core/util.js';
import { SPR, animate } from './spring.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- toast
let currentToast = null;

/** toast('Saved', {sub, icon, tone:'accent'|'pos'|'neg'|'warn'|'xfer', action:'Undo', onAction, duration}) */
export function toast(msg, o = {}) {
  currentToast?.dismiss(true);
  const tone = o.tone || 'accent';
  const el = document.createElement('div');
  el.className = 'toast glass-strong';
  el.innerHTML = `
    <span class="ic" style="--c: var(--${tone}-rgb)">${icon(o.icon || 'check')}</span>
    <div class="msg">${esc(msg)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>
    ${o.action ? `<button class="act press">${esc(o.action)}</button>` : ''}`;
  $('#toasts').append(el);
  animate(el, [{ transform: 'translate3d(0,-150%,0) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: SPR.spring.easing });

  let timer = setTimeout(() => dismiss(), o.duration || (o.action ? 4800 : 2600));
  let gone = false;
  const api = { dismiss, el };
  currentToast = api;

  el.querySelector('.act')?.addEventListener('click', () => { haptic('selection'); o.onAction?.(); dismiss(); });

  // swipe up to dismiss
  let sy = null;
  el.addEventListener('pointerdown', e => { sy = e.clientY; clearTimeout(timer); el.setPointerCapture?.(e.pointerId); });
  el.addEventListener('pointermove', e => { if (sy == null) return; const d = Math.min(0, e.clientY - sy); el.style.transform = `translate3d(0,${d}px,0)`; });
  const up = e => {
    if (sy == null) return;
    const d = e.clientY - sy; sy = null;
    if (d < -18) dismiss(); else { el.style.transform = ''; timer = setTimeout(() => dismiss(), 1800); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  function dismiss(fast) {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    if (currentToast === api) currentToast = null;
    const a = animate(el, [{ opacity: 1, transform: el.style.transform || 'none' }, { opacity: 0, transform: 'translate3d(0,-130%,0) scale(.9)' }], { duration: fast ? 140 : 280, easing: 'cubic-bezier(.4,0,.9,.5)', fill: 'forwards' });
    a.finished.then(() => el.remove(), () => el.remove());
  }
  return api;
}

// ---------------------------------------------------------------- dialog
/**
 * confirmDialog({title, message, confirm, cancel, destructive, icon, tone}) → Promise<boolean>
 * alertDialog({...}) → Promise<void>  (single button)
 */
export function confirmDialog(o = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    const tone = o.tone || (o.destructive ? 'neg' : 'accent');
    const single = o.cancel === false;
    wrap.innerHTML = `
      <div class="dialog glass-strong" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        ${o.icon ? `<div class="d-icon" style="--c: var(--${tone}-rgb)">${icon(o.icon)}</div>` : ''}
        <h3 id="dlg-t">${esc(o.title || '')}</h3>
        ${o.message ? `<p>${esc(o.message)}</p>` : ''}
        <div class="d-actions ${single ? '' : 'two'}">
          ${single ? '' : `<button class="btn md btn-plain press" data-r="0">${esc(o.cancel || 'Cancel')}</button>`}
          <button class="btn md glass tint press ${o.destructive ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(o.confirm || 'OK')}</button>
        </div>
      </div>`;
    const layer = $('#overlay');
    layer.append(wrap);
    haptic(o.destructive ? 'warning' : 'light');
    const token = nav.push({ close: ({ fromBack }) => done(false, fromBack) });
    let finished = false;
    function done(val, fromBack = false) {
      if (finished) return;
      finished = true;
      nav.remove(token, fromBack);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 220);
      resolve(val);
    }
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { haptic(b.dataset.r === '1' && o.destructive ? 'heavy' : 'selection'); done(b.dataset.r === '1'); }
      else if (e.target === wrap && !single) done(false);
    });
    requestAnimationFrame(() => wrap.querySelector('[data-r="1"]')?.focus({ preventScroll: true }));
  });
}

export const alertDialog = o => confirmDialog({ ...o, cancel: false });

// ---------------------------------------------------------------- popover menu
/** openMenu(anchorEl, [{label, icon, danger, onSelect} | '-']) */
export function openMenu(anchor, items, { align = 'end' } = {}) {
  const r = anchor.getBoundingClientRect();
  const layer = $('#overlay');
  const catcher = document.createElement('div');
  catcher.className = 'menu-catch';
  const m = document.createElement('div');
  m.className = 'menu glass-strong';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' :
    `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}"><span>${esc(it.label)}</span>${it.icon ? icon(it.icon) : ''}</button>`).join('');
  layer.append(catcher, m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = align === 'end' ? r.right - mw : r.left;
  left = clamp(left, 10, innerWidth - mw - 10);
  let top = r.bottom + 8;
  const below = top + mh < innerHeight - 20;
  if (!below) top = Math.max(10, r.top - mh - 8);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
  m.style.setProperty('--ox', clamp(((r.left + r.width / 2 - left) / mw) * 100, 0, 100) + '%');
  m.style.setProperty('--oy', below ? '0%' : '100%');
  haptic('light');
  const token = nav.push({ close: ({ fromBack }) => close(fromBack) });
  let closed = false;
  function close(fromBack = false) {
    if (closed) return;
    closed = true;
    nav.remove(token, fromBack);
    m.classList.add('out');
    catcher.remove();
    setTimeout(() => m.remove(), 200);
  }
  catcher.addEventListener('pointerdown', e => { e.preventDefault(); close(); });
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    haptic('selection');
    const it = items[+b.dataset.i];
    close();
    setTimeout(() => it.onSelect?.(), 60);
  });
  return { close };
}
