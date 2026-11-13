/* The audio pass's evidence: the game's own audio engine (from the built
   page) rendered on an OfflineAudioContext → WAV, then measured.

     node tools/audio-render.mjs [--html final.html] [--out shots/audio] [what …]

   what: menu, fight (A and B sections and the breakdown, 64 s), fight-boost
   (its last-15-s layer), vs, round, win, lose, cpu-fight (a 20 s seeded
   CPU-vs-CPU match through the app: sim events → sounds, music, stings,
   the K.O. duck — the same path as a real match, on the game's own clock),
   loop-seams (each loop's end into its start, to hear the join).

   Each WAV: peak (dBFS), samples at or over full scale (clipping), RMS, the
   longest stretch under -60 dBFS (a silent gap), and for loops the jump in
   level across the seam. Writes report.json and fails on a console error,
   a network request, clipping, or a gap in a loop.                          */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'audio')));
fs.mkdirSync(out, { recursive: true });
const want = args.length ? args : null;
const run = (n) => !want || want.includes(n);
const SR = 44100;

function wav(file, chans) {
  const n = chans[0].length, C = chans.length, buf = Buffer.alloc(44 + n * C * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * C * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(C, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * C * 2, 28); buf.writeUInt16LE(C * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * C * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * C + c) * 2);
  fs.writeFileSync(file, buf);
}

const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
function measure(chans, { skipHead = 0, skipTail = 0 } = {}) {
  const n = chans[0].length;
  let peak = 0, clip = 0, sum = 0;
  for (const x of chans) for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; sum += x[i] * x[i]; }
  // the longest run of 10 ms blocks under -60 dBFS (between the first and the last sound)
  const blk = SR / 100, rms = [];
  for (let i = 0; i + blk <= n; i += blk) { let s = 0; for (const x of chans) for (let j = i; j < i + blk; j++) s += x[j] * x[j]; rms.push(Math.sqrt(s / (blk * chans.length))); }
  const lo = Math.round(skipHead * 100), hi = rms.length - Math.round(skipTail * 100);
  let gap = 0, run = 0;
  for (let k = lo; k < hi; k++) { if (rms[k] < 0.001) { run++; gap = Math.max(gap, run); } else run = 0; }
  return { seconds: +(n / SR).toFixed(2), peak: +db(peak).toFixed(2), clipped: clip, rms: +db(Math.sqrt(sum / (n * chans.length))).toFixed(1), longestGap: +(gap / 100).toFixed(2), rms10: rms };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const report = {};
let bad = 0;
const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) bad++; };

async function page(q) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('network request: ' + r.url()); });
  await p.goto(`file://${html}?${q}`);
  await p.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  return { p, errs };
}

async function save(name, chans, o = {}) {
  wav(path.join(out, `${name}.wav`), chans);
  const m = measure(chans, o);
  const { rms10, ...r } = m;
  report[name] = r;
  console.log(`${name.padEnd(12)} ${r.seconds}s  peak ${r.peak} dBFS  clipped ${r.clipped}  rms ${r.rms} dB  longest gap ${r.longestGap}s`);
  check(r.clipped === 0, `${name}: no clipping`);
  return m;
}

/* one piece of music through the engine, on an offline context */
async function song(P, name, seconds, o = {}) {
  const res = await P.evaluate(async ([name, seconds, o, SR]) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const E = new window.__bolster.AudioEngine({ ctx, offline: true });
    E.settings = { mute: false, music: 0.6, sfx: 0.85 };
    E._levels();
    await E.decoded;
    E.renderSong(name, 0.02, { seconds: o.loopSeconds ?? seconds, boost: !!o.boost, tempo: o.tempo || 1 });
    const buf = await ctx.startRendering();
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  }, [name, seconds, o, SR]);
  return res.map((a) => Float32Array.from(a));
}

const { p: P, errs } = await page('noportraits&hold&webgl');
const tail = 1.0;
if (run('menu')) await save('menu-loop', await song(P, 'menu', 34.91 * 2 + tail, { loopSeconds: 34.91 * 2 }), { skipTail: tail + 0.2 });
if (run('fight')) {
  const m = await save('fight-loop', await song(P, 'fight', 64 + tail, { loopSeconds: 64 }), { skipTail: tail + 0.2 });
  // the sections, for listening: A 0–25.6 s, B 25.6–51.2 s, the breakdown after
  const all = fs.readFileSync(path.join(out, 'fight-loop.wav'));
  void all; void m;
}
if (run('fight-boost')) await save('fight-boost', await song(P, 'fight', 20 + tail, { loopSeconds: 20, boost: true, tempo: 1.07 }), { skipTail: tail + 0.2 });
for (const [n, s] of [['vs', 2.9], ['round', 1.6], ['win', 4.6], ['lose', 4.8]]) if (run(n)) await save(`${n}-sting`, await song(P, n, s), { skipTail: 0.6 });

