import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';
import { Play } from '../src/toys.js';

function make(name) {
  const b = new SoftBody(buildRig(name));
  new Idle(b);
  const play = new Play(b);
  const out = { b, play, peak: 0 };
  out.run = (sec, until) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      b.advance(1 / 60, (h) => play.update(h));
      out.peak = Math.max(out.peak, b.kinetic());
      if (until && until()) return;
    }
  };
  return out;
}

// the head's facing relative to the body's, about the vertical (+ = toward +x)
function headYaw(b, play) {
  const f = play.headForward(), R = b.cloudR[0];
  let d = Math.atan2(f[0], f[2]) - Math.atan2(R[2], R[8]);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// what a whole-body toss gives the toy (the Toss button's impulse): the bar
// for "no runaway" — a toy must never put more energy in than a throw
function tossKE(b) {
  let e = 0;
  const c = b.headC;
  for (let i = 0; i < b.n; i++) {
    const rx = b.x[i * 3] - c[0], ry = b.x[i * 3 + 1] - c[1];
    const v = [1.4 - ry * 4.5, 8.2 + rx * 4.5, -0.8];
    e += v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  }
  return 0.5 * e;
}

for (const name of ['fox', 'lion', 'llama', 'wolf']) {
  test(`${name}: no toy, no change — Play installed but idle is bit-for-bit the plain toy`, () => {
    const a = make(name);
    const b = new SoftBody(buildRig(name));
    new Idle(b);
    for (let t = 0; t < 3; t += 1 / 60) { a.b.advance(1 / 60, (h) => a.play.update(h)); b.advance(1 / 60); }
    assert.ok(a.b.x.every((v, i) => v === b.x[i]) && a.b.v.every((v, i) => v === b.v[i]), 'diverged');
    assert.equal(a.b.pose, null);
  });

  for (const side of [1, -1]) {
    test(`${name}: attention turns the head toward a toy on the ${side > 0 ? 'right' : 'left'}, and relaxes when it goes`, () => {
      const T = make(name);
      T.run(1.5);
      assert.ok(Math.abs(headYaw(T.b, T.play)) < 0.03);
      const c = T.b.cloudC[0];
      T.play.place([c[0] + side * 2.6, 0, c[2] + 1.6], [0, 0, 1]);
      T.run(3);
      const yaw = headYaw(T.b, T.play);
      assert.ok(yaw * side > 0.35, `head turned only ${yaw.toFixed(3)} rad toward the toy`);
      assert.ok(Math.abs(yaw) < 1.2, `head over-rotated: ${yaw.toFixed(3)}`);
      assert.ok(T.play.att > 0.8, `attention ${T.play.att}`);
      assert.ok(T.play.gaze, 'eyes have nothing to follow');
      T.play.remove();
      T.run(6);
      const back = headYaw(T.b, T.play);
      assert.ok(Math.abs(back) < 0.05, `head did not relax: ${back.toFixed(3)}`);
      assert.equal(T.play.pose.active, false, 'pose still installed');
      assert.equal(T.b.pose, null);
      assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets);
    });
  }

  test(`${name}: a toy waved about all over never runs the energy away`, () => {
    // the same session twice — with the toy, and with no toy at all — so a
    // hand's yank partway through is measured against itself
    const session = (withToy, yank) => {
      const T = make(name);
      T.run(1);
      const c = [...T.b.cloudC[0]];
      if (withToy) { T.play.place([c[0] + 1.5, 0, c[2] + 2], [0, 0, 1]); T.play.dragStart(T.play.target()); }
      for (let k = 0; k < 720; k++) {
        const t = k / 60;
        // a lissajous sweep round and over the animal, in and out of reach
        const p = [c[0] + 2.6 * Math.sin(t * 1.3), 0.4 + 1.6 * (1 + Math.sin(t * 2.1)), c[2] + 1.3 + 1.4 * Math.cos(t * 0.9)];
        if (withToy) {
          if (k === 300) T.play.dragEnd();               // let it go (a flick, for the ball)…
          if (k === 420) T.play.dragStart(T.play.target());   // …and pick it up again
          T.play.dragTo(p);
        }
        if (yank && k === 180) { const i = T.b.rig.clouds[0].ix[5]; T.b.grab('h', i, [T.b.x[i * 3] + 2, T.b.x[i * 3 + 1] + 2, T.b.x[i * 3 + 2]]); }
        if (yank && k === 240) T.b.release('h');
        T.run(1 / 60);
      }
      if (withToy) { T.play.dragEnd(); T.play.remove(); }
      T.run(7);
      return T;
    };
    const T = session(true, false);
    assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets, 'NaN');
    assert.ok(T.peak < tossKE(T.b) * 0.5, `peak kinetic ${T.peak.toFixed(0)}, a toss is ${tossKE(T.b).toFixed(0)}`);
    assert.ok(T.b.kinetic() < 5, `still moving after the toy went: ${T.b.kinetic()}`);
    assert.ok(T.b.cloudR[0][4] > 0.85, 'knocked over');
    assert.equal(T.b.pose, null);
    // grabbing the animal while the toy is out still works, and the toy adds
    // nothing to what the yank alone does
    const Y = session(true, true), N = session(false, true);
    assert.ok(Y.b.x.every(Number.isFinite) && !Y.b.nanResets, 'NaN with a hand in');
    assert.ok(Y.peak < N.peak * 1.25 + 500, `with the toy ${Y.peak.toFixed(0)}, without ${N.peak.toFixed(0)}`);
    assert.ok(Y.b.kinetic() < 5, `still moving: ${Y.b.kinetic()}`);
  });
}

