/* Close-up evidence for the polish pass: fixed-camera shots of one fighter
   (front, three-quarter, side — at rest and at the heavy's full extension),
   and light-vs-heavy sequences (the jab out, the heavy's wind-up, its full
   extension) in the fight camera. Runs against any build, so the same
   shots can be taken before and after a change.

     node tools/polish-shots.mjs [--html final.html] [--out shots/polish] [scene …]

   Scenes: shoulders-<id> (a 3×2 sheet), strikes-<id> (light / wind-up /
   heavy), or `all`. WebGL 2 on SwiftShader; prints every console error. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'polish')));
const extra = opt('--q', '');
fs.mkdirSync(out, { recursive: true });
const IDS = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e'];
let names = args.length ? args : ['all'];
if (names.includes('all')) names = [...IDS.map((i) => `shoulders-${i}`), 'strikes-kevalanche', 'strikes-sumaura'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const PRE = `
  window.B = window.__bolster;
  window.F = () => B.fight;
  window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
  /* the first active frame of the move he's in (older builds: their numbers) */
  window.first = (f) => B.moveOf ? B.moveOf(f.id, f.mv).hits[0].from : f.mv === 'light' ? 4 : { kevalanche: 8, rubberta: 10, johnny: 9, sumaura: 10, k8e: 12 }[f.id];
  /* the fight from the front, close: framed on the attacker and his reach */
  window.stageCam = () => {
    const x = F().plush[0].group.position.x + 1.6;
    const cam = B.stage.camera;
    cam.aspect = innerWidth / innerHeight; cam.fov = 26; cam.position.set(x, 3.0, 12.5); cam.lookAt(x, 1.9, 0); cam.updateProjectionMatrix();
    B.renderer.render(B.stage.scene, cam);
    if (B.boxes) B._boxes();
  };
  /* a fixed camera round fighter 0: theta from his own forward (0 front, 90° his side) */
  window.orbit = (theta, dist, ty, fov = 30) => {
    const p = F().plush[0], g = p.group, yaw = g.rotation.y + theta * Math.PI / 180;
    const cam = B.__cam || (B.__cam = new (B.stage.camera.constructor)(fov, innerWidth / innerHeight, 0.1, 200));
    cam.fov = fov; cam.aspect = innerWidth / innerHeight;
    cam.position.set(g.position.x + Math.sin(yaw) * dist, ty + 0.4, Math.cos(yaw) * dist);
    cam.lookAt(g.position.x, ty, 0);
    cam.updateProjectionMatrix();
    B.renderer.render(B.stage.scene, cam);
  };
`;

async function open(q, vp = { width: 1440, height: 810 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + html + q + extra);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  return { page, errs };
}

const TY = { kevalanche: 1.7, johnny: 1.75, sumaura: 1.6, k8e: 2.3, rubberta: 1.2 };
const DIST = { kevalanche: 7.2, johnny: 7.2, sumaura: 7.2, k8e: 9, rubberta: 6.6 };
const HP = 32, LP = 16;

let errors = 0;
for (const name of names) {
  const [kind, id] = name.split('-');
  const t0 = Date.now();
  if (kind === 'shoulders') {
    const { page, errs } = await open(`?p1=${id}&p2=${id === 'k8e' ? 'johnny' : 'k8e'}&cpu=normal&seed=7&hold&webgl&noportraits`, { width: 520, height: 600 });
    const tiles = [];
    for (const pose of ['rest', 'heavy']) {
      // the fight, the other one far off; then (for 'heavy') a heavy out to its full extension
      await page.evaluate(`toFight(); F().cpu = [null, null]; place(-1500, 8500); script(() => [0, 0]); B.step(1.2, false);
        ${pose === 'heavy' ? `script((i) => [i === 1 ? ${HP} : 0, 0]);
          until(() => ST().f[0].mv === 'heavy' && ST().f[0].t >= first(ST().f[0]) + 1, 3);` : ''}`);
      for (const [view, th] of [['front', 0], ['34', 45], ['side', 90]]) {
        await page.evaluate(`orbit(${th}, ${DIST[id]}, ${TY[id]})`);
        const f = path.join(out, `_${id}-${pose}-${view}.png`);
        await page.screenshot({ path: f });
        tiles.push(f);
      }
    }
    const sheet = path.join(out, `shoulders-${id}.png`);
    execFileSync('montage', [...tiles, '-tile', '3x2', '-geometry', '+4+4', '-background', '#222', sheet]);
    for (const f of tiles) fs.unlinkSync(f);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
    errors += errs.length;
    await page.close();
  } else if (kind === 'strikes') {
    const { page, errs } = await open(`?p1=${id}&p2=johnny&cpu=normal&seed=7&hold&webgl&noportraits`, { width: 960, height: 600 });
    const tiles = [];
    const shots = [
      ['light', LP, `ST().f[0].mv === 'light' && ST().f[0].t >= first(ST().f[0]) + 1`],
      ['windup', HP, `ST().f[0].mv === 'heavy' && ST().f[0].t >= first(ST().f[0]) - 4`],
      ['heavy', HP, `ST().f[0].mv === 'heavy' && ST().f[0].t >= first(ST().f[0]) + 2`],
    ];
    for (const [label, btn, cond] of shots) {
      await page.evaluate(`toFight(); F().cpu = [null, null]; place(-2600, 3400); script(() => [0, 0]); B.step(1.0, false);
        script((i) => [i === 1 ? ${btn} : 0, 0]);
        until(() => { const f = ST().f[0]; return f.act === 'attack' && (${cond}); }, 3);
        B.step(0, false); stageCam();`);
      const f = path.join(out, `_${id}-${label}.png`);
      await page.screenshot({ path: f });
      tiles.push(f);
      await page.evaluate(`script(() => [0, 0]); B.step(1.2, false)`);
    }
    const sheet = path.join(out, `strikes-${id}.png`);
    execFileSync('montage', [...tiles, '-tile', '3x1', '-geometry', '+4+4', '-background', '#222', sheet]);
    for (const f of tiles) fs.unlinkSync(f);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
    errors += errs.length;
    await page.close();
  } else console.log(`no scene ${name}`);
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
