/* The audio pass in the live page (headless Chromium, the real
   AudioContext): no context and no console warning before the first key;
   the menu loop after it; M mutes (and the speaker shows it); the sliders
   and mute are remembered across a reload; practice music sits low; the
   pause holds the music; sound actually comes out (an analyser on the
   output); the audio's CPU cost per frame in a CPU-vs-CPU match; and the
   screenshots of the mute toggle and the sliders.

     node tools/audio-live.mjs [--html final.html] [--out shots/audio]

   Fails on any console error or warning, any network request, a failed check. */
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
let bad = 0;
const report = {};
const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) bad++; };

async function open(q) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('network request: ' + r.url()); });
  await page.goto(`file://${html}?${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  const done = async () => { if (errs.length) { console.log('  CONSOLE:\n    ' + errs.join('\n    ')); bad += errs.length; } await page.close(); };
  return { page, errs, done };
}

/* ── the title, the first key, the menu loop, M ─────────────────────── */
{
  const { page, done } = await open('noportraits&hold&webgl');
  const B = (fn, a) => page.evaluate(fn, a);
  await B(() => { localStorage.removeItem('pillowfight.audio.v1'); });
  check(await B(() => window.__bolster.audio.ctx === null), 'no AudioContext before the first gesture');
  await B(() => window.__bolster.step(0.2, true));
  await page.screenshot({ path: path.join(out, 'title-sound-on.png') });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const s1 = await B(() => { const A = window.__bolster.audio; return { state: A.ctx?.state, loop: A.loopName, screen: window.__bolster.screen }; });
  check(s1.state === 'running' && s1.loop === 'menu' && s1.screen === 'mode', `after a key: context ${s1.state}, the ${s1.loop} loop, on ${s1.screen}`);
  // the output is not silent (an analyser on the limiter's output)
  const level = await B(async () => {
    const A = window.__bolster.audio, an = A.ctx.createAnalyser();
    an.fftSize = 2048; A.trim.connect(an);
    const d = new Float32Array(an.fftSize);
    let peak = 0;
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 50)); A.pump(); an.getFloatTimeDomainData(d); for (const v of d) peak = Math.max(peak, Math.abs(v)); }
    return peak;
  });
  check(level > 0.02, `the menu loop is coming out (peak ${level.toFixed(3)})`);
  // the menu sounds
  await B(() => { const A = window.__bolster.audio; A._log = []; const p = A.play.bind(A); A.play = (c, at) => { A._log.push(c.id); return p(c, at); }; });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  const log = await B(() => window.__bolster.audio._log.slice());
  check(log.filter((x) => x === 'ui-tick').length === 2, `menu moves tick (${log.join(', ')})`);
  // M mutes, the speaker shows it
  await page.keyboard.press('KeyM');
  const m = await B(() => ({ mute: window.__bolster.audio.settings.mute, off: document.querySelector('#snd-corner').classList.contains('off'), master: window.__bolster.audio.master.gain.value }));
  check(m.mute && m.off, 'M mutes; the speaker shows it struck through');
  await page.waitForTimeout(200);
  await B(() => window.__bolster.step(0.05, true));
  await page.screenshot({ path: path.join(out, 'mode-muted.png') });
  const box = await page.evaluate(() => { const r = document.querySelector('#snd-corner').getBoundingClientRect(); return { x: r.x - 70, y: r.y - 14, width: r.width + 84, height: r.height + 28 }; });
  await page.screenshot({ path: path.join(out, 'mute-toggle-off.png'), clip: box });
  await page.keyboard.press('KeyM');
  await page.screenshot({ path: path.join(out, 'mute-toggle-on.png'), clip: box });
  check(!(await B(() => window.__bolster.audio.settings.mute)), 'M again: sound back on');
  // a click on the speaker
  await page.click('#snd-corner');
  check(await B(() => window.__bolster.audio.settings.mute && window.__bolster.screen === 'mode'), 'a click on the speaker mutes (and stays on the screen)');
  await page.click('#snd-corner');
  await done();
}

/* ── a CPU match: the pause card's sliders, the pause holding the music ─ */
{
  const { page, done } = await open('p1=kevalanche&p2=rubberta&p1cpu=hard&cpu=hard&seed=4&noportraits&hold&webgl');
  const B = (fn, a) => page.evaluate(fn, a);
  await page.mouse.click(700, 400);
  await B(() => window.__bolster.step(3.5, false));
  const f = await B(() => ({ loop: window.__bolster.audio.loopName, phase: window.__bolster.fight.st.phase }));
  check(f.loop === 'fight', `after 'Fight!': the fight loop (${f.loop}, ${f.phase})`);
  await B(() => window.__bolster.pause(true));
  await page.waitForTimeout(150);
  const p = await B(() => ({ held: window.__bolster.audio.loop.held, paused: window.__bolster.audio.paused }));
  check(p.held && p.paused, 'paused: the music holds where it is');
  await B(() => window.__bolster.step(0, true));
  await page.screenshot({ path: path.join(out, 'pause-card.png') });
  const card = await page.evaluate(() => { const r = document.querySelector('#pause-screen .col').getBoundingClientRect(); return { x: r.x - 24, y: r.y - 16, width: r.width + 48, height: r.height + 32 }; });
  await page.screenshot({ path: path.join(out, 'pause-sliders.png'), clip: card });
  // drag the music slider to 25 %, SFX to 50 %
  for (const [k, v] of [['music', 25], ['sfx', 50]]) {
    const r = await page.evaluate((k) => { const b = document.querySelector(`.snd-vol input[data-k=${k}]`).getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2, w: b.width }; }, k);
    await page.mouse.click(r.x + r.w * (v / 100), r.y);
  }
  const vol = await B(() => ({ ...window.__bolster.audio.settings, screen: window.__bolster.screen, saved: localStorage.getItem('pillowfight.audio.v1') }));
  check(Math.abs(vol.music - 0.25) <= 0.06 && Math.abs(vol.sfx - 0.5) <= 0.06 && vol.screen === 'pause', `sliders set music ${vol.music}, SFX ${vol.sfx} (still paused)`);
  await page.screenshot({ path: path.join(out, 'pause-sliders-moved.png'), clip: card });
  await B(() => window.__bolster.pause(false));
  check(await B(() => window.__bolster.audio.loop.playing && !window.__bolster.audio.paused), 'resumed: the music carries on');
  await done();
  // remembered across a reload
  const { page: p2, done: d2 } = await open('noportraits&hold&webgl');
  const again = await p2.evaluate(() => window.__bolster.audio.settings);
  check(Math.abs(again.music - vol.music) < 1e-9 && Math.abs(again.sfx - vol.sfx) < 1e-9, `remembered after a reload (${JSON.stringify(again)})`);
  await p2.evaluate(() => localStorage.removeItem('pillowfight.audio.v1'));
  await d2();
}

/* ── practice: the music low by default; M is the meter there ───────── */
{
  const { page, done } = await open('practice=sebas&noportraits&hold&webgl');
  await page.mouse.click(700, 400);
  const r = await page.evaluate(() => ({ level: window.__bolster.audio.modeLevel, loop: window.__bolster.audio.loopName }));
  check(r.level <= 0.4 && r.loop === 'fight', `practice: the fight loop at ${r.level} of the music level`);
  const before = await page.evaluate(() => window.__bolster.practiceSettings.meter);
  await page.keyboard.press('KeyM');
  const after = await page.evaluate(() => ({ meter: window.__bolster.practiceSettings.meter, mute: window.__bolster.audio.settings.mute }));
  check(after.meter !== before && !after.mute, 'practice: M still toggles the dummy\'s meter, not the sound');
  await done();
}

/* ── CPU cost: the game's JS per frame in a CPU match, sound on vs no sound ─ */
{
  const cost = [];
  for (const withAudio of [false, true]) {
    const { page, done } = await open('p1=kevalanche&p2=johnny&p1cpu=hard&cpu=hard&seed=5&noportraits&hold&webgl');
    if (withAudio) await page.mouse.click(700, 400);
    const r = await page.evaluate(() => {
      const B = window.__bolster, ms = [];
      let plays = 0;
      if (B.audio.ctx) { const p = B.audio.play.bind(B.audio); B.audio.play = (c, at) => { plays++; return p(c, at); }; }
      for (let i = 0; i < 1500; i++) { const t = performance.now(); B.frame(1 / 60, false); if (i >= 300) ms.push(performance.now() - t); }
      const s = [...ms].sort((a, b) => a - b);
      return { mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: s[Math.floor(s.length * 0.95)], plays, ctx: !!B.audio.ctx };
    });
    cost.push(r);
    console.log(`  ${withAudio ? 'with sound' : 'no sound  '}: ${r.mean.toFixed(2)} ms/frame mean, ${r.p95.toFixed(2)} p95${withAudio ? `, ${r.plays} effects played` : ''}`);
    await done();
  }
  report.cpu = { noSoundMs: +cost[0].mean.toFixed(2), withSoundMs: +cost[1].mean.toFixed(2), p95NoSound: +cost[0].p95.toFixed(2), p95WithSound: +cost[1].p95.toFixed(2), effects: cost[1].plays };
  check(cost[1].ctx && cost[1].plays > 10, 'sound was on in the second run');
  // (this sandbox draws nothing and runs SwiftShader on a shared CPU, so the
  // absolute numbers are the sandbox's; what matters is what sound adds)
  check(cost[1].mean <= cost[0].mean * 1.05 + 0.3 && cost[1].p95 <= cost[0].p95 * 1.08 + 0.5, `sound adds no measurable CPU per frame (${cost[0].mean.toFixed(2)} → ${cost[1].mean.toFixed(2)} ms mean)`);
}

const rp = path.join(out, 'report.json');
const old = fs.existsSync(rp) ? JSON.parse(fs.readFileSync(rp, 'utf8')) : {};
fs.writeFileSync(rp, JSON.stringify({ ...old, live: report }, null, 1));
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : '\nlive audio OK');
process.exit(bad ? 1 : 0);
