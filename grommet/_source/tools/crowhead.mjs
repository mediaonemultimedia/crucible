/* The crow's head from fixed cameras (front, 3/4 left, 3/4 right, side,
   top, below), cropped close, plus a numeric read of where the beak sits
   against the eyes in the head's own frame. Headless Chromium, WebGL 2 on
   SwiftShader.

     node tools/crowhead.mjs [prefix]      → shots/<prefix>-<view>.png   */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const prefix = process.argv[2] || 'crowhead';
const url = 'file://' + (process.env.FINAL || path.join(root, 'final.html'));

// cameras about the head's centre: az from the front (+z), el up
const VIEWS = {
  front: [0, 0.08], 'q-left': [-0.75, 0.1], 'q-right': [0.75, 0.1], side: [1.5707, 0.05], top: [0.2, 1.25], below: [0.15, -0.6],
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => {
  let seed = 20261008;
  Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(`${url}?character=crow&webgl`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__grommet, null, { timeout: 400000 });
await page.evaluate(() => { document.querySelector('#ui').style.transition = 'none'; window.__grommet.hold = true; __grommet.step(2.5); });
const G = (js) => page.evaluate(js);

// the numbers: eyes and beak base in the head's frame
const report = await G(`(() => {
  const g = __grommet.game;
  const R = g.hR, c = g.hC;
  const loc = (w) => { const d = [w[0] - c[0], w[1] - c[1], w[2] - c[2]]; return [0, 1, 2].map((i) => +(R[i] * d[0] + R[3 + i] * d[1] + R[6 + i] * d[2]).toFixed(3)); };
  __grommet.step(0, true);
  const eyes = [];
  __grommet.scene.traverse((o) => { if (o.userData && o.userData.side !== undefined && o.userData.head === 0 && o.visible) eyes.push(loc([o.position.x, o.position.y, o.position.z])); });
  const F = g.beakFrame();
  const fwd = [R[2], R[5], R[8]];
  return { eyes, beakBase: loc(F.base), tip: loc(g.tip), mouth: loc(g.mouth), headFwdWorld: fwd.map((x) => +x.toFixed(3)) };
})()`);
console.log(JSON.stringify(report));

// where the head's centre lands on the page
const centre = () => G(`(() => { const c = __grommet.game.hC, cam = __grommet.camera, el = __grommet.renderer.domElement, r = el.getBoundingClientRect(); const p = { x: c[0], y: c[1] - 0.1, z: c[2] + 0.3 }; const v = new cam.position.constructor(p.x, p.y, p.z).project(cam); return [r.x + (v.x + 1) / 2 * r.width, r.y + (1 - v.y) / 2 * r.height]; })()`);
const canvasBox = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
for (const [name, [az, el]] of Object.entries(VIEWS)) {
  await G(`(() => { const o = __grommet.tools.orbit, c = __grommet.game.hC; o.dist = ${process.env.DIST || 3.6}; o.az = ${az}; o.el = ${el}; o.target.set(c[0], c[1] - 0.1, c[2] + 0.3); __grommet.tools.applyOrbit(); __grommet.step(0, true); })()`);
  await page.waitForTimeout(200);
  const [cx, cy] = await centre();
  const s = 560;
  await page.screenshot({ path: path.join(out, `${prefix}-${name}.png`), clip: { x: cx - s / 2, y: cy - s / 2, width: s, height: s }, timeout: 400000 });
}
// mid-catch: a berry tossed to his beak, caught open, from the front and three-quarter
await G(`(() => { const g = __grommet.game; g.reset(); __grommet.step(2); const it = g.launch({ aim: [0.15, 1.95], kind: 'food', sub: 'berry', speed: 15 }); for (let k = 0; k < 240; k++) { __grommet.step(1/120); const b = it.ball.x, m = g.mouth; if (Math.hypot(b[0]-m[0], b[1]-m[1], b[2]-m[2]) < 0.5 && g.beak.x > 0.85) break; } return [g.state, g.beak.x]; })()`);
for (const [name, [az, el]] of Object.entries({ 'catch-front': [0.12, 0.08], 'catch-q': [0.75, 0.1] })) {
  await G(`(() => { const o = __grommet.tools.orbit, c = __grommet.game.hC; o.dist = ${process.env.DIST || 3.6}; o.az = ${az}; o.el = ${el}; o.target.set(c[0], c[1] - 0.1, c[2] + 0.3); __grommet.tools.applyOrbit(); __grommet.step(0, true); })()`);
  await page.waitForTimeout(200);
  const [cx, cy] = await centre();
  const s = 560;
  await page.screenshot({ path: path.join(out, `${prefix}-${name}.png`), clip: { x: cx - s / 2, y: cy - s / 2, width: s, height: s }, timeout: 400000 });
}
console.log(errs.length ? 'ERRORS:\n  ' + errs.join('\n  ') : 'zero console errors');
await browser.close();