test('fox: holds still on a feather near the floor in front → crouch, pounce, land on it, settle', () => {
  const T = make('fox');
  T.run(1.5);
  const c0 = [...T.b.cloudC[0]];
  T.play.place([c0[0] + 0.3, 0, c0[2] + 2.3], [0, 0, 1]);
  T.play.toy.top[1] = 1.75;   // the feather just off the floor
  const seen = new Set();
  T.run(6, () => { seen.add(T.play.state); return T.play.state === 'land'; });
  assert.ok(seen.has('crouch'), 'never crouched');
  assert.equal(T.play.state, 'land', `never landed (states ${[...seen]})`);
  assert.equal(T.play.count, 1);
  const F = T.play.toy.feather(), ch = T.play.chest();
  assert.ok(Math.hypot(F[0] - ch[0], F[2] - ch[2]) < 0.8, 'landed short of the feather');
  assert.ok(T.play.toy.pinned, 'not holding the feather down');
  const moved = Math.hypot(T.b.cloudC[0][0] - c0[0], T.b.cloudC[0][2] - c0[2]);
  assert.ok(moved > 0.6 && moved < 2.2, `hop of ${moved.toFixed(2)}`);
  T.play.remove();
  T.run(5);
  assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets);
  assert.ok(T.b.cloudR[0][4] > 0.95, `fell over: up·y ${T.b.cloudR[0][4].toFixed(3)}`);
  assert.ok(T.b.kinetic() < 5, `still moving: ${T.b.kinetic()}`);
  const c1 = [...T.b.cloudC[0]];
  T.run(3);
  assert.ok(Math.hypot(T.b.cloudC[0][0] - c1[0], T.b.cloudC[0][2] - c1[2]) < 0.05, 'walks off after landing');
});

test('fox: a feather swinging about, or held high, is watched but not pounced on', () => {
  const T = make('fox');
  T.run(1.5);
  const c = T.b.cloudC[0];
  T.play.place([c[0], 0, c[2] + 2.3], [0, 0, 1]);   // hanging at knee height and up
  T.run(4);
  assert.equal(T.play.count, 0);
});

test('lion: a ball rolled to a front paw is batted away from the lion', () => {
  const T = make('lion');
  T.run(1.5);
  const c0 = [...T.b.cloudC[0]];
  const leg = T.b.rig.arms[T.b.rig.toy.legs[1]], i = leg.idx[leg.idx.length - 1];
  T.play.place([T.b.x[i * 3] + 0.15, 0, T.b.x[i * 3 + 2] + 0.55], [0, 0, 1]);
  const d0 = Math.hypot(T.play.toy.x[0] - c0[0], T.play.toy.x[2] - c0[2]);
  const seen = new Set();
  T.run(3, () => { seen.add(T.play.state); return false; });
  assert.ok(seen.has('swipe'), 'never swiped');
  assert.ok(T.play.count >= 1, 'never hit the ball');
  const d1 = Math.hypot(T.play.toy.x[0] - c0[0], T.play.toy.x[2] - c0[2]);
  assert.ok(d1 > d0 + 1.5, `ball only went from ${d0.toFixed(2)} to ${d1.toFixed(2)} from the lion`);
  assert.ok(Math.hypot(T.b.cloudC[0][0] - c0[0], T.b.cloudC[0][2] - c0[2]) < 0.2, 'the lion moved');
  assert.ok(T.b.x.every(Number.isFinite) && T.play.toy.x.every(Number.isFinite));
});

test('lion: a ball dropped on the mane reports a dent there; a flick sends the ball off', () => {
  const T = make('lion');
  T.run(1.5);
  const hc = T.play.headCentre();
  T.play.place([hc[0] + 0.2, 0, hc[2] - 0.2], [0, 0, 1]);
  T.play.toy.x = [hc[0] + 0.2, hc[1] + 2.4, hc[2] - 0.2];
  T.run(1.2);
  const dent = T.play.events.find((e) => e.kind === 'dent');
  assert.ok(dent, 'no dent');
  assert.ok(dent.at.every(Number.isFinite));
  // pick it up and flick it
  T.play.dragStart(T.play.toy.x);
  const p = [hc[0] + 2, 1, hc[2] + 2];
  for (let k = 0; k < 6; k++) { p[0] += 0.12; T.play.dragTo(p); T.run(1 / 60); }
  T.play.dragEnd();
  assert.ok(T.play.toy.v[0] > 3, `flick speed ${T.play.toy.v[0]}`);
});

