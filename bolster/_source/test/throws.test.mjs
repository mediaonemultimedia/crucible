/* The throws pass: one input (O+P), the direction picked from the stage —
   the victim always goes toward the side with more room, measured from the
   middle of the two of them. In front of the thrower: the forward throw; behind
   him: the over-the-shoulder (back) throw, which swaps their sides. A tie
   (dead centre) throws forward. Both: the same damage, a long flight, a soft
   bounce, a knockdown, no guaranteed follow-up. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, clone, hash, hurtBox, throwDir, throwOut, TECH, STAGE, DOWN_T } from '../src/sim/sim.js';
import { LIGHT, HEAVY, BLOCK } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, TOSS } from '../src/fighters/index.js';
import { CPU } from '../src/ai/cpu.js';

const OP = LIGHT | HEAVY;

/* p1 (the thrower) at x1, p2 at x2, both facing each other */
function setup(p1, p2, x1, x2, seed = 3) {
  const st = createMatch({ p1, p2, seed });
  st.phase = 'fight'; st.pt = 0;
  st.f[0].x = x1; st.f[1].x = x2;
  st.f[0].face = Math.sign(x2 - x1); st.f[1].face = -st.f[0].face;
  return st;
}
const gap = (a, b) => ((FIGHTERS[a].push.w + FIGHTERS[b].push.w) >> 1) + 200;

/* p1 throws (O+P on tick 0); returns what happened */
function throwAt(p1, p2, mid, side, { defend = () => 0, n = 160 } = {}) {
  const d = gap(p1, p2);
  // side +1: the thrower on the left of the victim (facing right)
  const st = setup(p1, p2, mid - side * (d >> 1), mid + side * (d - (d >> 1)));
  const face0 = st.f[0].face, hp = st.f[1].hp;
  const evs = [];
  let grab = null, toss = null, rel = null;
  for (let i = 0; i < n; i++) {
    stepInPlace(st, i === 0 ? OP : 0, defend(i, st));
    for (const e of st.ev) {
      evs.push({ ...e, i });
      if (e.k === 'grab' && e.p === 0) grab = { ...e, i, td: st.f[0].td };
      if (e.k === 'hit' && e.p === 0 && e.thr) { toss = { ...e, i }; rel = { tx: st.f[0].x, vx: st.f[1].x, vy: st.f[1].y }; }
    }
  }
  return { st, evs, grab, toss, rel, face0, dmg: hp - st.f[1].hp };
}

test('direction: always toward the roomier side, from both facings and both halves of the stage', () => {
  for (const [a, b] of [['kevalanche', 'johnny'], ['k8e', 'zach'], ['zach', 'k8e'], ['sumaura', 'rubberta']]) {
    for (const mid of [-5000, -2000, 2000, 5000]) for (const side of [1, -1]) {
      const r = throwAt(a, b, mid, side);
      assert.ok(r.grab && r.toss, `${a} v ${b} @${mid} side ${side}: thrown`);
      const want = mid < 0 ? 1 : -1;                         // the roomier wall
      assert.equal(r.grab.td, want, `${a} v ${b} @${mid} side ${side}: goes to the open side`);
      const back = want !== r.face0;
      assert.equal(r.grab.back, back ? 1 : 0, `${a} v ${b} @${mid} side ${side}: ${back ? 'back' : 'forward'} throw`);
      // the victim ends up on the open side of the thrower, well away
      assert.equal(Math.sign(r.st.f[1].x - r.st.f[0].x), want, 'landed on the open side');
      assert.ok(Math.abs(r.st.f[1].x - r.st.f[0].x) >= 4000, `space: ${Math.abs(r.st.f[1].x - r.st.f[0].x)}`);
    }
  }
});

