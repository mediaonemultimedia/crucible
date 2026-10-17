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
const cond = fs.readFileSync(path.join(src, 'assets/oswald-subset.woff2')).toString('base64');
const face = `/* Bubble lettering: a subset of Gochi Hand, Copyright (c) 2011 HT Fonts, SIL Open Font License 1.1.
   Display type: a subset of Lilita One, Copyright (c) 2011 Juan Montoreano, SIL Open Font License 1.1.
   HUD condensed caps: a subset of Oswald, Copyright 2016 The Oswald Project Authors, SIL Open Font License 1.1. */
@font-face{font-family:"Bolster Hand";src:url(data:font/woff2;base64,${font}) format("woff2");font-display:block}
@font-face{font-family:"Bolster Display";src:url(data:font/woff2;base64,${font2}) format("woff2");font-display:block}
@font-face{font-family:"Bolster Condensed";src:url(data:font/woff2;base64,${cond}) format("woff2");font-weight:700;font-display:block}`;
html = html.replace('/*FONTFACE*/', () => face);

/* the Pillow Fight logo (the owner's artwork, transparent WebP), inlined */
if (!html.includes('__LOGO__')) throw new Error('index.html is missing the __LOGO__ marker');
const logo = fs.readFileSync(path.join(root, 'assets/pillow-fight-logo.webp')).toString('base64');
html = html.replace('__LOGO__', () => `data:image/webp;base64,${logo}`);

const final = html.replace('<!--BUNDLE-->', () => `<script>\n${js}\n</script>`);
const dest = path.join(root, 'final.html');
fs.writeFileSync(dest, final);

/* ── self-containment gate ────────────────────────────────────────────────
   The rule for this series is zero runtime network requests, with one
   exception that stage 2 brings: online play. After the player picks
   Online or opens a ?room= link — never before, never in the offline modes
   — the page may reach exactly the PeerJS cloud broker (0.peerjs.com, the
   handshake), public STUN (stun.l.google.com:19302) and the peer itself.
   PeerJS is bundled (no script fetch). Everything else: no `src`
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

/* PeerJS's own strings: links in its log/error text and package metadata,
   never requested */
const PEERJS_TEXT = [
  'https://peerjs.com',
  'https://github.com/peers/peerjs',
  'https://github.com/peers/peerjs/issues',
  'https://opencollective.com/peer',
];

const urlLiterals = [...new Set([...js.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/gi)].map((m) => m[1]))]
  .filter((u) => !NS_ALLOW.includes(u) && !PEERJS_TEXT.includes(u));

/* the network the online mode may use: the broker host, and ICE servers.
   Our STUN is the only one passed to PeerJS; its built-in defaults (a
   Google STUN and two peerjs TURN hosts) are in the bundle but overridden
   by src/net/link.js, so never contacted. Any other ws(s):// or stun:/turn:
   literal fails the build. */
const NET_ALLOW = ['0.peerjs.com', 'stun:stun.l.google.com:19302', 'turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'];
const netLiterals = [...new Set([
  ...[...js.matchAll(/["'`]((?:wss?:\/\/|stuns?:|turns?:)[^"'`\s]+)["'`]/gi)].map((m) => m[1]),
  ...[...js.matchAll(/["'`]([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io))["'`]/gi)].map((m) => m[1]),
])].filter((u) => !NET_ALLOW.includes(u));
const stunOk = /stun:stun\.l\.google\.com:19302/.test(js) && js.includes('0.peerjs.com');

const netCalls = [...js.matchAll(/\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/g)].map((m) => m[0]);

console.log(`\nbundle   ${(js.length / 1024).toFixed(1)} KB`);
console.log(`final    ${(fs.statSync(dest).size / 1024).toFixed(1)} KB  -> ${dest}`);
console.log(`fetched refs   ${fetched.length ? fetched.join(', ') : 'none'}`);
console.log(`dynamic import ${dynImports.length ? dynImports.join(', ') : 'none'}`);
console.log(`url literals   ${urlLiterals.length ? urlLiterals.join(', ') : 'none'} (in script)`);
console.log(`fetch sites    ${netCalls.length} (three's loaders, never reached; PeerJS's broker calls, online only)`);
console.log(`online net     ${NET_ALLOW.join(', ')}${netLiterals.length ? ` — and NOT ALLOWED: ${netLiterals.join(', ')}` : ''}`);

const fail = [];
if (fetched.length) fail.push('page fetches external resources');
if (dynImports.length) fail.push('page has dynamic imports');
if (urlLiterals.length) fail.push(`script contains absolute URLs: ${urlLiterals.join(', ')}`);
if (netLiterals.length) fail.push(`script names network hosts outside the online allowlist: ${netLiterals.join(', ')}`);
if (!stunOk) fail.push('online: the broker / STUN configuration is missing');
if (fail.length) {
  console.error(`\nNOT SELF-CONTAINED\n  ${fail.join('\n  ')}`);
  process.exit(1);
}
console.log('\nself-contained OK');
