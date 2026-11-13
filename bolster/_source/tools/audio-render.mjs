/* Audio captures: the game's own music and SFX code rendered offline (the
   same graph — buses, compressor, limiter, voice cap — on an
   OfflineAudioContext in headless Chromium), written to WAV, measured and
   encoded to MP3 for listening (shots/audio/*.mp3).

   - menu loop (a whole pass and on across the seam), fight loop A and B, the
     breakdown across the seam, the tense layer, each sting and jingle
   - a 20 s CPU-vs-CPU stretch with SFX: the SFX the real page asked for in
     tools/audio-check.mjs (shots/audio/fight-sfx.json, by sim tick) over the
     fight loop, the round sting and the K.O. duck, as the game schedules them
   Checks: peak (no clipping), loudness, no silent gaps, a clean loop seam.

     node tools/audio-render.mjs [--html final.html]                       */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(root, arg('--html', 'final.html'));
const out = path.join(root, 'shots/audio');
const tmp = path.join(out, 'wav');
fs.mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`file://${html}?hold&webgl&noportraits`);
await page.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });

const SR = 44100;
const bpm = { menu: 110, fight: 150 };

/* render in the page; back as 16-bit PCM (base64), both channels */
async function render(name, opts) {
  const b64 = await page.evaluate(async (o) => {
    const buf = await window.__bolster.renderAudio(o);
    const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const pcm = new Int16Array(n * 2);
    let peak = 0, clip = 0;
    for (let i = 0; i < n; i++) {
      for (const [c, d] of [[0, L], [1, R]]) {
        const v = d[i], a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clip++;
        pcm[i * 2 + c] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
      }
    }
    const u8 = new Uint8Array(pcm.buffer);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { data: btoa(s), peak, clip, n };
  }, opts);
  const pcm = Buffer.from(b64.data, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  const wav = path.join(tmp, `${name}.wav`);
  fs.writeFileSync(wav, Buffer.concat([hdr, pcm]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', path.join(out, `${name}.mp3`)]);
  return { name, wav, pcm, peak: b64.peak, clip: b64.clip, n: b64.n };
}

/* measurements on the PCM: peak, RMS, the longest quiet run, the seam */
function measure(r, { seam = null, tail = 0, quiet = -50 } = {}) {
  const x = new Int16Array(r.pcm.buffer, r.pcm.byteOffset, r.pcm.length / 2);
  const W = Math.round(SR * 0.05), frames = [];
  for (let i = 0; i + W * 2 <= x.length; i += W * 2) {
    let s = 0;
    for (let j = i; j < i + W * 2; j++) { const v = x[j] / 32768; s += v * v; }
    frames.push(10 * Math.log10(s / (W * 2) + 1e-12));
  }
  const n = frames.length - Math.round(tail / 0.05);
  let run = 0, worst = 0;
  for (let i = 2; i < n; i++) { if (frames[i] < quiet) { run++; worst = Math.max(worst, run); } else run = 0; }
  let total = 0; for (let i = 0; i < x.length; i++) { const v = x[i] / 32768; total += v * v; }
  const m = { peak: 20 * Math.log10(r.peak + 1e-12), rms: 10 * Math.log10(total / x.length + 1e-12), gap: worst * 0.05, clip: r.clip, secs: r.n / SR };
  if (seam !== null) {
    // the RMS in the 50 ms windows either side of the seam vs the 2 s around it,
    // and the sample-to-sample jump right at it
    const k = Math.round(seam / 0.05);
    const around = frames.slice(k - 40, k + 40).sort((a, b) => a - b);
    const med = around[around.length >> 1];
    m.seam = { at: seam, before: frames[k - 1], after: frames[k], median: med };
    const i0 = Math.round(seam * SR) * 2;
    let jump = 0;
    for (let i = i0 - 200; i < i0 + 200; i += 2) jump = Math.max(jump, Math.abs(x[i + 2] - x[i]) / 32768);
    m.seam.jump = jump;
  }
  return m;
}

const results = [];
const fail = [];
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
function report(name, m, { gapMax = 0.5 } = {}) {
  const bad = [];
  if (m.clip) bad.push(`${m.clip} clipped samples`);
  if (m.peak > -0.3) bad.push(`peak ${fmt(m.peak)} dBFS`);
  if (m.gap > gapMax) bad.push(`a ${fmt(m.gap)} s silent gap`);
  if (m.seam && (m.seam.after < m.seam.median - 12 || m.seam.before < m.seam.median - 12)) bad.push('a dip at the loop seam');
  if (m.seam && m.seam.jump > 0.5) bad.push(`a ${m.seam.jump.toFixed(2)} jump at the seam`);
  results.push({ name, ...m, ok: !bad.length, bad });
  if (bad.length) fail.push(`${name}: ${bad.join(', ')}`);
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name.padEnd(20)} ${fmt(m.secs)} s  peak ${fmt(m.peak)} dBFS  rms ${fmt(m.rms)} dB  longest quiet ${fmt(m.gap)} s${m.seam ? `  seam ${fmt(m.seam.before)}→${fmt(m.seam.after)} dB (median ${fmt(m.seam.median)}), jump ${m.seam.jump.toFixed(3)}` : ''}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
}

// the loops
const menuLen = 64 * 60 / bpm.menu, fightLen = 144 * 60 / bpm.fight;
report('menu-loop', measure(await render('menu-loop', { seconds: menuLen + 4, music: 'menu' }), { seam: menuLen + 0.02 }));
report('fight-A', measure(await render('fight-A', { seconds: 64 * 60 / bpm.fight, music: 'fight', musicFrom: 0 })));
report('fight-B', measure(await render('fight-B', { seconds: 64 * 60 / bpm.fight, music: 'fight', musicFrom: 64 })));
const fromBreak = 128;
report('fight-seam', measure(await render('fight-seam', { seconds: 12, music: 'fight', musicFrom: fromBreak }), { seam: (144 - fromBreak) * 60 / bpm.fight + 0.02, gapMax: 1 }));
report('fight-tense', measure(await render('fight-tense', { seconds: 16, music: 'fight', musicFrom: 0, intenseAt: 0 })));
// stings and jingles (the tail after the last note is the release)
for (const [name, secs] of [['vs', 2.6], ['round', 1.8], ['win', 5.2], ['lose', 5.6]]) {
  report(`jingle-${name}`, measure(await render(`jingle-${name}`, { seconds: secs, music: name }), { tail: name === 'lose' ? 1.6 : 0.9, gapMax: name === 'lose' ? 1.0 : 0.5 }));
}

// a 20 s stretch of the CPU-vs-CPU match with its SFX (from the real page's log)
const logPath = path.join(out, 'fight-sfx.json');
if (fs.existsSync(logPath)) {
  const L = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  const fightOn = L.flow.find((f) => f.music === 'fight')?.tick ?? 0;
  const duck = L.flow.find((f) => f.duck)?.tick ?? fightOn + 1200;
  const t0 = Math.max(fightOn - 30, duck - 16 * 60), secs = 20;
  const inWin = (tick) => tick >= t0 && tick < t0 + secs * 60;
  const sfx = L.sfx.filter((x) => inWin(x.tick)).map((x) => ({ id: x.id, gain: x.gain, rate: x.rate, delay: x.delay, t: (x.tick - t0) / 60 + 0.05 }));
  const stings = [];
  for (const f of L.flow) {
    if (!inWin(f.tick)) continue;
    const t = (f.tick - t0) / 60 + 0.05;
    if (f.sting) stings.push({ t, name: f.sting });
    if (f.duck) stings.push({ t, duck: f.duck, hold: f.hold });
  }
  const musicFrom = Math.max(0, (t0 - fightOn) / 60) * bpm.fight / 60;
  const intense = L.flow.find((f) => f.intense && f.tick >= t0 && f.tick < t0 + secs * 60);
  const r = await render('fight-20s-sfx', { seconds: secs, music: 'fight', musicFrom, sfx, stings, intenseAt: intense ? (intense.tick - t0) / 60 : null });
  report('fight-20s-sfx', measure(r), { gapMax: 0.5 });
  console.log(`  (${sfx.length} SFX in the window: ${[...new Set(sfx.map((x) => x.id))].sort().join(', ')}; ${stings.length} music cues)`);
  // and the same 20 s, SFX alone, every one of them
  const r2 = await render('sfx-only-20s', { seconds: secs, sfx, settings: { muted: false, music: 0, sfx: 85 } });
  const m2 = measure(r2, { quiet: -90 });
  report('sfx-only-20s', { ...m2, gap: 0 });
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(path.join(out, 'captures.json'), JSON.stringify(results.map(({ pcm, wav, ...r }) => r), null, 1));
if (errs.length) { console.log('console errors: ' + errs.join(' | ')); fail.push('console errors'); }
console.log(fail.length ? `FAILED: ${fail.join('; ')}` : 'audio captures: all checks passed');
process.exit(fail.length ? 1 : 0);
