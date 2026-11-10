/* Frame rate in a CPU-vs-CPU match with Kevalanche, the feel pass vs
   ?feel=old: frames drawn per second and the game's own JS time per frame
   (app.frame: sim, both plush, soft bodies, effects — not the GPU).
     node tools/feel-fps.mjs [--html final.html] [--secs 20]
   Headless SwiftShader renders on the CPU, so its fps is far below a
   laptop's; the JS time per frame is the comparable number.            */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const html = path.resolve(opt('--html', path.join(root, 'final.html'))), secs = +opt('--secs', 20);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errors = 0;
for (const q of ['', '&feel=old']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=kevalanche&p2=johnny&p1cpu=hard&cpu=hard&seed=5&noportraits${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster?.fight, null, { timeout: 240000 });
  const r = await page.evaluate((secs) => new Promise((done) => {
    const B = window.__bolster, f0 = B.frame.bind(B), ms = [];
    B.frame = (dt, d) => { const t = performance.now(); f0(dt, d); ms.push(performance.now() - t); };
    const t0 = performance.now();
    setTimeout(() => {
      const s = [...ms].sort((a, b) => a - b), el = (performance.now() - t0) / 1000;
      done({ fps: ms.length / el, mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: s[Math.floor(s.length * 0.95)], n: ms.length });
    }, secs * 1000);
  }), secs);
  console.log(`${q || 'feel'}: ${r.fps.toFixed(1)} fps drawn (SwiftShader), JS ${r.mean.toFixed(2)} ms/frame mean, ${r.p95.toFixed(2)} p95, ${r.n} frames${errs.length ? '  ERRORS ' + errs.join(' | ') : ''}`);
  errors += errs.length;
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
