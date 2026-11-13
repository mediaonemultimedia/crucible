/* The fixes pass's select-screen evidence → shots/fixes/:
     select-og.png       Vs Computer, P1 on Zach Sparrow (OG), the computer on Sumaura
     select-alt.png      the same with both picks flipped to ALT (the twins' card portraits)
     select-versus.png   Versus, a mirror (both on Zach: the second seat flipped to ALT)
     select-practice.png Practice, P1 on Kevalanche ALT (the hockey goon)
     cards.png           every card portrait: the OG row, then the twins' row
   The page is opened the way a player meets it (the title first) and the
   select screen reached before the portraits are done (the race behind the
   panda on Zach's card). Each shot also checks every card's picture is its
   own fighter's, in the variant the card shows; exits 1 on a mismatch or a
   console error. WebGL 2 on SwiftShader.
     node tools/fixes-shots.mjs [--html F] [--out D]                       */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(arg('--html', path.join(root, 'final.html')));
const out = path.resolve(arg('--out', path.join(root, 'shots', 'fixes')));
fs.mkdirSync(out, { recursive: true });
const ROSTER = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e', 'sebas', 'zach'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`file://${html}?hold&webgl&seed=3`);
await page.waitForFunction(() => window.__bolster, null, { timeout: 120000 });
await page.evaluate(() => { const B = window.__bolster; B.mode = 'cpu'; B.go('select'); B._setPick(0, 3); B._paintSelect(); });
await page.waitForFunction(() => Object.keys(window.__bolster.portraits || {}).length >= 7, null, { timeout: 300000 });

const CHECK = `(() => {
  const B = window.__bolster, bad = [];
  for (const c of document.querySelectorAll('#cards .card')) {
    const id = c.dataset.id, im = c.querySelector(':scope > img'), alt = c.classList.contains('alt');
    const want = alt && B.twinPortraits[id] ? B.twinPortraits[id] : B.portraits[id];
    if (!im || im.dataset.id !== id || im.getAttribute('src') !== want) bad.push(id + (alt ? ' ALT' : ' OG'));
  }
  return bad;
})()`;
let bad = 0;
const shot = async (name, js, t = 1.2) => {
  await page.evaluate(`(() => { const B = window.__bolster; ${js}; B.step(${t}); })()`);
  await page.waitForTimeout(300);
  const wrong = await page.evaluate(CHECK);
  if (wrong.length) { console.log(name, 'WRONG CARDS', wrong); bad++; }
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(name, wrong.length ? 'bad' : 'ok');
};
// the twins' portraits: every fighter stands on the mat as its twin once
await page.evaluate(`(() => { const B = window.__bolster; for (let i = 0; i < 7; i++) { B._setPick(0, i); B.alt[0] = true; B._paintSelect(); B.step(0.6); } })()`);
await shot('select-og', `B.mode = 'cpu'; B.go('select'); B._setPick(0, 6); B.alt[0] = false; B._paintSelect(); B._lock(0); B._setPick(1, 3); B.alt[1] = false; B._paintSelect()`);
await shot('select-alt', `B._setAlt(1, true); B.picking = 0; B.locked[0] = false; B._setAlt(0, true); B._lock(0)`);
await shot('select-versus', `B.mode = 'versus'; B.go('select'); B._setPick(0, 6); B._setPick(1, 6); B.alt = [false, false]; B._paintSelect()`);
await shot('select-practice', `B.mode = 'practice'; B.go('select'); B._setPick(0, 0); B.alt[0] = true; B._paintSelect()`);
// every card portrait, OG over ALT
const sheet = await page.evaluate(async (ids) => {
  const B = window.__bolster, W = 256, H = 320, c = document.createElement('canvas');
  c.width = W * ids.length; c.height = H * 2 + 40;
  const g = c.getContext('2d'); g.fillStyle = '#120d1f'; g.fillRect(0, 0, c.width, c.height);
  for (const [row, P] of [[0, B.portraits], [1, B.twinPortraits]]) for (let i = 0; i < ids.length; i++) {
    if (!P[ids[i]]) continue;
    const im = new Image(); im.src = P[ids[i]]; await im.decode(); g.drawImage(im, i * W, row * (H + 40), W, H);
  }
  g.fillStyle = '#fff'; g.font = '700 22px sans-serif';
  ids.forEach((id, i) => g.fillText(id + '  OG ↑  ALT ↓', i * W + 10, H + 28));
  return c.toDataURL('image/png');
}, ROSTER);
fs.writeFileSync(path.join(out, 'cards.png'), Buffer.from(sheet.split(',')[1], 'base64'));
console.log('cards ok; console errors', errors.length ? errors : 'none');
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
