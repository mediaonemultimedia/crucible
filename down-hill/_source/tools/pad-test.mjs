/* The phone pads, end to end, in headless Chromium: a game page and FOUR
   simulated phones (landscape, touch, multi-touch through CDP) over the
   local loopback transport (?net=local: BroadcastChannel, no network).

   1. pairing: the QR on the title decodes (jsQR) to the pad link; four
      phones join: the first shares P1 with the keyboard, the rest are
      P2–P4; ping LEDs lit
   2. menus from the phones: START on the title → select; each phone moves
      its own cursor on its strip (◀ ▶, OG / ALT), everyone locks in,
      then P1 picks the track and starts a 4-player split-screen race
   3. loopback latency: a phone's GAS tap → the sim's input, in frames
      (must be ≤ 2), and the stick's X → the kart's steer
   4. Motion drift: simulated pitch holds and releases drift, with the
      stick still steering the kart
   5. Four phones drive simultaneously and SUPER taps survive packet loss
   6. haptics: an item hit buzzes that player's phone (and only theirs)
   7. the "how to race" sheet: the ten items; auto-gas
   8. reconnect: a phone's page closes mid-race; it comes back on the same
      player
   9. zero console errors and zero network requests on every page
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
// Kevin's painted backgrounds (they ship in down-hill/controller/backgrounds/)
const ART = 'file://' + path.resolve(arg('art', path.join(root, '../../pillow-fight-2/_source/docs/friday-nov20/backgrounds'))) + '/';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const problems = [], results = {};
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${who}: console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${who}: pageerror: ${e.message}`));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${who}: NETWORK ${r.url()}`); });
};
const ok = (cond, what) => { if (!cond) problems.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('uncaughtException', (e) => { console.log(JSON.stringify(results, null, 1)); console.log('PROBLEMS:\n  ' + problems.join('\n  ')); console.error(e); process.exit(1); });

/* ── the game ─────────────────────────────────────────────────────── */
const G = await ctx.newPage(); watch(G, 'game');
await G.goto(`file://${html}?net=local&pads=1&hold&webgl&noportraits&seed=6&laps=2`);
await G.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 240000 });
const step = (s = 1 / 60, draw = false) => G.evaluate(([s, d]) => __dh.step(s, d), [s, draw]);
// real-time stepping: one tick, then let the messages in (≈60 Hz)
const tick = async (n = 1) => { for (let i = 0; i < n; i++) { await step(1 / 60); await sleep(16); } };
await G.waitForFunction(() => __dh.pads.status === 'ready', null, { timeout: 20000 });
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
  return { data: [...g.getImageData(0, 0, 400, 400).data], url: __dh.pads.url(), code: __dh.pads.code };
});
const dec = jsQR(Uint8ClampedArray.from(qr.data), 400, 400);
ok(dec && dec.data === qr.url, `QR decodes to ${dec?.data}, want ${qr.url}`);
results.qr = { url: qr.url, decoded: dec?.data === qr.url };

