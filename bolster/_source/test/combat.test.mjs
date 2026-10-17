/* The combat pass: E blocks (and back doesn't), pushback, frame advantage
   (a blocked heavy is punished by a light), throws and techs, counter-hits,
   chains with an amplified finisher, damage scaling, repetition decay, the
   light lockout, the K.O. cinematic (deterministic, fixed length, rollback
   safe), and the anti-mash test: walking forward mashing loses to Normal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, clone, hash, TECH, LOCK, KO_SEQ, KO_FINAL, KO_AFTER, koScale } from '../src/sim/sim.js';
import { LEFT, RIGHT, DOWN, LIGHT, HEAVY, BLOCK } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, frameData } from '../src/fighters/index.js';
import { CPU } from '../src/ai/cpu.js';
import { masher } from '../src/ai/masher.js';

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
/* fighters standing just inside a light's reach of each other */
const near = (a, b) => {
  const r = FIGHTERS[a].moves.light.hits[0].box, reach = r.x + r.w;
  const touch = (FIGHTERS[a].push.w + FIGHTERS[b].push.w) >> 1;
  return Math.max(touch + 50, reach + FIGHTERS[b].hurt.stand.x + FIGHTERS[b].hurt.stand.w - 450);
};
const BTN = { light: LIGHT, heavy: HEAVY, lowLight: DOWN | LIGHT, signature: DOWN | HEAVY };

/* a chain, driven like a player: each next button pressed (one tick) once
   the current move has made contact and its active frames are over */
function chain(st, seq, k = 0, n = 90, defend = 0) {
  let i = 0, evs = [], last = 0;
  for (let tick = 0; tick < n; tick++) {
    const f = st.f[k];
    let m = 0;
    if (i === 0) m = BTN[seq[i++]];
    else if (i < seq.length && f.act === 'attack' && f.hm && last === 0) {
      const mv = FIGHTERS[f.id].moves[f.mv];
      if (f.mv === seq[i - 1] && f.t > mv.hits[mv.hits.length - 1].to) m = BTN[seq[i++]];
    }
    last = m;
    stepInPlace(st, k === 0 ? m : defend, k === 0 ? defend : m);
    evs.push(...st.ev.map((e) => ({ ...e, tick, act: st.f[1 - k].act })));
  }
  return evs;
}

/* ── E ──────────────────────────────────────────────────────────────────── */

test('E holds him in place: no walking, jumping or dashing while blocking', () => {
  const st = fight('johnny', 'kevalanche');
  const x = st.f[1].x;
  go(st, 40, (i) => [0, BLOCK | (i % 2 ? RIGHT : LEFT) | (i === 5 ? 4 : 0)]);
  assert.equal(st.f[1].x, x);
  assert.equal(st.f[1].act, 'guard');
  assert.equal(st.f[1].y, 0);
});

test('crouching E blocks lows and mids but not overheads; standing E blocks overheads but not lows', () => {
  for (const id of ROSTER) {
    const lo = fight(id, 'kevalanche', { x1: -near(id, 'kevalanche') / 2, x2: near(id, 'kevalanche') / 2 });
    const e1 = go(lo, 20, (i) => [(i === 2 ? LIGHT : 0) | DOWN, BLOCK | DOWN]);
    assert.ok(e1.some((e) => e.k === 'block' && e.low), `${id}: crouch E blocks the low`);
    const lo2 = fight(id, 'kevalanche', { x1: -near(id, 'kevalanche') / 2, x2: near(id, 'kevalanche') / 2 });
    const e2 = go(lo2, 20, (i) => [(i === 2 ? LIGHT : 0) | DOWN, BLOCK]);
    assert.ok(e2.some((e) => e.k === 'hit' && e.p === 0), `${id}: standing E doesn't stop the low`);
  }
});

/* ── pushback ───────────────────────────────────────────────────────────── */

