import test from 'node:test';
import assert from 'node:assert/strict';
import { ATHLETES, ORDER, buildRig } from '../src/athletes/index.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';
import { det3, mulMat3, mulberry32 } from '../src/math.js';
import { STACK_MAX } from '../src/athletes/giraffe.game.js';

/* a fresh athlete: soft body, idle life and its game, as the page builds it */
function make(name, { stuffing = 0.42, idle = 0.5 } = {}) {
  const rig = buildRig(name);
  const soft = new SoftBody(rig);
  soft.params.stuffing = stuffing;
  const life = new Idle(soft);
  life.amount = idle;
  const game = new ATHLETES[name].Game(soft);
  return { rig, soft, game };
}
const tick = (A, sec, each) => {
  for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
    A.soft.advance(1 / 60, (h) => A.game.update(h));
    each?.();
  }
};
const vol = (g) => Math.abs(det3(mulMat3(g.A, g.AqqInv, new Float64Array(9))));
const restY = (rig) => { let y = 0; for (const i of rig.clouds[0].ix) y += rig.rest[i * 3 + 1]; return y / rig.clouds[0].ix.length; };
// Math.random drives reaction jitter and timing wobble: make runs repeatable
const seeded = (seed, fn) => {
  const r = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = r; }
};

for (const name of ORDER) {
  test(`${name}: stands up on its own — upright, not sinking, not walking off`, () => {
    for (const stuffing of [0, 0.42, 1]) {
      const A = make(name, { stuffing, idle: 0 });
      tick(A, 4);
      const { soft, rig } = A;
      const up = soft.cloudR[0][4];
      assert.ok(up > 0.97, `stuffing ${stuffing}: leaning (up·y ${up.toFixed(3)})`);
      const sank = restY(rig) - soft.cloudC[0][1];
      assert.ok(sank < 0.15, `stuffing ${stuffing}: sank ${sank.toFixed(3)}`);
      const walked = Math.hypot(soft.cloudC[0][0] - A.game.home[0], soft.cloudC[0][2] - A.game.home[1]);
      assert.ok(walked < 0.1, `stuffing ${stuffing}: walked ${walked.toFixed(3)}`);
      for (let i = 0; i < soft.n; i++) assert.ok(soft.x[i * 3 + 1] >= soft.r[i] - 1e-3, `point ${i} below the floor`);
      assert.ok(soft.kinetic() < 0.6, `stuffing ${stuffing}: still moving, kinetic ${soft.kinetic().toFixed(3)}`);
      assert.ok(!soft.nanResets);
    }
  });

  test(`${name}: keeps its volume within 10%, and after a squish`, () => {
    const A = make(name);
    tick(A, 3);
    for (const g of A.soft.clouds) { const v = vol(g); assert.ok(v > 0.9 && v < 1.1, `volume ratio ${v}`); }
    A.soft.planes = [{ y: 2.0 }];
    tick(A, 1);
    A.soft.planes = [];
    tick(A, 3);
    for (const g of A.soft.clouds) { const v = vol(g); assert.ok(v > 0.9 && v < 1.1, `volume after squish ${v}`); }
    assert.ok(A.soft.cloudR[0][4] > 0.97, 'not back on its feet after the squish');
  });

  test(`${name}: a grab that jumps 5 units drags, never explodes, and it lands back on its feet`, () => {
    const A = make(name);
    tick(A, 1);
    const { soft, rig } = A;
    for (const pick of ['ear', 'arm', 'head']) {
      const ch = rig.arms.find((a) => a.kind === pick);
      const i = ch ? ch.idx[ch.idx.length - 1] : rig.toy.core[5];
      soft.grab('j', i, [soft.x[i * 3] + 5, soft.x[i * 3 + 1] + 4, soft.x[i * 3 + 2] - 3]);
      tick(A, 2);
      assert.ok(soft.x.every(Number.isFinite), `${pick}: NaN`);
      assert.ok(!soft.nanResets, `${pick}: needed a NaN reset`);
      soft.release('j');
      tick(A, 6);
      assert.ok(soft.x.every(Number.isFinite));
      assert.ok(soft.kinetic() < 1, `${pick}: still thrashing, kinetic ${soft.kinetic()}`);
      assert.ok(soft.cloudR[0][4] > 0.95, `${pick}: didn't right itself (up·y ${soft.cloudR[0][4].toFixed(3)})`);
    }
  });

  test(`${name}: uneven browser frame times still settle (fixed-step clock)`, () => {
    const A = make(name);
    const rnd = mulberry32(7);
    for (let t = 0; t < 6;) { const dt = (1 / 60) * (0.6 + rnd() * 0.8); A.soft.advance(dt, (h) => A.game.update(h)); t += dt; }
    let peak = 0;
    for (let k = 0; k < 60; k++) { A.soft.advance((1 / 60) * (0.6 + rnd() * 0.8), (h) => A.game.update(h)); peak = Math.max(peak, A.soft.kinetic()); }
    assert.ok(peak < 0.6, `still jittering: peak kinetic ${peak}`);
    assert.ok(A.soft.cloudR[0][4] > 0.97);
  });

  test(`${name}: idle life fidgets gently and goes nowhere`, () => {
    const A = make(name, { idle: 1 });
    tick(A, 2);
    const c0 = [...A.soft.cloudC[0]];
    let peak = 0;
    tick(A, 10, () => { peak = Math.max(peak, A.soft.kinetic()); });
    assert.ok(peak < 8, `too energetic: ${peak}`);
    const walked = Math.hypot(A.soft.cloudC[0][0] - c0[0], A.soft.cloudC[0][2] - c0[2]);
    assert.ok(walked < 0.15, `walked ${walked.toFixed(3)}`);
  });

  test(`${name}: fast enough for a frame`, () => {
    const A = make(name);
    const t = performance.now();
    tick(A, 2);
    const ms = (performance.now() - t) / 120;
    console.log(`  ${name}: ${A.soft.n} points, ${A.soft._pairs.a.length} collision pairs, ${ms.toFixed(3)} ms/frame`);
    assert.ok(ms < 4);
  });
}

