/* The bounce-and-squish repro (Kevin: "when the connection isn't great, the
   characters are bouncing up and down, like they're getting squished,
   repeatedly, and it just doesn't end").

   The real page, an 8-kart race (the player's kart on a CPU), two phones
   paired over the local transport with a bad link (300 ms jitter, 15 % of
   input packets lost). The game's own frame(dt) is driven with the frame
   times a hitch produces (SwiftShader can't hold real time here, so the
   frames are stepped: the page's loop does exactly this, frame(elapsed),
   clamped to 0.1 in main.js):
     t = 0–2 s  60 fps
     t = 2 s    every kart is hit and lands hard (kart squash, driver crunch),
                and the frames go slow: 85 ms each for 5 s
     t = 3 s    phone 1 drops out for 3 s; then it reconnects (reloads)
     t = 7 s    frames recover (60 fps); recorded until t = 10 s
   Each frame records the near karts' spring states (kart body squash, the
   driver's crunch) and the kart body's drawn scale. Before the fix the stiff springs gain energy on every slow
   frame (the kart squashes and stretches every frame, up to its clamp); after
   it they decay.
     node tools/bounce-repro.mjs [--html final.html] [--out shots/bounce/x.json]   */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(arg('html', path.join(root, 'final.html')));
const outFile = arg('out', path.join(root, 'shots', 'bounce', `${path.basename(html, '.html')}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const BUSY = +arg('frame', 85);       // the slow frames, ms
const CLAMP = 0.1;                    // main.js frame(): dt = Math.min(dt, 0.1)

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: +arg('w', 960), height: +arg('h', 540) }, deviceScaleFactor: 1 });
const problems = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => problems.push(`${who}: pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/navigator.vibrate/.test(m.text())) problems.push(`${who}: console: ${m.text()}`); });
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${who}: NETWORK ${r.url()}`); });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await ctx.addInitScript(() => {
  window.__dropUntil = 0;
  const post = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (m) { if (performance.now() < window.__dropUntil) return; return post.call(this, m); };
});

const G = await ctx.newPage(); watch(G, 'game');
await G.goto(`file://${html}?p1=kevalanche&p1cpu=hard&track=landing&seed=7&webgl&noportraits&net=local&pads=1&hold`);
await G.waitForFunction(() => window.__dh?.race && window.__dh.views?.size, null, { timeout: 240000 });
await G.evaluate(() => __dh.pads.start());       // (the deep link skips the title, where pairing starts)
await G.waitForFunction(() => __dh.pads.status === 'ready', null, { timeout: 30000 });
const code = await G.evaluate(() => __dh.pads.code);
const phones = [];
for (const name of ['p1', 'p2']) {
  const p = await ctx.newPage(); watch(p, name);
  await p.setViewportSize({ width: 844, height: 390 });
  const url = `file://${html}?pad=${code}&net=local&nofs&uid=${name}&jitter=300&loss=0.15${/_source/.test(html) ? '&art=' + encodeURIComponent('file://' + path.resolve(root, '../../pillow-fight-2/_source/docs/friday-nov20/backgrounds') + '/') : ''}`;
  await p.goto(url);
  phones.push({ p, url });
}
// (SwiftShader: the page is slow to take the joins; best effort, reported)
try { await G.waitForFunction(() => __dh.pads.connected(0) && __dh.pads.connected(1), null, { timeout: 60000 }); } catch { /* reported below */ }
// the pad host's main-thread cost while the phones are on a bad link (the hitch suspects)
await G.evaluate(() => {
  const H = __dh.pads; window.__cost = {};
  for (const m of ['frame', 'paint', '_pi', '_ctl', '_seat']) {
    const f = H[m].bind(H), c = (__cost[m] = { n: 0, ms: 0, max: 0 });
    H[m] = (...a) => { const t = performance.now(); try { return f(...a); } finally { const d = performance.now() - t; c.n++; c.ms += d; c.max = Math.max(c.max, d); } };
  }
  const el = document.querySelector('#pads'); window.__mut = 0;
  if (el) new MutationObserver((l) => { __mut += l.length; }).observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
});
const seatsBefore = await G.evaluate(() => [__dh.pads.connected(0), __dh.pads.connected(1)]);
// the frames: n frames of `ms` each (dt as the page's loop would clamp it), recorded
await G.evaluate(() => { window.__rec = []; window.__t = 0; });
const run = async (n, ms) => {
  for (let i = 0; i < n; i += 4) {
    await G.evaluate(([k, ms]) => {
      for (let j = 0; j < k; j++) {
        __dh.frame(ms / 1000, false);
        __t += ms;
        const V = [...__dh.views.values()].filter((v) => v.group.visible).slice(0, 4);
        __rec.push({ t: __t, p: V.map((v) => ({ c: v.driver.p.crunch?.x ?? 0, s: v.squash, sx: v.kart.body.scale.x, sy: v.kart.body.scale.y })) });
      }
    }, [Math.min(4, n - i), ms]);
    await sleep(4);                       // (the phones' packets come in)
  }
};
const SLOW = BUSY;
await run(120, 1000 / 60);
const slowAt = 2000;
await G.evaluate(() => { for (const v of __dh.views.values()) { v.hit(); v.land(1); v.driver.p.crunchBy(2.6); } });
await run(Math.round(1000 / SLOW), SLOW);
await phones[0].p.evaluate(() => { window.__dropUntil = performance.now() + 3000; });   // phone 1: a 3 s dropout
await run(Math.round(3000 / SLOW), SLOW);
await phones[0].p.goto(phones[0].url);                                                 // …and it reconnects
await run(Math.round(1000 / SLOW), SLOW);
const fastAt = await G.evaluate(() => __t);
await run(180, 1000 / 60);
await sleep(1500);
await G.evaluate(() => __dh.step(1 / 60, true));
await G.screenshot({ path: outFile.replace(/\.json$/, '.png') });
const R = await G.evaluate(() => ({ rec: window.__rec, cost: window.__cost, mut: window.__mut, seats: [__dh.pads.connected(0), __dh.pads.connected(1)] }));
R.t0 = 0; R.slowAt = slowAt; R.fastAt = fastAt;
await browser.close();

