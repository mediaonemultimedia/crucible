/* The phone pads, end to end, in headless Chromium: a game page and two
   simulated phones (landscape, touch, multi-touch through CDP) over the
   local loopback transport (?net=local: BroadcastChannel, no network).

   1. pairing: the QR on the title decodes (jsQR) to the pad link; both
      phones join, P1 + P2, ping LEDs lit
   2. menus from the phones: title → mode → Versus → select; each phone
      moves its own cursor, picks OG / ALT on its strip, locks in
   3. loopback latency: a phone tap → the sim's input mask, in frames
      (must be ≤ 2), many samples, and a stick ↓↘→ + BOP fires the special
   4. lag + jitter + loss injection (60 ms ± 40 ms, 25 % of input packets
      dropped): every tap still lands (the press counters), held bits stay
   5. multi-touch: stick held + two buttons at once
   6. haptics / ink / KO roast / taunt reach the right phone
   7. the cheat sheet; practice holds only while the sheet is open
   8. reconnect: a phone's link drops, it comes back on the same seat
   9. frame rate on the phone page while playing; zero console errors and
      zero network requests on every page
   Screenshots → shots/pad/.
     node tools/pad-test.mjs [--html final.html]                          */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jsQR from 'jsqr';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(arg('html', path.join(root, 'final.html')));
const out = path.join(root, 'shots', 'pad');
fs.mkdirSync(out, { recursive: true });
const ART = 'docs/friday-nov20/backgrounds/';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const phoneCtx = ctx;   // same context: BroadcastChannel reaches the game tab
const problems = [], results = {};
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${who}: console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${who}: pageerror: ${e.message}`));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${who}: NETWORK ${r.url()}`); });
};
const ok = (cond, what) => { if (!cond) problems.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the game ─────────────────────────────────────────────────────── */
const G = await ctx.newPage(); watch(G, 'game');
await G.goto(`file://${html}?net=local&pads=1&hold&webgl&noportraits`);
await G.waitForFunction(() => window.__pf2 && document.body.classList.contains('is-live'), null, { timeout: 240000 });
const step = (s = 1 / 60, draw = false) => G.evaluate(([s, d]) => __pf2.step(s, d), [s, draw]);
// real-time stepping: one tick, then let the messages in (≈60 Hz)
const tick = async (n = 1) => { for (let i = 0; i < n; i++) { await step(1 / 60); await sleep(16); } };
await G.waitForFunction(() => __pf2.pads.status === 'ready', null, { timeout: 20000 });
await step(0, true);
await G.screenshot({ path: path.join(out, '0-title-pairing.png') });

// 1. the QR decodes to the pad link
const qr = await G.evaluate(async () => {
  const svg = document.querySelector('#pads .qr svg');
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(svg.outerHTML);
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 400;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 400, 400);
  return { data: [...g.getImageData(0, 0, 400, 400).data], url: __pf2.pads.url(), code: __pf2.pads.code };
});
const dec = jsQR(Uint8ClampedArray.from(qr.data), 400, 400);
ok(dec && dec.data === qr.url, `QR decodes to ${dec?.data}, want ${qr.url}`);
results.qr = { url: qr.url, decoded: dec?.data === qr.url };

