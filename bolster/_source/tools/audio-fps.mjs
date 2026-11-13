/* What the sound costs the frame: the game's CPU time per 60 Hz frame in a
   CPU-vs-CPU match (Hard v Hard, drawing skipped: headless SwiftShader
   draws on the CPU, see feel-fps.mjs) with the audio silent (never
   unlocked) vs on (unlocked: SFX voices built per event, the music's
   scheduler pumped every frame), and the music scheduler's own time over
   10 s of wall clock with the tense fight loop playing.
     node tools/audio-fps.mjs [--html final.html]                          */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errors = 0;
const res = {};
for (const on of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=kevalanche&p2=johnny&p1cpu=hard&cpu=hard&seed=5&noportraits&hold&webgl`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster?.fight, null, { timeout: 240000 });
  if (on) { await page.keyboard.press('KeyQ'); await page.waitForTimeout(800); }
  const r = await page.evaluate(() => {
    const B = window.__bolster, ms = [];
    const n0 = B.audio.counts.sfx;
    for (let i = 0; i < 1500; i++) { const t = performance.now(); B.frame(1 / 60, false); if (i >= 300) ms.push(performance.now() - t); }
    const s = [...ms].sort((a, b) => a - b);
    return { mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], n: ms.length, sfx: B.audio.counts.sfx - n0, state: B.audio.ctx?.state ?? 'none', voices: B.audio.voices.length };
  });
  res[on ? 'on' : 'off'] = r;
  console.log(`audio ${on ? 'on ' : 'off'} (${r.state}): CPU ${r.mean.toFixed(2)} ms/frame mean, ${r.p95.toFixed(2)} p95, ${r.max.toFixed(1)} max over ${r.n} frames; ${r.sfx} SFX asked for`);
  if (on) {
    // the scheduler's own JS time, real time, the tense fight loop (the busiest track)
    const p = await page.evaluate(async () => {
      const A = window.__bolster.audio;
      A.music('fight'); A.setIntense(true);
      const pump = A.pump.bind(A);
      let t = 0, calls = 0;
      A.pump = () => { const s = performance.now(); pump(); t += performance.now() - s; calls++; };
      await new Promise((r) => setTimeout(r, 10000));
      return { ms: t, calls, nodes: A.loopSeq?.idx };
    });
    console.log(`music scheduler: ${(p.ms / 10).toFixed(2)} ms per second of music (${p.calls} pumps in 10 s) = ${(p.ms / 10 / 60).toFixed(3)} ms per 60 Hz frame`);
    res.scheduler = p;
  }
  errors += errs.length;
  if (errs.length) console.log('  ERRORS ' + errs.join(' | '));
  await page.close();
}
await browser.close();
const d = res.on.mean - res.off.mean;
console.log(`the sound's share: ${d.toFixed(2)} ms per frame (of a 16.7 ms budget)`);
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