test('llama: a carrot held at its mouth is nibbled shorter; taken away, the neck goes back', () => {
  const T = make('llama');
  T.run(1.5);
  const neck = T.b.rig.arms[T.b.rig.toy.neck];
  const top = neck.idx[neck.idx.length - 1];
  const local = (i) => T.play.toLocal([T.b.x[i * 3] - T.b.cloudC[0][0], T.b.x[i * 3 + 1] - T.b.cloudC[0][1], T.b.x[i * 3 + 2] - T.b.cloudC[0][2]]);
  const home = local(top);
  const m = T.play.mouth();
  T.play.place([m[0] + 0.1, 0, m[2] + 0.7], [0, 0, 1]);
  const seen = new Set();
  let reached = 0;
  T.run(6, () => { seen.add(T.play.state); reached = Math.max(reached, T.play.reach.x); return false; });
  assert.ok(reached > 0.8, `neck never reached: ${reached}`);
  assert.ok(seen.has('nibble'), 'never nibbled');
  assert.ok(T.play.toy.len < 0.9 - 0.3, `carrot only ${T.play.toy.len}`);
  assert.ok(T.play.count >= 3, `${T.play.count} bites`);
  const moved = local(top);
  assert.ok(Math.hypot(moved[0] - home[0], moved[1] - home[1], moved[2] - home[2]) > 0.1, 'neck never moved');
  T.play.remove();
  T.run(6);
  const now = local(top);
  const off = Math.hypot(now[0] - home[0], now[1] - home[1], now[2] - home[2]);
  assert.ok(off < 0.08, `neck ${off.toFixed(3)} from rest`);
  assert.equal(T.play.pose.active, false);
  assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets);
  // a fresh carrot is a whole one
  T.play.place([m[0], 0, m[2] + 2], [0, 0, 1]);
  assert.equal(T.play.toy.len, 0.9);
});

test('llama: a carrot pulled out of reach — the neck springs back', () => {
  const T = make('llama');
  T.run(1.5);
  const m = T.play.mouth();
  T.play.place([m[0] + 0.1, 0, m[2] + 0.8], [0, 0, 1]);
  T.run(1.2);
  assert.ok(T.play.reach.x > 0.6);
  T.play.dragStart(T.play.toy.base);
  T.play.dragTo([m[0] + 0.1, 3, m[2] + 6]);
  T.run(3);
  assert.ok(T.play.reach.x < 0.1, `still reaching: ${T.play.reach.x}`);
});

test('wolf: the sheep is a sheep — it stands on the floor, slides to a stop, and never leaves the playpen', () => {
  const T = make('wolf');
  T.run(1.5);
  const c = [...T.b.cloudC[0]];
  T.play.place([c[0] + 2.5, 0, c[2] + 2.5], [0, 0, 1]);
  assert.equal(T.play.toy.kind, 'sheep');
  assert.equal(T.play.floorDrag, true);
  // shoved hard, it slides a little way and stops on its feet
  T.play.toy.v = [4, 0, 0];
  T.run(2);
  const t = T.play.toy;
  assert.ok(t.x[0] - (c[0] + 2.5) > 0.5 && t.x[0] - (c[0] + 2.5) < 2, `slid ${(t.x[0] - c[0] - 2.5).toFixed(2)}`);
  assert.ok(Math.hypot(...t.v) < 1e-6, 'still sliding');
  assert.ok(Math.abs(t.x[1] - 0.5) < 1e-6, `not on its feet: y ${t.x[1]}`);
  // dragged miles away, the playpen keeps it near
  T.play.dragStart(t.x);
  T.play.dragTo([c[0] + 40, 0.5, c[2] + 40]);
  T.run(2);
  T.play.dragEnd();
  T.run(2);
  assert.ok(Math.hypot(t.x[0] - T.b.cloudC[0][0], t.x[2] - T.b.cloudC[0][2]) <= 7 + 1e-6);
  assert.ok(t.x.every(Number.isFinite) && t.v.every(Number.isFinite));
});

