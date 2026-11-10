/* Frame rate in a CPU-vs-CPU match with Kevalanche, the feel pass vs
   ?feel=old: frames drawn per second and the game's own JS time per frame
   (app.frame: sim, both plush, soft bodies, effects — not the GPU).
     node tools/feel-fps.mjs [--html final.html]
   Headless SwiftShader draws the fur on the CPU (well under 1 fps), so
   the measure is the game's CPU work per 60 Hz frame with drawing skipped
   (sim, AI, both plush and their soft bodies, effects): 1200 frames, held
   loop, against a 16.7 ms budget. The GPU's share needs real hardware.   */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errors = 0;
for (const q of ['', '&feel=old']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?p1=kevalanche&p2=johnny&p1cpu=hard&cpu=hard&seed=5&noportraits&hold&webgl${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster?.fight, null, { timeout: 240000 });
  const r = await page.evaluate(() => {
    const B = window.__bolster, ms = [];
    for (let i = 0; i < 1500; i++) { const t = performance.now(); B.frame(1 / 60, false); if (i >= 300) ms.push(performance.now() - t); }
    const s = [...ms].sort((a, b) => a - b);
    return { mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], n: ms.length, fps: 1000 / (ms.reduce((a, b) => a + b, 0) / ms.length) };
  });
  console.log(`${q || 'feel'}: CPU ${r.mean.toFixed(2)} ms/frame mean, ${r.p95.toFixed(2)} p95, ${r.max.toFixed(1)} max over ${r.n} frames (${r.fps.toFixed(0)} fps of CPU headroom)${errs.length ? '  ERRORS ' + errs.join(' | ') : ''}`);
  errors += errs.length;
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
