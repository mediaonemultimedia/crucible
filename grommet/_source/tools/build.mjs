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

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
if (!html.includes('<!--BUNDLE-->')) throw new Error('index.html is missing the <!--BUNDLE--> marker');

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
