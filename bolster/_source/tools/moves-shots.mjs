/* Evidence for the moves pass: a jump over Johnny Deuce (crouch, take-off,
   apex, landing on the far side), a jump that can't get over K8-E, and
   every fighter's dive slam at the moment of impact.
     node tools/moves-shots.mjs [jump-johnny|jump-k8e|dives]           */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'moves');
fs.mkdirSync(out, { recursive: true });
const html = path.join(root, 'final.html');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['jump-johnny', 'jump-k8e', 'dives'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PRE = `
  window.B = window.__bolster; window.F = () => B.fight; window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
`;
const UP = 4, R = 2, D = 8, P = 32;
let errors = 0;
async function open(p1, p2) {
  const page = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=${p1}&p2=${p2}&cpu=normal&seed=7&hold&webgl&noportraits`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  return { page, errs };
}
async function strip(name, page, frames, cols) {
  const tiles = [];
  for (const [k, cond] of frames.entries()) {
    await page.evaluate(`until(() => ${cond}, 4); B.step(0)`);
    await page.waitForTimeout(250);
    const f = path.join(out, `_${name}-${k}.png`);
    await page.screenshot({ path: f });
    tiles.push(f);
  }
  execFileSync('montage', [...tiles, '-tile', `${cols}x`, '-geometry', '+3+3', '-background', '#222', path.join(out, `${name}.png`)]);
  for (const f of tiles) fs.unlinkSync(f);
}
for (const name of names) {
  if (name.startsWith('jump-')) {
    const opp = name.slice(5);
    const { page, errs } = await open('kevalanche', opp);
    await page.evaluate(`toFight(); F().cpu = [null, null]; place(-1700, 1500); script(() => [0, 0]); B.step(1.0, false);
      script((i) => [i === 1 ? ${UP | R} : 0, 0]);`);
    await strip(name, page, [
      `ST().f[0].act === 'jumpsquat' && ST().f[0].t >= 2`,
      `ST().f[0].air && ST().f[0].y > 900`,
      `ST().f[0].air && ST().f[0].vy < 40`,
      `!ST().f[0].air && ST().f[0].act !== 'jumpsquat' && ST().tick > 0 && ST().f[0].x > -1700 + 500`,
    ], 4);
    const st = await page.evaluate(`({ x0: ST().f[0].x, x1: ST().f[1].x, face: ST().f.map((f) => f.face) })`);
    console.log(name, JSON.stringify(st), errs.length ? errs : '');
    errors += errs.length;
    await page.close();
  } else if (name === 'dives') {
    for (const id of ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e']) {
      const { page, errs } = await open(id, 'johnny');
      await page.evaluate(`toFight(); F().cpu = [null, null]; place(-1400, 1600); script(() => [0, 0]); B.step(1.0, false);
        script((i) => [i === 1 ? ${UP} : i === 15 ? ${D | P} : i === 16 ? ${D} : 0, ${D}]);`);
      await strip(`dive-${id}`, page, [
        `ST().f[0].mv === 'dive' && ST().f[0].t >= 4`,
        `ST().f[0].mv === 'dive' && ST().f[0].t >= 9`,
        `ST().f[0].mv === 'diveLand' && ST().f[0].t >= 1`,
      ], 3);
      console.log(id, errs.length ? errs : 'ok');
      errors += errs.length;
      await page.close();
    }
  }
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
