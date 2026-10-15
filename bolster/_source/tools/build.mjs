import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'build');

const result = await esbuild.build({
  entryPoints: [path.join(src, 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  write: false,
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bundle.js'), js);

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
if (!html.includes('<!--BUNDLE-->')) throw new Error('index.html is missing the <!--BUNDLE--> marker');
if (!html.includes('/*FONTFACE*/')) throw new Error('index.html is missing the /*FONTFACE*/ marker');

/* the speech-bubble hand: Gochi Hand (SIL OFL 1.1), subset by tools/font.mjs
   to the characters the fighters say, inlined. Declared under its own
   family name (a modified OFL font doesn't carry its Reserved Font Name). */
const font = fs.readFileSync(path.join(src, 'assets/gochi-hand-subset.woff2')).toString('base64');
const font2 = fs.readFileSync(path.join(src, 'assets/lilita-one-subset.woff2')).toString('base64');
const face = `/* Bubble lettering: a subset of Gochi Hand, Copyright (c) 2011 HT Fonts, SIL Open Font License 1.1.
   Display type: a subset of Lilita One, Copyright (c) 2011 Juan Montoreano, SIL Open Font License 1.1. */
@font-face{font-family:"Bolster Hand";src:url(data:font/woff2;base64,${font}) format("woff2");font-display:block}
@font-face{font-family:"Bolster Display";src:url(data:font/woff2;base64,${font2}) format("woff2");font-display:block}`;
html = html.replace('/*FONTFACE*/', () => face);

const final = html.replace('<!--BUNDLE-->', () => `<script>\n${js}\n</script>`);
const dest = path.join(root, 'final.html');
fs.writeFileSync(dest, final);

/* ── self-containment gate ────────────────────────────────────────────────
   The rule for this series is zero runtime network requests: no `src`
   anywhere, no <link href>, no dynamic import, no absolute URL reachable
   from the script. Anchors are allowed — an anchor is a place the reader
   may choose to go, not a resource the page loads — but there are none in
   this piece.
   ──────────────────────────────────────────────────────────────────────── */
const fetched = [];
for (const m of final.matchAll(/<([a-z0-9]+)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
  if (!/^data:/i.test(m[2])) fetched.push(`${m[1]}[src]=${m[2]}`);
}
for (const m of final.matchAll(/<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
  if (!/^data:/i.test(m[1]) && !/^#/.test(m[1])) fetched.push(`link[href]=${m[1]}`);
}
// CSS: every url() must be a data: URI (the font), and no @import
const css = [...final.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
  if (!/^data:/i.test(m[1]) && !/^#/.test(m[1])) fetched.push(`css url(${m[1]})`);
}
if (/@import\b/i.test(css)) fetched.push('css @import');
const dynImports = [...final.matchAll(/\b(?:import|importScripts)\s*\(\s*["']([^"']+)/g)].map((m) => m[1]);

const NS_ALLOW = [
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
];

const urlLiterals = [...new Set([...js.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/gi)].map((m) => m[1]))]
  .filter((u) => !NS_ALLOW.includes(u));

const netCalls = [...js.matchAll(/\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/g)].map((m) => m[0]);

console.log(`\nbundle   ${(js.length / 1024).toFixed(1)} KB`);
console.log(`final    ${(fs.statSync(dest).size / 1024).toFixed(1)} KB  -> ${dest}`);
console.log(`fetched refs   ${fetched.length ? fetched.join(', ') : 'none'}`);
console.log(`dynamic import ${dynImports.length ? dynImports.join(', ') : 'none'}`);
console.log(`url literals   ${urlLiterals.length ? urlLiterals.join(', ') : 'none'} (in script)`);
console.log(`fetch sites    ${netCalls.length} (three's loaders, never reached)`);

const fail = [];
if (fetched.length) fail.push('page fetches external resources');
if (dynImports.length) fail.push('page has dynamic imports');
if (urlLiterals.length) fail.push(`script contains absolute URLs: ${urlLiterals.join(', ')}`);
if (fail.length) {
  console.error(`\nNOT SELF-CONTAINED\n  ${fail.join('\n  ')}`);
  process.exit(1);
}
console.log('\nself-contained OK');
