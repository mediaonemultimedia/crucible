/* The audio pass (src/audio/): presentation only.
   - the event → sound map (hits light / heavy / counter, blocks, grabs,
     landings, knockdowns, the K.O.), the per-play variation
   - the rollback dedupe: a tick's sound never fires twice, a resimulated
     event moved a tick or two is the same sound; whooshes once per swing
   - reading for sound never changes the sim (state hash identical)
   - online over a laggy, lossy link: each real event sounds once per peer
   - the music: every track compiles; the lengths asked for; tense layer
   - settings: remembered, and storage failures don't break anything     */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { Rollback } from '../src/net/rollback.js';
import { CPU } from '../src/ai/cpu.js';
import { masher } from '../src/ai/masher.js';
import { makeRng } from '../src/sim/rng.js';
import { BLOCK } from '../src/sim/input.js';
import { soundsFor, SfxRouter, NEAR, WHOOSH_GAP, ordinal, sessionTickOf, swingsIn, isHeavyHit } from '../src/audio/sfxmap.js';
import { TRACKS, compile, seconds, midi, chord, bassBar } from '../src/audio/music.js';
import { loadSettings, saveSettings, DEFAULTS, STORE_KEY, MIX, CLIP_IDS, level } from '../src/audio/engine.js';

const ids = (list) => list.map((x) => x.id);

test('events → sounds: hits, blocks, grabs, jumps, landings, knockdowns, the K.O.', () => {
  const light = { k: 'hit', p: 0, dmg: 40, kind: 'normal', sp: 0, kd: 0, amp: 0, ctr: 0 };
  assert.deepEqual(ids(soundsFor(light, 10)), ['hit-light']);
  assert.deepEqual(ids(soundsFor({ ...light, dmg: 85 }, 10)), ['hit-heavy', 'thump']);
  for (const kind of ['signature', 'special', 'throw']) assert.equal(soundsFor({ ...light, kind }, 10)[0].id, 'hit-heavy', kind);
  assert.equal(soundsFor({ ...light, amp: 1 }, 10)[0].id, 'hit-heavy', 'an amplified finisher');
  assert.equal(soundsFor({ ...light, kd: 1 }, 10)[0].id, 'hit-heavy', 'a knockdown');
  assert.ok(isHeavyHit({ ...light, sp: 1 }));
  assert.deepEqual(ids(soundsFor({ k: 'block', p: 1, dmg: 40 }, 3)), ['block']);
  assert.deepEqual(ids(soundsFor({ k: 'grab', p: 0, throw: 1 }, 3)), ['grab']);
  assert.deepEqual(ids(soundsFor({ k: 'jump', p: 0 }, 3)), ['jump']);
  assert.deepEqual(ids(soundsFor({ k: 'land', p: 0, hard: 0 }, 3)), ['land']);
  assert.deepEqual(ids(soundsFor({ k: 'land', p: 0, hard: 1 }, 3)), ['knockdown'], 'a throw / knockdown landing');
  assert.deepEqual(ids(soundsFor({ k: 'slam', p: 0, x: 0 }, 3)), ['knockdown', 'thump'], 'the dive slam');
  assert.deepEqual(ids(soundsFor({ k: 'kobounce', p: 0, x: 0 }, 3)), ['knockdown']);
  assert.deepEqual(ids(soundsFor({ k: 'koflash', p: 0, final: 1 }, 3)), ['hit-heavy', 'thump', 'feather-burst'], 'K.O.: the burst');
  assert.deepEqual(ids(soundsFor({ k: 'ko', w: 0, final: 1 }, 3)), ['crowd-ooh'], 'K.O.: the crowd');
  for (const k of ['banner', 'round', 'time', 'end', 'impatient', 'dash', 'jumpsquat', 'koapex', 'kobanner']) assert.deepEqual(soundsFor({ k, p: 0 }, 3), [], k);
  // every sound named is one the engine has
  for (const e of [light, { ...light, dmg: 90 }, { k: 'block' }, { k: 'grab' }, { k: 'jump' }, { k: 'land' }, { k: 'land', hard: 1 }, { k: 'slam' }, { k: 'kobounce' }, { k: 'koflash' }, { k: 'ko' }, { k: 'clash' }, { k: 'tech' }, { k: 'throw' }]) {
    for (const s of soundsFor(e, 1)) assert.ok(s.id in MIX, s.id);
  }
});

