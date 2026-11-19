/* The motion specials (no meter): the motions come out for every fighter,
   BOP and WALLOP give their two versions, the old inputs still work, they're
   linear (a sidestep beats every one), the Torpedo is hopped, the neck is
   hittable, the roll bounces off a block, one shot on screen, the ink, and
   determinism. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, BLOCK, CROUCH, JUMP } from '../src/sim/input.js';
import { FIGHTERS, ROSTER } from '../src/fighters/index.js';
import { MOVE_LIST, SPECIALS, motionText } from '../src/fighters/movelist.js';

const fight = (p1 = 'kevalanche', p2 = 'sumaura') => { const st = createMatch({ p1, p2, seed: 3 }); while (st.phase !== 'fight') stepInPlace(st, 0, 0); return st; };
const run = (st, n, a = 0, b = 0) => { for (let i = 0; i < n; i++) stepInPlace(st, a, b); return st; };
const at = (st, d) => { st.f[0].x = -d / 2; st.f[1].x = d / 2; st.f[0].z = st.f[1].z = 0; };
const D = CROUCH;
// player 1 faces right: → forward, ← back
const MOTION = {
  kevalanche: (b) => [D, D, D | RIGHT, RIGHT, RIGHT | b],
  johnny: (b) => [D, D, D | LEFT, LEFT, LEFT | b],
  k8e: (b) => [LEFT, LEFT | D, D, D | RIGHT, RIGHT, RIGHT | b],
  rubberta: (b) => [RIGHT, RIGHT | D, D, D | LEFT, LEFT, LEFT | b],
  sumaura: (b) => [LEFT, LEFT, 0, RIGHT | b],
  zach: (b) => [...Array(46).fill(D), UP | b],
  sebas: (b) => [...Array(46).fill(LEFT), RIGHT | b],
};
const feed = (st, masks, b2 = 0) => { const ev = []; for (const m of masks) { stepInPlace(st, m, b2); ev.push(...st.ev); } return ev; };

test('every fighter: the motion + BOP / WALLOP comes out (no meter)', () => {
  for (const id of ROSTER) {
    for (const [btn, name] of [[LIGHT, 'mspL'], [HEAVY, 'mspH']]) {
      if (!FIGHTERS[id].moves[name]) continue;
      const st = fight(id); at(st, 6000);
      st.f[0].meter = 0;
      const ev = feed(st, MOTION[id](btn));
      assert.equal(st.f[0].mv, name, `${id} ${name}`);
      assert.ok(ev.some((e) => e.k === 'msp' && e.p === 0 && e.mv === name));
    }
  }
});

test('BOP is the quicker / shorter one, WALLOP the longer / stronger one', () => {
  const M = (id, n) => FIGHTERS[id].moves[n];
  assert.ok(M('kevalanche', 'mspH').spawn[0].proj.vx > M('kevalanche', 'mspL').spawn[0].proj.vx);
  assert.ok(M('johnny', 'mspH').spawn[0].proj.vx > M('johnny', 'mspL').spawn[0].proj.vx && M('johnny', 'mspH').spawn[0].proj.vy < 0);
  assert.ok(M('k8e', 'mspH').hits[0].from > M('k8e', 'mspL').hits[0].from && M('k8e', 'mspH').ext.x1 > M('k8e', 'mspL').ext.x1);
  assert.ok(M('rubberta', 'mspH').spawn[0].proj.life > M('rubberta', 'mspL').spawn[0].proj.life);
  assert.ok(M('sebas', 'mspH').motion[0].to > M('sebas', 'mspL').motion[0].to);
  assert.ok(!M('sumaura', 'mspL') && !M('zach', 'mspL'), 'WALLOP only');
});

test('the old inputs still work: a lone tap of ↓ sidesteps, double-tap → dashes, ↓+P is the signature', () => {
  const a = fight('kevalanche'); at(a, 4000);
  feed(a, [DOWN]); assert.equal(a.f[0].act, 'side');
  const b = fight('kevalanche'); at(b, 6000);
  feed(b, [RIGHT, 0, RIGHT]); assert.equal(b.f[0].act, 'dash');
  const c = fight('johnny'); at(c, 6000);
  feed(c, [D | HEAVY]); assert.equal(c.f[0].mv, 'signature');
  const d = fight('kevalanche'); at(d, 4000);
  feed(d, [LEFT | HEAVY]); assert.equal(d.f[0].mv, 'sweep', 'back + P is still the spin');
  // a plain walk back then forward + P (too slow) is a heavy, not the Panda Roll
  const e = fight('sumaura'); at(e, 3000);
  feed(e, [...Array(10).fill(LEFT), ...Array(20).fill(0), RIGHT | HEAVY]); assert.equal(e.f[0].mv, 'heavy');
});

test('the ↓ sidestep key works as down too: the special cancels the sidestep it started', () => {
  const st = fight('kevalanche'); at(st, 6000);
  feed(st, [DOWN, DOWN, DOWN | RIGHT, RIGHT, RIGHT | LIGHT]);
  assert.equal(st.f[0].mv, 'mspL');
  const z = fight('zach'); at(z, 6000);
  feed(z, [...Array(46).fill(DOWN), JUMP | HEAVY]);
  assert.equal(z.f[0].mv, 'mspH', 'hold ↓ (circling), hop key + WALLOP');
});

test('every special connects on a standing dummy, and a sidestep beats every one (linear)', () => {
  for (const id of ROSTER) {
    for (const name of ['mspL', 'mspH']) {
      if (!FIGHTERS[id].moves[name]) continue;
      const btn = name === 'mspL' ? LIGHT : HEAVY;
      const dist = id === 'k8e' ? (name === 'mspL' ? 4600 : 6200) : 5200;
      const st = fight(id, 'sumaura');
      const m0 = MOTION[id](btn);
      feed(st, m0.slice(0, -1)); at(st, dist); feed(st, [m0[m0.length - 1]]); run(st, 160);
      assert.ok(st.f[1].hp < FIGHTERS.sumaura.health, `${id} ${name} connects`);
      if (process.env.DBG) console.log(id, name, 'ok');
      const s2 = fight(id, 'sumaura');
      const m = MOTION[id](btn);
      feed(s2, m.slice(0, -1)); at(s2, dist); feed(s2, [m[m.length - 1]]);
      // the dummy sidesteps as it comes out, then again
      run(s2, 4, 0, UP); run(s2, 14); run(s2, 1, 0, UP); run(s2, 140);
      assert.equal(s2.f[1].hp, FIGHTERS.sumaura.health, `${id} ${name} sidestepped`);
      if (process.env.DBG) console.log(id, name, 'side ok');
    }
  }
});

test('the Torpedo travels low: a hop clears it', () => {
  const st = fight('zach', 'kevalanche'); at(st, 5200);
  feed(st, MOTION.zach(HEAVY).slice(0, -1));
  feed(st, [UP | HEAVY]);
  run(st, 6); run(st, 2, 0, JUMP); run(st, 60);
  assert.equal(st.f[1].hp, FIGHTERS.kevalanche.health);
});

test('specials are punishable on block; the roll bounces back off a block', () => {
  const st = fight('sumaura', 'kevalanche'); at(st, 4200);
  const ev = feed(st, MOTION.sumaura(HEAVY), BLOCK).concat(feed(st, Array(40).fill(0), BLOCK));
  assert.ok(ev.some((e) => e.k === 'block'));
  assert.ok(ev.some((e) => e.k === 'rebound'), 'bounced');
  // the blocker is free long before the roller
  const s2 = fight('sumaura', 'kevalanche'); at(s2, 4200);
  feed(s2, MOTION.sumaura(HEAVY), BLOCK);
  let free = -1, rec = -1;
  for (let i = 0; i < 90; i++) {
    stepInPlace(s2, 0, BLOCK);
    if (free < 0 && s2.f[1].act === 'guard') free = i;
    if (rec < 0 && s2.f[0].act === 'idle' && i > 5) rec = i;
  }
  assert.ok(free >= 0 && rec - free >= 12, `blocker +${rec - free}`);
});

test("K8-E's stretched neck is a hurt box: hit it while it's out", () => {
  // a whiff (the head stops short of him), then his heavy into the neck
  const st = fight('k8e', 'kevalanche'); at(st, 8400);
  feed(st, MOTION.k8e(HEAVY));
  run(st, 20);
  assert.equal(st.f[0].mv, 'mspH');
  assert.equal(st.f[1].hp, FIGHTERS.kevalanche.health);
  run(st, 1, 0, HEAVY); run(st, 20);
  assert.ok(st.f[0].hp < FIGHTERS.k8e.health, 'the neck got hit');
});

test('one projectile on screen per player; the ink inks the face (an event, cosmetic)', () => {
  const st = fight('kevalanche'); at(st, 9000);
  feed(st, MOTION.kevalanche(LIGHT)); run(st, 50);
  assert.equal(st.proj.length, 1);
  feed(st, MOTION.kevalanche(HEAVY)); run(st, 20);
  assert.equal(st.proj.length, 1, 'still one');
  const r = fight('rubberta', 'kevalanche'); at(r, 5000);
  const ev = feed(r, MOTION.rubberta(HEAVY)).concat(feed(r, Array(60).fill(0)));
  assert.ok(ev.some((e) => e.k === 'inked' && e.p === 1));
  assert.ok(r.f[1].ink > 0);
  run(r, 130); assert.equal(r.f[1].ink, 0);
});

test('not spammable: a cooldown between motion specials', () => {
  const st = fight('sebas'); at(st, 9000);
  feed(st, MOTION.sebas(LIGHT)); run(st, 56);
  feed(st, [...Array(46).fill(LEFT)].slice(0, 2));
  assert.ok(st.f[0].mc > 0);
});

test('deterministic with the specials in: same inputs, same hash; resimulate from a clone', () => {
  for (const id of ROSTER) {
    const masks = [...MOTION[id](HEAVY), ...Array(30).fill(0), ...MOTION[id](LIGHT), ...Array(80).fill(0)];
    const a = fight(id, 'rubberta'), b = fight(id, 'rubberta');
    at(a, 5000); at(b, 5000);
    feed(a, masks, LIGHT); feed(b, masks, LIGHT);
    assert.equal(hash(a), hash(b));
    const c = fight(id, 'rubberta'); at(c, 5000); feed(c, masks.slice(0, 20), LIGHT);
    const snap = clone(c); feed(c, masks.slice(20), LIGHT); feed(snap, masks.slice(20), LIGHT);
    assert.equal(hash(c), hash(snap));
  }
});

test('the move list is data: every fighter, special first, arrows and buttons', () => {
  for (const id of ROSTER) {
    const L = MOVE_LIST[id];
    assert.equal(L[0].special, 1);
    assert.ok(L[0].motion.length >= 2 && L[0].buttons.length >= 1 && L[0].name && L[0].desc);
    assert.equal(L[0].travel, 'linear');
    assert.ok(motionText(id).includes('+'));
    assert.ok(SPECIALS[id].name);
  }
});
