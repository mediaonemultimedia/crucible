/* Evidence for the throws pass, in headless Chromium (SwiftShader): every
   fighter's forward and back throw as a strip (the grab, the hold, the peak,
   the release, the flight, the landing) — set up by standing near a wall
   (the open side in front: forward; behind: back) — K8-E v Zach both ways,
   a throw at the wall, a tech (BREAK!), and Kevalanche's jersey pull front
   on as a GIF. Fails on any console error.
     node tools/throws-shots.mjs [strips|<id>|<id>-f|<id>-b|pairs|wall|tech|gif] [--q '&feel=old'] */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { FIGHTERS } from '../src/fighters/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'throws');
fs.mkdirSync(out, { recursive: true });
const html = path.join(root, 'final.html');
const argv = process.argv.slice(2);
const qi = argv.indexOf('--q');
const Q = qi >= 0 ? argv[qi + 1] : '';
const names = qi >= 0 ? argv.filter((a, i) => i !== qi && i !== qi + 1) : argv;
const IDS = ['kevalanche', 'k8e', 'zach', 'sumaura', 'sebas', 'rubberta', 'johnny'];
const OPP = { kevalanche: 'johnny', k8e: 'sumaura', zach: 'kevalanche', sumaura: 'rubberta', sebas: 'johnny', rubberta: 'sebas', johnny: 'kevalanche' };
const todo = names.length ? names : ['strips', 'pairs', 'wall', 'tech', 'gif'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PRE = `
  window.B = window.__bolster; window.F = () => B.fight; window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; s.f[0].face = Math.sign(x2 - x1); s.f[1].face = -s.f[0].face; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
`;
const O = 16, P = 32;
let errors = 0;
async function open(p1, p2, q = '') {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=${p1}&p2=${p2}&cpu=normal&seed=7&hold&webgl&noportraits${Q}${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`toFight(); F().cpu = [null, null]; script(() => [0, 0]); B.step(0.5, false);`);
  return { page, errs };
}
const tmp = (name, k) => path.join(out, `_${name}-${k}-${process.pid}.png`);
async function shot(page, cond, file, wait = 60) {
  const ok = await page.evaluate(`until(() => ${cond}, 6)`);
  await page.evaluate('B.step(0)');
  if (wait) await page.waitForTimeout(wait);
  await page.screenshot({ path: file });
  return ok;
}
/* a throw by player 1: x1 his place, side +1 = the victim on his right */
async function setThrow(page, x1, side, defend = '0') {
  const ids = await page.evaluate('ST().f.map((f) => f.id)');
  const w = (FIGHTERS[ids[0]].push.w + FIGHTERS[ids[1]].push.w) >> 1;
  await page.evaluate(`{
    place(${x1}, ${x1} + ${side} * ${w + 250});
    window.gi = -1;
    script((i, st) => { if (gi < 0 && st.f[1].act === 'grabbed') gi = i; return [i === 2 ? ${O | P} : 0, ${defend}]; });
  }`);
}
const FR = [
  [`ST().f[0].mv === 'throwHold' && ST().f[0].t >= 3`, 'grab'],
  [`ST().f[0].mv === 'throwHold' && ST().f[0].t >= 11`, 'hold'],
  [`ST().f[0].mv === 'throwHold' && ST().f[0].t >= 21`, 'peak'],
  [`ST().f[0].mv === 'throwHold' && ST().f[0].t >= 27`, 'release'],
  [`ST().f[1].act === 'down' && ST().f[1].t >= 12`, 'flight'],
  [`ST().ev.some((e) => e.k === 'bounce')`, 'landing'],
];
async function strip(name, page, frames = FR, cols = 6) {
  const tiles = [];
  for (const [k, [cond, label]] of frames.entries()) {
    const f = tmp(name, k);
    const ok = await shot(page, cond, f);
    if (!ok) console.log(`  ${name} ${label}: never (${cond})`);
    execFileSync('convert', [f, '+repage', '-crop', '600x420+180+120', '+repage', '-resize', '450x315', '-gravity', 'north', '-fill', 'white', '-pointsize', '18', '-annotate', '+0+6', label, f]);
    tiles.push(f);
  }
  execFileSync('montage', [...tiles, '-tile', `${cols}x`, '-geometry', '+2+2', '-background', '#222', path.join(out, `${name}.png`)]);
  for (const f of tiles) fs.unlinkSync(f);
}
const done = async (name, page, errs) => { console.log(name, errs.length ? errs.slice(0, 3) : 'ok'); errors += errs.length; await page.close(); };

/* forward: near the left wall facing right (the room in front); back: near the right wall facing right (the room behind) */
async function one(id, dir, opp = OPP[id], tag = '') {
  const { page, errs } = await open(id, opp);
  await setThrow(page, dir === 'f' ? -6500 : 5000, 1);
  await strip(`${id}-${dir}${tag}`, page);
  const g = await page.evaluate(`({ back: ST().f[0].td !== ST().f[0].face })`);
  await done(`${id} ${dir} (vs ${opp}) ${g.back ? 'back' : 'forward'}`, page, errs);
}

for (const name of todo) {
  if (name === 'strips') { for (const id of IDS) for (const d of ['f', 'b']) await one(id, d); }
  else if (IDS.includes(name)) { for (const d of ['f', 'b']) await one(name, d); }
  else if (/^[a-z0-9]+-[fb]$/.test(name)) { const [id, d] = name.split('-'); await one(id, d); }
  else if (name === 'pairs') {
    for (const d of ['f', 'b']) { await one('k8e', d, 'zach', '-v-zach'); await one('zach', d, 'k8e', '-v-k8e'); }
  } else if (name === 'wall') {
    // right at the wall, facing it: thrown back into the room, nobody in the wall
    const { page, errs } = await open('sumaura', 'zach');
    await setThrow(page, 8600, -1);
    await strip('wall-sumaura', page);
    const s = await page.evaluate(`ST().f.map((f) => f.x)`);
    console.log('  wall: x', s);
    await done(name, page, errs);
  } else if (name === 'tech') {
    const { page, errs } = await open('kevalanche', 'sebas');
    await setThrow(page, -2000, 1, `gi >= 0 && i === gi + 5 ? ${O | P} : 0`);
    await strip('tech', page, [
      [`ST().f[0].mv === 'throwHold' && ST().f[0].t >= 3`, 'grab'],
      [`ST().ev.some((e) => e.k === 'tech')`, 'BREAK!'],
      [`ST().f[0].act === 'blockstun' && ST().f[0].t >= 8`, 'apart'],
    ], 3);
    await done(name, page, errs);
  } else if (name === 'gif') {
    // the jersey pull front on: the camera turned to face it, every 2nd tick
    const { page, errs } = await open('kevalanche', 'johnny');
    await setThrow(page, -4000, 1);
    await page.evaluate(`until(() => ST().f[0].mv === 'throwHold', 4)`);
    const frames = [];
    for (let k = 0; k < 34; k++) {
      const f = path.join(out, `_gif-${process.pid}-${String(k).padStart(2, '0')}.png`);
      await page.evaluate(`for (let j = 0; j < 2; j++) B.frame(1 / 60, false); B.step(0)`);
      await page.screenshot({ path: f, clip: { x: 160, y: 40, width: 640, height: 520 } });
      frames.push(f);
    }
    execFileSync('convert', ['-delay', '5', '-loop', '0', ...frames, '-resize', '420x', '-layers', 'Optimize', path.join(out, 'jersey-pull.gif')]);
    for (const f of frames) fs.unlinkSync(f);
    await done(name, page, errs);
  }
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