/* the fight sections as their own files (cut from the 64 s loop) */
if (run('fight') && fs.existsSync(path.join(out, 'fight-loop.wav'))) {
  const raw = fs.readFileSync(path.join(out, 'fight-loop.wav'));
  const cut = (name, a, b) => {
    const s0 = Math.round(a * SR), s1 = Math.round(b * SR), hdr = Buffer.from(raw.subarray(0, 44)), body = raw.subarray(44 + s0 * 4, 44 + s1 * 4);
    hdr.writeUInt32LE(36 + body.length, 4); hdr.writeUInt32LE(body.length, 40);
    fs.writeFileSync(path.join(out, `${name}.wav`), Buffer.concat([hdr, body]));
  };
  cut('fight-A', 0, 25.62); cut('fight-B', 25.62, 51.22); cut('fight-breakdown', 51.22, 64.02);
}

/* the loop seams: the last 3 s and the first 3 s of the second pass, side by side in time */
if (run('loop-seams')) {
  for (const [name, len] of [['menu', 34.91], ['fight', 64]]) {
    const ch = await song(P, name, len + 3.5, { loopSeconds: len + 3.5 });
    // the level change across every bar line inside the loop (250 ms either side)
    const whole = measure(ch).rms10, bar = 4 * 60 / (name === 'menu' ? 110 : 150);
    const jumpAt = (sec) => { const k = Math.round(sec * 100), avg = (a, b) => whole.slice(a, b).reduce((s, v) => s + v, 0) / (b - a); return Math.abs(db(avg(k, k + 25)) - db(avg(k - 25, k))); };
    let inside = 0;
    for (let t = bar; t < len - bar / 2; t += bar) inside = Math.max(inside, jumpAt(t));
    const a = Math.round((len - 3) * SR), b = Math.round((len + 3) * SR);
    const seg = ch.map((x) => x.slice(a, b));
    const m = await save(`${name}-seam`, seg);
    // the join is just another bar line (the sequencer never splices: it plays on);
    // its level change is no bigger than the loop's own biggest bar-to-bar change
    const jump = jumpAt(len);
    report[`${name}-seam`].seamJumpDb = +jump.toFixed(1);
    report[`${name}-seam`].biggestBarJumpInsideDb = +inside.toFixed(1);
    check(m.longestGap < 0.3 && jump <= inside + 1, `${name} loop seam: no gap (${m.longestGap}s); level change at the join ${jump.toFixed(1)} dB (the loop's own bar lines: up to ${inside.toFixed(1)} dB)`);
  }
}

/* a 20 s CPU-vs-CPU match through the app: the engine on the game's clock */
if (run('cpu-fight')) {
  const { p: F, errs: e2 } = await page('p1=kevalanche&p2=sumaura&p1cpu=hard&cpu=hard&seed=11&noportraits&hold&webgl');
  const res = await F.evaluate(async ([SR, secs]) => {
    const B = window.__bolster;
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * (secs + 1)), SR);
    const E = new B.AudioEngine({ ctx, offline: true });
    E.settings = { mute: false, music: 0.6, sfx: 0.85 };
    E._levels();
    await E.decoded;
    E.clock = 0;
    B.audio = E;
    const log = [];
    const play = E.play.bind(E);
    E.play = (c, at) => { log.push({ t: +E.now().toFixed(3), id: c.id }); return play(c, at); };
    const frames = Math.round(secs * 60);
    let worst = 0, total = 0;
    for (let i = 0; i < frames; i++) {
      E.clock = 0.05 + i / 60;
      const t0 = performance.now();
      B.frame(1 / 60, false);
      const dt = performance.now() - t0;
      total += dt; worst = Math.max(worst, dt);
    }
    const buf = await ctx.startRendering();
    const counts = {};
    for (const l of log) counts[l.id] = (counts[l.id] || 0) + 1;
    return { ch: [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))], counts, log: log.slice(0, 400), phase: B.fight.st.phase, round: B.fight.st.round, wins: B.fight.st.wins, meanMs: total / frames, worstMs: worst };
  }, [SR, 20]);
  const m = await save('cpu-fight-20s', res.ch.map((a) => Float32Array.from(a)), { skipHead: 0.3, skipTail: 1.2 });
  report['cpu-fight-20s'].sounds = res.counts;
  report['cpu-fight-20s'].state = { phase: res.phase, round: res.round, wins: res.wins };
  report['cpu-fight-20s'].appFrameMs = { mean: +res.meanMs.toFixed(2), worst: +res.worstMs.toFixed(1) };
  fs.writeFileSync(path.join(out, 'cpu-fight-20s.cues.json'), JSON.stringify(res.log, null, 1));
  console.log('  sounds:', JSON.stringify(res.counts));
  check((res.counts['hit-light'] || 0) + (res.counts['hit-heavy'] || 0) > 0 && (res.counts.whoosh || 0) > 0, 'the fight made hit and swing sounds');
  check(m.longestGap < 2.5, `no long silence in the fight (${m.longestGap}s)`);
  if (e2.length) { console.log('  ERRORS:\n    ' + e2.join('\n    ')); bad += e2.length; }
  await F.close();
}

if (errs.length) { console.log('  ERRORS:\n    ' + errs.join('\n    ')); bad += errs.length; }
for (const k of ['menu-loop', 'fight-loop', 'fight-boost']) if (report[k]) check(report[k].longestGap < 0.6, `${k}: no silent gap (${report[k].longestGap}s)`);
const old = fs.existsSync(path.join(out, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) : {};
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...old, ...report }, null, 1));
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : '\naudio OK');
process.exit(bad ? 1 : 0);
