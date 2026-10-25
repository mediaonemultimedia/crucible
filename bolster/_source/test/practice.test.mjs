/* Practice mode (src/practice.js): the dummy does what its setting says,
   STUFFING refills and never lets it be K.O.'d, the meter holds full on
   request, the combo readout counts — and none of it touches any match
   played after (a practice in the online lobby leaves the online match's
   seed and state exactly as they'd be without it). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash } from '../src/sim/sim.js';
import { LIGHT, HEAVY, DOWN, SPECIAL } from '../src/sim/input.js';
import { FIGHTERS, ROSTER, MAX_METER } from '../src/fighters/index.js';
import { CPU } from '../src/ai/cpu.js';
import { Dummy, practiceMatch, runPractice, defaultSettings, ComboMeter, InputLog, DUMMY_MODES, FLOOR } from '../src/practice.js';

const S = (o = {}) => ({ ...defaultSettings(), ...o });
/* attack the dummy over and over: lights, lows, heavies, jump-ins */
const pester = (i) => [LIGHT, 0, DOWN | LIGHT, DOWN, 0, HEAVY, 0, 0, 0][(i >> 3) % 9];
const close = (st) => { st.f[0].x = -1000; st.f[1].x = 1000; return st; };

test('a practice match starts straight in the fight, the clock held', () => {
  const st = practiceMatch({ p1: 'sebas', p2: 'zach', seed: 4 });
  assert.equal(st.phase, 'fight');
  runPractice(st, S(), () => 0, 600);
  assert.equal(st.phase, 'fight');
  assert.equal(st.timer, 99 * 60);
  assert.equal(DUMMY_MODES.length, 6);
});

test('dummy: stand gets hit high and low; crouch ducks; jump jumps', () => {
  let st = close(practiceMatch({ p1: 'kevalanche', p2: 'johnny', seed: 1 }));
  const ev = [];
  runPractice(st, S({ mode: 'stand' }), pester, 600, new Dummy(1, 1), (e) => ev.push(e));
  assert.ok(ev.filter((e) => e.k === 'hit' && e.p === 0).length > 5);
  assert.ok(!ev.some((e) => e.k === 'block'));
  st = practiceMatch({ p1: 'kevalanche', p2: 'johnny', seed: 1 });
  let crouched = 0, aired = 0;
  for (let i = 0; i < 200; i++) { runPractice(st, S({ mode: 'crouch' }), () => 0, 1); if (st.f[1].act === 'crouch') crouched++; }
  assert.ok(crouched > 150, `crouching ${crouched}`);
  st = practiceMatch({ p1: 'kevalanche', p2: 'johnny', seed: 1 });
  for (let i = 0; i < 300; i++) { runPractice(st, S({ mode: 'jump' }), () => 0, 1); if (st.f[1].air) aired++; }
  assert.ok(aired > 150, `in the air ${aired}`);
});

test('dummy: block stops mids and highs but lows get under; block low stops lows and mids', () => {
  for (const [mode, lowHits, midBlocked] of [['block', true, true], ['blocklow', false, true]]) {
    const st = close(practiceMatch({ p1: 'sumaura', p2: 'k8e', seed: 2 }));
    const ev = [];
    // lows only, then mids only
    runPractice(st, S({ mode }), (i) => (i % 30 === 1 ? DOWN | LIGHT : i % 30 < 8 ? DOWN : 0), 400, new Dummy(1, 2), (e) => ev.push({ ...e, part: 'low' }));
    runPractice(close(st), S({ mode }), (i) => (i % 30 === 1 ? LIGHT : 0), 400, new Dummy(1, 2), (e) => ev.push({ ...e, part: 'mid' }));
    const hitLow = ev.some((e) => e.part === 'low' && e.k === 'hit' && e.p === 0);
    const blockMid = ev.some((e) => e.part === 'mid' && e.k === 'block' && e.p === 0) && !ev.some((e) => e.part === 'mid' && e.k === 'hit' && e.p === 0);
    assert.equal(hitLow, lowHits, `${mode}: lows ${hitLow ? 'hit' : 'blocked'}`);
    assert.equal(blockMid, midBlocked, `${mode}: mids`);
  }
});

