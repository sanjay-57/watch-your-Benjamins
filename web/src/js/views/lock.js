// Optional 4-digit app lock (privacy screen — the data itself is not encrypted).
import { esc, uid, sleep } from '../core/util.js';
import { store, setSettings, eraseAll } from '../core/store.js';
import { haptic } from '../core/native.js';
import { nav } from '../core/nav.js';
import { openSheet } from '../ui/sheet.js';
import { toast, confirmDialog } from '../ui/overlays.js';
import { icon } from '../ui/icons.js';
import { mountAurora } from '../ui/aurora.js';

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}:benjamins`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return 'sha256:' + Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0x811c9dc5; // FNV-1a fallback for non-secure contexts
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'fnv:' + h.toString(16);
  }
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
const padHTML = () => `<div class="keypad">${KEYS.map(k => k === '' ? '<span></span>' : k === 'back'
  ? `<button class="key op" data-k="back" aria-label="Delete">${icon('back')}</button>`
  : `<button class="key glass-clear" data-k="${k}">${k}</button>`).join('')}</div>`;

let locked = false;
export const isLocked = () => locked;

/** Full-screen lock. Resolves when unlocked (or false if cancelled). */
export function showLock({ title = 'Enter passcode', cancellable = false } = {}) {
  const lock = store.settings.lock;
  if (!lock) return Promise.resolve(true);
  if (document.querySelector('.lock')) return Promise.resolve(false);
  locked = !cancellable;
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <div class="aurora" aria-hidden="true"><i class="au au1"></i><i class="au au2"></i><i class="au au3"></i><i class="au au4"></i></div>
      <div class="mglyph" style="--c:var(--accent-rgb);width:56px;height:56px;border-radius:18px">${icon('lock')}</div>
      <div style="text-align:center"><div class="t-title3" id="lk-t">${esc(title)}</div><div class="t-foot t2" id="lk-s" style="margin-top:6px;min-height:18px"></div></div>
      <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
      ${padHTML()}
      <div class="row" style="gap:18px">
        ${cancellable ? '<button class="btn sm btn-plain press" data-act="cancel">Cancel</button>' : ''}
        <button class="btn sm btn-plain press" data-act="forgot">Forgot passcode?</button>
      </div>`;
    document.body.appendChild(el);
    const unmountAurora = mountAurora(el.querySelector('.aurora'));
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    let pin = '', busy = false;
    const tries = { n: +(sessionStorage.getItem('wyb:tries') || 0) };
    const token = cancellable ? nav.push({ close: ({ fromBack }) => finish(false, fromBack) }) : null;
    const dots = [...el.querySelectorAll('.pin-dots i')];
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));

    function finish(ok, fromBack = false) {
      if (token) nav.remove(token, fromBack);
      locked = false;
      const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
      a.finished.then(() => { unmountAurora(); el.remove(); });
      resolve(ok);
    }

    async function check() {
      busy = true;
      const h = await hashPin(pin, lock.salt);
      if (h === lock.hash) {
        sessionStorage.removeItem('wyb:tries');
        haptic('success');
        finish(true);
        return;
      }
      tries.n++;
      sessionStorage.setItem('wyb:tries', tries.n);
      haptic('error');
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      await sleep(420);
      pin = ''; paint();
      if (tries.n >= 5) {
        const wait = Math.min(300, 30 * 2 ** (tries.n - 5));
        const s = el.querySelector('#lk-s');
        for (let t = wait; t > 0; t--) { s.textContent = `Too many attempts. Try again in ${t}s`; await sleep(1000); }
        s.textContent = '';
      } else el.querySelector('#lk-s').textContent = `Wrong passcode${tries.n >= 3 ? ` · ${5 - tries.n} left before a pause` : ''}`;
      busy = false;
    }

    el.addEventListener('click', async e => {
      const k = e.target.closest('[data-k]');
      if (k && !busy) {
        if (k.dataset.k === 'back') { pin = pin.slice(0, -1); haptic('light'); }
        else if (pin.length < 4) { pin += k.dataset.k; haptic('light'); }
        paint();
        if (pin.length === 4) check();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') finish(false);
      if (act === 'forgot') {
        const ok = await confirmDialog({ title: 'Reset the app?', message: 'Without the passcode the only way in is to erase all data on this phone. If you have a backup you can restore it afterwards.', confirm: 'Erase & reset', destructive: true, icon: 'lock' });
        if (!ok) return;
        await eraseAll();
        sessionStorage.removeItem('wyb:tries');
        finish(true);
        location.reload();
      }
    });
    const onKey = e => {
      if (!el.isConnected) return document.removeEventListener('keydown', onKey);
      if (/^\d$/.test(e.key)) el.querySelector(`[data-k="${e.key}"]`)?.click();
      else if (e.key === 'Backspace') el.querySelector('[data-k="back"]')?.click();
    };
    document.addEventListener('keydown', onKey);
  });
}

/** Two-step passcode creation sheet. */
export function setupLock() {
  let first = null, pin = '';
  const sheet = openSheet({
    title: 'Set a passcode',
    content: `<div style="display:grid;justify-items:center;gap:20px;padding:8px 0 4px">
      <div class="t-sub t2" id="sl-t" style="text-align:center">Choose 4 digits you’ll remember.</div>
      <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
      <div style="width:min(100%,300px)">${padHTML().replace('class="keypad"', 'class="keypad" style="grid-template-columns:repeat(3,1fr)"')}</div>
      <p class="t-foot t3" style="text-align:center;max-width:280px">If you forget it, the only way back in is erasing the app’s data — keep a backup.</p>
    </div>`,
  });
  const dots = [...sheet.body.querySelectorAll('.pin-dots i')];
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  sheet.body.addEventListener('click', async e => {
    const k = e.target.closest('[data-k]');
    if (!k) return;
    if (k.dataset.k === 'back') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k.dataset.k;
    haptic('light');
    paint();
    if (pin.length < 4) return;
    await sleep(160);
    if (!first) {
      first = pin; pin = ''; paint();
      sheet.body.querySelector('#sl-t').textContent = 'Enter it once more to confirm.';
      return;
    }
    if (pin !== first) {
      haptic('error');
      first = null; pin = ''; paint();
      sheet.body.querySelector('#sl-t').textContent = 'Didn’t match — start again.';
      return;
    }
    const salt = uid();
    setSettings({ lock: { salt, hash: await hashPin(pin, salt) } });
    haptic('success');
    sheet.close();
    toast('App lock on', { sub: 'You’ll need the passcode after 1 minute away', icon: 'lock' });
  });
}

export async function disableLock() {
  const ok = await showLock({ title: 'Enter passcode to turn off', cancellable: true });
  if (!ok) return;
  setSettings({ lock: null });
  toast('App lock off', { icon: 'lock' });
}
