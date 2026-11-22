/* A tour of a track in a race (the player's kart on autopilot): a
   screenshot at each named section, for looking at the world critically.
     node tools/tour.mjs <track> [outdir]                                 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const track = process.argv[2] || 'laundry';
const out = path.resolve(process.argv[3] || path.join(root, 'shots', 'tracks'));
fs.mkdirSync(out, { recursive: true });
const html = process.env.HTML || path.join(root, 'final.html');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('NETWORK ' + r.url()); });
await page.goto(`file://${html}?hold&webgl&noportraits&p1=zach&p1cpu=hard&seed=5&track=${track}`);
await page.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
const SECTIONS = { landing: ['books', 'underbed', 'banister', 'drawer'], laundry: ['ramp', 'belt', 'suds', 'bulge', 'pods', 'socks', 'cut'], park: ['hose', 'patio', 'pool', 'ramp', 'deck', 'lawn'] }[track] || [];
const done = new Set();
await page.evaluate(() => { const A = __dh; if (A.T.cut) { A.cpus[A.me].cutPlan = true; } });
for (let s = 0; s < 75 * 4 && done.size < SECTIONS.length; s++) {
  const tag = await page.evaluate(() => { const A = __dh; A.step(0.25, false); const K = A.race.karts[A.me]; if (A.T.cut && A.cpus[A.me]) A.cpus[A.me].cutPlan = true; return K.cut && K.drum > 0.3 ? 'cut' : A.T.def.points[A.T.sec[K.k]].tag; });
  if (SECTIONS.includes(tag) && !done.has(tag)) {
    done.add(tag);
    await page.evaluate(() => __dh.step(0.3));
    await page.screenshot({ path: path.join(out, `${track}-${tag}.png`) });
    console.log('shot', tag);
  }
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
