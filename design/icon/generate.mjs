// Benjamins logo v2 — the unfinished pyramid & the all-seeing eye (dollar-bill reverse),
// drawn from scratch in dollar inks. Generates every icon deliverable.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { withBrowser, renderSvg } from './render.mjs';

const ROOT = '/Users/saienturf/watch your Benjamins';
const T = path.join(path.dirname(new URL(import.meta.url).pathname), 'pyr');
fs.mkdirSync(T, { recursive: true });
const out = p => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };
const tmp = p => path.join(T, p);
const f = n => +n.toFixed(2);

// ---------------------------------------------------------------- geometry (1024 canvas)
const CX = 512;
const APEX = 318, BASE = 842, HALF = 312;           // full (virtual) pyramid
const TOP = 566;                                     // truncation (top of the stone body)
const CAP = 540;                                     // capstone base (floating 26 above)
const hw = y => (HALF * (y - APEX)) / (BASE - APEX); // half-width at height y
const EYE = { x: CX, y: 470 };
const RAYC = { x: CX, y: 446 };                      // glory centre

const INK = '#07120C', FOREST = '#123524', GREENBACK = '#1F5A3A', SEAL = '#2E7D4F', DOLLAR = '#85BB65',
  MINT = '#CFE3C4', PAPER = '#F2F0E6', SAGE = '#A7C88A';

function rays({ n, inner, long, short, halfDeg, id }) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const R = i % 2 ? short : long;
    const h = (halfDeg * Math.PI) / 180;
    const p = (ang, r) => `${f(RAYC.x + r * Math.cos(ang))} ${f(RAYC.y + r * Math.sin(ang))}`;
    d += `M${p(a - h * 0.35, inner)}L${p(a - h, R)}L${p(a + h, R)}L${p(a + h * 0.35, inner)}Z`;
  }
  return `<path d="${d}" fill="url(#${id})"/>`;
}

function courses(n, small) {
  let lines = '', joints = '';
  const h = (BASE - TOP) / n;
  for (let k = 1; k < n; k++) {
    const y = TOP + k * h;
    lines += `M${f(CX - hw(y))} ${f(y)}H${f(CX + hw(y))}`;
  }
  if (!small) {
    for (let k = 0; k < n; k++) {
      const y0 = TOP + k * h, y1 = y0 + h;
      const off = k % 2 ? 0 : 23;
      for (let x = CX - 330 + off; x < CX + 330; x += 46) joints += `M${f(x)} ${f(y0 + 2)}V${f(y1 - 2)}`;
    }
  }
  return { lines, joints };
}

/**
 * The logo. opts: bg (square background), glyph, small (optical variant ≤128px),
 * disc (circular seal medallion instead of the square), viewBox, size, raysOn
 */