/* ── the phones ───────────────────────────────────────────────────── */
async function phone(name, extra = '') {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 844, height: 390 });
  watch(p, name);
  await p.addInitScript(() => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') DeviceOrientationEvent.requestPermission = async () => 'granted';
  });
  await p.goto(`file://${html}?pad=${qr.code}&net=local&art=${encodeURIComponent(ART)}&nofs&uid=${name}${extra}`);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  p.cdp = cdp;
  p.T = new Map();
  return p;
}
// svg (2400×1100) → CSS px on a phone
const at = (p, x, y) => p.evaluate(([x, y]) => { const s = document.getElementById('s'), m = s.getScreenCTM(), q = s.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(m); return [r.x, r.y]; }, [x, y]);
const L = { stick: [604, 517], accelerate: [1600, 510], brake: [1975, 394], drift: [1827, 703], super: [1097, 550], start: [1132, 215], moves: [2062, 1050] };
async function touch(p, type, id, x, y) {
  const T = p.T;
  if (type === 'end') T.delete(id); else T.set(id, [x, y]);
  const pts = [...T.entries()].map(([i, [px, py]]) => ({ x: px, y: py, id: i, radiusX: 4, radiusY: 4, force: 1 }));
  await p.cdp.send('Input.dispatchTouchEvent', { type: type === 'start' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd', touchPoints: type === 'end' && !pts.length ? [] : pts });
}
const down = async (p, id, sx, sy) => { const [x, y] = await at(p, sx, sy); await touch(p, 'start', id, x, y); };
const move = async (p, id, sx, sy) => { const [x, y] = await at(p, sx, sy); await touch(p, 'move', id, x, y); };
const up = (p, id) => touch(p, 'end', id);
const tap = async (p, sx, sy, ms = 50, id = 1) => { await down(p, id, sx, sy); await sleep(ms); await up(p, id); };
const stripTap = async (p, sel) => { const r = await p.evaluate((s) => { const e = document.querySelector(s).getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; }, sel); await touch(p, 'start', 9, ...r); await sleep(30); await touch(p, 'end', 9); };

const phones = [];
for (let n = 0; n < 4; n++) {
  phones.push(await phone(`ph${n + 1}`));
  await G.waitForFunction((k) => __dh.pads.connected(k), n, { timeout: 15000 });
  await tick(3);
}
await tick(60);
results.pairing = await G.evaluate(() => ({ seats: [0, 1, 2, 3].map((k) => __dh.pads.connected(k)), leds: [0, 1, 2, 3].map((k) => __dh.pads.led(k)), rtt: [0, 1, 2, 3].map((k) => Math.round(__dh.pads.rtt(k))), players: __dh.players.map((p) => ({ phone: p.phone, kb: p.ctl.map })) }));
ok(results.pairing.seats.every(Boolean), 'four phones paired');
ok(results.pairing.leds.every((l) => l === 'green'), `LEDs ${results.pairing.leds}`);
ok(results.pairing.players.length === 4 && results.pairing.players[0].kb === 'all' && results.pairing.players.map((p) => p.phone).join() === '0,1,2,3', `players ${JSON.stringify(results.pairing.players)}`);
await step(0, true);
await G.screenshot({ path: path.join(out, '1-title-four-phones.png') });
const whoOn = await Promise.all(phones.map((p) => p.evaluate(() => document.getElementById('st').textContent)));
results.who = whoOn;

// 2. menus from the phones: START → select
await tap(phones[0], ...L.start); await tick(4);
ok(await G.evaluate(() => __dh.screen) === 'select', 'phone START: title → select');
results.afterStart = { mask: await phones[0].evaluate(() => __pad.mask()), locked: await G.evaluate(() => __dh.players[0].locked) };
await tick(10);
// P1: ▶ twice (K8-E); P2: ALT; P3: ◀ once; P4: ▶ once + ALT
await stripTap(phones[0], '#sel [data-dx="1"]'); await tick(3);
await stripTap(phones[0], '#sel [data-dx="1"]'); await tick(3);
await stripTap(phones[1], '#sel .alt'); await tick(3);
await stripTap(phones[2], '#sel [data-dx="-1"]'); await tick(3);
await stripTap(phones[3], '#sel [data-dx="1"]'); await tick(3);
await stripTap(phones[3], '#sel .alt'); await tick(3);
// the stick also moves the cursor (P3: ▶ by stick, then back ◀)
await down(phones[2], 2, ...L.stick); await move(phones[2], 2, L.stick[0] + 80, L.stick[1]); await tick(3); await up(phones[2], 2); await tick(3);
await down(phones[2], 2, ...L.stick); await move(phones[2], 2, L.stick[0] - 80, L.stick[1]); await tick(3); await up(phones[2], 2); await tick(3);
results.select = await G.evaluate(() => __dh.players.map((p) => ({ sel: p.sel, id: __dh.constructor ? null : null, look: [p.sel] })));
const looks = await G.evaluate(() => __dh.players.map((p) => p.sel));
const views = await Promise.all(phones.map((p) => p.evaluate(() => ({ view: JSON.stringify(__pad.S.view), seat: __pad.S.seat, link: !!__pad.S.link, skin: __pad.S.skin, strip: document.querySelector('#sel').classList.contains('on'), name: document.querySelector('#sel .nm span').textContent, who: document.querySelector('#sel .nm small').textContent }))));
results.select = { looks, views };
ok(new Set(looks).size === 4, `four different looks ${looks}`);
ok(views.every((v) => v.strip), 'every phone shows its select strip');
ok(views[0].skin === 'k8-e' && views[1].skin.endsWith('-alt') && views[3].skin.endsWith('-alt'), `phone skins follow the picks: ${views.map((v) => v.skin)}`);
await step(0, true);
await G.screenshot({ path: path.join(out, '2-select-four-players.png') });
await phones[1].screenshot({ path: path.join(out, 'phone-select-strip.png') });
for (const p of phones) { await stripTap(p, '#sel .lk'); await tick(2); }
await tick(10);
ok(await G.evaluate(() => __dh.screen) === 'setup', 'phones lock all four racers before course setup');
const trkBefore = await G.evaluate(() => __dh.choice);
await stripTap(phones[0], '#sel .trk'); await tick(3);
const trkAfter = await G.evaluate(() => __dh.choice);
ok(trkAfter !== trkBefore, `P1's phone cycles the track (${trkBefore} → ${trkAfter})`);
await G.evaluate(() => __dh.cycleTrack(-1));
await tick(4);
await stripTap(phones[0], '#sel .lk');
await tick(10);
results.race = await G.evaluate(() => ({ screen: __dh.screen, views: __dh.hv.length, humans: __dh.hv.map((h) => h.i), karts: __dh.race?.karts.length }));
ok(results.race.screen === 'race' && results.race.views === 4 && results.race.karts === 8, `→ race ${JSON.stringify(results.race)}`);

// 3. latency: a GAS tap → the sim's input, in frames (loopback, no lag)
const lat = [];
for (let n = 0; n < 4; n++) {
  for (let r = 0; r < 3; r++) {
    await G.evaluate((j) => { const H = __dh.hv[j]; __dh._probe = { j, i: H.i, f: 0, got: -1 }; const P = __dh.humanP[j].ctl; const s0 = P.sample.bind(P); P.sample = () => { const I = s0(); __dh._probe.f++; if (I.gas && __dh._probe.got < 0) __dh._probe.got = __dh._probe.f; return I; }; P._s0 = s0; }, n);
    await down(phones[n], 3, ...L.accelerate);
    let got = -1;
    for (let f = 0; f < 12 && got < 0; f++) { await tick(1); got = await G.evaluate(() => __dh._probe.got); }
    await up(phones[n], 3); await tick(2);
    await G.evaluate((j) => { const P = __dh.humanP[j].ctl; P.sample = P._s0; }, n);
    lat.push(got);
  }
}
results.latencyFrames = lat;
ok(lat.every((f) => f > 0 && f <= 2), `GAS → sim within 2 frames on every phone: ${lat}`);
// the stick's X → the kart's steer
await down(phones[1], 2, ...L.stick); await move(phones[1], 2, L.stick[0] + 70, L.stick[1] + 4); await tick(4);
const steerR = await G.evaluate(() => __dh.pads.state[1].steer);
await move(phones[1], 2, L.stick[0] - 35, L.stick[1]); await tick(4);
const steerL = await G.evaluate(() => __dh.pads.state[1].steer);
await up(phones[1], 2); await tick(3);
results.stick = { steerR, steerL };
ok(steerR > 0.9 && steerL < -0.3 && steerL > -0.8, `stick → steer (full right ${steerR.toFixed(2)}, half left ${steerL.toFixed(2)})`);

// One thumb can roll from accelerator to drift and back while holding gas.
const chordPad = phones[0];
const pedals = () => G.evaluate(() => __dh.pads.state[0].held & (16 | 32));
await down(chordPad, 3, ...L.accelerate); await tick(2);
ok(await pedals() === 16, 'gas pressed before drift');
await move(chordPad, 3, ...L.drift); await tick(2);
ok(await pedals() === 48, 'one thumb holds gas and drift');
await move(chordPad, 3, ...L.accelerate); await tick(2);
ok(await pedals() === 16, 'drift releases while gas stays on');
await up(chordPad, 3); await tick(2);
ok(await pedals() === 0, 'lifting the thumb releases both pedals');

// 4. Tilt drift on phone 3 (P3)
await tap(phones[2], ...L.moves); await sleep(500);
const sheet = await phones[2].evaluate(() => ({ items: document.querySelectorAll('#sh .it').length, names: [...document.querySelectorAll('#sh .it b')].map((b) => b.textContent), open: __pad.sheetOpen }));
results.sheet = sheet;
ok(sheet.open && sheet.items === 10, `the how-to sheet lists ${sheet.items} items`);
await phones[2].screenshot({ path: path.join(out, 'phone-how-to-sheet.png') });
await stripTap(phones[2], '#sh .x'); await sleep(500);
const fire = async (p, beta) => {
  await p.evaluate((b) => {
    for (let i = 0; i < 10; i++) dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: 0 }));
  }, beta);
  await tick(2);
};
const p3 = phones[2];
await p3.bringToFront();
if (await p3.locator('#tilt').isVisible()) await stripTap(p3, '#tilt');
await fire(p3, 90);
await down(p3, 2, ...L.stick);
await move(p3, 2, L.stick[0] + 65, L.stick[1]);
await fire(p3, 112);
const held = await G.evaluate(() => ({ drift: !!(__dh.pads.state[2].held & 32), steer: __dh.pads.state[2].steer }));
await fire(p3, 90);
const released = await G.evaluate(() => !(__dh.pads.state[2].held & 32));
await up(p3, 2);
results.tilt = { ...held, released };
ok(held.drift && held.steer > 0.4 && released, `pitch toggles drift with stick steering: ${JSON.stringify(results.tilt)}`);

