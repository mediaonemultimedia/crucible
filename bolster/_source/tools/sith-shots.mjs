/* The Sith twins' evidence: each of the three in a mirror match, the
   original (blue trail) and the Sith twin (red trail) swinging at once,
   and a close-up of each twin; Evil Johnny's red racquet up close.

     node tools/sith-shots.mjs [--html final.html] [--out shots/sith] [johnny|sebas|kevalanche|racquet …]

   WebGL 2 on SwiftShader; prints every console error. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'sith')));
fs.mkdirSync(out, { recursive: true });
const names = args.length ? args : ['johnny', 'sebas', 'kevalanche', 'racquet'];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const PRE = `
  window.B = window.__bolster;
  window.F = () => B.fight;
  window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; s.f[0].y = s.f[1].y = 0; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.cam = (x, d = 11.5, ty = 1.8, fov = 26) => {
    const c = B.stage.camera;
    c.aspect = innerWidth / innerHeight; c.fov = fov; c.position.set(x, ty + 1.1, d); c.lookAt(x, ty, 0); c.updateProjectionMatrix();
    B.stage.update(0);
    B.renderer.render(B.stage.scene, c);
  };
`;

async function open(id) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=${id}&p2=${id}&hold&noportraits&seed=7`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`until(() => ST().phase === 'fight', 8); F().cpu = [null, null]; F().override = () => [0, 0]; B.step(0.5, false);`);
  return { page, errs };
}

/* both swing a heavy at the same moment, far enough apart to whiff, and
   the frame is taken as the trails are longest */
async function duel(id) {
  const { page, errs } = await open(id);
  await page.evaluate(`
    place(-3700, 3700); B.step(0.3, false);
    { let i = 0; F().override = () => { i++; return [i === 2 ? 32 : 0, i === 2 ? 32 : 0]; }; }
    const L = []; if (!until(() => { L.push(ST().f[0].act + ST().f[0].t); return ST().f[0].act === 'attack' && ST().f[0].t >= ${id === 'johnny' ? 16 : 15}; }, 2)) throw new Error('no swing: ' + L.slice(0, 30).join(','));
    document.querySelector('#ui').style.visibility = 'hidden';
    cam(0, 17, 1.9);
  `);
  await page.screenshot({ path: path.join(out, `duel-${id}.png`) });
  // the twin on his own: idle, close, three-quarters
  await page.evaluate(`
    F().override = () => [0, 0]; B.step(1.2, false);
    cam(F().plush[1].group.position.x - 1.6, 8.5, 2.0);
  `);
  await page.screenshot({ path: path.join(out, `sith-${id}.png`) });
  await page.evaluate(`cam(F().plush[0].group.position.x + 1.6, 8.5, 2.0);`);
  await page.screenshot({ path: path.join(out, `jedi-${id}.png`) });
  await page.close();
  return errs;
}

/* the two racquets, side by side, face on: Grommet's wooden one (the
   original's) and the Sith twin's red one */
async function racquet() {
  const { page, errs } = await open('johnny');
  await page.evaluate(`
    place(-2600, 2600); B.step(0.5, false);
    document.querySelector('#ui').style.visibility = 'hidden';
    const S = B.stage.scene;
    for (const [k, x] of [[0, -0.42], [1, 0.42]]) {
      const r = F().plush[k].racquet.clone(true);
      r.matrix.makeRotationZ(k ? -0.16 : 0.16).setPosition(x * 1.5, 0.7, 5.4);
      r.matrixWorldNeedsUpdate = true;
      S.add(r);
    }
    for (const p of F().plush) p.group.visible = false;
    B.frame(1 / 60, false);
    cam(0, 10.6, 1.55, 24);
  `);
  await page.screenshot({ path: path.join(out, 'racquets.png') });
  await page.close();
  return errs;
}

let bad = 0;
for (const n of names) {
  const errs = n === 'racquet' ? await racquet() : await duel(n);
  console.log(n, errs.length ? errs : 'ok');
  bad += errs.length;
}
await browser.close();
process.exit(bad ? 1 : 0);
