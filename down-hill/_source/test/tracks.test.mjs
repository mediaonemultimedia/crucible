import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, CUP, locate } from '../src/race/track.js';

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

test('the cup starts at The Landing and includes four distinct venues', () => {
  assert.deepEqual(CUP, ['landing', 'laundry', 'hockey', 'park']);
  for (const id of CUP) assert.ok(TRACKS[id], id);
});

for (const track of ['laundry', 'hockey', 'park']) {
  test(`${track}: a whole 3-lap race of 8 hard CPUs, everyone home, with airborne launches`, () => {
    const { R, ev, mean } = run(track, 11);
    assert.equal(R.phase, 'done');
    assert.equal(R.finishOrder.length, 8);
    assert.ok(mean > 40 && mean < 95, `mean lap ${mean.toFixed(1)}`);
    for (const k of ['boost', 'use', 'trick', 'pad', 'box', 'hit', 'launch']) assert.ok(ev[k], `${k} events`);
    assert.ok((ev.fall || 0) <= 6, `falls ${ev.fall}`);
  });
}

for (const id of ['laundry', 'hockey', 'park']) {
  test(`${id}: overpass preserves both road layers and kart clearance`, () => {
    const T = buildTrack(TRACKS[id]);
    const crossings = [];
    for (let i = 0; i < T.N; i++) {
      for (let j = i + 50; j < Math.min(T.N, T.N + i - 50); j++) {
        if (Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]) > 1.05) continue;
        crossings.push([i, j]);
      }
    }
    assert.ok(crossings.length, 'route crosses itself');
    for (const [a, b] of crossings) {
      assert.ok(Math.abs(T.y[a] - T.y[b]) > 12, `crossing at ${a}/${b} needs room under the deck`);
      const x = (T.x[a] + T.x[b]) / 2, z = (T.z[a] + T.z[b]) / 2;
      assert.ok(Math.abs(locate(T, x, z, a, 20, T.y[a]) - a) < 3);
      assert.ok(Math.abs(locate(T, x, z, b, 20, T.y[b]) - b) < 3);
    }
  });
}

test('the marked flume stays slick for a sustained descent', () => {
  const R = new Race({ track: 'park', racers: [{ id: 'k8e' }], humans: [0] });
  const T = R.T, K = R.karts[0];
  const k = T.y.findIndex((y, i) => y > 70 && T.def.points[T.sec[i]].tag === 'flume');
  assert.ok(k > 0);
  Object.assign(K, { x: T.x[k], y: T.y[k], z: T.z[k], k, yaw: Math.atan2(T.tx[k], T.tz[k]), vx: 0, vz: 0 });
  R.phase = 'race';
  R.step([noInput()]);
  assert.equal(K.surf, 'flume');
  assert.ok(T.y[k + 220] < T.y[k] - 25);
});
