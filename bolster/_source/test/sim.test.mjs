import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, step, clone, hash, run, OUTRO, ROUND_TICKS } from '../src/sim/sim.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL } from '../src/sim/input.js';
import { makeRng } from '../src/sim/rng.js';
import { FIGHTERS, ROSTER, MAX_METER } from '../src/fighters/index.js';

/* a fight already under way, fighters placed */
function fight(p1, p2, { x1 = -900, x2 = 900, seed = 3 } = {}) {
  const st = createMatch({ p1, p2, seed });
  st.phase = 'fight'; st.pt = 0;
  st.f[0].x = x1; st.f[1].x = x2;
  return st;
}

/* step with inputs given per tick by a function (or a constant pair) */
function go(st, n, inp = () => [0, 0]) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = typeof inp === 'function' ? inp(i) : inp;
    stepInPlace(st, a, b);
    evs.push(...st.ev);
  }
  return evs;
}

/* press a button on tick 0 (held one tick), hold `hold` the whole time */
const press = (btn, holdA = 0, holdB = 0) => (i) => [(i === 0 ? btn : 0) | holdA, holdB];

const randomInputs = (seed, every = 5) => {
  const r = makeRng(seed);
  let cur = [0, 0];
  return (st, i) => { if (i % every === 0) cur = [r.int(128), r.int(128)]; return cur; };
};

test('determinism: the same inputs give the same states, run twice', () => {
  for (const [a, b] of [['kevalanche', 'kevalanche'], ['rubberta', 'k8e'], ['johnny', 'sumaura']]) {
    const hashes = [[], []];
    for (let r = 0; r < 2; r++) {
      const st = createMatch({ p1: a, p2: b, seed: 1234 });
      const inp = randomInputs(77);
      for (let i = 0; i < 4000; i++) { stepInPlace(st, ...inp(st, i)); if (i % 50 === 0) hashes[r].push(hash(st)); }
      hashes[r].push(hash(st));
    }
    assert.deepEqual(hashes[0], hashes[1]);
  }
});

test('the sim never uses floats for positions or STUFFING', () => {
  const st = createMatch({ p1: 'sumaura', p2: 'rubberta', seed: 9 });
  const inp = randomInputs(5);
  for (let i = 0; i < 6000; i++) {
    stepInPlace(st, ...inp(st, i));
    for (const f of st.f) for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'meter', 'pv']) assert.ok(Number.isInteger(f[k]), `${k}=${f[k]}`);
    for (const p of st.proj) for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isInteger(p[k]));
    if (st.phase === 'end') break;
  }
});

test('a jab lands: STUFFING down, both meters up (the attacker more), hit-pause', () => {
  const st = fight('kevalanche', 'kevalanche', { x1: -900, x2: 900 });
  const hp = st.f[1].hp;
  const evs = go(st, 12, press(LIGHT));
  assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0));
  assert.ok(st.f[1].hp < hp);
  assert.ok(st.f[0].meter > 0 && st.f[1].meter > 0 && st.f[0].meter > st.f[1].meter);
});

test('blocking: standing stops high and mid, crouching stops low and mid', () => {
  // P2 faces left, so holding RIGHT is holding back
  const cases = [
    { move: LIGHT, hold: RIGHT, blocked: true, what: 'mid vs standing block' },
    { move: LIGHT, hold: RIGHT | DOWN, blocked: true, what: 'mid vs crouch block' },
    { move: LIGHT | 0, holdA: DOWN, hold: RIGHT, blocked: false, what: 'low vs standing block' },
    { move: LIGHT, holdA: DOWN, hold: RIGHT | DOWN, blocked: true, what: 'low vs crouch block' },
    { move: LIGHT, hold: 0, blocked: false, what: 'mid vs no block' },
  ];
  for (const c of cases) {
    const st = fight('kevalanche', 'kevalanche', { x1: -900, x2: 900 });
    go(st, 3, [c.holdA || 0, c.hold]);       // settle into the stance
    const hp = st.f[1].hp;
    const evs = go(st, 14, (i) => [(i === 0 ? c.move : 0) | (c.holdA || 0), c.hold]);
    const blocked = evs.some((e) => e.k === 'block');
    const hit = evs.some((e) => e.k === 'hit');
    assert.equal(blocked, c.blocked, c.what);
    assert.equal(hit, !c.blocked, c.what);
    if (c.blocked) assert.equal(st.f[1].hp, hp, `${c.what}: no chip from a normal`);
  }
  // a jumping attack is high: it beats a crouch block, a standing block stops it
  for (const [hold, blocked] of [[RIGHT | DOWN, false], [RIGHT, true]]) {
    // against the right wall, so holding back can't walk him out of reach
    const st = fight('kevalanche', 'kevalanche', { x1: 6100, x2: 9400 });
    let evs = [];
    evs = go(st, 70, (i) => [i === 0 ? UP | RIGHT : i === 20 ? HEAVY : 0, hold]);
    assert.ok(evs.some((e) => e.k === (blocked ? 'block' : 'hit') && e.p === 0), `air attack vs ${blocked ? 'standing' : 'crouching'} block`);
  }
});