test('pushback: a blocked hit pushes both apart; a string of blocked lights drifts out of range', () => {
  const st = fight('kevalanche', 'sumaura', { x1: -800, x2: 800 });
  const x0 = st.f[0].x, y0 = st.f[1].x;
  let evs = go(st, 30, (i) => [i === 0 ? LIGHT : 0, BLOCK]);
  assert.ok(evs.some((e) => e.k === 'block'));
  assert.ok(st.f[0].x < x0, 'the attacker is pushed back too');
  assert.ok(st.f[1].x > y0, 'the blocker slides back');
  // keep jabbing a blocker without walking: soon nothing reaches
  const st2 = fight('kevalanche', 'sumaura', { x1: -800, x2: 800 });
  evs = go(st2, 240, (i) => [i % 16 === 0 ? LIGHT : 0, BLOCK]);
  const blocks = evs.filter((e) => e.k === 'block').length;
  assert.ok(blocks >= 2 && blocks <= 5, `blocked ${blocks} then out of range`);
});

/* ── frame advantage ────────────────────────────────────────────────────── */

test('frame data: lights are safe on block; heavies, signatures and slams are punishable', () => {
  for (const id of ROSTER) {
    const M = FIGHTERS[id].moves, adv = (m) => m.hits[m.hits.length - 1].blockstun - frameData(m).recovery;
    assert.ok(adv(M.light) >= -2 && adv(M.light) <= 1, `${id} light ${adv(M.light)}`);
    assert.ok(adv(M.lowLight) >= -2, `${id} low ${adv(M.lowLight)}`);
    assert.ok(adv(M.heavy) <= -6, `${id} heavy ${adv(M.heavy)}`);
    if (M.signature.hits.length) assert.ok(adv(M.signature) <= -6, `${id} signature ${adv(M.signature)}`);
  }
});

test('a blocked heavy is punished by a light, every pairing', () => {
  for (const a of ROSTER) for (const b of ROSTER) {
    // the heavy's own spacing: it reaches, from just outside the jab
    const st = fight(a, b, { x1: -1300, x2: 1300 });
    let punished = false, blocked = false;
    for (let i = 0; i < 70 && !punished; i++) {
      const d = st.f[1];
      const out = d.act === 'blockstun' && d.stun <= 2 ? LIGHT : blocked && d.act !== 'blockstun' ? LIGHT : BLOCK;
      stepInPlace(st, i === 0 ? HEAVY : 0, out);
      for (const e of st.ev) {
        if (e.k === 'block' && e.p === 0) blocked = true;
        if (e.k === 'hit' && e.p === 1) { punished = true; assert.equal(st.f[0].act === 'hitstun' || st.f[0].act === 'down', true); }
      }
    }
    assert.ok(blocked, `${a} heavy blocked by ${b}`);
    assert.ok(punished, `${b} punishes ${a}'s blocked heavy with a light`);
  }
});

test('a whiffed heavy leaves him open longer than a heavy that made contact', () => {
  const st = fight('sumaura', 'kevalanche', { x1: -4500, x2: 4500 });
  let n = 0;
  go(st, 80, (i) => { if (st.f[0].act === 'attack') n++; return [i === 0 ? HEAVY : 0, 0]; });
  assert.equal(n, FIGHTERS.sumaura.moves.heavy.total + FIGHTERS.sumaura.moves.heavy.whiffLag);
});

test('footsies: walking forward into a well-spaced heavy gets hit', () => {
  for (const id of ROSTER) {
    const R = FIGHTERS[id].moves.heavy.hits[0].box;
    const st = fight(id, 'johnny', { x1: -2000, x2: 2000 });
    const evs = go(st, 40, (i) => [i === 0 ? HEAVY : 0, LEFT]);
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0), `${id}: the heavy (${R.x + R.w}) catches him walking in`);
  }
});

/* ── throws ─────────────────────────────────────────────────────────────── */

