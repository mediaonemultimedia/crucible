/* The release checks, in the real page (final.html, or --html F), headless
   Chromium (WebGL 2 on SwiftShader):
   1. the menus by keyboard: title → select (14 cards) → a race, the
      player's kart moves on the gas and steers
   2. a whole 3-lap race with 8 CPUs (p1cpu=hard) to the results screen:
      every racer finishes, laps of 50–60 s, the CPUs drift, use items,
      trick, and nobody stays stuck
   3. the frame cost: JS per frame (sim + CPUs + 8 karts + FX + HUD; the
      GPU is excluded — SwiftShader isn't one) over the race, and the
      render call's own CPU time over 240 rendered race frames
   Every console error, page error and network request fails it.
     node tools/check.mjs [--html path]                                   */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ai = process.argv.indexOf('--html');
const html = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.join(root, 'final.html');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const results = {};

async function page(q, w = 1280, h = 720) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`${q}: console: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`${q}: pageerror: ${e.message}`));
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${q}: NETWORK ${r.url()}`); });
  await p.goto('file://' + html + q);
  await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
  return p;
}
const key = (p, code, ms = 40) => p.evaluate(async ([c, t]) => {
  dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  __dh.step(t / 1000, false);
  dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  __dh.step(1 / 60, false);
}, [code, ms]);

// 1. menus → race, the player drives
{
  const p = await page('?hold&webgl&noportraits&seed=2');
  const trail = [await p.evaluate(() => __dh.screen)];
  await key(p, 'Enter'); trail.push(await p.evaluate(() => __dh.screen));
  const cards = await p.evaluate(() => document.querySelectorAll('#cards .card').length);
  if (cards !== 14) problems.push(`select: ${cards} cards (want 7 OG + 7 ALT)`);
  await key(p, 'ArrowRight'); await key(p, 'ArrowDown'); await key(p, 'Digit3');
  const pick = await p.evaluate(() => ({ sel: __dh.sel, level: __dh.level, turn: [__dh.turn.id, __dh.turn.alt] }));
  await key(p, 'Enter'); trail.push(await p.evaluate(() => __dh.screen));
  const r = await p.evaluate(() => { const A = __dh, R = A.race, K = R.karts[A.me]; return { me: [K.id, K.alt], cpu: A.cpus.filter(Boolean).map((c) => c.level), n: R.karts.length }; });
  await p.evaluate(() => __dh.step(4));   // the countdown
  const before = await p.evaluate(() => { const K = __dh.race.karts[__dh.me]; return [K.x, K.z, K.yaw]; });
  await p.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' })); __dh.step(1.2, false); dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' })); __dh.step(0.05); });
  const after = await p.evaluate(() => { const K = __dh.race.karts[__dh.me]; return [K.x, K.z, K.yaw]; });
  results.menus = { trail, pick, ...r, moved: Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1), turned: (after[2] - before[2]).toFixed(2) };
  if (trail.join() !== 'title,select,race') problems.push(`menus: ${trail}`);
  if (r.me.join() !== 'sumaura,true' || r.n !== 8 || r.cpu.some((c) => c !== 'hard')) problems.push(`menus: ${JSON.stringify(r)}`);
  if (Math.hypot(after[0] - before[0], after[1] - before[1]) < 5) problems.push('menus: the kart did not move on the gas');
  if (after[2] - before[2] < 0.1) problems.push('menus: the kart did not steer left');
  await p.screenshot({ path: path.join(root, 'shots/check-menus-race.png'), timeout: 240000 });
  await p.close();
}

// 2 + 3. a whole race with 8 CPUs, its frame cost, the results
{
  const p = await page('?hold&webgl&p1=kevalanche&p1cpu=hard&cpu=hard&seed=11');
  const r = await p.evaluate(() => {
    const A = __dh, R = A.race, ev = {}, laps = {};
    const old = A.onEvent.bind(A);
    A.onEvent = (e) => { ev[e.k] = (ev[e.k] || 0) + 1; if (e.k === 'use') ev['use:' + e.item] = (ev['use:' + e.item] || 0) + 1; if (e.k === 'lap' || e.k === 'finish') (laps[e.i] = laps[e.i] || []).push(R.raceTime()); old(e); };
    const js = [];
    let n = 0;
    while (A.screen === 'race' && n < 60 * 300) {
      const t0 = performance.now();
      A.frame(1 / 60, false);
      js.push(performance.now() - t0);
      n++;
    }
    js.sort((a, b) => a - b);
    const lapT = Object.values(laps).flatMap((ts) => ts.map((t, k) => t - (k ? ts[k - 1] : 0)));
    return {
      screen: A.screen, secs: +(n / 60).toFixed(1), order: R.finishOrder.map((i) => R.karts[i].id + (R.karts[i].alt ? '*' : '')),
      times: R.finishOrder.map((i) => +R.timeOf(R.karts[i]).toFixed(1)), ev,
      lap: { min: +Math.min(...lapT).toFixed(1), max: +Math.max(...lapT).toFixed(1), mean: +(lapT.reduce((a, b) => a + b, 0) / lapT.length).toFixed(1) },
      jsMs: { mean: +(js.reduce((a, b) => a + b, 0) / js.length).toFixed(2), p50: +js[js.length >> 1].toFixed(2), p95: +js[Math.floor(js.length * 0.95)].toFixed(2), p99: +js[Math.floor(js.length * 0.99)].toFixed(2) },
      finished: R.karts.filter((K) => K.fin).length,
    };
  });
  results.race = r;
  if (r.screen !== 'results') problems.push(`race: ended on ${r.screen}`);
  if (r.finished !== 8) problems.push(`race: ${r.finished}/8 finished`);
  if (!(r.lap.mean >= 47 && r.lap.mean <= 62)) problems.push(`race: mean lap ${r.lap.mean} s (want ~50–60)`);
  for (const k of ['drift', 'tier', 'boost', 'use', 'trick', 'pad', 'box', 'hit']) if (!r.ev[k]) problems.push(`race: no '${k}' events`);
  if (r.jsMs.p95 > 8) problems.push(`race: JS frame cost p95 ${r.jsMs.p95} ms (budget 8 of the 16.7)`);
  await p.screenshot({ path: path.join(root, 'shots/check-results.png'), timeout: 240000 });
  await p.close();
}
{
  // the render call's own CPU time, 240 race frames with all 8 karts on screen-ish
  const p = await page('?hold&webgl&p1=k8e&p1cpu=hard&cpu=hard&seed=3');
  const r = await p.evaluate(() => {
    const A = __dh;
    A.step(5, false);
    const out = [], drv = [];
    for (let i = 0; i < 240; i++) {
      A.frame(1 / 60, false);
      const t0 = performance.now();
      A.renderer.render(A.scene, A.camera);
      out.push(performance.now() - t0);
      drv.push(A.rviews.filter((v) => v.driver.awake > 0).length);
    }
    out.sort((a, b) => a - b);
    const info = A.renderer.info?.render || {};
    return { renderCallMs: { p50: +out[120].toFixed(2), p95: +out[228].toFixed(2) }, drawCalls: info.drawCalls ?? info.calls, triangles: info.triangles, awakeMax: Math.max(...drv), lod: A.rviews.map((v) => v.lod).join('') };
  });
  results.render = r;
  await p.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
console.log(problems.length ? `\nPROBLEMS (${problems.length})\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS: zero console errors, zero network requests');
process.exit(problems.length ? 1 : 0);
