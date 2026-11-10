/* OG / ALT on the select screen: the mirror rule, the online select
   handshake carrying the variant, and the variant never touching the sim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash } from '../src/sim/sim.js';
import { CPU } from '../src/ai/cpu.js';
import { ROSTER } from '../src/fighters/index.js';
import { resolveVariants, selectMsg, readSelect, startMsg, readStart, simArgs, cpuAlt, VariantMemory, TWIN_TITLE } from '../src/ui/variant.js';

const wire = (m) => JSON.parse(JSON.stringify(m));

test('mirror rule: same fighter, same variant → the second seat flips', () => {
  assert.deepEqual(resolveVariants(['sebas', 'sebas'], [false, false]), [false, true]);
  assert.deepEqual(resolveVariants(['sebas', 'sebas'], [true, true]), [true, false]);
  // already different: kept
  assert.deepEqual(resolveVariants(['sebas', 'sebas'], [true, false]), [true, false]);
  assert.deepEqual(resolveVariants(['sebas', 'sebas'], [false, true]), [false, true]);
  // different fighters: anything goes, both ALT included
  assert.deepEqual(resolveVariants(['sebas', 'zach'], [true, true]), [true, true]);
  assert.deepEqual(resolveVariants(['sebas', 'zach'], [false, false]), [false, false]);
  // the second seat not in play yet: nothing flipped
  assert.deepEqual(resolveVariants(['sebas', 'sebas'], [false, false], false), [false, false]);
  // every fighter: a mirror is always one OG and one ALT
  for (const id of ROSTER) for (const a of [false, true]) for (const b of [false, true]) {
    const [x, y] = resolveVariants([id, id], [a, b]);
    assert.notEqual(x, y, `${id} ${a} ${b}`);
    assert.equal(x, a);
  }
});

test('the variant round-trips through the online select messages', () => {
  for (const alt of [false, true]) for (const t of ['cur', 'lock']) {
    const m = wire(selectMsg(t, 3, alt));
    assert.equal(m.t, t);
    assert.deepEqual(readSelect(m), { i: 3, alt });
  }
  for (const alt of [[false, false], [true, false], [false, true], [true, true]]) {
    const m = wire(startMsg({ p1: 'sebas', p2: 'johnny', seed: 77, n: 2, alt }));
    assert.deepEqual(readStart(m), { p1: 'sebas', p2: 'johnny', seed: 77, n: 2, alt });
  }
  // an older peer's messages (no variant): OG
  assert.deepEqual(readSelect({ t: 'cur', i: 2 }), { i: 2, alt: false });
  assert.deepEqual(readStart({ t: 'start', p1: 'zach', p2: 'zach', seed: 1, n: 1 }).alt, [false, false]);
});

test('the variant never reaches the sim: same inputs, same hashes, OG or ALT', () => {
  const run = (sel) => {
    const st = createMatch(simArgs(sel));
    const cpu = [new CPU(0, 'hard', 11), new CPU(1, 'hard', 12)];
    const out = [hash(st)];
    for (let t = 0; t < 1500 && st.phase !== 'end'; t++) {
      stepInPlace(st, [cpu[0].input(st), cpu[1].input(st)]);
      if (t % 100 === 0) out.push(hash(st));
    }
    out.push(hash(st));
    return out;
  };
  for (const [p1, p2] of [['sebas', 'johnny'], ['zach', 'zach'], ['kevalanche', 'rubberta']]) {
    const base = run({ p1, p2, seed: 5, alt: [false, false] });
    for (const alt of [[true, false], [false, true], [true, true]]) {
      assert.deepEqual(run({ p1, p2, seed: 5, alt }), base, `${p1} v ${p2} ${alt}`);
    }
    assert.equal(simArgs({ p1, p2, seed: 5, alt: [true, true] }).alt, undefined);
  }
});

test('the computer sometimes goes ALT, seeded; memory per seat per fighter', () => {
  const picks = [];
  for (let s = 1; s <= 200; s++) picks.push(cpuAlt(s, s % 7));
  const n = picks.filter(Boolean).length;
  assert.ok(n > 30 && n < 120, `ALT ${n}/200`);
  assert.equal(cpuAlt(42, 3), cpuAlt(42, 3));
  const M = new VariantMemory();
  assert.equal(M.get(0, 'zach'), false);
  M.set(0, 'zach', true);
  assert.equal(M.get(0, 'zach'), true);
  assert.equal(M.get(1, 'zach'), false);
  assert.equal(M.has(1, 'zach'), false);
  for (const id of ROSTER) assert.ok(TWIN_TITLE[id], id);
});