test('hits vary a little (pitch ±5–8 %, gain); a counter-hit is louder and lower', () => {
  const light = { k: 'hit', p: 0, dmg: 40, kind: 'normal' };
  const rates = [], gains = [];
  for (let t = 0; t < 300; t++) { const s = soundsFor(light, t)[0]; rates.push(s.rate); gains.push(s.gain); }
  assert.ok(Math.min(...rates) >= 0.92 && Math.max(...rates) <= 1.08, 'pitch inside ±8 %');
  assert.ok(Math.max(...rates) - Math.min(...rates) > 0.08, 'and it does vary');
  assert.ok(new Set(rates.map((r) => r.toFixed(3))).size > 50);
  assert.ok(Math.max(...gains) - Math.min(...gains) > 0.15);
  // the same event always sounds the same (repeatable captures)
  assert.deepEqual(soundsFor(light, 77), soundsFor(light, 77));
  let louder = 0, lower = 0;
  for (let t = 0; t < 200; t++) {
    const a = soundsFor(light, t)[0], c = soundsFor({ ...light, ctr: 1 }, t)[0];
    if (c.gain > a.gain) louder++;
    if (c.rate < a.rate) lower++;
  }
  assert.equal(louder, 200); assert.equal(lower, 200);
});

test('the dedupe: once per (tick, kind, player, ordinal); a resimulated event moved a tick is the same sound', () => {
  const R = new SfxRouter(), hit = { k: 'hit', p: 0, dmg: 40, kind: 'normal' };
  assert.equal(R.route(hit, 100, 1).length, 1);
  assert.equal(R.route({ ...hit }, 100, 1).length, 0, 'the same tick again (a resimulation)');
  assert.equal(R.route({ ...hit }, 101, 1).length, 0, 'moved one tick by a rollback');
  assert.equal(R.route({ ...hit }, 100 + NEAR, 1).length, 0, `moved ${NEAR} ticks`);
  assert.equal(R.route({ ...hit }, 100, 2).length, 1, 'a second hit on the same tick is a real one');
  assert.equal(R.route({ ...hit, p: 1 }, 101, 1).length, 1, 'the other player');
  assert.equal(R.route({ k: 'block', p: 0 }, 101, 1).length, 1, 'another kind');
  assert.equal(R.route({ ...hit }, 112, 1).length, 1, 'a new hit later');
  // routeTick: a tick's list, ordinals counted
  const R2 = new SfxRouter();
  assert.equal(R2.routeTick([hit, { ...hit }], 5).length, 2);
  assert.equal(R2.routeTick([hit, { ...hit }], 5).length, 0);
  // ordinal(): by kind and player
  const L = [{ k: 'hit', p: 0 }, { k: 'land', p: 0 }, { k: 'hit', p: 1 }, { k: 'hit', p: 0 }];
  assert.deepEqual(L.map((e) => ordinal(L, e)), [1, 1, 1, 2]);
  // history is pruned (no unbounded growth over a long match)
  const R3 = new SfxRouter();
  for (let t = 0; t < 20000; t += 5) R3.route({ k: 'jump', p: 0 }, t, 1);
  assert.ok(R3.fired.size < 200, `${R3.fired.size} keys kept`);
});

