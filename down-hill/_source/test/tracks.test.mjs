/* Stage 2's tracks in node: Laundry Day and Sprinkler Park run whole
   8-CPU races (everyone finishes, laps ~45–62 s), and their gimmicks do
   their thing: the conveyor carries you, the dryer-drum shortcut is
   taken (and shorter), pods spin you, sock piles slow you, sprinklers
   knock you sideways, the kiddie pool slows you.                       */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, CUP, sprinklerOn } from '../src/race/track.js';

const field = (lvl = 'hard') => [...ORDER, 'kevalanche'].map((id, i) => ({ id, alt: i === 7, cpu: lvl }));
function run(track, seed, lvl = 'hard') {
  const R = new Race({ track, racers: field(lvl), seed, humans: [] });
  const cpus = R.karts.map((K) => new CPU(R, K.i, lvl, seed));
  const ev = {}, laps = R.karts.map(() => []);
  let n = 0;
  while (R.phase !== 'done' && n < 60 * 400) {
    R.step(cpus.map((c) => c.think()));
    for (const e of R.events) { ev[e.k] = (ev[e.k] || 0) + 1; if (e.k === 'hit') ev['hit:' + e.kind] = (ev['hit:' + e.kind] || 0) + 1; if (e.k === 'lap' || e.k === 'finish') laps[e.i].push(R.tick); }
    R.events.length = 0; n++;
  }
  const lapT = laps.flatMap((L) => L.map((t, k) => (t - (k ? L[k - 1] : R.goTick)) / 60));
  return { R, ev, lapT, mean: lapT.reduce((a, b) => a + b, 0) / lapT.length };
}

test('the cup is the three tracks', () => {
  assert.deepEqual(CUP, ['landing', 'laundry', 'park']);
  for (const id of CUP) assert.ok(TRACKS[id], id);
});

for (const track of ['laundry', 'park']) {
  test(`${track}: a whole 3-lap race of 8 hard CPUs, everyone home, laps ~45–62 s`, () => {
    const { R, ev, mean } = run(track, 11);
    assert.equal(R.phase, 'done');
    assert.equal(R.finishOrder.length, 8);
    assert.ok(mean > 45 && mean < 62, `mean lap ${mean.toFixed(1)}`);
    for (const k of ['drift', 'boost', 'use', 'trick', 'pad', 'box', 'hit']) assert.ok(ev[k], `${k} events`);
    if (track === 'laundry') { assert.ok(ev.drum >= 4 && ev.drumOut >= 4, `drum ${ev.drum}`); assert.ok(ev.pile > 4, `piles ${ev.pile}`); assert.ok(ev['hit:pod'] > 0, 'pods'); }
    else { assert.ok(ev.soak > 4, `soak ${ev.soak}`); assert.ok(ev.splash > 4, `splash ${ev.splash}`); }
    assert.ok((ev.fall || 0) <= 6, `falls ${ev.fall}`);
  });
}

test('laundry: the conveyor carries a kart that just sits on it', () => {
  const R = new Race({ track: 'laundry', racers: [{ id: 'k8e' }], seed: 1, humans: [0] });
  const T = R.T, k = T.belt.findIndex((b, i) => b > 0 && T.belt[(i + 20) % T.N] > 0);
  const K = R.karts[0];
  K.x = T.x[k]; K.z = T.z[k]; K.y = T.y[k]; K.k = k; K.yaw = Math.atan2(T.tx[k], T.tz[k]); K.vx = K.vz = 0;
  R.phase = 'race';
  const s0 = [K.x, K.z];
  for (let i = 0; i < 60; i++) R.step([noInput()]);
  const moved = (K.x - s0[0]) * T.tx[k] + (K.z - s0[1]) * T.tz[k];
  assert.ok(moved > 7, `carried ${moved.toFixed(1)} in 1 s`);
});

test('laundry: the shortcut is shorter than the road round the machines', () => {
  const T = buildTrack(TRACKS.laundry), C = T.cut;
  let road = 0; for (let k = C.kA; k !== C.kB; k = (k + 1) % T.N) road += T.step;
  assert.ok(C.len < road - 25, `cut ${C.len.toFixed(0)} vs road ${road.toFixed(0)}`);
  assert.ok(C.m1 > C.m0 && C.d0 > C.m0 && C.d1 < C.m1, 'the drum is in the walled gap');
});

test('park: a sprinkler pulses and its jet knocks a kart sideways', () => {
  const R = new Race({ track: 'park', racers: [{ id: 'k8e' }], seed: 1, humans: [0] });
  const S = R.sprinklers[0], K = R.karts[0];
  let on = 0; for (let t = 0; t < S.period; t++) on += sprinklerOn(S, t) ? 1 : 0;
  assert.equal(on, S.dur);
  R.phase = 'race';
  // park the kart inside its reach, wait for the jet
  K.x = S.x + S.reach * 0.4; K.z = S.z; K.vx = K.vz = 0;
  let soaked = false, vx = 0;
  for (let i = 0; i < S.period && !soaked; i++) { R.step([noInput()]); if (R.events.some((e) => e.k === 'soak')) { soaked = true; vx = K.vx; } R.events.length = 0; }
  assert.ok(soaked, 'soaked');
  assert.ok(vx > 4, `knocked away from the sprinkler: vx ${vx.toFixed(1)}`);
});
