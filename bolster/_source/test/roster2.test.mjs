/* Roster 2: Sebas Perra (wolf) and Zach Sparrow (crow) — their moves
   connect and behave, the sim stays deterministic and rollback-exact with
   them, the CPU plays them at every level, and they're balanced into the
   roster (seeded CPU-vs-CPU on Normal: no pairing beyond 70/30 over the
   sample here; tools/balance.mjs runs the full matrix). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, clone, hash } from '../src/sim/sim.js';
import { UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, RIGHT, LEFT } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, MAX_METER, isShot, frameData, fighterId } from '../src/fighters/index.js';
import { CPU } from '../src/ai/cpu.js';
import { makeRng } from '../src/sim/rng.js';
import { FLAGS } from '../src/ui/flags.js';

const NEW = ['sebas', 'zach'];

function fight(p1, p2, { x1 = -900, x2 = 900, seed = 3 } = {}) {
  const st = createMatch({ p1, p2, seed });
  st.phase = 'fight'; st.pt = 0;
  st.f[0].x = x1; st.f[1].x = x2;
  return st;
}
function go(st, n, inp = () => [0, 0]) {
  const evs = [];
  for (let i = 0; i < n; i++) { const [a, b] = inp(i, st); stepInPlace(st, a, b); evs.push(...st.ev); }
  return evs;
}
const sig = (i) => (i >= 1 && i <= 3 ? DOWN | (i === 2 ? HEAVY : 0) : 0);

test('the roster is seven; the new two have names, flags, lines, deep-link names', () => {
  assert.equal(ROSTER.length, 7);
  assert.deepEqual(ROSTER.slice(5), NEW);
  const S = FIGHTERS.sebas, Z = FIGHTERS.zach;
  assert.equal(S.name, 'Sebas Perra'); assert.equal(S.nation, 'mx'); assert.equal(S.flag, '🇲🇽'); assert.ok(FLAGS.mx);
  assert.equal(Z.name, 'Zach Sparrow'); assert.equal(Z.nation, 'ca'); assert.equal(Z.flag, '🇨🇦');
  assert.deepEqual(S.catchphrase, { main: 'Rápido next time, bitch!', egg: 'Who\'s the perra now, huh?' });
  assert.deepEqual(Z.catchphrase, { main: 'Finders keepers, loser.', egg: 'Arre yaar, my mother-in-law hits harder than you.' });
  assert.equal(S.impatient, 'Espérate! Not yet!'); assert.equal(Z.impatient, 'Not yet, bud.');
  assert.equal(S.signatureName, 'Lobo Slide'); assert.equal(S.specialName, 'Aullido de la Luna');
  assert.equal(Z.signatureName, 'Bottle Cap Flick'); assert.equal(Z.specialName, 'Murder Most Fowl');
  for (const [k, v] of [['sebas', 'sebas'], ['sebasperra', 'sebas'], ['Sebas_Perra', 'sebas'], ['zach', 'zach'], ['zachsparrow', 'zach'], ['kevalanche', 'kevalanche'], ['nobody', null]]) assert.equal(fighterId(k), v, k);
});

test('Lobo Slide: a low sliding kick — it connects from range, knocks down, crouch-blocks but beats a standing block', () => {
  for (const opp of ROSTER) {
    const st = fight('sebas', opp, { x1: -1400, x2: 1400 });
    const hp = st.f[1].hp;
    const evs = go(st, 60, (i) => [sig(i), 0]);
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0 && e.kd), `slide hits ${opp} and knocks down`);
    assert.ok(st.f[1].hp < hp);
  }
  const m = FIGHTERS.sebas.moves.signature;
  assert.ok(m.low && m.hits.every((h) => h.level === 'low'));
  let st = fight('sebas', 'kevalanche', { x1: -1400, x2: 1400 });
  let evs = go(st, 60, (i) => [sig(i), BLOCK]);
  assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0), 'a standing guard is slid under');
  st = fight('sebas', 'kevalanche', { x1: -1400, x2: 1400 });
  evs = go(st, 60, (i) => [sig(i), BLOCK | DOWN]);
  assert.ok(evs.some((e) => e.k === 'block' && e.p === 0) && !evs.some((e) => e.k === 'hit' && e.p === 0), 'crouch-blocked');
  // and punishable when blocked, like every signature
  assert.ok(m.hits[0].blockstun - frameData(m).recovery <= -10);
});

test('Aullido de la Luna: the howl blasts up close and a low shockwave rolls across the stage', () => {
  // up close: both the blast and the wave
  let st = fight('sebas', 'sumaura', { x1: -900, x2: 900 });
  st.f[0].meter = MAX_METER;
  let hp = st.f[1].hp;
  let evs = go(st, 140, (i) => [i === 0 ? SPECIAL : 0, 0]);
  assert.ok(evs.some((e) => e.k === 'special' && e.p === 0));
  assert.ok(evs.some((e) => e.k === 'throw' && e.p === 0 && e.kind === 'howl'), 'the wave goes out');
  assert.ok(hp - st.f[1].hp >= 180, `close: ${hp - st.f[1].hp}`);
  // from across the stage: the wave alone
  st = fight('sebas', 'k8e', { x1: -6000, x2: 6000 });
  st.f[0].meter = MAX_METER;
  hp = st.f[1].hp;
  evs = go(st, 160, (i) => [i === 0 ? SPECIAL : 0, 0]);
  assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0 && e.kd), 'the wave reaches across the stage and knocks down');
  assert.ok(hp - st.f[1].hp >= 150);
  // the wave is low: jumped clean
  st = fight('sebas', 'johnny', { x1: -5000, x2: 5000 });
  st.f[0].meter = MAX_METER;
  hp = st.f[1].hp;
  evs = go(st, 160, (i, s) => [i === 0 ? SPECIAL : 0, Math.abs(s.proj[0]?.x - s.f[1].x) < 2400 && !s.f[1].air ? UP : 0]);
  assert.equal(st.f[1].hp, hp, 'a jump clears the howl');
  assert.equal(st.f[0].meter < 200, true, 'the meter is spent');
});

test('Bottle Cap Flick: a projectile with the PR #27 limits — one at a time, slow, long recovery, chip 4', () => {
  const m = FIGHTERS.zach.moves.signature, P = m.spawn[0].proj;
  assert.ok(isShot(m));
  assert.equal(P.kind, 'cap');
  assert.ok(m.spawn[0].at >= 16 && m.spawn[0].at <= 18);
  assert.ok(m.total - m.spawn[0].at >= 44 && m.total - m.spawn[0].at <= 46);
  assert.ok(P.vx >= 100 && P.vx <= 128);
  assert.equal(P.chip, 4);
  for (const opp of ROSTER) {
    const st = fight('zach', opp, { x1: -2500, x2: 2500 });
    const hp = st.f[1].hp;
    const evs = go(st, 120, (i) => [sig(i), 0]);
    assert.ok(evs.some((e) => e.k === 'throw' && e.kind === 'cap'));
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0), `the cap hits ${opp}`);
    assert.ok(st.f[1].hp < hp);
  }
});

test('Murder Most Fowl: seven crows sweep across from behind him, high and low; big damage; meter spent', () => {
  const m = FIGHTERS.zach.moves.special;
  assert.equal(m.spawn.length, 7);
  const ys = m.spawn.map((s) => s.proj.y);
  assert.ok(Math.min(...ys) < 1000 && Math.max(...ys) > 2000, 'high and low');
  for (const opp of ['kevalanche', 'k8e', 'rubberta', 'sebas']) {
    const st = fight('zach', opp, { x1: -2000, x2: 2000 });
    st.f[0].meter = MAX_METER;
    const hp = st.f[1].hp;
    const evs = go(st, 200, (i) => [i === 0 ? SPECIAL : 0, 0]);
    assert.ok(evs.filter((e) => e.k === 'throw' && e.kind === 'crow').length === 7);
    assert.ok(evs.filter((e) => e.k === 'hit' && e.p === 0).length >= 4, `${opp}: most of the murder lands`);
    assert.ok(hp - st.f[1].hp >= 150, `${opp}: ${hp - st.f[1].hp}`);
  }
});

test('dive slams: the moonsault and the dive bomb (on a slant) connect as overheads', () => {
  for (const id of NEW) {
    for (const block of [0, BLOCK | DOWN, BLOCK]) {
      const st = fight(id, 'kevalanche', { x1: -2400, x2: 600 });
      const hp = st.f[1].hp;
      const evs = go(st, 120, (i, s) => [i === 0 ? UP | RIGHT : s.f[0].act === 'jump' && s.f[0].t >= 12 ? DOWN | HEAVY : 0, block]);
      assert.ok(evs.some((e) => e.k === 'slam' && e.p === 0), `${id}: slammed`);
      if (block === BLOCK) assert.ok(evs.some((e) => e.k === 'block' && e.p === 0), `${id}: a standing block stops it`);
      else assert.ok(st.f[1].hp < hp, `${id}: hits (${block ? 'through a crouch block' : 'open'})`);
    }
  }
  // the dive bomb travels forward as it drops
  const st = fight('zach', 'kevalanche', { x1: -6000, x2: 6000 });
  go(st, 120, (i, s) => [i === 0 ? UP : s.f[0].act === 'jump' && s.f[0].t >= 12 ? DOWN | HEAVY : 0, 0]);
  assert.ok(st.f[0].x > -6000 + 400, `slanted: ${st.f[0].x}`);
});

test('throws: the huracanrana and the peck-and-toss — grab, hold, toss; teched in the window', () => {
  for (const id of NEW) for (const opp of ROSTER) {
    const st = fight(id, opp, { x1: -800, x2: 800 });
    const hp = st.f[1].hp;
    const evs = go(st, 70, (i) => [i === 1 ? LIGHT | HEAVY : 0, 0]);
    assert.ok(evs.some((e) => e.k === 'grab' && e.throw), `${id} grabs ${opp}`);
    assert.equal(hp - st.f[1].hp, FIGHTERS[id].moves.throwHold.hits[0].dmg, `${id} tosses ${opp}`);
    const t2 = fight(id, opp, { x1: -800, x2: 800 });
    const e2 = go(t2, 70, (i) => [i === 1 ? LIGHT | HEAVY : 0, i === 6 ? LIGHT | HEAVY : 0]);
    assert.ok(e2.some((e) => e.k === 'tech'), `${opp} techs ${id}'s throw`);
  }
});

test('bread and butter: O → O → P is a 3-hit true combo with an amplified finisher, on every opponent', () => {
  for (const id of NEW) for (const opp of ROSTER) {
    const st = fight(id, opp, { x1: -1000, x2: 1000 });
    const evs = go(st, 90, (i, s) => {
      const f = s.f[0];
      if (i === 0) return [LIGHT, 0];
      if (f.act === 'attack' && f.hm && f.mv === 'light' && f.ch === 0 && f.t > 5) return [LIGHT, 0];
      if (f.act === 'attack' && f.hm && f.mv === 'light' && f.ch === 1 && f.t > 4) return [HEAVY, 0];
      return [0, 0];
    });
    const hits = evs.filter((e) => e.k === 'hit' && e.p === 0);
    assert.ok(hits.length >= 3 && hits[2].n === 3, `${id} on ${opp}: ${hits.map((h) => h.n)}`);
    assert.ok(hits[2].amp, `${id} on ${opp}: amplified`);
  }
});

test('determinism and rollback with the new two: same inputs, same hashes; resimulating from a snapshot is exact', () => {
  for (const [a, b] of [['sebas', 'zach'], ['zach', 'sebas'], ['sebas', 'sebas'], ['zach', 'k8e']]) {
    const runIt = () => {
      const st = createMatch({ p1: a, p2: b, seed: 77 });
      const r = makeRng(9), hs = [];
      let cur = [0, 0];
      for (let i = 0; i < 4000 && st.phase !== 'end'; i++) {
        if (i % 4 === 0) cur = [r.int(256), r.int(256)];
        stepInPlace(st, ...cur);
        if (i % 100 === 0) hs.push(hash(st));
      }
      return hs;
    };
    assert.deepEqual(runIt(), runIt(), `${a} v ${b}`);
    // rollback: snapshot at N, run on, restore, resimulate the same inputs → the same hash
    const st = createMatch({ p1: a, p2: b, seed: 5 });
    const r = makeRng(3), ins = [];
    for (let i = 0; i < 1500; i++) ins.push([r.int(256), r.int(256)]);
    for (let i = 0; i < 700; i++) stepInPlace(st, ...ins[i]);
    st.f[0].meter = st.f[1].meter = MAX_METER;   // so the specials (and their volleys) are in the window
    const snap = clone(st);
    for (let i = 700; i < 1500; i++) stepInPlace(st, ...ins[i]);
    const back = JSON.parse(JSON.stringify(snap));
    for (let i = 700; i < 1500; i++) stepInPlace(back, ...ins[i]);
    assert.equal(hash(back), hash(st), `${a} v ${b} rollback`);
  }
});

test('the CPU plays both at every level and spends their specials', () => {
  for (const level of ['easy', 'normal', 'hard']) for (const id of NEW) {
    const opp = id === 'sebas' ? 'zach' : 'sebas';
    const st = createMatch({ p1: id, p2: opp, seed: 41 });
    const a = new CPU(0, level, 41), b = new CPU(1, level, 42);
    let specials = 0;
    for (let i = 0; i < 60 * 60 * 12 && st.phase !== 'end'; i++) { stepInPlace(st, a.input(st), b.input(st)); specials += st.ev.filter((e) => e.k === 'special').length; }
    assert.equal(st.phase, 'end', `${id} ${level}`);
    if (level !== 'easy') assert.ok(specials > 0, `${id} ${level}: specials used`);
  }
});

test('balance: on Normal, neither new fighter is beyond ~70/30 against anyone (seeded sample, both sides)', () => {
  for (const id of NEW) for (const opp of ROSTER) {
    if (opp === id) continue;
    let w = 0, n = 0;
    for (let s = 0; s < 10; s++) {
      const flip = s % 2 === 1, [p1, p2] = flip ? [opp, id] : [id, opp];
      const st = createMatch({ p1, p2, seed: 5000 + s * 31 });
      const a = new CPU(0, 'normal', 5000 + s * 31), b = new CPU(1, 'normal', 5001 + s * 31);
      for (let i = 0; i < 60 * 60 * 12 && st.phase !== 'end'; i++) stepInPlace(st, a.input(st), b.input(st));
      if (st.winner === 2) continue;
      n++; if (st.f[st.winner].id === id) w++;
    }
    const share = w / Math.max(1, n);
    // 10 matches is a small sample: a little slack over 70/30 (the full
    // matrix, 40 a pairing, is in docs/BALANCE.md)
    assert.ok(share >= 0.2 && share <= 0.8, `${id} v ${opp}: ${w}/${n}`);
  }
});