test('back throw: carries him over the shoulder — the two swap sides', () => {
  for (const a of ROSTER) {
    // the thrower in the right half facing right, toward the near wall: the room is behind him
    const r = throwAt(a, 'johnny', 3000, 1);
    assert.equal(r.grab.back, 1, `${a}: a back throw`);
    assert.equal(Math.sign(r.rel.vx - r.rel.tx), -1, `${a}: let go of behind him`);
    assert.equal(Math.abs(r.rel.vx - r.rel.tx), throwOut(r.st.f[0], r.st.f[1]), `${a}: let go of just past touching`);
    assert.ok(r.rel.vy > 0, `${a}: up off the floor`);
    assert.ok(r.st.f[1].x < r.st.f[0].x, `${a}: sides swapped`);
    // and once he's free again he turns round to face the one he threw
    assert.equal(r.st.f[0].face, -1, `${a}: turned to face him`);
  }
});

test('forward throw: in front, no side swap', () => {
  for (const a of ROSTER) {
    const r = throwAt(a, 'sumaura', -3000, 1);
    assert.equal(r.grab.back, 0, `${a}: forward`);
    assert.ok(r.st.f[1].x > r.st.f[0].x, `${a}: still on his side`);
  }
});

test('tie: dead centre throws forward, both facings', () => {
  for (const side of [1, -1]) {
    const st = setup('kevalanche', 'k8e', -side * 1000, side * 1000);
    assert.equal(throwDir(st.f[0], st.f[1]), st.f[0].face);
    // the throw point dead on 0
    const h = gap('kevalanche', 'zach') >> 1;
    const s2 = setup('kevalanche', 'zach', -side * h, side * h);
    const evs = [];
    for (let i = 0; i < 40; i++) { stepInPlace(s2, i === 0 ? OP : 0, 0); evs.push(...s2.ev); }
    const g = evs.find((e) => e.k === 'grab');
    assert.ok(g, 'grabbed'); assert.equal(g.back, 0, 'forward on a tie');
    assert.equal(s2.f[0].td, side);
  }
});

test('the same damage both ways', () => {
  for (const a of ROSTER) {
    const f = throwAt(a, 'kevalanche', -3000, 1), b = throwAt(a, 'kevalanche', 3000, 1);
    assert.equal(f.grab.back, 0); assert.equal(b.grab.back, 1);
    assert.equal(f.dmg, b.dmg, `${a}: ${f.dmg} v ${b.dmg}`);
    assert.ok(f.dmg > 0);
  }
});

test('walls: nobody ends outside the stage or inside a wall, either throw', () => {
  for (const a of ROSTER) for (const b of ['zach', 'sumaura', 'k8e']) {
    for (const [mid, side] of [[STAGE - 1200, 1], [STAGE - 1200, -1], [-STAGE + 1200, 1], [-STAGE + 1200, -1], [STAGE - 3000, 1], [-STAGE + 3000, -1]]) {
      const r = throwAt(a, b, mid, side, { n: 200 });
      const d = gap(a, b);
      const x1 = mid - side * (d >> 1);
      if (Math.abs(x1) > STAGE) continue;
      assert.ok(r.toss, `${a} v ${b} @${mid}/${side}`);
      let worst = 0;
      for (const f of r.st.f) worst = Math.max(worst, Math.abs(f.x));
      assert.ok(worst <= STAGE, `${a} v ${b} @${mid}/${side}: inside`);
      // near a wall it always goes away from that wall
      assert.equal(Math.sign(r.st.f[1].x - r.st.f[0].x), mid > 0 ? -1 : 1);
    }
  }
  // stepped every tick: never outside, during the flight too
  const st = setup('k8e', 'zach', STAGE - 2500, STAGE - 600);
  for (let i = 0; i < 200; i++) { stepInPlace(st, i === 0 ? OP : 0, 0); for (const f of st.f) assert.ok(Math.abs(f.x) <= STAGE); }
});

test('techs: O+P in the window escapes both throws; too late it doesn\'t', () => {
  for (const a of ROSTER) for (const mid of [-3000, 3000]) {
    let gi = -1;
    const hit = throwAt(a, 'kevalanche', mid, 1, { defend: (i, s) => { if (gi < 0 && s.f[1].act === 'grabbed') gi = i; return gi >= 0 && i === gi + 5 ? OP : 0; } });
    assert.ok(hit.evs.some((e) => e.k === 'tech'), `${a} @${mid}: teched`);
    assert.equal(hit.dmg, 0);
    gi = -1;
    const late = throwAt(a, 'kevalanche', mid, 1, { defend: (i, s) => { if (gi < 0 && s.f[1].act === 'grabbed') gi = i; return gi >= 0 && i === gi + TECH + 3 ? OP : 0; } });
    assert.ok(!late.evs.some((e) => e.k === 'tech'), `${a} @${mid}: too late`);
    assert.ok(late.dmg > 0);
  }
});

