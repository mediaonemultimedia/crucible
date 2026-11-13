/* The audio pass: which sound each sim event makes, that sounds never play
   twice when a predicted tick is rolled back and re-simulated online, that
   reading the state for sounds never changes it, the music's arithmetic
   (every bar adds up, the loops' lengths), the settings' storage, and the
   M key on the keyboard legend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { Rollback } from '../src/net/rollback.js';
import { CPU } from '../src/ai/cpu.js';
import { makeRng } from '../src/sim/rng.js';
import { soundsFor, SoundGate, Swings, heavyHit, SFX_IDS } from '../src/audio/sfxmap.js';
import { SONGS, mel, midi, songSeconds } from '../src/audio/songs.js';
import { SYNTH } from '../src/audio/synth.js';
import { LAYERS, LEVEL, loadSettings, saveSettings, DEFAULTS } from '../src/audio/engine.js';
import { keyboardSVG, soloBinding, comboLine } from '../src/ui/keymap.js';
import fs from 'node:fs';

const fixed = () => 0.5;              // no variation: rnd() = 0.5 → ×1
const ids = (cues) => cues.map((c) => c.id);
const st0 = () => createMatch({ p1: 'kevalanche', p2: 'sumaura', seed: 3 });

test('every effect id has layers and a level; the twelve slots are all wired', () => {
  assert.equal(SFX_IDS.length, 12);
  for (const id of SFX_IDS) { assert.ok(LAYERS[id]?.length, `${id} has layers`); assert.ok(LEVEL[id] > 0, `${id} has a level`); }
  // the UI sits under the hits
  assert.ok(LEVEL['ui-tick'] < LEVEL['hit-light'] && LEVEL['ui-confirm'] < LEVEL['hit-light']);
  // the synthesised layers and the build's clips cover every layer a slot names
  const clips = new Set(fs.readdirSync(new URL('../assets/audio/game/', import.meta.url)).map((f) => `clip:${f.replace(/\.mp3$/, '')}`));
  for (const [id, L] of Object.entries(LAYERS)) for (const l of L) assert.ok(SYNTH[l.b] || clips.has(l.b), `${id}: layer ${l.b} exists`);
});

test('events → sounds: hits light / heavy, counters, blocks, grabs, throws, jumps, landings, slams, the K.O.', () => {
  const st = st0();
  const hit = (o) => ids(soundsFor({ k: 'hit', p: 0, x: 0, y: 1000, dmg: 40, kind: 'normal', sp: 0, kd: 0, n: 1, amp: 0, ctr: 0, thr: 0, ...o }, st, fixed));
  assert.deepEqual(hit({}), ['hit-light']);
  assert.deepEqual(hit({ dmg: 90 }), ['hit-heavy']);
  assert.deepEqual(hit({ kd: 1 }), ['hit-heavy']);
  assert.deepEqual(hit({ sp: 1, kind: 'special' }), ['hit-heavy'], 'specials use the heavy hit');
  assert.deepEqual(hit({ kind: 'signature' }), ['hit-heavy'], 'signatures too');
  assert.deepEqual(hit({ thr: 1, kd: 1 }), ['hit-heavy', 'knockdown'], 'a throw lands: the hit and the slam into the mat');
  // a counter-hit: louder and lower than the same hit
  const [n] = soundsFor({ k: 'hit', p: 0, x: 0, dmg: 40, kind: 'normal' }, st, fixed);
  const [c] = soundsFor({ k: 'hit', p: 0, x: 0, dmg: 40, kind: 'normal', ctr: 1 }, st, fixed);
  assert.ok(c.gain > n.gain && c.rate < n.rate, 'counter-hit louder and lower');
  assert.deepEqual(ids(soundsFor({ k: 'block', p: 1, x: 0, dmg: 40 }, st, fixed)), ['block']);
  assert.deepEqual(ids(soundsFor({ k: 'grab', p: 0, throw: 1 }, st, fixed)), ['grab']);
  assert.deepEqual(ids(soundsFor({ k: 'jump', p: 0 }, st, fixed)), ['jump']);
  assert.deepEqual(ids(soundsFor({ k: 'land', p: 0, hard: 0 }, st, fixed)), ['land']);
  assert.deepEqual(ids(soundsFor({ k: 'land', p: 0, hard: 1 }, st, fixed)), ['knockdown'], 'a knockdown landing');
  assert.deepEqual(ids(soundsFor({ k: 'slam', p: 0, x: 0 }, st, fixed)), ['knockdown'], 'the dive slam');
  assert.deepEqual(ids(soundsFor({ k: 'kobounce', p: 1, x: 0 }, st, fixed)), ['knockdown']);
  assert.deepEqual(ids(soundsFor({ k: 'koflash', p: 0, x: 0, y: 0, final: 1 }, st, fixed)), ['hit-heavy', 'feather-burst', 'crowd-ooh'], 'K.O.: a feather burst and the crowd');
  // flow and cosmetic-only events are silent here (the music handles banners)
  for (const k of ['banner', 'round', 'ko', 'kobanner', 'time', 'end', 'impatient', 'special', 'signature']) assert.deepEqual(soundsFor({ k, p: 0 }, st, fixed), [], `${k} makes no effect sound`);
  assert.ok(heavyHit({ dmg: 70 }) && !heavyHit({ dmg: 69 }));
});

test('repeats vary a little: pitch within ±8 %, gain within ±12 %, and not all the same', () => {
  const st = st0(), r = makeRng(7), rnd = () => r.int(1 << 20) / (1 << 20);
  const rates = [], gains = [];
  for (let i = 0; i < 200; i++) { const [c] = soundsFor({ k: 'hit', p: 0, x: 0, dmg: 30, kind: 'normal' }, st, rnd); rates.push(c.rate); gains.push(c.gain); }
  const base = soundsFor({ k: 'hit', p: 0, x: 0, dmg: 30, kind: 'normal' }, st, fixed)[0];
  for (const v of rates) assert.ok(Math.abs(v / base.rate - 1) <= 0.08);
  for (const v of gains) assert.ok(Math.abs(v / base.gain - 1) <= 0.12);
  assert.ok(new Set(rates.map((v) => v.toFixed(3))).size > 20, 'varied');
});

test('reading events and state for sounds never changes the sim (same hash, any inputs)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const a = createMatch({ p1: 'johnny', p2: 'rubberta', seed }), b = clone(a);
    const r = makeRng(seed * 13), gate = new SoundGate(), sw = new Swings();
    for (let t = 0; t < 2400; t++) {
      const i1 = r.int(256), i2 = r.int(256);
      stepInPlace(a, i1, i2); stepInPlace(b, i1, i2);
      const before = hash(b);
      gate.flush();
      for (const e of b.ev) if (gate.admit(e, b.tick)) soundsFor(Object.freeze({ ...e }), b);
      sw.read(b);
      assert.equal(hash(b), before, 'unchanged by the sound readers');
    }
    assert.equal(hash(a), hash(b), `seed ${seed}: identical`);
  }
});

test('SoundGate: once per (tick, kind, player, ordinal); a re-simulated event a tick away is not played again', () => {
  const g = new SoundGate({ near: 2 });
  g.flush();
  assert.ok(g.admit({ k: 'hit', p: 0 }, 100));
  assert.ok(g.admit({ k: 'hit', p: 0 }, 100), 'a second hit on the same tick (its own ordinal) plays');
  g.flush();
  assert.ok(!g.admit({ k: 'hit', p: 0 }, 100), 'the same tick again (a rollback re-emits it): no');
  g.flush();
  assert.ok(!g.admit({ k: 'hit', p: 0 }, 101), 'moved a tick by the corrected input: no');
  assert.ok(g.admit({ k: 'hit', p: 1 }, 101), 'the other player\'s: yes');
  assert.ok(g.admit({ k: 'block', p: 0 }, 101), 'another kind: yes');
  g.flush();
  assert.ok(g.admit({ k: 'hit', p: 0 }, 110), 'a real next hit later: yes');
  // offline (near 0): consecutive ticks both play
  const o = new SoundGate();
  o.flush(); assert.ok(o.admit({ k: 'jump', p: 0 }, 5));
  o.flush(); assert.ok(o.admit({ k: 'jump', p: 0 }, 6));
});

test('Swings: one whoosh per attack (keyed by its first tick), however often the state is read; rate-limited in a flurry', () => {
  const sw = new Swings({ gap: 7 });
  const st = st0();
  st.tick = 50;
  st.f[0].act = 'attack'; st.f[0].mv = 'light'; st.f[0].t = 1;
  assert.equal(sw.read(st, fixed).length, 1);
  assert.equal(sw.read(st, fixed).length, 0, 'the same tick read again (a re-render, a rollback): nothing');
  st.tick = 51; st.f[0].t = 2;
  assert.equal(sw.read(st, fixed).length, 0, 'the next tick of the same move: nothing');
  st.tick = 54; st.f[0].mv = 'heavy'; st.f[0].t = 0;
  assert.equal(sw.read(st, fixed).length, 0, 'a chained move 4 ticks later: rate-limited');
  st.tick = 70; st.f[0].mv = 'heavy'; st.f[0].t = 1;
  const [w] = sw.read(st, fixed);
  assert.ok(w && w.id === 'whoosh', 'a fresh heavy');
  st.tick = 90; st.f[0].mv = 'light'; st.f[0].t = 1;
  const [l] = sw.read(st, fixed);
  assert.ok(l.gain < w.gain, 'a light swing quieter than a heavy');
  st.f[0].mv = 'throw'; st.f[0].t = 0; st.tick = 120;
  assert.equal(sw.read(st, fixed).length, 0, 'a throw attempt isn\'t a swing (it has its own grab)');
});

/* two peers over a laggy, lossy link (as net.test.mjs); each side's sounds go
   through the same path the game uses (fight.js: session events, the tick
   from the session's log, the gate, swings from the state) */
