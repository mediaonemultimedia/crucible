// Evidence screenshots → ../shots/. node shots.mjs [only-these-names...]
// Real mouse input where it matters (dwell, ring, dry brush), one mouse step per rendered frame, so speeds are
// deterministic under ?fixed (1/60 s per frame) however slow the software rasteriser is.
import path from 'node:path';
import { launch, open, frames, playAndWait, HERE } from './lib.mjs';
const OUT = path.join(HERE, '..', 'shots');
const only = process.argv.slice(2);
const want = n => !only.length || only.includes(n);
const clean = errs => errs.filter(e => !/GPU stall due to ReadPixels/.test(e));
const b = await launch();
const log = {};
async function step(page, x, y) { await page.mouse.move(x, y); await frames(page, 1); }
async function drag(page, pts, perFrame) {        // move along a polyline at perFrame px per frame
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); await frames(page, 1);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / perFrame));
    for (let k = 1; k <= n; k++) await step(page, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
  }
  await page.mouse.up();
}
async function hold(page, x, y, nFrames) { await page.mouse.move(x, y); await page.mouse.down(); await frames(page, nFrames); await page.mouse.up(); }
const dryOut = async (page, n = 200) => { await page.evaluate(() => window.__tusche.setDry(true)); await frames(page, n); await page.evaluate(() => window.__tusche.setDry(false)); };
const hideHud = page => page.evaluate(() => document.body.classList.add('nohud'));

