import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, CUP, locate, rightX, rightZ } from '../src/race/track.js';

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

test('the cup starts at The Landing and includes five distinct venues', () => {
  assert.deepEqual(CUP, ['landing', 'laundry', 'hockey', 'park', 'dojo']);
  for (const id of CUP) assert.ok(TRACKS[id], id);
});

for (const track of ['laundry', 'hockey', 'park', 'dojo']) {
  test(`${track}: a whole 3-lap race of 8 hard CPUs, everyone home, with airborne launches`, () => {
    const { R, ev, mean } = run(track, 11);
    assert.equal(R.phase, 'done');
    assert.equal(R.finishOrder.length, 8);
    assert.ok(mean > 40 && mean < 95, `mean lap ${mean.toFixed(1)}`);
    for (const k of ['boost', 'use', 'trick', 'pad', 'box', 'hit', 'launch']) assert.ok(ev[k], `${k} events`);
    assert.ok((ev.fall || 0) <= 6, `falls ${ev.fall}`);
  });
}

for (const id of ['laundry', 'hockey', 'park', 'dojo']) {
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

test('Centre Court: the full ramp footprint clears the lower route', () => {
  const T = buildTrack(TRACKS.laundry);
  let overlaps = 0;
  for (let a = 0; a < T.N; a++) {
    for (let b = a + 45; b < Math.min(T.N, T.N + a - 45); b++) {
      if (Math.hypot(T.x[a] - T.x[b], T.z[a] - T.z[b]) > T.w[a] + T.w[b]) continue;
      overlaps++;
      assert.ok(Math.abs(T.y[a] - T.y[b]) > 12, `road edges at ${a}/${b} need clearance`);
    }
  }
  assert.ok(overlaps > 0);
});

test('Rapids: the splashdown has a dry lane and a splashy run-off', () => {
  const R = new Race({ track: 'park', racers: [{id:'k8e'}, {id:'zach'}], humans: [0, 1] });
  const { T } = R;
  const start = T.sec.findIndex(i => T.def.points[i].tag === 'runoff');
  assert.ok(start > 0);
  const k = start + 22;
  for (const [i, K] of R.karts.entries()) {
    const d = T.w[k] * (i ? 0.67 : -0.5);
    Object.assign(K, { x: T.x[k] + rightX(T,k)*d, y:T.y[k], z:T.z[k] + rightZ(T,k)*d,
      k, d, vy: 0, vx: 0, vz: 0, yaw: Math.atan2(T.tx[k], T.tz[k]) });
  }
  R.phase = 'race';
  R.step([noInput(), noInput()]);
  assert.deepEqual(R.karts.map(K => K.surf), ['track', 'pool']);
  assert.ok(R.events.some(e => e.k === 'splash' && e.i === 1));
});

test('Rapids: a fast, lined-up kart can take the shortcut without falling or skipping a lap', () => {
  const R = new Race({ track: 'park', racers: [{ id: 'k8e' }], humans: [0] });
  const { T } = R, C = T.cut, K = R.karts[0];
  const put = (fwd, yaw) => {
    const k = C.kA;
    Object.assign(K, { x: C.ax, z: C.az, y: T.y[k], k, kc: k - R.startK,
      lastGood: k, yaw, vx: Math.sin(yaw) * fwd, vz: Math.cos(yaw) * fwd, fwd });
  };
  const heading = Math.atan2(C.ux, C.uz);
  R.phase = 'race';
  put(22, heading + Math.PI / 2);
  R.step([{ ...noInput(), gas: true }]);
  assert.ok(!K.cut, 'requires lining up with the bridge');
  put(4, heading);
  R.step([{ ...noInput(), gas: true }]);
  assert.ok(!K.cut, 'requires some entry speed');
  put(22, heading);
  R.step([{ ...noInput(), gas: true }]);
  assert.ok(K.cut);
  assert.ok(R.events.some(e => e.k === 'shortcut'));
  for (let i = 0; i < 240 && K.cut; i++) R.step([{ ...noInput(), gas: true }]);
  assert.ok(!K.cut && !K.fish && Math.abs(K.k - C.kB) < 12);
  assert.ok(C.kB - C.kA - C.len > 50);
  assert.ok(K.kc < T.N, 'the shortcut credits only the section it bypasses');
});

test('Rapids: a torpedo hit can send a kart over the open flume edge', () => {
  const R = new Race({ track: 'park', racers: [{ id: 'k8e' }, { id: 'zach' }], humans: [0, 1] });
  R.phase = 'race';
  const { T } = R, [A, B] = R.karts;
  const k = T.drop.findIndex(v => v) + 28;
  const rx = rightX(T, k), rz = rightZ(T, k), edge = T.w[k] + T.m[k];
  for (const [K,d] of [[A,edge - 3], [B,edge - 0.1]]) {
    Object.assign(K, { x: T.x[k]+rx*d, z: T.z[k]+rz*d, y: T.y[k], k,
      yaw: Math.atan2(rx,rz), surf:'flume', lastGood:k, d });
  }
  const speed = A.S.top * 1.18;
  Object.assign(A, {fwd:speed,vx:rx*speed,vz:rz*speed});
  R._bumps();
  assert.ok(R.events.some(e => e.k === 'torpedo' && e.by === A.i && e.i === B.i));
  for (let i=0;i<120 && !B.fish;i++) R.step([noInput(),noInput()]);
  assert.ok(B.fish, 'outward momentum carried the slower kart off the unguarded edge');
});

test('Rapids: the shortcut can be reached by steering in from the main road', () => {
  const R = new Race({ track: 'park', racers: [{ id: 'k8e' }], humans: [0] });
  R.phase = 'race';
  const { T } = R, C = T.cut, K = R.karts[0];
  const k = C.kA - 30, d = -3, speed = 12;
  const approach = Math.atan2(T.tx[k], T.tz[k]);
  const bridge = Math.atan2(C.ux, C.uz);
  Object.assign(K, { x: T.x[k] + rightX(T,k)*d, y: T.y[k], z: T.z[k] + rightZ(T,k)*d, k, d,
    yaw: approach, vx: Math.sin(approach)*speed, vz: Math.cos(approach)*speed, fwd: speed, lastGood: k });
  let turning = false;
  for (let tick = 0; tick < 180 && !K.cut; tick++) {
    if (K.x >= C.ax - 9) turning = true;
    const delta = (turning ? bridge : approach) - K.yaw;
    const steer = -Math.max(-1, Math.min(1, Math.atan2(Math.sin(delta), Math.cos(delta)) * 2.4));
    R.step([{ ...noInput(), steer, gas: K.fwd < 12, brake: K.fwd > 13 }]);
  }
  assert.ok(K.cut && !K.fish, 'a controlled turn enters from the dry lane');
});
