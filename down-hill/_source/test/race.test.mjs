import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { Race, noInput, ITEMS } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, groundAt } from '../src/race/track.js';

const field = (lvl = 'hard') => [...ORDER, 'kevalanche'].map((id, i) => ({ id, alt: i === 7, cpu: lvl }));
function run(seed, lvl = 'hard', max = 60 * 300) {
  const R = new Race({ racers: field(lvl), seed, humans: [] });
  const cpus = R.karts.map((K) => new CPU(R, K.i, lvl, seed));
  const ev = {};
  let n = 0;
  while (R.phase !== 'done' && n < max) { R.step(cpus.map((c) => c.think())); for (const e of R.events) ev[e.k] = (ev[e.k] || 0) + 1; R.events.length = 0; n++; }
  return { R, ev, n };
}
const hash = (R) => JSON.stringify(R.karts.map((K) => [K.x.toFixed(3), K.z.toFixed(3), K.place, K.finT]));

test('no clock or Math.random in the race sim', () => {
  for (const f of ['sim.js', 'cpu.js', 'track.js']) {
    const s = fs.readFileSync(new URL('../src/race/' + f, import.meta.url), 'utf8');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(s), f);
  }
});

test('the track: a lap of ~1300 units, launches, pads, drops, the under-bed ceiling, every section', () => {
  const T = buildTrack(TRACKS.landing);
  assert.ok(T.length > 1100 && T.length < 1600, `length ${T.length}`);
  assert.ok(T.launch.filter(Boolean).length >= 2);
  assert.ok(T.pad.filter(Boolean).length >= 6);
  assert.ok(T.drop.some(Boolean) && T.ceil.some(Boolean));
  const tags = new Set(T.def.points.map((p) => p.tag));
  for (const t of ['duvet', 'books', 'rug', 'underbed', 'banister', 'drawer', 'pillows']) assert.ok(tags.has(t), t);
  const k = T.drop.findIndex(Boolean);
  assert.equal(groundAt(T, k, 99), -Infinity);
});

test('a whole 3-lap race of 8 hard CPUs: everyone finishes, laps 45–62 s, drifts, items, tricks', () => {
  const { R, ev } = run(11);
  assert.equal(R.phase, 'done');
  assert.equal(R.finishOrder.length, 8);
  assert.ok(R.karts.every((K) => K.fin));
  const winner = R.timeOf(R.karts[R.finishOrder[0]]);
  assert.ok(winner / 3 > 45 && winner / 3 < 62, `winner lap ${winner / 3}`);
  for (const k of ['drift', 'tier', 'boost', 'box', 'use', 'trick', 'trickBoost', 'pad', 'launch', 'land']) assert.ok(ev[k] > 0, k);
  assert.ok((ev.fall || 0) < 12, `falls ${ev.fall}`);
});

test('deterministic: the same seed, the same race', () => {
  assert.equal(hash(run(5, 'normal', 60 * 40).R), hash(run(5, 'normal', 60 * 40).R));
});

test('hard CPUs beat easy ones', () => {
  const racers = ORDER.map((id, i) => ({ id, cpu: i % 2 ? 'hard' : 'easy' })).concat([{ id: 'zach', alt: true, cpu: 'hard' }]);
  const R = new Race({ racers, seed: 3, humans: [] });
  const cpus = R.karts.map((K) => new CPU(R, K.i, K.cpu, 3));
  let n = 0;
  while (R.phase !== 'done' && n++ < 60 * 300) { R.step(cpus.map((c) => c.think())); R.events.length = 0; }
  const avg = (lv) => { const ks = R.karts.filter((K) => K.cpu === lv); return ks.reduce((a, K) => a + K.place, 0) / ks.length; };
  assert.ok(avg('hard') < avg('easy'), `${avg('hard')} vs ${avg('easy')}`);
});

/* a human-shaped driver on an empty track */
function solo(id = 'k8e') {
  const R = new Race({ racers: [{ id }], seed: 1, humans: [0] });
  for (let i = 0; i < 230; i++) R.step([noInput()]);
  R.events.length = 0;
  return R;
}

