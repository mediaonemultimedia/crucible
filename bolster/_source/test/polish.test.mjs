import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, TAP } from '../src/sim/sim.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, BLOCK } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, reachOf, frameData, isShot } from '../src/fighters/index.js';
import { CPU } from '../src/ai/cpu.js';

function fight(p1, p2, { x1 = -900, x2 = 900, seed = 3 } = {}) {
  const st = createMatch({ p1, p2, seed });
  st.phase = 'fight'; st.pt = 0;
  st.f[0].x = x1; st.f[1].x = x2;
  return st;
}
function go(st, n, inp = () => [0, 0]) {
  const evs = [];
  for (let i = 0; i < n; i++) { const [a, b] = inp(i, st); stepInPlace(st, a, b); evs.push(...st.ev.map((e) => ({ ...e, i }))); }
  return evs;
}

/* ── projectiles ──────────────────────────────────────────────────────── */

test('one shot on screen: no second throw while the first is out', () => {
  for (const id of ['k8e', 'johnny']) {
    // far apart, the other side walking away: the first shot is a long time gone
    const st = fight(id, 'sumaura', { x1: -5500, x2: 5500 });
    let evs = go(st, 3, (i) => [i === 1 ? DOWN : i === 2 ? DOWN | HEAVY : 0, 0]);
    evs.push(...go(st, 30, () => [0, 0]));
    assert.equal(evs.filter((e) => e.k === 'throw' && e.p === 0).length, 1, `${id}: the first throw`);
    assert.equal(st.proj.length, 1, `${id}: it is still out`);
    // mash S+P while it's out: nothing is thrown, no signature starts
    evs = go(st, 30, (i) => [i % 4 === 0 ? DOWN | HEAVY : DOWN, 0]);
    assert.equal(st.proj.filter((p) => p.o === 0).length, 1, `${id}: still just the one`);
    assert.equal(evs.filter((e) => e.k === 'throw' && e.p === 0).length, 0, `${id}: no second shot while one is out`);
    assert.ok(!evs.some((e) => e.k === 'signature' && e.p === 0), `${id}: no throw started`);
    // once it's gone, he can throw again
    go(st, 400, () => [0, 0]);
    assert.equal(st.proj.length, 0, `${id}: the shot left the screen`);
    evs = go(st, 40, (i) => [i === 1 ? DOWN : i === 2 ? DOWN | HEAVY : 0, 0]);
    assert.equal(evs.filter((e) => e.k === 'throw' && e.p === 0).length, 1, `${id}: throws again once it's gone`);
  }
});

test('at most one of your own shots on screen, every tick of a random match (the volley aside)', () => {
  for (const id of ['k8e', 'johnny']) {
    const st = createMatch({ p1: id, p2: id, seed: 5 });
    const a = new CPU(0, 'hard', 5), b = new CPU(1, 'hard', 6);
    for (let i = 0; i < 60 * 60 * 3 && st.phase !== 'end'; i++) {
      stepInPlace(st, a.input(st), b.input(st));
      for (const k of [0, 1]) assert.ok(st.proj.filter((p) => p.o === k && !p.sp).length <= 1, `${id} side ${k} tick ${st.tick}`);
    }
  }
});

test('projectiles: long startup and recovery, slower, small chip on block only', () => {
  for (const id of ['k8e', 'johnny']) {
    const m = FIGHTERS[id].moves.signature, P = m.spawn[0].proj;
    assert.ok(isShot(m));
    assert.ok(m.spawn[0].at >= 16, `${id} startup ${m.spawn[0].at}`);
    assert.ok(m.total - m.spawn[0].at >= 40, `${id} recovery ${m.total - m.spawn[0].at}`);
    assert.ok(P.vx <= 130, `${id} speed ${P.vx}`);
    assert.ok(P.chip <= 5 && P.chip < P.dmg / 10, `${id} chip ${P.chip}`);
  }
  // blocked: a sliver of chip, no more
  const st = fight('k8e', 'kevalanche', { x1: -2500, x2: 2500 });
  const hp = st.f[1].hp;
  const evs = go(st, 120, (i) => [i === 1 ? DOWN : i === 2 ? DOWN | HEAVY : 0, BLOCK]);
  assert.ok(evs.some((e) => e.k === 'block' && e.p === 0), 'the ring was blocked');
  assert.ok(hp - st.f[1].hp > 0 && hp - st.f[1].hp <= 5, `chip ${hp - st.f[1].hp}`);
});

