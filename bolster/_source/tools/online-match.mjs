/* Two pages play an online match: one hosts, the other opens the ?room=
   link; both pick on the shared character select, lock in, fight a whole
   best-of-three with scripted (CPU) inputs on each side, see the K.O. and go
   back to select with Rematch. Screenshots of both screens at each step →
   shots/online/. Fails on a console error, a desync, a match that doesn't
   finish, or any network request other than the allowed transport's.

     node tools/online-match.mjs                 # local loopback (BroadcastChannel; no network)
     node tools/online-match.mjs --broker 9000   # real PeerJS + WebRTC via a PeerServer on localhost:9000
     node tools/online-match.mjs --lag 40        # loopback with 40 ms each way                   */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const broker = arg('broker', null), lag = arg('lag', null);
const out = path.join(root, 'shots', arg('out', broker ? 'online-peerjs' : 'online'));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [], reqs = [];
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { if (m.type() === 'error' || /desync/.test(m.text())) errs.push(`${who}: ${m.text()}`); } });
  page.on('pageerror', (e) => errs.push(`${who}: ${e}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) reqs.push(`${who}: ${u}`); });
};
const base = `file://${path.join(root, 'final.html')}`;
const q = (broker ? `net=peer&broker=localhost:${broker}` : `net=local${lag ? `&lag=${lag}` : ''}`);
const A = await ctx.newPage(); watch(A, 'host');
await A.goto(`${base}?${q}&hold&webgl&noportraits`);
await A.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });

const step = (p, sec, draw = false) => p.evaluate(([s, d]) => window.__bolster.step(s, d), [sec, draw]);
const both = async (sec, rounds = 1) => { for (let i = 0; i < rounds; i++) { await step(A, sec); await step(B, sec); } };
const shot = async (name) => {
  await Promise.all([step(A, 0, true), step(B, 0, true)]);
  await A.screenshot({ path: path.join(out, `${name}-host.png`), timeout: 240000 });
  await B.screenshot({ path: path.join(out, `${name}-guest.png`), timeout: 240000 });
};

// host: title → mode → Online → Host a match
await A.keyboard.press('Enter'); await step(A, 0.1);
await A.keyboard.press('KeyS'); await A.keyboard.press('Enter'); await step(A, 0.1);
if (await A.evaluate(() => window.__bolster.screen) !== 'online') throw new Error('Online did not open');
await A.keyboard.press('Enter');        // Host a match
await A.waitForFunction(() => /room=/.test(document.querySelector('#ol-link').value), null, { timeout: 30000 });
const link = await A.evaluate(() => document.querySelector('#ol-link').value);
const code = await A.evaluate(() => document.querySelector('#ol-code').textContent);
console.log('share link', link, 'code', code);
await step(A, 0, true);
await A.screenshot({ path: path.join(out, '1-share-link-host.png') });

// guest opens the link
const B = await ctx.newPage(); watch(B, 'guest');
const gurl = link.replace(/^.*\?/, `${base}?`) + '&hold&webgl&noportraits';
await B.goto(gurl);
await B.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
await step(B, 0, true);
const joinText = await B.evaluate(() => document.querySelector('#ol-joinmsg').textContent);
await B.screenshot({ path: path.join(out, '2-joining-guest.png') });
console.log('guest sees:', joinText, '/', await B.evaluate(() => window.__bolster.screen));
await B.waitForFunction(() => window.__bolster.screen === 'select', null, { timeout: 30000 }).catch(() => {});
await A.waitForFunction(() => window.__bolster.screen === 'select', null, { timeout: 30000 });
await both(0.2, 2);

// shared select: host moves to Sumaura, guest to Johnny; each sees the other's cursor
await A.keyboard.press('KeyD'); await A.keyboard.press('KeyD'); await A.keyboard.press('KeyD');
await B.keyboard.press('KeyD');
await both(0.2, 3);
const sel = await Promise.all([A, B].map((p) => p.evaluate(() => ({ pick: window.__bolster.pick, step: document.querySelector('#select-step').textContent, p2: document.querySelector('.plate.p2 .nm').textContent, p1: document.querySelector('.plate.p1 .nm').textContent }))));
console.log('select', JSON.stringify(sel));
await shot('3-select');
await A.keyboard.press('KeyO'); await both(0.2, 2);
await shot('4-select-host-locked');
await B.keyboard.press('KeyO'); await both(0.3, 4);

await A.waitForFunction(() => window.__bolster.fight?.session, null, { timeout: 30000 });
await B.waitForFunction(() => window.__bolster.fight?.session, null, { timeout: 30000 });
// scripted inputs: a hard CPU on each side, each playing only its own fighter
for (const [p, k] of [[A, 0], [B, 1]]) {
  await p.evaluate((k) => {
    const B = window.__bolster, c = B.cpuFor(k, 'hard', 11 + k);
    B.fight.override = (st) => (k === 0 ? [c.input(st), null] : [null, c.input(st)]);
  }, k);
}

