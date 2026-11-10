/* Kevalanche ALT (the hockey goon): the look pass's evidence.

     node tools/goon-shots.mjs [--html final.html] [--out shots/goon/after] [--q '&feel=old'] [scene …]

   Scenes: head-front, head-back (three-quarter back: the mullet), gloves,
   idle, heavy (mid heavy hook), hit, ko, walk (three frames), motion
   (the locks through a heavy hook and a jump, every 4 frames), vs-og,
   vs-rubberta. Player 1 is the goon (alt1=1). WebGL 2 on SwiftShader;
   prints console errors, exits 1 on any. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'goon', 'after')));
const Q = opt('--q', '');
fs.mkdirSync(out, { recursive: true });
const ALL = ['head-front', 'head-back', 'gloves', 'idle', 'heavy', 'hit', 'ko', 'walk', 'motion', 'vs-og', 'vs-rubberta'];
const scenes = args.length ? args : ALL;

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
  window.look = (px, py, pz, tx, ty, tz, fov = 26) => {
    const c = B.stage.camera;
    c.aspect = innerWidth / innerHeight; c.fov = fov; c.position.set(px, py, pz); c.lookAt(tx, ty, tz); c.updateProjectionMatrix();
    B.stage.update(0);
    B.renderer.render(B.stage.scene, c);
  };
  window.cam = (x, d = 11.5, ty = 1.8, fov = 26) => look(x, ty + 1.1, d, x, ty, 0, fov);
  window.press = (mask, side = 1, n = 2) => { let i = 0; F().override = () => { i++; const m = i <= n ? mask : 0; return side ? [0, m] : [m, 0]; }; };
  window.G = () => F().plush[0];
  window.head = () => { const p = G(); const h = p.twin?.head || null; return h; };
`;

async function open(p2, alt2 = 0) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=kevalanche&alt1=1&p2=${p2}&alt2=${alt2}&hold&noportraits&novs&seed=7${Q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`until(() => ST().phase === 'fight', 8); F().cpu = [null, null]; F().override = () => [0, 0]; B.step(0.5, false); document.querySelector('#ui').style.visibility = 'hidden';`);
  return { page, errs };
}

let bad = 0;
const { page, errs } = await open('rubberta');
const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`) });
for (const s of scenes) {
  if (s === 'vs-og' || s === 'vs-rubberta') continue;
  await page.evaluate(`F().override = () => [0, 0]; ST().f[0].hp = ST().f[1].hp = 9999; B.step(1.2, false);`);
  if (s === 'head-front') {
    await page.evaluate(`place(-1300, 1300); B.step(1.0, false); const x = G().group.position.x; look(x + 1.3, 3.2, 4.2, x + 0.15, 2.75, 0, 24);`);
    await shot(s);
  } else if (s === 'head-back') {
    await page.evaluate(`place(-1300, 1300); B.step(1.0, false); const x = G().group.position.x; look(x - 3.6, 3.4, 1.4, x, 2.45, 0, 26);`);
    await shot(s);
    await page.evaluate(`const x = G().group.position.x; look(x - 3.9, 3.0, -1.6, x, 2.4, 0, 26);`);
    await shot(s + '-2');
  } else if (s === 'gloves') {
    await page.evaluate(`place(-1300, 1300); B.step(1.0, false); const x = G().group.position.x; look(x + 2.0, 2.6, 3.4, x + 0.6, 1.95, 0.2, 26);`);
    await shot(s);
  } else if (s === 'idle') {
    await page.evaluate(`place(-1200, 1200); B.step(0.8, false); cam((G().group.position.x + F().plush[1].group.position.x) / 2, 12, 1.9);`);
    await shot(s);
  } else if (s === 'heavy') {
    await page.evaluate(`place(-1200, 1200); B.step(0.3, false); press(32, 0); if (!until(() => ST().f[0].act === 'attack' && ST().f[0].t >= 15, 2)) throw new Error('no swing'); cam(G().group.position.x + 0.9, 9.5, 1.9);`);
    await shot(s);
  } else if (s === 'hit') {
    await page.evaluate(`place(-900, 900); B.step(0.3, false); press(32, 1); until(() => ST().f[0].act === 'hit' || ST().f[0].act === 'stun' || (ST().f[0].hs|0) > 0, 2); B.step(0.06, false); cam(G().group.position.x + 0.6, 9.5, 1.9);`);
    await shot(s);
  } else if (s === 'ko') {
    await page.evaluate(`place(-900, 900); B.step(0.3, false); ST().f[0].hp = 1; press(32, 1); B.step(2.2, false); cam(G().group.position.x + 0.4, 11, 1.2);`);
    await shot(s);
    await page.evaluate(`look(G().group.position.x - 3, 3, 5, G().group.position.x, 0.9, 0, 30);`);
    await shot(s + '-2');
  } else if (s === 'motion') {
    // the locks' secondary motion: a heavy hook and a jump's landing, every
    // 4 frames, from behind his shoulder (one sheet each)
    for (const [name, mask] of [['heavy', 32], ['jump', 4]]) {
      await page.evaluate(`place(-1200, 1200); B.step(0.6, false); press(${mask}, 0);`);
      const tiles = [];
      for (let k = 0; k < 12; k++) {
        await page.evaluate(`for (let i = 0; i < 4; i++) B.frame(1/60, false); const x = G().group.position.x; const gy = G().group.position.y; look(x - 3.4, 3.0 + gy, -1.2, x, 2.2 + gy, 0, 30);`);
        tiles.push((await page.screenshot({ clip: { x: 340, y: 60, width: 600, height: 600 } })).toString('base64'));
      }
      const sheet = await browser.newPage({ viewport: { width: 1800, height: 600 }, deviceScaleFactor: 1 });
      await sheet.setContent(`<body style="margin:0;display:flex;flex-wrap:wrap;background:#000">${tiles.map((b) => `<img src="data:image/png;base64,${b}" style="width:300px;height:300px">`).join('')}</body>`);
      await sheet.screenshot({ path: path.join(out, `motion-${name}.png`) });
      await sheet.close();
    }
  } else if (s === 'walk') {
    await page.evaluate(`place(-2600, 2600); B.step(0.3, false); F().override = () => [2, 0];`);
    for (let k = 0; k < 3; k++) {
      await page.evaluate(`B.step(${k ? 0.13 : 0.6}, false); cam(G().group.position.x + 0.3, 9.5, 1.9);`);
      await shot(`${s}-${k}`);
    }
  }
}
console.log('goon page', errs.length ? errs : 'ok'); bad += errs.length;
await page.close();

for (const [n, p2, alt] of [['vs-og', 'kevalanche', 0], ['vs-rubberta', 'rubberta', 0]]) {
  if (!scenes.includes(n)) continue;
  const o = await open(p2, alt);
  await o.page.evaluate(`place(-700, 700); B.step(1.6, false); cam((G().group.position.x + F().plush[1].group.position.x) / 2, 9.2, 2.0);`);
  await o.page.screenshot({ path: path.join(out, `${n}.png`) });
  console.log(n, o.errs.length ? o.errs : 'ok'); bad += o.errs.length;
  await o.page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
