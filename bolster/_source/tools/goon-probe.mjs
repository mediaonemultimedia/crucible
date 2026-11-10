/* The hockey goon's mullet in a real match: a Hard-v-Hard CPU mirror (both
   seats the goon) for 40 s of play, every frame checking every lock: no NaN,
   no lock point inside the torso (the padded ellipsoid less 0.08: the fur's
   depth), the spring offset's spread, and the mullet's CPU cost per update.

     node tools/goon-probe.mjs [final.html]                              */
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`file://${(process.argv[2] || new URL('../final.html', import.meta.url).pathname)}?p1=kevalanche&alt1=1&p2=kevalanche&alt2=1&cpu=hard&p1cpu=hard&hold&noportraits&novs&seed=3`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const B = window.__bolster; const out = { maxO: 0, nan: 0, inside: 0, samples: 0, ms: 0, n: 0 };
  for (let f = 0; f < 60 * 40; f++) {
    B.frame(1 / 60, false);
    for (const p of B.fight.plush) {
      const M = p.twin?.mullet; if (!M) continue;
      const t0 = performance.now(); M.update(0); out.ms += performance.now() - t0; out.n++;
      const BR = p.soft.cloudR[0], BC = p.soft.cloudC[0], E = M.torso;
      for (const K of M.locks) {
        out.maxO = Math.max(out.maxO, K.o.length()); (out.h ??= [0,0,0,0,0,0,0,0])[Math.min(7, Math.floor(K.o.length() / 0.1))]++;
        for (const v of K.pos) if (!Number.isFinite(v)) out.nan++;
        for (const q of K.cur) {
          const ax = q.x - BC[0], ay = q.y - BC[1], az = q.z - BC[2];
          const lx = BR[0]*ax+BR[3]*ay+BR[6]*az - E.c[0], ly = BR[1]*ax+BR[4]*ay+BR[7]*az - E.c[1], lz = BR[2]*ax+BR[5]*ay+BR[8]*az - E.c[2];
          const d = Math.hypot(lx / (E.r[0] - 0.08), ly / (E.r[1] - 0.08), lz / (E.r[2] - 0.08)); out.samples++; if (d < 1) out.inside++;
        }
      }
    }
  }
  out.ms /= out.n; out.phase = B.fight.st.phase; out.hp = B.fight.st.f.map((f) => f.hp);
  return out;
});
console.log(JSON.stringify(r), errs.length ? errs : 'no errors');
await browser.close();
process.exit(errs.length || r.nan || r.inside ? 1 : 0);