test('drift: holding DRIFT through a turn charges white → gold → mint, release boosts', () => {
  const R = solo();
  const K = R.karts[0];
  for (let i = 0; i < 90; i++) R.step([{ ...noInput(), gas: true }]);
  const tiers = [];
  for (let i = 0; i < 230; i++) { R.step([{ ...noInput(), gas: true, drift: true, steer: 1 }]); for (const e of R.events) if (e.k === 'tier') tiers.push(e.tier); R.events.length = 0; if (K.tier === 3) break; }
  assert.deepEqual(tiers.slice(0, 3), [1, 2, 3]);
  R.step([{ ...noInput(), gas: true }]);
  assert.ok(K.boostT > 1.3, `boost ${K.boostT}`);
});

test('counter-steer wiggles charge the drift faster', () => {
  const charge = (wig) => { const R = solo(); const K = R.karts[0]; for (let i = 0; i < 90; i++) R.step([{ ...noInput(), gas: true }]); for (let i = 0; i < 60; i++) R.step([{ ...noInput(), gas: true, drift: true, steer: wig && i > 2 && i % 12 < 3 ? -1 : 1 }]); return K.charge; };
  assert.ok(charge(true) > charge(false) * 1.15, `${charge(true)} vs ${charge(false)}`);
});

test('a ramp trick: TAUNT in the air, a landing boost', () => {
  const R = solo('zach');
  const K = R.karts[0];
  let tricked = false, boosted = false;
  for (let i = 0; i < 60 * 8 && !boosted; i++) {
    R.step([{ ...noInput(), gas: true, taunt: K.air && !tricked && K.airT > 0.1 }]);
    for (const e of R.events) { if (e.k === 'trick') tricked = true; if (e.k === 'trickBoost') boosted = true; }
    R.events.length = 0;
  }
  assert.ok(tricked && boosted);
});

test('every item is used and does its thing', () => {
  for (const it of ITEMS) {
    const racers = ORDER.map((id) => ({ id, cpu: 'normal' })).concat([{ id: 'kevalanche', alt: true }]);
    const R = new Race({ racers, seed: 9, humans: [7] });
    const cpus = R.karts.map((K) => (K.cpu ? new CPU(R, K.i, 'normal', 9) : null));
    for (let i = 0; i < 60 * 12; i++) { R.step(cpus.map((c) => (c ? c.think() : { ...noInput(), gas: true }))); R.events.length = 0; }
    const me = R.karts[7];
    me.item = it; me.roulette = 0;
    const seen = new Set();
    for (let i = 0; i < 60 * 15; i++) {
      R.step(cpus.map((c) => (c ? c.think() : { ...noInput(), gas: true, item: i === 1 })));
      for (const e of R.events) if (e.i === 7 || e.from === 7 || e.k === 'cuffs' || e.k === 'alarm') seen.add(e.k + (e.item ? ':' + e.item : ''));
      R.events.length = 0;
    }
    assert.ok(seen.has('use:' + it), `${it}: ${[...seen].join(' ')}`);
    const want = { espresso: 'boost', cuffs: 'cuffs', alarm: 'alarm' }[it];
    if (want) assert.ok(seen.has(want), `${it}: ${[...seen].join(' ')}`);
  }
});

test('falling off the banister: the sock fishes you back onto the track', () => {
  const R = solo('rubberta');
  const K = R.karts[0], T = R.T;
  const k = T.drop.findIndex(Boolean) + 40;
  K.x = T.x[k] + 20; K.z = T.z[k]; K.y = T.y[k]; K.k = k; K.lastGood = k;
  const seen = [];
  for (let i = 0; i < 60 * 5; i++) { R.step([noInput()]); for (const e of R.events) seen.push(e.k); R.events.length = 0; }
  assert.ok(seen.includes('fall') && seen.includes('fished'), seen.join(' '));
  assert.ok(Math.abs(K.d) < 1 && !K.fish);
});