await G.evaluate(() => __dh.step(4.2, false));    // past the countdown
ok((await Promise.all(phones.map((p) => p.evaluate(() => __pad.sheetOpen)))).every((o) => !o), 'every sheet closed before the race');
for (const p of phones) await down(p, 3, ...L.accelerate);
const kc0 = await G.evaluate(() => __dh.hv.map((h) => __dh.race.karts[h.i].kc));
await tick(3);
results.gasHeld = { phone: await Promise.all(phones.map((p) => p.evaluate(() => [__pad.mask(), __pad.sheetOpen, !!__pad.S.link, __pad.S.seat]))), game: await G.evaluate(() => [0, 1, 2, 3].map((k) => [__dh.pads.state[k].held, __dh.pads.connected(k), __dh.playerOfPhone(k) && __dh.num(__dh.playerOfPhone(k))])) };
const sync = [];
let want = [0, 0, 0, 0];
for (let f = 0; f < 600; f++) {
  // each phone steers toward the racing line ahead of its kart
  if (f % 6 === 0) {
    want = await G.evaluate(() => __dh.hv.map((h, j) => { const R = __dh.race, T = R.T, K = R.karts[h.i], k = (K.k + 14) % T.N; const tx = T.x[k] + (-T.tz[k]) * T.line[k], tz = T.z[k] + T.tx[k] * T.line[k]; const a = Math.atan2(tx - K.x, tz - K.z), d = Math.atan2(Math.sin(a - K.yaw), Math.cos(a - K.yaw)); return Math.max(-1, Math.min(1, -d * (j === 2 ? 1.4 : 2.2))); }));
    for (let n = 0; n < 4; n++) {
      if (!phones[n].T.has(2)) await down(phones[n], 2, ...L.stick);
      await move(phones[n], 2, L.stick[0] + want[n] * 64, L.stick[1]);
    }
  }
  await tick(1);
  if (f % 60 === 0) sync.push(await G.evaluate(() => __dh.hv.map((h) => __dh.pads.state[__dh.humanP[h.j].phone]?.seq ?? -1)));
}
for (const p of phones) { if (p.T.has(3)) await up(p, 3); if (p.T.has(2)) await up(p, 2); }
const kc1 = await G.evaluate(() => __dh.hv.map((h) => __dh.race.karts[h.i].kc));
const prog = kc1.map((v, n) => v - kc0[n]);
results.sync = { progress: prog, seqSamples: sync.length };
ok(prog.every((d) => d > 150), `all four phone karts drove (${prog})`);
await step(0, true);
await G.screenshot({ path: path.join(out, '3-race-four-phones.png') });
await phones[0].screenshot({ path: path.join(out, 'phone-racing-stick.png') });

