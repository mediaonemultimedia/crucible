/* The model pass's evidence (bolster-models): close-ups of the remodelled
   wolf, the crow's body-to-tail, the panda's and leopard's muzzles next to
   Kevalanche's, from any build.

     node tools/models-shots.mjs [--html final.html] [--out shots/models] [--tag after] [scene …]

   scenes: wolf (front close-up at the reference's angle, OG and ALT),
           wolf-play (idle, mid-attack, hit, K.O. at the gameplay camera, OG and ALT),
           crow (side view of body and tail, OG and ALT; mid-attack),
           muzzles (panda, leopard, Kevalanche: muzzle close-ups, OG and ALT)
   WebGL 2 on SwiftShader; prints console errors, exits 1 on any.          */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'models')));
const tag = opt('--tag', 'after');
fs.mkdirSync(out, { recursive: true });
const scenes = args.length ? args : ['wolf', 'wolf-play', 'crow', 'muzzles'];

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
  window.cam = (x, d = 11.5, ty = 1.8, fov = 26, az = 0) => {
    const c = B.stage.camera;
    c.aspect = innerWidth / innerHeight; c.fov = fov; c.position.set(x + d * Math.sin(az), ty + 0.35, d * Math.cos(az)); c.lookAt(x, ty, 0); c.updateProjectionMatrix();
    B.stage.update(0);
    B.renderer.render(B.stage.scene, c);
  };
  window.press = (mask, side = 1, n = 2) => { let i = 0; F().override = () => { i++; const m = i <= n ? mask : 0; return side ? [0, m] : [m, 0]; }; };
`;

async function open(q, vp = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?${q}&hold&noportraits&seed=7`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`until(() => ST().phase === 'fight', 8); F().cpu = [null, null]; F().override = () => [0, 0]; B.step(0.5, false); document.querySelector('#ui').style.visibility = 'hidden';`);
  return { page, errs };
}

let bad = 0;
const done = (name, errs) => { console.log(name, errs.length ? errs : 'ok'); bad += errs.length; };

/* a front close-up, turned a little to the camera like the reference (the
   other fighter hidden), the camera swung round by az (radians, toward
   the side he faces) */
async function portrait(id, file, { alt = false, az = 0.85, d = 7.4, ty = 1.75, fov = 26 } = {}) {
  const { page, errs } = await open(`p1=${id}&p2=kevalanche${alt ? '&alt1=1' : ''}`, { width: 1024, height: 900 });
  await page.evaluate(`place(-1500, 2600); const p = F().plush[0]; F().plush[1].group.visible = false; B.step(1.6, false);
    cam(p.group.position.x, ${d}, ${ty}, ${fov}, ${az});`);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
  return errs;
}

