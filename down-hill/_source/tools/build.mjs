import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import { RACE_RECORDINGS } from '../src/audio/playlist.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const lookdev = process.argv.includes('--lookdev');
const out = path.join(root, 'build');

const result = await esbuild.build({
  entryPoints: [path.join(src, 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  define: { LOOKDEV_RACE: String(lookdev) },
  legalComments: 'none',
  // the SFX clips (src/audio/clips.js): inlined as base64 strings, decoded in the page
  loader: { '.mp3': 'base64' },
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
const bungee = fs.readFileSync(path.join(src, 'assets/bungee-latin.woff2')).toString('base64');
const bungeeLicense = fs.readFileSync(path.join(src, 'assets/bungee-OFL.txt'), 'utf8').trim();
const cond = fs.readFileSync(path.join(src, 'assets/oswald-subset.woff2')).toString('base64');
const face = `/* ${bungeeLicense} */
/* Bubble lettering: a subset of Gochi Hand, Copyright (c) 2011 HT Fonts, SIL Open Font License 1.1.
   Display type: a subset of Lilita One, Copyright (c) 2011 Juan Montoreano, SIL Open Font License 1.1.
   Race title and countdown: Bungee, Copyright 2023 The Bungee Project Authors, SIL Open Font License 1.1.
   HUD condensed caps: a subset of Oswald, Copyright 2016 The Oswald Project Authors, SIL Open Font License 1.1. */
@font-face{font-family:"Bolster Hand";src:url(data:font/woff2;base64,${font}) format("woff2");font-display:block}
@font-face{font-family:"Bungee";src:url(data:font/woff2;base64,${bungee}) format("woff2");font-display:block}
@font-face{font-family:"Bolster Display";src:url(data:font/woff2;base64,${font2}) format("woff2");font-display:block}
@font-face{font-family:"Bolster Condensed";src:url(data:font/woff2;base64,${cond}) format("woff2");font-weight:700;font-display:block}`;
html = html.replace('/*FONTFACE*/', () => face);

const courses = Object.fromEntries(['landing', 'laundry', 'park', 'hockey'].map((id) => [
  id, 'data:image/webp;base64,' + fs.readFileSync(path.join(src, 'assets/courses', id + '.webp')).toString('base64')
]));
const mi = process.argv.indexOf('--music-dir');
if (mi >= 0 && (!process.argv[mi + 1] || process.argv[mi + 1].startsWith('--'))) {
  throw new Error('--music-dir requires a directory containing the six MP3 files');
}
const recordings = mi < 0 ? [] : RACE_RECORDINGS.map(([artist, title]) => ({
  artist, title,
  url: 'data:audio/mpeg;base64,' + fs.readFileSync(path.join(process.argv[mi + 1], `${artist} - ${title}.mp3`)).toString('base64'),
}));
const media = JSON.stringify({ courses, recordings }).replaceAll('<', '\\u003c');
html = html.replace('<!--RACE_MEDIA-->', () => `<script type="application/json" id="race-media">${media}</script>`);
const final = html.replace('<!--BUNDLE-->', () => `<script>\n${js}\n</script>`);
const oi = process.argv.indexOf('--out');
const dest = oi > 0 ? path.resolve(process.argv[oi + 1]) : lookdev ? path.join(out, 'lookdev-race.html') : path.join(root, 'final.html');
fs.writeFileSync(dest, final);

/* ── self-containment gate ────────────────────────────────────────────────
   Down Hill makes zero runtime network requests (stage 2's phone pads will
   bring PF2's PeerJS exception with them; until then there is none). No
   `src` anywhere, no <link href>, no dynamic import, no absolute URL or
   network host reachable from the script. Anchors would be allowed (a place
   the reader may choose to go), but there are none.
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

/* Stage 2's one exception to "no network", as in Pillow Fight 2: the
   phone pads. The title and select screens open a pad room for the QR
   (?pads=off keeps it shut; the test harness's ?hold does too unless
   ?pads=1), so the page may reach exactly the PeerJS cloud broker
   (0.peerjs.com, the handshake), public STUN (stun.l.google.com:19302) and
   the phones themselves. The phone pad loads its painted background from
   controller/backgrounds/ beside the page. PeerJS is bundled (no script
   fetch). Its own strings below are links in its log text and package
   metadata, never requested; its built-in TURN defaults are overridden by
   src/pad/padlink.js (our STUN only), so never contacted. */
const PEERJS_TEXT = [
  'https://peerjs.com',
  'https://github.com/peers/peerjs',
  'https://github.com/peers/peerjs/issues',
  'https://opencollective.com/peer',
];

const urlLiterals = [...new Set([...js.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/gi)].map((m) => m[1]))]
  .filter((u) => !NS_ALLOW.includes(u) && !PEERJS_TEXT.includes(u));

const NET_ALLOW = ['0.peerjs.com', 'stun:stun.l.google.com:19302', 'turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'];
const netLiterals = [...new Set([
  ...[...js.matchAll(/["'`]((?:wss?:\/\/|stuns?:|turns?:)[^"'`\s]+)["'`]/gi)].map((m) => m[1]),
  ...[...js.matchAll(/["'`]([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io))["'`]/gi)].map((m) => m[1]),
])].filter((u) => !NET_ALLOW.includes(u));


const netCalls = [...js.matchAll(/\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/g)].map((m) => m[0]);

console.log(`\nbundle   ${(js.length / 1024).toFixed(1)} KB`);
console.log(`final    ${(fs.statSync(dest).size / 1024).toFixed(1)} KB  -> ${dest}`);
console.log(`fetched refs   ${fetched.length ? fetched.join(', ') : 'none'}`);
console.log(`dynamic import ${dynImports.length ? dynImports.join(', ') : 'none'}`);
console.log(`url literals   ${urlLiterals.length ? urlLiterals.join(', ') : 'none'} (in script)`);
console.log(`fetch sites    ${netCalls.length} (three's loaders and PeerJS's, never reached)`);
console.log(`net hosts      ${netLiterals.length ? `NOT ALLOWED: ${netLiterals.join(', ')}` : 'none'}`);

const fail = [];
if (fetched.length) fail.push('page fetches external resources');
if (dynImports.length) fail.push('page has dynamic imports');
if (urlLiterals.length) fail.push(`script contains absolute URLs: ${urlLiterals.join(', ')}`);
if (netLiterals.length) fail.push(`script names network hosts: ${netLiterals.join(', ')}`);
if (fail.length) {
  console.error(`\nNOT SELF-CONTAINED\n  ${fail.join('\n  ')}`);
  process.exit(1);
}
console.log('\nself-contained OK');
