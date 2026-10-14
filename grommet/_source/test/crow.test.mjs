/* The crow's toss modes (food / shiny / random) and his beak's geometry:
   where it sits on the face, that it turns with the head, and that the
   mesh is a solid wound the right way out.                               */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATHLETES, buildRig } from '../src/athletes/index.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';
import { Body } from '../src/body.js';
import { mulberry32 } from '../src/math.js';
import { ITEMS, TOSS_KINDS, FOOD_SHARE, pickToss } from '../src/athletes/crow.game.js';
import { CROW } from '../src/athletes/crow.rig.js';
import { CHARACTER_INFO } from '../src/characters.js';
import { makeBeak } from '../src/crowprops.js';

function make() {
  const rig = buildRig('crow');
  const soft = new SoftBody(rig);
  soft.params.stuffing = 0.42;
  const life = new Idle(soft);
  life.amount = 0.5;
  const game = new ATHLETES.crow.Game(soft);
  return { rig, soft, game };
}
const tick = (A, sec, each) => {
  for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
    A.soft.advance(1 / 60, (h) => A.game.update(h));
    each?.();
  }
};
const seeded = (seed, fn) => {
  const r = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = r; }
};

/* ── toss random ─────────────────────────────────────────────────────────── */

test('crow: Toss random picks food about 60% of the time and every variant of each', () => {
  const rnd = mulberry32(5);
  const n = 4000, count = {};
  let food = 0;
  for (let k = 0; k < n; k++) {
    const [kind, sub] = pickToss('random', rnd);
    assert.equal(ITEMS[sub].kind, kind);
    if (kind === 'food') food++;
    count[sub] = (count[sub] || 0) + 1;
  }
  assert.ok(Math.abs(food / n - FOOD_SHARE) < 0.03, `food share ${(food / n).toFixed(3)}`);
  for (const sub of Object.keys(ITEMS)) assert.ok(count[sub] > n * 0.08, `${sub} only ${count[sub]} times`);
  // the fixed modes stay fixed
  for (let k = 0; k < 50; k++) {
    assert.equal(pickToss('food', rnd)[0], 'food');
    assert.equal(pickToss('shiny', rnd)[0], 'shiny');
  }
});

test('crow: a run of random tosses mixes food and shiny, and the hint names each one', () => seeded(83, () => {
  const A = make();
  tick(A, 1);
  A.game.kind = 'random';
  const kinds = new Set(), subs = new Set();
  for (let k = 0; k < 12; k++) {
    const it = A.game.launch({});
    kinds.add(it.kind); subs.add(it.sub);
    assert.equal(A.game.tossing.name, ITEMS[it.sub].name);
    assert.ok(A.game.status().startsWith(`tossing: ${ITEMS[it.sub].name}`), A.game.status());
  }
  assert.deepEqual([...kinds].sort(), ['food', 'shiny'], `only ${[...kinds]} over 12 tosses`);
  assert.ok(subs.size >= 3, `only ${[...subs]}`);
  // the bottle cap is named as one
  assert.equal(ITEMS.cap.name, 'bottle cap');
}));

test('crow: the toss mode persists — over tosses, explicit food/shiny tosses and a reset', () => seeded(89, () => {
  const A = make();
  tick(A, 0.5);
  assert.deepEqual(TOSS_KINDS, ['food', 'shiny', 'random']);
  A.game.kind = 'random';
  A.game.launch({});
  A.game.launch({ kind: 'food' });
  A.game.launch({ kind: 'shiny' });
  assert.equal(A.game.kind, 'random');
  A.game.reset();
  assert.equal(A.game.kind, 'random');
  assert.equal(A.game.tossing, null);
  // food and shiny modes throw only their own
  for (const kind of ['food', 'shiny']) {
    A.game.kind = kind;
    for (let k = 0; k < 8; k++) assert.equal(A.game.launch({}).kind, kind);
    assert.equal(A.game.kind, kind);
  }
}));

test('crow: random tosses are played — food eaten, shiny things carried to the nest', () => seeded(97, () => {
  const A = make();
  tick(A, 1);
  A.game.kind = 'random';
  const tossed = [];
  for (const aim of [[0.2, 1.9], [-0.4, 2.0], [0.5, 1.9], [0, 2.1], [-0.2, 1.95], [0.3, 2.0]]) {
    tossed.push(A.game.launch({ aim, speed: 15 }).kind);
    tick(A, 5.5);
  }
  tick(A, 3);
  const foods = tossed.filter((k) => k === 'food').length, shinies = tossed.length - foods;
  console.log(`  tossed ${tossed.join(' ')} — caught ${A.game.catches}, hoard ${A.game.hoard()}`);
  assert.ok(foods > 0 && shinies > 0, `not mixed: ${tossed}`);
  assert.ok(A.game.hoard() >= 1, 'nothing reached the nest');
  assert.ok(A.game.items.filter((it) => it.kind === 'food' && it.state !== 'gone').length === 0, 'food left uneaten');
  assert.ok(!A.soft.nanResets);
}));

/* ── the beak ────────────────────────────────────────────────────────────── */

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