test('dummy: random block guesses — some blocked high, some low, some let through', () => {
  const st = close(practiceMatch({ p1: 'zach', p2: 'sebas', seed: 3 }));
  const ev = [];
  // (stepping back in every time: blocked hits push the two apart)
  runPractice(st, S({ mode: 'random' }), (i, s) => { if (i % 40 === 0) close(s); return i % 40 === 1 ? (i % 80 === 1 ? DOWN | LIGHT : LIGHT) : i % 80 < 8 ? DOWN : 0; }, 4000, new Dummy(1, 9), (e) => ev.push(e));
  const blocks = ev.filter((e) => e.k === 'block' && e.p === 0), hits = ev.filter((e) => e.k === 'hit' && e.p === 0);
  assert.ok(blocks.some((e) => e.low) && blocks.some((e) => !e.low), 'blocks both high and low');
  assert.ok(hits.length > 3, 'and sometimes guesses wrong');
});

test('refill: back to full after a combo; never low enough to be K.O.\'d; meter held full on request', () => {
  const st = close(practiceMatch({ p1: 'kevalanche', p2: 'rubberta', seed: 4 }));
  const max = FIGHTERS.rubberta.health;
  let low = max;
  for (let i = 0; i < 3000; i++) { runPractice(st, S({ mode: 'stand' }), pester, 1); low = Math.min(low, st.f[1].hp); }
  assert.equal(st.phase, 'fight', 'no K.O.');
  assert.ok(low >= FLOOR);
  runPractice(st, S(), () => 0, 120);
  assert.equal(st.f[1].hp, max, 'refilled once the combo is over');
  // refill off: it stays down (but never below the floor)
  const t2 = close(practiceMatch({ p1: 'kevalanche', p2: 'rubberta', seed: 4 }));
  runPractice(t2, S({ refill: false }), pester, 3000);
  runPractice(t2, S({ refill: false }), () => 0, 120);
  assert.ok(t2.f[1].hp < max && t2.f[1].hp >= FLOOR && t2.phase === 'fight');
  // the meter: full, and full again after a special
  const t3 = close(practiceMatch({ p1: 'sebas', p2: 'kevalanche', seed: 4 }));
  runPractice(t3, S({ meter: true }), () => 0, 2);
  assert.equal(t3.f[0].meter, MAX_METER);
  const ev = [];
  runPractice(t3, S({ meter: true }), (i) => (i === 0 || i === 150 ? SPECIAL : 0), 300, new Dummy(1, 1), (e) => ev.push(e));
  assert.equal(ev.filter((e) => e.k === 'special' && e.p === 0).length, 2, 'two specials back to back');
});

test('the combo readout and the input log', () => {
  const C = new ComboMeter(0);
  for (const e of [{ k: 'hit', p: 0, n: 1, dmg: 40 }, { k: 'hit', p: 0, n: 2, dmg: 40 }, { k: 'hit', p: 0, n: 3, dmg: 130, amp: 1 }, { k: 'hit', p: 1, n: 1, dmg: 99 }]) C.event(e);
  assert.deepEqual(C.last, { hits: 3, dmg: 210, amp: 1, ctr: 0 });
  C.event({ k: 'hit', p: 0, n: 1, dmg: 30 });
  assert.deepEqual(C.last, { hits: 1, dmg: 30, amp: 0, ctr: 0 });
  assert.equal(C.best, 210);
  const L = new InputLog(3);
  for (const m of [0, 0, 16, 16, 16, 32, 0]) L.push(m);
  assert.deepEqual(L.rows, [{ m: 0, t: 1 }, { m: 32, t: 1 }, { m: 16, t: 3 }]);
});

test('isolation: practising first changes nothing about the match played after (seed, state, result)', () => {
  const play = () => {
    const st = createMatch({ p1: 'sebas', p2: 'zach', seed: 123456 });
    const h0 = hash(st);
    const a = new CPU(0, 'normal', 123456), b = new CPU(1, 'normal', 123457);
    for (let i = 0; i < 60 * 60 * 12 && st.phase !== 'end'; i++) stepInPlace(st, a.input(st), b.input(st));
    return { h0, h: hash(st), winner: st.winner };
  };
  const before = play();
  // a long practice in between, every dummy mode, every fighter
  for (const [k, m] of DUMMY_MODES.entries()) {
    const st = close(practiceMatch({ p1: ROSTER[k % ROSTER.length], p2: ROSTER[(k + 3) % ROSTER.length], seed: k + 1 }));
    runPractice(st, S({ mode: m.id, meter: true }), pester, 1500, new Dummy(1, k));
  }
  assert.deepEqual(play(), before);
});
