// Tiny SVG chart kit (no library). All return markup strings.
import { esc } from '../core/util.js';

const f = n => +n.toFixed(2);

/** Monotone cubic (Fritsch–Carlson) path — smooth without overshooting the data. */
export function monotonePath(pts) {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

let gid = 0;

/** Area sparkline scaled to a 1000×h viewBox (stretches to the container width). */
export function sparkArea(series, { h = 74, color = 'var(--accent)', dot = true } = {}) {
  const n = series.length;
  if (n < 2) return '';
  const W = 1000;
  let lo = Math.min(...series), hi = Math.max(...series);
  const pad = (hi - lo) * 0.18 || Math.max(1, Math.abs(hi) * 0.05);
  lo -= pad; hi += pad;
  const top = 8, bottom = h - 4;
  const pts = series.map((v, i) => [(i / (n - 1)) * W, bottom - ((v - lo) / (hi - lo)) * (bottom - top)]);
  const line = monotonePath(pts);
  const id = 'sg' + ++gid;
  const last = pts[n - 1];
  return `
  <svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:${color};stop-opacity:.34"/>
      <stop offset="1" style="stop-color:${color};stop-opacity:0"/>
    </linearGradient></defs>
    <path d="${line}L${W},${h}L0,${h}Z" style="fill:url(#${id})" class="spark-fill"/>
    <path d="${line}" pathLength="1" vector-effect="non-scaling-stroke" class="spark-line" style="fill:none;stroke:${color};stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"/>
  </svg>
  ${dot ? `<i class="spark-dot" style="left:${f((last[0] / W) * 100)}%;top:${f((last[1] / h) * 100)}%;--dc:${color}"></i>` : ''}`;
}

/** Donut: segs [{value, color, label}] */
export function donut(segs, { size = 148, stroke = 17, gap = 4, center = '' } = {}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = segs.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  let arcs = '';
  if (total > 0) {
    const visible = segs.filter(s => s.value > 0);
    if (visible.length === 1) {
      arcs = `<circle class="seg-arc" cx="${cx}" cy="${cx}" r="${f(r)}" fill="none" stroke-width="${stroke}" style="stroke:${visible[0].color};--i:0" stroke-dasharray="${f(C)} 0"/>`;
    } else {
      let acc = 0;
      visible.forEach((s, i) => {
        const len = (s.value / total) * C;
        const dash = Math.max(0.01, len - gap - stroke);
        const off = acc + (stroke + gap) / 2;
        arcs += `<circle class="seg-arc" cx="${cx}" cy="${cx}" r="${f(r)}" fill="none" stroke-width="${stroke}" stroke-linecap="round" style="stroke:${s.color};--i:${i}" stroke-dasharray="${f(dash)} ${f(C - dash)}" stroke-dashoffset="${f(-off)}"><title>${esc(s.label || '')}</title></circle>`;
        acc += len;
      });
    }
  }
  return `<div class="donut"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cx}" r="${f(r)}" fill="none" stroke-width="${stroke}" style="stroke:var(--fill-3)"/>${arcs}
    </svg><div class="c">${center}</div></div>`;
}

/** Progress ring (0..1). */
export function ring(value, { size = 74, stroke = 8, color = 'var(--accent-rgb)', label = '' } = {}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return `<div class="ring" style="--c:${color}"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${f(r)}" fill="none" stroke-width="${stroke}"/>
    <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${f(r)}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${f(C)}" stroke-dashoffset="${f(C * (1 - v))}" style="animation: ring-in 1.2s var(--ease-out) both; --C:${f(C)}"/>
  </svg><div class="lbl">${label}</div></div>`;
}

/**
 * Vertical bars. vals: number[]; opts: {w, h, color (css rgb triplet var), highlight: idx,
 * avg: number|null, labels: [{i, text}], colors: per-bar triplet overrides, data-attrs for taps}
 */
export function bars(vals, { w = 320, h = 150, gap = 3, color = 'var(--accent-rgb)', highlight = -1, avg = null, labels = [], dim = null } = {}) {
  const n = vals.length;
  const labelH = labels.length ? 18 : 0;
  const plotH = h - labelH - 4;
  // cap one-off spikes (rent day…) so everyday bars stay readable; capped bars get a notch
  const pos = vals.filter(v => v > 0).sort((a, b) => a - b);
  const rawMax = Math.max(...vals, avg || 0, 1);
  const p85 = pos.length ? pos[Math.floor(pos.length * 0.85)] : 0;
  const cap = Math.max(p85 * 2.2, (avg || 0) * 2.4, 1);
  const max = pos.length >= 6 && rawMax > cap * 1.2 ? cap : rawMax;
  const bw = (w - gap * (n - 1)) / n;
  const rx = Math.min(bw / 2, 5);
  let out = '';
  vals.forEach((v, i) => {
    const clipped = v > max;
    const bh = v > 0 ? Math.max(3, (Math.min(v, max) / max) * plotH) : 2;
    const x = i * (bw + gap);
    const y = plotH - bh;
    const hi = i === highlight;
    const faded = dim != null && i > dim;
    const op = v > 0 ? (hi ? 1 : faded ? 0.25 : 0.62) : 0.18;
    out += `<rect class="bar-r" data-i="${i}" x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" rx="${f(rx)}" style="fill:rgb(${color} / ${op});--i:${i}${hi ? ';filter:drop-shadow(0 0 6px rgb(' + color + ' / .7))' : ''}"/>`;
    if (clipped) out += `<rect x="${f(x - 1)}" y="${f(y + 7)}" width="${f(bw + 2)}" height="2.5" style="fill:var(--bg-elev)" transform="rotate(-12 ${f(x + bw / 2)} ${f(y + 8)})"/>`;
  });
  if (avg) {
    const y = plotH - (avg / max) * plotH;
    out += `<line class="avg" x1="0" x2="${w}" y1="${f(y)}" y2="${f(y)}"/>`;
  }
  for (const l of labels) {
    const x = l.i * (bw + gap) + bw / 2;
    out += `<text x="${f(x)}" y="${h - 3}" text-anchor="middle">${esc(l.text)}</text>`;
  }
  // invisible hit targets
  vals.forEach((v, i) => { out += `<rect data-i="${i}" x="${f(i * (bw + gap) - gap / 2)}" y="0" width="${f(bw + gap)}" height="${plotH}" fill="transparent"/>`; });
  return `<svg viewBox="0 0 ${w} ${h}" height="${h}" role="img">${out}</svg>`;
}

/** Grouped bars for income vs expense per month. data: [{label, a, b}] */
export function pairBars(data, { w = 320, h = 160, ca = 'var(--pos-rgb)', cb = 'var(--spend-rgb)' } = {}) {
  const n = data.length;
  const labelH = 20;
  const plotH = h - labelH - 4;
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));
  const groupW = w / n;
  const bw = Math.min(16, (groupW - 14) / 2);
  let out = '';
  data.forEach((d, i) => {
    const gx = i * groupW + groupW / 2;
    [[d.a, ca, -1], [d.b, cb, 1]].forEach(([v, c, side], k) => {
      const bh = v > 0 ? Math.max(3, (v / max) * plotH) : 2;
      const x = side < 0 ? gx - bw - 2 : gx + 2;
      out += `<rect class="bar-r" x="${f(x)}" y="${f(plotH - bh)}" width="${f(bw)}" height="${f(bh)}" rx="${f(Math.min(5, bw / 2))}" style="fill:rgb(${c} / ${v > 0 ? (d.current ? 1 : 0.7) : 0.18});--i:${i * 2 + k}"/>`;
    });
    out += `<text x="${f(gx)}" y="${h - 4}" text-anchor="middle" style="${d.current ? 'fill:var(--t1);font-weight:700' : ''}">${esc(d.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" height="${h}" role="img">${out}</svg>`;
}