test('whooshes: one per swing, light quieter than heavy, a flurry rate-limited', () => {
  const st = createMatch({ p1: 'kevalanche', p2: 'sumaura', seed: 1 });
  const f = st.f[0];
  const R = new SfxRouter();
  st.tick = 200; f.act = 'attack'; f.mv = 'light'; f.t = 0;
  const a = R.whooshes(st);
  assert.deepEqual(ids(a), ['whoosh-light']);
  st.tick = 201; f.t = 1;
  assert.equal(R.whooshes(st).length, 0, 'the same swing a tick later');
  st.tick = 203; f.mv = 'light'; f.t = 0;
  assert.equal(R.whooshes(st).length, 0, `a new light inside ${WHOOSH_GAP} ticks: no whoosh (a flurry)`);
  st.tick = 230; f.mv = 'heavy'; f.t = 0;
  const h = R.whooshes(st);
  assert.deepEqual(ids(h), ['whoosh-heavy']);
  assert.ok(h[0].gain > a[0].gain * 1.3, 'the heavy whoosh is louder');
  st.tick = 260; f.mv = 'throw'; f.t = 0;
  assert.equal(R.whooshes(st).length, 0, 'a grab is not a swing');
  assert.equal(swingsIn(createMatch({ p1: 'zach', p2: 'johnny', seed: 2 })).length, 0);
});

/* run a seeded match; with the sound reading every tick or not */
function play({ p1, p2, seed, ticks, inputs, listen }) {
  const st = createMatch({ p1, p2, seed });
  const R = listen ? new SfxRouter() : null;
  const hashes = [];
  let n = 0;
  for (let t = 0; t < ticks && st.phase !== 'end'; t++) {
    const [a, b] = inputs(st);
    stepInPlace(st, a, b);
    if (R) {
      const before = hash(st);
      for (const e of st.ev) n += R.route(e, st.tick, ordinal(st.ev, e)).length;
      n += R.whooshes(st).length;
      assert.equal(hash(st), before, 'reading for sound wrote to the state');
    }
    if (t % 30 === 0) hashes.push(hash(st));
  }
  return { hash: hash(st), hashes, n };
}

test('the sim state hash is identical with and without the sound listening, for any input sequence', () => {
  const rnd = (seed) => { const r = makeRng(seed); return () => [r.int(256), r.int(256)]; };
  const cpus = (s) => { const a = new CPU(0, 'hard', s), b = new CPU(1, 'normal', s + 1); return (st) => [a.input(st), b.input(st)]; };
  const runs = [
    { p1: 'kevalanche', p2: 'sumaura', seed: 3, inputs: () => rnd(11) },
    { p1: 'rubberta', p2: 'johnny', seed: 9, inputs: () => rnd(29) },
    { p1: 'zach', p2: 'sebas', seed: 5, inputs: () => cpus(5) },
    { p1: 'k8e', p2: 'kevalanche', seed: 21, inputs: () => cpus(8) },
  ];
  for (const R of runs) {
    const a = play({ ...R, ticks: 6000, inputs: R.inputs(), listen: false });
    const b = play({ ...R, ticks: 6000, inputs: R.inputs(), listen: true });
    assert.equal(b.hash, a.hash, `${R.p1} v ${R.p2}`);
    assert.deepEqual(b.hashes, a.hashes);
    assert.ok(b.n > 50, `${b.n} sounds`);
  }
});

const SOUNDED = new Set(['hit', 'block', 'grab', 'jump', 'land', 'slam', 'kobounce', 'koflash', 'clash', 'tech', 'throw']);