test('no guaranteed follow-up: the thrown one is never hittable until he can act, and lands far off', () => {
  for (const a of ROSTER) for (const mid of [-3000, 3000]) {
    const d = gap(a, 'johnny');
    const st = setup(a, 'johnny', mid - (d >> 1), mid + d - (d >> 1));
    let tossed = -1, bounced = 0, freeAt = -1;
    for (let i = 0; i < 260; i++) {
      // the thrower mashes everything after the toss; the thrown one does nothing
      const atk = i === 0 ? OP : tossed >= 0 ? [LIGHT, HEAVY, OP][i % 3] : 0;
      stepInPlace(st, atk, 0);
      for (const e of st.ev) { if (e.k === 'hit' && e.p === 0 && e.thr) tossed = i; if (e.k === 'bounce' && e.p === 1) bounced++; }
      const v = st.f[1];
      if (tossed >= 0 && freeAt < 0) {
        assert.ok(!st.ev.some((e) => e.k === 'hit' && e.p === 0 && !e.thr), `${a} @${mid}: hit him while he was helpless (tick ${i})`);
        if (v.act === 'down' || v.act === 'getup') assert.equal(hurtBox(v), null);
        if (v.act === 'idle' || v.act === 'guard' || v.act === 'walkF' || v.act === 'walkB') freeAt = i;
      }
    }
    assert.ok(tossed > 0 && freeAt > tossed, `${a} @${mid}: back up`);
    assert.equal(bounced, 1, `${a} @${mid}: one soft bounce`);
    assert.ok(freeAt - tossed >= DOWN_T + 30, 'a real knockdown');
  }
});

test('the thrower keeps his recovery: 20 ticks after the toss', () => {
  for (const a of ROSTER) {
    const m = FIGHTERS[a].moves.throwHold;
    assert.equal(m.hits[0].from, TOSS);
    assert.equal(m.total - TOSS, 20);
  }
});

test('determinism and rollback through both throws', () => {
  for (const mid of [-3000, 3000]) {
    const run = () => throwAt('k8e', 'zach', mid, 1, { n: 120 }).st;
    assert.equal(hash(run()), hash(run()));
    const d = gap('k8e', 'zach');
    const st = setup('k8e', 'zach', mid - (d >> 1), mid + d - (d >> 1));
    let snap = null;
    for (let i = 0; i < 120; i++) { if (i === 15) snap = clone(st); stepInPlace(st, i === 0 ? OP : 0, 0); }
    for (let i = 15; i < 120; i++) stepInPlace(snap, 0, 0);
    assert.equal(hash(snap), hash(st));
    assert.equal(hash(JSON.parse(JSON.stringify(st))), hash(st));
  }
});

test('the CPU throws at every level when close, and uses both directions', () => {
  for (const lv of ['easy', 'normal', 'hard']) {
    let thr = 0, back = 0, fwd = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const st = createMatch({ p1: ROSTER[seed % ROSTER.length], p2: ROSTER[(seed * 3) % ROSTER.length], seed });
      const a = new CPU(0, lv, seed * 3 + 1), b = new CPU(1, lv, seed * 5 + 2);
      for (let i = 0; i < 60 * 90 && st.phase !== 'end'; i++) {
        stepInPlace(st, a.input(st), b.input(st));
        for (const e of st.ev) if (e.k === 'grab' && e.throw) { thr++; if (e.back) back++; else fwd++; }
      }
    }
    assert.ok(thr > 0, `${lv}: throws`);
    if (lv !== 'easy') assert.ok(back > 0 && fwd > 0, `${lv}: both directions (${fwd} fwd, ${back} back)`);
  }
});
