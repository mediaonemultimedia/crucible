/* Stage 4, the music pass: every song is a song (structure, a 60–90 s
   loop, a tune in octave 4 that doesn't machine-gun one pitch, a moving
   bass), and the final lap switches on a bar line, ~6 % faster. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, compile, seconds } from '../src/audio/music.js';
import { Sequencer } from '../src/audio/engine.js';

const SONGS = ['race', 'laundry', 'park'];

test('each race song: intro + A A\' B A + turnaround, a 60–90 s loop back to the first A', () => {
  for (const n of SONGS) {
    const c = compile(TRACKS[n]);
    assert.equal(c.bars, 36, `${n} bars`);
    assert.equal(c.loopBeat, 8, `${n} loops back past the 2-bar intro`);
    const s = seconds(c);
    assert.ok(s >= 60 && s <= 90, `${n} loop ${s.toFixed(1)} s`);
    assert.ok(Math.abs(c.hypeTempo - 1.06) < 1e-9, `${n} final-lap tempo`);
    // the intro has no tune; A and the reprise are the same tune (the hook comes back)
    const lead = c.events.filter((e) => e.ch === 'lead');
    assert.ok(!lead.some((e) => e.beat < 8), `${n}: the intro is the band's`);
    const bar = (b0, b1) => lead.filter((e) => e.beat >= b0 * 4 && e.beat < b1 * 4).map((e) => [(e.beat - b0 * 4).toFixed(3), e.note].join());
    assert.deepEqual(bar(2, 10), bar(26, 34), `${n}: the A section comes back`);
  }
});

test('the tune: lower and warmer, and singable (no machine-gun repeated notes)', () => {
  for (const n of [...SONGS, 'menu']) {
    const c = compile(TRACKS[n]);
    const lead = c.events.filter((e) => e.ch === 'lead');
    const notes = lead.map((e) => e.note);
    const below = notes.filter((m) => m < 72).length / notes.length;
    assert.ok(below >= 0.55, `${n}: ${Math.round(below * 100)} % of the tune below c5`);
    assert.ok(Math.max(...notes) <= 81, `${n}: peaks no higher than a5`);
    assert.ok(Math.min(...notes) >= 60, `${n}: nothing under c4 in the lead`);
    // never three of one pitch in a row; long notes to breathe on
    for (let i = 2; i < lead.length; i++) assert.ok(!(notes[i] === notes[i - 1] && notes[i] === notes[i - 2]), `${n}: a run of ${notes[i]} at beat ${lead[i].beat}`);
    const held = lead.filter((e) => e.dur >= 1.5).length;
    assert.ok(held >= 8, `${n}: ${held} held notes`);
    // mostly steps, a few leaps
    let steps = 0;
    for (let i = 1; i < notes.length; i++) if (Math.abs(notes[i] - notes[i - 1]) <= 4) steps++;
    assert.ok(steps / (notes.length - 1) >= 0.6, `${n}: ${Math.round(100 * steps / (notes.length - 1))} % steps`);
    // a counter-melody under it, a filtered pulse on both
    const c2 = c.events.filter((e) => e.ch === 'lead2');
    assert.ok(c2.length > 20 && c2.every((e) => e.note < 72), `${n}: lead2 under the tune`);
    for (const e of [...lead, ...c2]) assert.ok(e.lp > 0 && /^p(50|25)$/.test(e.wave), `${n}: ${e.ch} voicing`);
  }
});

test('the bass walks and the drums sit back', () => {
  for (const n of SONGS) {
    const c = compile(TRACKS[n]);
    const bass = c.events.filter((e) => e.ch === 'bass');
    const pcs = new Set(bass.map((e) => e.note % 12));
    assert.ok(pcs.size >= 9, `${n}: the bass uses ${pcs.size} pitch classes`);
    const off = bass.filter((e) => Math.abs(e.beat - Math.round(e.beat)) > 0.1).length / bass.length;
    assert.ok(off >= 0.25, `${n}: ${Math.round(off * 100)} % of the bass off the beat`);
    const hats = c.events.filter((e) => e.ch === 'drums' && e.drum === 'h').length / c.bars;
    assert.ok(hats <= 3, `${n}: ${hats.toFixed(1)} hats a bar`);
    assert.ok(c.events.some((e) => e.drum === 't' || e.drum === 'l'), `${n}: tom fills`);
  }
});

/* a do-nothing AudioContext: every node and param swallows every call */
function fakeCtx() {
  const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), set: () => true, apply: () => node() });
  return new Proxy({ currentTime: 0, sampleRate: 8000, createBuffer: () => ({ getChannelData: () => new Float32Array(0) }) }, {
    get: (t, k) => (k in t ? t[k] : () => node()),
  });
}

test('the final lap: the same song, from the next bar line, 6 % faster with the hype layer', () => {
  for (const n of SONGS) {
    const ctx = fakeCtx();
    const s = new Sequencer(ctx, ctx.createGain(), n).start(0);
    const spb = 60 / s.c.bpm;
    for (const now of [6.13, 21.7]) {
      ctx.currentTime = now - 0.25;
      s.pump(now);
      s.queueIntense(!s.intense, s.intense ? 1 : s.c.hypeTempo);
      assert.equal(s.b0 % 1, 0);
      ctx.currentTime = now + 3;
      s.pump(now + 3.25);
      assert.equal(s.pending, null, `${n}: switched`);
      assert.equal(s.b0 % 4, 0, `${n}: on a bar line (beat ${s.b0})`);
      assert.ok(s.t0 >= now - 1e-6 && s.t0 - now <= 4 * spb * 1.001 + 0.25, `${n}: within a bar (${(s.t0 - now).toFixed(2)} s)`);
    }
    // the first switch turned it on, the second off
    assert.equal(s.intense, false);
    assert.equal(s.tempo, 1);
  }
});

test('the loop goes round: past the turnaround it comes back to bar 3, not the intro', () => {
  const ctx = fakeCtx();
  const s = new Sequencer(ctx, ctx.createGain(), 'park').start(0);
  const passSec = seconds(s.c), firstSec = s.c.beats * 60 / s.c.bpm;
  ctx.currentTime = firstSec + passSec + 1;
  s.pump(firstSec + passSec + 1.25);
  assert.equal(s.base, 2 * s.passBeats, 'two passes after the first');
  // a pause in the second pass resumes there
  const r = new Sequencer(ctx, ctx.createGain(), 'park').start(0, s.c.beats + 10);
  assert.equal(r.base, s.passBeats);
  const E = r.c.events, want = r.c.loopBeat + 10;
  assert.ok(E[r.idx].beat >= want - 1e-6 && E[r.idx - 1].beat < want, 'resumes at the same place in the pass');
});
