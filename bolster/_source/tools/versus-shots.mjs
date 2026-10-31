/* Versus on one keyboard, names and the leaderboard, in the browser:

     node tools/versus-shots.mjs [--html final.html] [--out shots/versus]

   1. the mode menu (Versus, Leaderboard), the name screen for two (player 1
      types a new name, player 2 picks a remembered one), the versus select
      with both controls cards, both players picking at once;
   2. a versus match driven by real key presses: player 1's G (light) and
      player 2's Num 4 (light) each move only their own fighter; the names on
      the HUD; the pause card;
   3. the match played out (a scripted finish), the win screen's record
      line, and the leaderboard it lands on; the reset's confirmation.
   Fails on any console error or a failed check. WebGL 2 on SwiftShader. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'versus')));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [], fails = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

// a device that's seen a few fights: two names remembered, a board with history
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('pillowfight.names.v1', JSON.stringify({ list: ['John', 'Sebas', 'Kevin'], last: ['Kevin', 'John'] }));
  const P = (name, w, l, d, pw, pl, streak, best, fluffless, fighters) => ({ name, w, l, d, pw, pl, streak, best, fluffless, fighters, last: 1 });
  localStorage.setItem('pillowfight.board.v1', JSON.stringify({ v: 1, players: {
    john: P('John', 9, 4, 1, 7, 3, 3, 5, 4, { johnny: 12, zach: 2 }),
    sebas: P('Sebas', 6, 7, 0, 3, 6, 0, 3, 1, { sebas: 11, rubberta: 2 }),
    kevin: P('Kevin', 5, 6, 1, 4, 5, 1, 2, 2, { kevalanche: 9, k8e: 3 }),
  } }));
});
await page.goto(`file://${html}?hold&noportraits`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
const step = (s, d = false) => page.evaluate(([s, d]) => window.__bolster.step(s, d), [s, d]);
const shot = async (n) => { await step(0, true); await page.screenshot({ path: path.join(out, `${n}.png`) }); };
const screen = () => page.evaluate(() => window.__bolster.screen);

// 1. title → mode (Versus is second)
await page.keyboard.press('Enter'); await step(0.1);
await page.keyboard.press('KeyS'); await step(0.05);
await shot('1-mode');
await page.keyboard.press('Enter'); await step(0.1);
check(await screen() === 'names', 'Versus opens the name screen');
// player 1: Kevin is pre-selected (his last); take "New name" instead and type one
const pre = await page.evaluate(() => document.querySelector('#np-row .np.on .nrow.sel')?.textContent);
check(/Kevin/.test(pre || ''), `player 1's last name is pre-selected (${pre})`);
await page.keyboard.press('KeyS'); await step(0.05);      // John, Sebas, Kevin, ＋ New name, No name
await page.keyboard.press('Enter'); await step(0.05);
await page.keyboard.type('Kevalanche Kev'); await step(0.05);
await shot('2-names-typing');
await page.keyboard.press('Enter'); await step(0.05);
// player 2: John pre-selected (his last), Enter
const pre2 = await page.evaluate(() => document.querySelector('#np-row .np.on .nrow.sel')?.textContent);
check(/John/.test(pre2 || ''), `player 2's last name is pre-selected (${pre2})`);
await shot('3-names-p2');
await page.keyboard.press('NumpadEnter'); await step(0.1);
check(await screen() === 'select', 'both named → select');
const players = await page.evaluate(() => window.__bolster.players);
check(players[0] === 'Kevalanche Kev' && players[1] === 'John', `seats: ${players}`);
const names = await page.evaluate(() => JSON.parse(localStorage.getItem('pillowfight.names.v1')));
check(names.list[0] === 'John' && names.list[1] === 'Kevalanche Kev' && names.last[0] === 'Kevalanche Kev', `names remembered: ${JSON.stringify(names)}`);

// the versus select: both at once — P1 D D, P2 ← (cursors), then both lock
await page.keyboard.press('KeyD'); await page.keyboard.press('KeyD');
await page.keyboard.press('ArrowRight');
await step(0.3);
const pick = await page.evaluate(() => window.__bolster.pick);
await shot('4-versus-select');
check(pick[0] === 2 && pick[1] === 2, `cursors: P1 on Johnny, P2 on Johnny (mirror) ${pick}`);
const card = await page.evaluate(() => document.querySelector('#controls-select').classList.contains('vs') && document.querySelector('#controls-select').textContent);
check(!!card && /Num 4/.test(card) && /G/.test(card), 'the versus controls card on the select screen');
await page.keyboard.press('KeyG'); await step(0.1);
await page.keyboard.press('Numpad4'); await step(1.2);
check(await screen() === 'fight', 'both locked → fight');

// 2. the match, by key presses
await page.evaluate(() => { const B = window.__bolster; for (let t = 0; t < 8 && B.fight.st.phase !== 'fight'; t += 1 / 60) B.frame(1 / 60, false); });
const press = async (code) => { await page.keyboard.down(code); await step(1 / 30); await page.keyboard.up(code); };
const acts = () => page.evaluate(() => window.__bolster.fight.st.f.map((f) => `${f.act}:${f.mv}`));
await press('KeyG'); const a1 = await acts();
check(/attack:light/.test(a1[0]) && !/attack/.test(a1[1]), `P1's G throws P1's light only (${a1})`);
await step(0.8);
await press('Numpad4'); const a2 = await acts();
check(/attack:light/.test(a2[1]) && !/attack/.test(a2[0]), `P2's Num 4 throws P2's light only (${a2})`);
await step(0.8);
await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowRight'); await step(0.25);
const x = await page.evaluate(() => window.__bolster.fight.st.f.map((f) => [f.act, f.vx]));
await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowRight');
check(/walk/.test(x[0][0]) && /walk/.test(x[1][0]), `both walk at once on one keyboard (${JSON.stringify(x)})`);
const hud = await page.evaluate(() => [document.querySelector('#pn1').textContent, document.querySelector('#pn2').textContent]);
check(hud[0] === 'Kevalanche Kev' && hud[1] === 'John', `names on the HUD: ${hud}`);
// mid-swing for the picture: both heavies
await page.evaluate(() => { const F = window.__bolster.fight, s = F.st; s.f[0].x = -2600; s.f[1].x = 2600; F.prev = s.f.map((f) => ({ x: f.x, y: f.y })); });
await step(0.4);
await page.keyboard.down('KeyH'); await page.keyboard.down('Numpad5'); await step(1 / 30); await page.keyboard.up('KeyH'); await page.keyboard.up('Numpad5');
await step(15 / 60);
await shot('5-versus-match');
await step(1);
await page.keyboard.press('Escape'); await step(0.1);
await shot('6-pause-versus');
check(await page.evaluate(() => document.querySelector('#controls-pause').classList.contains('vs')), 'the pause card shows both layouts');
await page.keyboard.press('Escape'); await step(0.1);

// 3. a quick finish (scripted: P1 K.O.s P2 twice), the win screen and the board
await page.evaluate(() => {
  const B = window.__bolster, F = B.fight;
  F.override = (st) => { if (st.phase === 'fight') { st.f[1].hp = Math.min(st.f[1].hp, 1); } const s = st.f; const near = Math.abs(s[0].x - s[1].x) < 2200; return [near ? (st.tick % 20 === 0 ? 16 : 0) : 2, 0]; };
  for (let t = 0; t < 40 && B.screen !== 'win'; t += 1 / 60) B.frame(1 / 60, false);
});
await step(1.5);
check(await screen() === 'win', 'the match ends on the win screen');
const win = await page.evaluate(() => ({ eyebrow: document.querySelector('#win-eyebrow').textContent, rec: document.querySelector('#win-record').textContent, board: JSON.parse(localStorage.getItem('pillowfight.board.v1')) }));
console.log(JSON.stringify({ eyebrow: win.eyebrow, rec: win.rec }));
check(/Kevalanche Kev wins/.test(win.eyebrow), 'the winner by name');
check(win.board.players['kevalanche kev']?.w === 1 && win.board.players.john?.l === 5 && win.board.players.john?.pl === 4, 'the board: a win for the new name, a loss for John (and vs people)');
check(win.board.players['kevalanche kev']?.fighters?.johnny === 1, 'favourite fighter counted');
await shot('7-win-record');
// the leaderboard from the menu
await page.evaluate(() => { const B = window.__bolster; B.fight?.dispose(); B.fight = null; B.go('mode'); });
await page.evaluate(() => document.querySelector('#mode-screen .opt[data-mode=board]').click()); await step(0.2);
check(await screen() === 'board', 'Leaderboard opens from the menu');
const rows = await page.evaluate(() => [...document.querySelectorAll('#board tr')].slice(1).map((r) => r.textContent));
console.log(rows);
check(rows.length === 4 && /John/.test(rows[0]) && /Big Pillow/.test(rows[0]), 'four names, John on top as the Big Pillow');
await shot('8-leaderboard');
await page.evaluate(() => document.querySelector('#board-screen .opt[data-act=reset]').click()); await step(0.1);
await shot('9-reset-confirm');
const still = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pillowfight.board.v1')).players).length);
check(still === 4, 'one press only arms the reset');
await page.evaluate(() => document.querySelector('#board-screen .opt[data-act=reset]').click()); await step(0.1);
const gone = await page.evaluate(() => [Object.keys(JSON.parse(localStorage.getItem('pillowfight.board.v1') || '{"players":{}}').players).length, document.querySelector('#board').textContent]);
check(gone[0] === 0 && /No fights on record/.test(gone[1]), 'the second press wipes it');
// names survive a reset of the board
check((await page.evaluate(() => JSON.parse(localStorage.getItem('pillowfight.names.v1')).list.length)) === 4, 'names kept after the reset');

// a deep-linked versus match for the picture with the cards' remap
await page.goto(`file://${html}?p1=sebas&p2=kevalanche&versus=1&n1=Sebas&n2=Kevin&hold&noportraits&seed=3`);
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
check((await page.evaluate(() => [window.__bolster.versus, document.querySelector('#pn1').textContent, document.querySelector('#pn2').textContent].join('|'))) === 'true|Sebas|Kevin', 'versus deep link with names');
await page.evaluate(() => { const B = window.__bolster; for (let t = 0; t < 8 && B.fight.st.phase !== 'fight'; t += 1 / 60) B.frame(1 / 60, false); });
await page.keyboard.press('Escape'); await step(0.1);
// rebind player 1's light to V by clicking its key, then pressing V
await page.evaluate(() => document.querySelector('#controls-pause button.cap[data-p="0"][data-a="light"]').click());
await page.keyboard.press('KeyV'); await step(0.05);
const rb = await page.evaluate(() => [window.__bolster.bind[0].light.join(), JSON.parse(localStorage.getItem('pillowfight.versusKeys.v1') || 'null')?.[0]?.light?.join()]);
check(rb[0] === 'KeyV' && rb[1] === 'KeyV', `rebound P1 light to V and saved (${rb})`);
await page.keyboard.press('Escape'); await step(0.1);
await press('KeyV'); const a3 = await acts();
check(/attack:light/.test(a3[0]), `V is player 1's light now (${a3})`);
await page.keyboard.press('Escape'); await step(0.1);
await page.evaluate(() => document.querySelector('#controls-pause button.rk').click());
check((await page.evaluate(() => window.__bolster.bind[0].light.join())) === 'KeyG', 'Reset keys');

console.log(errs.length ? `console errors: ${errs.join(' | ')}` : 'console errors: 0');
await browser.close();
process.exit(errs.length || fails.length ? 1 : 0);
