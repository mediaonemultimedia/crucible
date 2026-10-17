/* An opponent who vanishes mid-match: the host pauses, counts down
   'Waiting for opponent (10s)', then goes back to the online menu with
   'Your opponent disconnected.' (local loopback; screenshots → shots/online/) */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots', 'online');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const base = `file://${path.join(root, 'final.html')}`;
const errs = [];
const live = async (url) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(url); await p.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 }); return p; };
const step = (p, s, d = false) => p.evaluate(([s, d]) => window.__bolster.step(s, d), [s, d]);
const A = await live(`${base}?net=local&hold&webgl&noportraits`);
await A.evaluate(() => window.__bolster.net.host());
await A.waitForFunction(() => /room=/.test(document.querySelector('#ol-link').value));
const code = await A.evaluate(() => document.querySelector('#ol-code').textContent);
const B = await live(`${base}?room=${code}&net=local&hold&webgl&noportraits`);
await A.waitForFunction(() => window.__bolster.screen === 'select', null, { timeout: 20000 });
await A.keyboard.press('KeyO'); await B.keyboard.press('KeyO');
for (let i = 0; i < 6; i++) { await step(A, 0.2); await step(B, 0.2); }
await A.waitForFunction(() => window.__bolster.fight?.session, null, { timeout: 20000 });
for (let i = 0; i < 30; i++) { await step(A, 0.1); await step(B, 0.1); }
await B.close();                      // the guest's tab is gone
await step(A, 3, true);
const w = await A.evaluate(() => ({ wait: document.body.classList.contains('netwait'), msg: document.querySelector('#netwait-msg').textContent, paused: window.__bolster.fight?.paused }));
await A.screenshot({ path: path.join(out, '14-waiting-for-opponent.png') });
await step(A, 10, true);
const e = await A.evaluate(() => ({ screen: window.__bolster.screen, state: document.querySelector('#online-screen').dataset.state, msg: document.querySelector('#ol-err').textContent }));
await A.screenshot({ path: path.join(out, '15-opponent-disconnected.png') });
await browser.close();
console.log(JSON.stringify({ w, e, errs }));
const ok = w.wait && /Waiting for opponent \(\d+s\)/.test(w.msg) && w.paused && e.screen === 'online' && e.state === 'error' && !errs.length;
console.log(ok ? 'disconnect mid-match: paused, counted down, back to the menu' : 'FAILED');
process.exit(ok ? 0 : 1);
