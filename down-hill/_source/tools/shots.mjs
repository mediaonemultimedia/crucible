/* Evidence screenshots of final.html (or HTML=…) in headless Chromium
   (WebGL 2 on SwiftShader) → shots/<name>.png.
     node tools/shots.mjs [scene …]      (no args: all of them)
   Scenes: select, grid, drift, items (one per item, mid-effect), underbed,
   banister, podium, karts (each of the 14 karts posed: karts-<id>[-alt]).  */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = process.env.HTML || path.join(root, 'final.html');
const outDir = path.join(root, 'shots');
fs.mkdirSync(outDir, { recursive: true });
const want = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

async function open(q, w = 1280, h = 720) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`${q}: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`${q}: pageerror ${e.message}`));
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${q}: NETWORK ${r.url()}`); });
  await p.goto('file://' + html + q);
  await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
  return p;
}
const snap = async (p, name) => { await p.waitForTimeout(150); await p.screenshot({ path: path.join(outDir, name + '.png'), timeout: 240000 }); console.log('shot', name); };

const SCENES = {
  async select() {
    const p = await open('?hold&webgl&screen=select');
    await p.evaluate(async () => { await __dh.portraits(); __dh.pick(3); __dh.step(1.2); });
    await snap(p, 'select'); await p.close();
  },
  async karts() {
    const p = await open('?hold&webgl&screen=select&noportraits');
    const ids = await p.evaluate(() => (window.SLOTS_ = null, 14));
    for (let i = 0; i < ids; i++) {
      const name = await p.evaluate((i) => { __dh.pick(i); __dh.turnA = 0.55; __dh.step(1 / 60); __dh.turnA = 0.55; __dh.step(1 / 60); const v = __dh.turn; return `karts-${v.id}${v.alt ? '-alt' : ''}`; }, i);
      await snap(p, name);
    }
    await p.close();
  },
  async grid() {
    const p = await open('?hold&webgl&p1=sebas&cpu=normal&seed=4');
    await p.evaluate(() => __dh.step(3.0));
    await snap(p, 'grid'); await p.close();
  },
  async drift() {
    const p = await open('?hold&webgl&p1=k8e&p1cpu=hard&seed=7');
    // run until the player's kart is in a tier-3 drift
    const ok = await p.evaluate(() => {
      const A = __dh, K = () => A.race.karts[A.me];
      for (let n = 0; n < 60 * 120; n++) { A.frame(1 / 60, false); if (K().drift && K().tier === 3 && !K().air) { A.step(0.1); return true; } }
      return false;
    });
    if (!ok) problems.push('drift: no tier-3 drift found');
    await snap(p, 'drift'); await p.close();
  },
  async items() {
    for (const it of ['slick', 'missile', 'espresso', 'cuffs', 'case', 'alarm']) {
      const p = await open('?hold&webgl&p1=johnny&cpu=normal&seed=12');
      const r = await p.evaluate((it) => window.__dh.shotItem(it), it);
      if (!r) problems.push(`items: ${it} not staged`);
      await snap(p, `item-${it}`); await p.close();
    }
  },
  async underbed() {
    const p = await open('?hold&webgl&p1=rubberta&p1cpu=hard&seed=5');
    await p.evaluate(() => { const A = __dh, T = A.race.T, K = () => A.race.karts[A.me]; for (let n = 0; n < 60 * 120; n++) { A.frame(1 / 60, false); if (T.def.points[T.sec[K().k]].tag === 'underbed' && K().x > -60) { A.step(0.4); return; } } });
    await snap(p, 'underbed'); await p.close();
  },
  async banister() {
    const p = await open('?hold&webgl&p1=zach&p1cpu=hard&seed=6');
    await p.evaluate(() => { const A = __dh, T = A.race.T, K = () => A.race.karts[A.me]; for (let n = 0; n < 60 * 120; n++) { A.frame(1 / 60, false); if (T.def.points[T.sec[K().k]].tag === 'banister' && K().x > 230) { A.step(0.3); return; } } });
    await snap(p, 'banister'); await p.close();
  },
  async podium() {
    const p = await open('?hold&webgl&p1=sumaura&p1cpu=hard&seed=9&laps=1');
    await p.evaluate(() => { const A = __dh; for (let n = 0; n < 60 * 150 && A.screen === 'race'; n++) A.frame(1 / 60, false); A.step(2.5); });
    await snap(p, 'podium'); await p.close();
  },
};

for (const [name, f] of Object.entries(SCENES)) if (!want.length || want.includes(name)) {
  try { await f(); } catch (e) { problems.push(`${name}: ${e.message}`); }
}
await browser.close();
console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'no console errors, no network');
process.exit(problems.length ? 1 : 0);