try {
  if (want('01')) {
    const { page, errors } = await open(b, '?fixed&nodemo');
    await page.mouse.move(640, 420); await frames(page, 20);
    await page.screenshot({ path: path.join(OUT, '01-blank-paper-ui.png') });
    log['01'] = clean(errors); await page.close();
  }
  if (want('04')) {
    // dwell: the same brush held for 0.5 s (left) and 2 s (right); the ring is caught mid-hold
    const { page, errors } = await open(b, '?fixed&nodemo');
    await hold(page, 380, 400, 30);
    await page.mouse.move(900, 400); await page.mouse.down(); await frames(page, 75);
    await page.screenshot({ path: path.join(OUT, '05-dwell-ring-mid-hold.png') });
    await frames(page, 45); await page.mouse.up();
    await frames(page, 120); await dryOut(page, 240); await hideHud(page); await frames(page, 2);
    const a = await page.evaluate(() => [window.__tusche.area(180, 150, 640, 650, .04), window.__tusche.area(640, 150, 1240, 650, .04)]);
    await page.screenshot({ path: path.join(OUT, '04-dwell-0.5s-vs-2s.png') });
    log['04'] = { areaShort: a[0], areaLong: a[1], errors: clean(errors) }; await page.close();
  }
  if (want('06')) {
    // brush strokes: a slow loaded stroke (top), a quick one that tapers and breaks into dry brush (middle), and a
    // long stroke in which the brush runs out of ink (bottom)
    const { page, errors } = await open(b, '?fixed&nodemo');
    await page.evaluate(() => { document.querySelector('#sizeUp').click(); document.querySelector('#sizeUp').click(); });
    await drag(page, [[120, 200], [500, 170], [900, 230]], 7);
    await drag(page, [[120, 400], [420, 380], [760, 420], [1150, 380]], 38);
    await drag(page, [[100, 620], [400, 580], [700, 650], [1000, 600], [1200, 640]], 16);
    await frames(page, 90); await dryOut(page); await hideHud(page); await frames(page, 2);
    await page.screenshot({ path: path.join(OUT, '06-strokes-slow-fast-dry-brush.png') });
    log['06'] = clean(errors); await page.close();
  }
  if (want('07')) {
    // wet-in-wet: a vermilion wash, black dropped and dragged into it while it is still wet
    const { page, errors } = await open(b, '?fixed&nodemo');
    await playAndWait(page, [
      { kind: 'stroke', ink: 'vermilion', size: 120, pts: [[.15, .45], [.5, .42], [.85, .48]], dur: 1.2, ease: 'inout', wMul: 2.2, kMul: .45 },
      { kind: 'hold', ink: 'vermilion', size: 80, pts: [[.5, .45]], dur: .6, kMul: .6 },
      { kind: 'hold', ink: 'sumi', size: 26, pts: [[.38, .44]], dur: .35, kMul: 2.5 },
      { kind: 'stroke', ink: 'sumi', size: 22, pts: [[.52, .38], [.62, .47], [.74, .44]], dur: .7, ease: 'inout', kMul: 2.5 },
      { kind: 'hold', ink: 'sumi', size: 14, pts: [[.27, .47]], dur: .2, kMul: 3 },
    ], 0);
    await frames(page, 240); await dryOut(page); await hideHud(page); await frames(page, 2);
    await page.screenshot({ path: path.join(OUT, '07-wet-in-wet-red-into-black.png') });
    log['07'] = clean(errors); await page.close();
  }
  if (want('08')) {
    // gold, dried, with its sheen: a sun, a stroke and a vein through a grey wash; light from the upper left
    const { page, errors } = await open(b, '?fixed&nodemo');
    await playAndWait(page, [
      { kind: 'hold', ink: 'gold', size: 120, pts: [[.3, .4]], dur: 1.6 },
      { kind: 'stroke', ink: 'sumi', size: 110, pts: [[.5, .62], [.75, .58], [.98, .64]], dur: 1, ease: 'inout', kMul: .2, wMul: 1.6 },
      { kind: 'stroke', ink: 'gold', size: 4, pts: [[.5, .6], [.62, .58], [.75, .61], [.88, .58], [.98, .6]], dur: .6, ease: 'lin', kMul: .7, wMul: .5 },
      { kind: 'stroke', ink: 'gold', size: 40, pts: [[.55, .2], [.75, .26], [.95, .2]], dur: .5, ease: 'inout' },
    ], 0);
    await frames(page, 240); await dryOut(page); await page.mouse.move(200, 150); await hideHud(page); await frames(page, 40);
    await page.screenshot({ path: path.join(OUT, '08-gold-dried-sheen.png') });
    await page.screenshot({ path: path.join(OUT, '08b-gold-sheen-detail.png'), clip: { x: 200, y: 160, width: 380, height: 300 } });
    log['08'] = clean(errors); await page.close();
  }
  if (want('09')) {
    // backrun: clear water dropped into a wash that is damp but no longer wet
    const { page, errors } = await open(b, '?fixed&nodemo');
    await playAndWait(page, [
      { kind: 'stroke', ink: 'sumi', size: 150, pts: [[.15, .5], [.5, .47], [.85, .52]], dur: 1.4, ease: 'inout', kMul: .45, wMul: 1.3 },
    ], 0);
    await frames(page, 260);
    const wet = await page.evaluate(() => window.__tusche.wetCells());
    await playAndWait(page, [
      { kind: 'hold', ink: 'water', size: 40, pts: [[.35, .49]], dur: .35 },
      { kind: 'hold', ink: 'water', size: 30, pts: [[.62, .5]], dur: .5 },
    ], 0, { clear: false });
    await frames(page, 200); await dryOut(page); await hideHud(page); await frames(page, 2);
    await page.screenshot({ path: path.join(OUT, '09-clear-water-backrun.png') });
    log['09'] = { wetBeforeDrop: wet, errors: clean(errors) }; await page.close();
  }
  if (want('10')) {
    const { page, errors } = await open(b, '?fixed', { width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.waitForFunction(() => !window.__tusche.demo, null, { timeout: 1800000, polling: 100 });
    await page.touchscreen.tap(195, 300); await frames(page, 10);
    await page.screenshot({ path: path.join(OUT, '10-mobile-touch.png') });
    log['10'] = clean(errors); await page.close();
  }
} finally {
  console.log(JSON.stringify(log));
  await b.close();
}