test('the special needs a full meter, and uses all of it', () => {
  const st = fight('kevalanche', 'kevalanche');
  let evs = go(st, 4, press(SPECIAL));
  assert.ok(!evs.some((e) => e.k === 'special'));
  st.f[0].meter = MAX_METER - 1;
  evs = go(st, 4, press(SPECIAL));
  assert.ok(!evs.some((e) => e.k === 'special'));
  st.f[0].meter = MAX_METER;
  evs = go(st, 4, press(SPECIAL));
  assert.ok(evs.some((e) => e.k === 'special' && e.p === 0));
  assert.equal(st.f[0].meter, 0);
});

test('five presses on an empty meter: the impatient-special event', () => {
  const st = fight('sumaura', 'rubberta');
  const evs = go(st, 20, (i) => [i % 2 === 0 && i < 10 ? SPECIAL : 0, 0]);
  assert.equal(evs.filter((e) => e.k === 'impatient' && e.p === 0).length, 1);
});

test('a K.O. ends the round, and a perfect one is a Fluffless Victory', () => {
  const st = fight('kevalanche', 'johnny');
  st.f[1].hp = 1;
  const evs = go(st, 14, press(LIGHT));
  const ko = evs.find((e) => e.k === 'ko');
  assert.ok(ko);
  assert.equal(st.phase, 'ko');
  assert.deepEqual(st.wins, [1, 0]);
  assert.equal(st.perfect, 1, 'winner took no damage');
  go(st, OUTRO + 2);
  assert.equal(st.phase, 'intro');
  assert.equal(st.round, 2);
  assert.equal(st.f[1].hp, FIGHTERS.johnny.health);

  const st2 = fight('kevalanche', 'johnny');
  st2.f[0].hp -= 50; st2.f[0].taken = 50;
  st2.f[1].hp = 1;
  go(st2, 14, press(LIGHT));
  assert.equal(st2.phase, 'ko');
  assert.equal(st2.perfect, 0, 'not perfect after taking damage');
});

test('time runs out: more STUFFING (as a share) wins', () => {
  const st = fight('rubberta', 'k8e');
  st.timer = 3;
  st.f[0].hp = 500; st.f[1].hp = 600;
  go(st, 5);
  assert.equal(st.phase, 'time');
  assert.equal(st.rw, 1);
  assert.equal(st.f[0].act, 'lose');
  assert.equal(ROUND_TICKS, 99 * 60);
});

test('best of three: two round wins take the match', () => {
  const st = fight('johnny', 'sumaura');
  for (let r = 0; r < 2; r++) {
    st.phase = 'fight'; st.pt = 0;
    st.f[0].x = -900; st.f[1].x = 900;
    st.f[1].hp = 1;
    go(st, 14, press(LIGHT));
    assert.equal(st.wins[0], r + 1);
    go(st, OUTRO + 1);
  }
  assert.equal(st.phase, 'end');
  assert.equal(st.winner, 0);
});

/* where each fighter has to stand for his signature / special to reach */
const RANGE = { kevalanche: [1400, 1800], rubberta: [2200, 2000], johnny: [4000, 4000], sumaura: [3500, 1500], k8e: [4000, 5000] };