test('a shot can be jumped over cleanly', () => {
  for (const [thrower, jumper] of [['k8e', 'kevalanche'], ['johnny', 'sumaura'], ['k8e', 'rubberta'], ['johnny', 'k8e']]) {
    const st = fight(thrower, jumper, { x1: -2300, x2: 2300 });
    let jumped = -1;
    const evs = go(st, 140, (i, s) => {
      const p = s.proj[0];
      // jump straight up when the shot is a little way off
      if (jumped < 0 && p && Math.abs(p.x - s.f[1].x) < 2000) { jumped = i; return [0, UP]; }
      return [i === 1 ? DOWN : i === 2 ? DOWN | HEAVY : 0, 0];
    });
    assert.ok(jumped > 0, `${thrower} vs ${jumper}: jumped`);
    assert.ok(!evs.some((e) => (e.k === 'hit' || e.k === 'block') && e.p === 0), `${thrower} vs ${jumper}: cleared it`);
  }
});

/* ── the dash ─────────────────────────────────────────────────────────── */

test('double-tap forward dashes in, double-tap back backdashes; a held walk does not', () => {
  for (const id of ROSTER) {
    // P1 faces right: forward is RIGHT
    let st = fight(id, 'kevalanche', { x1: -4000, x2: 4000 });
    let x0 = st.f[0].x;
    let evs = go(st, 30, (i) => [i === 0 || i === 2 ? RIGHT : 0, 0]);
    assert.ok(evs.some((e) => e.k === 'dash' && e.d === 1 && e.p === 0), `${id}: forward dash`);
    const dashIn = st.f[0].x - x0;
    assert.ok(dashIn > 1500, `${id}: dashed in ${dashIn}`);
    x0 = st.f[0].x;
    evs = go(st, 30, (i) => [i === 0 || i === 2 ? LEFT : 0, 0]);
    assert.ok(evs.some((e) => e.k === 'dash' && e.d === -1), `${id}: backdash`);
    const back = x0 - st.f[0].x;
    assert.ok(back > 700 && back < dashIn, `${id}: backdash ${back} shorter than the dash in ${dashIn}`);
    // walking: hold, stop, hold again (a long first press) is just a walk
    st = fight(id, 'kevalanche', { x1: -4000, x2: 4000 });
    evs = go(st, 40, (i) => [i < TAP + 4 || i > TAP + 6 ? RIGHT : 0, 0]);
    assert.ok(!evs.some((e) => e.k === 'dash'), `${id}: a walk isn't a dash`);
  }
  // facing left (player 2): forward is LEFT
  const st = fight('kevalanche', 'sumaura', { x1: -4000, x2: 4000 });
  const evs = go(st, 20, (i) => [0, i === 0 || i === 2 ? LEFT : 0]);
  assert.ok(evs.some((e) => e.k === 'dash' && e.p === 1 && e.d === 1));
  assert.ok(st.f[1].x < 4000 - 1500);
});

/* ── light vs heavy ───────────────────────────────────────────────────── */

test('light and heavy feel different: startup, reach, damage, recovery', () => {
  for (const id of ROSTER) {
    const M = FIGHTERS[id].moves, L = frameData(M.light), H = frameData(M.heavy);
    assert.ok(L.startup <= 5, `${id} light startup ${L.startup}`);
    assert.ok(H.startup >= 12, `${id} heavy wind-up ${H.startup}`);
    assert.ok(H.recovery >= L.recovery + 10, `${id} heavy recovery ${H.recovery} vs ${L.recovery}`);
    assert.ok(M.heavy.hits[0].dmg >= 2 * M.light.hits[0].dmg, `${id} damage`);
    assert.ok(reachOf(M.heavy) >= reachOf(M.light) + 450, `${id} heavy reach ${reachOf(M.heavy)} vs light ${reachOf(M.light)}`);
    assert.ok(M.heavy.motion.some((mo) => mo.vx > 0), `${id} heavy lunges`);
  }
  // the big ones get the most extra reach out of the heavy
  const gain = (id) => reachOf(FIGHTERS[id].moves.heavy) - reachOf(FIGHTERS[id].moves.light);
  for (const big of ['kevalanche', 'sumaura']) for (const other of ['rubberta', 'johnny', 'k8e']) assert.ok(gain(big) > gain(other), `${big} ${gain(big)} vs ${other} ${gain(other)}`);
});

