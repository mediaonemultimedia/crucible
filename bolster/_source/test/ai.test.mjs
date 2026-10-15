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
