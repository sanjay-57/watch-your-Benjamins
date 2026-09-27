// The app glyph (liquid-glass eye with a coin iris) as an isolated <img> data URI,
// so its internal SVG filter/gradient ids never clash with the page.
import svg from '../../assets/glyph.svg';

const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s{2,}/g, ' '));

export const logo = (size = 64, cls = '') =>
  `<img class="logo ${cls}" src="${src}" width="${size}" height="${size}" alt="" decoding="async" draggable="false">`;
