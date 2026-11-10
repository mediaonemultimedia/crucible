/* The UI personality pass's evidence (bolster-ui): the pillow buttons
   (idle, hover, pressed), taunt captions in a match, the VS card, the loss
   drain and the rematch prompt.

     node tools/ui-shots.mjs [--html final.html] [--out shots/ui] [scene …]

   Fails on any console error, any network request, or a failed check. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'ui')));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let bad = 0;
const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) bad++; };

async function open(q, vp = { width: 1440, height: 810 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push('network request: ' + r.url()); });
  await page.goto(`file://${html}?${q}${q ? '&' : ''}hold&webgl`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  const step = (s, d = false) => page.evaluate(([s, d]) => window.__bolster.step(s, d), [s, d]);
  const shot = async (n, clip) => { await step(0, true); await page.screenshot({ path: path.join(out, `${n}.png`), clip, timeout: 240000 }); console.log('  shot', n); };
  const done = async () => { if (errs.length) { console.log('  ERRORS:\n    ' + errs.join('\n    ')); bad += errs.length; } await page.close(); };
  return { page, errs, step, shot, done };
}

const want = args.length ? args : null;
const run = (n) => !want || want.includes(n);

// ── the pillow buttons: idle, hover, pressed
if (run('buttons')) {
  const T = await open('noportraits');
  const { page, step, shot } = T;
  await page.evaluate(() => window.__bolster.go('mode'));
  await step(0.3);
  const clip = await page.evaluate(() => { const r = document.querySelector('#mode-screen .menu').getBoundingClientRect(); return { x: r.x - 40, y: r.y - 30, width: r.width + 80, height: r.height + 60 }; });
  await page.mouse.move(5, 5);
  await shot('buttons-idle', clip);
  const b = await page.$('#mode-screen .opt[data-mode=practice]');
  await b.hover(); await page.waitForTimeout(300);
  await shot('buttons-hover', clip);
  const bb = await b.boundingBox();
  await page.mouse.down(); await page.waitForTimeout(120);
  await shot('buttons-pressed', clip);
  const tf = await page.evaluate(() => getComputedStyle(document.querySelector('#mode-screen .opt[data-mode=practice]')).transform);
  check(tf !== 'none', `pressed button is squashed (${tf})`);
  await page.mouse.move(bb.x - 300, bb.y); await page.mouse.up();
  await shot('buttons-full');
  await T.done();
}

const PRE = `
  window.B = window.__bolster; window.F = () => B.fight; window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
  window.tauntUp = () => !!document.querySelector('.bubble.taunt:not(.out)');
`;
const R = 2, L = 1, LIGHT = 16, HEAVY = 32, SPECIAL = 64, BLOCK = 128;
const fightQ = (p1, p2) => `p1=${p1}&p2=${p2}&cpu=normal&p1cpu=normal&seed=7&noportraits`;

// ── taunts: mashing, turtling, a whiffed special
const TAUNT_SCENES = {
  'taunt-mash': { q: fightQ('kevalanche', 'sumaura'), run: `toFight(); F().cpu = [null, null]; place(-1500, 1100);
      script((i, st) => [i % 4 === 0 ? ${LIGHT} : 0, 0]); return until(tauntUp, 6)` },
  'taunt-turtle': { q: fightQ('rubberta', 'johnny'), run: `toFight(); F().cpu = [null, null]; place(-1800, 1800);
      script((i) => [${BLOCK}, i % 70 === 20 ? ${R} : 0]); return until(tauntUp, 8)` },
  'taunt-whiff': { q: fightQ('sumaura', 'zach'), run: `toFight(); F().cpu = [null, null]; place(-5200, 5200); ST().f[0].meter = 1000;
      script((i) => [i === 2 ? ${SPECIAL} : 0, 0]); return until(tauntUp, 4)` },
  'taunt-spam': { q: fightQ('johnny', 'k8e'), run: `toFight(); F().cpu = [null, null]; place(-2600, 2600);
      script((i) => [i % 50 === 1 ? ${HEAVY} : 0, 0]); return until(tauntUp, 6)` },
};
for (const [name, S] of Object.entries(TAUNT_SCENES)) {
  if (!run(name) && !run('taunts')) continue;
  const T = await open(S.q);
  await T.page.evaluate(PRE);
  const ok = await T.page.evaluate(`(() => { ${S.run} })()`);
  check(ok, `${name}: a taunt caption is up`);
  if (!ok) { await T.done(); continue; }
  const info = await T.page.evaluate(() => { const b = document.querySelector('.bubble.taunt'); const r = b.querySelector('svg').getBoundingClientRect(); const h = document.querySelector('#hud .top').getBoundingClientRect(); return { kind: b.dataset.kind, text: b.textContent, top: r.top, hud: h.bottom, left: r.left, right: r.right }; });
  check(info.top >= info.hud, `${name}: "${info.text}" (${info.kind}) sits under the health bars (${info.top.toFixed(0)} ≥ ${info.hud.toFixed(0)})`);
  check(info.left >= 0 && info.right <= 1440, `${name}: on screen`);
  await T.page.waitForTimeout(650);
  await T.shot(name);
  await T.done();
}

// ── the VS card: versus, two names (one with wins on the board), player 2 in ALT
if (run('vs')) {
  const T = await open('screen=board');
  const { page, step, shot } = T;
  await page.evaluate(() => localStorage.setItem('pillowfight.board.v1', JSON.stringify({ v: 1, players: { kevin: { name: 'Kevin', w: 3, l: 1, d: 0, pw: 3, pl: 1, streak: 2, best: 2, fluffless: 1, fighters: { kevalanche: 4 }, last: 1 } } })));
  await page.evaluate(PRE);
  await page.evaluate(() => { B.mode = 'versus'; B.players = ['Kevin', 'John']; B.go('select'); B.step(0.4); B._cursor(1, 1); B.step(0.1); B._toggleAlt(1); B.step(0.4); B._lock(0); B._lock(1); B.step(0.6); });
  check(await page.evaluate(() => !!B.vs && B.screen === 'fight' && document.querySelector('#vs').classList.contains('on')), 'the VS card is up after select');
  check(await page.evaluate(() => B.fight.st.tick === 0 && B.fight.paused), 'offline: the fight waits at tick 0 under it');
  check(await page.evaluate(() => document.querySelectorAll('#vs .pt canvas.in').length === 2), 'both portraits (the picks as they stood)');
  const txt = await page.evaluate(() => document.querySelector('#vs').innerText.replace(/\s+/g, ' '));
  check(/Kevin · 3 wins/i.test(txt) && /ALT/.test(txt) && /OG/.test(txt) && /Evil/i.test(txt), `names, OG / ALT, wins: ${txt}`);
  await page.waitForTimeout(450);
  await shot('vs-card');
  await page.keyboard.press('KeyK');
  await step(0.05);
  check(await page.evaluate(() => !B.vs && !B.fight.paused), 'any key skips it and the fight goes on');
  await step(1);
  check(await page.evaluate(() => B.fight.st.tick > 30), 'the fight runs after');
  await T.done();
  // and on its own: gone after ~1.5 s
  const U = await open('screen=select&noportraits');
  await U.page.evaluate(PRE);
  await U.page.evaluate(() => { B._lock(); B._lock(); document.querySelector('#diff-screen .opt[data-level=normal]').click(); });
  check(await U.page.evaluate(() => !!B.vs), 'vs computer: the card after the difficulty pick');
  await U.step(1.4);
  check(await U.page.evaluate(() => !!B.vs), 'still up at 1.4 s');
  await U.step(0.2);
  check(await U.page.evaluate(() => !B.vs && !B.fight.paused), 'gone by 1.6 s, fight on');
  await U.done();
}

// ── the loss moment, then the rematch prompt
if (run('loss')) {
  const T = await open(fightQ('kevalanche', 'rubberta'));
  const { page, step, shot } = T;
  await page.evaluate(PRE);
  await page.evaluate(() => { toFight(); F().cpu = [null, null]; place(-1500, 900); ST().f[1].hp = 1; ST().wins = [1, 0]; ST().egg = 0;
    script((i) => [i === 1 ? 32 : 0, 0]); until(() => ST().phase === 'end', 8); B.step(0.5); });
  check(await page.evaluate(() => document.querySelector('#drain').className), 'the drain is on (the loser’s side)');
  check(await page.evaluate(() => document.querySelector('#drain').classList.contains('r') && B.fight.plush[1].deflateTarget >= 0.3), 'loser on the right: right side drained, plush slumped');
  await page.waitForTimeout(700);
  await shot('loss-drain');
  await page.evaluate(() => { until(() => B.screen === 'win', 3); B.step(1.6); });
  await page.waitForTimeout(800);
  check(await page.evaluate(() => !!document.querySelector('.bubble') && /Rematch\?/i.test(document.querySelector('#win-screen').innerText)), 'winner quote + Rematch? prompt');
  await shot('rematch');
  await page.mouse.move(5, 5);
  const yes = await page.$('#win-screen .opt.no'); await yes.hover(); await page.waitForTimeout(250);
  await shot('rematch-no');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await step(0.1);
  check(await page.evaluate(() => B.screen === 'fight' && !B.vs && document.querySelector('#drain').className === ''), 'YES: the rematch starts straight away (no VS card, drain cleared)');
  await T.done();
}

await browser.close();
console.log(bad ? `${bad} problems` : 'all good, zero console errors');
process.exit(bad ? 1 : 0);
