/* Evidence for the combat pass, in headless Chromium (SwiftShader):
   E-block standing and crouching, every fighter's throw (the hold and the
   toss), a COUNTER pop, a 3-hit combo with the counter and AMPLIFIED!, the
   controls card, and the K.O. launch (contact flash, slow motion mid-arc
   with the camera in, the floor bounce, the K.O. banner) — plus the
   match-winning one. Fails on any console error.
     node tools/combat-shots.mjs [block|throws|counter|combo|controls|ko|ko-final] */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'combat');
fs.mkdirSync(out, { recursive: true });
const html = path.join(root, 'final.html');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['block', 'throws', 'counter', 'combo', 'controls', 'ko', 'ko-final'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PRE = `
  window.B = window.__bolster; window.F = () => B.fight; window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
`;
const L = 1, R = 2, D = 8, O = 16, P = 32, E = 128;
let errors = 0;
async function open(p1, p2, q = '') {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=${p1}&p2=${p2}&cpu=normal&seed=7&hold&webgl&noportraits${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`toFight(); F().cpu = [null, null]; script(() => [0, 0]); B.step(0.5, false);`);
  return { page, errs };
}
/* step until cond, draw, wait (CSS pops run on real time), shoot */
async function shot(page, cond, file, wait = 250) {
  const ok = await page.evaluate(`until(() => ${cond}, 6)`);
  await page.evaluate('B.step(0)');
  if (wait) await page.waitForTimeout(wait);
  await page.screenshot({ path: file });
  return ok;
}
async function strip(name, page, frames, cols, wait) {
  const tiles = [];
  for (const [k, cond] of frames.entries()) {
    const f = path.join(out, `_${name}-${k}.png`);
    const ok = await shot(page, cond, f, Array.isArray(wait) ? wait[k] : wait ?? 250);
    if (!ok) console.log(`  ${name} frame ${k}: condition never met (${cond})`);
    tiles.push(f);
  }
  execFileSync('montage', [...tiles, '-tile', `${cols}x`, '-geometry', '+3+3', '-background', '#222', path.join(out, `${name}.png`)]);
  for (const f of tiles) fs.unlinkSync(f);
}
const done = async (name, page, errs) => { console.log(name, errs.length ? errs : 'ok'); errors += errs.length; await page.close(); };

for (const name of names) {
  if (name === 'block') {
    // Kevalanche holds E; Johnny's heavy (standing block), then his low (S+E)
    const { page, errs } = await open('kevalanche', 'johnny');
    await page.evaluate(`place(-1100, 1100); script((i) => [${E}, i === 2 ? ${P} : 0]);`);
    await shot(page, `ST().f[0].act === 'blockstun'`, path.join(out, '_b0.png'), 120);
    await page.evaluate(`B.step(1.2, false); place(-1100, 1100); script((i) => [${E | D}, i === 2 ? ${D | O} : ${D}]);`);
    await shot(page, `ST().f[0].act === 'blockstun'`, path.join(out, '_b1.png'), 120);
    execFileSync('montage', [path.join(out, '_b0.png'), path.join(out, '_b1.png'), '-tile', '2x', '-geometry', '+3+3', '-background', '#222', path.join(out, 'block.png')]);
    fs.unlinkSync(path.join(out, '_b0.png')); fs.unlinkSync(path.join(out, '_b1.png'));
    await done(name, page, errs);
  } else if (name === 'throws') {
    for (const id of ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e']) {
      const { page, errs } = await open(id, 'johnny');
      // Johnny holds E: the throw takes him anyway
      await page.evaluate(`place(-750, 750); script((i) => [i === 2 ? ${O | P} : 0, ${E}]);`);
      await strip(`throw-${id}`, page, [
        `ST().f[0].mv === 'throwHold' && ST().f[0].t >= 12`,
        `ST().f[0].mv === 'throwHold' && ST().f[0].t >= 25`,
        `ST().f[0].mv === 'throwHold' && ST().f[0].t >= 33`,
      ], 3, 120);
      await done(`throw ${id}`, page, errs);
    }
  } else if (name === 'counter') {
    // Sumaura winds up her heavy; Johnny's jab gets in first: COUNTER
    const { page, errs } = await open('johnny', 'sumaura');
    await page.evaluate(`place(-1100, 1100); script((i) => [i === 4 ? ${O} : 0, i === 1 ? ${P} : 0]);`);
    await shot(page, `ST().ev.some((e) => e.k === 'hit' && e.ctr)`, path.join(out, 'counter.png'), 0);
    await done(name, page, errs);
  } else if (name === 'combo') {
    // Kevalanche: light, light, heavy — each pressed as the last one lands
    const { page, errs } = await open('kevalanche', 'rubberta');
    await page.evaluate(`place(-1150, 1150);
      window.seq = [${O}, ${O}, ${P}]; window.si = 0; window.lastM = 0;
      script((i, st) => {
        const f = st.f[0]; let m = 0;
        if (i === 2) { m = seq[si++]; }
        else if (si > 0 && si < 3 && f.act === 'attack' && f.hm && !lastM && f.t > 5) m = seq[si++];
        lastM = m; return [m, 0];
      });`);
    await strip('combo', page, [
      `ST().ev.some((e) => e.k === 'hit' && e.n === 2)`,
      `ST().ev.some((e) => e.k === 'hit' && e.amp)`,
    ], 2, [140, 260]);
    await done(name, page, errs);
  } else if (name === 'controls') {
    const { page, errs } = await open('kevalanche', 'johnny');
    await page.evaluate(`B.pause(true); B.step(0)`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'controls.png') });
    await done(name, page, errs);
  } else if (name === 'ko' || name === 'ko-final') {
    const fin = name === 'ko-final';
    const { page, errs } = await open('sumaura', 'kevalanche');
    await page.evaluate(`place(-1300, 1300); ${fin ? 'ST().wins = [1, 0];' : ''} ST().f[1].hp = 1; script((i) => [i === 2 ? ${P} : 0, 0]);`);
    await strip(name, page, [
      `ST().ev.some((e) => e.k === 'koflash')`,
      `ST().phase === 'ko' && ST().kt >= ${fin ? 70 : 52}`,
      `ST().ev.some((e) => e.k === 'kobounce')`,
      `ST().ev.some((e) => e.k === 'kobanner')`,
    ], 2, [25, 400, 200, 450]);
    const st = await page.evaluate(`({ kn: ST().kn, kf: ST().kf, y: ST().f[1].y })`);
    console.log(' ', JSON.stringify(st));
    await done(name, page, errs);
  }
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