test('throw (O+P): beats a blocker holding E; teched by O+P in the window; not after it', () => {
  for (const a of ROSTER) {
    const b = 'kevalanche';
    const d = ((FIGHTERS[a].push.w + FIGHTERS[b].push.w) >> 1) + 200;
    // beats E
    let st = fight(a, b, { x1: -d / 2, x2: d / 2 });
    const hp = st.f[1].hp;
    let evs = go(st, 70, (i) => [i === 0 ? LIGHT | HEAVY : 0, BLOCK]);
    assert.ok(evs.some((e) => e.k === 'grab' && e.p === 0 && e.throw), `${a}: grabs the blocker`);
    assert.ok(evs.some((e) => e.k === 'hit' && e.p === 0 && e.thr), `${a}: tosses him`);
    assert.ok(st.f[1].hp < hp, `${a}: the throw does damage`);
    assert.ok(!evs.some((e) => e.k === 'block'), `${a}: a throw can't be blocked`);
    // teched
    st = fight(a, b, { x1: -d / 2, x2: d / 2 });
    let gi = -1;
    evs = go(st, 70, (i, s) => {
      if (gi < 0 && s.f[1].act === 'grabbed') gi = i;
      return [i === 0 ? LIGHT | HEAVY : 0, gi >= 0 && i === gi + 4 ? LIGHT | HEAVY : 0];
    });
    assert.ok(evs.some((e) => e.k === 'tech'), `${a}: teched`);
    assert.equal(st.f[1].hp, hp, `${a}: no damage through a tech`);
    // too late
    st = fight(a, b, { x1: -d / 2, x2: d / 2 });
    gi = -1;
    evs = go(st, 70, (i, s) => {
      if (gi < 0 && s.f[1].act === 'grabbed') gi = i;
      return [i === 0 ? LIGHT | HEAVY : 0, gi >= 0 && i === gi + TECH + 3 ? LIGHT | HEAVY : 0];
    });
    assert.ok(!evs.some((e) => e.k === 'tech'), `${a}: too late to tech`);
    assert.ok(st.f[1].hp < hp);
  }
});

test('throw: out of reach it whiffs; a fighter in blockstun can\'t be thrown', () => {
  let st = fight('johnny', 'sumaura', { x1: -1800, x2: 1800 });
  let evs = go(st, 40, (i) => [i === 0 ? LIGHT | HEAVY : 0, 0]);
  assert.ok(!evs.some((e) => e.k === 'grab'));
  st = fight('johnny', 'sumaura', { x1: -700, x2: 700 });
  st.f[1].act = 'blockstun'; st.f[1].stun = 30;
  evs = go(st, 10, (i) => [i === 0 ? LIGHT | HEAVY : 0, BLOCK]);
  assert.ok(!evs.some((e) => e.k === 'grab'));
});

/* ── counter-hits ───────────────────────────────────────────────────────── */

test('counter-hit: a light into the startup of his heavy does more and stuns longer', () => {
  const plain = fight('kevalanche', 'johnny');
  let evs = go(plain, 12, (i) => [i === 0 ? LIGHT : 0, 0]);
  const h0 = evs.find((e) => e.k === 'hit' && e.p === 0);
  assert.ok(h0 && !h0.ctr);
  const stun0 = plain.f[1].stun;
  const st = fight('kevalanche', 'johnny');
  evs = go(st, 12, (i) => [i === 2 ? LIGHT : 0, i === 0 ? HEAVY : 0]);
  const h = evs.find((e) => e.k === 'hit' && e.p === 0);
  assert.ok(h && h.ctr, 'COUNTER');
  assert.ok(h.dmg > h0.dmg, `${h.dmg} > ${h0.dmg}`);
  assert.ok(st.f[1].stun > stun0, 'longer hitstun');
});

/* ── combos ─────────────────────────────────────────────────────────────── */

test('light → light → heavy: a true combo for every fighter on every opponent, the finisher amplified', () => {
  for (const a of ROSTER) for (const b of ROSTER) {
    const st = fight(a, b, { x1: -near(a, b) / 2, x2: near(a, b) / 2 });
    const evs = chain(st, ['light', 'light', 'heavy']);
    const hits = evs.filter((e) => e.k === 'hit' && e.p === 0);
    assert.equal(hits.length, 3, `${a} on ${b}: ${hits.length} hits`);
    assert.deepEqual(hits.map((e) => e.n), [1, 2, 3], `${a} on ${b}: a true combo (never out of hitstun)`);
    assert.ok(hits[2].amp && !hits[0].amp && !hits[1].amp, `${a} on ${b}: the finisher is amplified`);
  }
});