function onlineSounds({ p1, p2, seed, latency = 120, jitter = 50, loss = 0.05 }) {
  const rng = makeRng(seed + 5);
  const q = [];
  const net = { now: 0 };
  const link = (deliver) => (msg) => {
    if (rng.int(1000) < loss * 1000) return;
    q.push({ at: net.now + Math.max(0, latency + (rng.int(2001) / 1000 - 1) * jitter), msg: JSON.parse(JSON.stringify(msg)), deliver });
  };
  const pump = () => { q.sort((a, b) => a.at - b.at); while (q.length && q[0].at <= net.now) { const m = q.shift(); m.deliver(m.msg); } };
  const s0 = createMatch({ p1, p2, seed });
  const peers = [], out = [];
  for (let k = 0; k < 2; k++) peers[k] = new Rollback(clone(s0), { local: k, send: (m) => out[k](m), onDesync: () => {} });
  out[0] = link((m) => peers[1].receive(m)); out[1] = link((m) => peers[0].receive(m));
  const cpus = [new CPU(0, 'hard', seed * 3 + 1), new CPU(1, 'hard', seed * 3 + 2)];
  const sounds = [[], []], gates = [new SoundGate({ near: 2 }), new SoundGate({ near: 2 })], sw = [new Swings(), new Swings()];
  const tickOf = (P, e) => { for (const [t, list] of P.evLog) if (list.includes(e)) return t; return P.frame; };
  const next = [0, 7];
  while (net.now < 1000 * 60 * 4) {
    const k = next[0] <= next[1] ? 0 : 1;
    net.now = next[k]; pump();
    const P = peers[k];
    const ev = P.advance(cpus[k].input(P.st));
    gates[k].flush();
    for (const e of ev || []) { const t = tickOf(P, e); if (gates[k].admit(e, t)) for (const c of soundsFor(e, P.st, fixed)) sounds[k].push({ ...c, t }); }
    for (let t = Math.max(1, P.frame - 12); t < P.frame; t++) { const s = P.stateAt(t); if (s) for (const c of sw[k].read(s, fixed)) sounds[k].push({ ...c, t: s.tick }); }
    for (const c of sw[k].read(P.st, fixed)) sounds[k].push({ ...c, t: P.st.tick });
    next[k] += 1000 / 60;
    if (peers.every((p) => p.st.phase === 'end')) break;
  }
  // the reference: the true inputs, one sim, the offline path
  const ref = clone(s0), rs = [], rg = new SoundGate(), rw = new Swings();
  const n = Math.min(peers[0].confirmed, peers[1].confirmed);
  for (let t = 0; t < n; t++) {
    stepInPlace(ref, peers[0].inp[0][t] | 0, peers[1].inp[1][t] | 0);
    rg.flush();
    for (const e of ref.ev) if (rg.admit(e, ref.tick)) for (const c of soundsFor(e, ref, fixed)) rs.push({ ...c, t: ref.tick });
    for (const c of rw.read(ref, fixed)) rs.push({ ...c, t: ref.tick });
  }
  return { sounds, ref: rs, peers, n };
}

