/* Card portraits, in headless Chromium on the built page (final.html):
   every card shows its own fighter, in its own variant.

   The bug this guards: the title answers clicks while the portraits are
   still rendering, and a player who went straight on to character select
   had the select mat's plush standing at x = 0 inside every later portrait
   (Zach Sparrow's card came out as Sumaura's face). Here page A takes the
   portraits untouched (the reference), page B races to the select screen
   the moment the page answers, with Sumaura on the mat; each of B's
   portraits must match A's for the same fighter (and be nearer it than any
   other fighter's). Then B walks the select screen — Vs Computer, Versus,
   Practice, OG / ALT back and forth, the mirror rule's flip, back from a
   match — checking every card's picture is its own fighter's, OG or its
   twin's as the card shows.

   Skipped when there's no final.html (npm run build) or no Chromium.   */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.join(root, 'final.html');
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* skipped below */ }
const skip = !fs.existsSync(html) ? 'no final.html (npm run build)' : !chromium || !fs.existsSync(exe) ? 'no Chromium' : false;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const ROSTER = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e', 'sebas', 'zach'];

// each portrait as small grey-free RGB thumbnails (16 × 20), for comparing
const THUMBS = `(async (P) => {
  const out = {};
  for (const [id, url] of Object.entries(P)) {
    const im = new Image(); im.src = url; await im.decode();
    const c = document.createElement('canvas'); c.width = 16; c.height = 20;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, 16, 20);
    out[id] = Array.from(g.getImageData(0, 0, 16, 20).data);
  }
  return out;
})(window.__bolster.portraits)`;
const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) { s += Math.abs(a[i] - b[i]); n++; } return s / n; };

// every card: its picture is its own fighter's, in the variant the card shows
const CARDS = `(() => {
  const B = window.__bolster, bad = [];
  for (const c of document.querySelectorAll('#cards .card')) {
    const id = c.dataset.id, im = c.querySelector(':scope > img'), alt = c.classList.contains('alt');
    if (!im) { bad.push(id + ': no picture'); continue; }
    if (im.dataset.id !== id) bad.push(id + ': shows ' + im.dataset.id);
    const want = alt && B.twinPortraits[id] ? B.twinPortraits[id] : B.portraits[id];
    if (im.getAttribute('src') !== want) bad.push(id + (alt ? ' (ALT)' : ' (OG)') + ': not its own portrait');
    if (alt && B.twinPortraits[id] && im.dataset.v !== 'alt') bad.push(id + ': ALT card shows the OG');
    if (!alt && im.dataset.v !== 'og') bad.push(id + ': OG card shows the twin');
  }
  return bad;
})()`;

test('every card portrait is its own fighter and variant (even racing to the select screen)', { skip, timeout: 600000 }, async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ARGS });
  try {
    const errors = [];
    const open = async (q) => {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('file://' + html + q);
      await page.waitForFunction(() => window.__bolster, null, { timeout: 120000 });
      return page;
    };
    const ready = (page) => page.waitForFunction(() => Object.keys(window.__bolster.portraits || {}).length >= 7, null, { timeout: 300000 });

    // A: the reference, nobody touching anything
    const A = await open('?webgl&hold');
    await ready(A);
    const ref = await A.evaluate(THUMBS);
    await A.close();

    // B: straight to select the moment the page answers, Sumaura on the mat
    const B = await open('?webgl&hold');
    const early = await B.evaluate(() => Object.keys(window.__bolster.portraits).length);
    await B.evaluate(() => { const B = window.__bolster; B.mode = 'practice'; B.go('select'); B._setPick(0, 3); B._paintSelect(); });
    await ready(B);
    assert.equal(early, 0, 'the race: select was reached before the portraits were done');
    assert.equal(await B.evaluate(() => window.__bolster.screen), 'select', 'the player stays where they went (not sent back to the title)');
    const got = await B.evaluate(THUMBS);
    for (const id of ROSTER) {
      const own = diff(got[id], ref[id]);
      for (const other of ROSTER) if (other !== id) assert.ok(own < diff(got[id], ref[other]), `${id}'s portrait looks more like ${other}'s`);
      assert.ok(own < 12, `${id}'s portrait differs from the untouched one (${own.toFixed(1)})`);
    }
    assert.deepEqual(await B.evaluate(CARDS), [], 'cards filled in when the portraits arrived');

    // the select screen in each mode, OG / ALT both ways, the mirror flip, back from a match
    // (t: seconds to run the page after; a twin needs ~0.5 s on the mat to be snapped)
    const walk = async (label, js, t = 0) => {
      await B.evaluate(`(() => { const B = window.__bolster; ${js}; B.step(${t}); })()`);
      assert.deepEqual(await B.evaluate(CARDS), [], label);
    };
    // Vs Computer: every card, OG → ALT → OG → ALT
    await walk('cpu: enter', `B.mode = 'cpu'; B.go('select')`);
    for (let i = 0; i < 7; i++) {
      await walk(`cpu: P1 on ${ROSTER[i]} OG`, `B._setPick(0, ${i}); B.alt[0] = false; B._paintSelect()`);
      await walk(`cpu: P1 on ${ROSTER[i]} ALT`, `B._toggleAlt(0)`, 0.5);
      await walk(`cpu: P1 on ${ROSTER[i]} back to OG`, `B._toggleAlt(0)`);
      await walk(`cpu: P1 on ${ROSTER[i]} ALT again`, `B._toggleAlt(0)`);
    }
    // the computer's seat, practice and versus (both seats), Zach and Sumaura both ways
    await walk('cpu: the computer picks Zach ALT', `B._lock(0); B._setPick(1, 6); B.alt[1] = true; B._paintSelect()`);
    for (const mode of ['practice', 'versus']) {
      await walk(`${mode}: enter`, `B.mode = '${mode}'; B.go('select')`);
      for (const i of [6, 3]) for (const k of [0, 1]) {
        await walk(`${mode}: seat ${k + 1} on ${ROSTER[i]} OG`, `B._setPick(${k}, ${i}); B.alt[${k}] = false; B._paintSelect()`);
        await walk(`${mode}: seat ${k + 1} on ${ROSTER[i]} ALT`, `B._toggleAlt(${k})`);
        await walk(`${mode}: seat ${k + 1} on ${ROSTER[i]} OG again`, `B._toggleAlt(${k})`);
      }
    }
    // every twin got its own snapshot, distinct from its OG
    const twins = await B.evaluate(() => Object.keys(window.__bolster.twinPortraits).sort());
    assert.deepEqual(twins, [...ROSTER].sort());
    assert.ok(await B.evaluate(() => Object.keys(window.__bolster.twinPortraits).every((id) => window.__bolster.twinPortraits[id] !== window.__bolster.portraits[id])));
    // versus mirror: both on Zach, both OG → the second seat flips to ALT; the card shows both seats
    await walk('versus mirror flip', `B.mode = 'versus'; B.go('select'); B._setPick(0, 6); B._setPick(1, 6); B.alt = [false, false]; B._paintSelect()`, 0.5);
    // back from a match
    await walk('back from a match', `B.mode = 'cpu'; B.startFight({ p1: 'zach', p2: 'sumaura', level: 'easy', p1cpu: 'easy' }); B.step(1); B.go('select')`, 0.2);
    await walk('back from a match, Zach highlighted', `B._setPick(0, 6); B.alt[0] = false; B._paintSelect()`);
    assert.deepEqual(errors, [], 'console errors');
  } finally {
    await browser.close();
  }
});
