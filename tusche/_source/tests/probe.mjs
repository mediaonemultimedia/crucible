import { launch, open, frames, playAndWait } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, '?fixed&nodemo', { width: 640, height: 400 });
const hold = +(process.argv[2] || 1);
await playAndWait(page, [{ kind: 'hold', ink: 'sumi', size: 40, pts: [[0.5, 0.5]], dur: hold }], 0);
for (const extra of [0, 60, 180]) {
  if (extra) await frames(page, extra);
  const r = await page.evaluate(() => { const [W, H] = window.__tusche.size; const s = window.__tusche.read('S'), x = window.__tusche.read('X'), l = window.__tusche.read('L'), t = window.__tusche.read('T');
    const row = Math.floor(H / 2), out = [];
    for (let i = Math.floor(W / 2); i < Math.floor(W / 2) + 40; i += 2) { const o = (row * W + i) * 4; out.push([i - W / 2, +s[o + 3].toFixed(3), +x[o + 1].toFixed(2), +(s[o] ).toFixed(3), +(l[o] + t[o]).toFixed(3)]); }
    return { out, tot: window.__tusche.totals(), wet: window.__tusche.wetCells() }; });
  console.log('after', extra, JSON.stringify(r.tot), 'wet', r.wet); console.log(r.out.map(a => a.join(',')).join(' | '));
}
console.log(errors);
await b.close();