test('online with rollbacks: every real sound plays, none twice (dedupe by event tick + kind)', () => {
  const { sounds, ref, peers, n } = onlineSounds({ p1: 'johnny', p2: 'sumaura', seed: 21 });
  assert.ok(peers.every((p) => p.stats.rollbacks > 0), 'there were rollbacks');
  const upTo = (list) => list.filter((s) => s.t <= n);
  for (let k = 0; k < 2; k++) {
    const got = upTo(sounds[k]);
    for (const id of ['hit-light', 'hit-heavy', 'block', 'whoosh', 'jump', 'land', 'knockdown', 'grab']) {
      const real = ref.filter((s) => s.id === id).length, g = got.filter((s) => s.id === id).length;
      console.log(`  ${id.padEnd(10)} peer ${k}: ${g} played, ${real} real`);
      // every real one played (a hair of slack: a sound right at the confirmed edge); a
      // mispredicted one can't be unplayed, but nothing plays twice
      assert.ok(g >= real * 0.95 - 1 && g <= real * 1.25 + (id === 'block' || id === 'whoosh' ? 8 : 3), `${id} on peer ${k}: ${g} vs ${real}`);
    }
    // no two of the same sound one or two ticks apart (a re-simulated duplicate)
    const byKind = {};
    for (const s of got) (byKind[s.id] ||= []).push(s.t);
    for (const [id, ts] of Object.entries(byKind)) {
      ts.sort((a, b) => a - b);
      const refTs = ref.filter((s) => s.id === id).map((s) => s.t);
      for (let i = 1; i < ts.length; i++) if (ts[i] !== ts[i - 1] && ts[i] - ts[i - 1] <= 2) {
        // allowed only if the true match had two that close too
        assert.ok(refTs.some((t, j) => j && t - refTs[j - 1] <= 2), `${id} played twice ${ts[i - 1]}/${ts[i]} on peer ${k}`);
      }
    }
  }
});

