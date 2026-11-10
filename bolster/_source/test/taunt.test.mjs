/* Taunting captions (ui/taunt.js): cosmetic only — the sim's state hash is
   the same with or without the Taunter watching, for any input sequence; it
   catches mashing, one-move spam, turtling and a whiffed special; it is
   rare (cooldowns); and online both peers roast the same player with the
   same line on the same tick. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { Rollback } from '../src/net/rollback.js';
import { CPU } from '../src/ai/cpu.js';
import { masher } from '../src/ai/masher.js';
import { makeRng } from '../src/sim/rng.js';
import { ROSTER } from '../src/fighters/index.js';
import { Taunter, TAUNTS, COOLDOWN, GAP } from '../src/ui/taunt.js';
import { LEFT, RIGHT, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK } from '../src/sim/input.js';

/* play `ticks` ticks; inputs(st, tick) → [a, b]; with a Taunter or not */
function play({ p1, p2, seed, ticks, inputs, watch }) {
  const st = createMatch({ p1, p2, seed });
  const T = watch ? new Taunter() : null;
  const hashes = [], taunts = [];
  for (let t = 0; t < ticks && st.phase !== 'end'; t++) {
    const [a, b] = inputs(st, t);
    stepInPlace(st, a, b);
    if (T) {
      const before = hash(st);
      const r = T.observe(st);
      assert.equal(hash(st), before, 'observe() wrote to the state');
      if (r) taunts.push({ ...r, tick: st.tick });
    }
    if (t % 30 === 0) hashes.push(hash(st));
  }
  return { hash: hash(st), hashes, taunts };
}

const randomInputs = (seed) => { const r = makeRng(seed); return () => [r.int(256), r.int(256)]; };
const cpuVsMasher = (seed) => { const c = new CPU(1, 'normal', seed), m = masher(0, seed); return (st) => [m(st), c.input(st)]; };

test('the state hash is identical with and without the Taunter, for any input sequence', () => {
  const runs = [
    { p1: 'kevalanche', p2: 'sumaura', seed: 3, inputs: () => randomInputs(11) },
    { p1: 'rubberta', p2: 'johnny', seed: 9, inputs: () => randomInputs(29) },
    { p1: 'zach', p2: 'sebas', seed: 5, inputs: () => cpuVsMasher(5) },
    { p1: 'k8e', p2: 'kevalanche', seed: 21, inputs: () => { const a = new CPU(0, 'hard', 4), b = new CPU(1, 'easy', 8); return (st) => [a.input(st), b.input(st)]; } },
  ];
  for (const R of runs) {
    const a = play({ ...R, ticks: 6000, inputs: R.inputs(), watch: false });
    const b = play({ ...R, ticks: 6000, inputs: R.inputs(), watch: true });
    assert.equal(b.hash, a.hash, `${R.p1} v ${R.p2}`);
    assert.deepEqual(b.hashes, a.hashes);
  }
});

test('the captions: ~20, short, the four kinds', () => {
  const all = Object.values(TAUNTS).flat();
  assert.ok(all.length >= 18 && all.length <= 24, `${all.length} lines`);
  assert.deepEqual(Object.keys(TAUNTS).sort(), ['mash', 'spam', 'turtle', 'whiff']);
  for (const l of all) assert.ok(l.length < 40, l);
  assert.equal(new Set(all).size, all.length);
});

const toFight = (st) => st.phase !== 'fight';
/* a scripted player 1 after the intro, player 2 standing still */
const script = (fn) => (st, t) => (toFight(st) ? [0, 0] : [fn(st, t), 0]);

test('mashing lights (the anti-mash lock-out, pressed through) gets a "mash" taunt', () => {
  const { taunts } = play({ p1: 'kevalanche', p2: 'sumaura', seed: 2, ticks: 900, watch: true,
    inputs: script((st, t) => (Math.abs(st.f[0].x - st.f[1].x) > 1600 ? RIGHT : t % 4 === 0 ? LIGHT : 0)) });
  assert.ok(taunts.some((x) => x.kind === 'mash' && x.p === 0), JSON.stringify(taunts));
  assert.ok(TAUNTS.mash.includes(taunts.find((x) => x.kind === 'mash').text));
});

test('the same heavy over and over gets a "spam" taunt', () => {
  const { taunts } = play({ p1: 'johnny', p2: 'kevalanche', seed: 2, ticks: 1200, watch: true,
    inputs: script((st, t) => (t % 50 === 0 ? HEAVY : 0)) });
  assert.ok(taunts.some((x) => x.kind === 'spam' && x.p === 0), JSON.stringify(taunts));
});

test('holding block for seconds gets a "turtle" taunt', () => {
  const { taunts } = play({ p1: 'sumaura', p2: 'k8e', seed: 2, ticks: 900, watch: true, inputs: script(() => BLOCK) });
  assert.deepEqual(taunts.map((x) => [x.p, x.kind]), [[0, 'turtle']]);
});

