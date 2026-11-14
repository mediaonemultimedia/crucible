/* The release checks, in the real page (final.html, or --html F), headless
   Chromium (WebGL 2 on SwiftShader):
   1. vs CPU through the menus with key presses (title → mode → select → difficulty → fight)
   2. a whole CPU-vs-CPU match to the winner screen, then a rematch
   3. versus on one keyboard: both players' keys move their own fighter (and only theirs)
   4. practice: the dummy modes, the move list
   5. the sim + scene cost per frame (JS time, the GPU excluded — SwiftShader isn't a GPU)
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
  await p.waitForFunction(() => window.__pf2 && document.body.classList.contains('is-live'), null, { timeout: 180000 });
  return p;
}
const key = (p, code, ms = 40) => p.evaluate(async ([c, t]) => {
  dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  __pf2.step(t / 1000, false);
  dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  __pf2.step(1 / 60, false);
}, [code, ms]);

// 1. the menus into a vs CPU fight
{
  const p = await page('?hold&webgl&noportraits');
  const trail = [];
  const at = async () => trail.push(await p.evaluate(() => __pf2.screen));
  await at(); await key(p, 'KeyO'); await at();          // title → mode
  await key(p, 'KeyO'); await at();                       // Vs Computer → select
  await key(p, 'KeyD'); await key(p, 'KeyO');             // P1: Rubberta
  await key(p, 'KeyD'); await key(p, 'KeyD'); await key(p, 'KeyO'); await at();   // CPU: K8-E (the cursor starts one past P1's) → difficulty
  await key(p, 'KeyS'); await key(p, 'KeyO'); await at(); // Hard → fight
  const r = await p.evaluate(() => { __pf2._vsEnd(true); __pf2.step(4, false); const f = __pf2.fight; return { p: f.st.f.map((x) => x.id), cpu: f.cpu.map((c) => c && c.level), phase: f.st.phase }; });
  // the player walks in, sidesteps, hits
  // (the computer held still a moment, so its blows don't stop the walk)
  // (and both put back on their marks: the CPU may have knocked P1 down or into the edge)
  const before = await p.evaluate(() => { const F = __pf2.fight; F.cpu[1] = null; F.st.f.forEach((f, k) => { f.x = k ? 2300 : -2300; f.z = 0; f.act = 'idle'; f.air = 0; f.y = 0; f.vx = f.vz = f.px = f.pz = 0; }); __pf2.step(0.1, false); const f = F.st.f[0]; return [f.x, f.z]; });
  await key(p, 'KeyD', 500); await key(p, 'KeyW', 30);
  const after = await p.evaluate(() => { const f = __pf2.fight.st.f[0]; return [f.x, f.z, f.act]; });
  results.menus = { trail, ...r, moved: [before, after] };
  if (trail.join() !== 'title,mode,select,diff,fight') problems.push(`menus: ${trail}`);
  if (r.p.join() !== 'rubberta,k8e' || r.cpu[1] !== 'hard' || r.cpu[0]) problems.push(`menus: ${JSON.stringify(r)}`);
  if (Math.hypot(after[0] - before[0], after[1] - before[1]) < 300) problems.push('menus: player 1 did not move');
  await p.screenshot({ path: path.join(root, 'shots/check-menus-fight.png'), timeout: 240000 });
  await p.close();
}

// 2. a whole CPU-vs-CPU match, the winner screen, a rematch
{
  const p = await page('?hold&webgl&noportraits&p1=sebas&p2=zach&p1cpu=hard&cpu=hard&seed=11');
  const r = await p.evaluate(() => {
    __pf2._vsEnd(true);
    const f = __pf2.fight, ev = {};
    const old = f.onEvent;
    f.onEvent = (e, x) => { ev[e.k] = (ev[e.k] || 0) + 1; old(e, x); };
    let n = 0;
    while (f.st.phase !== 'end' && n < 60 * 60 * 6) { __pf2.frame(1 / 60, n % 120 === 0); n++; }
    __pf2.step(3);
    return { phase: f.st.phase, winner: f.st.winner, wins: f.st.wins, secs: Math.round(n / 60), screen: __pf2.screen, ev };
  });
  results.cpuMatch = r;
  if (r.phase !== 'end' || r.screen !== 'win') problems.push(`cpu match: ${JSON.stringify(r)}`);
  await p.screenshot({ path: path.join(root, 'shots/check-win.png'), timeout: 240000 });
  const re = await p.evaluate(() => { document.querySelector('#win-screen .opt.yes').click(); __pf2._vsEnd(true); __pf2.step(3, false); return { screen: __pf2.screen, phase: __pf2.fight.st.phase, round: __pf2.fight.st.round }; });
  results.rematch = re;
  if (re.screen !== 'fight') problems.push(`rematch: ${JSON.stringify(re)}`);
  await p.close();
}

// 3. versus on one keyboard
{
  const p = await page('?hold&webgl&noportraits&p1=kevalanche&p2=johnny&versus=1');
  await p.evaluate(() => { __pf2._vsEnd(true); __pf2.step(2.2, false); });
  const pos = () => p.evaluate(() => __pf2.fight.st.f.map((f) => [f.x, f.z, f.act, f.hp]));
  const a = await pos();
  await key(p, 'KeyD', 400);                 // P1 forward
  const b = await pos();
  await key(p, 'ArrowLeft', 400);            // P2 forward
  const c = await pos();
  await key(p, 'ArrowUp', 30);               // P2 sidestep
  await p.evaluate(() => __pf2.step(0.15, false));
  const d = await pos();
  await key(p, 'KeyG', 30); await p.evaluate(() => __pf2.step(0.3, false));   // P1 light
  await key(p, 'Numpad5', 30); await p.evaluate(() => __pf2.step(0.6, false)); // P2 heavy
  const e = await pos();
  results.versus = { a, b, c, d, e, cpu: await p.evaluate(() => __pf2.fight.cpu.map(Boolean)) };
  if (!(b[0][0] > a[0][0] + 500 && b[1][0] === a[1][0])) problems.push('versus: P1 forward moved the wrong fighter');
  if (!(c[1][0] < b[1][0] - 500 && Math.abs(c[0][0] - b[0][0]) < 50)) problems.push('versus: P2 forward moved the wrong fighter');
  if (Math.abs(d[1][1] - c[1][1]) < 400) problems.push('versus: P2 sidestep');
  if (results.versus.cpu.some(Boolean)) problems.push('versus: a CPU is playing');
  await p.close();
}

// 4. practice
{
  const p = await page('?hold&webgl&noportraits&practice=k8e&dummy=sumaura');
  const r = await p.evaluate(() => {
    __pf2.step(1, false);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));
    __pf2.fight.override = (st) => [st.tick % 50 === 5 ? 32 : 0, null];
    __pf2.step(4);
    return { panel: document.querySelector('#practice-panel').textContent.slice(0, 80), mode: __pf2.dummyMode, sides: __pf2.fight.st.f[1].z !== 0, visible: getComputedStyle(document.querySelector('#practice-panel')).display };
  });
  results.practice = r;
  if (r.visible === 'none' || !r.sides) problems.push(`practice: ${JSON.stringify(r)}`);
  await p.screenshot({ path: path.join(root, 'shots/check-practice.png'), timeout: 240000 });
  await p.close();
}

// 5. per-frame JS cost (sim + puppets + soft bodies + scene graph), the render excluded
{
  const p = await page('?hold&webgl&noportraits&p1=rubberta&p2=kevalanche&p1cpu=hard&cpu=hard&seed=5');
  const r = await p.evaluate(() => {
    __pf2._vsEnd(true); __pf2.step(3, false);
    const t = [];
    for (let i = 0; i < 400; i++) { const a = performance.now(); __pf2.frame(1 / 60, false); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    return { median: +t[200].toFixed(2), p95: +t[380].toFixed(2), max: +t[399].toFixed(2) };
  });
  results.frameJs = r;
  await p.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (problems.length) { console.log('\nPROBLEMS\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('\nall checks OK — zero console errors, zero network requests');