test('chains: light → heavy, crouch light → signature (S+P), heavy → signature', () => {
  for (const a of ['kevalanche', 'rubberta', 'sumaura']) {
    let st = fight(a, 'johnny', { x1: -near(a, 'johnny') / 2, x2: near(a, 'johnny') / 2 });
    let hits = chain(st, ['light', 'heavy']).filter((e) => e.k === 'hit' && e.p === 0);
    assert.equal(hits.length, 2, `${a} L→H`);
    assert.ok(hits[1].amp && hits[1].n === 2);
    st = fight(a, 'johnny', { x1: -near(a, 'johnny') / 2, x2: near(a, 'johnny') / 2 });
    hits = chain(st, ['lowLight', 'signature']).filter((e) => e.k === 'hit' && e.p === 0);
    assert.equal(hits.length, 2, `${a} cL→S+P`);
    assert.ok(hits[1].amp);
  }
  // heavy → signature: the cancel happens (on block too)
  const st = fight('kevalanche', 'johnny', { x1: -1100, x2: 1100 });
  const evs = chain(st, ['heavy', 'signature'], 0, 80, BLOCK);
  assert.ok(evs.some((e) => e.k === 'signature' && e.p === 0), 'heavy cancels into the uppercut');
});

test('the amplified finisher does more damage and builds extra meter', () => {
  const a = 'kevalanche', b = 'johnny';
  const st = fight(a, b, { x1: -near(a, b) / 2, x2: near(a, b) / 2 });
  const hits = chain(st, ['light', 'light', 'heavy']).filter((e) => e.k === 'hit' && e.p === 0);
  const plain = fight(a, b, { x1: -1300, x2: 1300 });
  const p = go(plain, 40, (i) => [i === 0 ? HEAVY : 0, 0]).find((e) => e.k === 'hit' && e.p === 0);
  assert.ok(hits[2].dmg > p.dmg * 1.2, `amplified ${hits[2].dmg} vs ${p.dmg}`);
  const gained = st.f[0].meter, sum = hits.reduce((s, e) => s + e.dmg, 0);
  assert.ok(gained > Math.trunc(sum * 0.9) + 80, `meter ${gained} for ${sum} damage`);
  assert.equal(st.f[1].act === 'down' || st.f[1].act === 'getup', true, 'knocked down');
});

test('damage scaling: hits after the third do less', () => {
  const dmgAt = (combo) => {
    const st = fight('kevalanche', 'johnny');
    st.f[1].combo = combo; st.f[1].act = 'hitstun'; st.f[1].stun = 30;
    return go(st, 12, (i) => [i === 0 ? LIGHT : 0, 0]).find((e) => e.k === 'hit').dmg;
  };
  assert.equal(dmgAt(0), dmgAt(2));
  assert.ok(dmgAt(3) < dmgAt(2) && dmgAt(5) < dmgAt(3));
  assert.ok(dmgAt(8) >= Math.trunc(dmgAt(0) * 0.4));
});

test('repetition decay: the same light again and again does less; a different one is full', () => {
  const st = fight('kevalanche', 'sumaura', { x1: -800, x2: 800 });
  const d = [];
  for (let r = 0; r < 4; r++) {
    st.f[0].x = -800; st.f[1].x = 800;
    const e = go(st, 30, (i) => [i === 0 ? LIGHT : 0, 0]).find((x) => x.k === 'hit');
    d.push(e.dmg);
  }
  assert.ok(d[1] < d[0] && d[2] < d[1] && d[3] <= d[2], d.join(' '));
  st.f[0].x = -800; st.f[1].x = 800;
  const low = go(st, 30, (i) => [i === 0 ? LIGHT | DOWN : DOWN, 0]).find((x) => x.k === 'hit');
  assert.equal(low.dmg, FIGHTERS.kevalanche.moves.lowLight.hits[0].dmg);
});