test('wolf: a sheep led away by hand — he creeps after it a little, low and slow, and stops', () => {
  const T = make('wolf');
  T.run(1.5);
  const c0 = [...T.b.cloudC[0]];
  T.play.place([c0[0] + 0.2, 0, c0[2] + 2.2], [0, 0, 1]);
  T.play.dragStart(T.play.toy.x);
  for (let k = 1; k <= 60; k++) { T.play.dragTo([c0[0] + 0.2 + 0.03 * k, 0.5, c0[2] + 2.2 + 0.04 * k]); T.run(1 / 60); }
  T.play.dragEnd();
  const S = [...T.play.toy.x];
  const seen = new Set();
  let low = 0;
  T.run(9, () => { seen.add(T.play.state); if (T.play.state === 'creep') low = Math.max(low, T.play.crouch.x); return false; });
  assert.ok(seen.has('creep'), `never crept (states ${[...seen]})`);
  assert.ok(low > 0.08, `not low: crouch ${low.toFixed(3)}`);
  const c1 = T.b.cloudC[0];
  const before = Math.hypot(S[0] - c0[0], S[2] - c0[2]), after = Math.hypot(S[0] - c1[0], S[2] - c1[2]);
  assert.ok(before - after > 0.6, `only closed ${(before - after).toFixed(2)} on the sheep`);
  const went = Math.hypot(c1[0] - c0[0], c1[2] - c0[2]);
  assert.ok(went < 2.6, `went ${went.toFixed(2)}: too far`);
  assert.ok(after > 1.6, `walked into the sheep: ${after.toFixed(2)}`);
  assert.ok(T.b.cloudR[0][4] > 0.95, `fell over: ${T.b.cloudR[0][4].toFixed(3)}`);
  assert.ok(T.peak < tossKE(T.b) * 0.5, `peak ${T.peak.toFixed(0)}`);
  // stopped: sitting, watching (the tail still going), not walking on
  const cs = [...c1];
  T.run(2);
  assert.ok(Math.hypot(T.b.cloudC[0][0] - cs[0], T.b.cloudC[0][2] - cs[2]) < 0.05, 'still walking');
  assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets);
  // led further and further off: the leash holds
  for (let r = 0; r < 4; r++) {
    const t = T.play.toy, c = T.b.cloudC[0];
    T.play.dragStart(t.x);
    for (let k = 1; k <= 40; k++) { T.play.dragTo([t.x[0] + 0.1, 0.5, c[2] + 6.4]); T.run(1 / 60); }
    T.play.dragEnd();
    T.run(8);
  }
  const far = Math.hypot(T.b.cloudC[0][0] - c0[0], T.b.cloudC[0][2] - c0[2]);
  assert.ok(far < 2.8, `crept ${far.toFixed(2)} from where he sat: off the stage`);
  assert.ok(T.b.cloudR[0][4] > 0.95);
});

test('wolf: a sheep left still within reach gets a gentle nose-boop — it scoots, nothing runs away', () => {
  const T = make('wolf');
  T.run(1.5);
  const c0 = [...T.b.cloudC[0]];
  T.play.place([c0[0] + 0.1, 0, c0[2] + 1.6], [0, 0, 1]);
  const s0 = [...T.play.toy.x];
  const seen = new Set();
  let low = 9, sheepPeak = 0;
  T.run(5, () => {
    seen.add(T.play.state);
    if (T.play.state === 'boop') low = Math.min(low, T.play.nose()[1]);
    sheepPeak = Math.max(sheepPeak, Math.hypot(...T.play.toy.v));
    return T.play.count > 0 && T.play.state === 'cool';
  });
  assert.ok(seen.has('boop'), `never booped (states ${[...seen]})`);
  assert.equal(T.play.count, 1);
  assert.ok(low < 1.3, `the head never dipped: nose at ${low.toFixed(2)}`);
  T.run(2);
  const s1 = T.play.toy.x;
  const away = Math.hypot(s1[0] - c0[0], s1[2] - c0[2]) - Math.hypot(s0[0] - c0[0], s0[2] - c0[2]);
  assert.ok(away > 0.15 && away < 1.2, `the sheep scooted ${away.toFixed(2)}`);
  assert.ok(sheepPeak < 4, `sheep flew off at ${sheepPeak.toFixed(2)}`);
  assert.ok(Math.abs(s1[1] - 0.5) < 0.02, 'sheep not back on its feet');
  assert.ok(T.play.toy.x.every(Number.isFinite) && T.play.toy.v.every(Number.isFinite));
  assert.ok(T.b.x.every(Number.isFinite) && !T.b.nanResets, 'NaN');
  assert.ok(T.peak < tossKE(T.b) * 0.5, `peak kinetic ${T.peak.toFixed(0)}`);
  assert.ok(T.b.cloudR[0][4] > 0.95, `fell over: ${T.b.cloudR[0][4].toFixed(3)}`);
  assert.ok(Math.hypot(T.b.cloudC[0][0] - c0[0], T.b.cloudC[0][2] - c0[2]) < 0.4, 'the boop walked him off');
  T.play.remove();
  T.run(6);
  assert.ok(T.b.kinetic() < 5);
  assert.equal(T.b.pose, null);
});
