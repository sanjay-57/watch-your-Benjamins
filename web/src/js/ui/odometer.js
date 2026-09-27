// Rolling-digit odometer: digits roll from the previously shown value to the new one.
import { esc, reducedMotion } from '../core/util.js';

const COL = '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>';
const memory = new Map(); // key → last shown text (survives re-renders)

/**
 * Render `text` into `el` as an odometer. `key` remembers the previous value across
 * re-renders so the roll starts from what the user last saw.
 */
export function odometer(el, text, key) {
  const prev = key ? memory.get(key) ?? '' : el.dataset.odo || '';
  if (key) memory.set(key, text);
  el.dataset.odo = text;
  el.setAttribute('aria-label', text);
  const chars = [...text];
  const before = [...prev];
  const shift = before.length - chars.length;
  const animate = prev && prev !== text && !reducedMotion();
  let out = '';
  chars.forEach((ch, i) => {
    if (ch >= '0' && ch <= '9') {
      const p = before[i + shift];
      const from = animate && p >= '0' && p <= '9' ? +p : animate ? 0 : +ch;
      out += `<span class="odo-d"><span class="odo-col" data-to="${ch}" style="transform:translate3d(0,${-from * 10}%,0)">${COL}</span></span>`;
    } else {
      out += `<span class="odo-s">${esc(ch)}</span>`;
    }
  });
  el.innerHTML = `<span class="odo" aria-hidden="true">${out}</span>`;
  if (!animate) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const cols = el.querySelectorAll('.odo-col');
    cols.forEach((c, i) => {
      c.style.transitionDelay = `${(cols.length - 1 - i) * 28}ms`;
      c.style.transform = `translate3d(0,${-c.dataset.to * 10}%,0)`;
    });
  }));
}
