// Tusche test suite — node tests/run-tests.mjs [path/to/index.html]
// Headless Chromium (SwiftShader when there is no GPU). Everything waits on frame counts, never wall-clock, and runs
// with ?fixed (a fixed 1/60 s per frame) so results don't depend on how slow the software rasteriser is.
import fs from 'node:fs';
import { launch, open, frames, playAndWait, PAGE } from './lib.mjs';

const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`); };
const SMALL = { width: 640, height: 400 };
const clean = errs => errs.filter(e => !/GPU stall due to ReadPixels/.test(e));

const b = await launch();
try {
  // 1. self-containment: no external URLs in the file, no network requests at runtime, no console errors through the demo
  {
    const html = fs.readFileSync(PAGE, 'utf8');
    const ext = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(([^)]+)\)|@import\s+["']([^"']+)/g)].map(m => m[1] || m[2] || m[3])
      .filter(u => !/^(\.\.\/|#|data:|blob:)/.test(u));
    const http = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0]);
    ok('static: no external resources referenced', ext.length === 0 && http.length === 0, { ext, http });
    const { page, errors, requests } = await open(b, '?fixed', SMALL);
    await page.waitForFunction(() => !window.__tusche.demo, null, { timeout: 1800000, polling: 100 });
    await frames(page, 30);
    ok('runtime: zero network requests, zero console errors through the opening demo', requests.length === 0 && clean(errors).length === 0, { requests, errors: clean(errors) });
    await page.close();
  }

  // 2. conservation: with evaporation off, water, pigment and gold are conserved by flow, lift, settle and fixing
  {
    const { page, errors } = await open(b, '?fixed&nodemo', SMALL);
    await page.evaluate(() => { window.__tusche.params.evap = 0; });
    await playAndWait(page, [
      { kind: 'hold', ink: 'sumi', size: 40, pts: [[.3, .4]], dur: .8 },
      { kind: 'stroke', ink: 'vermilion', size: 30, pts: [[.2, .7], [.5, .6], [.8, .7]], dur: .6, ease: 'inout' },
      { kind: 'hold', ink: 'gold', size: 40, pts: [[.7, .35]], dur: .8 },
      { kind: 'hold', ink: 'water', size: 30, pts: [[.33, .45]], dur: .5 },
    ], 2);
    const a = await page.evaluate(() => window.__tusche.totals());
    await frames(page, 240);
    const z = await page.evaluate(() => window.__tusche.totals());
    const rel = (p, q) => Math.abs(q - p) / Math.max(1e-9, Math.abs(p));
    const d = { water: rel(a.water, z.water), pigment: rel(a.pigment, z.pigment), metal: rel(a.metal, z.metal) };
    ok('conservation: water, pigment and metal within 0.5% over 240 frames (evaporation off)', d.water < .005 && d.pigment < .005 && d.metal < .005 && z.nonFinite === 0, { before: a, after: z, rel: d, errors: clean(errors) });
    // and with evaporation on, pigment is still conserved while the water goes
    await page.evaluate(() => { window.__tusche.params.evap = 1; window.__tusche.setDry(true); });
    await frames(page, 240);
    const y = await page.evaluate(() => window.__tusche.totals());
    ok('conservation: pigment kept and water gone after drying', rel(a.pigment, y.pigment) < .005 && y.water < a.water * .05, { after: y });
    await page.close();
  }

  // 3. dwell: a 2 s hold blooms measurably larger than a 0.5 s hold (stain read back with readPixels after drying)
  {
    const area = async dur => {
      const { page } = await open(b, '?fixed&nodemo', SMALL);
      await playAndWait(page, [{ kind: 'hold', ink: 'sumi', size: 36, pts: [[.5, .5]], dur }], 0);
      await frames(page, 90);
      await page.evaluate(() => window.__tusche.setDry(true));
      await frames(page, 240);
      const r = await page.evaluate(() => ({ area: window.__tusche.area(0, 0, 640, 400, .04), wet: window.__tusche.wetCells() }));
      await page.close(); return r;
    };
    const s = await area(.5), l = await area(2);
    ok('dwell: 2 s hold blooms ≥ 1.6× the area of a 0.5 s hold', l.area >= 1.6 * s.area && s.area > 0, { short: s, long: l, ratio: +(l.area / s.area).toFixed(2) });
  }

  // 4. long scripted session: no NaN / Inf anywhere after the demo, strokes of every ink, holds, water, drying
  {
    const { page, errors } = await open(b, '?fixed', SMALL);
    await page.waitForFunction(() => !window.__tusche.demo, null, { timeout: 1800000, polling: 100 });
    let r = 7; const R = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const inks = ['sumi', 'vermilion', 'gold', 'water'], acts = [];
    for (let i = 0; i < 40; i++) {
      const ink = inks[i % 4], size = 4 + R() * 90;
      if (R() < .4) acts.push({ kind: 'hold', ink, size, pts: [[R(), R()]], dur: .05 + R() * 2.5 });
      else acts.push({ kind: 'stroke', ink, size, pts: [[R(), R()], [R(), R()], [R(), R()]], dur: .05 + R() * 1.2, ease: ['in', 'inout', 'lin'][i % 3] });
    }
    await playAndWait(page, acts, 60);
    await page.evaluate(() => window.__tusche.setDry(true)); await frames(page, 60); await page.evaluate(() => window.__tusche.setDry(false));
    await playAndWait(page, acts.slice(0, 10), 120);
    const t = await page.evaluate(() => window.__tusche.totals());
    ok('stability: no NaN/Inf after a long scripted session', t.nonFinite === 0 && isFinite(t.water + t.pigment + t.metal) && clean(errors).length === 0, { totals: t, frame: await page.evaluate(() => window.__tusche.frame), errors: clean(errors) });
    await page.close();
  }

  // 5. half-float fallback: the paper still dries (tiny evaporation steps don't round away) and stays finite
  {
    const { page, errors } = await open(b, '?fixed&nodemo&half', SMALL);
    const half = await page.evaluate(() => window.__tusche.half);
    await playAndWait(page, [{ kind: 'hold', ink: 'sumi', size: 40, pts: [[.5, .5]], dur: 1 }, { kind: 'stroke', ink: 'gold', size: 20, pts: [[.2, .2], [.8, .3]], dur: .5 }], 0);
    const w0 = await page.evaluate(() => window.__tusche.wetCells());
    await frames(page, 1500);   // 25 s of sim time, no hair dryer
    const t = await page.evaluate(() => ({ wet: window.__tusche.wetCells(), tot: window.__tusche.totals() }));
    ok('half floats: paper dries unaided within 25 s of sim time, values finite', half && w0 > 0 && t.wet === 0 && t.tot.nonFinite === 0 && clean(errors).length === 0, { half, wetBefore: w0, ...t, errors: clean(errors) });
    await page.close();
  }

  // 6. resize keeps the painting: shrink then grow the window; drop to a third resolution and back
  {
    const { page, errors } = await open(b, '?fixed&nodemo', { width: 800, height: 500 });
    await playAndWait(page, [{ kind: 'hold', ink: 'sumi', size: 40, pts: [[.8, .8]], dur: .6 }, { kind: 'stroke', ink: 'vermilion', size: 30, pts: [[.1, .2], [.9, .3]], dur: .6 }], 0);
    await page.evaluate(() => window.__tusche.setDry(true)); await frames(page, 200); await page.evaluate(() => window.__tusche.setDry(false));
    const a = await page.evaluate(() => window.__tusche.totals());
    await page.setViewportSize({ width: 420, height: 300 }); await frames(page, 10);
    await page.setViewportSize({ width: 1000, height: 640 }); await frames(page, 10);
    const z = await page.evaluate(() => window.__tusche.totals());
    await page.evaluate(() => window.__tusche.setScale(3)); await frames(page, 5);
    const y = await page.evaluate(() => window.__tusche.totals());
    const rel = (p, q) => Math.abs(q - p) / Math.max(1e-9, p);
    ok('resize: painting survives shrink/grow exactly and a resolution change within 3%', rel(a.pigment, z.pigment) < 1e-4 && rel(a.pigment, y.pigment) < .03 && clean(errors).length === 0,
      { before: a.pigment, afterResize: z.pigment, afterScale3: y.pigment, errors: clean(errors) });
    await page.close();
  }
} catch (e) {
  ok('suite ran to completion', false, { error: String(e.stack || e) });
} finally {
  await b.close();
}
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
fs.writeFileSync(new URL('./last-results.json', import.meta.url), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