for (const sc of scenes) {
  if (sc === 'wolf') {
    for (const alt of [false, true]) {
      const v = alt ? 'alt' : 'og';
      done(`wolf ${v}`, await portrait('sebas', `wolf-${v}-front-${tag}.png`, { alt, d: 9.6, ty: 1.95 }));
      done(`wolf ${v} 3q`, await portrait('sebas', `wolf-${v}-3q-${tag}.png`, { alt, az: 0.2, d: 9.6, ty: 1.95 }));
    }
  }
  if (sc === 'wolf-head') for (const alt of [false, true]) done('wolf head', await portrait('sebas', `wolf-${alt ? 'alt' : 'og'}-head-${tag}.png`, { alt, d: 5.2, ty: 2.65, az: 0.85 }));
  if (sc === 'wolf-quick') done('wolf quick', await portrait('sebas', `wolf-og-front-${tag}.png`, { d: 9.6, ty: 1.95 }));
  if (sc === 'wolf-play') {
    for (const alt of [false, true]) {
      const v = alt ? 'alt' : 'og';
      const { page, errs } = await open(`p1=kevalanche&p2=sebas${alt ? '&alt2=1' : ''}`);
      const shot = (n) => page.screenshot({ path: path.join(out, `wolf-${v}-${n}-${tag}.png`) });
      await page.evaluate(`place(-1900, 1900); B.step(1.0, false); cam(0, 13, 1.9);`);
      await shot('idle');
      await page.evaluate(`press(32, 1); if (!until(() => ST().f[1].act === 'attack' && ST().f[1].t >= 14, 2)) throw new Error('no swing'); cam(0, 13, 1.9);`);
      await shot('attack');
      await page.evaluate(`F().override = () => [0, 0]; B.step(1.2, false); place(-2600, 2600); ST().f[1].meter = 100000; press(64, 1, 3); until(() => ST().f[1].act === 'attack' && ST().f[1].t >= 16, 2); cam(F().plush[1].group.position.x - 0.8, 11, 1.9);`);
      await shot('special');
      await page.evaluate(`F().override = () => [0, 0]; B.step(1.5, false); place(-900, 900); press(32, 0); until(() => (ST().f[1].hs|0) > 0 || ST().f[1].act === 'hitstun', 2); B.step(0.06, false); cam(F().plush[1].group.position.x - 0.6, 9.5, 1.9);`);
      await shot('hit');
      await page.evaluate(`F().override = () => [0, 0]; B.step(1.2, false); place(-900, 900); ST().f[1].hp = 1; press(32, 0); B.step(2.2, false); cam(F().plush[1].group.position.x - 0.4, 11, 1.2);`);
      await shot('ko');
      await page.close();
      done(`wolf-play ${v}`, errs);
    }
  }
  if (sc === 'crow') {
    for (const alt of [false, true]) {
      const v = alt ? 'alt' : 'og';
      // side on: the body, the tail behind it
      done(`crow ${v} side`, await portrait('zach', `crow-${v}-side-${tag}.png`, { alt, az: -0.75, d: 7.6, ty: 1.3 }));
      done(`crow ${v} back3q`, await portrait('zach', `crow-${v}-back3q-${tag}.png`, { alt, az: -1.6, d: 7.6, ty: 1.3 }));
    }
    const { page, errs } = await open('p1=kevalanche&p2=zach');
    await page.evaluate(`place(-1900, 1900); B.step(1.0, false); press(32, 1); until(() => ST().f[1].act === 'attack' && ST().f[1].t >= 14, 2); cam(F().plush[1].group.position.x - 0.5, 9.5, 1.6);`);
    await page.screenshot({ path: path.join(out, `crow-attack-${tag}.png`) });
    await page.close();
    done('crow attack', errs);
  }
  if (sc === 'muzzles') {
    for (const id of ['sumaura', 'johnny', 'kevalanche']) {
      for (const alt of [false, true]) {
        const v = alt ? 'alt' : 'og';
        const ty = id === 'johnny' ? 2.45 : id === 'sumaura' ? 2.3 : 2.45;
        done(`muzzle ${id} ${v}`, await portrait(id, `muzzle-${id}-${v}-${tag}.png`, { alt, az: 0.7, d: 4.6, ty, fov: 24 }));
      }
    }
  }
}
/* side-by-side sheets from the shots already taken (before / after) */
async function sheet(file, cols, title) {
  const page = await browser.newPage({ viewport: { width: 640 * cols.length, height: 640 }, deviceScaleFactor: 1 });
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  await page.setContent(`<body style="margin:0;background:#120d1f;font:600 18px system-ui;color:#e8dcff">
    <div style="padding:10px 14px">${title}</div><div style="display:flex">
    ${cols.map(([f, cap]) => `<figure style="margin:0;width:640px;text-align:center"><img src="${img(f)}" style="width:620px;height:540px;object-fit:contain;display:block;margin:0 auto"><figcaption style="padding:8px">${cap}</figcaption></figure>`).join('')}</div></body>`);
  await page.screenshot({ path: path.join(out, file), fullPage: true });
  await page.close();
}
if (scenes.includes('compare')) {
  const o = (n) => path.join(out, n);
  await sheet('compare-wolf-reference.png', [[path.join(root, 'assets/refs/wolf-plush-ref.png'), 'owner\'s reference'], [o('wolf-og-front-before.png'), 'before'], [o('wolf-og-front-after.png'), 'after (OG)'], [o('wolf-alt-front-after.png'), 'after (ALT)']], 'Sebas Perra: the reference, before, after');
  await sheet('compare-crow-side.png', [[o('crow-og-side-before.png'), 'before'], [o('crow-og-side-after.png'), 'after'], [o('crow-og-back3q-before.png'), 'before, from behind'], [o('crow-og-back3q-after.png'), 'after, from behind']], 'Zach Sparrow: body into tail');
  for (const v of ['og', 'alt']) {
    await sheet(`compare-muzzles-${v}.png`, [[o(`muzzle-kevalanche-${v}-after.png`), 'Kevalanche (benchmark, unchanged)'], [o(`muzzle-sumaura-${v}-before.png`), 'Sumaura before'], [o(`muzzle-sumaura-${v}-after.png`), 'Sumaura after'], [o(`muzzle-johnny-${v}-before.png`), 'Johnny before'], [o(`muzzle-johnny-${v}-after.png`), 'Johnny after']], `Muzzles (${v.toUpperCase()})`);
  }
  console.log('compare sheets ok');
}
await browser.close();
process.exit(bad ? 1 : 0);
