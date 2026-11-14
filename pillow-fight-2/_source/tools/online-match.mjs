/* Online, in the real page: two pages over the local loopback transport
   (?net=local — a BroadcastChannel, no network), one hosts, the other opens
   the share link; both pick on the shared select and lock in; then a CPU
   plays each side (through the rollback session, the keyboard's slot) for
   --minutes of match time (default 3.5), across as many matches as that
   takes (rematch → select → lock → fight). The sim hashes both peers
   exchange every second must agree; any desync, console error or network
   request fails it. Screenshots → shots/online/.

     node tools/online-match.mjs [--minutes 3.5] [--lag 30] [--html final.html]   */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MIN = +arg('minutes', 3.5), lag = arg('lag', null);
const html = path.resolve(arg('html', path.join(root, 'final.html')));
const out = path.join(root, 'shots', 'online');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error' || /desync/.test(m.text())) errs.push(`${who}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`${who}: ${e}`));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push(`${who}: NETWORK ${r.url()}`); });
};
const base = `file://${html}`;
const q = `net=local${lag ? `&lag=${lag}` : ''}`;
const step = (p, s, d = false) => p.evaluate(([s, d]) => __pf2.step(s, d), [s, d]);
const shot = async (name) => {
  await Promise.all([step(A, 0, true), step(B, 0, true)]);
  await A.screenshot({ path: path.join(out, `${name}-host.jpg`), type: 'jpeg', quality: 80, timeout: 240000 });
  await B.screenshot({ path: path.join(out, `${name}-guest.jpg`), type: 'jpeg', quality: 80, timeout: 240000 });
};

const A = await ctx.newPage(); watch(A, 'host');
await A.goto(`${base}?${q}&hold&webgl&noportraits`);
await A.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
// title → mode → Online → Host
await A.keyboard.press('Enter'); await step(A, 0.1);
for (let i = 0; i < 3; i++) await A.keyboard.press('KeyS');
await A.keyboard.press('Enter'); await step(A, 0.1);
if (await A.evaluate(() => __pf2.screen) !== 'online') throw new Error('Online did not open');
await step(A, 0, true);
await A.screenshot({ path: path.join(out, '0-online-menu.jpg'), type: 'jpeg', quality: 80 });
await A.keyboard.press('Enter');
await A.waitForFunction(() => /room=/.test(document.querySelector('#ol-link').value), null, { timeout: 30000 });
const link = await A.evaluate(() => document.querySelector('#ol-link').value);
console.log('share link', link);
await step(A, 0, true);
await A.screenshot({ path: path.join(out, '1-share-link-host.jpg'), type: 'jpeg', quality: 80 });

const B = await ctx.newPage(); watch(B, 'guest');
await B.goto(link.replace(/^.*\?/, `${base}?`) + '&hold&webgl&noportraits');
await B.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
await step(B, 0, true);
await B.screenshot({ path: path.join(out, '2-joining-guest.jpg'), type: 'jpeg', quality: 80 });
await B.waitForFunction(() => __pf2.screen === 'select', null, { timeout: 30000 });
await A.waitForFunction(() => __pf2.screen === 'select', null, { timeout: 30000 });

const PAIRS = [['kevalanche', 'k8e'], ['rubberta', 'sebas'], ['zach', 'sumaura'], ['johnny', 'kevalanche']];
const ROSTER = await A.evaluate(() => __pf2.ROSTER);
let played = 0, matches = 0, checked = 0;
while (played < MIN * 3600) {
  const [p1, p2] = PAIRS[matches % PAIRS.length];
  for (const [P, k, id] of [[A, 0, p1], [B, 1, p2]]) {
    const cur = await P.evaluate((k) => __pf2.pick[k], k);
    for (let i = cur; i !== ROSTER.indexOf(id); i = (i + 1) % ROSTER.length) await P.keyboard.press('KeyD');
  }
  for (let i = 0; i < 3; i++) { await step(A, 0.1); await step(B, 0.1); }
  if (matches === 0) await shot('3-select');
  await A.keyboard.press('KeyO'); for (let i = 0; i < 2; i++) { await step(A, 0.1); await step(B, 0.1); }
  if (matches === 0) await shot('4-select-host-locked');
  await B.keyboard.press('KeyO');
  for (let i = 0; i < 20 && !(await A.evaluate(() => !!__pf2.fight?.session)) ; i++) { await step(A, 0.1); await step(B, 0.1); }
  for (let i = 0; i < 20 && !(await B.evaluate(() => !!__pf2.fight?.session)) ; i++) { await step(A, 0.1); await step(B, 0.1); }
  // CPUs take the keyboards' place (each side only its own player)
  for (const [P, k] of [[A, 0], [B, 1]]) {
    await P.evaluate(([k, s]) => { const c = __pf2.cpuFor(k, k ? 'normal' : 'hard', s); __pf2.fight.override = (st) => (k ? [null, c.input(st)] : [c.input(st), null]); }, [k, 100 + matches]);
  }
  let shotMid = matches === 0;
  for (let n = 0; n < 900; n++) {
    await step(A, 0.25); await step(B, 0.25);
    const s = await Promise.all([A, B].map((P) => P.evaluate(() => { const S = __pf2.fight?.session; return S ? { f: S.frame, c: S.stats.checked || 0, d: S.desync, ph: S.st.phase, scr: __pf2.screen } : { scr: __pf2.screen }; })));
    if (s.some((x) => x.d)) { errs.push(`desync ${JSON.stringify(s)}`); break; }
    if (shotMid && s[0].f > 1500) { shotMid = false; await shot('5-mid-fight'); }
    if (s[0].ph === 'end' && s[1].ph === 'end' && s[0].scr === 'win' && s[1].scr === 'win') {
      played += Math.min(s[0].f, s[1].f); checked += Math.min(s[0].c, s[1].c);
      console.log(`match ${matches + 1}: ${p1} v ${p2}, ${s[0].f} ticks, hash checks ${s[0].c}/${s[1].c}, played ${(played / 3600).toFixed(2)} min`);
      break;
    }
    if (n === 899) errs.push(`match ${matches + 1} did not finish: ${JSON.stringify(s)}`);
  }
  if (errs.length) break;
  if (matches === 0) await shot('6-winner');
  matches++;
  if (played >= MIN * 3600) break;
  // rematch (the host's Yes): both back to the shared select
  await A.evaluate(() => document.querySelector('#win-screen .opt.yes').click());
  for (let i = 0; i < 4; i++) { await step(A, 0.1); await step(B, 0.1); }
  const scr = await Promise.all([A, B].map((P) => P.evaluate(() => __pf2.screen)));
  if (scr.join() !== 'select,select') { errs.push(`rematch: ${scr}`); break; }
}
// the guest leaves: the host is told
await B.keyboard.press('Escape'); await step(B, 0.2);
for (let i = 0; i < 5; i++) await step(A, 0.1);
const left = await A.evaluate(() => [__pf2.screen, document.querySelector('#ol-err').textContent]);
console.log('guest left → host sees', JSON.stringify(left));
if (left[0] !== 'online') errs.push(`host after the guest left: ${left}`);
await step(A, 0, true); await A.screenshot({ path: path.join(out, '7-opponent-left-host.jpg'), type: 'jpeg', quality: 80 });
console.log(`online: ${matches} matches, ${(played / 3600).toFixed(2)} minutes of play in sync, ${checked} hash checks`);
if (played < MIN * 3600) errs.push(`only ${(played / 3600).toFixed(2)} minutes played`);
await browser.close();
if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
console.log('online OK');
