/* The feel pass (Kevalanche's rig and timing) is render only: the sim's
   state hash for any input sequence is what it was before the pass (golden
   hashes, recorded on bolster-source before it), and posing his plush from
   the sim every tick reads the state without changing it. Also: ?feel=old
   gives the previous puppet, and every move keeps the soft body together. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash } from '../src/sim/sim.js';
import { CPU } from '../src/ai/cpu.js';
import { ROSTER } from '../src/fighters/index.js';
import { SoftBody } from '../shared/grommet/softbody.js';
import { buildBear } from '../shared/grommet/athletes/bear.rig.js';
import { BipedPuppet, phaseOf } from '../src/render/puppets.js';
import { BoxerFeel, FEEL, boxerPuppet } from '../src/render/feel.js';
import { probe } from '../tools/feel-probe.mjs';

/* a seeded input sequence: CPU v CPU, or random masks */
function play(p1, p2, seed, ticks, { random = false, onTick = null } = {}) {
  const st = createMatch({ p1, p2, seed });
  const a = new CPU(0, 'hard', seed * 3 + 1), b = new CPU(1, 'normal', seed * 5 + 2);
  let r = seed * 2654435761 >>> 0;
  const rnd = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r & 255; };
  for (let i = 0; i < ticks; i++) {
    const m1 = random ? rnd() : a.input(st), m2 = random ? rnd() : b.input(st);
    stepInPlace(st, m1, m2);
    if (onTick) onTick(st);
  }
  return hash(st);
}

/* recorded with the sim as it was before the feel pass (bolster-source @ 2b8c479);
   re-recorded deliberately by the throws pass (bolster-throws), which changes
   the sim: the toss at tick 28, the throw to the open side, the flight, the
   bounce, two new fighter fields (td, bn) and the CPU's close-range throws */
const GOLDEN = {
  'kevalanche:kevalanche:11:cpu': 1922798123,
  'kevalanche:kevalanche:12:rnd': 4082280361,
  'kevalanche:rubberta:11:cpu': 1171324679,
  'kevalanche:rubberta:12:rnd': 2160693820,
  'kevalanche:johnny:11:cpu': 703345262,
  'kevalanche:johnny:12:rnd': 1610270072,
  'kevalanche:sumaura:11:cpu': 3121236453,
  'kevalanche:sumaura:12:rnd': 275273641,
  'kevalanche:k8e:11:cpu': 68983565,
  'kevalanche:k8e:12:rnd': 2522539256,
  'kevalanche:sebas:11:cpu': 1665754130,
  'kevalanche:sebas:12:rnd': 1066627071,
  'kevalanche:zach:11:cpu': 2644044522,
  'kevalanche:zach:12:rnd': 2922737404,
  'johnny:kevalanche:13:cpu': 697694793,
  'sumaura:zach:14:rnd': 4263736923,
};

test('the sim hash for every input sequence is the same as before the feel pass', () => {
  for (const [key, want] of Object.entries(GOLDEN)) {
    const [p1, p2, seed, mode] = key.split(':');
    assert.equal(play(p1, p2, +seed, 1800, { random: mode === 'rnd' }), want, key);
  }
});

test('posing Kevalanche every tick reads the sim and never changes it', () => {
  for (const [p2, seed] of [['johnny', 3], ['sumaura', 9], ['kevalanche', 4]]) {
    const plain = play('kevalanche', p2, seed, 1200);
    const soft = new SoftBody(buildBear());
    const P = new BoxerFeel(soft);
    P.aim = [0.66, 0, 0.75]; P.side = [0.75, 0, -0.66]; P.oppHead = [3, 2.5, 3];
    const posed = play('kevalanche', p2, seed, 1200, {
      onTick: (st) => {
        const before = hash(st);
        for (const F of st.f) if (F.id === 'kevalanche') { P.frac = 0.5; P.freeze = st.pause; P.perform(F, phaseOf(F)); soft.advance(1 / 60, (h) => P.update(h)); P.contact({ dmg: 90 }); }
        assert.equal(hash(st), before);
      },
    });
    assert.equal(posed, plain, p2);
  }
});

test('?feel=old plays the previous puppet; the default is the feel pass', () => {
  const soft = () => new SoftBody(buildBear());
  assert.ok(boxerPuppet(soft()) instanceof BoxerFeel);
  FEEL.old = true;
  try { const p = boxerPuppet(soft()); assert.ok(p instanceof BipedPuppet && !(p instanceof BoxerFeel)); } finally { FEEL.old = false; }
});

test('every move keeps his soft body together (no particle further out than before + 0.5)', () => {
  for (const mv of ['light', 'heavy', 'lowLight', 'signature', 'special', 'throwHold', 'airHeavy', 'dive']) {
    const ticks = mv === 'dive' ? 30 : 80;
    const old = probe({ old: true, mv, ticks }), now = probe({ mv, ticks });
    assert.ok(Number.isFinite(now) && now < old + 0.5, `${mv}: ${now.toFixed(2)} vs ${old.toFixed(2)}`);
  }
});
