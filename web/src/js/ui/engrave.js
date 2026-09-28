// Guilloché: the interlaced "security engraving" rosettes printed on banknotes.
// Generated as tiny SVG data-URIs (one per theme) and exposed as CSS custom properties.

function rosette(stroke, size = 320) {
  const c = size / 2;
  const rings = [
    { n: 40, R: 44, r: 74 },
    { n: 56, R: 104, r: 40 },
    { n: 72, R: 138, r: 16 },
  ];
  let d = '';
  for (const { n, R, r } of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = (c + R * Math.cos(a)).toFixed(1), y = (c + R * Math.sin(a)).toFixed(1);
      // full circle as two arcs (shorter than <circle> × n)
      d += `M${(+x - r).toFixed(1)} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><path fill='none' stroke='${stroke}' stroke-width='.6' d='${d}'/><circle cx='${c}' cy='${c}' r='${c - 2}' fill='none' stroke='${stroke}' stroke-width='1.2'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const cache = {};
/** Set --guilloche (the note's --engrave ink) and --guilloche-card (cream, for dark cards) on :root. */
export function applyEngraving() {
  const key = getComputedStyle(document.documentElement).getPropertyValue('--engrave').trim() || 'rgba(207,227,196,0.14)';
  cache[key] ||= rosette(key);
  cache.card ||= rosette('rgba(247,245,234,0.2)');
  cache.cardDark ||= rosette('rgba(15,26,19,0.18)');
  const s = document.documentElement.style;
  s.setProperty('--guilloche', cache[key]);
  s.setProperty('--guilloche-card', cache.card);
  s.setProperty('--guilloche-card-ink', cache.cardDark);
}