test('light lockout: after a string of three, a fourth light waits', () => {
  const st = fight('kevalanche', 'sumaura', { x1: -800, x2: 800 });
  const starts = [];
  go(st, 90, (i, s) => { if (s.f[0].act === 'attack' && s.f[0].t === 0 && s.f[0].mv === 'light') starts.push(i); return [i % 3 === 0 ? LIGHT : 0, 0]; });
  assert.ok(starts.length >= 4, starts.join(','));
  // the gap before the fourth is the lockout's
  assert.ok(starts[3] - starts[2] >= LOCK - 2, `gap ${starts[3] - starts[2]}`);
  assert.ok(starts[1] - starts[0] < 20 && starts[2] - starts[1] < 20);
});

/* ── the K.O. cinematic ─────────────────────────────────────────────────── */

function koRun(seed = 3, { final = false, p1 = 'kevalanche', p2 = 'johnny' } = {}) {
  const st = fight(p1, p2, { seed });
  if (final) st.wins = [1, 0];
  st.f[1].hp = 1;
  const trace = [];
  const evs = go(st, (final ? KO_FINAL : KO_SEQ).len + 30, (i, s) => { trace.push([s.f[1].x, s.f[1].y, s.ks, s.f[1].kr]); return [i === 0 ? HEAVY : 0, 0]; });
  return { st, evs, trace };
}

test('K.O.: the launch plays once, a fixed length, frozen then slow then full speed', () => {
  const { st, evs, trace } = koRun();
  assert.equal(evs.filter((e) => e.k === 'ko').length, 1);
  assert.equal(evs.filter((e) => e.k === 'koflash').length, 1);
  assert.equal(evs.filter((e) => e.k === 'kobounce').length, 1, 'one bounce');
  assert.equal(evs.filter((e) => e.k === 'kobanner').length, 1, 'then the banner');
  const ko = evs.find((e) => e.k === 'ko'), bn = evs.find((e) => e.k === 'kobanner'), bo = evs.find((e) => e.k === 'kobounce');
  assert.equal(bn.i - ko.i, KO_SEQ.banner + 1);
  assert.ok(bo.i < bn.i, 'it lands before the banner');
  // the schedule
  assert.equal(koScale(KO_SEQ, 0), 0);
  assert.equal(koScale(KO_SEQ, KO_SEQ.freeze), 25);
  assert.equal(koScale(KO_SEQ, KO_SEQ.freeze + KO_SEQ.slow + KO_SEQ.ramp), 100);
  // up high, and back from where he was hit
  const ys = trace.slice(ko.i).map((t) => t[1]);
  assert.ok(Math.max(...ys) > 3000, `apex ${Math.max(...ys)}`);
  assert.ok(trace[ko.i + 60][0] > trace[ko.i][0], 'launched away from the hitter');
  // inputs are ignored through it
  assert.equal(st.f[1].act, 'ko'); assert.equal(st.f[1].y, 0);
  assert.ok(st.kt === st.kn);
});

test('K.O.: the trajectory is deterministic per seed; the match-winner is longer and higher', () => {
  const a = koRun(11), b = koRun(11);
  assert.deepEqual(a.trace, b.trace);
  assert.equal(hash(a.st), hash(b.st));
  const f = koRun(11, { final: true });
  assert.ok(KO_FINAL.len > KO_SEQ.len && KO_FINAL.slow > KO_SEQ.slow);
  assert.ok(Math.max(...f.trace.map((t) => t[1])) > Math.max(...a.trace.map((t) => t[1])), 'higher');
  const koF = f.evs.find((e) => e.k === 'ko');
  assert.ok(koF.final);
  assert.equal(f.evs.find((e) => e.k === 'kobanner').i - koF.i, KO_FINAL.banner + 1);
  // and the match ends after it
  go(f.st, KO_FINAL.len + KO_AFTER + 10);
  assert.equal(f.st.phase, 'end');
});

