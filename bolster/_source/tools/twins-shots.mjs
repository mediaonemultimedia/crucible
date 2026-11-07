/* The evil twins' evidence and the owner's line-up sheets.

     node tools/twins-shots.mjs [--html final.html] [--out shots/twins] [ids…] [--lineup] [--only close]

   Per fighter (a mirror match, P1 the original, P2 the twin): the duel at
   the gameplay camera, the twin mid-attack, a close-up of the twin, and the
   twin hit, crouching and K.O.'d (the rig's biggest deformations).
   --lineup: roster.png (all 7 originals) and twins.png (all 7 twins), the
   same pose, light and camera. WebGL 2 on SwiftShader; prints console errors. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'twins')));
const only = opt('--only', '');
const lineup = flag('--lineup');
fs.mkdirSync(out, { recursive: true });
const ALL = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e', 'sebas', 'zach'];
const names = args.length ? args : (lineup ? [] : ['kevalanche', 'rubberta', 'sumaura', 'k8e', 'zach']);

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
  window.press = (mask, side = 1, n = 2) => { let i = 0; F().override = () => { i++; const m = i <= n ? mask : 0; return side ? [0, m] : [m, 0]; }; };
`;

async function open(id, vp = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=${id}&p2=${id}&hold&noportraits&seed=7`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`until(() => ST().phase === 'fight', 8); F().cpu = [null, null]; F().override = () => [0, 0]; B.step(0.5, false); document.querySelector('#ui').style.visibility = 'hidden';`);
  return { page, errs };
}

async function twin(id) {
  const { page, errs } = await open(id);
  const shot = (n) => page.screenshot({ path: path.join(out, `${id}-${n}.png`) });
  if (!only || only === 'close') {
    await page.evaluate(`place(-1300, 1300); B.step(1.0, false); cam(F().plush[1].group.position.x - 1.2, 7.8, 2.1);`);
    await shot('close');
    await page.evaluate(`cam(F().plush[0].group.position.x + 1.2, 7.8, 2.1);`);
    await shot('orig-close');
  }
  if (!only) {
    // gameplay camera: the game's own, a normal frame
    await page.evaluate(`place(-1900, 1900); B.step(0.8, false); B.frame(1/60, false);`);
    await shot('game');
    // mid-attack: the twin's heavy at its first active frame
    await page.evaluate(`press(32, 1); if (!until(() => ST().f[1].act === 'attack' && ST().f[1].t >= 14, 2)) throw new Error('no swing'); cam(0, 13, 1.9);`);
    await shot('attack');
    // signature (crouch+heavy): a big deformation
    await page.evaluate(`F().override = () => [0, 0]; B.step(1.2, false); place(-2600, 2600); press(4 | 32, 1, 3); until(() => ST().f[1].act === 'attack' && ST().f[1].t >= 18, 2); cam(F().plush[1].group.position.x - 0.8, 10, 1.9);`);
    await shot('signature');
    // a hit reaction: the original's heavy lands on the twin
    await page.evaluate(`F().override = () => [0, 0]; B.step(1.5, false); place(-900, 900); press(32, 0); until(() => ST().f[1].act === 'hit' || ST().f[1].act === 'stun' || (ST().f[1].hs|0) > 0, 2); B.step(0.06, false); cam(F().plush[1].group.position.x - 0.6, 9.5, 1.9);`);
    await shot('hit');
    // K.O.: stuffing to 1, then a heavy; let it land flat
    await page.evaluate(`F().override = () => [0, 0]; B.step(1.2, false); place(-900, 900); ST().f[1].hp = 1; press(32, 0); B.step(2.2, false); cam(F().plush[1].group.position.x - 0.4, 11, 1.2);`);
    await shot('ko');
  }
  await page.close();
  return errs;
}

/* every fighter in the same pose (idle, three-quarters to camera), same
   light and camera: one tile per fighter, then one sheet */
async function lineupSheet(evil) {
  const tiles = [];
  let errsAll = [];
  for (const id of ALL) {
    const { page, errs } = await open(id, { width: 640, height: 720 });
    await page.evaluate(`place(-2400, 2400); B.step(1.4, false);
      const k = ${evil ? 1 : 0}; const o = F().plush[1 - k]; o.group.visible = false;
      const p = F().plush[k]; cam(p.group.position.x, 9.6, 2.0, 26);`);
    const buf = await page.screenshot({ clip: { x: 100, y: 40, width: 440, height: 640 } });
    tiles.push({ id, b64: buf.toString('base64') });
    errsAll = errsAll.concat(errs);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 440 * 7, height: 700 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:#120d1f;display:flex;font:600 20px system-ui;color:#e8dcff">
    ${tiles.map((t) => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${t.b64}" width=440 height=640 style="display:block"><figcaption style="padding:14px 0">${evil ? 'Evil ' : ''}${t.id}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: path.join(out, evil ? 'lineup-twins.png' : 'lineup-roster.png') });
  await page.close();
  return errsAll;
}

let bad = 0;
for (const n of names) { const e = await twin(n); console.log(n, e.length ? e : 'ok'); bad += e.length; }
if (lineup) for (const ev of [false, true]) { const e = await lineupSheet(ev); console.log(ev ? 'lineup twins' : 'lineup roster', e.length ? e : 'ok'); bad += e.length; }
await browser.close();
process.exit(bad ? 1 : 0);
