/* Evidence screenshots of final.html → shots/pf2/<scene>.png (WebGL 2 on
   SwiftShader: what renders, not how fast).
     node tools/shots.mjs [scene …]                                      */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots/pf2');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(root, 'final.html');

const PRE = `
  window.A = __pf2; window.F = () => A.fight; window.ST = () => A.fight.st;
  window.toFight = () => { A._vsEnd(true); for (let i = 0; i < 400 && ST().phase !== 'fight'; i++) A.frame(1 / 60, false); };
  window.place = (k, x, z) => { const f = ST().f[k]; f.x = x; f.z = z; F().prev = ST().f.map((q) => ({ x: q.x, y: q.y, z: q.z })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
  window.until = (c, n = 8) => { for (let t = 0; t < n * 60; t++) { A.frame(1 / 60, false); if (c()) return true; } return false; };
`;
const L = 1, R = 2, UP = 4, DOWN = 8, O = 16, P = 32, SP = 64, E = 128, J = 256, C = 512;
const fq = (p1, p2, x = '') => `?p1=${p1}&p2=${p2}&cpu=normal&seed=7&hold&webgl&noportraits${x}`;
const SCENES = {
  'ring-overview': { q: fq('kevalanche', 'rubberta', '&p1cpu=normal'), run: `toFight(); A.step(2.5, false); F().winFocus = { x: 0, y: 0.2, z: 0, d: 25, h: 7.5, az: 0.55 }; A.step(1.5)` },
  'sidestep': {
    q: fq('rubberta', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(0, -1300, 0); place(1, 1300, 0);
      script((i) => [i === 1 ? ${P} : 0, i === 2 ? ${UP} : 0]); A.step(0.25)`,
  },
  'sidestep-miss': {
    q: fq('rubberta', 'kevalanche'),
    run: `toFight(); F().cpu = [null, null]; place(0, -1300, 0); place(1, 1300, 0);
      script((i) => [i === 1 ? ${P} : 0, i === 2 ? ${UP} : 0]); A.step(0.42)`,
  },
  'spin-catches': {
    q: fq('sumaura', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(0, -1100, 0); place(1, 1100, 0);
      script((i) => [i === 1 ? ${P | L} : 0, i === 3 ? ${DOWN} : 0]); until(() => ST().ev.some((e) => e.k === 'hit'), 3); A.step(0.05)`,
  },
  'ringout': {
    q: fq('kevalanche', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(0, 4500, 900); place(1, 6950, 900); ST().f[0].fx = 1024; ST().f[0].fz = 0;
      script((i) => [i === 1 ? ${P} : 0, 0]); until(() => ST().ev.some((e) => e.k === 'ringout'), 3); A.step(0.9)`,
  },
  'ringout-carpet': {
    q: fq('kevalanche', 'johnny'),
    run: `toFight(); F().cpu = [null, null]; place(0, 4500, 900); place(1, 6950, 900); ST().f[0].fx = 1024; ST().f[0].fz = 0;
      script((i) => [i === 1 ? ${P} : 0, 0]); until(() => ST().ev.some((e) => e.k === 'kobounce'), 6); A.step(0.25)`,
  },
  'throw': {
    q: fq('sebas', 'zach'),
    run: `toFight(); F().cpu = [null, null]; place(0, -900, 0); place(1, 900, 0);
      script((i) => [i === 1 ? ${O | P} : 0, 0]); A.step(0.6)`,
  },
  'special': {
    q: fq('kevalanche', 'sumaura'),
    run: `toFight(); F().cpu = [null, null]; place(0, -1100, 0); place(1, 1100, 0); ST().f[0].meter = 1000;
      script((i) => [i === 1 ? ${SP} : 0, 0]); A.step(0.45)`,
  },
  'select': { q: '?hold&webgl&screen=select', wait: 'Object.keys(A.portraits).length === 7', run: `A.go('select'); A._lock(0); A.pick[1] = 2; A._paintSelect(); A.step(1.6)` },
  'title': { q: '?hold&webgl&noportraits', run: `A.step(1)` },
  'ko': {
    q: fq('k8e', 'zach'),
    run: `toFight(); F().cpu = [null, null]; place(0, -1500, 0); place(1, 1500, 0); ST().f[1].hp = 5;
      script((i) => [i === 1 ? ${P} : 0, 0]); until(() => ST().ev.some((e) => e.k === 'koapex'), 6); A.step(0.1)`,
  },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(SCENES);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const name of names) {
  const S = SCENES[name];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url + S.q);
  await page.waitForFunction(() => window.__pf2 && document.body.classList.contains('is-live'), null, { timeout: 180000 });
  await page.evaluate(PRE);
  if (S.wait) await page.waitForFunction(S.wait, null, { timeout: 180000 });
  await page.evaluate(S.run);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 240000 });
  console.log(name, errs.length ? errs.join(' | ') : 'ok');
  bad += errs.length;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