export function logoSvg({ bg = true, glyph = true, small = false, disc = false, viewBox = '0 0 1024 1024', size = 1024, raysOn = true, scale = 1 } = {}) {
  const n = small ? 6 : 13;
  const { lines, joints } = courses(n, small);
  const pyrPath = `M${f(CX - HALF)} ${BASE}L${f(CX - hw(TOP))} ${TOP}H${f(CX + hw(TOP))}L${f(CX + HALF)} ${BASE}Z`;
  const capPath = `M${CX} ${APEX}L${f(CX + hw(CAP))} ${CAP}H${f(CX - hw(CAP))}Z`;
  const eyeW = small ? 82 : 66, eyeH = small ? 30 : 24;
  const eyePath = `M${CX - eyeW} ${EYE.y}Q${CX} ${EYE.y - eyeH * 1.9} ${CX + eyeW} ${EYE.y}Q${CX} ${EYE.y + eyeH * 1.9} ${CX - eyeW} ${EYE.y}Z`;
  const irisR = small ? 27 : 21, pupilR = small ? 12 : 9;
  const lineW = small ? 9 : 3.2;

  const defs = `<defs>
    <radialGradient id="bgG" cx="${CX}" cy="430" r="720" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2B6C47"/><stop offset=".42" stop-color="#1A4832"/><stop offset=".78" stop-color="${FOREST}"/><stop offset="1" stop-color="#0A1F14"/>
    </radialGradient>
    <radialGradient id="rayG" cx="${RAYC.x}" cy="${RAYC.y}" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${PAPER}" stop-opacity=".62"/><stop offset=".5" stop-color="${MINT}" stop-opacity=".22"/><stop offset="1" stop-color="${MINT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="haloG" cx="${RAYC.x}" cy="${RAYC.y}" r="250" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7F8EA" stop-opacity=".8"/><stop offset=".45" stop-color="${SAGE}" stop-opacity=".25"/><stop offset="1" stop-color="${DOLLAR}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="faceL" x1="0" y1="${TOP}" x2="0" y2="${BASE}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F1F5E6"/><stop offset="1" stop-color="#B7CFA0"/>
    </linearGradient>
    <linearGradient id="faceR" x1="0" y1="${TOP}" x2="0" y2="${BASE}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#AFC999"/><stop offset="1" stop-color="#6F935A"/>
    </linearGradient>
    <linearGradient id="capG" x1="0" y1="${APEX}" x2="0" y2="${CAP}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFA"/><stop offset=".55" stop-color="#EAF3DD"/><stop offset="1" stop-color="#C9DFB6"/>
    </linearGradient>
    <radialGradient id="irisG" cx="${EYE.x - 5}" cy="${EYE.y - 6}" r="${irisR * 1.3}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B6DD95"/><stop offset=".55" stop-color="${DOLLAR}"/><stop offset="1" stop-color="${SEAL}"/>
    </radialGradient>
    <linearGradient id="discRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAPER}" stop-opacity=".7"/><stop offset=".5" stop-color="${MINT}" stop-opacity=".12"/><stop offset="1" stop-color="${PAPER}" stop-opacity=".45"/>
    </linearGradient>
    <clipPath id="pyrClip"><path d="${pyrPath}"/></clipPath>
    <clipPath id="above"><rect x="-400" y="-400" width="1824" height="${BASE + 400}"/></clipPath>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`;

  // guilloché rings behind everything (large only)
  let rings = '';
  if (!small) {
    let d = '';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, R = 300, r = 150;
      const x = CX + R * Math.cos(a), y = 470 + R * Math.sin(a);
      d += `M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    rings = `<path d="${d}" fill="none" stroke="${MINT}" stroke-opacity=".07" stroke-width="2"/>`;
  }

  const background = disc
    ? `<circle cx="512" cy="512" r="492" fill="url(#bgG)"/>${rings ? `<g clip-path="url(#discClip)">${rings}</g>` : ''}
       <circle cx="512" cy="512" r="488" fill="none" stroke="url(#discRim)" stroke-width="8"/>
       <circle cx="512" cy="512" r="462" fill="none" stroke="${MINT}" stroke-opacity=".16" stroke-width="3"/>`
    : `<rect x="-600" y="-600" width="2224" height="2224" fill="url(#bgG)"/>${rings}`;

  const glory = raysOn
    ? `<g clip-path="url(#${disc ? 'discClip' : 'above'})">${rays({ n: small ? 20 : 32, inner: 150, long: small ? 470 : 520, short: small ? 360 : 400, halfDeg: small ? 3.6 : 2.3, id: 'rayG' })}</g>
       <circle cx="${RAYC.x}" cy="${RAYC.y}" r="250" fill="url(#haloG)"/>`
    : '';

  const body = `
    <ellipse cx="${CX}" cy="${BASE + 6}" rx="${HALF + 34}" ry="22" fill="#000" opacity=".35" filter="url(#blur18)"/>
    <path d="M${f(CX - HALF)} ${BASE}L${f(CX - hw(TOP))} ${TOP}H${CX}V${BASE}Z" fill="url(#faceL)"/>
    <path d="M${CX} ${BASE}V${TOP}H${f(CX + hw(TOP))}L${f(CX + HALF)} ${BASE}Z" fill="url(#faceR)"/>
    <g clip-path="url(#pyrClip)" fill="none" stroke="${GREENBACK}" stroke-linecap="round">
      <path d="${lines}" stroke-opacity=".5" stroke-width="${lineW}"/>
      ${joints ? `<path d="${joints}" stroke-opacity=".26" stroke-width="2.4"/>` : ''}
      <path d="M${CX} ${TOP}V${BASE}" stroke="${FOREST}" stroke-opacity=".28" stroke-width="${small ? 6 : 3}"/>
    </g>
    <path d="M${f(CX - HALF)} ${BASE}L${f(CX - hw(TOP))} ${TOP}H${f(CX + hw(TOP))}" fill="none" stroke="#FFFFF4" stroke-opacity=".75" stroke-width="${small ? 7 : 3}" stroke-linejoin="round"/>
    <path d="${capPath}" fill="#F7F8EA" opacity=".55" filter="url(#blur18)"/>
    <path d="${capPath}" fill="url(#capG)"/>
    <path d="M${CX} ${APEX}L${f(CX + hw(CAP))} ${CAP}H${CX}Z" fill="${GREENBACK}" opacity=".10"/>
    <path d="${capPath}" fill="none" stroke="#FFFFFA" stroke-opacity=".95" stroke-width="${small ? 7 : 3.5}" stroke-linejoin="round"/>
    <path d="M${f(CX - hw(CAP) + 16)} ${CAP - 9}L${CX} ${APEX + 30}" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="${small ? 6 : 3}" stroke-linecap="round"/>
    <path d="${eyePath}" fill="${FOREST}"/>
    <circle cx="${EYE.x}" cy="${EYE.y}" r="${irisR}" fill="url(#irisG)"/>
    <circle cx="${EYE.x}" cy="${EYE.y}" r="${pupilR}" fill="${INK}"/>
    <circle cx="${EYE.x - irisR * 0.34}" cy="${EYE.y - irisR * 0.36}" r="${small ? 6 : 4.6}" fill="${PAPER}"/>
    <path d="M${CX - eyeW} ${EYE.y}Q${CX} ${EYE.y - eyeH * 1.9} ${CX + eyeW} ${EYE.y}" fill="none" stroke="${INK}" stroke-width="${small ? 7 : 4}" stroke-linecap="round"/>`;

  const g = scale !== 1 ? `<g transform="translate(${CX} ${CX}) scale(${scale}) translate(${-CX} ${-CX})">` : '<g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">
  <title>Benjamins</title>
  ${defs.replace('</defs>', '<clipPath id="discClip"><circle cx="512" cy="512" r="488"/></clipPath></defs>')}
  ${bg ? background : ''}
  ${g}${bg || disc ? glory : raysOn ? glory : ''}${glyph ? body : ''}</g>
</svg>`;
}

// favicon: flat, legible at 16 px
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E7D4F"/><stop offset="1" stop-color="#123524"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#b)"/>
  <path d="M9 53 L21.6 34 H42.4 L55 53 Z" fill="#CFE3C4"/>
  <path d="M15.3 43.5 H48.7" stroke="#1F5A3A" stroke-width="2.4"/>
  <path d="M32 9.5 L41.2 29.5 H22.8 Z" fill="#F2F0E6"/>
  <ellipse cx="32" cy="23.4" rx="5.4" ry="3" fill="#123524"/>
  <circle cx="32" cy="23.4" r="1.6" fill="#85BB65"/>
</svg>`;

// ---------------------------------------------------------------- build
const MASK = 0.8, mvb = 1024 / MASK, moff = -(mvb - 1024) / 2;
const SRC = {
  master: logoSvg({}),
  masterSmall: logoSvg({ small: true }),
  aBg: logoSvg({ viewBox: '-256 -256 1536 1536', glyph: false }),
  aFg: logoSvg({ viewBox: '-256 -256 1536 1536', bg: false, raysOn: false, scale: 0.9 }),
  aFgSmall: logoSvg({ viewBox: '-256 -256 1536 1536', bg: false, raysOn: false, small: true, scale: 0.9 }),
  maskable: logoSvg({ viewBox: `${f(moff)} ${f(moff)} ${f(mvb)} ${f(mvb)}` }),
  iosDark: logoSvg({ bg: false }),
  seal: logoSvg({ disc: true, bg: true, scale: 0.86 }),
  favicon: FAVICON,
};
for (const [k, v] of Object.entries(SRC)) fs.writeFileSync(tmp(`${k}.svg`), v);

fs.writeFileSync(out('design/icon/icon.svg'), SRC.master);
fs.writeFileSync(out('design/icon/splash-glyph.svg'), SRC.seal);
fs.writeFileSync(out('web/src/assets/glyph.svg'), SRC.seal);
fs.writeFileSync(out('web/public/icons/favicon.svg'), FAVICON);

await withBrowser(async b => {
  for (const [k, px] of [['master', 1024], ['masterSmall', 1024], ['aBg', 1536], ['aFg', 1536], ['aFgSmall', 1536], ['maskable', Math.round(mvb)], ['iosDark', 1024], ['seal', 1024]]) {
    await renderSvg(b, tmp(`${k}.svg`), px, tmp(`${k}.png`));
  }
  await renderSvg(b, tmp('favicon.svg'), 256, tmp('favicon-256.png'));
});

const rs = (src, s) => sharp(src).resize(s, s, { kernel: 'lanczos3' });
const pick = s => (s <= 128 ? tmp('masterSmall.png') : tmp('master.png'));
function squircle(size, n = 5) {
  const pts = [], a = size / 2;
  for (let i = 0; i < 720; i++) {
    const t = (i / 720) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push(`${(a + a * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)} ${(a + a * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${pts.join('L')}Z"/></svg>`);
}
const masked = async (buf, size, mask) => sharp(buf).ensureAlpha().composite([{ input: await sharp(mask).resize(size, size).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();

// web / PWA
for (const s of [192, 512]) {
  const art = await rs(pick(s), s).png().toBuffer();
  await sharp(await masked(art, s, squircle(s))).png({ compressionLevel: 9 }).toFile(out(`web/public/icons/icon-${s}.png`));
}
await rs(tmp('maskable.png'), 512).removeAlpha().png({ compressionLevel: 9 }).toFile(out('web/public/icons/icon-maskable-512.png'));
await rs(tmp('master.png'), 180).removeAlpha().png({ compressionLevel: 9 }).toFile(out('web/public/icons/apple-touch-icon.png'));
await rs(tmp('favicon-256.png'), 32).png({ compressionLevel: 9 }).toFile(out('web/public/icons/favicon-32.png'));

// iOS
await sharp(tmp('master.png')).removeAlpha().png({ compressionLevel: 9 }).toFile(out('design/ios/AppIcon-1024.png'));
await sharp(tmp('iosDark.png')).png({ compressionLevel: 9 }).toFile(out('design/ios/AppIcon-1024-dark.png'));
await sharp(tmp('iosDark.png')).grayscale().png({ compressionLevel: 9 }).toFile(out('design/ios/AppIcon-1024-tinted.png'));

// Android adaptive + legacy
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const L = Math.round(108 * k), leg = Math.round(48 * k);
  await rs(tmp('aBg.png'), L).removeAlpha().webp({ quality: 92, effort: 6 }).toFile(out(`design/android-res/mipmap-${d}/ic_launcher_background.webp`));
  await rs(k <= 1.5 ? tmp('aFgSmall.png') : tmp('aFg.png'), L).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(out(`design/android-res/mipmap-${d}/ic_launcher_foreground.webp`));
  const inner = Math.round((leg * 44) / 48), pad = Math.round((leg - inner) / 2);
  const art = await rs(pick(inner), inner).png().toBuffer();
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}"/></svg>`);
  const rrect = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><rect width="${inner}" height="${inner}" rx="${inner * 0.2}"/></svg>`);
  const canvas = buf => sharp({ create: { width: leg, height: leg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: buf, left: pad, top: pad }]).webp({ lossless: true });
  await canvas(await masked(art, inner, rrect)).toFile(out(`design/android-res/mipmap-${d}/ic_launcher.webp`));
  await canvas(await masked(art, inner, circle)).toFile(out(`design/android-res/mipmap-${d}/ic_launcher_round.webp`));
}

// Android 13+ themed icon: pyramid + capstone with an eye cut-out (single colour)
{
  const k = (72 / 1024) * 0.86, P = ([x, y]) => `${f(54 + (x - CX) * k)} ${f(54 + (y - 512) * k)}`;
  const pyr = `M${P([CX - HALF, BASE])}L${P([CX - hw(TOP), TOP])}L${P([CX + hw(TOP), TOP])}L${P([CX + HALF, BASE])}Z`;
  const cap = `M${P([CX, APEX])}L${P([CX + hw(CAP), CAP])}L${P([CX - hw(CAP), CAP])}Z`;
  const ew = 70, eh = 27;
  const eye = `M${P([CX - ew, EYE.y])}Q${P([CX, EYE.y - eh * 1.9])} ${P([CX + ew, EYE.y])}Q${P([CX, EYE.y + eh * 1.9])} ${P([CX - ew, EYE.y])}Z`;
  const r = 13 * k * (1 / 1), cx = 54, cy = 54 + (EYE.y - 512) * k;
  const pupil = `M${f(cx - 22 * k)} ${f(cy)}a${f(22 * k)} ${f(22 * k)} 0 1 0 ${f(44 * k)} 0a${f(22 * k)} ${f(22 * k)} 0 1 0 ${f(-44 * k)} 0Z`;
  // courses as thin gaps: draw pyramid in 3 bands
  const band = (y0, y1) => `M${P([CX - hw(y1), y1])}L${P([CX - hw(y0), y0])}L${P([CX + hw(y0), y0])}L${P([CX + hw(y1), y1])}Z`;
  const gap = 10, bands = [[TOP, 650 - gap / 2], [650 + gap / 2, 745 - gap / 2], [745 + gap / 2, BASE]].map(([a, b]) => band(a, b)).join('');
  void pyr; void r;
  const vd = `<?xml version="1.0" encoding="utf-8"?>
<!-- Benjamins themed-icon silhouette (Android 13+): unfinished pyramid + capstone with the eye. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${bands}${cap}${eye}${pupil}" />
</vector>
`;
  fs.writeFileSync(out('design/android-res/drawable/ic_launcher_monochrome.xml'), vd);
}

// one small contact sheet for review
const sheet = await sharp({ create: { width: 1200, height: 420, channels: 4, background: '#0B1510' } })
  .composite([
    { input: await masked(await rs(tmp('master.png'), 360).png().toBuffer(), 360, squircle(360)), left: 30, top: 30 },
    { input: await masked(await rs(tmp('masterSmall.png'), 120).png().toBuffer(), 120, squircle(120)), left: 420, top: 30 },
    { input: await masked(await rs(tmp('masterSmall.png'), 60).png().toBuffer(), 60, squircle(60)), left: 560, top: 30 },
    { input: await masked(await rs(tmp('masterSmall.png'), 48).png().toBuffer(), 48, squircle(48)), left: 640, top: 30 },
    { input: await rs(tmp('seal.png'), 300).png().toBuffer(), left: 420, top: 100 },
    { input: await rs(tmp('favicon-256.png'), 64).png().toBuffer(), left: 760, top: 30 },
    { input: await rs(tmp('favicon-256.png'), 32).png().toBuffer(), left: 840, top: 46 },
  ]).png().toFile(tmp('sheet.png'));
console.log('done', tmp('sheet.png'));
