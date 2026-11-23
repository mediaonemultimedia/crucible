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
const ALL = process.argv.includes('--all');   // a shot at every waypoint (stage 3's before / after pass)
const SECTIONS = { landing: ['books', 'underbed', 'banister', 'drawer'], laundry: ['ramp', 'belt', 'suds', 'bulge', 'pods', 'socks', 'cut'], park: ['hose', 'patio', 'pool', 'ramp', 'deck', 'lawn'] }[track] || [];
const done = new Set();
await page.evaluate(() => { const A = __dh; if (A.T.cut) { A.cpus[A.me].cutPlan = true; } });
const nPts = await page.evaluate(() => __dh.T.def.points.length);
for (let s = 0; s < (ALL ? 1200 : 300) && (ALL ? done.size < nPts : done.size < SECTIONS.length); s++) {
  const [tag, sec] = await page.evaluate((all) => { const A = __dh; A.step(all ? 0.1 : 0.25, false); const K = A.race.karts[A.me]; if (A.T.cut && A.cpus[A.me]) A.cpus[A.me].cutPlan = true; return [K.cut && K.drum > 0.3 ? 'cut' : A.T.def.points[A.T.sec[K.k]].tag, K.fish ? -1 : A.T.sec[K.k]]; }, ALL);
  if (ALL ? sec >= 0 && !done.has(sec) : SECTIONS.includes(tag) && !done.has(tag)) {
    done.add(ALL ? sec : tag);
    await page.evaluate(() => __dh.step(0.3));
    const name = ALL ? `${track}-${String(sec).padStart(2, '0')}-${tag}.png` : `${track}-${tag}.png`;
    await page.screenshot({ path: path.join(out, name) });
    console.log('shot', name);
  }
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
