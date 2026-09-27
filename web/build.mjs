// Build: bundles src/ into ONE self-contained HTML file (dist/index.html) used by the
// Android/iOS shells, plus a deployable PWA folder (dist/pwa/) with manifest + service worker.
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const targets = ['chrome90', 'safari15', 'firefox100'];

const r = (...p) => path.join(root, ...p);
const kb = n => (n / 1024).toFixed(1) + ' KB';
const gz = s => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;

async function bundleJS() {
  const out = await esbuild.build({
    entryPoints: [r('src/js/main.js')],
    bundle: true,
    format: 'iife',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    target: targets,
    write: false,
    legalComments: 'none',
    charset: 'utf8',
    define: { __VERSION__: JSON.stringify(VERSION), __DEV__: String(dev) },
    loader: { '.svg': 'text' },
  });
  let js = out.outputFiles[0].text;
  // In minified output, literal newlines only survive inside template literals (our HTML
  // templates) — drop the indentation after them. Safe: HTML treats it as whitespace.
  if (!dev) js = js.replace(/\n[ \t]+/g, '\n');
  return js;
}

async function bundleCSS() {
  const out = await esbuild.build({
    entryPoints: [r('src/css/index.css')],
    bundle: true,
    minify: !dev,
    target: targets,
    write: false,
    charset: 'utf8',
  });
  return out.outputFiles[0].text;
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function copyDir(src, dst) {
  if (!(await exists(src))) return [];
  await fs.mkdir(dst, { recursive: true });
  const copied = [];
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copied.push(...(await copyDir(s, d)).map(f => e.name + '/' + f));
    else { await fs.copyFile(s, d); copied.push(e.name); }
  }
  return copied;
}

const t0 = Date.now();
const [js, css, tpl] = await Promise.all([bundleJS(), bundleCSS(), fs.readFile(r('src/index.html'), 'utf8')]);

// Never let a stray "</script>" or "</style>" inside the bundles terminate the inline tags.
const safeJS = js.replace(/<\/script/gi, '<\\/script');
const safeCSS = css.replace(/<\/style/gi, '<\\/style');

// Collapse whitespace in the (tiny) template only — never inside the inlined bundles.
let shell = tpl.replaceAll('@VERSION@', VERSION);
if (!dev) shell = shell.replace(/\n\s*<!--(?!\[)[\s\S]*?-->/g, '').replace(/>\s+</g, '><');
const html = shell
  .replace('/*@CSS*/', () => safeCSS)
  .replace('/*@JS*/', () => safeJS);

await fs.rm(r('dist'), { recursive: true, force: true });
await fs.mkdir(r('dist/pwa'), { recursive: true });
await fs.writeFile(r('dist/index.html'), html);

// ---- claude.ai artifact preview (host supplies doctype/head/body + viewport meta) -----
const artifact = html
  .replace(/^<!doctype html>/i, '')
  .replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/gi, '')
  .replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/gi, '')
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/gi, '')
  .replace('<title>Benjamins</title>', '<title>Watch Your Benjamins</title>');
await fs.writeFile(r('dist/artifact.html'), artifact.trimStart());

// ---- PWA folder -------------------------------------------------------------
await fs.writeFile(r('dist/pwa/index.html'), html);
const icons = await copyDir(r('public/icons'), r('dist/pwa/icons'));
const manifest = JSON.parse(await fs.readFile(r('public/manifest.webmanifest'), 'utf8'));
manifest.version = VERSION;
manifest.icons = manifest.icons.filter(i => icons.includes(i.src.replace(/^icons\//, '')));
await fs.writeFile(r('dist/pwa/manifest.webmanifest'), JSON.stringify(manifest, null, 2));
const assets = ['./', 'index.html', 'manifest.webmanifest', ...icons.map(i => 'icons/' + i)];
const hash = crypto.createHash('sha256').update(html + JSON.stringify(assets)).digest('hex').slice(0, 10);
const sw = (await fs.readFile(r('public/sw.js'), 'utf8'))
  .replace('@CACHE@', `wyb-${VERSION}-${hash}`)
  .replace('/*@ASSETS@*/[]', JSON.stringify(assets));
await fs.writeFile(r('dist/pwa/sw.js'), sw);
for (const extra of ['_headers', 'robots.txt']) {
  if (await exists(r('public', extra))) await fs.copyFile(r('public', extra), r('dist/pwa', extra));
}

console.log(`✓ built v${VERSION}${dev ? ' (dev)' : ''} in ${Date.now() - t0} ms`);
console.log(`  js  ${kb(js.length).padStart(9)}  gz ${kb(gz(js))}`);
console.log(`  css ${kb(css.length).padStart(9)}  gz ${kb(gz(css))}`);
console.log(`  dist/index.html ${kb(html.length)}  gz ${kb(gz(html))}`);
console.log(`  dist/pwa/ (+${icons.length} icons, sw cache wyb-${VERSION}-${hash})`);