/* ── the phones ───────────────────────────────────────────────────── */
const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
async function phone(name, extra = '') {
  const p = await phoneCtx.newPage();
  await p.setViewportSize(PHONE.viewport);
  watch(p, name);
  const u = `file://${html}?pad=${qr.code}&net=local&art=${ART}&nofs&uid=${name}${extra}`;
  await p.goto(u);
  const cdp = await phoneCtx.newCDPSession(p);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  p.cdp = cdp;
  return p;
}
// svg (2400×1100) → CSS px on a phone
const at = (p, x, y) => p.evaluate(([x, y]) => { const s = document.getElementById('s'), m = s.getScreenCTM(), q = s.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(m); return [r.x, r.y]; }, [x, y]);
const L = { stick: [604, 517], btn: [[1550, 425], [1762, 361], [1979, 348], [1550, 692], [1764, 637], [1979, 626]], super: [1097, 550], start: [1132, 215], moves: [2062, 1050] };
const touches = new Map();   // phone → Map(id → [x, y])
async function touch(p, type, id, x, y) {
  const T = touches.get(p) || new Map(); touches.set(p, T);
  if (type === 'end') T.delete(id); else T.set(id, [x, y]);
  const pts = [...T.entries()].map(([i, [px, py]]) => ({ x: px, y: py, id: i, radiusX: 4, radiusY: 4, force: 1 }));
  await p.cdp.send('Input.dispatchTouchEvent', { type: type === 'start' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd', touchPoints: type === 'end' && !pts.length ? [] : pts });
}
const down = async (p, id, sx, sy) => { const [x, y] = await at(p, sx, sy); await touch(p, 'start', id, x, y); };
const move = async (p, id, sx, sy) => { const [x, y] = await at(p, sx, sy); await touch(p, 'move', id, x, y); };
const up = (p, id) => touch(p, 'end', id);
const tap = async (p, sx, sy, ms = 50, id = 1) => { await down(p, id, sx, sy); await sleep(ms); await up(p, id); };
const btn = (k) => L.btn[k];
const BOP = 0, WALLOP = 1, GRAB = 2, BLOCK = 3, JUMP = 4, TAUNT = 5;

const P1 = await phone('p1');
await G.waitForFunction(() => __pf2.pads.connected(0), null, { timeout: 15000 });
const P2 = await phone('p2');
await G.waitForFunction(() => __pf2.pads.connected(1), null, { timeout: 15000 });
await tick(70);
results.pairing = await G.evaluate(() => ({ seats: [0, 1].map((k) => __pf2.pads.connected(k)), leds: [0, 1].map((k) => __pf2.pads.led(k)), rtt: [0, 1].map((k) => Math.round(__pf2.pads.rtt(k))) }));
ok(results.pairing.seats.every(Boolean), 'both phones paired');
ok(results.pairing.leds.every((l) => l === 'green'), `LEDs ${results.pairing.leds}`);
await step(0, true);
await G.screenshot({ path: path.join(out, '1-title-two-phones.png') });
const seatOf = (p) => p.evaluate(() => __pad.S.seat);
ok(await seatOf(P1) === 0 && await seatOf(P2) === 1, 'phone seats 0 / 1');

// 2. menus from the phones
await tap(P1, ...btn(BOP)); await tick(3);
ok(await G.evaluate(() => __pf2.screen) === 'mode', 'phone BOP: title → mode');
await down(P1, 2, ...L.stick); await move(P1, 2, L.stick[0], L.stick[1] + 70); await tick(2); await up(P1, 2); await tick(2);   // stick ↓: Versus
await tap(P1, ...btn(BOP)); await tick(3);
results.menu = await G.evaluate(() => ({ screen: __pf2.screen, mode: __pf2.mode }));
ok(results.menu.screen === 'select' && results.menu.mode === 'versus', `menus → ${JSON.stringify(results.menu)}`);
await tick(10);
// P1: stick → twice (Johnny), ALT on the strip; P2: ◀ on the strip (Zach? wraps), OG
const stripTap = async (p, sel) => { const r = await p.evaluate((s) => { const e = document.querySelector(s).getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; }, sel); await touch(p, 'start', 9, ...r); await sleep(30); await touch(p, 'end', 9); };
for (let i = 0; i < 2; i++) { await down(P1, 2, ...L.stick); await move(P1, 2, L.stick[0] + 70, L.stick[1]); await tick(2); await up(P1, 2); await tick(2); }
await stripTap(P1, '#sel .alt'); await tick(4);
await stripTap(P2, '#sel [data-dx="1"]'); await tick(4);
await stripTap(P2, '#sel [data-dx="1"]'); await tick(4);
await tick(10);
const sel = await G.evaluate(() => ({ slots: [__pf2.slot(0), __pf2.slot(1)], alt: __pf2.alt.slice(), ids: __pf2.pick.map((i) => __pf2.ROSTER[i]) }));
const p1view = await P1.evaluate(() => ({ skin: __pad.S.skin, strip: document.querySelector('#sel').classList.contains('on'), name: document.querySelector('#sel .nm span').textContent }));
results.select = { ...sel, p1view };
ok(sel.ids[0] === 'johnny' && sel.alt[0] === true, `P1 picked ${sel.ids[0]} alt=${sel.alt[0]} (want Evil Johnny)`);
ok(p1view.skin === 'johnny-alt' && p1view.strip, `P1 phone skin ${p1view.skin}`);
await step(0, true);
await G.screenshot({ path: path.join(out, '2-select-from-phones.png') });
await P1.screenshot({ path: path.join(out, 'phone-select-strip.png') });
await tap(P1, ...btn(BOP)); await tick(2);
await tap(P2, ...btn(BOP)); await tick(30);
await G.evaluate(() => __pf2._vsEnd(true)); await tick(5);
results.fight = await G.evaluate(() => ({ screen: __pf2.screen, ids: __pf2.fight?.st.f.map((f) => f.id), evil: __pf2.fight?.evil }));
ok(results.fight.screen === 'fight', `fight started: ${JSON.stringify(results.fight)}`);
// skip the intro: straight to the fight phase
await G.evaluate(() => { const st = __pf2.fight.st; st.phase = 'fight'; st.pt = 0; __pf2.fight.intro = null; });
await tick(5);

// 3. latency: a tap on BOP → the frame the sim sees LIGHT
const LIGHT = 16, HEAVY = 32, SPECIAL = 64, CROUCH = 512, RIGHT = 2, LEFT = 1, BLOCKB = 128;
async function latency(p, k, bit, sx, sy) {
  await down(p, 3, sx, sy);
  let n = 0;
  for (; n < 30; n++) { await step(1 / 60); const m = await G.evaluate((k) => __pf2.fight.lastInputs[k], k); if (m & bit) break; await sleep(16); }
  await up(p, 3); await tick(6);
  return n;
}
const lat = [];
for (let i = 0; i < 12; i++) lat.push(await latency(i % 2 ? P2 : P1, i % 2, LIGHT, ...btn(BOP)));
results.latencyFrames = { samples: lat, max: Math.max(...lat), mean: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(2) };
ok(Math.max(...lat) <= 2, `loopback latency ${lat} frames (max must be ≤ 2)`);

// the special from the stick: Johnny ↓↙← + BOP (P1 faces right: ← is back)
await G.evaluate(() => { const f = __pf2.fight.st.f; f[0].x = -2300; f[1].x = 2300; f[0].z = f[1].z = 0; });
await tick(20);
const evs = [];
await G.exposeFunction('__ev', (e) => evs.push(e));
await G.evaluate(() => { const f = __pf2.fight, o = f.onEvent; f.onEvent = (e) => { o(e); window.__ev({ k: e.k, p: e.p }); }; });
await down(P1, 2, ...L.stick);
await move(P1, 2, L.stick[0], L.stick[1] + 80); await tick(2);
await move(P1, 2, L.stick[0] - 60, L.stick[1] + 60); await tick(2);
await move(P1, 2, L.stick[0] - 85, L.stick[1]); await tick(1);
await tap(P1, ...btn(BOP), 40, 4); await tick(2);
await up(P1, 2); await tick(30);
results.specialFromStick = evs.some((e) => e.k === 'msp' && e.p === 0);
ok(results.specialFromStick, 'stick ↓↙← + BOP: Johnny’s Flaming Ace fired');

// 5. multi-touch: hold the stick → and BLOCK, tap WALLOP
await down(P1, 2, ...L.stick); await move(P1, 2, L.stick[0] + 80, L.stick[1]);
await down(P1, 5, ...btn(BLOCK));
await down(P1, 6, ...btn(WALLOP)); await tick(3);
const mt = await G.evaluate(() => __pf2.pads.state[0].held);
await up(P1, 6); await up(P1, 5); await up(P1, 2); await tick(3);
results.multiTouch = { held: mt, right: !!(mt & RIGHT), block: !!(mt & BLOCKB), heavy: !!(mt & HEAVY) };
ok(results.multiTouch.right && results.multiTouch.block && results.multiTouch.heavy, `multi-touch held ${mt}`);
await P1.screenshot({ path: path.join(out, 'phone-pressed.png') });

// 4. lag + jitter + loss: a third phone page on P2's seat with the injection
await P2.close();
await tick(10);
const P2b = await phone('p2', '&lag=60&jitter=40&loss=0.25');
await G.waitForFunction(() => __pf2.pads.connected(1), null, { timeout: 15000 });
await tick(40);
const seatBack = await seatOf(P2b);
ok(seatBack === 1, `reconnected phone back on seat 2 (got ${seatBack})`);
await G.evaluate(() => { window.__presses = 0; const f = __pf2.fight, s = f.kb2.sample.bind(f.kb2); let prev = 0; f.kb2.sample = () => { const m = s(); if ((m & 16) && !(prev & 16)) window.__presses++; prev = m; return m; }; });
const N = 20;
for (let i = 0; i < N; i++) { await tap(P2b, ...btn(BOP), 30, 7); await tick(6); }
await tick(30);
const landed = await G.evaluate(() => window.__presses);
results.jitter = { taps: N, landed, rtt: await G.evaluate(() => Math.round(__pf2.pads.rtt(1))), led: await G.evaluate(() => __pf2.pads.led(1)) };
ok(landed === N, `with lag/jitter/loss: ${landed}/${N} taps landed`);
// a held direction stays held through the loss
await down(P2b, 2, ...L.stick); await move(P2b, 2, L.stick[0] - 80, L.stick[1]); await tick(20);
let heldOK = 0;
for (let i = 0; i < 30; i++) { await tick(1); heldOK += (await G.evaluate(() => __pf2.fight.lastInputs[1])) & LEFT ? 1 : 0; }
await up(P2b, 2); await tick(20);
results.jitter.heldFrames = `${heldOK}/30`;
ok(heldOK >= 29, `held ← through loss: ${heldOK}/30 frames`);

// 6. haptics, ink, KO roast, taunt
await G.evaluate(() => { __pf2._padEvent({ k: 'inked', p: 0 }); __pf2._padEvent({ k: 'hit', p: 1 }); });
await sleep(500);
results.ink = await P1.evaluate(() => !!document.querySelector('#ink svg'));
ok(results.ink, 'ink splat on P1’s phone');
await P1.screenshot({ path: path.join(out, 'phone-ink.png') });
const inkHits = await P1.evaluate(() => { const r = document.querySelector('#ink'); return getComputedStyle(r).pointerEvents; });
ok(inkHits === 'none', 'the ink never takes a touch');
await sleep(2300);
ok(!(await P1.evaluate(() => !!document.querySelector('#ink svg'))), 'the ink drips off in ~2 s');
await tap(P1, ...btn(TAUNT)); await tick(4);
results.taunt = await G.evaluate(() => document.querySelector('#bubbles').textContent);
ok(results.taunt.length > 3, 'TAUNT: a bubble over the fighter');
await step(0, true);
await G.screenshot({ path: path.join(out, '3-taunt.png') });
await G.evaluate(() => __pf2._padEvent({ k: 'end', w: 1 }));
await sleep(600);
results.koLine = await P1.evaluate(() => document.querySelector('#ko').classList.contains('on') && document.querySelector('#ko .card').textContent);
ok(!!results.koLine, 'KO roast on the loser’s phone');
ok(!(await P2b.evaluate(() => document.querySelector('#ko').classList.contains('on'))), 'no roast on the winner’s phone');
await P1.screenshot({ path: path.join(out, 'phone-ko-line.png') });

// 7. the cheat sheet; practice pause
await G.evaluate(() => { __pf2.mode = 'practice'; __pf2.startPractice({ p1: 'kevalanche', p2: 'sumaura' }); });
await tick(20);
await tap(P1, ...L.moves); await tick(4);
await sleep(500);
const sh1 = await P1.evaluate(() => __pad.sheetOpen);
await P1.screenshot({ path: path.join(out, 'phone-cheat-sheet.png') });
// practice pauses only when EVERY paired phone has its sheet open
const paused1 = await G.evaluate(() => __pf2.fight.paused);
await P2b.evaluate(() => __pad.openSheet(true)); await tick(4); await sleep(300);
const paused2 = await G.evaluate(() => __pf2.fight.paused);
await P1.evaluate(() => __pad.openSheet(false)); await tick(4); await sleep(300);
const paused3 = await G.evaluate(() => __pf2.fight.paused);
await P2b.evaluate(() => __pad.openSheet(false)); await tick(4);
results.sheet = { opened: sh1, pausedWithOne: paused1, pausedWithBoth: paused2, afterClose: paused3 };
ok(sh1 && !paused1 && paused2 && !paused3, `cheat sheet / practice pause ${JSON.stringify(results.sheet)}`);

/* skins: the panel for every fighter (DEMO: no game) */
const demoCtx = await browser.newContext({ ...PHONE });   // the panels alone: their own context, at 2×
const demo = await demoCtx.newPage();
watch(demo, 'demo');
for (const s of ['kevalanche', 'kevalanche-alt', 'sebas', 'sebas-alt', 'rubberta', 'k8-e-alt', 'zach', 'johnny', 'sumaura-alt']) {
  await demo.goto(`file://${html}?pad=DEMO&art=${ART}&nofs&skin=${s}`);
  await demo.waitForFunction(() => { const i = document.querySelector('#s image'); return i && i.getBBox().width > 0; });
  await sleep(300);
  await demo.screenshot({ path: path.join(out, `skin-${s}.png`) });
}
// 9. the phone page's frame rate while playing: the stick circling + a second finger
// on a button, 2 s (its own context and tab, so the game's software WebGL isn't in its way)
{
  await demo.goto(`file://${html}?pad=DEMO&art=${ART}&nofs&skin=sebas`);
  await sleep(600);
  const cdp = await demoCtx.newCDPSession(demo);
  const fpsP = demo.evaluate(() => new Promise((r) => { const ts = []; const f = (t) => { ts.push(t); if (t - ts[0] < 2000) requestAnimationFrame(f); else r(ts); }; requestAnimationFrame(f); }));
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const t0 = Date.now(); let i = 0;
  await T('touchStart', [{ x: 210, y: 180, id: 1 }]);
  while (Date.now() - t0 < 1900) { const a = i++ * 0.3; await T('touchMove', [{ x: 210 + Math.cos(a) * 25, y: 180 + Math.sin(a) * 25, id: 1 }, ...(i % 10 < 5 ? [{ x: 640, y: 150, id: 2 }] : [])]); await sleep(8); }
  await T('touchEnd', []);
  const ts = await fpsP, iv = ts.slice(1).map((t, k) => t - ts[k]);
  results.phoneFps = { fps: +(1000 / (iv.reduce((a, b) => a + b, 0) / iv.length)).toFixed(1), worstMs: +Math.max(...iv).toFixed(1) };
  ok(results.phoneFps.fps >= 58, `phone page ${results.phoneFps.fps} fps`);
}
const portrait = await demoCtx.newPage();
await portrait.setViewportSize({ width: 390, height: 844 });
watch(portrait, 'portrait');
await portrait.goto(`file://${html}?pad=DEMO&art=${ART}&nofs`);
await sleep(300);
results.rotatePrompt = await portrait.evaluate(() => getComputedStyle(document.querySelector('#rot')).display === 'flex');
ok(results.rotatePrompt, 'rotate prompt in portrait');
await portrait.screenshot({ path: path.join(out, 'phone-portrait-rotate.png') });

console.log(JSON.stringify(results, null, 1));
await browser.close();
if (problems.length) { console.error(`\nPAD TEST FAILED\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log('\npad test OK');
