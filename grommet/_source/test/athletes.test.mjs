import test from 'node:test';
import assert from 'node:assert/strict';
import { ATHLETES, ORDER, buildRig } from '../src/athletes/index.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';
import { det3, mulMat3, mulberry32 } from '../src/math.js';

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
  let peak = 0, minVol = 9;
  const g = { ...soft.clouds[0] };
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
  void minVol; void g;
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
