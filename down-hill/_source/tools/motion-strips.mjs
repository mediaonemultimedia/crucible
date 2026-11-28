/* Motion strips: 12 frames at 30 fps of one moment, in real Chrome, with the
   page's CSS animations paused and stepped in time with the sim so stickers
   and badges are frame-true. Two passes: the first finds the moment's tick
   (the race is deterministic for a seed), the second replays to just before
   it and shoots.
     node tools/motion-strips.mjs <html> <outDir> [moment …]
   Moments: drift hit jump boost overtake countdown podium               */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

const [html, outDir, ...want] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const W = 960, H = 540;

const MOMENTS = {
  drift: { q: 'p1=k8e&p1cpu=hard&seed=7', find: 'e.k === "boost" && e.tier >= 2 && e.i === A.me', lead: 6 },
  hit: { q: 'p1=zach&p1cpu=normal&cpu=hard&seed=11', find: '(e.k === "hit" || e.k === "wallop-hit" || e.k === "eject") && e.i === A.me', lead: 6 },
  jump: { q: 'p1=kevalanche&p1cpu=hard&seed=3', find: 'e.k === "land" && e.i === A.me && e.hard > 0.35 && e.tick > 1200', lead: 7 },
  boost: { q: 'p1=sumaura&p1cpu=hard&seed=5', find: '(e.k === "trickBoost" || e.k === "pad") && e.i === A.me && e.tick > 900', lead: 3 },
  overtake: { q: 'p1=johnny&p1cpu=hard&cpu=easy&seed=8', find: 'e.k === "__overtake"', lead: 4 },
  countdown: { q: 'p1=rubberta&seed=2', find: 'e.k === "go"', lead: 8 },
  podium: { q: 'p1=sumaura&p1cpu=hard&seed=9&laps=1', podium: true },
};

async function open(q) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(html) + '?hold&noportraits&' + q);
  await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'));
  await p.waitForTimeout(900); // let the loading screen's fade finish before CSS is taken over
  if (process.env.CLEAN) await p.addStyleTag({ content: '#ui,#bubbles{visibility:hidden!important}' }); // judge the 3D motion alone
  await p.evaluate(async () => {
    await __dh.fx?.pipelineWarmup;
    // log every race event with its tick; synthesise "__overtake" when the player gains a place
    const A = __dh; window.__ev = [];
    const on = A.onEvent.bind(A);
    A.onEvent = (e) => { window.__ev.push({ ...e, tick: A.race?.tick }); return on(e); };
    let last = 0;
    const frame = A.frame.bind(A);
    A.frame = (dt, r) => { const out = frame(dt, r); const K = A.race?.karts[A.me]; if (K && A.race.phase === 'race' && A.race.tick > 360) { if (last && K.place < last) window.__ev.push({ k: '__overtake', i: A.me, tick: A.race.tick }); last = K.place; } return out; };
    // CSS animations are driven by hand from here on
    window.__css = (ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = (a.currentTime || 0) + ms; } };
  });
  return p;
}

for (const [name, M] of Object.entries(MOMENTS)) {
  if (want.length && !want.includes(name)) continue;
  try {
    let target = null;
    if (!M.podium) {
      const p = await open(M.q);
      target = await p.evaluate((find) => {
        const A = __dh, test = new Function('e', 'A', `return ${find}`);
        for (let n = 0; n < 60 * 150 && A.screen === 'race'; n++) { A.frame(1 / 60, false); const hit = window.__ev.find((e) => test(e, A)); if (hit) return hit.tick; }
        return null;
      }, M.find);
      await p.close();
      if (target == null) { console.log(`${name}: moment not found`); continue; }
    }
    const p = await open(M.q);
    await p.evaluate(({ target, lead, podium }) => {
      const A = __dh;
      if (podium) { for (let n = 0; n < 60 * 150 && A.screen === 'race'; n++) A.frame(1 / 60, false); }
      else while (A.race.tick < target - lead * 2) A.frame(1 / 60, false);
    }, { target, lead: M.lead, podium: M.podium });
    const frames = [];
    for (let f = 0; f < 12; f++) {
      await p.evaluate(() => { __dh.step(1 / 30); window.__css(1000 / 30); });
      const file = path.join(outDir, `${name}-${String(f).padStart(2, '0')}.png`);
      await p.screenshot({ path: file });
      frames.push(file);
    }
    await p.close();
    // a 4×3 contact strip
    execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs = sys.argv[2:]; ims = [Image.open(f) for f in fs]; w, h = ims[0].size
c = Image.new('RGB', (w * 4 // 2, h * 3 // 2), '#14121c')
for i, im in enumerate(ims):
  im = im.resize((w // 2, h // 2)); c.paste(im, ((i % 4) * w // 2, (i // 4) * h // 2))
  ImageDraw.Draw(c).text(((i % 4) * w // 2 + 6, (i // 4) * h // 2 + 4), str(i + 1), fill='#ffe14a')
c.save(sys.argv[1])
for f in fs:
  import os; os.remove(f)
`, path.join(outDir, name + '.png'), ...frames]);
    console.log('strip', name, target == null ? '' : `@tick ${target}`);
  } catch (e) { console.log(`${name}: ${e.message.split('\n')[0]}`); }
}
await browser.close();