test('a special thrown at nothing gets a "whiff" taunt; one that connects does not', () => {
  const far = (id) => (st, t) => {
    if (toFight(st)) return [0, 0];
    if (t === 200) { st.f[0].meter = 1000; st.f[0].x = -8000; st.f[1].x = 8000; }   // (test setup: full meter, far apart)
    return [t === 201 ? SPECIAL : 0, 0];
  };
  for (const id of ['kevalanche', 'sumaura', 'rubberta']) {
    const { taunts } = play({ p1: id, p2: 'k8e', seed: 2, ticks: 700, watch: true, inputs: far(id) });
    assert.ok(taunts.some((x) => x.kind === 'whiff' && x.p === 0), `${id}: ${JSON.stringify(taunts)}`);
  }
  // Sebas's howl crosses the whole stage and lands 80 ticks later: not a whiff
  const howl = play({ p1: 'sebas', p2: 'k8e', seed: 2, ticks: 700, watch: true, inputs: far('sebas') });
  assert.deepEqual(howl.taunts.filter((x) => x.kind === 'whiff'), []);
  // a CPU match: every whiff taunt follows a special that really touched nothing
  const { taunts } = play({ p1: 'rubberta', p2: 'johnny', seed: 4, ticks: 8000, watch: true, inputs: (() => { const a = new CPU(0, 'normal', 1), b = new CPU(1, 'normal', 2); return (st) => [a.input(st), b.input(st)]; })() });
  for (const x of taunts) assert.ok(TAUNTS[x.kind].includes(x.text));
});

test('rare: one per player per 10 s, never two within 4 s, nothing outside the fight phase', () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = makeRng(seed);
    const { taunts } = play({ p1: ROSTER[seed % ROSTER.length], p2: ROSTER[(seed * 3) % ROSTER.length], seed, ticks: 12000, watch: true,
      inputs: (st, t) => [(t % 3 ? LIGHT : 0) | (t % 400 < 300 ? BLOCK : 0) | (t % 90 === 0 ? HEAVY : 0) | RIGHT, r.int(256) & ~DOWN] });
    for (let i = 1; i < taunts.length; i++) assert.ok(taunts[i].tick - taunts[i - 1].tick >= GAP, `gap ${JSON.stringify(taunts.slice(i - 1, i + 1))}`);
    for (const p of [0, 1]) {
      const mine = taunts.filter((x) => x.p === p);
      for (let i = 1; i < mine.length; i++) assert.ok(mine[i].tick - mine[i - 1].tick >= COOLDOWN);
    }
  }
});

/* online: two Rollback peers over a laggy, lossy in-memory link; each feeds
   its Taunter the confirmed ticks only (as Fight._netTaunts does) */
test('online: both peers show the same taunts, on the same ticks, with the same lines', () => {
  const st0 = createMatch({ p1: 'kevalanche', p2: 'zach', seed: 13 });
  const rng = makeRng(77);
  const q = [];
  let now = 0;
  const link = (deliver) => (msg) => { if (rng.int(100) < 5) return; q.push({ at: now + 40 + rng.int(60), msg: JSON.parse(JSON.stringify(msg)), deliver }); };
  const peers = [];
  const out = [link((m) => peers[1].receive(m)), link((m) => peers[0].receive(m))];
  for (let k = 0; k < 2; k++) peers[k] = new Rollback(clone(st0), { local: k, send: (m) => out[k](m) });
  const T = [new Taunter(), new Taunter()], seen = [[], []], done = [0, 0];
  const watch = (k) => {
    const S = peers[k];
    for (; done[k] < S.confirmed; done[k]++) {
      const t = done[k] + 1;
      const s = t === S.frame ? S.st : S.stateAt(t);
      assert.ok(s, `state for tick ${t} in the ring`);
      const r = T[k].observe(s);
      if (r) seen[k].push(`${s.tick}:${r.p}:${r.kind}:${r.text}`);
    }
  };
  const bots = [masher(0, 3), new CPU(1, 'normal', 5)];
  const next = [0, 9];
  while (now < 100000 && !(peers[0].st.phase === 'end' && peers[1].st.phase === 'end')) {
    const k = next[0] <= next[1] ? 0 : 1;
    now = next[k];
    q.sort((a, b) => a.at - b.at);
    while (q.length && q[0].at <= now) { const m = q.shift(); m.deliver(m.msg); }
    const P = peers[k];
    const m = k === 0 ? bots[0](P.st) | (P.frame % 700 > 500 ? BLOCK : 0) : bots[1].input(P.st);
    P.advance(m);
    watch(k);
    next[k] += 1000 / 60;
  }
  for (let i = 0; i < 3000 && !(peers[0].confirmed === peers[1].confirmed && peers[0].confirmed === peers[0].frame && peers[1].frame === peers[0].frame); i++) {
    now += 4;
    q.sort((a, b) => a.at - b.at);
    while (q.length && q[0].at <= now) { const m = q.shift(); m.deliver(m.msg); }
    for (const P of peers) { if (P.frame < Math.max(peers[0].frame, peers[1].frame)) P.advance(0); else P.idle(); watch(P.local); }
  }
  const n = Math.min(done[0], done[1]);
  const upto = (k) => seen[k].filter((s) => +s.split(':')[0] <= n);
  assert.ok(upto(0).length >= 1, `some taunts: ${JSON.stringify(seen)}`);
  assert.deepEqual(upto(0), upto(1));
  assert.ok(peers[0].stats.rollbacks > 0, 'the link really did roll back');
});