test('every signature connects and deals damage', () => {
  for (const id of ROSTER) {
    const [d] = RANGE[id];
    const st = fight(id, 'kevalanche', { x1: -d / 2, x2: d / 2 });
    const hp = st.f[1].hp;
    // the uppercut is anti-air: catch a jumper
    const victim = id === 'kevalanche' ? (i) => (i === 0 ? UP : 0) : () => 0;
    const at = id === 'kevalanche' ? 14 : 0;
    const evs = go(st, 120, (i) => [i >= at && i <= at + 1 ? DOWN | (i === at + 1 ? HEAVY : 0) : 0, victim(i)]);
    assert.ok(evs.some((e) => e.k === 'signature' && e.p === 0), `${id}: signature started`);
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0), `${id}: signature hit`);
    assert.ok(st.f[1].hp < hp, `${id}: signature dealt damage`);
  }
});

test('every special connects and deals heavy damage', () => {
  for (const id of ROSTER) {
    const [, d] = RANGE[id];
    const st = fight(id, 'sumaura', { x1: -d / 2, x2: d / 2 });
    st.f[0].meter = MAX_METER;
    const hp = st.f[1].hp;
    const evs = go(st, 160, press(SPECIAL));
    assert.ok(evs.some((e) => e.k === 'special' && e.p === 0), `${id}: special started`);
    const dealt = hp - st.f[1].hp;
    assert.ok(dealt >= 150, `${id}: special dealt ${dealt}`);
    assert.equal(st.f[0].meter < 200, true);
  }
});

test('Abraço is unblockable up close', () => {
  const st = fight('rubberta', 'kevalanche', { x1: -1000, x2: 1000 });
  st.f[0].meter = MAX_METER;
  const hp = st.f[1].hp;
  const evs = go(st, 120, (i) => [i === 0 ? SPECIAL : 0, RIGHT]);
  assert.ok(evs.some((e) => e.k === 'grab'));
  assert.ok(!evs.some((e) => e.k === 'block'));
  assert.ok(st.f[1].hp < hp - 150);
});

test('the catchphrase pick is the match PRNG: same seed, same line; about 4 to 1', () => {
  const pick = (seed) => {
    const st = createMatch({ p1: 'kevalanche', p2: 'k8e', seed });
    st.phase = 'ko'; st.pt = OUTRO - 1; st.wins = [2, 0]; st.rw = 0;
    stepInPlace(st, 0, 0);
    assert.equal(st.phase, 'end');
    return st.egg;
  };
  let eggs = 0;
  const N = 3000;
  for (let s = 1; s <= N; s++) {
    const e = pick(s);
    assert.equal(pick(s), e);
    eggs += e;
  }
  const share = eggs / N;
  assert.ok(share > 0.16 && share < 0.24, `egg share ${share}`);
});

test('Fluffatality: only on a match-ending special K.O., about 1 in 10, from the PRNG', () => {
  let fl = 0;
  const N = 1500;
  for (let s = 1; s <= N; s++) {
    const st = fight('johnny', 'kevalanche', { x1: -2000, x2: 2000, seed: s });
    st.wins = [1, 0];
    st.f[0].meter = MAX_METER; st.f[1].hp = 1;
    go(st, 40, press(SPECIAL));
    assert.equal(st.phase, 'ko');
    assert.equal(st.ko, 'special');
    fl += st.fluff;
  }
  assert.ok(fl / N > 0.06 && fl / N < 0.14, `fluff share ${fl / N}`);
  // a normal K.O. never
  const st = fight('johnny', 'kevalanche', { seed: 1 });
  st.wins = [1, 0]; st.f[1].hp = 1;
  go(st, 14, press(LIGHT));
  assert.equal(st.fluff, 0);
});

