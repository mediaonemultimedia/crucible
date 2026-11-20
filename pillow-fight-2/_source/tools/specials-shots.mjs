/* Every motion special mid-move → shots/specials/<fighter>-<L|H>.png
     node tools/specials-shots.mjs [fighter …] [--alt]                    */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots/specials');
fs.mkdirSync(out, { recursive: true });
const args = process.argv.slice(2), alt = args.includes('--alt');
const L = 1, R = 2, UP = 4, O = 16, P = 32, C = 512;
// player 1 faces right
const MOTION = {
  kevalanche: (b) => [C, C, C | R, R, R | b],
  johnny: (b) => [C, C, C | L, L, L | b],
  k8e: (b) => [L, L | C, C, C | R, R, R | b],
  rubberta: (b) => [R, R | C, C, C | L, L, L | b],
  sumaura: (b) => [L, L, 0, R | b],
  zach: (b) => [...Array(46).fill(C), UP | b],
  sebas: (b) => [...Array(46).fill(L), R | b],
};
// [the tick into the move to show, the opponent, the distance]
const SHOW = {
  kevalanche: { L: [24, 'johnny', 7000], H: [20, 'johnny', 7000] },
  johnny: { L: [10, 'kevalanche', 7000], H: [24, 'kevalanche', 7000] },
  k8e: { L: [18, 'sumaura', 4800], H: [24, 'sumaura', 6600] },
  rubberta: { L: [20, 'kevalanche', 5600], H: [26, 'kevalanche', 7000] },
  sumaura: { H: [22, 'johnny', 6000] },
  zach: { H: [20, 'kevalanche', 6000] },
  sebas: { L: [20, 'k8e', 6000], H: [26, 'k8e', 6000] },
};
const ids = args.filter((a) => !a.startsWith('--'));
const list = ids.length ? ids : Object.keys(SHOW);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errs = 0;
for (const id of list) {
  for (const v of Object.keys(SHOW[id])) {
    const [t, opp, dist] = SHOW[id][v];
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const E = [];
    page.on('console', (m) => { if (m.type() === 'error') E.push(m.text()); });
    page.on('pageerror', (e) => E.push('pageerror: ' + e.message));
    await page.goto(`file://${path.join(root, 'final.html')}?p1=${id}&p2=${opp}&cpu=normal&seed=7&hold&webgl&noportraits${alt ? '&alt1=1' : ''}`);
    await page.waitForFunction(() => window.__pf2 && window.__pf2.fight, null, { timeout: 120000 });
    const masks = MOTION[id](v === 'L' ? O : P);
    const r = await page.evaluate(({ masks, t, dist, mv }) => {
      const A = window.__pf2, F = () => A.fight, ST = () => A.fight.st;
      A._vsEnd(true);
      for (let i = 0; i < 400 && ST().phase !== 'fight'; i++) A.frame(1 / 60, false);
      F().cpu = [null, null];
      const place = () => { const s = ST(); s.f[0].x = -dist / 2; s.f[1].x = dist / 2; s.f[0].z = s.f[1].z = 0; F().prev = s.f.map((q) => ({ x: q.x, y: q.y, z: q.z })); };
      place();
      let i = 0;
      F().override = () => [masks[i++] ?? 0, 0];
      for (let n = 0; n < 200; n++) {
        A.frame(1 / 60, false);
        if (i === masks.length - 1 && masks.length > 10) place();
        const f = ST().f[0];
        if (f.mv === mv && f.t >= t) break;
      }
      A.step(0.02);
      const f = ST().f[0];
      return { mv: f.mv, t: f.t, proj: ST().proj.length };
    }, { masks, t, dist, mv: v === 'L' ? 'mspL' : 'mspH' });
    const file = path.join(out, `${id}${alt ? '-alt' : ''}-${v}.png`);
    await page.screenshot({ path: file });
    console.log(file, JSON.stringify(r), E.length ? E.join(' | ') : 'ok');
    errs += E.length;
    await page.close();
  }
}
await browser.close();
process.exit(errs ? 1 : 0);