test('crow: the beak sits on the face midline, below and between the eyes, and turns with the head', () => seeded(101, () => {
  const A = make();
  const body = new Body(A.rig, A.soft);
  const ey = CHARACTER_INFO.crow.eyes;
  const v = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const eye = (s) => { const P = v(), N = v(); body.surfacePoint('head', 0.5 + s * ey.u, ey.v, P, N); return [P.x, P.y, P.z]; };
  let worstOff = 0, worstAng = 0, minYaw = 0, maxYaw = 0, frames = 0;
  const probe = () => {
    body.update(1 / 60);
    const eR = eye(-1), eL = eye(1);
    const across = unit(sub(eL, eR)), mid = eL.map((x, i) => (x + eR[i]) / 2);
    const F = A.game.beakFrame(), R = F.R, d = F.dir;
    const axis = [0, 3, 6].map((r) => R[r] * d[0] + R[r + 1] * d[1] + R[r + 2] * d[2]);
    const fwd = [R[2], R[5], R[8]];
    // on the midline: no distance across from between the eyes
    worstOff = Math.max(worstOff, Math.abs(dot(sub(F.base, mid), across)));
    // aligned: the beak's axis has no part across the face, and points the way the head faces
    worstAng = Math.max(worstAng, Math.abs(Math.asin(dot(axis, across))) * 180 / Math.PI);
    assert.ok(dot(axis, fwd) > 0.9, `beak points off the head's forward (${dot(axis, fwd).toFixed(3)})`);
    // below the eyes, and well in from either of them
    const up = [R[1], R[4], R[7]];
    assert.ok(dot(sub(F.base, mid), up) < -0.05, 'the beak is not below the eyes');
    const gap = Math.hypot(...sub(eL, eR));
    assert.ok(gap > 2.5 * CROW.BEAK.w * 2, `eyes ${gap.toFixed(3)} apart, crowding a beak ${2 * CROW.BEAK.w} wide`);
    const yaw = Math.atan2(fwd[0], fwd[2]) * 180 / Math.PI;
    minYaw = Math.min(minYaw, yaw); maxYaw = Math.max(maxYaw, yaw);
    frames++;
  };
  tick(A, 2);
  probe();
  // wide tosses either side turn his head (and the lunges tip and swing it)
  for (const aim of [[-2.6, 2.0], [2.6, 2.0], [-4, 1], [3.5, 2.6]]) {
    A.game.launch({ aim, kind: 'food', speed: 15 });
    tick(A, 4, probe);
  }
  console.log(`  ${frames} frames, head yaw ${minYaw.toFixed(1)}…${maxYaw.toFixed(1)}°, base off midline ≤ ${worstOff.toFixed(4)}, axis across ≤ ${worstAng.toFixed(2)}°`);
  assert.ok(minYaw < -5 && maxYaw > 5, 'the head never turned');
  assert.ok(worstOff < 0.01, `beak base ${worstOff.toFixed(4)} off the midline`);
  assert.ok(worstAng < 1.5, `beak axis ${worstAng.toFixed(2)}° across the face`);
}));

test('crow: the beak mesh is solid — closed, wound outward, deeper than wide, ridge up', () => {
  const g = makeBeak(CROW.BEAK);
  for (const [name, grp, sign] of [['upper', g.userData.up, 1], ['lower', g.userData.lo, -1]]) {
    const G = grp.children[0].geometry, P = G.attributes.position, N = G.attributes.normal, I = G.index.array;
    // signed volume > 0: the faces are wound counter-clockwise from outside
    let V = 0;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map((i) => [P.getX(i), P.getY(i), P.getZ(i)]);
      V += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    assert.ok(V > 0.002, `${name} mandible signed volume ${V.toFixed(5)} (inside-out or flat)`);
    // the normal on the middle of the outside points away from the gape
    let best = -1, bestY = -Infinity;
    for (let i = 0; i < P.count; i++) {
      if (Math.abs(P.getZ(i) - CROW.BEAK.len * 0.4) > 0.03 || Math.abs(P.getX(i)) > 0.01) continue;
      if (sign * P.getY(i) > bestY) { bestY = sign * P.getY(i); best = i; }
    }
    assert.ok(best >= 0);
    assert.ok(sign * N.getY(best) > 0.7, `${name} outer normal points in (${N.getY(best).toFixed(2)})`);
  }
  // closed, the section is deeper than it is wide, and wider than a blade
  const up = g.userData.up.children[0].geometry.attributes.position, lo = g.userData.lo.children[0].geometry.attributes.position;
  const span = (P, z) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getZ(i) - z) < 0.02) { x0 = Math.min(x0, P.getX(i)); x1 = Math.max(x1, P.getX(i)); y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); }
    return [x1 - x0, y1 - y0, y0, y1];
  };
  const z = CROW.BEAK.len * 0.3, [w, hu, , top] = span(up, z), [, hl, bot] = span(lo, z);
  const depth = top - bot;
  assert.ok(depth > w, `section ${w.toFixed(3)} wide, only ${depth.toFixed(3)} deep`);
  assert.ok(w > depth * 0.6, `a blade: ${w.toFixed(3)} wide, ${depth.toFixed(3)} deep`);
  assert.ok(hu > hl, 'the lower mandible is not the shallower one');
});