test('K.O.: no launch on a time-out', () => {
  const st = fight('rubberta', 'k8e');
  st.timer = 3; st.f[0].hp = 500; st.f[1].hp = 600;
  const evs = go(st, 120);
  assert.equal(st.phase, 'time');
  assert.ok(!evs.some((e) => e.k === 'koflash' || e.k === 'kobounce'));
  assert.equal(st.kn, 0);
  assert.equal(st.f[0].y, 0);
});

test('K.O.: rolling back across the K.O. tick resimulates the identical sequence', () => {
  const st = fight('sumaura', 'rubberta', { seed: 21 });
  st.f[1].hp = 1;
  const inputs = Array.from({ length: 300 }, (_, i) => [i === 0 ? HEAVY : i % 7 === 0 ? LIGHT : 0, i % 5 === 0 ? RIGHT : 0]);
  const snaps = [];
  for (let i = 0; i < 300; i++) { snaps.push(clone(st)); stepInPlace(st, ...inputs[i]); }
  const koTick = snaps.findIndex((s) => s.phase === 'ko');
  assert.ok(koTick > 0);
  for (const from of [koTick - 3, koTick - 1, koTick + 20]) {
    const r = clone(snaps[from]);
    for (let i = from; i < 300; i++) stepInPlace(r, ...inputs[i]);
    assert.equal(hash(r), hash(st), `from ${from}`);
    const j = JSON.parse(JSON.stringify(snaps[from]));
    for (let i = from; i < 300; i++) stepInPlace(j, ...inputs[i]);
    assert.equal(hash(j), hash(st), `JSON round trip from ${from}`);
  }
});

test('K.O.: a Fluffatality bursts at the peak of the arc', () => {
  const st = fight('kevalanche', 'johnny', { seed: 3 });
  st.wins = [1, 0]; st.f[1].hp = 1; st.f[0].meter = 1000;
  let found = false;
  for (let seed = 1; seed < 400 && !found; seed++) {
    const s = clone(st); s.rng = seed;
    const evs = go(s, 260, (i) => [i === 0 ? 64 : 0, 0]);
    if (s.fluff) {
      found = true;
      const apex = evs.find((e) => e.k === 'koapex');
      assert.ok(apex && apex.y > 2500, 'the apex is reported high up');
    }
  }
  assert.ok(found, 'some seed rolls a Fluffatality');
});

test('the sim never leaves st.pause non-integer (a shot used to set it NaN)', () => {
  const st = fight('johnny', 'kevalanche', { x1: -3000, x2: 3000 });
  go(st, 120, (i) => [i === 1 ? DOWN : i === 2 ? DOWN | HEAVY : 0, 0]);
  assert.ok(Number.isInteger(st.pause));
  for (const f of st.f) assert.ok(Number.isInteger(f.bl) && f.bl <= 6);
});

/* ── anti-mash ──────────────────────────────────────────────────────────── */

test('anti-mash: walking forward mashing lights and heavies loses most matches to the Normal CPU', () => {
  let cpuWins = 0, n = 0;
  const per = {};
  for (const id of ROSTER) {
    for (let s = 0; s < 4; s++) {
      const opp = ROSTER[(ROSTER.indexOf(id) + 1 + s) % ROSTER.length];
      const side = s % 2;     // the masher on either side
      const st = createMatch({ p1: side ? opp : id, p2: side ? id : opp, seed: 3000 + s * 11 + ROSTER.indexOf(id) });
      const bot = masher(side, 3000 + s), cpu = new CPU(1 - side, 'normal', 77 + s);
      for (let i = 0; i < 60 * 60 * 10 && st.phase !== 'end'; i++) {
        const m = bot(st), c = cpu.input(st);
        stepInPlace(st, side ? c : m, side ? m : c);
      }
      n++;
      const won = st.winner === 1 - side;
      if (won) cpuWins++;
      per[id] = (per[id] || 0) + (won ? 0 : 1);
    }
  }
  console.log(`  Normal CPU beat the masher ${cpuWins} of ${n}; masher wins by fighter: ${JSON.stringify(per)}`);
  assert.ok(cpuWins >= Math.ceil(n * 0.7), `the CPU won ${cpuWins} of ${n}`);
});
