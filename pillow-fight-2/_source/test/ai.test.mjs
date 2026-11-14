import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash } from '../src/sim/sim.js';
import { CPU } from '../src/ai/cpu.js';
import { ROSTER } from '../src/fighters/index.js';

const match = (p1, p2, l1, l2, seed = 3) => {
  const st = createMatch({ p1, p2, seed });
  const a = new CPU(0, l1, seed), b = new CPU(1, l2, seed + 1);
  let ticks = 0, rings = 0, hits = 0, sides = 0, throws = 0, sweeps = 0;
  for (; ticks < 60 * 60 * 6 && st.phase !== 'end'; ticks++) {
    stepInPlace(st, a.input(st), b.input(st));
    for (const e of st.ev) { if (e.k === 'ringout') rings++; if (e.k === 'hit') hits++; if (e.k === 'side') sides++; if (e.k === 'grab' && e.throw) throws++; }
    for (const f of st.f) if (f.act === 'attack' && f.mv === 'sweep' && f.t === 1) sweeps++;
  }
  return { st, ticks, rings, hits, sides, throws, sweeps };
};

test('CPU vs CPU: matches finish, with hits, sidesteps and a winner', () => {
  let rings = 0, sides = 0, throws = 0, sweeps = 0;
  for (const [i, p1] of ROSTER.entries()) {
    const p2 = ROSTER[(i + 3) % ROSTER.length];
    const r = match(p1, p2, 'normal', 'hard', i + 1);
    assert.equal(r.st.phase, 'end', `${p1} v ${p2} ended`);
    assert.ok(r.hits > 5, `${p1} v ${p2}: ${r.hits} hits`);
    rings += r.rings; sides += r.sides; throws += r.throws; sweeps += r.sweeps;
  }
  console.log({ rings, sides, throws, sweeps });
  assert.ok(sides > 10 && sweeps > 2 && throws > 0);
});

test('the CPU is deterministic (same seed, same match)', () => {
  const a = match('k8e', 'sebas', 'hard', 'easy', 9), b = match('k8e', 'sebas', 'hard', 'easy', 9);
  assert.equal(hash(a.st), hash(b.st));
});

test('hard beats easy more often than not', () => {
  let w = 0;
  for (let s = 1; s <= 8; s++) { const r = match(ROSTER[s % 7], ROSTER[s % 7], 'hard', 'easy', s * 13); if (r.st.winner === 0) w++; }
  assert.ok(w >= 5, `hard won ${w} of 8`);
});