test('rollback readiness: clone at tick N, resimulate the same inputs, same hash', () => {
  const st = createMatch({ p1: 'rubberta', p2: 'johnny', seed: 42 });
  const r = makeRng(3);
  const log = [];
  for (let i = 0; i < 1200; i++) { log.push([r.int(128), r.int(128)]); }
  for (let i = 0; i < 600; i++) stepInPlace(st, ...log[i]);
  const snap = clone(st);
  const h0 = hash(snap);
  for (let i = 600; i < 1200; i++) stepInPlace(st, ...log[i]);
  const hA = hash(st);
  assert.equal(hash(snap), h0, 'snapshot untouched by the live sim');
  let re = snap;
  for (let i = 600; i < 1200; i++) re = step(re, ...log[i]);
  assert.equal(hash(re), hA);
  // and a snapshot survives a JSON round trip (what a peer would send)
  const wire = JSON.parse(JSON.stringify(snap));
  assert.equal(hash(wire), h0);
});

test('random play always finishes a match', () => {
  for (const a of ROSTER) {
    const st = createMatch({ p1: a, p2: ROSTER[(ROSTER.indexOf(a) + 2) % 5], seed: 11 });
    run(st, randomInputs(ROSTER.indexOf(a) + 1));
    assert.equal(st.phase, 'end');
    assert.ok(st.winner >= 0);
  }
});

/* ── jumps: a leap that clears everyone but the giraffe ─────────────────── */
import { hurtBox, SQUAT } from '../src/sim/sim.js';
const ovl = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/* jump forward from `dx` apart at a fighter standing still: did he get over
   (never touching its standing hurt box) and land on the far side? */
function leap(a, b, dx) {
  const st = fight(a, b, { x1: -dx / 2, x2: dx / 2 });
  let touched = false, air = 0, squat = 0;
  for (let i = 0; i < 90; i++) {
    stepInPlace(st, i === 0 ? UP | RIGHT : 0, 0);
    if (st.f[0].act === 'jumpsquat') squat++;
    if (st.f[0].air) air++;
    if (ovl(hurtBox(st.f[0]), hurtBox(st.f[1]))) touched = true;
  }
  return { cleared: !touched && st.f[0].x > st.f[1].x, air, squat, st };
}

test('jumps: a forward leap clears the standing hurt box of every fighter but K8-E', () => {
  for (const a of ROSTER) for (const b of ROSTER) {
    const ok = [];
    for (let dx = 1000; dx <= 5000; dx += 100) if (leap(a, b, dx).cleared) ok.push(dx);
    if (b === 'k8e') assert.equal(ok.length, 0, `${a} should not get over the giraffe`);
    else assert.ok(ok.length >= 8, `${a} over ${b}: a window of at least 800 to leap from (got ${ok.length})`);
  }
});

test('jumps: a short crouch first, then 40–52 ticks in the air, high and fast off the floor', () => {
  for (const id of ROSTER) {
    const r = leap(id, 'k8e', 9000);
    assert.ok(r.squat >= 2 && r.squat <= SQUAT + 1, `${id} squat ${r.squat}`);
    assert.ok(r.air >= 40 && r.air <= 52, `${id} airtime ${r.air}`);
    // the first quarter of the rise covers well over a third of the height
    const st = fight(id, 'k8e', { x1: -4000, x2: 4000 });
    const ys = [];
    for (let i = 0; i < 60; i++) { stepInPlace(st, i === 0 ? UP : 0, 0); ys.push(st.f[0].y); }
    const top = Math.max(...ys), up = ys.findIndex((y) => y > 0), apex = ys.indexOf(top);
    assert.ok(top > 3800, `${id} apex ${top}`);
    assert.ok(ys[up + Math.round((apex - up) / 4)] > top * 0.4, `${id}: a snappy take-off`);
    // and it falls faster than it rose
    const down = ys.findIndex((y, i) => i > apex && y <= 0);
    assert.ok(down - apex < apex - up + 4, `${id}: fall ${down - apex} vs rise ${apex - up}`);
  }
});