test('online over a laggy, lossy link: every real event sounds once on each peer (rollbacks never double-play)', () => {
  const st0 = createMatch({ p1: 'kevalanche', p2: 'zach', seed: 13 });
  const rng = makeRng(91);
  const q = [];
  let now = 0;
  const link = (deliver) => (msg) => { if (rng.int(100) < 6) return; q.push({ at: now + 40 + rng.int(70), msg: JSON.parse(JSON.stringify(msg)), deliver }); };
  const peers = [];
  const out = [link((m) => peers[1].receive(m)), link((m) => peers[0].receive(m))];
  for (let k = 0; k < 2; k++) peers[k] = new Rollback(clone(st0), { local: k, send: (m) => out[k](m) });
  const routers = [new SfxRouter(), new SfxRouter()], played = [[], []], raw = [0, 0];
  const since = [0, 0];
  const deliver = (k, ev) => {
    if (!ev) return;
    for (const e of ev) {
      if (!SOUNDED.has(e.k)) continue;
      raw[k]++;
      const [t, n] = sessionTickOf(peers[k], e, since[k]);
      if (routers[k].route(e, t, n).length) played[k].push({ k: e.k, p: e.p, t });
    }
  };
  const bots = [masher(0, 3), new CPU(1, 'normal', 5)];
  const next = [0, 9];
  while (now < 60000 && !(peers[0].st.phase === 'end' && peers[1].st.phase === 'end')) {
    const k = next[0] <= next[1] ? 0 : 1;
    now = next[k];
    q.sort((a, b) => a.at - b.at);
    while (q.length && q[0].at <= now) { const m = q.shift(); m.deliver(m.msg); }
    const P = peers[k];
    const m = k === 0 ? bots[0](P.st) | (P.frame % 700 > 500 ? BLOCK : 0) : bots[1].input(P.st);
    since[k] = P.flowDone;
    deliver(k, P.advance(m));
    next[k] += 1000 / 60;
  }
  for (let i = 0; i < 3000 && !(peers[0].confirmed === peers[1].confirmed && peers[0].confirmed === peers[0].frame && peers[1].frame === peers[0].frame); i++) {
    now += 4;
    q.sort((a, b) => a.at - b.at);
    while (q.length && q[0].at <= now) { const m = q.shift(); m.deliver(m.msg); }
    for (const P of peers) since[P.local] = P.flowDone;
    for (const P of peers) deliver(P.local, P.frame < Math.max(peers[0].frame, peers[1].frame) ? P.advance(0) : P.idle());
  }
  assert.ok(peers[0].stats.rollbacks > 20, `the link really rolled back (${peers[0].stats.rollbacks})`);
  // the truth: the confirmed inputs replayed
  const n = Math.min(peers[0].confirmed, peers[1].confirmed);
  const st = clone(st0), truth = [];
  for (let t = 0; t < n; t++) {
    stepInPlace(st, peers[0].inp[0][t] | 0, peers[0].inp[1][t] | 0);
    for (const e of st.ev) if (SOUNDED.has(e.k)) truth.push({ k: e.k, p: e.p, t: st.tick });
  }
  assert.ok(truth.length > 80, `${truth.length} real events`);
  for (let k = 0; k < 2; k++) {
    const mine = played[k].filter((x) => x.t <= n);
    // each real event: a sound (on its tick, or moved by a resimulation within NEAR)
    let missing = 0;
    for (const e of truth) if (!mine.some((x) => x.k === e.k && x.p === e.p && Math.abs(x.t - e.t) <= NEAR)) missing++;
    assert.equal(missing, 0, `peer ${k}: ${missing} real events never sounded`);
    // and never twice: inside any NEAR window a kind/player sounds no more often than it really happened
    for (const x of mine) {
      const near = mine.filter((y) => y.k === x.k && y.p === x.p && Math.abs(y.t - x.t) <= NEAR).length;
      const real = truth.filter((y) => y.k === x.k && y.p === x.p && Math.abs(y.t - x.t) <= NEAR * 2).length;
      assert.ok(near <= Math.max(1, real), `peer ${k}: ${x.k} p${x.p} @${x.t} sounded ${near}× (really ${real})`);
    }
    // only mispredictions (a predicted event that never happened) may add any
    const extra = mine.length - truth.length;
    assert.ok(extra >= 0 && extra <= truth.length * 0.1, `peer ${k}: ${mine.length} sounds for ${truth.length} events (${raw[k]} handed out by the session)`);
  }
});