// 5b. loss + lag on every phone: taps still land (the press counters)
const lossy = [];
for (let n = 0; n < 4; n++) {
  await phones[n].close();
  phones[n] = await phone(`ph${n + 1}`, '&lag=50&jitter=40&loss=0.3');
}
await G.waitForFunction(() => [0, 1, 2, 3].every((k) => __dh.pads.connected(k)), null, { timeout: 20000 });
await tick(30);
results.reconnect = await G.evaluate(() => __dh.players.map((p) => p.phone));
ok(results.reconnect.join() === '0,1,2,3', `every phone came back to its own player: ${results.reconnect}`);
for (let n = 0; n < 4; n++) {
  let landed = 0;
  for (let r = 0; r < 6; r++) {
    await G.evaluate((j) => { const P = __dh.humanP[j].ctl; if (!P._s0) P._s0 = P.sample.bind(P); __dh._it = 0; P.sample = () => { const I = P._s0(); if (I.item) __dh._it++; return I; }; }, n);
    await tap(phones[n], ...L.super, 12, 4);
    await tick(14);
    landed += (await G.evaluate(() => __dh._it)) > 0 ? 1 : 0;
    await G.evaluate((j) => { const P = __dh.humanP[j].ctl; P.sample = P._s0; }, n);
  }
  lossy.push(landed);
}
results.lossyTaps = lossy;
ok(lossy.every((n) => n === 6), `taps through 30% loss + lag: ${lossy} of 6 each`);

