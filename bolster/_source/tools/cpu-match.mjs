/* A whole CPU-vs-CPU match in the browser (headless Chromium, WebGL 2 on
   SwiftShader): the real page, the real loop — sim, both CPUs, both plush
   soft bodies, the HUD, banners, the winner screen and its bubble — stepped
   to the end. Fails on any console error, any network request, a soft body
   that went non-finite, or a match that doesn't finish.

     node tools/cpu-match.mjs [p1] [p2] [p1level] [p2level] [seed]       */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [p1 = 'rubberta', p2 = 'k8e', l1 = 'hard', l2 = 'normal', seed = '23'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errs.push('network request: ' + r.url()); });
const t0 = Date.now();
await page.goto(`file://${path.join(root, 'final.html')}?p1=${p1}&p2=${p2}&p1cpu=${l1}&cpu=${l2}&seed=${seed}&hold&webgl&noportraits`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster?.fight, null, { timeout: 240000 });
const log = [];
let done = false, s;
for (let k = 0; k < 120 && !done; k++) {
  // five seconds of the game per call, drawing one frame of it
  s = await page.evaluate(() => {
    const B = window.__bolster;
    B.step(5, true);
    const st = B.fight.st;
    const nan = B.fight.plush.reduce((n, p) => n + (p.soft.nanResets || 0), 0);
    return { screen: B.screen, phase: st.phase, round: st.round, wins: st.wins, hp: st.f.map((f) => f.hp), tick: st.tick, nan, banner: document.querySelector('#banner').textContent };
  });
  log.push(s);
  if (s.screen === 'win') done = true;
}
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
await page.evaluate(() => window.__bolster.step(1.5, true));
await page.waitForTimeout(500);
await page.screenshot({ path: process.env.SHOT || path.join(root, 'shots', 'cpu-match-end.png'), timeout: 240000 });
const end = await page.evaluate(() => {
  const B = window.__bolster, st = B.fight.st;
  return { screen: B.screen, winner: st.winner, wins: st.wins, ticks: st.tick, seconds: (st.tick / 60).toFixed(1), name: document.querySelector('#win-name').textContent, line: document.querySelector('#bubbles .bubble svg')?.getAttribute('aria-label') ?? null };
});
await browser.close();
for (const l of log) console.log(JSON.stringify(l));
console.log('end', JSON.stringify(end));
console.log(`wall ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const nan = log.some((l) => l.nan > 0);
if (errs.length) console.log('ERRORS:\n  ' + errs.join('\n  '));
const ok = done && !errs.length && !nan && end.screen === 'win' && end.line;
console.log(ok ? 'CPU vs CPU match completed: zero console errors' : 'FAILED');
process.exit(ok ? 0 : 1);
