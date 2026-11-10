/* Zach Sparrow's wings close up (OG and ALT): folded at rest, opening for
   the heavy, beating in a jump, up in a block; and the K.O.

     node tools/wing-shots.mjs [--html final.html] [--out shots/polish] [--tag after]

   WebGL 2 on SwiftShader; prints console errors. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'polish')));
const tag = opt('--tag', 'after');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const PRE = `
  window.B = window.__bolster; window.F = () => B.fight; window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; s.f[0].y = s.f[1].y = 0; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.cam = (x, d, ty, fov = 26, cx = 0) => {
    const c = B.stage.camera;
    c.aspect = innerWidth / innerHeight; c.fov = fov; c.position.set(x + cx, ty + 0.6, d); c.lookAt(x, ty, 0); c.updateProjectionMatrix();
    B.stage.update(0); B.renderer.render(B.stage.scene, c);
  };
  window.press = (mask, side, n = 2) => { let i = 0; F().override = () => { i++; const m = i <= n ? mask : 0; return side ? [0, m] : [m, 0]; }; };
`;

const errs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
// P1 Zach OG, P2 Zach ALT (the mirror rule)
await page.goto(`file://${html}?p1=zach&p2=zach&hold&noportraits&seed=7`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
await page.evaluate(PRE);
await page.evaluate(`until(() => ST().phase === 'fight', 8); F().cpu = [null, null]; F().override = () => [0, 0]; B.step(0.5, false); document.querySelector('#ui').style.visibility = 'hidden';`);
const shot = (n) => page.screenshot({ path: path.join(out, `zach-wings-${n}-${tag}.png`) });
const X = (k) => `F().plush[${k}].group.position.x`;
for (const k of [0, 1]) {
  const who = k ? 'alt' : 'og';
  await page.evaluate(`F().override = () => [0, 0]; place(-2200, 2200); B.step(1.2, false); cam(${X(k)}, 6.2, 1.25, 26, ${k ? -1.6 : 1.6});`);
  await shot(`${who}-rest`);
  await page.evaluate(`press(32, ${k}); until(() => ST().f[${k}].act === 'attack' && ST().f[${k}].t >= 12, 2); cam(${X(k)}, 7, 1.3, 26, ${k ? -1.2 : 1.2});`);
  await shot(`${who}-heavy`);
  await page.evaluate(`F().override = () => [0, 0]; B.step(1.2, false); press(4, ${k}, 30); until(() => ST().f[${k}].y > 900, 2); cam(${X(k)}, 8, 2.2, 26, 0);`);
  await shot(`${who}-jump`);
  await page.evaluate(`F().override = () => [0, 0]; B.step(1.5, false); place(-1500, 1500); B.step(0.4, false); F().override = () => (${k} ? [0, 128] : [128, 0]); until(() => ST().f[${k}].act === 'guard', 1.2); B.step(0.4, false); cam(${X(k)}, 7, 1.4, 26, ${k ? -1.2 : 1.2});`);
  await shot(`${who}-block`);
  await page.evaluate(`F().override = () => [0, 0]; B.step(1.5, false);`);
}
console.log(errs.length ? `console errors:\n${errs.join('\n')}` : 'no console errors');
await browser.close();
