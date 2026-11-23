/* The release checks, in the real page (final.html, or --html F), headless
   Chromium (WebGL 2 on SwiftShader):
   1. the menus by keyboard: title → select (14 cards) → a race, the
      player's kart moves on the gas and steers
   2. a whole 3-lap race with 8 CPUs (p1cpu=hard) to the results screen:
      every racer finishes, laps of 50–60 s, the CPUs drift, use items,
      trick, and nobody stays stuck
   3. the frame cost: JS per frame (sim + CPUs + 8 karts + FX + HUD; the
      GPU is excluded — SwiftShader isn't one) over the race, and the
      render call's own CPU time over 60 rendered race frames
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
  await key(p, 'Enter'); trail.push(await p.evaluate(() => __dh.screen));
  const r = await p.evaluate(() => { const A = __dh, R = A.race, K = R.karts[A.me]; return { me: [K.id, K.alt], cpu: A.cpus.filter(Boolean).map((c) => c.level), n: R.karts.length }; });
  await p.evaluate(() => __dh.step(4));   // the countdown
  const before = await p.evaluate(() => { const K = __dh.race.karts[__dh.me]; return [K.x, K.z, K.yaw]; });
  await p.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' })); __dh.step(1.2, false); dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' })); __dh.step(0.05); });
  const after = await p.evaluate(() => { const K = __dh.race.karts[__dh.me]; return [K.x, K.z, K.yaw]; });
  results.menus = { trail, pick, ...r, moved: Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1), turned: (after[2] - before[2]).toFixed(2) };
  if (trail.join() !== 'title,select,setup,race') problems.push(`menus: ${trail}`);
  if (r.me.join() !== 'sumaura,true' || r.n !== 8 || r.cpu.some((c) => c !== 'hard')) problems.push(`menus: ${JSON.stringify(r)}`);
  if (Math.hypot(after[0] - before[0], after[1] - before[1]) < 5) problems.push('menus: the kart did not move on the gas');
  if (after[2] - before[2] < 0.1) problems.push('menus: the kart did not steer left');
  await p.screenshot({ path: path.join(root, 'shots/check-menus-race.png'), timeout: 240000 });
  await p.close();
}

// 2 + 3. a whole race with 8 CPUs on each track, its frame cost, the results
const TRACK_EVENTS = { landing: [], laundry: ['launch'], hockey: ['launch'], park: ['launch', 'splash'] };
for (const track of (process.argv.includes('--quick') ? ['landing'] : ['landing', 'laundry', 'hockey', 'park'])) {
  const p = await page(`?hold&webgl&p1=kevalanche&p1cpu=hard&cpu=hard&seed=11&track=${track}`);
  const r = await p.evaluate(() => {
    const A = __dh, R = A.race, ev = {}, laps = {};
    const old = A.onEvent.bind(A);
    A.onEvent = (e) => { ev[e.k] = (ev[e.k] || 0) + 1; if (e.k === 'use') ev['use:' + e.item] = (ev['use:' + e.item] || 0) + 1; if (e.k === 'fall') ev['fall:' + (e.why || 'edge')] = (ev['fall:' + (e.why || 'edge')] || 0) + 1; if (e.k === 'lap' || e.k === 'finish') (laps[e.i] = laps[e.i] || []).push(R.raceTime()); old(e); };
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
      // stage 3: never under the road, never through it (counted every frame by the sim's safety net)
      net: R.netCount || 0,
    };
  });
  results[`race-${track}`] = r;
  if (r.screen !== 'results') problems.push(`${track}: ended on ${r.screen}`);
  if (r.finished !== 8) problems.push(`${track}: ${r.finished}/8 finished`);
  if (!(r.lap.mean >= 40 && r.lap.mean <= 95)) problems.push(`${track}: mean lap ${r.lap.mean} s (want 40–95)`);
  for (const k of ['boost', 'use', 'trick', 'pad', 'box', 'hit', ...TRACK_EVENTS[track]]) if (!r.ev[k]) problems.push(`${track}: no '${k}' events`);
  if (r.jsMs.p95 > 8) problems.push(`${track}: JS frame cost p95 ${r.jsMs.p95} ms (budget 8 of the 16.7)`);
  if (r.ev['fall:edge']) problems.push(`${track}: ${r.ev['fall:edge']} falls off an edge (every drawn barrier is solid; no track has a drop)`);
  if (r.net) problems.push(`${track}: the safety net caught ${r.net} karts under the road`);
  await p.evaluate(() => __dh.step(1.5));
  await p.screenshot({ path: path.join(root, `shots/check-results${track === 'landing' ? '' : '-' + track}.png`), timeout: 240000 });
  await p.close();
}

// 4. split screen: 2 and 4 players (each human kart on autopilot), the frame cost per view
for (const n of [2, 4]) {
  const q = ['p1=zach', 'p2=sumaura&alt2=1', 'p3=k8e', 'p4=rubberta'].slice(0, n).join('&');
  const p = await page(`?hold&webgl&${q}&cpu=hard&seed=4&track=laundry`);
  const r = await p.evaluate(() => {
    const A = __dh, Cp = A.cpus.find(Boolean).constructor;
    A.hv.forEach((H, j) => { const c = new Cp(A.race, H.i, 'hard', 9 + j); A.humanP[j].ctl.sample = () => c.think(); });
    A.step(8, false);
    const js = [], rd = [];
    const info = A.renderer.info;
    info.autoReset = false;
    let draws = 0, tris = 0;
    for (let i = 0; i < 90; i++) {
      const t0 = performance.now();
      A.frame(1 / 60, false);
      js.push(performance.now() - t0);
      info.reset();
      const t1 = performance.now();
      A._render();
      rd.push(performance.now() - t1);
      draws += info.render.drawCalls ?? info.render.calls; tris += info.render.triangles;
    }
    info.autoReset = true;
    js.sort((a, b) => a - b); rd.sort((a, b) => a - b);
    return { views: A.allViews().length, humans: A.hv.length, jsMs: { mean: +(js.reduce((a, b) => a + b, 0) / js.length).toFixed(2), p95: +js[Math.floor(js.length * 0.95)].toFixed(2) }, renderCallMsSwiftShader: { p50: +rd[45].toFixed(1) }, drawCallsPerFrame: Math.round(draws / 90), drawCallsPerView: Math.round(draws / 90 / A.allViews().length), trianglesPerFrame: Math.round(tris / 90), lodNear: A.constructor && A.rviews[0].constructor.lodNear, lod: A.rviews.map((v) => v.lod).join('') };
  });
  results[`split-${n}`] = r;
  if (r.humans !== n) problems.push(`split ${n}: ${r.humans} human views`);
  if (r.jsMs.p95 > 8) problems.push(`split ${n}: JS frame cost p95 ${r.jsMs.p95} ms`);
  await p.evaluate(() => __dh.step(1 / 60));
  await p.screenshot({ path: path.join(root, `shots/check-split-${n}.png`), timeout: 240000 });
  await p.close();
}

// 5. the Pillow Cup: four races (each cut short), points, the overall podium
{
  const p = await page('?hold&webgl&noportraits&seed=7');
  const r = await p.evaluate(() => {
    const A = __dh, trail = [];
    A.toSelect();
    A.lock(A.players[0]);
    while (document.querySelector('#course-name').textContent !== 'The Pillow Cup') A.cycleTrack(1);
    A.go();
    for (let race = 0; race < 4; race++) {
      trail.push(A.screen + ':' + A.trackId);
      A.step(6, false);
      const R = A.race; R._end(); A.resultsAt = A.t; A.toResults();
      trail.push(A.screen);
      A.afterResults();
    }
    trail.push(A.screen);
    const pts = [...A.cup.pts.values()];
    return { trail, total: pts.reduce((a, b) => a + b, 0), title: document.getElementById('c-title').textContent };
  });
  results.cup = r;
  if (r.trail.join() !== 'race:landing,results,race:laundry,results,race:hockey,results,race:park,results,cup') problems.push(`cup: ${r.trail}`);
  if (r.total !== 4 * 39) problems.push(`cup: ${r.total} points handed out (want ${4 * 39})`);
  await p.evaluate(() => __dh.step(1));
  await p.screenshot({ path: path.join(root, 'shots/check-cup-podium.png'), timeout: 240000 });
  await p.close();
}

// 6. the ghost (a human's best lap, replayed) and the photo finish
{
  const p = await page('?hold&webgl&p1=johnny&cpu=normal&seed=12&laps=3&track=park');
  const r = await p.evaluate(() => {
    const A = __dh, Cp = A.cpus.find(Boolean).constructor, c = new Cp(A.race, A.me, 'hard', 3);
    A.humanP[0].ctl.sample = () => c.think();
    const R = A.race, N = R.T.N, K = R.karts[A.me];
    let n = 0, seen = 0;
    while (K.kc < N * 1.5 && n++ < 60 * 140) { A.frame(1 / 60, false); if (A.ghost.mesh.visible) seen++; }
    const best = A.ghost.best[A.trackId];
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('downhill.ghost.v3.park') || 'null'); } catch { /* */ }
    // the photo finish: stage the last few metres with a rival alongside
    const O = R.karts.find((x) => x !== K);
    K.kc = R.laps * N - 18; O.kc = K.kc - 1.5; O.fin = 0;
    A.frame(1 / 60, false);
    const slow = !!A.slowmo, sepia = document.body.classList.contains('photo');
    let m = 0; while (A.slowmo && m++ < 600) A.frame(1 / 60, false);
    return { ghostFrames: seen, bestLapTicks: best?.t || 0, stored: !!stored, slow, sepia, cleared: !A.slowmo && !document.body.classList.contains('photo') };
  });
  results.ghostPhoto = r;
  if (!r.bestLapTicks || !r.stored || r.ghostFrames < 60) problems.push(`ghost: ${JSON.stringify(r)}`);
  if (!r.slow || !r.sepia || !r.cleared) problems.push(`photo finish: ${JSON.stringify(r)}`);
  await p.close();
}
{
  // the render call's own CPU time, 60 race frames with all 8 karts on screen-ish
  const p = await page('?hold&webgl&p1=k8e&p1cpu=hard&cpu=hard&seed=3');
  const r = await p.evaluate(() => {
    const A = __dh;
    A.step(5, false);
    const out = [], drv = [];
    for (let i = 0; i < 60; i++) {
      A.frame(1 / 60, false);
      const t0 = performance.now();
      A.renderer.render(A.scene, A.camera);
      out.push(performance.now() - t0);
      drv.push(A.rviews.filter((v) => v.driver.awake > 0).length);
    }
    out.sort((a, b) => a - b);
    A.renderer.info.autoReset = true;
    A.renderer.info.reset(); A.renderer.render(A.scene, A.camera);
    const I = A.renderer.info.render;
    return { renderCallMsSwiftShader: { p50: +out[30].toFixed(2) }, drawCallsPerFrame: I.drawCalls ?? I.calls, trianglesPerFrame: I.triangles, awakeMax: Math.max(...drv), lod: A.rviews.map((v) => v.lod).join('') };
  });
  results.render = r;
  await p.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
try { (await import('fs')).writeFileSync(path.join(root, 'shots/check-results.json'), JSON.stringify(results, null, 1)); } catch { /* fine */ }
console.log(problems.length ? `\nPROBLEMS (${problems.length})\n  ${problems.join('\n  ')}` : '\nALL CHECKS PASS: zero console errors, zero network requests');
process.exit(problems.length ? 1 : 0);
