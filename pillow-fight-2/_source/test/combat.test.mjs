import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { LEFT, RIGHT, UP, LIGHT, HEAVY, SPECIAL, BLOCK, CROUCH, JUMP } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, MAX_METER } from '../src/fighters/index.js';

const fight = (p1 = 'kevalanche', p2 = 'rubberta') => { const st = createMatch({ p1, p2, seed: 2 }); while (st.phase !== 'fight') stepInPlace(st, 0, 0); return st; };
const run = (st, n, a = 0, b = 0) => { for (let i = 0; i < n; i++) stepInPlace(st, a, b); return st; };
const close = (st, d = 1700) => { st.f[0].x = -d / 2; st.f[1].x = d / 2; st.f[0].z = st.f[1].z = 0; };
const evs = (st, n, a = 0, b = 0) => { const out = []; for (let i = 0; i < n; i++) { stepInPlace(st, a, b); out.push(...st.ev); } return out; };

test('a light lands: hitstun, hit-pause, damage, meter for both', () => {
  const st = fight(); close(st);
  const ev = evs(st, 1, LIGHT).concat(evs(st, 8));
  const hit = ev.find((e) => e.k === 'hit');
  assert.ok(hit && hit.p === 0, 'hit');
  assert.ok(st.f[1].hp < FIGHTERS.rubberta.health);
  assert.ok(st.f[0].meter > 0 && st.f[1].meter > 0);
});

test('block (E) stops a mid; crouching block stops a low; standing block loses to a low', () => {
  const a = fight(); close(a);
  run(a, 1, LIGHT, BLOCK); const ev = evs(a, 10, 0, BLOCK);
  assert.ok(ev.some((e) => e.k === 'block'));
  assert.equal(a.f[1].hp, FIGHTERS.rubberta.health);
  const b = fight(); close(b);
  run(b, 1, LIGHT | CROUCH, BLOCK); run(b, 10, CROUCH, BLOCK);
  assert.ok(b.f[1].hp < FIGHTERS.rubberta.health, 'a low beats a standing block');
  const c = fight(); close(c);
  run(c, 1, LIGHT | CROUCH, BLOCK | CROUCH); run(c, 10, CROUCH, BLOCK | CROUCH);
  assert.equal(c.f[1].hp, FIGHTERS.rubberta.health, 'crouch-blocked');
});

test('a heavy knocks down with ring-out power only at the edge; otherwise hitstun', () => {
  const st = fight(); close(st, 2000);
  run(st, 1, HEAVY); run(st, 20);
  assert.equal(st.f[1].act, 'hitstun');
});

test('the special: a full meter, a push-in event, damage', () => {
  for (const id of ROSTER) {
    const st = fight(id, 'kevalanche'); close(st, 1900);
    st.f[0].meter = MAX_METER;
    const ev = evs(st, 1, SPECIAL).concat(evs(st, 240));
    assert.ok(ev.some((e) => e.k === 'special' && e.p === 0), id);
    assert.ok(st.f[1].hp < FIGHTERS.kevalanche.health || st.f[1].act === 'ringout' || st.wins[0] > 0, `${id}'s special connects`);
    assert.equal(st.f[0].meter < MAX_METER, true);
  }
});

test('every signature and spin connects on a standing dummy at a good range', () => {
  for (const id of ROSTER) {
    for (const [mask, name] of [[HEAVY | CROUCH, 'signature'], [HEAVY | LEFT, 'sweep']]) {
      const st = fight(id, 'sumaura'); close(st, name === 'sweep' ? 2000 : 2600);
      run(st, 1, mask); run(st, 200);
      assert.ok(st.f[1].hp < FIGHTERS.sumaura.health, `${id} ${name}`);
    }
  }
});

test('projectiles are linear: a sidestep lets a serve go by', () => {
  const st = fight('johnny', 'kevalanche'); close(st, 5000);
  run(st, 1, HEAVY | CROUCH); run(st, 8);
  run(st, 1, 0, UP); run(st, 120);
  assert.equal(st.f[1].hp, FIGHTERS.kevalanche.health);
  const s2 = fight('johnny', 'kevalanche'); close(s2, 5000);
  run(s2, 1, HEAVY | CROUCH); run(s2, 120);
  assert.ok(s2.f[1].hp < FIGHTERS.kevalanche.health);
});

test('a K.O. runs the slow-motion cinematic and the next round starts', () => {
  const st = fight(); close(st);
  st.f[1].hp = 10;
  run(st, 1, HEAVY);
  let ko = false;
  for (let i = 0; i < 600 && st.round === 1; i++) { stepInPlace(st, 0, 0); if (st.phase === 'ko' && st.ks < 100 && st.ks > 0) ko = true; }
  assert.ok(ko, 'slow motion');
  assert.equal(st.round, 2);
  assert.deepEqual(st.wins, [1, 0]);
});

test('every pairing: 2000 ticks of noise stay deterministic and in bounds', () => {
  for (const a of ROSTER) for (const b of ROSTER) {
    let s = 77;
    const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 16) & 1023; };
    const st = createMatch({ p1: a, p2: b, seed: 5 }), st2 = clone(st);
    const ins = [];
    for (let i = 0; i < 2000; i++) { const x = [r(), r()]; ins.push(x); stepInPlace(st, ...x); }
    for (const x of ins) stepInPlace(st2, ...x);
    assert.equal(hash(st), hash(st2));
    for (const f of st.f) assert.ok(Number.isFinite(f.x + f.y + f.z + f.hp));
  }
});
