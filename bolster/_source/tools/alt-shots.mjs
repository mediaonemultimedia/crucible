/* OG / ALT and the practice keys, the evidence → shots/polish/:
   the character select with the switch on OG and on ALT (vs Computer, and
   versus with one player ALT), a non-mirror match with one player on ALT,
   practice with the keyboard panel shown and hidden (K).

     node tools/alt-shots.mjs [--html final.html] [--out shots/polish]

   WebGL 2 on SwiftShader; fails on any console error. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'polish')));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [], reqs = [];
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${q}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`${q}: ${e}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) reqs.push(u); });
  await page.goto(`file://${html}?${q}&hold`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 300000 });
  return page;
}
const step = (p, s, draw = true) => p.evaluate(([a, d]) => window.__bolster.step(a, d), [s, draw]);
const shot = (p, n) => p.screenshot({ path: path.join(out, `${n}.png`) });
const check = [];

// ── vs Computer select: Sebas OG, then W → ALT; then the computer's pick
{
  const p = await open('screen=select');
  await p.evaluate(() => { const B = window.__bolster; B._setPick(0, 5); B._paintSelect(); }); await step(p, 1.2);
  await shot(p, 'select-og');
  await p.keyboard.press('KeyW'); await step(p, 1.2);
  check.push(['select ALT', await p.evaluate(() => ({ alt: window.__bolster.variants()[0], lab: document.querySelector('.card.c1 .lab').textContent, plate: document.querySelector('.plate.p1 .tw').textContent }))]);
  await shot(p, 'select-alt');
  // P1 locks Sebas ALT; the computer's cursor onto Sebas too: the mirror rule flips it to OG
  await p.keyboard.press('KeyO'); await step(p, 0.2);
  await p.evaluate(() => { const B = window.__bolster; B._setPick(1, 5); B.alt[1] = true; B._paintSelect(); });
  await step(p, 1.2);
  check.push(['mirror flip', await p.evaluate(() => window.__bolster.variants())]);
  await shot(p, 'select-mirror-flip');
  // a click on OG / ALT (the computer's switch) on another fighter
  await p.evaluate(() => { const B = window.__bolster; B._setPick(1, 6); B._paintSelect(); });
  await p.click('.card.c2 .ogalt.p2 b[data-v="1"]'); await step(p, 1.2);
  check.push(['click ALT', await p.evaluate(() => window.__bolster.variants())]);
  await shot(p, 'select-cpu-alt');
  await p.close();
}

// ── versus on one keyboard: P2 flips to ALT with their own up key
{
  const p = await open('screen=select');
  await p.evaluate(() => { const B = window.__bolster; B.mode = 'versus'; B.players = ['Kevin', 'John']; B.go('select'); B._setPick(0, 0); B._setPick(1, 3); B._paintSelect(); });
  await p.keyboard.press('ArrowUp'); await step(p, 1.2);
  check.push(['versus P2 ALT', await p.evaluate(() => window.__bolster.variants())]);
  await shot(p, 'select-versus-p2-alt');
  await p.close();
}

// ── a non-mirror match, player 2 on ALT (Kevalanche v the Sith Johnny)
{
  const p = await open('p1=kevalanche&p2=johnny&alt2=1&seed=9&cpu=normal&p1cpu=normal');
  await step(p, 6, false); await step(p, 0.05);
  check.push(['match', await p.evaluate(() => ({ evil: window.__bolster.fight.evil, names: [0, 1].map((k) => window.__bolster.fight.name(k)) }))]);
  await shot(p, 'match-p2-alt');
  await p.close();
}

// ── practice: the keyboard panel (default on), then K hides it
{
  const p = await open('practice=zach&dummy=sebas&alt2=1');
  await step(p, 2.5);
  await shot(p, 'practice-keys-shown');
  await p.keyboard.press('KeyK'); await step(p, 0.3);
  check.push(['practice K', await p.evaluate(() => ({ hidden: document.body.classList.contains('pr-nokeys'), svg: !!document.querySelector('#pr-keys svg') }))]);
  await shot(p, 'practice-keys-hidden');
  await p.keyboard.press('KeyK'); await step(p, 0.3);
  check.push(['practice K again', await p.evaluate(() => !!document.querySelector('#pr-keys svg'))]);
  await p.close();
}

for (const c of check) console.log(c[0], JSON.stringify(c[1]));
console.log(errs.length ? `console errors:\n${errs.join('\n')}` : 'no console errors');
console.log(reqs.length ? `network requests:\n${reqs.join('\n')}` : 'no network requests');
await browser.close();
process.exit(errs.length || reqs.length ? 1 : 0);
