/* The difficulty-curve check (stage 5): a scripted "average driver" (no
   drift, wandering lines, slow hands, late into corners: src/race/cpu.js
   AVERAGE) races 7 CPUs, many seeds, and we count where it finishes.
   node tools/avgdriver.mjs [level] [strength] [races] [track]          */
import { Race } from '../src/race/sim.js';
import { CPU, AVERAGE } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';

export function avgRace({ track = 'landing', level = 'normal', strength = 0, seed = 1, driver = AVERAGE }) {
  const others = ORDER.filter((id) => id !== 'kevalanche');
  const racers = [...others.map((id, i) => ({ id, alt: i % 3 === 1, cpu: level })), { id: 'kevalanche', alt: false, cpu: 'normal' }];
  while (racers.length < 8) racers.unshift({ id: ORDER[racers.length % 7], alt: true, cpu: level });
  const me = racers.length - 1;
  const R = new Race({ track, racers, seed, humans: [me] });
  const cpus = R.karts.map((K, i) => (i === me ? new CPU(R, i, driver, seed) : new CPU(R, i, level, seed, strength)));
  // the rows (their samples) and when this driver crosses each; a row crossed
  // without touching a box is a miss
  const T = R.T, N = T.N, rows = [...new Set(R.boxes.map((B) => B.k))];
  const K = R.karts[me];
  const gaps = [];
  let lastRow = null, lastBox = -999, items = 0, n = 0, passes = 0, missed = 0, pending = [];
  while (R.phase !== 'done' && n++ < 60 * 400 && !K.fin) {
    const kc0 = K.kc;
    R.step(cpus.map((c) => c.think()));
    for (const e of R.events) {
      if (e.k === 'box' && e.i === me) lastBox = R.tick;
      if (e.k === 'gotItem' && e.i === me) items++;
    }
    R.events.length = 0;
    if (R.phase !== 'race') continue;
    for (const rk of rows) {
      const c = Math.ceil((kc0 - ((rk - R.startK + N) % N)) / N) * N + ((rk - R.startK + N) % N);
      if (kc0 < c && K.kc >= c && K.kc - kc0 < 40) {
        passes++;
        if (lastRow !== null) gaps.push((R.tick - lastRow) / 60);
        lastRow = R.tick;
        pending.push(R.tick);
      }
    }
    // a crossing counts as a grab if a box was touched within ~0.3 s of it
    pending = pending.filter((t) => { if (Math.abs(lastBox - t) < 20) return false; if (R.tick - t > 20) { missed++; return false; } return true; });
  }
  return { place: K.place, items, maxGap: Math.max(0, ...gaps), gaps, passes, missed, time: R.timeOf(K) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const driver = process.env.DRV ? { ...AVERAGE, ...JSON.parse(process.env.DRV) } : AVERAGE;
  const level = process.argv[2] || 'normal', strength = +(process.argv[3] ?? 0), n = +(process.argv[4] || 24);
  const tracks = process.argv[5] ? [process.argv[5]] : ['landing', 'laundry', 'park'];
  for (const track of tracks) {
    const places = [];
    let items = 0, maxGap = 0, passes = 0, missed = 0, gs = [];
    for (let s = 1; s <= n; s++) { const r = avgRace({ track, level, strength, seed: s * 31, driver }); places.push(r.place); items += r.items; maxGap = Math.max(maxGap, r.maxGap); passes += r.passes; missed += r.missed; gs.push(...r.gaps); }
    const top3 = places.filter((p) => p <= 3).length;
    console.log(`${track} ${level}@${strength}: places ${places.join(' ')} | top 3 ${top3}/${n} (${Math.round(top3 / n * 100)} %) | mean ${(places.reduce((a, b) => a + b) / n).toFixed(2)} | items/race ${(items / n).toFixed(1)} | a box row every ${(gs.reduce((a, b) => a + b, 0) / gs.length).toFixed(1)} s (longest ${maxGap.toFixed(1)} s) | rows missed ${missed}/${passes}`);
  }
}