/* ── the leopard's tennis ─────────────────────────────────────────────────── */

for (const [stroke, aim] of [['forehand', [-2.35, 1.7]], ['backhand', [1.6, 1.5]]]) {
  test(`leopard: a well-timed ${stroke} sends the ball back toward the server`, () => seeded(3, () => {
    const A = make('leopard');
    tick(A, 1.5);
    const b = A.game.launch({ aim, speed: 13 });
    A.game.timingErr = 0;
    const vz0 = b.v[2];
    let peak = 0;
    tick(A, 1.4, () => { peak = Math.max(peak, A.soft.kinetic()); });
    assert.ok(vz0 < 0, 'served toward him');
    assert.equal(A.game.outcome, 'return', `outcome ${A.game.outcome} (${A.game.msg})`);
    assert.ok(b.v[2] > 6, `ball not going back: vz ${b.v[2].toFixed(2)}`);
    assert.ok(Math.abs(Math.atan2(b.v[0], b.v[2])) < 0.6, 'sprayed wide');
    assert.equal(A.game.rally, 1);
    assert.ok(peak < 8000, `swing energy ${peak}`);
    assert.ok(!A.soft.nanResets);
  }));
}

test('leopard: late or early, the ball comes off the frame or past him — not cleanly back', () => seeded(5, () => {
  for (const err of [-0.09, 0.09]) {
    const A = make('leopard');
    tick(A, 1.5);
    A.game.launch({ aim: [-2.35, 1.7], speed: 13 });
    A.game.timingErr = err;
    tick(A, 1.4);
    assert.notEqual(A.game.outcome, 'return', `timing ${err}: still a clean return`);
  }
}));

test('leopard: a ball out of reach is a miss', () => seeded(9, () => {
  const A = make('leopard');
  tick(A, 1.5);
  A.game.launch({ aim: [-6.5, 1.5], speed: 16 });
  tick(A, 2);
  assert.equal(A.game.outcome, 'miss');
  assert.equal(A.game.rally, 0);
}));

test('leopard: a fast ball to the head bonks him — squashed, dazed, no runaway energy', () => seeded(11, () => {
  const A = make('leopard');
  tick(A, 1.5);
  const { soft, game } = A;
  // where the head is, before
  const hc0 = game.headCentre();
  game.launch({ aim: [0.05, 2.6], speed: 24 });
  let peak = 0;
  tick(A, 1.2, () => { peak = Math.max(peak, soft.kinetic()); });
  assert.equal(game.outcome, 'bonk', `outcome ${game.outcome}`);
  assert.ok(game.daze > 0.3, 'not dazed');
  assert.ok(peak < 12000, `bonk energy ${peak}`);
  // the daze clears and he settles back where he was standing
  tick(A, 5, () => { peak = Math.max(peak, soft.kinetic()); });
  assert.ok(soft.kinetic() < 1, `still moving ${soft.kinetic()}`);
  assert.ok(soft.cloudR[0][4] > 0.97, 'left leaning');
  assert.ok(game.daze < 0.05);
  const hc = game.headCentre();
  assert.ok(Math.abs(hc[1] - hc0[1]) < 0.2, 'head not back up');
  assert.ok(!soft.nanResets);
}));

test('leopard: an auto rally of serves never runs away', () => seeded(13, () => {
  const A = make('leopard');
  tick(A, 1);
  A.game.auto = true;
  A.game.launch({});
  let peak = 0;
  tick(A, 20, () => { peak = Math.max(peak, A.soft.kinetic()); });
  A.game.auto = false;
  tick(A, 6);
  console.log(`  rally ${A.game.rally}, best ${A.game.best}, hits ${A.game.hits}, peak kinetic ${peak.toFixed(0)}`);
  assert.ok(A.game.hits >= 3, `only ${A.game.hits} hits in 20 s`);
  assert.ok(peak < 12000, `peak kinetic ${peak}`);
  assert.ok(A.soft.kinetic() < 1);
  assert.ok(A.soft.cloudR[0][4] > 0.97);
  assert.ok(!A.soft.nanResets);
}));