// 6. haptics: an item hit buzzes that player's phone, only theirs
for (const p of phones) await p.evaluate(() => { window.__b0 = __pad.lastBuzz?.at || 0; });
await G.evaluate(() => { const H = __dh.hv[1], K = __dh.race.karts[H.i]; K.invT = 0; K.spinT = 0; __dh.race.hit(K, 'missile'); for (const e of __dh.race.events) __dh.onEvent(e); __dh.race.events.length = 0; });
await tick(20);
const buzzed = await Promise.all(phones.map((p) => p.evaluate(() => ({ kind: __pad.lastBuzz?.kind || null, fresh: (__pad.lastBuzz?.at || 0) > window.__b0 }))));
results.haptics = buzzed;
ok(buzzed[1].fresh && buzzed[1].kind === 'missile' && !buzzed[0].fresh && !buzzed[2].fresh && !buzzed[3].fresh, `a hit on P2 buzzes P2's phone only: ${JSON.stringify(buzzed)}`);

// 7. auto-gas from the sheet (phone 4): GAS held without a finger
await tap(phones[3], ...L.moves); await sleep(500);
await stripTap(phones[3], '#sh [data-auto="1"]'); await sleep(100);
await stripTap(phones[3], '#sh .x'); await sleep(500);
await tick(6);
const auto = await G.evaluate(() => { const s = __dh.pads.state[3]; return { held: s.held, gas: !!(s.held & 16) }; });
results.autoGas = auto;
ok(auto.gas, 'auto-gas: GAS held with no finger on it');
await stripTap(phones[3], '#hf'); // no-op
await tap(phones[3], ...L.moves); await sleep(400); await stripTap(phones[3], '#sh [data-auto="0"]'); await stripTap(phones[3], '#sh .x'); await sleep(400);

// 8. the phone page's frame rate while playing
const fps = await phones[0].evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
results.phoneFps = fps;

// the race's results reach the phones (the last-place roast on the last one's)
await G.evaluate(() => { const R = __dh.race; R._end(); __dh.resultsAt = __dh.t; __dh.toResults(); });
await tick(30);
const cards = await Promise.all(phones.map((p) => p.evaluate(() => ({ on: document.getElementById('ko').classList.contains('on'), text: document.querySelector('#ko .card').textContent }))));
results.cards = cards.map((c) => c.on);
ok(cards.every((c) => c.on), 'every phone gets its results card');
await phones[0].screenshot({ path: path.join(out, 'phone-results-card.png') });
await step(0, true);
await G.screenshot({ path: path.join(out, '4-results.png') });

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (problems.length) { console.log('\nPROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('\npad test OK — four phones in sync');