test('jumps: crossing over switches sides — both re-face, and blocking follows the new facing', () => {
  const r = leap('johnny', 'kevalanche', 3000), st = r.st;
  assert.ok(r.cleared);
  assert.equal(st.f[0].face, -1, 'the jumper turns round on landing');
  assert.equal(st.f[1].face, 1, 'the one jumped over turns round');
  // the one jumped over now faces right: he blocks by holding LEFT (away from him)
  go(st, 20);
  const hp = st.f[1].hp;
  st.f[0].x = st.f[1].x + 1400;
  const evs = go(st, 20, (i) => [i === 0 ? LIGHT : 0, LEFT]);
  assert.ok(evs.some((e) => e.k === 'block'), 'blocked holding away from the new side');
  assert.equal(st.f[1].hp, hp);
});

test('jumps: landing on top of someone resolves the push boxes cleanly', () => {
  for (const [a, b] of [['kevalanche', 'sumaura'], ['rubberta', 'johnny'], ['sumaura', 'rubberta']]) {
    for (let dx = 800; dx <= 4000; dx += 200) {
      const st = fight(a, b, { x1: -dx / 2, x2: dx / 2 });
      go(st, 70, (i) => [i === 0 ? UP | RIGHT : 0, 0]);
      const need = (FIGHTERS[a].push.w + FIGHTERS[b].push.w) >> 1;
      assert.ok(Math.abs(st.f[1].x - st.f[0].x) >= need - 1, `${a} on ${b} from ${dx}: still overlapping`);
      assert.equal(st.f[0].y, 0);
    }
  }
});

/* ── the dive slam (S+P in the air) ─────────────────────────────────────── */
function dive(a, b, hold, { dx = 2600 } = {}) {
  // against the right wall, so holding back can't walk out of it
  const st = fight(a, b, { x1: 9400 - dx, x2: 9400 });
  const evs = go(st, 90, (i) => [i === 0 ? UP | RIGHT : i === 14 ? DOWN | HEAVY : i === 15 ? DOWN : 0, hold]);
  return { st, evs };
}

test('dive slam: every fighter has one; an overhead — a crouch block doesn\'t stop it, a standing block does', () => {
  for (const id of ROSTER) {
    const d = dive(id, 'kevalanche', RIGHT | DOWN);
    assert.ok(d.evs.some((e) => e.k === 'slam' && e.p === 0), `${id}: slams down`);
    assert.ok(d.evs.some((e) => e.k === 'hit' && e.p === 0), `${id}: beats the crouch block`);
    const s = dive(id, 'kevalanche', RIGHT);
    assert.ok(s.evs.some((e) => e.k === 'block'), `${id}: a standing block stops it`);
    assert.ok(!s.evs.some((e) => e.k === 'hit'), `${id}: no hit through a standing block`);
  }
});

test('dive slam: a whiff is punishable — the landing lag outlasts a light attack\'s startup', () => {
  for (const id of ROSTER) {
    const st = fight(id, 'kevalanche', { x1: -8000, x2: 8000 });
    go(st, 80, (i) => [i === 0 ? UP : i === 14 ? DOWN | HEAVY : i === 15 ? DOWN : 0, 0]);
    assert.equal(st.f[0].mv, '', 'settled');
    // again, timing the landing
    const s2 = fight(id, 'kevalanche', { x1: -1200, x2: 8000 });
    let landed = -1, free = -1;
    for (let i = 0; i < 120; i++) {
      stepInPlace(s2, i === 0 ? UP : i === 14 ? DOWN | HEAVY : i === 15 ? DOWN : 0, 0);
      if (landed < 0 && s2.f[0].mv === 'diveLand') landed = i;
      if (landed >= 0 && free < 0 && s2.f[0].act === 'idle') free = i;
    }
    assert.ok(landed > 0 && free - landed >= 24, `${id}: landing lag ${free - landed}`);
    // and someone stood next to the landing spot gets a light in for free
    const s3 = fight(id, 'kevalanche', { x1: -1200, x2: 8000 });
    let evs = [];
    for (let i = 0; i < 120; i++) {
      // walks up once the shockwave's gone, and jabs
      if (i === landed + 4) s3.f[1].x = s3.f[0].x + 1500;
      stepInPlace(s3, i === 0 ? UP : i === 14 ? DOWN | HEAVY : i === 15 ? DOWN : 0, i === landed + 5 ? LIGHT : 0);
      evs.push(...s3.ev);
    }
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 1), `${id}: punished`);
  }
});