test('the music: every track compiles; menu ~30–40 s, fight ~60 s with A and B, the stings and jingles their lengths', () => {
  const C = Object.fromEntries(Object.keys(TRACKS).map((k) => [k, compile(TRACKS[k])]));
  const sec = (k) => seconds(C[k]);
  assert.ok(sec('menu') >= 30 && sec('menu') <= 40, `menu ${sec('menu')}`);
  assert.ok(C.menu.bpm >= 105 && C.menu.bpm <= 115);
  assert.ok(sec('fight') >= 55 && sec('fight') <= 65, `fight ${sec('fight')}`);
  assert.ok(C.fight.bpm >= 145 && C.fight.bpm <= 155);
  assert.ok(C.menu.loop && C.fight.loop && !C.win.loop && !C.lose.loop);
  assert.ok(sec('vs') >= 1.5 && sec('vs') <= 2.5, `vs ${sec('vs')}`);
  assert.ok(sec('round') <= 2, `round ${sec('round')}`);
  assert.ok(sec('win') >= 3.5 && sec('win') <= 5, `win ${sec('win')}`);
  assert.ok(sec('lose') >= 3.5 && sec('lose') <= 5.5, `lose ${sec('lose')}`);
  // the fight's A (D minor, bars 1–16) and B (F major, bars 17–32) both carry a tune
  const tune = (from, to) => C.fight.events.filter((e) => (e.ch === 'lead' || e.ch === 'lead2') && e.beat >= from * 4 && e.beat < to * 4).length;
  assert.ok(tune(0, 16) >= 70 && tune(16, 32) >= 70);
  // the tense layer exists and is only in the fight
  assert.ok(C.fight.events.some((e) => e.hype) && !C.menu.events.some((e) => e.hype));
  // the lose jingle ends on the deflating bloop; the trombone descends
  assert.ok(C.lose.events.some((e) => e.fx === 'bloop'));
  const tb = C.lose.events.filter((e) => e.inst === 'tbone').map((e) => e.note);
  assert.deepEqual(tb, [...tb].sort((a, b) => b - a));
  // sane notes; every loop's events sit inside it; nothing overlaps itself on a mono channel
  for (const c of Object.values(C)) {
    for (const e of c.events) {
      assert.ok(e.beat >= 0 && e.beat < c.beats, `${c.name} event at ${e.beat}`);
      if (e.note !== undefined) assert.ok(e.note >= 33 && e.note <= 96, `${c.name} note ${e.note}`);
      assert.ok(e.dur > 0);
    }
  }
  assert.equal(midi('a4'), 69); assert.equal(midi('c#5'), 73); assert.equal(midi('bb3'), 58);
  assert.deepEqual(chord('Dm'), { root: 2, tones: [0, 3, 7] });
  assert.deepEqual(bassBar('C', 'R O 5 A', 'F'), [36, 48, 43, 40]);
});

test('settings: defaults, remembered, clamped; storage that throws is fine', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  assert.deepEqual(loadSettings(mem), DEFAULTS);
  saveSettings(mem, { muted: true, music: 30, sfx: 100 });
  assert.deepEqual(loadSettings(mem), { muted: true, music: 30, sfx: 100 });
  mem.d[STORE_KEY] = JSON.stringify({ muted: 0, music: 900, sfx: 'x' });
  assert.deepEqual(loadSettings(mem), { muted: false, music: 100, sfx: DEFAULTS.sfx });
  mem.d[STORE_KEY] = '{nope';
  assert.deepEqual(loadSettings(mem), DEFAULTS);
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(bad), DEFAULTS);
  assert.doesNotThrow(() => saveSettings(bad, DEFAULTS));
  assert.deepEqual(loadSettings(null), DEFAULTS);
  assert.equal(level(0), 0); assert.equal(level(100), 1); assert.ok(level(50) < 0.5);
  assert.equal(CLIP_IDS.length, 7);
});
