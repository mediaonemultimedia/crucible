/* The music, rendered offline: the real engine and synth (audio/engine.js
   renderOffline: the same graph, the same voices) on an OfflineAudioContext
   in headless Chromium → WAV → MP3 clips for listening before playing, and
   a few numbers per track (loudness, brightness, the lead's range).
     node tools/music.mjs [--seconds 40] [--out shots/music] [track …]
   Each track: <name>.mp3 (from the top: the intro, A, A'), <name>-lift.mp3
   (the B section's key change), <name>-final-lap.mp3 (the switch to the
   final lap on a bar line, the hype layer in, ~6 % faster).            */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { TRACKS, compile, seconds as loopSeconds } from '../src/audio/music.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const secs = +arg('--seconds', 40);
const outDir = path.resolve(root, arg('--out', 'shots/music'));
const names = process.argv.slice(2).filter((a, i, A) => !a.startsWith('--') && !(A[i - 1] || '').startsWith('--'));
const list = names.length ? names : ['race', 'laundry', 'park', 'menu'];
fs.mkdirSync(outDir, { recursive: true });

const js = (await esbuild.build({
  stdin: { contents: "import { renderOffline } from './src/audio/engine.js'; window.renderOffline = renderOffline;", resolveDir: root },
  bundle: true, format: 'iife', write: false, logLevel: 'silent',
})).outputFiles[0].text;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const net = [];
page.on('request', (r) => { if (!/^(about|data|blob):/.test(r.url())) net.push(r.url()); });
page.on('pageerror', (e) => { throw e; });
await page.setContent('<!doctype html><title>music</title>');
await page.addScriptTag({ content: js });

/* render in the page; back as 16-bit stereo PCM (base64) plus stats */
async function render(opts) {
  return page.evaluate(async (o) => {
    const buf = await window.renderOffline(o);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const pcm = new Int16Array(n * 2);
    let peak = 0, sum = 0, hi = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
      pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
      const m = (l + r) / 2;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      sum += m * m;
      const d = m - prev; prev = m; hi += d * d;       // first difference: weights the highs
    }
    const u8 = new Uint8Array(pcm.buffer);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(s), rate: buf.sampleRate, peak, rms: Math.sqrt(sum / n), bright: Math.sqrt(hi / Math.max(sum, 1e-9)) };
  }, opts);
}

function wav(file, b64, rate) {
  const data = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
function mp3(name, r, fadeIn = 0) {
  const w = path.join(outDir, `${name}.wav`), m = path.join(outDir, `${name}.mp3`);
  wav(w, r.b64, r.rate);
  const len = r.b64.length * 0.75 / 4 / r.rate;
  const af = [fadeIn ? `afade=t=in:d=${fadeIn}` : null, `afade=t=out:st=${(len - 2).toFixed(2)}:d=2`].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-af', af, '-codec:a', 'libmp3lame', '-b:a', '128k', m]);
  fs.unlinkSync(w);
  return m;
}
const db = (x) => (20 * Math.log10(x)).toFixed(1);
const name2 = (n) => ({ race: 'landing' }[n] || n);

for (const n of list) {
  const c = compile(TRACKS[n]);
  const spb = 60 / c.bpm;
  const lead = c.events.filter((e) => e.ch === 'lead').map((e) => e.note);
  const lo = Math.min(...lead), hi = Math.max(...lead);
  const oct = (m) => `${['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'][m % 12]}${Math.floor(m / 12) - 1}`;
  const in4 = lead.filter((m) => m < 72).length / lead.length;
  const top = await render({ seconds: secs, music: n });
  mp3(name2(n), top);
  const row = { track: n, bpm: c.bpm, loop: `${loopSeconds(c).toFixed(1)} s`, lead: `${oct(lo)}–${oct(hi)} (${Math.round(in4 * 100)} % below c5)`, rms: `${db(top.rms)} dBFS`, peak: `${db(top.peak)} dBFS`, bright: top.bright.toFixed(3) };
  if (c.loop && c.hypeTempo !== 1) {
    // the lift: from two bars before B (bar 18) for ~24 s
    const liftFrom = 16 * 4;
    mp3(`${name2(n)}-lift`, await render({ seconds: Math.min(secs, 26), music: n, musicFrom: liftFrom }), 0.3);
    // the final lap: start mid-A', go intense mid-bar 6 s in; it switches on the next bar line
    const from = 12 * 4, at = 6 + 0.5 * 4 * spb * 0.37;
    const fl = await render({ seconds: Math.min(secs, 30), music: n, musicFrom: from, intenseAt: at });
    mp3(`${name2(n)}-final-lap`, fl, 0.3);
    row.finalLap = `×${c.hypeTempo} from the bar after ${at.toFixed(2)} s`;
  }
  console.log(JSON.stringify(row));
}
if (net.length) { console.error('NETWORK', net); process.exitCode = 1; }
await browser.close();
