/* Frame cost, one build against another (stage 3: "report frame cost before
   and after with 8 karts and in 4-way split screen"). For each page: 1 view
   and 4 views on The Landing (8 karts), 90 race frames: JS per frame
   (sim + CPUs + karts + FX + HUD), the render call's CPU time (SwiftShader:
   a CPU rasteriser, so only good for comparing builds), draws, triangles.
     node tools/framecost.mjs a.html [b.html …]                           */
import { chromium } from 'playwright';
import path from 'path';

const files = process.argv.slice(2).map((f) => path.resolve(f));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
for (const html of files) {
  for (const n of [1, 4]) {
    const q = ['p1=zach', 'p2=sumaura&alt2=1', 'p3=k8e', 'p4=kevalanche'].slice(0, n).join('&');
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await p.goto(`file://${html}?hold&webgl&noportraits&${q}&cpu=hard&seed=4&track=landing`, { timeout: 180000 });
    await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
    const r = await p.evaluate(() => {
      const A = __dh, Cp = A.cpus.find(Boolean).constructor;
      A.hv.forEach((H, j) => { const c = new Cp(A.race, H.i, 'hard', 9 + j); A.humanP[j].ctl.sample = () => c.think(); });
      A.step(4, false);
      const js = [], rd = [];
      const info = A.renderer.info;
      info.autoReset = false;
      let draws = 0, tris = 0;
      const F = 90;
      for (let i = 0; i < F; i++) {
        const t0 = performance.now();
        A.frame(1 / 60, false);
        js.push(performance.now() - t0);
        info.reset();
        const t1 = performance.now();
        A._render();
        rd.push(performance.now() - t1);
        draws += info.render.drawCalls ?? info.render.calls; tris += info.render.triangles;
      }
      info.autoReset = true;
      js.sort((a, b) => a - b); rd.sort((a, b) => a - b);
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      return { jsMean: +mean(js).toFixed(2), jsP95: +js[Math.floor(F * 0.95)].toFixed(2), renderP50: +rd[F >> 1].toFixed(1), draws: Math.round(draws / F), tris: Math.round(tris / F) };
    });
    out[`${path.basename(html)} ${n} view${n > 1 ? 's' : ''}`] = r;
    console.log(path.basename(html), n, JSON.stringify(r));
    await p.close();
  }
}
await browser.close();
console.table(out);
