/* The audio pass's sound effects: the owner's draft clips
   (assets/audio/*.mp3) cleaned up for the game → assets/audio/game/*.mp3,
   which the build inlines (tools/build.mjs).

   Each clip: decoded by ffmpeg (mono, 44.1 kHz) through a high-pass (the
   drafts carry DC drift and sub-rumble a laptop speaker can't play) and,
   for the noisy ones, a light FFT denoise; cut to the window where the sound
   is (found from the envelopes: `node tools/sfx.mjs --report`); leading and
   trailing quiet trimmed; an optional decay envelope; a 2 ms fade in and a
   short fade out (no clicks); then the loudest 50 ms brought to a target
   level per kind (hits punchy, bodies and air softer, the crowd under them),
   the peak kept under -1 dBFS; then MP3, 64 kb/s mono (decoded by every
   target browser, Safari included).

   Rejected drafts (see README, "Audio"): sfx-hit-heavy (≈10 dB over its own
   hiss, no body), sfx-grab, ui-tick, ui-confirm (near-silent noise). Those
   slots are synthesised in src/audio/synth.js. sfx-block is kept as a quiet
   texture under a synthesised thud.

   node tools/sfx.mjs            # write assets/audio/game/*.mp3
   node tools/sfx.mjs --report   # levels and lengths, before and after      */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets/audio'), OUT = path.join(SRC, 'game');
const SR = 44100;

/* window [a, b] s; hp Hz; dn: denoise; target: dBFS RMS of the loudest 50 ms; decay: s (an exp tail); fo: fade out s */
export const CLIPS = {
  'hit-light':     { file: 'sfx-hit-light', a: 0.0, b: 0.42, hp: 45, target: -9, fo: 0.06 },
  'knockdown':     { file: 'sfx-knockdown', a: 0.0, b: 0.95, hp: 50, target: -11, fo: 0.12 },
  'land':          { file: 'sfx-land', a: 0.66, b: 1.07, hp: 60, target: -13, fo: 0.05 },
  'jump':          { file: 'sfx-jump', a: 0.50, b: 0.84, hp: 300, dn: 1, target: -17, fo: 0.05 },
  'whoosh':        { file: 'sfx-whoosh', a: 0.42, b: 0.86, hp: 70, dn: 1, target: -14, fo: 0.08 },
  'feather-burst': { file: 'sfx-feather-burst', a: 0.0, b: 1.3, hp: 90, target: -12, decay: 0.38, fo: 0.2 },
  'crowd-ooh':     { file: 'sfx-crowd-ooh', a: 0.0, b: 2.5, hp: 120, dn: 1, target: -16, fo: 0.5 },
  'block':         { file: 'sfx-block', a: 0.0, b: 0.32, hp: 150, dn: 1, target: -16, decay: 0.12, fo: 0.08 },
};

const ff = (args, input) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { input, maxBuffer: 1 << 28 });

function decode(file, filters) {
  const buf = ff(['-i', file, '-af', filters, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export function stats(x) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const w = Math.round(SR * 0.05);
  let best = 0, acc = 0;
  for (let i = 0; i < x.length; i++) { acc += x[i] * x[i]; if (i >= w) acc -= x[i - w] * x[i - w]; if (i >= w - 1) best = Math.max(best, acc / w); }
  if (x.length < w) best = acc / Math.max(1, x.length);
  const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
  return { peak: db(peak), rms50: db(Math.sqrt(best)), dur: x.length / SR };
}

function clean(c) {
  const chain = [`highpass=f=${c.hp}:poles=2`, `highpass=f=${c.hp}:poles=2`];
  if (c.dn) chain.push('afftdn=nf=-50');
  let x = decode(path.join(SRC, `${c.file}.mp3`), chain.join(','));
  x = x.slice(Math.round(c.a * SR), Math.round(c.b * SR));
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  // leading quiet: from 3 ms before the first sample over 6 % of the peak
  let s = 0;
  while (s < x.length && Math.abs(x[s]) < peak * 0.06) s++;
  s = Math.max(0, s - Math.round(SR * 0.003));
  // trailing quiet: after the last 10 ms block over 1.5 % of the peak
  let e = x.length;
  const blk = Math.round(SR * 0.01);
  for (let j = x.length - blk; j > s; j -= blk) {
    let m = 0;
    for (let i = j; i < j + blk; i++) m = Math.max(m, Math.abs(x[i]));
    if (m > peak * 0.015) { e = Math.min(x.length, j + blk * 2); break; }
  }
  x = x.slice(s, e);
  // an exp decay (a burst rather than a bed), and the fades
  const fi = Math.round(SR * 0.002), fo = Math.round(SR * c.fo);
  for (let i = 0; i < x.length; i++) {
    let g = 1;
    if (c.decay) g *= Math.exp(-Math.max(0, i / SR - 0.03) / c.decay);
    if (i < fi) g *= i / fi;
    if (i > x.length - fo) g *= Math.max(0, (x.length - i) / fo) ** 2;
    x[i] *= g;
  }
  // level: the loudest 50 ms to its target, the peak under -1 dBFS
  const st = stats(x);
  let gain = c.target - st.rms50;
  gain = Math.min(gain, -1 - st.peak);
  const k = 10 ** (gain / 20);
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

function encode(x, dest) {
  const pcm = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  ff(['-y', '-f', 's16le', '-ar', String(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', dest], pcm);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = process.argv.includes('--report');
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [id, c] of Object.entries(CLIPS)) {
    const raw = stats(decode(path.join(SRC, `${c.file}.mp3`), 'anull'));
    const x = clean(c);
    const dest = path.join(OUT, `${id}.mp3`);
    if (!report) encode(x, dest);
    const out = stats(decode(dest, 'anull'));
    const kb = fs.statSync(dest).size / 1024;
    total += kb;
    console.log(`${id.padEnd(14)} draft ${raw.dur.toFixed(2)} s peak ${raw.peak.toFixed(1)} rms50 ${raw.rms50.toFixed(1)}  →  ${out.dur.toFixed(2)} s peak ${out.peak.toFixed(1)} rms50 ${out.rms50.toFixed(1)}  ${kb.toFixed(1)} KB`);
  }
  console.log(`total ${total.toFixed(1)} KB (${(total * 4 / 3).toFixed(1)} KB as base64)`);
}