// the numbers
const at = (r) => (r.t - R.t0) / 1000;
const win = (a, b) => R.rec.filter((r) => r.t >= a && r.t < b);
const stat = (rows) => {
  let c = 0, s = 0, lo = 9, hi = 0, flips = 0, prev = 0;
  for (const r of rows) for (const P of r.p) {
    c = Math.max(c, Math.abs(P.c)); s = Math.max(s, Math.abs(P.s)); lo = Math.min(lo, P.sy); hi = Math.max(hi, P.sy);
  }
  for (const r of rows) { const d = Math.sign(r.p[0].s); if (d && prev && d !== prev) flips++; if (d) prev = d; }
  return { frames: rows.length, driverCrunchMax: +c.toPrecision(3), kartSquashMax: +s.toPrecision(3), kartScaleY: [+lo.toFixed(3), +hi.toFixed(3)], kartSquashSignFlips: flips };
};
const res = {
  html: path.relative(root, html), slowFrameMs: BUSY, slowDt: Math.min(CLAMP, BUSY / 1000),
  before: stat(win(R.t0, R.slowAt)),
  slow: stat(win(R.slowAt, R.fastAt)),
  recovered0to05: stat(win(R.fastAt, R.fastAt + 500)),
  recovered05to3: stat(win(R.fastAt + 500, R.fastAt + 3000)),
  seatsBefore, seatsAfterReconnect: R.seats,
  padHostCost: Object.fromEntries(Object.entries(R.cost).map(([k, c]) => [k, { calls: c.n, meanMs: +(c.ms / Math.max(1, c.n)).toFixed(4), maxMs: +c.max.toFixed(3) }])), pairingCardMutations: R.mut,
  series: R.rec.map((r) => [+at(r).toFixed(3), ...r.p.flatMap((P) => [+P.c.toPrecision(3), +P.sy.toFixed(4)])]),
  problems,
};
fs.writeFileSync(outFile, JSON.stringify(res));
const { series, ...summary } = res;
console.log(JSON.stringify(summary, null, 1));
