import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash } from '../src/sim/sim.js';
import { CPU, LEVELS } from '../src/ai/cpu.js';
import { ROSTER } from '../src/fighters/index.js';

function cpuMatch(p1, p2, l1, l2, seed) {
  const st = createMatch({ p1, p2, seed });
  const a = new CPU(0, l1, seed), b = new CPU(1, l2, seed + 1);
  let n = 0;
  const events = {};
  while (st.phase !== 'end' && n < 60 * 60 * 12) {
    stepInPlace(st, a.input(st), b.input(st));
    for (const e of st.ev) { events[e.k] = (events[e.k] || 0) + 1; if (e.p !== undefined) events[e.k + e.p] = (events[e.k + e.p] || 0) + 1; }
    n++;
  }
  return { st, n, events };
}

test('the CPU at every difficulty plays a whole match, every fighter', () => {
  for (const level of Object.keys(LEVELS)) {
    for (const id of ROSTER) {
      const opp = ROSTER[(ROSTER.indexOf(id) + 1) % ROSTER.length];
      const { st, events } = cpuMatch(id, opp, level, level, 5 + ROSTER.indexOf(id));
      assert.equal(st.phase, 'end', `${level} ${id} finished`);
      assert.ok(events.hit > 5, `${level} ${id} landed hits`);
    }
  }
});

test('CPU vs CPU is reproducible', () => {
  const A = cpuMatch('rubberta', 'johnny', 'hard', 'normal', 21);
  const B = cpuMatch('rubberta', 'johnny', 'hard', 'normal', 21);
  assert.equal(hash(A.st), hash(B.st));
  assert.equal(A.n, B.n);
});

test('Hard beats Easy over several seeded matches', () => {
  let hard = 0, total = 0;
  for (let s = 0; s < 10; s++) {
    const id = ROSTER[s % ROSTER.length];
    // alternate sides so the side isn't the reason
    const hardSide = s % 2;
    const { st } = hardSide === 0 ? cpuMatch(id, id, 'hard', 'easy', 100 + s) : cpuMatch(id, id, 'easy', 'hard', 100 + s);
    total++;
    if (st.winner === hardSide) hard++;
  }
  assert.ok(hard >= 8, `hard won ${hard} of ${total}`);
});

test('Hard defends far better than Easy (blocks, out-pokes), and both use the special', () => {
  // a scripted attacker walks in and pokes; how much gets through?
  const rate = {};
  for (const level of ['easy', 'hard']) {
    let blocked = 0, landed = 0;
    for (let s = 0; s < 4; s++) {
      const st = createMatch({ p1: 'kevalanche', p2: 'johnny', seed: 400 + s });
      const cpu = new CPU(1, level, 400 + s);
      for (let i = 0; i < 2400 && st.phase !== 'end'; i++) {
        const me = st.f[0], d = st.f[1].x - me.x;
        const k = i % 50;
        const a = d > 2000 ? 2 /* walk in */ : k === 0 ? 32 /* heavy */ : k === 25 ? 16 /* light */ : 0;
        stepInPlace(st, a, cpu.input(st));
        for (const e of st.ev) if (e.p === 0) { if (e.k === 'block') blocked++; if (e.k === 'hit') landed++; }
        st.f[0].hp = Math.max(st.f[0].hp, 500); st.f[1].hp = Math.max(st.f[1].hp, 500);   // keep it going
      }
    }
    rate[level] = { blocked, landed };
  }
  assert.ok(rate.hard.landed * 2 < rate.easy.landed, JSON.stringify(rate));
  assert.ok(rate.easy.blocked > 0, 'easy blocks sometimes');
  // and both spend a full meter
  for (const level of ['easy', 'hard']) {
    let sp = 0;
    for (let s = 0; s < 3; s++) sp += cpuMatch('kevalanche', 'sumaura', 'normal', level, 300 + s).events.special1 || 0;
    assert.ok(sp > 0, `${level} used its special`);
  }
});

/* a scripted attacker for the guard tests: walks in, then only lows (S+O)
   or only jump-in dive slams (overheads) */
function guardRun(level, kind) {
  let g = 0, gc = 0, blocked = 0, hit = 0;
  for (let s = 0; s < 6; s++) {
    const st = createMatch({ p1: 'kevalanche', p2: 'johnny', seed: 50 + s });
    st.phase = 'fight';
    const cpu = new CPU(1, level, 50 + s);
    for (let i = 0; i < 3000; i++) {
      const d = st.f[1].x - st.f[0].x;
      const a = kind === 'low' ? (d > 1900 ? 2 : i % 40 === 0 ? 8 | 16 : 8) : (d > 2600 ? 2 : i % 90 === 0 ? 4 | 2 : i % 90 === 16 ? 8 | 32 : 0);
      stepInPlace(st, a, cpu.input(st));
      if (st.f[1].act === 'guard') { g++; if (st.f[1].down) gc++; }
      for (const e of st.ev) if (e.p === 0) { if (e.k === 'block') blocked++; if (e.k === 'hit') hit++; }
      st.f[0].hp = Math.max(st.f[0].hp, 500); st.f[1].hp = Math.max(st.f[1].hp, 500); st.phase = 'fight';
    }
  }
  return { crouched: gc / Math.max(1, g), blocked, hit, share: blocked / Math.max(1, blocked + hit) };
}

test('blocking with E: Easy rarely, Hard well — it crouch-guards against lows and stands up to overheads', () => {
  const lo = { easy: guardRun('easy', 'low'), hard: guardRun('hard', 'low') };
  assert.ok(lo.hard.crouched >= 0.6, `hard crouches ${lo.hard.crouched.toFixed(2)} of its guard against lows`);
  assert.ok(lo.hard.hit * 3 < lo.easy.hit, `lows landed: hard ${lo.hard.hit}, easy ${lo.easy.hit}`);
  const hi = { easy: guardRun('easy', 'dive'), hard: guardRun('hard', 'dive') };
  assert.ok(hi.hard.share > hi.easy.share * 2, `overheads blocked: hard ${hi.hard.share.toFixed(2)}, easy ${hi.easy.share.toFixed(2)}`);
});

test('the CPU techs throws: Hard often, Easy seldom', () => {
  const rate = {};
  for (const level of ['easy', 'hard']) {
    let techs = 0, grabs = 0;
    for (let s = 0; s < 30; s++) {
      const st = createMatch({ p1: 'sumaura', p2: 'johnny', seed: 70 + s });
      st.phase = 'fight'; st.f[0].x = -800; st.f[1].x = 800;
      const cpu = new CPU(1, level, 70 + s);
      for (let i = 0; i < 60; i++) {
        stepInPlace(st, i === 0 ? 48 : 0, cpu.input(st));
        for (const e of st.ev) { if (e.k === 'grab' && e.throw) grabs++; if (e.k === 'tech') techs++; }
      }
    }
    rate[level] = techs / Math.max(1, grabs);
  }
  assert.ok(rate.hard > 0.5 && rate.easy < 0.25, JSON.stringify(rate));
});