/* ── the polar bear's goalkeeping ───────────────────────────────────────── */

test('polar bear: dives to a corner, gets a glove to it, and gets back up — no teleport', () => seeded(17, () => {
  for (const aim of [[2.5, 1.2], [-2.5, 1.0]]) {
    const A = make('bear');
    tick(A, 1.5);
    const { soft, game } = A;
    game.launch({ aim, speed: 14 });
    let dove = false, minUp = 1, jump = 0;
    let prev = [...soft.cloudC[0]];
    tick(A, 9, () => {
      if (game.state === 'dive') dove = true;
      minUp = Math.min(minUp, soft.cloudR[0][4]);
      const c = soft.cloudC[0];
      jump = Math.max(jump, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
      prev = [...c];
    });
    assert.ok(dove, `${aim}: no dive`);
    assert.ok(minUp < 0.5, `${aim}: never went down (min up·y ${minUp.toFixed(2)})`);
    assert.equal(game.outcome, 'save', `${aim}: ${game.outcome}`);
    // back on his feet, back on his line
    assert.ok(soft.cloudR[0][4] > 0.97, `${aim}: still down (up·y ${soft.cloudR[0][4].toFixed(2)})`);
    const home = Math.hypot(soft.cloudC[0][0] - game.home[0], soft.cloudC[0][2] - game.home[1]);
    assert.ok(home < 0.3, `${aim}: ${home.toFixed(2)} from home`);
    // moved only as fast as a body can: no frame-to-frame jumps
    assert.ok(jump < 0.25, `${aim}: centre jumped ${jump.toFixed(3)} in a frame`);
    assert.ok(!soft.nanResets);
  }
}));

test('polar bear: a shot into the body is saved without a dive', () => seeded(19, () => {
  const A = make('bear');
  tick(A, 1.5);
  A.game.launch({ aim: [0.3, 1.4], speed: 15 });
  let dove = false;
  tick(A, 3, () => { if (A.game.state === 'dive') dove = true; });
  assert.ok(!dove);
  assert.equal(A.game.outcome, 'save');
}));

test('polar bear: harder shots into the corners beat him more often', () => seeded(23, () => {
  const aims = [[2.7, 0.5], [-2.7, 0.6], [2.6, 2.6], [-2.6, 2.5], [2.2, 1.5], [-2.2, 1.4]];
  const goalsAt = (speed) => {
    let goals = 0;
    for (const aim of aims) {
      const A = make('bear');
      tick(A, 1.2);
      A.game.launch({ aim, speed });
      tick(A, 2.5);
      if (A.game.outcome === 'goal') goals++;
    }
    return goals;
  };
  const slow = goalsAt(14), fast = goalsAt(26);
  console.log(`  goals from ${aims.length} corner shots: ${slow} at 14 u/s, ${fast} at 26 u/s`);
  assert.ok(fast > slow, `fast ${fast} vs slow ${slow}`);
}));

test('polar bear: a run of shots never runs away, the net settles', () => seeded(29, () => {
  const A = make('bear');
  tick(A, 1);
  let peak = 0;
  for (let k = 0; k < 6; k++) {
    A.game.launch({ speed: 12 + k * 2.5 });
    tick(A, 5, () => { peak = Math.max(peak, A.soft.kinetic()); });
  }
  tick(A, 6);
  console.log(`  saves ${A.game.saves}, goals ${A.game.goals}, peak kinetic ${peak.toFixed(0)}`);
  assert.ok(peak < 40000, `peak kinetic ${peak}`);
  assert.ok(A.soft.kinetic() < 1, `still moving ${A.soft.kinetic()}`);
  assert.ok(A.soft.cloudR[0][4] > 0.97);
  assert.ok(A.game.net.x.every(Number.isFinite));
  assert.ok(!A.soft.nanResets);
}));

test('every rig has the structure SoftBody and Body consume', () => {
  for (const name of ORDER) {
    const rig = buildRig(name);
    assert.equal(rig.rest.length, rig.n * 3);
    for (const ch of rig.arms) {
      assert.ok(ch.idx.length >= 3, `${name} ${ch.name} too short`);
      assert.ok(ch.cloud >= 0 && ch.cloud < rig.clouds.length);
    }
    for (const regions of [rig.regions, rig.cloth?.regions || []]) {
      for (const r of regions) assert.ok(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1 + 1e-9 && r.x1 > r.x0 && r.y1 > r.y0);
      for (let a = 0; a < regions.length; a++)
        for (let c = a + 1; c < regions.length; c++) {
          const A = regions[a], B = regions[c];
          assert.ok(!(A.x0 < B.x1 - 1e-9 && B.x0 < A.x1 - 1e-9 && A.y0 < B.y1 - 1e-9 && B.y0 < A.y1 - 1e-9), `${name}: regions ${a} and ${c} overlap`);
        }
    }
    assert.equal(rig.parts.filter((p) => p.kind === 'tube').length, rig.arms.length);
    assert.ok(rig.cloth?.parts.length, `${name} has no kit`);
  }
});

/* ── the crow's catch and hoard ─────────────────────────────────────────── */

/* run the crow for `sec`, keeping a log: every state he passed through,
   peak kinetic energy, the biggest frame-to-frame jump of his middle    */
const watchCrow = (A, sec, log = { states: new Set(), peak: 0, jump: 0 }) => {
  let prev = [...A.soft.cloudC[0]];
  tick(A, sec, () => {
    log.states.add(A.game.state);
    log.peak = Math.max(log.peak, A.soft.kinetic());
    const c = A.soft.cloudC[0];
    log.jump = Math.max(log.jump, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
    prev = [...c];
  });
  return log;
};
const settledHome = (A) => {
  const { soft, game } = A;
  assert.ok(soft.cloudR[0][4] > 0.97, `not upright (up·y ${soft.cloudR[0][4].toFixed(3)})`);
  assert.ok(soft.kinetic() < 1, `still moving ${soft.kinetic()}`);
  const home = Math.hypot(soft.cloudC[0][0] - game.home[0], soft.cloudC[0][2] - game.home[1]);
  assert.ok(home < 0.3, `${home.toFixed(2)} from home`);
  assert.ok(!soft.nanResets);
};

for (const aim of [[0, 1.9], [0.8, 1.8], [-1.2, 2.1]]) {
  test(`crow: a well-aimed food toss ${JSON.stringify(aim)} is snapped out of the air in his beak`, () => seeded(31, () => {
    const A = make('crow');
    tick(A, 1.5);
    const it = A.game.launch({ aim, kind: 'food', speed: 15 });
    let lowest = Infinity;
    const log = { states: new Set(), peak: 0, jump: 0 };
    tick(A, 1.6, () => { log.states.add(A.game.state); if (it.state === 'free') lowest = Math.min(lowest, it.ball.x[1]); });
    // caught: in the beak (or already going down), and never near the floor
    assert.ok(lowest > 1, `it fell to ${lowest.toFixed(2)}`);
    assert.ok(['beak', 'gone'].includes(it.state), `food is ${it.state} (${A.game.msg})`);
    assert.equal(A.game.row, 1);
    assert.equal(A.game.catches, 1);
    assert.ok(!log.states.has('lunge'), 'lunged at a toss he could step to');
    // then the gulp: gone, and he's back where he stands
    watchCrow(A, 4, log);
    assert.equal(it.state, 'gone', 'not swallowed');
    assert.ok(log.states.has('gulp'));
    assert.ok(log.peak < 6000, `peak kinetic ${log.peak}`);
    settledHome(A);
  }));
}

test('crow: the beak opens on the way in and is shut on the food when it lands in it', () => seeded(37, () => {
  const A = make('crow');
  tick(A, 1.5);
  const it = A.game.launch({ aim: [0.2, 1.9], kind: 'food', speed: 15 });
  let maxOpen = 0, openAtCatch = null;
  tick(A, 1.6, () => {
    maxOpen = Math.max(maxOpen, A.game.beak.x);
    if (it.state === 'beak' && openAtCatch === null) openAtCatch = A.game.beak.x;
  });
  assert.ok(maxOpen > 0.8, `never opened (max ${maxOpen.toFixed(2)})`);
  assert.ok(openAtCatch !== null, 'never caught');
  tick(A, 0.15);
  assert.ok(A.game.beak.x < 0.2, `still open after the catch (${A.game.beak.x.toFixed(2)})`);
  // the food rides in the beak, at the mouth
  if (it.state === 'beak') {
    const m = A.game.mouth, b = it.ball.x;
    assert.ok(Math.hypot(b[0] - m[0], b[1] - m[1], b[2] - m[2]) < 1e-6);
  }
}));

for (const aim of [[2.5, 1.9], [-3, 2.0], [3, 2.4]]) {
  test(`crow: a wide toss ${JSON.stringify(aim)} gets a flap-and-lunge — no runaway energy, back on his feet`, () => seeded(41, () => {
    const A = make('crow');
    tick(A, 1.5);
    const it = A.game.launch({ aim, kind: 'food', speed: 15 });
    let flapped = 0, airborne = false;
    const foot0 = Math.min(...[...A.game.feet[0]].map((i) => A.soft.x[i * 3 + 1]));
    const log = { states: new Set(), peak: 0, jump: 0 };
    tick(A, 1.5, () => {
      log.states.add(A.game.state);
      log.peak = Math.max(log.peak, A.soft.kinetic());
      flapped = Math.max(flapped, A.game.flap.x);
      const fy = Math.min(...[...A.game.feet[0]].map((i) => A.soft.x[i * 3 + 1]));
      if (A.game.state === "lunge" && fy > foot0 + 0.12) airborne = true;
    });
    assert.ok(log.states.has('lunge'), `no lunge: ${[...log.states]}`);
    assert.ok(flapped > 0.8, `wings never beat (${flapped.toFixed(2)})`);
    assert.ok(airborne, 'never left the floor');
    assert.ok(['beak', 'gone'].includes(it.state) || it.ball.x[1] < 0.5, 'lost track of it');
    watchCrow(A, 6, log);
    assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
    assert.ok(log.jump < 0.25, `centre jumped ${log.jump.toFixed(3)} in a frame`);
    settledHome(A);
  }));
}

test('crow: the beating wings turn out from his sides and fold back after', () => seeded(43, () => {
  const A = make('crow');
  tick(A, 1.5);
  const { soft, rig, game } = A;
  const tipOut = () => {
    const w = rig.arms[game.cfg.armL], i = w.idx[w.idx.length - 1];
    return soft.x[i * 3] - soft.cloudC[0][0];
  };
  const rest = tipOut();
  A.game.launch({ aim: [3, 2.2], kind: 'food', speed: 15 });
  let most = rest;
  tick(A, 1.2, () => { most = Math.max(most, tipOut()); });
  assert.ok(most > rest + 0.35, `wing tip only got ${(most - rest).toFixed(2)} out from its fold`);
  tick(A, 5);
  assert.ok(Math.abs(tipOut() - rest) < 0.12, `wing not folded back (${(tipOut() - rest).toFixed(2)})`);
}));

test('crow: a food he misses he pecks up off the floor', () => seeded(47, () => {
  const A = make('crow');
  tick(A, 1.5);
  // far out wide and fast: past him, onto the floor
  const it = A.game.launch({ aim: [-4, 1], kind: 'food', speed: 26 });
  let landed = false, mouthLow = Infinity;
  const log = { states: new Set(), peak: 0, jump: 0 };
  tick(A, 7, () => {
    log.states.add(A.game.state);
    log.peak = Math.max(log.peak, A.soft.kinetic());
    if (it.state === 'free' && it.ball.x[1] < it.r + 0.02) landed = true;
    if (A.game.state === 'peck') mouthLow = Math.min(mouthLow, A.game.mouth[1]);
  });
  assert.ok(landed, 'it never reached the floor');
  assert.equal(A.game.row, 0, 'a miss still counted as a catch');
  assert.ok(log.states.has('peck'), `never pecked: ${[...log.states]}`);
  assert.ok(mouthLow < 0.45, `the peck didn't reach down (mouth at ${mouthLow.toFixed(2)})`);
  assert.equal(it.state, 'gone', `food left ${it.state} at ${it.ball.x.map((v) => v.toFixed(2))}`);
  watchCrow(A, 5, log);
  assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
  settledHome(A);
}));

test('crow: a shiny thing he catches ends up resting in his nest', () => seeded(53, () => {
  const A = make('crow');
  tick(A, 1.5);
  const it = A.game.launch({ aim: [0.3, 1.9], kind: 'shiny', speed: 15 });
  const log = watchCrow(A, 8);
  assert.ok(log.states.has('carry') && log.states.has('drop'), `${[...log.states]}`);
  assert.equal(A.game.catches, 1, 'not caught in the air');
  assert.ok(it.inNest, `not in the nest: ${it.ball.x.map((v) => v.toFixed(2))}`);
  assert.equal(it.state, 'free', 'still in his beak');
  const N = A.game.nest, b = it.ball;
  const d = Math.hypot(b.x[0] - N.c[0], b.x[2] - N.c[1]);
  assert.ok(d < N.R, `outside the bowl (${d.toFixed(2)})`);
  // resting: on the bowl, not floating, not moving
  const bowl = N.y0 + N.dip * (d / N.R) ** 2 + b.r;
  assert.ok(Math.abs(b.x[1] - bowl) < 0.03, `not on the bowl: y ${b.x[1].toFixed(3)} vs ${bowl.toFixed(3)}`);
  assert.ok(b.speed() < 0.05, `still moving ${b.speed()}`);
  assert.equal(A.game.hoard(), 1);
  settledHome(A);
}));

test('crow: several treasures pile up in the nest, each resting, none inside another', () => seeded(59, () => {
  const A = make('crow');
  tick(A, 1.5);
  for (const aim of [[0.2, 1.9], [-0.5, 2.0], [0.6, 1.8], [0, 2.1]]) {
    A.game.launch({ aim, kind: 'shiny', speed: 15 });
    tick(A, 5.5);
  }
  tick(A, 2);
  const inNest = A.game.items.filter((it) => it.inNest);
  assert.equal(A.game.hoard(), 4, `hoard ${A.game.hoard()}`);
  for (const it of inNest) assert.ok(it.ball.speed() < 0.05, `${it.sub} still moving`);
  for (let a = 0; a < inNest.length; a++)
    for (let k = a + 1; k < inNest.length; k++) {
      const P = inNest[a].ball, Q = inNest[k].ball;
      const d = Math.hypot(P.x[0] - Q.x[0], P.x[1] - Q.x[1], P.x[2] - Q.x[2]);
      assert.ok(d > (P.r + Q.r) * 0.9, `${inNest[a].sub} and ${inNest[k].sub} overlap`);
    }
  settledHome(A);
}));

test('crow: drag a treasure out of the nest and he flaps, comes over and steals it back', () => seeded(61, () => {
  const A = make('crow');
  tick(A, 1.5);
  A.game.launch({ aim: [0.2, 1.9], kind: 'shiny', speed: 15 });
  tick(A, 6);
  const it = A.game.items.find((q) => q.inNest);
  assert.ok(it, 'nothing in the nest to take');
  // the Hand: pick it up out of the nest and carry it across the stage
  assert.ok(A.game.grabItem(it.id));
  const log = { states: new Set(), peak: 0, jump: 0 };
  let flapped = 0;
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    A.game.moveItem(it.id, [2.3 - 3.2 * u, 0.5 + Math.sin(u * Math.PI) * 0.9, -1.05 + 2.6 * u]);
    tick(A, 1 / 60, () => { log.states.add(A.game.state); flapped = Math.max(flapped, A.game.flap.x); });
  }
  A.game.releaseItem(it.id);
  assert.ok(it.stolen, 'he didn’t notice');
  tick(A, 10, () => {
    log.states.add(A.game.state);
    log.peak = Math.max(log.peak, A.soft.kinetic());
    flapped = Math.max(flapped, A.game.flap.x);
  });
  assert.ok(log.states.has('indignant'), `no indignant flap: ${[...log.states]}`);
  assert.ok(flapped > 0.8, 'wings never beat');
  assert.ok(log.states.has('peck') && log.states.has('carry'), `${[...log.states]}`);
  assert.ok(it.inNest, `not back in the nest: ${it.ball.x.map((v) => v.toFixed(2))}`);
  assert.ok(!it.stolen);
  assert.equal(A.game.hoard(), 1);
  assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
  settledHome(A);
}));

test('crow: he snatches it back out of your hand if you hold it low', () => seeded(67, () => {
  const A = make('crow');
  tick(A, 1.5);
  A.game.launch({ aim: [0.2, 1.9], kind: 'shiny', speed: 15 });
  tick(A, 6);
  const it = A.game.items.find((q) => q.inNest);
  A.game.grabItem(it.id);
  // hold it out of the nest, low, in front of him, and keep holding it
  let snatched = false;
  for (let k = 0; k < 600 && !snatched; k++) {
    if (it.state === 'hand') A.game.moveItem(it.id, [0.9, 0.35, 0.9]);
    tick(A, 1 / 60);
    for (const ev of A.game.events) if (ev.kind === 'snatch' && ev.id === it.id) snatched = true;
    A.game.events.length = 0;
  }
  assert.ok(snatched, `never took it (${A.game.state}, ${A.game.msg})`);
  tick(A, 8);
  assert.ok(it.inNest, 'not returned to the nest');
}));

test('crow: a long run of tosses — food and shiny, near and wide — never runs away', () => seeded(71, () => {
  const A = make('crow');
  tick(A, 1);
  let peak = 0;
  for (let k = 0; k < 10; k++) {
    A.game.launch({ kind: k % 3 === 2 ? 'shiny' : 'food', speed: 12 + k * 1.5 });
    tick(A, 4, () => { peak = Math.max(peak, A.soft.kinetic()); });
  }
  tick(A, 8);
  console.log(`  catches ${A.game.catches}, best ${A.game.best}, hoard ${A.game.hoard()}, peak kinetic ${peak.toFixed(0)}`);
  assert.ok(A.game.catches >= 5, `only ${A.game.catches} catches`);
  assert.ok(peak < 12000, `peak kinetic ${peak}`);
  assert.ok(A.game.items.every((it) => it.ball.x.every(Number.isFinite)));
  settledHome(A);
}));

/* ── the giraffe's ring toss ─────────────────────────────────────────────── */

const watchGiraffe = (A, sec, log = { states: new Set(), peak: 0, jump: 0, ringV: 0 }) => {
  let prev = [...A.soft.cloudC[0]];
  tick(A, sec, () => {
    log.states.add(A.game.state);
    log.peak = Math.max(log.peak, A.soft.kinetic());
    for (const r of A.game.rings) log.ringV = Math.max(log.ringV, r.speed());
    const c = A.soft.cloudC[0];
    log.jump = Math.max(log.jump, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
    prev = [...c];
    assert.ok(A.game.rings.every((r) => [...r.x, ...r.v, ...r.q].every(Number.isFinite)), 'a ring went NaN');
  });
  return log;
};
const tipHeight = (A, sec) => { let y = 0, n = 0; tick(A, sec, () => { y += A.game.hornTip()[1]; n++; }); return y / n; };

test('giraffe: stands square on all four feet', () => {
  const A = make('giraffe', { idle: 0 });
  tick(A, 3);
  const { soft, rig } = A;
  // the soles: cloud points on the floor, one group under each leg
  const quad = [0, 0, 0, 0];
  for (const i of rig.clouds[0].ix) {
    if (rig.rest[i * 3 + 1] > 0.1 || !soft.contact[i]) continue;
    quad[(rig.rest[i * 3] < 0 ? 0 : 1) + (rig.rest[i * 3 + 2] < 0 ? 2 : 0)]++;
  }
  assert.ok(quad.every((q) => q >= 6), `feet on the floor per leg: ${quad}`);
  // and his head up where it's sewn, at the top of his neck
  assert.ok(A.game.hornTip()[1] > 4.5, `ossicones at ${A.game.hornTip()[1].toFixed(2)}`);
});

for (const aim of [[0, 4.6], [0.5, 4.4], [-0.7, 4.7]]) {
  test(`giraffe: a well-aimed ring ${JSON.stringify(aim)} drops over his ossicones and slides down to the base`, () => seeded(73, () => {
    const A = make('giraffe');
    tick(A, 1.5);
    const r = A.game.launch({ aim, speed: 15 });
    const s = [];
    const log = watchGiraffe(A, 1.5);
    assert.equal(r.state, 'neck', `ring is ${r.state} (${A.game.msg})`);
    assert.ok(log.states.has('caught'));
    // it slides: down the path, all the way to the bottom of the neck
    tick(A, 2, () => s.push(r.s));
    assert.ok(s[s.length - 1] > s[0] - 1e-6, 'went back up the neck');
    assert.ok(Math.abs(r.s - A.game.path.base) < 0.06, `resting at s ${r.s.toFixed(2)}, base ${A.game.path.base.toFixed(2)}`);
    assert.ok(r.rest, 'not resting on the base');
    assert.ok(r.x[1] < 2.7 && r.x[1] > 1.9, `resting at height ${r.x[1].toFixed(2)}`);
    assert.ok(r.speed() < 0.3, `still sliding ${r.speed().toFixed(2)}`);
    assert.equal(A.game.readout()[0][1], 1);
    assert.ok(log.peak < 6000, `peak kinetic ${log.peak}`);
    assert.ok(A.soft.cloudR[0][4] > 0.97 && !A.soft.nanResets);
    assert.ok(Math.hypot(A.soft.cloudC[0][0] - A.game.home[0], A.soft.cloudC[0][2] - A.game.home[1]) < 0.3, 'walked off');
  }));
}

test('giraffe: rings stack on the neck, and the neck sags measurably more under five than under one', () => seeded(79, () => {
  const A = make('giraffe', { idle: 0 });
  tick(A, 1.5);
  const y0 = tipHeight(A, 0.5);
  A.game.launch({ aim: [0, 4.6], speed: 15 });
  tick(A, 3);
  const y1 = tipHeight(A, 1);
  const sag1 = A.game.sag.x;
  for (const aim of [[0.3, 4.5], [-0.3, 4.6], [0.1, 4.4], [-0.1, 4.7]]) { A.game.launch({ aim, speed: 15 }); tick(A, 3); }
  const on = A.game.onNeck();
  assert.equal(on.length, 5, `${on.length} on the neck`);
  assert.equal(A.game.best, 5);
  // a stack: each resting on the one below, none inside another
  const s = on.map((r) => r.s).sort((a, b) => b - a);
  for (let k = 1; k < s.length; k++) assert.ok(s[k - 1] - s[k] > 0.13, `rings ${k - 1} and ${k} overlap: ${s.map((v) => v.toFixed(2))}`);
  assert.ok(on.every((r) => r.rest), 'not all resting');
  const y5 = tipHeight(A, 1);
  const drop1 = y0 - y1, drop5 = y0 - y5;
  assert.ok(drop5 > drop1 + 0.1, `head dropped ${drop1.toFixed(3)} under one, ${drop5.toFixed(3)} under five`);
  assert.ok(A.game.sag.x > sag1 * 2.5, `sag ${sag1.toFixed(3)} → ${A.game.sag.x.toFixed(3)}`);
  // …and it sways wider and slower: the same knock, a bigger swing
  const swing = (n) => { A.game.sway.v = 0.6; let peak = 0, t0 = null; tick(A, 1.5, () => { peak = Math.max(peak, Math.abs(A.game.sway.x)); if (t0 === null && A.game.sway.v < 0) t0 = A.game.time; }); return { peak, n }; };
  const big = swing(5);
  assert.ok(big.peak > 0.035, `sway ${big.peak}`);
  assert.ok(A.soft.cloudR[0][4] > 0.97 && !A.soft.nanResets);
}));

test('giraffe: past the limit he shakes the whole stack off — rings fly, nothing runs away', () => seeded(83, () => {
  const A = make('giraffe');
  tick(A, 1.5);
  const log = { states: new Set(), peak: 0, jump: 0, ringV: 0 };
  let k = 0;
  while (A.game.shakes === 0 && k < 12) {
    A.game.launch({ aim: [(k % 3 - 1) * 0.25, 4.55], speed: 15 });
    watchGiraffe(A, 2.8, log);
    k++;
  }
  assert.equal(A.game.shakes, 1, 'never shook');
  assert.ok(A.game.best > STACK_MAX, `best stack ${A.game.best}`);
  watchGiraffe(A, 6, log);
  assert.ok(log.states.has('shake'));
  assert.equal(A.game.onNeck().length, 0, `${A.game.onNeck().length} still on the neck`);
  // they flew: off his head and away, and came down at rest on the floor
  const free = A.game.rings.filter((r) => r.state === 'free');
  assert.ok(free.length > STACK_MAX);
  for (const r of free) {
    assert.ok(r.x[1] < r.R + r.r + 0.05, `a ring at height ${r.x[1].toFixed(2)}`);
    assert.ok(r.speed() < 0.2, `a ring still moving ${r.speed().toFixed(2)}`);
  }
  assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
  assert.ok(log.ringV < 25, `a ring at ${log.ringV.toFixed(1)} u/s`);
  assert.ok(log.jump < 0.2, `body jumped ${log.jump.toFixed(3)} in a frame`);
  settledHome(A);
}));

test('giraffe: a ring that clonks him on the head sets off the shake, and the stack comes off', () => seeded(89, () => {
  const A = make('giraffe');
  tick(A, 1.5);
  for (const aim of [[0, 4.6], [0.2, 4.5]]) { A.game.launch({ aim, speed: 15 }); tick(A, 3); }
  assert.equal(A.game.onNeck().length, 2);
  // dropped hard onto his head, off to one side of the ossicones
  const r = A.game.launch();
  const hc = A.game.headCentre();
  r.x = [hc[0] + 0.32, hc[1] + 1.4, hc[2] + 0.1]; r.p = [...r.x];
  r.v = [0, -9, 0];
  const log = watchGiraffe(A, 6);
  assert.ok(log.states.has('clonk'), `states ${[...log.states]}`);
  assert.ok(log.states.has('shake'));
  assert.equal(A.game.onNeck().length, 0);
  assert.ok(A.game.rings.every((q) => q.state === 'free'));
  assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
  watchGiraffe(A, 2);
  settledHome(A);
}));

for (const aim of [[3.2, 3], [-3.4, 2.6], [2.6, 1.0]]) {
  test(`giraffe: a missed ring ${JSON.stringify(aim)} bounces and rolls, and ends on the floor at rest`, () => seeded(97, () => {
    const A = make('giraffe');
    tick(A, 1.5);
    const r = A.game.launch({ aim, speed: 15 });
    const log = watchGiraffe(A, 8);
    assert.equal(r.state, 'free', `ring ${r.state}`);
    assert.ok(r.floor, 'not on the floor');
    assert.ok(r.x[1] < r.R + r.r + 0.02, `lying at height ${r.x[1].toFixed(2)}`);
    // flat: lying on its side, axis up
    assert.ok(Math.abs(r.axis()[1]) > 0.95, `standing on its edge (axis·y ${r.axis()[1].toFixed(2)})`);
    assert.ok(r.speed() < 0.05 && Math.hypot(...r.w) < 0.3, 'still rolling');
    assert.equal(A.game.onNeck().length, 0);
    assert.ok(log.peak < 6000, `peak kinetic ${log.peak}`);
    settledHome(A);
    // Collect clears the floor
    assert.equal(A.game.collect(), 1);
    assert.equal(A.game.rings.length, 0);
  }));
}

test('giraffe: a long auto run of tosses never runs away', () => seeded(101, () => {
  const A = make('giraffe');
  tick(A, 1);
  A.game.auto = true;
  const log = watchGiraffe(A, 30);
  A.game.auto = false;
  assert.ok(A.game.catches >= 6, `caught ${A.game.catches}`);
  assert.ok(log.peak < 12000, `peak kinetic ${log.peak}`);
  assert.ok(log.jump < 0.2, `body jumped ${log.jump.toFixed(3)}`);
  assert.ok(!A.soft.nanResets);
  watchGiraffe(A, 6);
  settledHome(A);
  console.log(`  giraffe: ${A.game.catches} caught, ${A.game.shakes} shakes, peak kinetic ${log.peak.toFixed(0)}`);
}));
