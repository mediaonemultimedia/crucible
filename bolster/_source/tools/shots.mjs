/* Headless screenshots of the built page (final.html): WebGL 2 on
   SwiftShader — there's no GPU in the sandbox, so these show what renders,
   not how fast. Each scene loads the page held (no free-running loop),
   drives it through window.__bolster, steps it and draws one frame.

     node tools/shots.mjs [scene …]      (default: all)

   Writes shots/<scene>.png and prints every console error.            */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(root, 'final.html');

// helpers run in the page
const PRE = `
  window.B = window.__bolster;
  window.F = () => B.fight;
  window.ST = () => B.fight.st;
  /* step until cond() or n seconds */
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
`;
const D = 8, P = 32, O = 16, SP = 64, R = 2, L = 1, UP = 4;

const fightQ = (p1, p2, extra = '') => `?p1=${p1}&p2=${p2}&cpu=normal&p1cpu=normal&seed=7&hold&webgl&noportraits${extra}`;
const SCENES = {
  title: { q: '?hold&webgl&noportraits', run: `B.step(0.5)` },
  'title-mobile': { q: '?hold&webgl&noportraits', mobile: true, run: `B.step(0.5)` },
  select: { q: '?screen=select&hold&webgl', run: `B.step(1.2)` },
  'select-cpu': { q: '?screen=select&hold&webgl', run: `B._lock(); B._cursor(2); B.step(1.2)` },
  'nap-time': { q: '?screen=select&hold&webgl', run: `B.step(31); B.step(1.6)`, settle: 1200 },
  toques: { q: '?screen=select&hold&webgl', run: `dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' })); B.step(0.6)`, settle: 700 },
  'fight-kevalanche': { q: fightQ('kevalanche', 'sumaura'), run: `toFight(); B.step(3.2)` },
  'fight-rubberta': { q: fightQ('rubberta', 'johnny'), run: `toFight(); B.step(3.4)` },
  'fight-johnny': { q: fightQ('johnny', 'k8e'), run: `toFight(); B.step(3.1)` },
  'fight-sumaura': { q: fightQ('sumaura', 'rubberta'), run: `toFight(); B.step(3.3)` },
  'fight-k8e': { q: fightQ('k8e', 'kevalanche'), run: `toFight(); B.step(3.6)` },
  'signature-uppercut': {
    q: fightQ('kevalanche', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(-1700, 1100);
      script((i) => [i === 2 ? ${D} : i === 3 ? ${D | P} : 0, i === 0 ? ${UP | L} : 0]);
      until(() => ST().f[0].mv === 'signature' && ST().f[0].t >= 9, 3); B.step(0)`,
  },
  'signature-serve': {
    q: fightQ('johnny', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(-3500, 3000);
      script((i) => [i === 1 ? ${D} : i === 2 ? ${D | P} : 0, 0]);
      until(() => ST().proj.length && Math.abs(ST().proj[0].x - ST().f[0].x) > 2400, 3); B.step(0)`,
  },
  'special-avalanche': {
    q: fightQ('kevalanche', 'sumaura'),
    run: `toFight(); F().cpu = [null, null]; place(-2200, 1200); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]);
      until(() => ST().f[0].mv === 'special' && ST().f[0].t >= 24, 3); B.step(0)`,
  },
  'special-abraco': {
    q: fightQ('rubberta', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(-1400, 1200); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]);
      until(() => ST().f[0].mv === 'specialHold' && ST().f[0].t >= 26, 4); B.step(0)`,
  },
  'special-skyneck': {
    q: fightQ('k8e', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(-3000, 2600); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]);
      until(() => ST().f[0].mv === 'special' && ST().f[0].t >= 33, 4); B.step(0)`,
  },
  'special-matchpoint': {
    q: fightQ('johnny', 'sumaura'),
    run: `toFight(); F().cpu = [null, null]; place(-3500, 2600); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]);
      until(() => ST().f[0].mv === 'special' && ST().f[0].t >= 40, 4); B.step(0)`,
  },
  'special-squash': {
    q: fightQ('sumaura', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(-1500, 1300); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]);
      until(() => ST().f[0].mv === 'special' && ST().f[0].t >= 20, 4); B.step(0)`,
  },
  ko: {
    q: fightQ('johnny', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(-1600, 900); ST().f[1].hp = 1; ST().f[0].taken = 40; ST().f[0].hp -= 40;
      script((i) => [i === 1 ? ${P} : 0, 0]);
      until(() => ST().phase === 'ko', 3); B.step(0.5)`,
  },
  fluffless: {
    q: fightQ('sumaura', 'k8e'),
    run: `toFight(); F().cpu = [null, null]; place(-1500, 900); ST().f[1].hp = 1;
      script((i) => [i === 1 ? ${P} : 0, 0]);
      until(() => ST().phase === 'ko', 3); B.step(0.4); await new Promise((r) => setTimeout(r, 1800)); B.step(0.2)`,
  },
  winner: {
    q: fightQ('kevalanche', 'rubberta'),
    run: `toFight(); F().cpu = [null, null]; place(-1500, 900); ST().f[1].hp = 1; ST().wins = [1, 0];
      script((i) => [i === 1 ? ${P} : 0, 0]);
      until(() => ST().phase === 'end', 6); B.step(0.3); await new Promise((r) => setTimeout(r, 1500)); B.step(1.2); await new Promise((r) => setTimeout(r, 900)); B.step(0.1)`,
    settle: 800, clip: '.bubble',
  },
  impatient: {
    q: fightQ('sumaura', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(-2400, 2400);
      script((i) => [i % 2 === 0 && i < 10 ? ${SP} : 0, 0]);
      B.step(0.3)`,
    settle: 500,
  },
  mirror: { q: fightQ('sumaura', 'sumaura'), run: `toFight(); B.step(2.6)` },
  'toques-fight': { q: fightQ('k8e', 'rubberta', '&toques=1'), run: `toFight(); B.step(2.2)` },
  'fight-mobile': { q: fightQ('johnny', 'kevalanche'), mobile: true, run: `toFight(); B.step(2.5)` },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(SCENES);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let errors = 0;
for (const name of names) {
  const S = SCENES[name];
  if (!S) { console.log(`no scene ${name}`); continue; }
  const page = await browser.newPage({ viewport: S.mobile ? { width: 390, height: 844 } : { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errs.push('network request: ' + r.url()); });
  const t0 = Date.now();
  await page.goto(url + S.q);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  const r = await page.evaluate(`(async () => { ${S.run}; return [B.screen, B.fight ? B.fight.st.phase : null]; })()`);
  await page.waitForTimeout(S.settle || 250);
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 240000 });
  if (S.clip) {
    const box = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.querySelector('svg').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, S.clip);
    if (box) await page.screenshot({ path: path.join(out, name + '-bubble.png'), clip: { x: Math.max(0, box.x - 30), y: Math.max(0, box.y - 30), width: box.width + 60, height: box.height + 70 } });
  }
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(r)}${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
  errors += errs.length;
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
