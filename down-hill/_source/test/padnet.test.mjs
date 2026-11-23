// Pad input over a bad network (the bounce-and-squish report): one physical
// tap = one press, a held button = one press, whatever the link does — loss,
// jitter (reordering), duplicates, quiet spells, outages long enough for the
// 8-bit seq to run past its window, and a phone that reconnects (seq and
// counters restart). The game side is driven exactly as host.js + the race
// drive it: stale() every frame, sample() every tick, the race's own edge
// detection (`I[b] && !prev[b]`, race/sim.js `pressed`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInput, decode, PadState, TAPS, GAS, ITEM, TAUNT, DRIFT, HEARTBEAT_MS } from '../src/pad/wire.js';

const BITS = { gas: GAS, item: ITEM, taunt: TAUNT, drift: DRIFT };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* script: [{ t0, t1, bit }] physical holds (ms); net: loss, jitter, dup, outages [[a, b]], reconnects [t] */
export function simulate({ script, ms = 20000, loss = 0, jitter = 0, dup = 0, outages = [], reconnects = [], seed = 1 }) {
  const R = rng(seed), P = new PadState();
  P.reset(true);
  const counts = new Array(TAPS.length).fill(0);
  let seq = 0, last = 0;
  const inflight = [];
  const phys = (t) => script.reduce((m, s) => (t >= s.t0 && t < s.t1 ? m | s.bit : m), 0);
  const edges = { gas: 0, item: 0, taunt: 0, drift: 0 };
  let prev = { gas: false, item: false, taunt: false, drift: false };
  let nextSend = 0, nextTick = 0, ri = 0;
  for (let t = 0; t <= ms; t++) {
    if (ri < reconnects.length && t >= reconnects[ri]) {
      // the phone reloads: a new link, seq and counters from zero, the host seats it again
      ri++; seq = 0; last = 0; counts.fill(0); inflight.length = 0; P.reset(true);
    }
    if (t >= nextSend) {
      nextSend += HEARTBEAT_MS;
      const m = phys(t), pr = m & ~last;
      if (pr) TAPS.forEach((b, i) => { if (pr & b) counts[i] = (counts[i] + 1) & 15; });
      last = m; seq = (seq + 1) & 255;
      const out = outages.some(([a, b]) => t >= a && t < b);
      if (!out && R() >= loss) {
        const pkt = encodeInput(seq, m, counts, 0);
        inflight.push({ at: t + 20 + R() * jitter, pkt });
        if (R() < dup) inflight.push({ at: t + 20 + R() * jitter, pkt });
      }
    }
    for (let i = inflight.length - 1; i >= 0; i--) if (inflight[i].at <= t) { P.take(decode(inflight[i].pkt), t); inflight.splice(i, 1); }
    if (t >= nextTick) {
      nextTick += 1000 / 60;
      P.stale(t);
      const I = P.sample();
      for (const k in edges) if (I[k] && !prev[k]) edges[k]++;
      prev = I;
    }
  }
  return edges;
}

// Kevin's kind of evening: taps, long holds across dropouts, a reconnect mid-hold
const SCRIPT = [
  { t0: 0, t1: 20000, bit: GAS },                       // auto-gas: held all race
  { t0: 1000, t1: 1080, bit: TAUNT },                   // 1: a quick tap
  { t0: 2500, t1: 6000, bit: TAUNT },                   // 2: held through the 3 s outage
  { t0: 7000, t1: 7050, bit: ITEM },                    // 1: item tap
  { t0: 8000, t1: 12500, bit: TAUNT },                  // 3: held through the 2.5 s outage (seq past its window)
  { t0: 13000, t1: 13060, bit: TAUNT },                 // 4
  { t0: 14000, t1: 16500, bit: TAUNT },                 // 5: held through the reconnect
  { t0: 17000, t1: 17040, bit: ITEM },                  // 2
  { t0: 18000, t1: 19500, bit: DRIFT },
  { t0: 17500, t1: 19900, bit: TAUNT },                 // 6: held through a 1 s outage (inside the seq window)
];
const NET = { outages: [[3000, 6000 - 500], [9000, 11500], [18200, 19200]], reconnects: [15000] };

test('a clean link: one press per physical press', () => {
  const e = simulate({ script: SCRIPT });
  assert.deepEqual(e, { gas: 1, item: 2, taunt: 6, drift: 1 });
});

for (const [name, net] of [
  ['15 % loss', { loss: 0.15 }],
  ['300 ms jitter (reordering)', { jitter: 300 }],
  ['duplicates', { dup: 0.3 }],
  ['15 % loss + 300 ms jitter + duplicates', { loss: 0.15, jitter: 300, dup: 0.2 }],
]) for (const seed of [1, 2, 3, 4, 5]) {
  test(`${name} + three outages (3 s, 2.5 s, 1 s) + a reconnect, seed ${seed}: a held TAUNT never re-fires`, () => {
    const e = simulate({ script: SCRIPT, ...NET, ...net, seed });
    assert.equal(e.taunt, 6, `taunt presses ${e.taunt}`);
    assert.equal(e.item, 2, `item presses ${e.item}`);
    assert.ok(e.drift <= 2 && e.drift >= 1, `drift ${e.drift}`);
  });
}

test('after an outage long enough for the seq to wrap past its window, input resumes at once (no freeze)', () => {
  for (const gap of [2200, 3000, 3600, 4000, 4300]) {
    const P = new PadState(); P.reset();
    const c = new Array(TAPS.length).fill(0);
    let seq = 0;
    for (let t = 0; t < 500; t += 16) P.take(decode(encodeInput(++seq & 255, 0, c, 0)), t);
    seq += Math.round(gap / 16);                     // the phone kept counting through the outage
    for (let t = 500; t < 500 + gap; t += 16) P.stale(t);
    P.take(decode(encodeInput(++seq & 255, GAS, c, 0)), 500 + gap);
    assert.equal(P.sample().gas, true, `gap ${gap} ms: the first packet after it is taken`);
  }
});

test('a straggler (reordered, duplicated) never replays an older state', () => {
  const P = new PadState(); P.reset();
  const c = new Array(TAPS.length).fill(0);
  P.take(decode(encodeInput(10, GAS, c, 0)), 0);
  c[TAPS.indexOf(TAUNT)]++;
  assert.ok(P.take(decode(encodeInput(12, GAS | TAUNT, c, 0)), 16) & TAUNT);
  assert.equal(P.take(decode(encodeInput(11, GAS, [...c].fill(0), 0)), 20), 0, 'older: dropped');
  assert.equal(P.take(decode(encodeInput(12, GAS | TAUNT, c, 0)), 24), 0, 'duplicate: dropped');
  assert.equal(P.take(decode(encodeInput(13, GAS | TAUNT, c, 0)), 32) & TAUNT, 0, 'still the same press');
});
