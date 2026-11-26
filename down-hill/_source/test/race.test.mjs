import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { COUNT_TICKS, Race, noInput, ITEMS } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, groundAt, rightX, rightZ } from '../src/race/track.js';

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

test('the track: a lap of ~1300 units, launches, pads, rails, the under-bed ceiling, every section', () => {
  const T = buildTrack(TRACKS.landing);
  assert.ok(T.length > 1100 && T.length < 1600, `length ${T.length}`);
  assert.ok(T.launch.filter(Boolean).length >= 2);
  assert.ok(T.pad.filter(Boolean).length >= 6);
  assert.ok(T.rail.some(Boolean) && T.ceil.some(Boolean));
  const tags = new Set(T.def.points.map((p) => p.tag));
  for (const t of ['duvet', 'books', 'rug', 'underbed', 'banister', 'drawer', 'pillows']) assert.ok(tags.has(t), t);
  // the banister has rails: there is ground (and a wall) at its edge, no drop
  const k = T.rail.findIndex(Boolean);
  assert.notEqual(groundAt(T, k, 99), -Infinity);
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

test('falling off a drop edge (where nothing is drawn): the sock fishes you back onto the track', () => {
  // no shipped track has a drop now (stage 3: every drawn barrier is solid), so try a copy of
  // The Landing whose banister has no rails
  const def = TRACKS.landing;
  TRACKS.testdrop = { ...def, id: 'testdrop', points: def.points.map((p) => (p.tag === 'banister' ? { ...p, edge: 'drop' } : p)) };
  const R = new Race({ racers: [{ id: 'rubberta' }], seed: 1, humans: [0], track: 'testdrop' });
  delete TRACKS.testdrop;
  for (let i = 0; i < 230; i++) R.step([noInput()]);
  R.events.length = 0;
  const K = R.karts[0], T = R.T;
  const k = T.drop.findIndex(Boolean) + 40, off = T.w[k] + T.m[k] + 3;
  K.x = T.x[k] + rightX(T, k) * off; K.z = T.z[k] + rightZ(T, k) * off; K.y = T.y[k]; K.k = k; K.lastGood = k;
  const seen = [];
  for (let i = 0; i < 60 * 5; i++) { R.step([noInput()]); for (const e of R.events) seen.push(e.k); R.events.length = 0; }
  assert.ok(seen.includes('fall') && seen.includes('fished'), seen.join(' '));
  assert.ok(Math.abs(K.d) < 1 && !K.fish);
});

test('the amber cue gives enough time to charge a clean launch', () => {
  for (const [from, expected] of [[COUNT_TICKS - 32, true], [COUNT_TICKS - 120, false], [COUNT_TICKS - 3, false]]) {
    const R = new Race({ track: 'landing', racers: [{ id: 'k8e' }], humans: [0] });
    let cue = null, burst = false;
    for (let i = 1; i <= COUNT_TICKS; i++) {
      R.step([{ ...noInput(), gas: i >= from }]);
      if (R.events.some(e => e.k === 'start-cue')) cue = i;
      if (R.events.some(e => e.k === 'boost' && e.start)) burst = true;
      R.events.length = 0;
    }
    assert.equal(cue, COUNT_TICKS - 33);
    assert.equal(burst, expected);
  }
});

test('Wallop trades reach and recovery for power and never hits a different deck', () => {
  function swing(id, gap, rise = 0, behind = false) {
    const R = new Race({ track:'landing', racers:[{id},{id:'johnny'}], humans:[0,1] });
    R.phase = 'race';
    const {T} = R, [A,B] = R.karts;
    const k = R.startK + 10;
    for (const [K,q] of [[A,k],[B,k+(behind ? -gap : gap)]]) {
      Object.assign(K,{k:q,x:T.x[q],y:T.y[q],z:T.z[q],yaw:Math.atan2(T.tx[q],T.tz[q]),vx:0,vz:0});
    }
    // Check the attack resolver directly for layer separation; the physics
    // would otherwise put the staged grounded kart back on its own road.
    if (rise) B.y += rise;
    const events = [];
    R._kartTick(A,{...noInput(),wallop:true});
    for (let tick = R.tick + 1; tick <= A.wallopAt; tick++) {
      R.tick = tick;
      R._wallops();
      events.push(...R.events);
      R.events.length = 0;
      if (A.wallopAt === 0) break;
    }
    return { hit:events.some(e=>e.k==='wallop-hit'), stagger:B.spinT, speed:Math.hypot(B.vx,B.vz), recovery:A.wallopReady };
  }
  const punch = swing('kevalanche',4), check = swing('k8e',4);
  assert.ok(punch.hit && check.hit && punch.stagger > check.stagger && punch.speed > check.speed);
  assert.ok(punch.recovery > check.recovery);
  assert.ok(swing('k8e',8).hit && !swing('kevalanche',8).hit);
  assert.ok(!swing('k8e',4,4).hit && !swing('k8e',4,0,true).hit);
});

test('holding and re-tapping Wallop during recovery cannot start another swing', () => {
  const R = new Race({ racers: [{id:'kevalanche'}], humans:[0] });
  R.phase = 'race';
  let swings = 0;
  for (let i = 0; i < 150; i++) {
    R.step([{ ...noInput(), wallop:i !== 20 }]);
    swings += R.events.filter(e => e.k === 'wallop').length;
    R.events.length=0;
  }
  assert.equal(swings,1);
});