test('the music: every bar of every tune adds up to 16 steps; loop lengths; known instruments; notes in range', () => {
  const src = fs.readFileSync(new URL('../src/audio/songs.js', import.meta.url), 'utf8');
  let tunes = 0;
  for (const m of src.matchAll(/const (\w+) = (?:mel\()?`([^`]+)`/g)) {
    tunes++;
    m[2].trim().split('\n').forEach((line, i) => assert.equal(mel(line).end, 16, `${m[1]} bar ${i + 1}`));
  }
  assert.ok(tunes >= 8);
  const menu = songSeconds(SONGS.menu), fight = songSeconds(SONGS.fight);
  assert.ok(menu >= 30 && menu <= 40, `menu loop ${menu} s`);
  assert.ok(fight >= 55 && fight <= 70, `fight loop ${fight} s`);
  assert.ok(Math.abs(songSeconds(SONGS.vs) - 2) < 0.6, 'VS sting ~2 s');
  assert.ok(songSeconds(SONGS.round) <= 1.5, 'round start short');
  for (const k of ['win', 'lose']) assert.ok(Math.abs(songSeconds(SONGS[k]) - 4) < 0.5, `${k} jingle ~4 s`);
  assert.equal(SONGS.menu.bpm, 110); assert.equal(SONGS.fight.bpm, 150);
  // the fight has an A and a B section (different chords and tune), and a boost layer
  const lead = SONGS.fight.notes.filter((x) => x.i === 'lead');
  const sec = (a, b) => lead.filter((x) => x.s >= a * 16 && x.s < b * 16).map((x) => x.n).join(',');
  assert.notEqual(sec(0, 8), sec(16, 24));
  assert.ok(SONGS.fight.notes.some((x) => x.b), 'boost layer');
  const INSTR = new Set(['lead', 'lead2', 'comp', 'arp', 'bass', 'horn', 'bloop', 'kick', 'snare', 'hat', 'ohat', 'crash']);
  for (const [name, s] of Object.entries(SONGS)) for (const x of s.notes) {
    assert.ok(INSTR.has(x.i), `${name}: ${x.i}`);
    assert.ok(x.s >= 0 && x.s < s.steps && x.d > 0 && x.v > 0 && x.v <= 1, `${name}: note ${JSON.stringify(x)}`);
    if (!['kick', 'snare', 'hat', 'ohat', 'crash'].includes(x.i)) assert.ok(x.n >= midi('E2') && x.n <= midi('A6'), `${name}: ${x.n} in range`);
  }
});

test('synthesised sounds: finite, under full scale, short', () => {
  for (const [id, fn] of Object.entries(SYNTH)) {
    const x = fn(44100);
    let peak = 0;
    for (const v of x) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.1 && peak <= 0.95, `${id} peak ${peak}`);
    assert.ok(x.length < 44100 * 0.5, `${id} short`);
    assert.ok(Math.abs(x[0]) < 0.05 && Math.abs(x[x.length - 1]) < 0.02, `${id}: no click at the ends`);
  }
});

test('settings: defaults, clamped, saved; blocked storage still works for the session', () => {
  const mem = new Map(), ls = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadSettings(ls), DEFAULTS);
  saveSettings(ls, { mute: true, music: 0.3, sfx: 1 });
  assert.deepEqual(loadSettings(ls), { mute: true, music: 0.3, sfx: 1 });
  mem.set('pillowfight.audio.v1', JSON.stringify({ mute: 0, music: 7, sfx: 'x' }));
  assert.deepEqual(loadSettings(ls), { mute: false, music: 1, sfx: DEFAULTS.sfx });
  mem.set('pillowfight.audio.v1', '{nope');
  assert.deepEqual(loadSettings(ls), DEFAULTS);
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(blocked), DEFAULTS);
  assert.doesNotThrow(() => saveSettings(blocked, DEFAULTS));
  assert.deepEqual(loadSettings(null), DEFAULTS);
});

test('the keyboard legend shows M (mute) in the neutral colour, never lit for a player', () => {
  const svg = keyboardSVG([soloBinding()], { extras: [{ code: 'KeyM', word: 'Mute' }] });
  assert.match(svg, /<g class="k sys" data-code="KeyM">[\s\S]*?Mute<\/text><\/g>/);
  assert.doesNotMatch(svg, /<g class="k lit[^"]*" data-code="KeyM"/);
  assert.match(comboLine(), /Mute<\/b> M/);
  // a key a player holds is never drawn as the extra
  const lit = keyboardSVG([soloBinding()], { extras: [{ code: 'KeyW', word: 'Mute' }] });
  assert.doesNotMatch(lit, /k sys" data-code="KeyW"/);
});
