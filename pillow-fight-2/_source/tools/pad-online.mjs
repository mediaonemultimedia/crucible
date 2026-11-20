/* Online with phone pads: two game pages over the local loopback (?net=local,
   the rollback session as in tools/online-match.mjs), each with its own pad
   room and one phone (simulated, touch through CDP) whose links carry
   injected lag + jitter + loss. The phones play the match — random stick
   directions and buttons, held and tapped — and the sim hashes the two
   peers swap every second must agree throughout. Any desync, console error
   or network request fails it.
     node tools/pad-online.mjs [--seconds 60] [--html final.html]          */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = +arg('seconds', 60);
const html = path.resolve(arg('html', path.join(root, 'final.html')));
const ART = 'docs/friday-nov20/backgrounds/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error' || /desync/.test(m.text())) errs.push(`${who}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`${who}: ${e}`));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push(`${who}: NETWORK ${r.url()}`); });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `file://${html}`;
const step = (p, s) => p.evaluate((s) => __pf2.step(s, false), s);

const A = await ctx.newPage(); watch(A, 'host');
await A.goto(`${base}?net=local&lag=20&pads=1&hold&webgl&noportraits`);
await A.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
await A.keyboard.press('Enter'); await step(A, 0.1);
for (let i = 0; i < 3; i++) await A.keyboard.press('KeyS');
await A.keyboard.press('Enter'); await step(A, 0.1);
await A.keyboard.press('Enter');
await A.waitForFunction(() => /room=/.test(document.querySelector('#ol-link').value), null, { timeout: 30000 });
const link = await A.evaluate(() => document.querySelector('#ol-link').value);
const B = await ctx.newPage(); watch(B, 'guest');
await B.goto(link.replace(/^.*\?/, `${base}?`) + '&pads=1&hold&webgl&noportraits');
await B.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
await B.waitForFunction(() => __pf2.screen === 'select', null, { timeout: 30000 });
await A.waitForFunction(() => __pf2.screen === 'select', null, { timeout: 30000 });
for (const P of [A, B]) await P.waitForFunction(() => __pf2.pads.status === 'ready', null, { timeout: 20000 });

// a phone per game page, its link shaped
async function phone(game, name) {
  const code = await game.evaluate(() => __pf2.pads.code);
  const p = await ctx.newPage(); watch(p, name);
  await p.setViewportSize({ width: 844, height: 390 });
  await p.goto(`${base}?pad=${code}&net=local&art=${ART}&nofs&uid=${name}&lag=25&jitter=30&loss=0.15`);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  p.cdp = cdp;
  await game.waitForFunction(() => __pf2.pads.connected(0), null, { timeout: 15000 });
  p.sx = await p.evaluate(() => { const s = document.getElementById('s'), m = s.getScreenCTM(); return [m.a, m.e, m.d, m.f]; });
  return p;
}
const PA = await phone(A, 'phoneA'), PB = await phone(B, 'phoneB');
const scr = (p, x, y) => ({ x: p.sx[0] * x + p.sx[1], y: p.sx[2] * y + p.sx[3] });
const BTN = [[1550, 425], [1762, 361], [1979, 348], [1550, 692], [1764, 637], [1979, 626], [1097, 550]];
const ST = [604, 517];

// pick and lock from the phones (BOP locks; the phone's strip / stick move the cursor)
const touchTap = async (p, x, y) => { const q = scr(p, x, y); await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...q, id: 1 }] }); await sleep(40); await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await touchTap(PA, ...BTN[0]); for (let i = 0; i < 3; i++) { await step(A, 0.1); await step(B, 0.1); await sleep(30); }
await touchTap(PB, ...BTN[0]);
for (let i = 0; i < 30 && !(await A.evaluate(() => !!__pf2.fight?.session)); i++) { await step(A, 0.1); await step(B, 0.1); await sleep(30); }
for (let i = 0; i < 30 && !(await B.evaluate(() => !!__pf2.fight?.session)); i++) { await step(A, 0.1); await step(B, 0.1); await sleep(30); }
if (!(await A.evaluate(() => !!__pf2.fight?.session)) || !(await B.evaluate(() => !!__pf2.fight?.session))) errs.push('the online match did not start from the phones');

// the phones play: per loop each phone changes something at random
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
async function play(p) {
  const pts = [];
  if (rnd() < 0.7) { const a = Math.floor(rnd() * 8) * Math.PI / 4; pts.push({ ...scr(p, ST[0] + Math.cos(a) * 80, ST[1] + Math.sin(a) * 80), id: 1 }); }
  if (rnd() < 0.5) { const b = BTN[Math.floor(rnd() * BTN.length)]; pts.push({ ...scr(p, b[0], b[1]), id: 2 }); }
  // lift everything, then put the new fingers down (a stick gesture starts where it lands: set the origin first)
  if (p.down) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  p.down = pts.length > 0;
  if (!pts.length) return;
  const start = pts.map((q) => (q.id === 1 ? { ...scr(p, ST[0], ST[1]), id: 1 } : q));
  await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
  if (pts[0].id === 1) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
}
const t0 = Date.now();
let ticks = 0, inputsSeen = [0, 0], last = null;
while (ticks < SECONDS * 60) {
  await Promise.all([play(PA), play(PB)]);
  for (let i = 0; i < 4; i++) { await step(A, 1 / 60); await step(B, 1 / 60); await sleep(8); ticks++; }
  const s = await Promise.all([A, B].map((P) => P.evaluate(() => { const f = __pf2.fight, S = f?.session; return S ? { f: S.frame, c: S.stats.checked || 0, d: !!S.desync || !!__pf2.net.desynced, ph: S.st.phase, li: f.lastInputs, scr: __pf2.screen } : { scr: __pf2.screen }; })));
  last = s;
  if (s.some((x) => x.d)) { errs.push(`desync ${JSON.stringify(s)}`); break; }
  if (s[0].li?.[0]) inputsSeen[0]++;
  if (s[1].li?.[1]) inputsSeen[1]++;
  if (s.some((x) => x.scr === 'win')) {
    // a match ended: rematch, pick, carry on
    await A.evaluate(() => document.querySelector('#win-screen .opt.yes')?.click());
    for (let i = 0; i < 6; i++) { await step(A, 0.1); await step(B, 0.1); await sleep(20); }
    await touchTap(PA, ...BTN[0]); await sleep(60); await touchTap(PB, ...BTN[0]);
    for (let i = 0; i < 30 && !(await A.evaluate(() => __pf2.screen === 'fight' && !!__pf2.fight?.session)); i++) { await step(A, 0.1); await step(B, 0.1); await sleep(30); }
  }
}
const sum = { seconds: +(ticks / 60).toFixed(1), wall: Math.round((Date.now() - t0) / 1000), hashChecks: last?.map((x) => x.c), phoneInputsSeen: inputsSeen, desync: last?.some((x) => x.d) };
console.log(JSON.stringify(sum));
if (!(sum.hashChecks?.[0] > 10 && sum.hashChecks?.[1] > 10)) errs.push(`too few hash checks ${sum.hashChecks}`);
if (!(inputsSeen[0] > 20 && inputsSeen[1] > 20)) errs.push(`phone inputs barely reached the sim: ${inputsSeen}`);
await browser.close();
if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
console.log('pad online OK: in sync');
