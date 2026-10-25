/* Subset the bubble font (Gochi Hand, SIL OFL 1.1, via @fontsource) to the
   characters the fighters actually say, and write it to src/assets/. The
   build inlines it as base64, so the page loads no font from anywhere.
   Needs fonttools (pip install fonttools brotli). Re-run when a line changes. */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { FIGHTERS } from '../src/fighters/index.js';
import { SAYINGS } from '../src/ui/sayings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = [...SAYINGS];
for (const f of Object.values(FIGHTERS)) lines.push(f.catchphrase.main, f.catchphrase.egg, f.impatient);
const chars = [...new Set(lines.join('') + ' ')].sort().join('');
const src = path.join(root, 'node_modules/@fontsource/gochi-hand/files/gochi-hand-latin-400-normal.woff2');
const out = path.join(root, 'src/assets/gochi-hand-subset.woff2');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('pyftsubset', [src, `--text=${chars}`, `--output-file=${out}`, '--flavor=woff2', '--layout-features=*', '--no-hinting'], { stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'node_modules/@fontsource/gochi-hand/LICENSE'), path.join(root, 'src/assets/gochi-hand-OFL.txt'));
console.log(`subset ${chars.length} characters: ${JSON.stringify(chars)}`);
console.log(`${out}: ${fs.statSync(out).size} bytes (from ${fs.statSync(src).size})`);

/* the display face for the HUD, menus and banners: Lilita One (SIL OFL
   1.1), subset to printable ASCII plus the few marks the UI uses */
const ui = Array.from({ length: 95 }, (_, k) => String.fromCharCode(32 + k)).join('') + '’…—·✓∞←→↑↓';
const src2 = path.join(root, 'node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2');
const out2 = path.join(root, 'src/assets/lilita-one-subset.woff2');
execFileSync('pyftsubset', [src2, `--text=${ui}`, `--output-file=${out2}`, '--flavor=woff2', '--layout-features=*', '--no-hinting'], { stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'node_modules/@fontsource/lilita-one/LICENSE'), path.join(root, 'src/assets/lilita-one-OFL.txt'));
console.log(`${out2}: ${fs.statSync(out2).size} bytes (from ${fs.statSync(src2).size})`);

/* the HUD's condensed caps (labels, timer, names): Oswald 700 (SIL OFL
   1.1), subset to printable ASCII */
const src3 = path.join(root, 'node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff2');
const out3 = path.join(root, 'src/assets/oswald-subset.woff2');
execFileSync('pyftsubset', [src3, `--text=${ui}`, `--output-file=${out3}`, '--flavor=woff2', '--layout-features=*', '--no-hinting'], { stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'node_modules/@fontsource/oswald/LICENSE'), path.join(root, 'src/assets/oswald-OFL.txt'));
console.log(`${out3}: ${fs.statSync(out3).size} bytes (from ${fs.statSync(src3).size})`);
