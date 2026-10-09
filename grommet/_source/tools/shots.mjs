/* Headless screenshots of the built page (final.html), WebGL 2 on
   SwiftShader: there is no GPU in the sandbox, so these show what renders,
   not how fast. Scenarios drive the page through window.__grommet.

     node tools/shots.mjs [scenario …]      (default: all)

   Writes shots/<name>.png and prints every console error.               */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(root, 'final.html');

const SCENES = {
  'leopard-rest': { character: 'leopard', run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'leopard-swing': {
    character: 'leopard',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      await G(`(() => { const g = __grommet.game; g.launch({ aim: [-2.35, 1.7], speed: 13 }); g.timingErr = 0; })()`);
      // step until the ball is on the strings
      await G(`(() => { const g = __grommet.game; for (let k = 0; k < 240; k++) { __grommet.step(1/60); const b = g.ball; if (!b) break; const C = g.rq.C; if (Math.hypot(b.x[0]-C[0], b.x[1]-C[1], b.x[2]-C[2]) < 0.45 || g.hits) break; } __grommet.step(0, true); return [g.state, g.outcome, g.hits]; })()`);
    },
  },
  'leopard-backhand': {
    character: 'leopard',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      await G(`(() => { const g = __grommet.game; g.launch({ aim: [1.6, 1.5], speed: 12 }); g.timingErr = 0; })()`);
      await G(`(() => { const g = __grommet.game; for (let k = 0; k < 240; k++) { __grommet.step(1/60); const b = g.ball; if (!b) break; if (g.hits) { __grommet.step(2/60); break; } } __grommet.step(0, true); return [g.state, g.outcome]; })()`);
    },
  },
  'leopard-bonk': {
    character: 'leopard',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; for (let k = 0; k < 6; k++) { g.reset(); __grommet.step(1); g.launch({ aim: [0.05, 2.6], speed: 25 }); for (let j = 0; j < 150 && !g.outcome; j++) __grommet.step(1/60); if (g.outcome === 'bonk') break; } __grommet.step(0.55, true); return [g.outcome, g.state, g.daze]; })()`);
      console.log('  bonk', r);
    },
  },
  'bear-rest': { character: 'bear', run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'bear-dive': {
    character: 'bear',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      await G(`(() => { const g = __grommet.game; g.launch({ aim: [2.5, 1.5], speed: 15 }); for (let k = 0; k < 240; k++) { __grommet.step(1/60); if (g.state === 'dive' && g.t > 0.36) break; } __grommet.step(0, true); return g.state; })()`);
    },
  },
  'bear-save': {
    character: 'bear',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; g.launch({ aim: [-2.3, 0.8], speed: 14 }); for (let k = 0; k < 400; k++) { __grommet.step(1/60); if (g.outcome) break; } __grommet.step(0.25, true); return [g.outcome, g.state]; })()`);
      console.log('  save', r);
    },
  },
  'bear-goal': {
    character: 'bear',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; g.launch({ aim: [2.75, 0.45], speed: 26 }); for (let k = 0; k < 400; k++) { __grommet.step(1/60); if (g.outcome) break; } __grommet.step(0.3, true); return [g.outcome, g.state]; })()`);
      console.log('  goal', r);
    },
  },
  'bear-getup': {
    character: 'bear',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      await G(`(() => { const g = __grommet.game; g.launch({ aim: [2.5, 1.5], speed: 15 }); for (let k = 0; k < 500; k++) { __grommet.step(1/60); if (g.state === 'getup' && g.t > 0.9) break; } __grommet.step(0, true); return g.state; })()`);
    },
  },
  'leopard-mobile': { character: 'leopard', mobile: true, run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'bear-mobile': { character: 'bear', mobile: true, run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'crow-rest': { character: 'crow', run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'crow-close': {
    character: 'crow',
    run: async (G) => { await G(`(() => { const o = __grommet.tools.orbit; __grommet.step(2); o.dist = 6.5; o.az = 0.35; o.el = 0.18; o.target.set(0, 1.4, 0); __grommet.tools.applyOrbit(); __grommet.step(0.1, true); })()`); },
  },
  'crow-catch': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; const it = g.launch({ aim: [0.5, 1.9], kind: 'food', speed: 15 }); for (let k = 0; k < 240; k++) { __grommet.step(1/120); const b = it.ball.x, m = g.mouth; if (Math.hypot(b[0]-m[0], b[1]-m[1], b[2]-m[2]) < 0.75 && g.beak.x > 0.8) break; } __grommet.step(0, true); return [g.state, g.beak.x, it.state]; })()`);
      console.log('  catch', r);
    },
  },
  'crow-lunge': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; g.launch({ aim: [2.9, 2.1], kind: 'food', speed: 15 }); for (let k = 0; k < 400; k++) { __grommet.step(1/120); if (g.state === 'lunge' && g.t > 0.16) break; } __grommet.step(0, true); return [g.state, g.flap.x]; })()`);
      console.log('  lunge', r);
    },
  },
  'crow-peck': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; g.launch({ aim: [-4, 1], kind: 'food', speed: 26 }); for (let k = 0; k < 1200; k++) { __grommet.step(1/120); if (g.state === 'peck' && g.t > 0.32) break; } __grommet.step(0, true); return [g.state, g.mouth[1]]; })()`);
      console.log('  peck', r);
    },
  },
  'crow-nest': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(1.5)`);
      const r = await G(`(() => { const g = __grommet.game; for (const a of [[0.2, 1.9], [-0.5, 2.0], [0.6, 1.8], [0, 2.1], [0.4, 2.0]]) { g.launch({ aim: a, kind: 'shiny', speed: 15 }); __grommet.step(5.5); } const o = __grommet.tools.orbit; o.dist = 8; o.az = 0.55; o.el = 0.42; o.target.set(1.4, 0.6, -0.6); __grommet.tools.applyOrbit(); __grommet.step(0.05, true); return [g.hoard(), g.items.map((it) => it.sub)]; })()`);
      console.log('  nest', JSON.stringify(r));
    },
  },
  'crow-steal': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(1.5)`);
      const r = await G(`(() => { const g = __grommet.game; for (const a of [[0.2, 1.9], [-0.5, 2.0], [0.6, 1.8]]) { g.launch({ aim: a, kind: 'shiny', speed: 15 }); __grommet.step(5.5); } const it = g.items.find((q) => q.inNest); g.grabItem(it.id); for (let k = 0; k <= 40; k++) { const u = k / 40; g.moveItem(it.id, [2.3 - 3.0 * u, 0.5 + Math.sin(u * Math.PI) * 0.9, -1.05 + 2.4 * u]); __grommet.step(1/60); } g.releaseItem(it.id); for (let k = 0; k < 1200; k++) { __grommet.step(1/120); if (g.state === 'carry' && g.t > 0.5) break; } __grommet.step(0, true); return [g.state, it.state, g.msg]; })()`);
      console.log('  steal', r);
    },
  },
  'crow-indignant': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(1.5)`);
      const r = await G(`(() => { const g = __grommet.game; for (const a of [[0.2, 1.9], [-0.5, 2.0]]) { g.launch({ aim: a, kind: 'shiny', speed: 15 }); __grommet.step(5.5); } const it = g.items.find((q) => q.inNest); g.grabItem(it.id); for (let k = 0; k <= 60; k++) { const u = Math.min(1, k / 40); g.moveItem(it.id, [2.3 - 2.2 * u, 0.5 + Math.sin(Math.min(1, u) * Math.PI / 2) * 1.6, -1.05 + 1.6 * u]); __grommet.step(1/60); if (g.state === 'indignant' && g.t > 0.3) break; } __grommet.step(0, true); return [g.state, g.flap.x]; })()`);
      console.log('  indignant', r);
    },
  },
  'crow-catch-close': {
    character: 'crow',
    run: async (G) => {
      await G(`__grommet.step(2)`);
      const r = await G(`(() => { const g = __grommet.game; const it = g.launch({ aim: [0.3, 1.95], kind: 'food', speed: 15 }); for (let k = 0; k < 240; k++) { __grommet.step(1/120); const b = it.ball.x, m = g.mouth; if (Math.hypot(b[0]-m[0], b[1]-m[1], b[2]-m[2]) < 0.6 && g.beak.x > 0.85) break; } const o = __grommet.tools.orbit, c = __grommet.soft.cloudC[0]; o.dist = 6.4; o.az = 0.95; o.el = 0.12; o.target.set(c[0] + 0.3, 1.75, c[2] + 0.5); __grommet.tools.applyOrbit(); __grommet.hold = true; __grommet.step(0, true); return [g.state, g.beak.x, it.state]; })()`);
      console.log('  catch-close', r);
    },
  },
  'crow-hooded': {
    character: 'crow',
    run: async (G) => { await G(`(() => { document.querySelectorAll('#p-fur button')[1].click(); __grommet.step(2.5, true); })()`); },
  },
  'crow-white': {
    character: 'crow',
    run: async (G) => { await G(`(() => { document.querySelectorAll('#p-fur button')[2].click(); __grommet.step(2.5, true); })()`); },
  },
  'crow-raven': {
    character: 'crow',
    run: async (G) => { await G(`(() => { document.querySelectorAll('#p-fur button')[3].click(); const o = __grommet.tools.orbit; __grommet.step(2); o.dist = 6.5; o.az = -0.5; o.el = 0.15; o.target.set(0, 1.4, 0); __grommet.tools.applyOrbit(); __grommet.step(0.1, true); })()`); },
  },
  'crow-mobile': { character: 'crow', mobile: true, run: async (G) => { await G(`__grommet.step(2.5, true)`); } },
  'leopard-close': {
    character: 'leopard',
    run: async (G) => { await G(`(() => { const o = __grommet.tools.orbit; __grommet.step(2); o.dist = 7.5; o.az = 0.25; o.el = 0.2; __grommet.tools.applyOrbit(); __grommet.step(0.1, true); })()`); },
  },
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
  const page = await browser.newPage({ viewport: S.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  // reproducible scenes: the game's reaction jitter and timing wobble use
  // Math.random, so seed it
  await page.addInitScript(() => {
    let seed = 20261008;
    Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errs.push('network request: ' + r.url()); });
  await page.goto(`${url}?character=${S.character}&webgl`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__grommet, null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector('#ui').style.transition = 'none'; window.__grommet.hold = true; });
  const G = (js) => page.evaluate(js);
  const t0 = Date.now();
  await S.run(G);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 120000 });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
  errors += errs.length;
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
