import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMatch, stepInPlace, clone, hash, RING, EDGE, BED, isqrt, unit, roomAlong } from '../src/sim/sim.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from '../src/sim/input.js';
import { FIGHTERS, ROSTER } from '../src/fighters/index.js';

const fight = (p1 = 'kevalanche', p2 = 'rubberta', seed = 1) => {
  const st = createMatch({ p1, p2, seed });
  while (st.phase !== 'fight') stepInPlace(st, 0, 0);
  return st;
};
const run = (st, n, a = 0, b = 0) => { for (let i = 0; i < n; i++) stepInPlace(st, typeof a === 'function' ? a(i, st) : a, typeof b === 'function' ? b(i, st) : b); return st; };
const place = (st, k, x, z) => { const f = st.f[k]; f.x = x; f.z = z; };
const dist = (st) => isqrt((st.f[0].x - st.f[1].x) ** 2 + (st.f[0].z - st.f[1].z) ** 2);
const noisy = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 22; }; };

test('the sim never reads a clock or Math.random', () => {
  const src = fs.readFileSync(new URL('../src/sim/sim.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const bad of ['Math.random', 'Date', 'performance', 'Math.sin', 'Math.cos', 'Math.atan']) assert.ok(!src.includes(bad), bad);
});

test('determinism: the same inputs give the same hash; clone + resim matches', () => {
  for (const [p1, p2] of [['kevalanche', 'rubberta'], ['johnny', 'k8e'], ['sumaura', 'sebas'], ['zach', 'kevalanche']]) {
    const r1 = noisy(7), r2 = noisy(7);
    const a = createMatch({ p1, p2, seed: 9 }), b = createMatch({ p1, p2, seed: 9 });
    const snaps = [];
    for (let i = 0; i < 3000; i++) {
      const x = r1(), y = r1();
      stepInPlace(a, x, y);
      if (i % 500 === 0) snaps.push([clone(a), i]);
    }
    for (let i = 0; i < 3000; i++) stepInPlace(b, r2(), r2());
    assert.equal(hash(a), hash(b), `${p1} v ${p2}`);
    // rollback: resimulate from a snapshot with the same inputs
    const [s0, i0] = snaps[2];
    const r3 = noisy(7);
    for (let i = 0; i <= i0; i++) { r3(); r3(); }
    for (let i = i0 + 1; i < 3000; i++) stepInPlace(s0, r3(), r3());
    assert.equal(hash(s0), hash(a));
    // the state stays plain data
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  }
});

test('integer maths: positions and facings stay integers', () => {
  const st = fight('k8e', 'zach');
  const r = noisy(3);
  for (let i = 0; i < 2000; i++) {
    stepInPlace(st, r(), r());
    for (const f of st.f) for (const k of ['x', 'y', 'z', 'vx', 'vz', 'vy', 'fx', 'fz', 'hp']) assert.ok(Number.isInteger(f[k]), `${k}=${f[k]}`);
  }
});

test('walking: forward and back along the line; double-tap dashes', () => {
  const st = fight();
  const x0 = st.f[0].x;
  run(st, 30, RIGHT);
  assert.ok(st.f[0].x > x0 + 1000 && st.f[0].act === 'walkF');
  run(st, 10, 0);
  const x1 = st.f[0].x;
  run(st, 30, LEFT);
  assert.ok(st.f[0].x < x1 - 800);
  // player 2: LEFT is forward
  const x2 = st.f[1].x;
  run(st, 20, 0, LEFT);
  assert.ok(st.f[1].x < x2);
  // a dash (tap, tap)
  const st2 = fight();
  run(st2, 3, RIGHT); run(st2, 3, 0); run(st2, 1, RIGHT);
  assert.equal(st2.f[0].act, 'dash');
});

test('a tap of up / down sidesteps round the other one, the distance kept', () => {
  for (const [bit, sign] of [[UP, -1], [DOWN, 1]]) {
    const st = fight();
    const d0 = dist(st);
    run(st, 1, bit); run(st, 6, 0);
    assert.equal(st.f[0].act, 'side');
    run(st, 14, 0);
    assert.notEqual(st.f[0].act, 'side');
    // player 1 starts on −x facing +x, so "into the screen" is −z
    assert.ok(Math.sign(st.f[0].z) === sign && Math.abs(st.f[0].z) > 900, `z=${st.f[0].z}`);
    assert.ok(Math.abs(dist(st) - d0) < 120, `distance ${d0} → ${dist(st)}`);
    // both still face each other
    const [ux, uz] = unit(st.f[1].x - st.f[0].x, st.f[1].z - st.f[0].z);
    assert.ok(ux * st.f[0].fx + uz * st.f[0].fz > 1000 * 1024 / 1024);
  }
});

test('held: the circling walk goes round and round', () => {
  const st = fight();
  const d0 = dist(st);
  run(st, 200, UP);
  assert.equal(st.f[0].act, 'circle');
  // a good way round the ring
  const ang = Math.atan2(st.f[0].z - st.f[1].z, st.f[0].x - st.f[1].x);
  assert.ok(Math.abs(Math.abs(ang) - Math.PI) > 0.8, `angle ${ang}`);
  assert.ok(Math.abs(dist(st) - d0) < 400, `distance ${d0} → ${dist(st)}`);
});

test('the hop and the crouch have keys of their own', () => {
  const st = fight();
  run(st, 6, JUMP);
  assert.ok(st.f[0].air && st.f[0].y > 0);
  let top = 0;
  for (let i = 0; i < 60; i++) { stepInPlace(st, 0, 0); top = Math.max(top, st.f[0].y); }
  assert.ok(top < 3800, `a short hop: ${top}`);
  assert.equal(st.f[0].air, 0);
  run(st, 3, CROUCH);
  assert.equal(st.f[0].act, 'crouch');
});

test('a sidestep makes a linear heavy miss; the spin (tracking) catches it', () => {
  // a heavy started at someone who then sidesteps: misses
  const a = fight();
  place(a, 0, -1200, 0); place(a, 1, 1200, 0);
  run(a, 1, HEAVY, UP);
  run(a, 45, 0, 0);
  assert.equal(a.f[1].hp, FIGHTERS.rubberta.health, 'sidestepped the heavy');
  // the same without the sidestep: hits
  const b = fight();
  place(b, 0, -1200, 0); place(b, 1, 1200, 0);
  run(b, 1, HEAVY); run(b, 45, 0);
  assert.ok(b.f[1].hp < FIGHTERS.rubberta.health, 'the heavy lands');
  // the spin (back + heavy) against the same sidestep: lands
  const c = fight();
  place(c, 0, -1200, 0); place(c, 1, 1200, 0);
  run(c, 1, HEAVY | LEFT, UP);
  run(c, 50, 0, 0);
  assert.ok(c.f[1].hp < FIGHTERS.rubberta.health, 'the spin tracks');
});

test('every fighter has a tracking move', () => {
  for (const id of ROSTER) {
    const moves = Object.values(FIGHTERS[id].moves);
    assert.ok(moves.some((m) => m.circ && m.hits.some((h) => h.W >= 2000)), id);
  }
});

test('the edge stops a walk; nobody walks off', () => {
  const st = fight();
  run(st, 400, LEFT);
  assert.ok(st.f[0].x >= -(RING - EDGE));
  run(st, 400, UP);
  for (const f of st.f) assert.ok(Math.abs(f.x) <= RING && Math.abs(f.z) <= RING);
  assert.equal(st.phase, 'fight');
});

test('a heavy with his back to the edge is a ring-out; the round is lost', () => {
  const st = fight();
  place(st, 1, RING - EDGE, 0); place(st, 0, RING - EDGE - 2000, 0);
  st.f[0].fx = 1024; st.f[0].fz = 0;
  run(st, 1, HEAVY);
  let out = false;
  for (let i = 0; i < 400 && st.phase !== 'intro'; i++) { stepInPlace(st, 0, 0); if (st.ev.some((e) => e.k === 'ringout')) out = true; }
  assert.ok(out, 'rang out');
  assert.deepEqual(st.wins, [1, 0]);
  assert.equal(st.round, 2);
});

test('a light at the edge never rings out', () => {
  const st = fight();
  place(st, 1, RING - EDGE, 0); place(st, 0, RING - EDGE - 1700, 0);
  for (let i = 0; i < 6; i++) { run(st, 1, LIGHT); run(st, 16, 0); }
  assert.notEqual(st.f[1].act, 'ringout');
  assert.ok(Math.abs(st.f[1].x) <= RING);
});

test('throws: beat a block, go toward the side with more room, never ring out', () => {
  // forward has more room: thrown on ahead
  const a = fight();
  place(a, 0, -1500, 0); place(a, 1, 0, 0);
  run(a, 1, LIGHT | HEAVY, BLOCK);
  run(a, 80, 0, BLOCK);
  assert.ok(a.f[1].hp < FIGHTERS.rubberta.health, 'the throw beats a block');
  assert.ok(a.f[1].x > 0, `thrown ahead (x=${a.f[1].x})`);
  // the victim's back to the edge: over the shoulder instead, and still on the bed
  const b = fight();
  place(b, 0, RING - EDGE - 1900, 0); place(b, 1, RING - EDGE, 0);
  b.f[0].fx = 1024; b.f[0].fz = 0;
  run(b, 1, LIGHT | HEAVY);
  let rang = false;
  for (let i = 0; i < 120; i++) { stepInPlace(b, 0, 0); if (b.ev.some((e) => e.k === 'ringout')) rang = true; }
  assert.ok(!rang, 'no ring-out from a throw');
  assert.ok(b.f[1].hp < FIGHTERS.rubberta.health, 'thrown');
  assert.ok(b.f[1].x < b.f[0].x, `over the shoulder (victim x=${b.f[1].x}, thrower ${b.f[0].x})`);
  assert.ok(Math.abs(b.f[1].x) <= RING && Math.abs(b.f[1].z) <= RING);
});

test("throws: can't grab someone airborne, knocked down or in hitstun; a tech escapes", () => {
  const air = fight();
  place(air, 0, -1500, 0); place(air, 1, 0, 0);
  run(air, 4, 0, JUMP);
  run(air, 1, LIGHT | HEAVY); run(air, 10, 0);
  assert.notEqual(air.f[1].act, 'grabbed');
  const t = fight();
  place(t, 0, -1500, 0); place(t, 1, 0, 0);
  run(t, 1, LIGHT | HEAVY);
  run(t, 5, 0);
  assert.equal(t.f[1].act, 'grabbed');
  run(t, 1, 0, LIGHT | HEAVY);
  assert.equal(t.f[1].act, 'blockstun', 'teched');
  assert.equal(t.f[1].hp, FIGHTERS.rubberta.health);
});

test('roomAlong: the distance to the edge along a direction', () => {
  assert.equal(roomAlong(0, 0, 1024, 0), RING);
  assert.equal(roomAlong(RING - 100, 0, 1024, 0), 100);
  assert.ok(Math.abs(roomAlong(0, 0, 724, 724) - Math.round(RING * 1024 / 724)) < 3);
});

test('a whole CPU-free match ends (K.O. or time) with a winner', () => {
  const st = createMatch({ p1: 'sumaura', p2: 'johnny', seed: 4 });
  const r = noisy(11);
  for (let i = 0; i < 60 * 60 * 8 && st.phase !== 'end'; i++) stepInPlace(st, r() & ~(UP | DOWN), r() & ~(UP | DOWN));
  assert.equal(st.phase, 'end');
  assert.ok([0, 1, 2].includes(st.winner));
});

test('the carpet: a ring-out lands on it, below the bed', () => {
  const st = fight();
  place(st, 1, RING - EDGE, 0); place(st, 0, RING - EDGE - 2000, 0);
  st.f[0].fx = 1024; st.f[0].fz = 0;
  run(st, 1, HEAVY);
  let low = 0;
  for (let i = 0; i < 300 && st.phase !== 'intro'; i++) { stepInPlace(st, 0, 0); low = Math.min(low, st.f[1].y); }
  assert.ok(low <= -BED + 50, `landed at ${low}`);
});
