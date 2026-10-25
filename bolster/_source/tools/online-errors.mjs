/* The online error paths and the network rule, in the browser:
   - offline: title → mode → select → a fight (vs CPU) makes zero requests
     and no console errors; nothing touches the network before Online
   - the real PeerJS cloud broker: hosting and joining try 0.peerjs.com
     only (and show 'Connection failed' if it can't be reached)
   - with a local PeerServer (--broker PORT): a ?room= that doesn't exist
     says 'Room not found'
   Screenshots → shots/online/.
     node tools/online-errors.mjs [--broker 9000]                         */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const broker = arg('broker', null);
const out = path.join(root, 'shots', 'online');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const base = `file://${path.join(root, 'final.html')}`;
const fails = [];
const open = async (q) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const log = { errs: [], reqs: [], ws: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errs.push(m.text()); });
  page.on('pageerror', (e) => log.errs.push(String(e)));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) log.reqs.push(u); });
  page.on('websocket', (w) => log.ws.push(w.url()));
  await page.goto(`${base}?${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
  return { page, log };
};
const step = (p, s, d = false) => p.evaluate(([s, d]) => window.__bolster.step(s, d), [s, d]);

// 1. offline: menus, select, a fight vs the computer — zero requests
{
  const { page, log } = await open('hold&webgl&noportraits');
  await page.keyboard.press('Enter'); await step(page, 0.2);
  await page.keyboard.press('KeyS'); await step(page, 0.1);
  await page.keyboard.press('KeyW'); await page.keyboard.press('Enter'); await step(page, 0.2);   // Vs Computer
  await page.keyboard.press('KeyO'); await step(page, 0.2); await page.keyboard.press('KeyO'); await step(page, 0.2);
  await page.keyboard.press('KeyO'); await step(page, 0.2);     // difficulty
  const s = await page.evaluate(() => window.__bolster.screen);
  for (let i = 0; i < 6; i++) await step(page, 5);
  const ph = await page.evaluate(() => window.__bolster.fight?.st.phase);
  console.log(`offline: screen ${s} → ${ph}; requests ${log.reqs.length}, websockets ${log.ws.length}, console errors ${log.errs.length}`);
  if (s !== 'fight') fails.push('offline: did not reach a fight');
  if (log.reqs.length || log.ws.length) fails.push(`offline made requests: ${[...log.reqs, ...log.ws].join(', ')}`);
  if (log.errs.length) fails.push(`offline console errors: ${log.errs.join(' | ')}`);
  await page.close();
}

// 2. the real cloud broker: host
{
  const { page, log } = await open('hold&webgl&noportraits');
  const before = log.reqs.length + log.ws.length;
  await page.evaluate(() => window.__bolster.net.menu()); await step(page, 0.1, true);
  await page.screenshot({ path: path.join(out, '0-online-menu.png') });
  const quiet = log.reqs.length + log.ws.length;
  await page.evaluate(() => window.__bolster.net.host());
  await page.waitForFunction(() => document.querySelector('#online-screen').dataset.state !== 'hosting' || /room=/.test(document.querySelector('#ol-link').value), null, { timeout: 30000 }).catch(() => {});
  await step(page, 0.1, true);
  const st = await page.evaluate(() => ({ state: document.querySelector('#online-screen').dataset.state, err: document.querySelector('#ol-err').textContent, link: document.querySelector('#ol-link').value }));
  await page.screenshot({ path: path.join(out, '10-public-broker-host.png') });
  const hosts = [...new Set([...log.reqs, ...log.ws].map((u) => new URL(u).host))];
  console.log(`public broker (host): before Online ${before}, on the Online menu ${quiet}; then ${JSON.stringify(st)}; contacted ${hosts.join(', ') || 'nothing'}`);
  if (before || quiet) fails.push('requests before hosting');
  if (hosts.some((h) => !/^0\.peerjs\.com(:443)?$/.test(h))) fails.push(`host contacted ${hosts}`);
  if (log.errs.length) console.log(`  (console errors on a blocked broker: ${log.errs.length} — the browser's own failed-connection lines)`);
  await page.close();
}

// 3. the real cloud broker: a guest opening a link
{
  const { page, log } = await open('room=ABCDE&hold&webgl&noportraits');
  await step(page, 0.1, true);
  await page.screenshot({ path: path.join(out, '11-public-broker-joining.png') });
  await page.waitForFunction(() => document.querySelector('#online-screen').dataset.state === 'error', null, { timeout: 40000 }).catch(() => {});
  await step(page, 0.1, true);
  const st = await page.evaluate(() => ({ state: document.querySelector('#online-screen').dataset.state, err: document.querySelector('#ol-err').textContent }));
  await page.screenshot({ path: path.join(out, '12-connection-failed.png') });
  const hosts = [...new Set([...log.reqs, ...log.ws].map((u) => new URL(u).host))];
  console.log(`public broker (guest): ${JSON.stringify(st)}; contacted ${hosts.join(', ')}`);
  if (hosts.some((h) => !/^0\.peerjs\.com(:443)?$/.test(h))) fails.push(`guest contacted ${hosts}`);
  // Play vs Computer from the error
  if (st.state === 'error') {
    await page.evaluate(() => document.querySelector('#online-screen .ol-error .opt[data-act=cpu]').click());
    await step(page, 0.2);
    const s = await page.evaluate(() => ({ screen: window.__bolster.screen, url: location.search }));
    console.log('  Play vs Computer →', JSON.stringify(s));
    if (s.screen !== 'select') fails.push('Play vs Computer fallback');
  }
  await page.close();
}

// 4. room not found (needs a broker that answers: a local PeerServer)
if (broker) {
  const { page } = await open(`room=ZZZZZ&net=peer&broker=127.0.0.1:${broker}&hold&webgl&noportraits`);
  await page.waitForFunction(() => document.querySelector('#online-screen').dataset.state === 'error', null, { timeout: 30000 }).catch(() => {});
  await step(page, 0.1, true);
  const st = await page.evaluate(() => document.querySelector('#ol-err').textContent);
  console.log(`room not found: ${st}`);
  await page.screenshot({ path: path.join(out, '13-room-not-found.png') });
  if (!/Room not found/.test(st)) fails.push('room not found message');
  await page.close();
}

await browser.close();
if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
else console.log('online error paths OK; offline makes zero requests');
process.exit(fails.length ? 1 : 0);
