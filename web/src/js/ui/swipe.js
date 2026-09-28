// Swipe-left-to-delete for transaction rows (.tx-swipe > .tx). Full swipe deletes,
// partial swipe reveals the Delete action. Coexists with vertical scrolling.
import { haptic } from '../core/native.js';
import { runSpring } from './spring.js';

const REVEAL = 96;
let openRow = null;

function setX(row, x) {
  row.querySelector('.tx').style.transform = x ? `translate3d(${x}px,0,0)` : '';
  row.classList.toggle('swiping', x !== 0);
}

export function closeOpenRow() {
  if (!openRow) return;
  const r = openRow;
  openRow = null;
  const tx = r.querySelector('.tx');
  const from = parseFloat((tx.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
  runSpring({ from, to: 0, stiffness: 500, damping: 40, restDelta: 0.5, restSpeed: 10, onUpdate: x => setX(r, x) });
}

/** onDelete(id, rowEl) is called for a full swipe or a tap on the revealed action. */
export function attachSwipe(container, onDelete) {
  let row = null, sx = 0, sy = 0, x0 = 0, dx = 0, mode = null, lastX = 0, lastT = 0, vel = 0, armed = false, w = 0;

  container.addEventListener('touchstart', e => {
    const r = e.target.closest('.tx-swipe');
    if (!r || e.touches.length !== 1) return;
    if (openRow && openRow !== r) closeOpenRow();
    row = r;
    sx = lastX = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    lastT = e.timeStamp;
    const tx = r.querySelector('.tx');
    x0 = parseFloat((tx.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
    mode = null; dx = x0; vel = 0; armed = false;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!row) return;
    const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
    const ddx = cx - sx, ddy = cy - sy;
    if (!mode) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      mode = Math.abs(ddx) > Math.abs(ddy) * 1.2 ? 'h' : 'v';
      if (mode === 'v') { row = null; return; }
      w = row.offsetWidth; // once per gesture, before any writes (a read per move forces a layout)
    }
    if (e.cancelable) e.preventDefault();
    dx = Math.min(0, x0 + ddx);
    if (dx > 0) dx = 0;
    // resistance past the reveal width
    const shown = dx < -REVEAL ? -REVEAL + (dx + REVEAL) * 0.85 : dx;
    setX(row, shown);
    const dt = Math.max(1, e.timeStamp - lastT);
    vel = ((cx - lastX) / dt) * 1000;
    lastX = cx; lastT = e.timeStamp;
    const willDelete = shown < -w * 0.55;
    if (willDelete !== armed) { armed = willDelete; haptic(armed ? 'medium' : 'selection'); }
  }, { passive: false });

  const end = () => {
    if (!row) return;
    const r = row;
    row = null;
    if (mode !== 'h') return;
    const w = r.offsetWidth;
    const cur = parseFloat((r.querySelector('.tx').style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
    if (armed || (cur < -REVEAL && vel < -900)) {
      runSpring({ from: cur, to: -w - 20, velocity: Math.min(vel, -800), stiffness: 300, damping: 30, restDelta: 2, restSpeed: 50, onUpdate: x => setX(r, x), onComplete: () => onDelete(r.dataset.id, r) });
      openRow = null;
      return;
    }
    const target = cur < -REVEAL / 2 || vel < -500 ? -REVEAL : 0;
    openRow = target ? r : null;
    runSpring({ from: cur, to: target, velocity: vel, stiffness: 520, damping: 38, restDelta: 0.5, restSpeed: 10, onUpdate: x => setX(r, x) });
  };
  container.addEventListener('touchend', end);
  container.addEventListener('touchcancel', end);

  container.addEventListener('click', e => {
    const del = e.target.closest('[data-act="swipe-del"]');
    if (del) {
      e.stopPropagation();
      const r = del.closest('.tx-swipe');
      openRow = null;
      onDelete(r.dataset.id, r);
      return;
    }
    // tapping a revealed row closes it instead of opening
    if (openRow && e.target.closest('.tx-swipe') === openRow) { e.stopPropagation(); e.preventDefault(); closeOpenRow(); }
  }, true);
}