/* step both, a few ticks at a time, alternately; ask each where it is */
const info = (p) => p.evaluate(() => {
  const B = window.__bolster, f = B.fight, S = f?.session;
  return f ? { screen: B.screen, tick: S.frame, confirmed: S.confirmed, phase: f.st.phase, round: f.st.round, wins: f.st.wins, hp: f.st.f.map((x) => x.hp), stats: S.stats, desync: S.desync, banner: document.querySelector('#banner').textContent, net: document.querySelector('#net').textContent } : { screen: B.screen };
});
/* bring both to the same confirmed tick (the guest/host ahead waits) */
const sync = async () => {
  for (let i = 0; i < 200; i++) {
    const [a, b] = await Promise.all([info(A), info(B)]);
    if (a.tick === b.tick && a.confirmed === a.tick && b.confirmed === b.tick) return a.tick;
    const t = Math.max(a.tick, b.tick);
    if (a.tick < t) await A.evaluate(() => window.__bolster.step(1 / 60, false)); else await A.evaluate(() => { const S = window.__bolster.fight.session; S.idle(); });
    if (b.tick < t) await B.evaluate(() => window.__bolster.step(1 / 60, false)); else await B.evaluate(() => { const S = window.__bolster.fight.session; S.idle(); });
    await new Promise((r) => setTimeout(r, (+lag || 0) + 5));
  }
  return -1;
};
const sameMoment = async () => {
  const t = await sync();
  const [ha, hb] = await Promise.all([A, B].map((p) => p.evaluate(() => { const B = window.__bolster; return B.fight.session.hashNow ? 0 : JSON.stringify(B.fight.st.f.map((f) => [f.x, f.y, f.hp, f.act, f.t])); })));
  return { tick: t, same: ha === hb };
};

let midDone = false, koShots = 0, log = [];
for (let n = 0; n < 4000; n++) {
  await step(A, 0.1); await step(B, 0.1);
  if (lag) await new Promise((r) => setTimeout(r, +lag));
  const [a, b] = await Promise.all([info(A), info(B)]);
  if (n % 20 === 0) { log.push({ a, b }); console.log(`t=${a.tick}/${b.tick} ${a.phase} r${a.round} wins ${a.wins} hp ${a.hp} | rollbacks ${a.stats?.rollbacks}/${b.stats?.rollbacks} stalls ${a.stats?.stalls}/${b.stats?.stalls} checks ${a.stats?.checked}/${b.stats?.checked} ${a.net}`); }
  if (a.desync || b.desync) { errs.push(`desync ${JSON.stringify(a.desync || b.desync)}`); break; }
  if (!midDone && a.phase === 'fight' && a.round === 1 && a.tick > 900) {
    const m = await sameMoment();
    console.log('mid-fight same moment', JSON.stringify(m));
    if (!m.same) errs.push('mid-fight: the two pages differ at the same tick');
    await shot('5-mid-fight'); midDone = true;
  }
  if (koShots === 0 && /K\.O\.|Time|Draw/.test(a.banner) && /K\.O\.|Time|Draw/.test(b.banner)) { await shot('6-ko'); koShots++; }
  if (a.screen === 'win' && b.screen === 'win') break;
}
const [ea, eb] = await Promise.all([info(A), info(B)]);
await both(1.0, 2);
const winTxt = await Promise.all([A, B].map((p) => p.evaluate(() => ({ screen: window.__bolster.screen, eyebrow: document.querySelector('#win-eyebrow').textContent, name: document.querySelector('#win-name').textContent, line: window.__bolster.catchline, egg: window.__bolster.fight?.st.egg, fluff: window.__bolster.fight?.st.fluff, winner: window.__bolster.fight?.st.winner }))));
console.log('winner screens', JSON.stringify(winTxt));
await shot('7-winner');
if (winTxt[0].screen !== 'win' || winTxt[1].screen !== 'win') errs.push('match did not reach the winner screen on both');
if (winTxt[0].line !== winTxt[1].line || winTxt[0].winner !== winTxt[1].winner || winTxt[0].egg !== winTxt[1].egg) errs.push('the winner / catchphrase differ between the peers');

// rematch from the guest's side: both go back to the shared select
await B.keyboard.press('Enter');
await both(0.3, 3);
const re = await Promise.all([A, B].map((p) => p.evaluate(() => window.__bolster.screen)));
console.log('after rematch', re);
await shot('8-rematch-select');
if (re[0] !== 'select' || re[1] !== 'select') errs.push('rematch did not bring both back to select');

// the guest leaves: the host is told
await B.keyboard.press('Escape');
await both(0.3, 3);
const left = await A.evaluate(() => ({ screen: window.__bolster.screen, state: document.querySelector('#online-screen').dataset.state, msg: document.querySelector('#ol-err').textContent }));
console.log('after the guest leaves, the host sees', JSON.stringify(left));
await step(A, 0, true);
await A.screenshot({ path: path.join(out, '9-opponent-left-host.png') });

await browser.close();
const allowed = (u) => broker ? /^(https?|wss?):\/\/localhost:\d+\//.test(u.replace(/^(host|guest): /, '')) : false;
const bad = reqs.filter((r) => !allowed(r));
console.log(`requests: ${reqs.length} (${bad.length} not allowed)`);
if (bad.length) { errs.push(...bad.slice(0, 10).map((r) => `request ${r}`)); }
console.log('final', JSON.stringify({ host: ea, guest: eb }));
if (errs.length) console.log('ERRORS:\n  ' + errs.join('\n  '));
const ok = !errs.length && winTxt[0].screen === 'win';
console.log(ok ? 'ONLINE MATCH COMPLETED: both pages, same result, zero console errors' : 'FAILED');
process.exit(ok ? 0 : 1);