test('a heavy connects from beyond the jab’s range (the lunge carries it)', () => {
  for (const id of ROSTER) {
    const lr = reachOf(FIGHTERS[id].moves.light), hr = reachOf(FIGHTERS[id].moves.heavy);
    const front = FIGHTERS.johnny.hurt.stand.w / 2;
    const d = Math.round((lr + hr) / 2) + front;
    let st = fight(id, 'johnny', { x1: -d / 2, x2: d / 2 });
    let evs = go(st, 30, (i) => [i === 1 ? LIGHT : 0, 0]);
    assert.ok(!evs.some((e) => e.k === 'hit' && e.p === 0), `${id}: the jab whiffs at ${d}`);
    st = fight(id, 'johnny', { x1: -d / 2, x2: d / 2 });
    evs = go(st, 60, (i) => [i === 1 ? HEAVY : 0, 0]);
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0), `${id}: the heavy lands at ${d}`);
  }
});

test('a whiffed heavy can be punished: the limb is out to be hit', () => {
  const st = fight('kevalanche', 'johnny', { x1: -2400, x2: 2200 });
  // Kevalanche whiffs a heavy from far off; Johnny jabs the outstretched arm
  const evs = go(st, 40, (i, s) => [i === 1 ? HEAVY : 0, s.f[0].act === 'attack' && s.f[0].t === 20 ? LIGHT : 0]);
  assert.ok(evs.some((e) => e.k === 'hit' && e.p === 1), 'the jab caught the arm');
});

/* ── the CPU against a zoner ──────────────────────────────────────────── */

function cpuMatch(p1, p2, l1, l2, seed) {
  const st = createMatch({ p1, p2, seed });
  const a = new CPU(0, l1, seed), b = new CPU(1, l2, seed + 1);
  const ev = [{}, {}];
  let n = 0, closest = 1e9, closeTicks = 0;
  while (st.phase !== 'end' && n < 60 * 60 * 12) {
    stepInPlace(st, a.input(st), b.input(st));
    if (st.phase === 'fight') { const d = Math.abs(st.f[0].x - st.f[1].x); closest = Math.min(closest, d); if (d < 2600) closeTicks++; }
    for (const e of st.ev) if (e.p === 0 || e.p === 1) ev[e.p][e.k] = (ev[e.p][e.k] || 0) + 1;
    n++;
  }
  return { st, n, ev, closeTicks };
}

test('Kevalanche (Normal) gets in on K8-E (Normal) and lands hits', () => {
  let wins = 0, hits = 0, close = 0, ticks = 0;
  const N = 10;
  for (let s = 0; s < N; s++) {
    const { st, ev, closeTicks, n } = cpuMatch('kevalanche', 'k8e', 'normal', 'normal', 700 + s * 13);
    if (st.winner === 0) wins++;
    hits += ev[0].hit || 0; close += closeTicks; ticks += n;
    assert.ok((ev[0].hit || 0) >= 8, `seed ${s}: Kevalanche landed ${ev[0].hit || 0}`);
  }
  assert.ok(close / ticks > 0.25, `in close ${(100 * close / ticks).toFixed(0)}% of the time`);
  assert.ok(wins >= 3 && wins <= 7, `Kevalanche won ${wins} of ${N}`);
});

test('K8-E on Normal throws at a sane rate (and Easy less, Hard more)', () => {
  const rate = {};
  for (const level of ['easy', 'normal', 'hard']) {
    let throws = 0, ticks = 0;
    for (let s = 0; s < 6; s++) {
      for (const opp of ['kevalanche', 'sumaura']) {
        const { ev, n } = cpuMatch(opp, 'k8e', level, level, 900 + s);
        throws += ev[1].signature || 0; ticks += n;
      }
    }
    rate[level] = throws / (ticks / 3600);
  }
  assert.ok(rate.normal < 8, `normal ${rate.normal.toFixed(1)} throws/min`);
  assert.ok(rate.easy < rate.normal && rate.normal < rate.hard, JSON.stringify(rate));
  assert.ok(rate.hard < 20, `hard ${rate.hard.toFixed(1)} throws/min`);
});

test('nationalities: Johnny Deuce is Dutch (and says so when impatient); Kevalanche and K8-E stay Canadian', async () => {
  const { FIGHTERS } = await import('../src/fighters/index.js');
  assert.equal(FIGHTERS.johnny.flag, '🇳🇱');
  assert.equal(FIGHTERS.johnny.nation, 'nl');
  assert.equal(FIGHTERS.johnny.impatient, 'Nog niet!');
  assert.equal(FIGHTERS.johnny.catchphrase.main, 'Game, set, match… sorry \'bout that.');
  assert.equal(FIGHTERS.johnny.catchphrase.egg, 'My mom has a better backhand, and she\'s a house cat.');
  for (const id of ['kevalanche', 'k8e']) assert.equal(FIGHTERS[id].nation, 'ca');
  const { FLAGS } = await import('../src/ui/flags.js').catch(() => ({ FLAGS: null }));
  if (FLAGS) assert.ok(FLAGS.nl.includes('Netherlands'));
});
